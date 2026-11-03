import '../styles/app.css';
import {
  KeyboardRelayClient,
  getDefaultKeyboardRelayUrl,
  isLoopbackRelayUrl,
  normalizePairCode,
  validateRelayUrlForPage,
} from '../services/keyboardRelay.js';

const query = (selector) => document.querySelector(selector);
const params = new URLSearchParams(window.location.search);
const elements = {
  pairCode: query('#remote-pair-code'),
  relayUrl: query('#remote-relay-url'),
  connectButton: query('#remote-connect-button'),
  status: query('#remote-keyboard-status'),
  numberInput: query('#remote-number-input'),
  focusButton: query('#remote-focus-button'),
  clearButton: query('#remote-clear-button'),
  tabButton: query('#remote-tab-button'),
};
let relay = null;

function setStatus(message, tone = 'info') {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function setKeyboardEnabled(enabled) {
  elements.numberInput.disabled = !enabled;
  elements.focusButton.disabled = !enabled;
  elements.clearButton.disabled = !enabled;
  elements.tabButton.disabled = !enabled;
}

function setConnectionButtonEnabled(enabled) {
  elements.connectButton.disabled = !enabled;
}

function isLocalPage() {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname.toLowerCase());
}

function validateRemoteRelayUrl(value) {
  const relayUrl = validateRelayUrlForPage(value);
  if (isLoopbackRelayUrl(relayUrl) && !isLocalPage()) {
    throw new Error('This iPhone cannot reach localhost. Use the computer LAN IP or a public wss:// relay URL.');
  }
  return relayUrl;
}

function sanitizeValue(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function sendValue() {
  const value = sanitizeValue(elements.numberInput.value);
  elements.numberInput.value = value;
  relay?.send({ type: 'input', value });
}

function handleMessage(message) {
  if (message.type === 'sync') {
    elements.numberInput.value = sanitizeValue(message.value);
    setKeyboardEnabled(true);
    return;
  }
  if (message.type === 'peer' && message.connected === false) {
    setKeyboardEnabled(false);
    setStatus('電腦已離線。', 'warning');
  }
}

function handleStatus(status) {
  if (status.state === 'connecting') {
    setConnectionButtonEnabled(false);
    setKeyboardEnabled(false);
    setStatus('正在連線…');
  } else if (status.state === 'connected') {
    setConnectionButtonEnabled(false);
    setKeyboardEnabled(false);
    setStatus('已連線，等待電腦試算器。', 'info');
  } else if (status.state === 'error') {
    setConnectionButtonEnabled(true);
    setKeyboardEnabled(false);
    setStatus(status.message, 'error');
  } else if (status.state === 'closed') {
    setConnectionButtonEnabled(true);
    setKeyboardEnabled(false);
    setStatus(status.message || 'Relay 連線已關閉，請確認 Relay URL 與 server。', 'warning');
  } else if (status.role === 'desktop' && status.connected) {
    setConnectionButtonEnabled(false);
    setStatus('已連接電腦，可以輸入。', 'success');
    setKeyboardEnabled(true);
    relay.send({ type: 'ready' });
  } else if (status.role === 'desktop' && status.connected === false) {
    setKeyboardEnabled(false);
    setStatus('電腦已離線，等待重新連線。', 'warning');
  }
}

function connect() {
  let pairCode;
  let relayUrl;
  try {
    pairCode = normalizePairCode(elements.pairCode.value);
    relayUrl = validateRemoteRelayUrl(elements.relayUrl.value);
  } catch (error) {
    setStatus(error.message, 'error');
    return;
  }
  relay?.close();
  relay = new KeyboardRelayClient({
    url: relayUrl,
    roomCode: pairCode,
    role: 'phone',
    onMessage: handleMessage,
    onStatus: handleStatus,
  });
  relay.connect();
}

elements.pairCode.value = params.get('pair') || '';
elements.relayUrl.value = params.get('relay') || getDefaultKeyboardRelayUrl();
elements.connectButton.addEventListener('click', connect);
elements.numberInput.addEventListener('input', sendValue);
elements.focusButton.addEventListener('click', () => elements.numberInput.focus());
elements.clearButton.addEventListener('click', () => {
  elements.numberInput.value = '';
  sendValue();
});
elements.tabButton.addEventListener('click', () => {
  relay?.send({ type: 'tab' });
  elements.numberInput.value = '';
});
window.addEventListener('beforeunload', () => relay?.close());

if (params.has('pair')) {
  if (params.get('relay')) connect();
  else setStatus('請輸入 Relay URL。HTTPS 頁面需要 wss:// relay。', 'warning');
}
