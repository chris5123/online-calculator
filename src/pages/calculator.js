import '../styles/app.css';
import { createToast, createLiveStatus } from '../components/toast.js';
import { registerServiceWorker } from '../components/pwa.js';
import { createMockApiClient } from '../services/mockApi.js';
import { ApiError, createApiClient } from '../services/api.js';
import { ELECTION_SECTIONS, isMockMode } from '../config/constants.js';
import { calculateTotals, calculateStationSections } from '../core/calculation.js';
import { validateImageFile, validateStationId, validateVoteInput } from '../core/validation.js';
import { getSectionInputs, renderCalculatorTable } from '../components/calculatorTable.js';
import {
  KeyboardRelayClient,
  discoverKeyboardRelayUrls,
  generatePairCode,
  getDefaultKeyboardRelayUrl,
  isLocalNetworkHostname,
  isLoopbackHostname,
  isLoopbackRelayUrl,
  normalizePairCode,
  validateRelayUrlForPage,
} from '../services/keyboardRelay.js';

const state = {
  client: null,
  stationCache: null,
  currentStationId: null,
  currentStationData: null,
  currentFocusedInput: null,
  currentInputTarget: null,
  isSubmitting: false,
  keyboardMode: 'native',
  remoteKeyboard: null,
  files: { gov: null, ref: null },
};

const elements = {};

function query(selector) {
  return document.querySelector(selector);
}

function setStatus(message, tone = 'info') {
  elements.operationStatus.set(message, tone);
}

function setNetworkStatus(message) {
  elements.networkStatus.textContent = `連線狀態：${message}`;
}

function setButtonLoading(button, loading, loadingLabel, idleLabel) {
  button.disabled = loading;
  button.textContent = loading ? loadingLabel : idleLabel;
}

function setVoiceStatus(message, tone = 'idle') {
  if (!elements.voiceStatus) return;
  elements.voiceStatus.textContent = message;
  elements.voiceStatus.dataset.tone = tone;
}

function setKeyboardOpen(open) {
  elements.keyboardPanel.classList.toggle('is-hidden', !open);
  elements.keyboardLauncher.hidden = open;
  elements.keyboardLauncher.setAttribute('aria-expanded', String(open));
  elements.mobileKeyboardButton.setAttribute('aria-expanded', String(open));
}

function configureEditableInputMode() {
  const suppressNativeKeyboard =
    elements.continuousMode.checked || state.keyboardMode === 'virtual';
  document.querySelectorAll('.editable-input').forEach((input) => {
    input.readOnly = elements.continuousMode.checked;
    input.inputMode = suppressNativeKeyboard ? 'none' : 'numeric';
  });
}

function setKeyboardMode(mode) {
  state.keyboardMode = mode === 'virtual' ? 'virtual' : 'native';
  if (state.keyboardMode === 'native' && elements.continuousMode.checked) {
    elements.continuousMode.checked = false;
  }
  configureContinuousMode();
  setKeyboardOpen(state.keyboardMode === 'virtual');
  elements.mobileKeyboardButton.setAttribute(
    'aria-pressed',
    String(state.keyboardMode === 'virtual'),
  );
  elements.nativeKeyboardButton.setAttribute(
    'aria-pressed',
    String(state.keyboardMode === 'native'),
  );
}

function focusNativeKeyboard() {
  setKeyboardMode('native');
  const focusedInput = state.currentFocusedInput;
  const target = focusedInput && !focusedInput.disabled ? focusedInput : elements.stationInput;
  target.focus();
}

function getCurrentInputTarget() {
  const target = state.currentInputTarget ?? state.currentFocusedInput ?? elements.stationInput;
  return target && !target.disabled ? target : elements.stationInput;
}

function syncRemoteInput() {
  if (!state.remoteKeyboard) return;
  const target = getCurrentInputTarget();
  state.remoteKeyboard.send({ type: 'sync', value: target?.value ?? '' });
}

function trackInputFocus(input) {
  state.currentInputTarget = input;
  if (input.matches('.editable-input')) state.currentFocusedInput = input;
  syncRemoteInput();
}

function setRemoteStatus(message, tone = 'info') {
  elements.remoteStatus.textContent = message;
  elements.remoteStatus.dataset.tone = tone;
}

