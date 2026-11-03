import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8787);
const rooms = new Map();
const allowedMessages = {
  desktop: new Set(['sync']),
  phone: new Set(['ready', 'input', 'clear', 'tab']),
};

function getLanAddresses() {
  const addresses = new Set();
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const network of interfaces ?? []) {
      const isIpv4 = network.family === 'IPv4' || network.family === 4;
      if (isIpv4 && !network.internal) addresses.add(network.address);
    }
  }
  return [...addresses];
}

function getRelayUrls() {
  return getLanAddresses().map((address) => `ws://${address}:${port}`);
}

function sendJsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function sendFrame(socket, opcode, payload = '') {
  if (socket.destroyed) return;
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, body.length]);
  } else if (body.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  socket.write(Buffer.concat([header, body]));
}

function sendJson(client, message) {
  sendFrame(client.socket, 0x1, JSON.stringify(message));
}

function broadcast(room, message, excludedClient = null) {
  for (const client of room) {
    if (client !== excludedClient) sendJson(client, message);
  }
}

function removeClient(client) {
  if (!client.room) return;
  const room = rooms.get(client.room);
  if (!room) return;
  room.delete(client);
  if (client.role) broadcast(room, { type: 'peer', role: client.role, connected: false });
  if (room.size === 0) rooms.delete(client.room);
  client.room = null;
}

function handleMessage(client, rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    sendJson(client, { type: 'error', message: 'Invalid JSON message.' });
    return;
  }

  if (message.type === 'join') {
    const roomCode = String(message.room || '').toUpperCase();
    const role = message.role;
    if (!/^[A-Z0-9]{6,12}$/.test(roomCode) || !allowedMessages[role]) {
      sendJson(client, { type: 'error', message: 'Invalid pairing information.' });
      client.socket.end();
      return;
    }
    const room = rooms.get(roomCode) || new Set();
    if (room.size >= 2) {
      sendJson(client, { type: 'error', message: 'This pairing room is full.' });
      client.socket.end();
      return;
    }
    if ([...room].some((peer) => peer.role === role)) {
      sendJson(client, { type: 'error', message: 'This pairing room already has this role.' });
      client.socket.end();
      return;
    }
    client.room = roomCode;
    client.role = role;
    room.add(client);
    rooms.set(roomCode, room);
    sendJson(client, { type: 'joined', role });
    for (const peer of room) {
      if (peer === client) continue;
      sendJson(peer, { type: 'peer', role, connected: true });
      sendJson(client, { type: 'peer', role: peer.role, connected: true });
    }
    return;
  }

  if (!client.room || !allowedMessages[client.role]?.has(message.type)) {
    sendJson(client, { type: 'error', message: 'Message is not allowed for this connection.' });
    return;
  }

  const room = rooms.get(client.room);
  if (room) broadcast(room, { ...message, from: client.role }, client);
}

function consumeFrames(client) {
  while (client.buffer.length >= 2) {
    const firstByte = client.buffer[0];
    const secondByte = client.buffer[1];
    const opcode = firstByte & 0x0f;
    const isMasked = Boolean(secondByte & 0x80);
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      if (client.buffer.length < 4) return;
      payloadLength = client.buffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      if (client.buffer.length < 10) return;
      const longLength = client.buffer.readBigUInt64BE(2);
      if (longLength > 65536n) {
        client.socket.destroy();
        return;
      }
      payloadLength = Number(longLength);
      offset = 10;
    }

    if (!isMasked || client.buffer.length < offset + 4 + payloadLength) return;
    const mask = client.buffer.subarray(offset, offset + 4);
    const payloadStart = offset + 4;
    const payloadEnd = payloadStart + payloadLength;
    const payload = Buffer.alloc(payloadLength);
    for (let index = 0; index < payloadLength; index += 1) {
      payload[index] = client.buffer[payloadStart + index] ^ mask[index % 4];
    }
    client.buffer = client.buffer.subarray(payloadEnd);

    if (opcode === 0x8) {
      client.socket.end();
      return;
    }
    if (opcode === 0x9) {
      sendFrame(client.socket, 0xa, payload);
      continue;
    }
    if (opcode === 0x1) handleMessage(client, payload.toString('utf8'));
  }
}

const httpServer = createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-origin': '*',
    });
    response.end();
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/network') {
    sendJsonResponse(response, 200, {
      ok: true,
      service: 'keyboard-relay',
      relayUrls: getRelayUrls(),
    });
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/healthz') {
    sendJsonResponse(response, 200, {
      ok: true,
      service: 'keyboard-relay',
      relayUrls: getRelayUrls(),
    });
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Keyboard relay is running.');
});

httpServer.on('upgrade', (request, socket) => {
  const websocketKey = request.headers['sec-websocket-key'];
  if (!websocketKey) {
    socket.destroy();
    return;
  }
  const acceptKey = createHash('sha1')
    .update(`${websocketKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`,
  );

  const client = {
    id: randomUUID(),
    socket,
    buffer: Buffer.alloc(0),
    room: null,
    role: null,
  };
  socket.on('data', (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    consumeFrames(client);
  });
  socket.on('close', () => removeClient(client));
  socket.on('error', () => removeClient(client));
});

httpServer.listen(port, host, () => {
  console.log(`Keyboard relay listening on ws://${host}:${port}`);
  const relayUrls = getRelayUrls();
  if (relayUrls.length > 0) console.log(`LAN relay URLs: ${relayUrls.join(', ')}`);
  else console.log('No non-loopback IPv4 network address was detected.');
});
