const DEFAULT_KEYBOARD_RELAY_PORT = 8787;
const DEFAULT_KEYBOARD_RELAY_URL = `ws://localhost:${DEFAULT_KEYBOARD_RELAY_PORT}`;
const PAIR_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function formatHostname(hostname) {
  return hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
}

function unformatHostname(hostname) {
  return String(hostname ?? '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
}

export function isLoopbackHostname(hostname) {
  const normalizedHostname = unformatHostname(hostname);
  if (normalizedHostname === 'localhost' || normalizedHostname === '::1') return true;
  const octets = normalizedHostname.split('.').map(Number);
  return octets.length === 4 && octets.every(Number.isInteger) && octets[0] === 127;
}

export function isLocalNetworkHostname(hostname) {
  const normalizedHostname = unformatHostname(hostname);
  if (!normalizedHostname || isLoopbackHostname(normalizedHostname)) return false;
  if (normalizedHostname.endsWith('.local')) return true;
  if (normalizedHostname.startsWith('fc') || normalizedHostname.startsWith('fd')) return true;
  if (normalizedHostname.startsWith('fe80:')) return true;

  const octets = normalizedHostname.split('.').map(Number);
  if (octets.length !== 4 || !octets.every(Number.isInteger)) return false;
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 169 && octets[1] === 254)
  );
}

export function normalizePairCode(value) {
  const pairCode = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(pairCode)) {
    throw new Error('Pairing code must contain 6 to 12 letters or numbers.');
  }
  return pairCode;
}

export function normalizeRelayUrl(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    throw new Error(
      'Enter a relay URL. Use ws://<computer-ip>:8787 on a local network or wss:// on HTTPS.',
    );
  }
  let relayUrl;
  try {
    relayUrl = new URL(rawValue);
  } catch {
    throw new Error('Relay URL must be a valid ws:// or wss:// URL.');
  }
  if (!['ws:', 'wss:'].includes(relayUrl.protocol)) {
    throw new Error('Relay URL must use ws:// or wss://.');
  }
  return relayUrl.toString();
}

export function getDefaultKeyboardRelayUrl(location = globalThis.location) {
  const configuredUrl = import.meta.env?.VITE_KEYBOARD_RELAY_URL;
  if (configuredUrl) return configuredUrl;
  if (
    location?.protocol === 'http:' &&
    location.hostname &&
    !isLoopbackHostname(location.hostname)
  ) {
    return `ws://${formatHostname(location.hostname)}:${DEFAULT_KEYBOARD_RELAY_PORT}`;
  }
  if (location?.protocol === 'http:' && location.hostname) return '';
  if (location?.protocol === 'https:') return '';
  return DEFAULT_KEYBOARD_RELAY_URL;
}

export function getKeyboardRelayDiscoveryUrl(location = globalThis.location) {
  if (!location?.hostname) return '';
  const protocol = location.protocol === 'https:' ? 'https' : 'http';
  const hostname = isLoopbackHostname(location.hostname) ? '127.0.0.1' : location.hostname;
  return `${protocol}://${formatHostname(hostname)}:${DEFAULT_KEYBOARD_RELAY_PORT}/network`;
}

export async function discoverKeyboardRelayUrls({
  location = globalThis.location,
  fetchImpl = globalThis.fetch,
  timeoutMs = 2000,
} = {}) {
  if (location?.protocol === 'https:') {
    throw new Error(
      'LAN relay discovery requires an HTTP page. HTTPS pages must use a wss:// relay.',
    );
  }
  const discoveryUrl = getKeyboardRelayDiscoveryUrl(location);
  if (!discoveryUrl) throw new Error('The current page does not provide a computer host name.');
  if (typeof fetchImpl !== 'function')
    throw new Error('Fetch is not available for LAN relay discovery.');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(discoveryUrl, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Relay discovery failed with status ${response.status}.`);
    const payload = await response.json();
    const relayUrls = Array.isArray(payload?.relayUrls) ? payload.relayUrls : [];
    return [
      ...new Set(
        relayUrls.map((url) => normalizeRelayUrl(url)).filter((url) => !isLoopbackRelayUrl(url)),
      ),
    ];
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('LAN relay discovery timed out.');
    if (error instanceof Error && error.message.startsWith('Relay discovery')) throw error;
    throw new Error(
      'Unable to discover the local relay. Start the relay and check the network connection.',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export function validateRelayUrlForPage(value, location = globalThis.location) {
  const relayUrl = normalizeRelayUrl(value);
  if (location?.protocol === 'https:' && relayUrl.startsWith('ws:')) {
    throw new Error(
      'This page uses HTTPS. Configure a wss:// relay URL; ws:// is blocked by the browser.',
    );
  }
  return relayUrl;
}

export function isLoopbackRelayUrl(value) {
  const hostname = new URL(normalizeRelayUrl(value)).hostname.toLowerCase();
  return isLoopbackHostname(hostname);
}

export function generatePairCode(length = 8) {
  const values = new Uint32Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else values.fill(Math.floor(Math.random() * PAIR_CODE_ALPHABET.length));
  return [...values].map((value) => PAIR_CODE_ALPHABET[value % PAIR_CODE_ALPHABET.length]).join('');
}

export class KeyboardRelayClient {
  constructor({ url, roomCode, role, onMessage = () => {}, onStatus = () => {} }) {
    this.url = normalizeRelayUrl(url);
    this.roomCode = normalizePairCode(roomCode);
    this.role = role;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.socket = null;
    this.closedByClient = false;
    this.hasOpened = false;
    this.errorNotified = false;
  }

  connect() {
    if (typeof WebSocket === 'undefined') {
      this.onStatus({ state: 'error', message: 'This browser does not support WebSocket.' });
      return;
    }
    if (this.socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(this.socket.readyState))
      return;
    this.closedByClient = false;
    this.hasOpened = false;
    this.errorNotified = false;
    this.onStatus({ state: 'connecting' });
    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.errorNotified = true;
      this.onStatus({ state: 'error', message: 'The relay URL could not be opened.' });
      return;
    }
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.hasOpened = true;
      socket.send(JSON.stringify({ type: 'join', room: this.roomCode, role: this.role }));
      this.onStatus({ state: 'connected' });
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'peer' || message.type === 'joined') this.onStatus(message);
        else if (message.type === 'error') {
          this.errorNotified = true;
          this.onStatus({ state: 'error', message: message.message });
        } else this.onMessage(message);
      } catch {
        this.errorNotified = true;
        this.onStatus({ state: 'error', message: 'The relay returned an invalid message.' });
      }
    });
    socket.addEventListener('error', () => {
      if (this.socket !== socket) return;
      this.errorNotified = true;
      this.onStatus({ state: 'error', message: 'Unable to connect to the keyboard relay.' });
    });
    socket.addEventListener('close', (event) => {
      if (this.socket !== socket || this.closedByClient) return;
      this.socket = null;
      if (!this.hasOpened && !this.errorNotified) {
        this.onStatus({
          state: 'error',
          message:
            'The relay closed before joining. Check the relay URL, server, and HTTPS/wss settings.',
        });
        return;
      }
      if (!this.errorNotified) {
        const code = event.code ? ` (code ${event.code})` : '';
        this.onStatus({ state: 'closed', message: `The relay connection closed${code}.` });
      }
    });
  }

  send(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  close() {
    const socket = this.socket;
    if (!socket) return;
    this.closedByClient = true;
    this.socket = null;
    socket.close();
  }
}