function handleRemoteMessage(message) {
  if (message.type === 'ready') {
    syncRemoteInput();
    return;
  }
  if (message.type === 'tab') {
    focusNextInput();
    syncRemoteInput();
    return;
  }
  if (message.type !== 'input') return;
  const target = getCurrentInputTarget();
  if (!target) {
    setRemoteStatus('請先在電腦頁面選擇輸入欄位。', 'warning');
    return;
  }
  target.value = String(message.value ?? '').replace(/\D/g, '');
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.focus();
}

function handleRemoteStatus(status) {
  if (status.state === 'connecting') setRemoteStatus('正在連線到 relay…');
  else if (status.state === 'connected') setRemoteStatus('Relay 已連線，等待 iPhone。');
  else if (status.state === 'error') setRemoteStatus(status.message, 'error');
  else if (status.state === 'closed')
    setRemoteStatus(status.message || 'Relay 連線已關閉。', 'warning');
  else if (status.role === 'phone' && status.connected) {
    setRemoteStatus('iPhone 已連線，請在電腦頁面選擇輸入欄位。', 'success');
    syncRemoteInput();
  } else if (status.role === 'phone' && status.connected === false) {
    setRemoteStatus('iPhone 已離線。', 'warning');
  }
}

function isLoopbackRelayValue(value) {
  if (!value) return false;
  try {
    return isLoopbackRelayUrl(value);
  } catch {
    return false;
  }
}

function renderRelayOptions(relayUrls) {
  elements.remoteRelayOptions.replaceChildren(
    ...relayUrls.map((relayUrl) => {
      const option = document.createElement('option');
      option.value = relayUrl;
      return option;
    }),
  );
}

function buildRemotePhoneUrl(relayUrl) {
  const phoneUrl = new URL('phone-keyboard.html', window.location.href);
  const relayHost = new URL(relayUrl).hostname;
  const pageUsesLocalNetwork =
    window.location.protocol === 'http:' &&
    (isLoopbackHostname(window.location.hostname) ||
      isLocalNetworkHostname(window.location.hostname));
  if (pageUsesLocalNetwork && isLocalNetworkHostname(relayHost)) phoneUrl.hostname = relayHost;
  return phoneUrl;
}

function updateRemotePhoneLink() {
  const pairCode = elements.remotePairCode.value.trim().toUpperCase();
  const rawRelayUrl = elements.remoteRelayUrl.value.trim();
  if (!pairCode || !rawRelayUrl) {
    elements.remotePhoneLink.value = '';
    elements.remotePhoneLinkAnchor.hidden = true;
    return;
  }
  let relayUrl;
  try {
    relayUrl = validateRelayUrlForPage(rawRelayUrl);
    if (isLoopbackRelayUrl(relayUrl))
      throw new Error('Loopback relay URLs are not reachable from an iPhone.');
  } catch {
    elements.remotePhoneLink.value = '';
    elements.remotePhoneLinkAnchor.hidden = true;
    return;
  }
  const phoneUrl = buildRemotePhoneUrl(relayUrl);
  phoneUrl.searchParams.set('pair', pairCode);
  phoneUrl.searchParams.set('relay', relayUrl);
  elements.remotePhoneLink.value = phoneUrl.href;
  elements.remotePhoneLinkAnchor.href = phoneUrl.href;
  elements.remotePhoneLinkAnchor.hidden = false;
}

async function discoverRemoteRelay() {
  elements.remoteDetectRelayButton.disabled = true;
  setRemoteStatus('正在尋找可用的區網 Relay…');
  try {
    const relayUrls = await discoverKeyboardRelayUrls();
    if (relayUrls.length === 0) throw new Error('Relay 沒有回報可供手機連線的區網 IP。');
    renderRelayOptions(relayUrls);
    if (!elements.remoteRelayUrl.value || isLoopbackRelayValue(elements.remoteRelayUrl.value)) {
      elements.remoteRelayUrl.value = relayUrls[0];
    }
    updateRemotePhoneLink();
    setRemoteStatus(`找到 ${relayUrls.length} 個區網 Relay 位址。`, 'success');
  } catch (error) {
    setRemoteStatus(error.message, 'warning');
  } finally {
    elements.remoteDetectRelayButton.disabled = false;
  }
}

function openRemoteKeyboardDialog() {
  if (!elements.remotePairCode.value) elements.remotePairCode.value = generatePairCode();
  if (!elements.remoteRelayUrl.value) elements.remoteRelayUrl.value = getDefaultKeyboardRelayUrl();
  updateRemotePhoneLink();
  if (!elements.remoteRelayUrl.value) {
    const message =
      window.location.protocol === 'https:'
        ? '此頁面使用 HTTPS，請填入 wss:// relay URL。'
        : '正在尋找電腦熱點 IP；也可以按「尋找區網 Relay」。';
    setRemoteStatus(message, 'warning');
    if (window.location.protocol !== 'https:') void discoverRemoteRelay();
  }
  if (typeof elements.remoteDialog.showModal === 'function') elements.remoteDialog.showModal();
  else elements.remoteDialog.setAttribute('open', '');
}

function startRemoteKeyboard() {
  let pairCode;
  let relayUrl;
  try {
    pairCode = normalizePairCode(elements.remotePairCode.value);
    relayUrl = validateRelayUrlForPage(elements.remoteRelayUrl.value);
    if (isLoopbackRelayUrl(relayUrl)) {
      throw new Error('請使用電腦區網 IP，不要使用 localhost 或 127.0.0.1。');
    }
  } catch (error) {
    setRemoteStatus(error.message, 'error');
    return;
  }
  elements.remotePairCode.value = pairCode;
  elements.remoteRelayUrl.value = relayUrl;
  updateRemotePhoneLink();
  state.remoteKeyboard?.close();
  state.remoteKeyboard = new KeyboardRelayClient({
    url: relayUrl,
    roomCode: pairCode,
    role: 'desktop',
    onMessage: handleRemoteMessage,
    onStatus: handleRemoteStatus,
  });
  state.remoteKeyboard.connect();
}

function disconnectRemoteKeyboard() {
  state.remoteKeyboard?.close();
  state.remoteKeyboard = null;
  setRemoteStatus('尚未連線');
}

async function copyRemotePhoneLink() {
  if (!elements.remotePhoneLink.value) return;
  try {
    await navigator.clipboard.writeText(elements.remotePhoneLink.value);
    setRemoteStatus('手機連結已複製。', 'success');
  } catch {
    elements.remotePhoneLink.select();
    setRemoteStatus('無法自動複製，請手動複製手機連結。', 'warning');
  }
}

function initializeKeyboardDisplay() {
  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  setKeyboardMode(isMobile ? 'native' : 'virtual');
}

function createConfiguredClient() {
  return isMockMode() ? createMockApiClient() : createApiClient();
}

function buildCandidateNameMap(stationData = {}) {
  return ELECTION_SECTIONS.reduce((result, section) => {
    result[section.key] = section.dynamic
      ? stationData.villageCandidates ?? section.candidateNames
      : section.candidateNames;
    return result;
  }, {});
}

function setTableLocked(locked) {
  elements.tableWrapper.classList.toggle('is-locked', locked);
  document.querySelectorAll('.vote-input').forEach((input) => {
    const sectionKey = input.dataset.section;
    const checkValue = state.currentStationData?.checkValues?.[sectionKey] ?? 0;
    const sectionDisabled = !checkValue || Number(checkValue) === 0;
    const computed = input.classList.contains('computed-input');
    input.disabled = locked || sectionDisabled;
    if (sectionDisabled) {
      input.value = '';
      input.classList.add('locked-empty');
      input.tabIndex = -1;
    } else {
      input.classList.remove('locked-empty');
      input.tabIndex = computed ? -1 : 0;
    }
  });
}

function updateSectionState(sectionKey) {
  const inputs = getSectionInputs(sectionKey);
  const result = calculateTotals({
    candidateValues: inputs.candidates
      .filter((input) => !input.classList.contains('locked-empty'))
      .map((input) => input.value),
    invalid: inputs.invalid?.value,
    issuedNotVoted: inputs.issuedNotVoted?.value,
    remaining: inputs.remaining?.value,
    check: inputs.check?.value,
  });

  if (inputs.valid) inputs.valid.value = result.valid;
  if (inputs.total) inputs.total.value = result.total;
  if (inputs.issued) inputs.issued.value = result.issued;
  if (inputs.electors) inputs.electors.value = result.electors;
  if (inputs.check) {
    inputs.check.classList.toggle('match-true', result.matches);
    inputs.check.classList.toggle('match-false', !result.matches);
  }
  return result;
}

function updateAllSectionStates() {
  ELECTION_SECTIONS.forEach((section) => updateSectionState(section.key));
}

function applyStationData(stationData) {
  state.currentStationData = stationData;
  renderCalculatorTable(elements.calculatorTable, buildCandidateNameMap(stationData));

  const sectionState = calculateStationSections(stationData);
  ELECTION_SECTIONS.forEach((section) => {
    const checkInput = document.getElementById(`${section.key}_check`);
    if (checkInput) checkInput.value = sectionState[section.key].checkValue || '';
  });
  setTableLocked(false);
  updateAllSectionStates();
}

async function loadStationCache() {
  setStatus(
    isMockMode() ? '目前為 Mock Mode，不會連線正式 API。' : '正在載入雲端資料...',
    'loading',
  );
  setNetworkStatus(isMockMode() ? 'Mock Mode' : '載入中');
  try {
    const response = await state.client.getAll();
    if (response?.status !== 'success' || !response.data || typeof response.data !== 'object') {
      throw new ApiError('Unexpected station data response.', { code: 'INVALID_RESPONSE' });
    }
    state.stationCache = response.data;
    setNetworkStatus(isMockMode() ? 'Mock Mode' : '已連線');
    setStatus('資料庫已載入，可以輸入票所編號。', 'success');
  } catch (error) {
    state.stationCache = null;
    setNetworkStatus('連線失敗');
    const message = error instanceof ApiError ? error.message : '無法載入雲端資料。';
    setStatus(`${message} 請確認網路後重試。`, 'error');
  }
}

function loadStation() {
  const validation = validateStationId(elements.stationInput.value);
  if (!validation.valid) {
    setStatus(validation.message, 'error');
    return;
  }
  if (!state.stationCache) {
    setStatus('目前沒有可用的票所資料，請先重新載入資料。', 'error');
    return;
  }
  const stationData = state.stationCache[validation.value];
  if (!stationData) {
    setStatus('找不到該票所編號。', 'error');
    return;
  }
  state.currentStationId = validation.value;
  elements.stationInfo.textContent = `目前票所：${validation.value}`;
  applyStationData(stationData);
  setStatus(`已載入第 ${validation.value} 票所資料。`, 'success');
}

function clearCalculator() {
  if (elements.tableWrapper.classList.contains('is-locked')) {
    setStatus('表格目前為鎖定狀態，無法清除。', 'warning');
    return;
  }
  document.querySelectorAll('.editable-input').forEach((input) => {
    if (!input.classList.contains('locked-empty')) input.value = '';
  });
  updateAllSectionStates();
  clearFile('gov');
  clearFile('ref');
  setStatus('已清除目前輸入資料。', 'success');
}

function handleVoteInput(event) {
  const input = event.target.closest('.editable-input');
  if (!input) return;
  const validation = validateVoteInput(input.value);
  if (!validation.valid) {
    input.value = validation.value.replace(/[^\d]/g, '');
    setStatus(validation.message, 'warning');
  }
  updateSectionState(input.dataset.section);
}

function getEditableSequence(sectionKey) {
  const inputs = getSectionInputs(sectionKey);
  return [...inputs.candidates, inputs.invalid, inputs.issuedNotVoted, inputs.remaining].filter(
    (input) => input && !input.disabled && !input.classList.contains('locked-empty'),
  );
}

function focusNextInput() {
  if (!state.currentFocusedInput) return;
  const sectionKey = state.currentFocusedInput.dataset.section;
  const sequence = getEditableSequence(sectionKey);
  const currentIndex = sequence.indexOf(state.currentFocusedInput);
  if (currentIndex >= 0 && sequence[currentIndex + 1]) {
    sequence[currentIndex + 1].focus();
    return;
  }
  const sectionIndex = ELECTION_SECTIONS.findIndex((section) => section.key === sectionKey);
  for (const section of ELECTION_SECTIONS.slice(sectionIndex + 1)) {
    const nextInput = getEditableSequence(section.key)[0];
    if (nextInput) {
      nextInput.focus();
      return;
    }
  }
}

function insertKeyboardValue(value) {
  const input = state.currentFocusedInput;
  if (!input || input.disabled) {
    setStatus('請先選擇可輸入的票數欄位。', 'warning');
    return;
  }
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

function clearKeyboardValue() {
  if (!state.currentFocusedInput) return;
  state.currentFocusedInput.value = '';
  state.currentFocusedInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function configureContinuousMode() {
  const enabled = elements.continuousMode.checked;
  elements.modeToggle.classList.toggle('is-active', enabled);
  configureEditableInputMode();
}

function configureVoiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    elements.voiceButton.disabled = true;
    elements.voiceButton.title = '目前瀏覽器不支援語音輸入';
    setVoiceStatus('瀏覽器不支援語音輸入', 'error');
    return;
  }
  const recognition = new Recognition();
  recognition.lang = 'zh-TW';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  let recording = false;
  recognition.addEventListener('start', () => {
    recording = true;
    elements.voiceButton.classList.add('is-recording');
    setVoiceStatus('聆聽中...', 'active');
    setStatus('語音輸入中，請唸出票數。', 'loading');
  });
  recognition.addEventListener('end', () => {
    recording = false;
    elements.voiceButton.classList.remove('is-recording');
    setVoiceStatus('語音待命');
  });
  recognition.addEventListener('error', (event) => {
    setVoiceStatus(`語音錯誤：${event.error}`, 'error');
    setStatus(`語音輸入失敗：${event.error}`, 'error');
  });
  recognition.addEventListener('result', (event) => {
    if (!state.currentFocusedInput) {
      setStatus('請先選擇票數欄位。', 'warning');
      return;
    }
    const transcript = event.results[0][0].transcript.replace(/\s+/g, '');
    const numericText = transcript.replace(/[零洞空沒有林靈凌玲]/g, '0');
    const match = numericText.match(/\d+/g);
    if (!match) {
      setStatus(`無法辨識票數：${transcript}`, 'warning');
      setVoiceStatus('未辨識到數字', 'error');
      return;
    }
    insertKeyboardValue(match.at(-1));
    setVoiceStatus(`已辨識：${match.at(-1)}`, 'success');
    if (elements.continuousMode.checked) focusNextInput();
  });
  elements.voiceButton.addEventListener('click', () => {
    if (recording) recognition.stop();
    else recognition.start();
  });
}

function bindKeyboard() {
  document.querySelectorAll('.number-key').forEach((button) => {
    button.addEventListener('click', () => insertKeyboardValue(button.dataset.value));
  });
  elements.keyboardClear.addEventListener('click', clearKeyboardValue);
  elements.keyboardTab.addEventListener('click', focusNextInput);
  elements.keyboardLauncher.addEventListener('click', () => setKeyboardMode('virtual'));
  elements.mobileKeyboardButton.addEventListener('click', () => setKeyboardMode('virtual'));
  elements.nativeKeyboardButton.addEventListener('click', focusNativeKeyboard);
}

function bindFileInput(type) {
  const input = elements.files[type];
  const name = elements.fileNames[type];
  const clear = elements.fileClears[type];
  input.addEventListener('change', () => {
    const file = input.files?.[0] ?? null;
    const validation = file ? validateImageFile(file) : { valid: false, message: '請選擇圖檔。' };
    if (!validation.valid) {
      input.value = '';
      state.files[type] = null;
      name.textContent = validation.message;
      clear.hidden = true;
      setStatus(validation.message, 'error');
      return;
    }
    state.files[type] = file;
    name.textContent = file.name;
    clear.hidden = false;
  });
  clear.addEventListener('click', () => clearFile(type));
}

function clearFile(type) {
  state.files[type] = null;
  elements.files[type].value = '';
  elements.fileNames[type].textContent = '未選擇檔案';
  elements.fileClears[type].hidden = true;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result).split(',')[1] ?? ''));
    reader.addEventListener('error', () => reject(new Error('Unable to read the image file.')));
    reader.readAsDataURL(file);
  });
}

function createTransactionId() {
  const randomNumber = Math.floor(1000 + Math.random() * 9000);
  return `${state.currentStationId}-${randomNumber}`;
}

function collectPayloadData() {
  const data = {};
  ELECTION_SECTIONS.forEach((section) => {
    const inputs = getSectionInputs(section.key);
    if (!inputs.check || inputs.check.classList.contains('locked-empty')) return;
    const sectionData = {
      candidates: {},
      valid: inputs.valid?.value ?? '',
      invalid: inputs.invalid?.value ?? '',
      total: inputs.total?.value ?? '',
      issuedNotVoted: inputs.issuedNotVoted?.value ?? '',
      issued: inputs.issued?.value ?? '',
      remaining: inputs.remaining?.value ?? '',
      electors: inputs.electors?.value ?? '',
      check: inputs.check.value ?? '',
    };
    inputs.candidates.forEach((input, index) => {
      sectionData.candidates[index + 1] = input.value;
    });
    data[section.key] = sectionData;
  });
  return data;
}

async function submitData() {
  if (state.isSubmitting) return;
  if (!state.currentStationId) {
    setStatus('請先載入票所資料。', 'warning');
    showAlert('請先載入票所資料。');
    return;
  }
  const fileGov = state.files.gov;
  const fileRef = state.files.ref;
  if (!fileGov || !fileRef) {
    setStatus('請先選擇公職與公投報表圖檔。', 'error');
    showAlert('請先選擇公職與公投報表圖檔。');
    return;
  }
  const errors = [];
  ELECTION_SECTIONS.forEach((section) => {
    const inputs = getSectionInputs(section.key);
    if (!inputs.check || inputs.check.classList.contains('locked-empty')) return;
    const result = updateSectionState(section.key);
    if (!result.isValidCheck) errors.push(section.label);
  });
  if (errors.length) {
    const message = `以下選票試算未通過檢核：${errors.join('、')}`;
    setStatus(message, 'error');
    showAlert(message);
    return;
  }

  state.isSubmitting = true;
  setButtonLoading(elements.submitButton, true, '傳送中...', '傳送資料（含 A3 報表圖）');
  try {
    const payload = {
      stationId: state.currentStationId,
      txId: createTransactionId(),
      timestamp: new Date().toLocaleString('zh-TW'),
      data: collectPayloadData(),
      imageGov: { base64: await fileToBase64(fileGov), ext: fileGov.name.split('.').pop() },
      imageRef: { base64: await fileToBase64(fileRef), ext: fileRef.name.split('.').pop() },
    };
    const response = await state.client.submitRecord(payload);
    if (response?.status !== 'success') {
      throw new ApiError(response?.message || 'The server rejected the submission.', {
        code: 'SUBMISSION_REJECTED',
      });
    }
    setStatus(response.message || '資料已成功傳送。', 'success');
  } catch (error) {
    setStatus(error instanceof ApiError ? error.message : '資料傳送失敗，請稍後重試。', 'error');
  } finally {
    state.isSubmitting = false;
    setButtonLoading(elements.submitButton, false, '傳送中...', '傳送資料（含 A3 報表圖）');
  }
}

function bindDragHandle() {
  let pointerStart = null;
  elements.dragHandle.addEventListener('pointerdown', (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    elements.keyboardPanel.setPointerCapture(event.pointerId);
  });
  elements.keyboardPanel.addEventListener('pointermove', (event) => {
    if (!pointerStart) return;
    const left = elements.keyboardPanel.offsetLeft + event.clientX - pointerStart.x;
    const top = elements.keyboardPanel.offsetTop + event.clientY - pointerStart.y;
    elements.keyboardPanel.style.left = `${Math.max(8, left)}px`;
    elements.keyboardPanel.style.top = `${Math.max(8, top)}px`;
    elements.keyboardPanel.style.bottom = 'auto';
    elements.keyboardPanel.style.transform = 'none';
    pointerStart = { x: event.clientX, y: event.clientY };
  });
  elements.keyboardPanel.addEventListener('pointerup', () => {
    pointerStart = null;
  });
}

function showAlert(message) {
  elements.alertMessage.textContent = message;
  if (typeof elements.alertDialog.showModal === 'function') elements.alertDialog.showModal();
  else elements.alertDialog.setAttribute('open', '');
}

function cacheElements() {
  elements.calculatorTable = query('#calculator-table');
  elements.tableWrapper = query('#table-wrapper');
  elements.stationInput = query('#station-id-input');
  elements.stationInfo = query('#station-info');
  elements.loadButton = query('#btn-load-station');
  elements.clearButton = query('#btn-clear-all');
  elements.lockButton = query('#btn-lock');
  elements.submitButton = query('#btn-submit');
  elements.networkStatus = query('#network-status');
  elements.operationStatus = createLiveStatus(query('#operation-status'));
  elements.toast = createToast(query('#toast'));
  elements.continuousMode = query('#continuous-mode');
  elements.modeToggle = query('#mode-toggle-label');
  elements.voiceButton = query('#voice-btn');
  elements.voiceStatus = query('#keyboard-voice-status');
  elements.keyboardClear = query('#vk-clear');
  elements.keyboardTab = query('#vk-tab');
  elements.keyboardPanel = query('#keyboard-panel');
  elements.keyboardLauncher = query('#keyboard-launcher');
  elements.mobileKeyboardButton = query('#mobile-keyboard-button');
  elements.nativeKeyboardButton = query('#native-keyboard-button');
  elements.remoteDialog = query('#remote-keyboard-dialog');
  elements.remoteButton = query('#remote-keyboard-button');
  elements.remoteCloseButton = query('#remote-keyboard-close');
  elements.remoteRelayUrl = query('#remote-relay-url');
  elements.remoteRelayOptions = query('#remote-relay-url-options');
  elements.remoteDetectRelayButton = query('#remote-detect-relay');
  elements.remotePairCode = query('#remote-pair-code');
  elements.remoteGenerateCode = query('#remote-generate-pair-code');
  elements.remoteConnectButton = query('#remote-connect-button');
  elements.remoteDisconnectButton = query('#remote-disconnect-button');
  elements.remoteStatus = query('#remote-keyboard-status');
  elements.remotePhoneLink = query('#remote-phone-link');
  elements.remoteCopyLink = query('#remote-copy-link');
  elements.remotePhoneLinkAnchor = query('#remote-phone-link-anchor');
  elements.dragHandle = query('#drag-handle');
  elements.alertDialog = query('#alert-dialog');
  elements.alertMessage = query('#alert-message');
  elements.files = { gov: query('#upload-gov'), ref: query('#upload-ref') };
  elements.fileNames = { gov: query('#file-name-gov'), ref: query('#file-name-ref') };
  elements.fileClears = { gov: query('#clear-file-gov'), ref: query('#clear-file-ref') };
}

function bindEvents() {
  elements.loadButton.addEventListener('click', loadStation);
  elements.stationInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') loadStation();
  });
  elements.stationInput.addEventListener('focusin', () => trackInputFocus(elements.stationInput));
  elements.tableWrapper.addEventListener('input', handleVoteInput);
  elements.tableWrapper.addEventListener('focusin', (event) => {
    if (event.target.matches('.editable-input')) trackInputFocus(event.target);
  });
  elements.clearButton.addEventListener('click', clearCalculator);
  elements.lockButton.addEventListener('click', () => {
    const locked = elements.tableWrapper.classList.toggle('is-locked');
    setTableLocked(locked);
    setStatus(locked ? '表格已鎖定。' : '表格已解鎖。', 'info');
  });
  elements.submitButton.addEventListener('click', submitData);
  elements.continuousMode.addEventListener('change', configureContinuousMode);
  elements.remoteButton.addEventListener('click', openRemoteKeyboardDialog);
  elements.remoteCloseButton.addEventListener('click', () => elements.remoteDialog.close());
  elements.remoteGenerateCode.addEventListener('click', () => {
    elements.remotePairCode.value = generatePairCode();
    updateRemotePhoneLink();
  });
  elements.remotePairCode.addEventListener('input', updateRemotePhoneLink);
  elements.remoteRelayUrl.addEventListener('input', updateRemotePhoneLink);
  elements.remoteDetectRelayButton.addEventListener('click', discoverRemoteRelay);
  elements.remoteConnectButton.addEventListener('click', startRemoteKeyboard);
  elements.remoteDisconnectButton.addEventListener('click', disconnectRemoteKeyboard);
  elements.remoteCopyLink.addEventListener('click', copyRemotePhoneLink);
  query('#close-alert').addEventListener('click', () => elements.alertDialog.close());
  bindFileInput('gov');
  bindFileInput('ref');
  bindKeyboard();
  initializeKeyboardDisplay();
  bindDragHandle();
  configureVoiceInput();
}

async function initialize() {
  cacheElements();
  state.currentInputTarget = elements.stationInput;
  state.client = createConfiguredClient();
  renderCalculatorTable(elements.calculatorTable);
  setTableLocked(true);
  bindEvents();
  registerServiceWorker();
  await loadStationCache();
}

document.addEventListener('DOMContentLoaded', initialize);
