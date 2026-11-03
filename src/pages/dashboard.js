import '../styles/app.css';
import { createToast, createLiveStatus } from '../components/toast.js';
import { registerServiceWorker } from '../components/pwa.js';
import { createMockApiClient } from '../services/mockApi.js';
import { ApiError, createApiClient } from '../services/api.js';
import { DASHBOARD_RECORD_TYPES, isMockMode } from '../config/constants.js';
import { isSafeImageSource } from '../core/validation.js';

const state = {
  client: null,
  rawData: { govList: [], refList: [] },
  sortOrders: {
    gov: { by: 'time', asc: false },
    ref: { by: 'time', asc: false },
  },
  currentTxId: null,
  currentRecord: null,
  currentListType: null,
  isLoading: false,
  searchTerm: '',
  image: { scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0 },
};

const elements = {};

function query(selector) {
  return document.querySelector(selector);
}

function setStatus(message, tone = 'info') {
  elements.dashboardStatus.set(message, tone);
}

function setNetworkStatus(message) {
  elements.networkStatus.textContent = `連線狀態：${message}`;
}

function isSuccess(response) {
  return response?.status === 'success';
}

function formatTimestamp(timestamp) {
  const raw = String(timestamp ?? '');
  const localized = raw.match(/(上午|下午)\s?(\d{1,2}):(\d{2})/);
  if (localized) {
    let hour = Number(localized[2]);
    if (localized[1] === '下午' && hour < 12) hour += 12;
    if (localized[1] === '上午' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${localized[3]}`;
  }
  const standard = raw.match(/(\d{1,2}):(\d{2})/);
  return standard ? `${standard[1].padStart(2, '0')}:${standard[2]}` : raw;
}

function getSortIcon(type, criteria) {
  if (state.sortOrders[type].by !== criteria) return '↕';
  return state.sortOrders[type].asc ? '↑' : '↓';
}

function sortList(type, criteria, keepOrder = false) {
  const list = state.rawData[`${type}List`];
  if (!Array.isArray(list)) return;
  if (!keepOrder) {
    if (state.sortOrders[type].by === criteria) state.sortOrders[type].asc = !state.sortOrders[type].asc;
    else {
      state.sortOrders[type].by = criteria;
      state.sortOrders[type].asc = true;
    }
  }
  const { by, asc } = state.sortOrders[type];
  list.sort((left, right) => {
    let result = 0;
    if (by === 'station') {
      result = String(left.stationId ?? '').localeCompare(String(right.stationId ?? ''), undefined, {
        numeric: true,
      });
    } else if (by === 'status') {
      result = String(left.status ?? '').localeCompare(String(right.status ?? ''));
    } else {
      result = String(left.timestamp ?? '').localeCompare(String(right.timestamp ?? ''));
      result = -result;
    }
    return asc ? result : -result;
  });
  renderList(type);
}

function createListHeader(type) {
  const header = elements.headers[type];
  header.replaceChildren();
  [
    ['station', '票所編號'],
    ['time', '回傳時間'],
    ['status', '狀態'],
  ].forEach(([criteria, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'list-sort-button';
    button.textContent = `${label} ${getSortIcon(type, criteria)}`;
    button.addEventListener('click', () => sortList(type, criteria));
    header.appendChild(button);
  });
}

function getStatusPresentation(item) {
  const isClosed = item.status === '一二聯報表ok(綠)';
  const isLocked = Boolean(item.lockedBy) && !isClosed;
  if (isClosed) return { label: '1.2', className: 'status-success', isClosed, isLocked };
  if (item.status === '數字有誤(紅)') return { label: '1', className: 'status-error', isClosed, isLocked };
  if (item.status === '待補正(黃)') return { label: '1', className: 'status-warning', isClosed, isLocked };
  if (item.status === '一聯報表ok(綠)') return { label: '1', className: 'status-success', isClosed, isLocked };
  return { label: '', className: '', isClosed, isLocked };
}

function matchesSearch(item) {
  if (!state.searchTerm) return true;
  return `${item.stationId ?? ''} ${item.timestamp ?? ''}`.toLowerCase().includes(state.searchTerm);
}

function renderList(type) {
  createListHeader(type);
  const container = elements.lists[type];
  container.replaceChildren();
  const list = (state.rawData[`${type}List`] ?? []).filter(matchesSearch);
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state list-empty-state';
    empty.textContent = state.searchTerm ? '沒有符合搜尋條件的資料。' : '目前沒有已回傳資料。';
    container.appendChild(empty);
    return;
  }
  list.forEach((item) => {
    const presentation = getStatusPresentation(item);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'record-row';
    if (presentation.isClosed) row.classList.add('is-closed');
    if (presentation.isLocked) row.classList.add('is-locked');
    row.addEventListener('click', () => loadRecord(item, type));

    const station = document.createElement('strong');
    station.textContent = String(item.stationId ?? '');
    const timestamp = document.createElement('span');
    timestamp.className = 'record-time';
    timestamp.textContent = formatTimestamp(item.timestamp);
    timestamp.title = String(item.timestamp ?? '');
    const badges = document.createElement('span');
    badges.className = 'record-badges';
    if (presentation.label) {
      const badge = document.createElement('span');
      badge.className = `badge ${presentation.className}`;
      badge.textContent = presentation.label;
      badges.appendChild(badge);
    }
    if (presentation.isLocked) {
      const lockBadge = document.createElement('span');
      lockBadge.className = 'badge status-warning';
      lockBadge.textContent = `🔒${String(item.lockedBy)}`;
      badges.appendChild(lockBadge);
    }
    row.append(station, timestamp, badges);
    container.appendChild(row);
  });
}

async function fetchListData() {
  if (state.isLoading) return;
  state.isLoading = true;
  Object.values(elements.lists).forEach((list) => {
    list.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'empty-state list-empty-state';
    loading.textContent = '載入中...';
    list.appendChild(loading);
  });
  setStatus('正在載入 Dashboard 資料...', 'loading');
  setNetworkStatus(isMockMode() ? 'Mock Mode' : '載入中');
  try {
    const response = await state.client.getDashboardData();
    if (!isSuccess(response) || !response.data) {
      throw new ApiError('Unexpected dashboard data response.', { code: 'INVALID_RESPONSE' });
    }
    state.rawData = {
      govList: Array.isArray(response.data.govList) ? response.data.govList : [],
      refList: Array.isArray(response.data.refList) ? response.data.refList : [],
    };
    sortList('gov', state.sortOrders.gov.by, true);
    sortList('ref', state.sortOrders.ref.by, true);
    setNetworkStatus(isMockMode() ? 'Mock Mode' : '已連線');
    setStatus('Dashboard 資料已更新。', 'success');
  } catch (error) {
    setNetworkStatus('連線失敗');
    state.rawData = { govList: [], refList: [] };
    Object.values(elements.lists).forEach((list) => {
      list.replaceChildren();
      const message = document.createElement('p');
      message.className = 'empty-state list-empty-state error-text';
      message.textContent = error instanceof ApiError ? error.message : '無法載入 Dashboard 資料。';
      list.appendChild(message);
    });
    setStatus('Dashboard 資料載入失敗，請稍後重試。', 'error');
  } finally {
    state.isLoading = false;
  }
}

function renderTable(item) {
  elements.dataBody.replaceChildren();
  let rows = 0;
  DASHBOARD_RECORD_TYPES.forEach(({ key, label }) => {
    const record = item.records?.[key];
    if (!record) return;
    rows += 1;
    const row = document.createElement('tr');
    const typeCell = document.createElement('th');
    typeCell.colSpan = 2;
    typeCell.className = 'row-header';
    typeCell.textContent = label;
    row.appendChild(typeCell);
    for (let index = 1; index <= 14; index += 1) {
      const cell = document.createElement('td');
      cell.className = 'value-cell';
      cell.textContent = String(record.candidates?.[index] ?? '');
      if (!record.candidates?.[index]) cell.classList.add('is-empty');
      row.appendChild(cell);
    }
    const stats = record.stats ?? {};
    ['valid', 'invalid', 'total', 'issuedNotVoted', 'issued', 'remaining', 'electors', 'check'].forEach(
      (field) => {
        const cell = document.createElement('td');
        cell.className = 'value-cell stat-value-cell';
        cell.textContent = String(stats[field] ?? '');
        if (field === 'check') {
          const isValid = Number(stats.electors ?? 0) === Number(stats.check ?? 0) && Number(stats.check ?? 0) !== 0;
          cell.classList.add(isValid ? 'check-success' : 'check-error');
        }
        row.appendChild(cell);
      },
    );
    elements.dataBody.appendChild(row);
  });
  if (!rows) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 26;
    cell.className = 'empty-state';
    cell.textContent = '此票所查無詳細選票數據。';
    row.appendChild(cell);
    elements.dataBody.appendChild(row);
  }
}

function setUnlockVisibility(item, isAdmin) {
  elements.unlockButton.hidden = !(isAdmin && (item.lockedBy || item.status));
}

async function loadRecord(item, type) {
  const role = elements.userRole.value;
  if (!role) {
    setStatus('請先選擇帳號身分。', 'warning');
    return;
  }
  const isClosed = item.status === '一二聯報表ok(綠)';
  const isAdmin = role.startsWith('Admin');
  if (isClosed && !isAdmin) {
    setStatus('此筆資料已結案，僅限系統管理者操作。', 'warning');
    return;
  }
  if (item.lockedBy && item.lockedBy !== role && !isClosed && !isAdmin) {
    setStatus(`此筆資料正由 ${item.lockedBy} 檢核中。`, 'warning');
    return;
  }

  state.currentRecord = item;
  state.currentTxId = item.txId;
  state.currentListType = type;
  elements.currentStation.textContent = `票所 ${String(item.stationId ?? '')}`;
  elements.statusSelect.value = item.status || '';
  setUnlockVisibility(item, isAdmin);

  if (!isClosed && item.lockedBy !== role) {
    try {
      const response = await state.client.updateStatus({ action: 'updateStatus', txId: state.currentTxId, lockedBy: role });
      if (!isSuccess(response)) throw new ApiError(response?.message || 'Lock request failed.');
      item.lockedBy = role;
      renderList(type);
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : '無法鎖定此筆資料。', 'error');
      return;
    }
  }

  renderTable(item);
  await loadImage(item.stationId, type);
}

async function loadImage(stationId, type) {
  elements.reportImage.hidden = true;
  elements.imageLoading.hidden = false;
  elements.imageLoading.textContent = '載入影像中...';
  resetZoom();
  try {
    const response = await state.client.getImage(stationId, type);
    if (!isSuccess(response) || !isSafeImageSource(response.data)) {
      throw new ApiError('影像來源無效或不存在。', { code: 'INVALID_IMAGE' });
    }
    elements.reportImage.src = response.data;
    elements.reportImage.onload = () => {
      elements.imageLoading.hidden = true;
      elements.reportImage.hidden = false;
      resetZoom();
    };
  } catch (error) {
    elements.imageLoading.hidden = false;
    elements.imageLoading.textContent = error instanceof ApiError ? error.message : '影像載入失敗。';
  }
}

async function updateStatus() {
  if (!state.currentTxId || !state.currentRecord) return;
  const role = elements.userRole.value;
  const newStatus = elements.statusSelect.value;
  if (!role) {
    setStatus('請先選擇帳號身分。', 'warning');
    return;
  }
  const isAdmin = role.startsWith('Admin');
  if (state.currentRecord.status === '一二聯報表ok(綠)' && !isAdmin) {
    setStatus('此筆資料已結案，僅限系統管理者解鎖。', 'warning');
    return;
  }
  const lockedBy = newStatus === '一二聯報表ok(綠)' ? '' : role;
  try {
    const response = await state.client.updateStatus({
      action: 'updateStatus',
      txId: state.currentTxId,
      status: newStatus,
      lockedBy,
    });
    if (!isSuccess(response)) throw new ApiError(response?.message || 'Status update failed.');
    state.currentRecord.status = newStatus;
    state.currentRecord.lockedBy = lockedBy;
    renderList(state.currentListType);
    setUnlockVisibility(state.currentRecord, isAdmin);
    setStatus('狀態已更新。', 'success');
  } catch (error) {
    setStatus(error instanceof ApiError ? error.message : '狀態更新失敗。', 'error');
  }
}

async function unlockRecord() {
  if (!state.currentTxId || !state.currentRecord) return;
  try {
    const response = await state.client.updateStatus({
      action: 'updateStatus',
      txId: state.currentTxId,
      lockedBy: '',
      status: '',
    });
    if (!isSuccess(response)) throw new ApiError(response?.message || 'Unlock request failed.');
    state.currentRecord.lockedBy = '';
    state.currentRecord.status = '';
    elements.statusSelect.value = '';
    elements.unlockButton.hidden = true;
    renderList(state.currentListType);
    setStatus('已解除鎖定並清除檢核狀態。', 'success');
  } catch (error) {
    setStatus(error instanceof ApiError ? error.message : '解鎖失敗。', 'error');
  }
}

function updateImageTransform() {
  elements.reportImage.style.transform = `translate(${state.image.x}px, ${state.image.y}px) scale(${state.image.scale})`;
}

function resetZoom() {
  state.image.scale = 1;
  state.image.x = 0;
  state.image.y = 0;
  updateImageTransform();
}

function zoom(factor) {
  state.image.scale = Math.min(5, Math.max(0.2, state.image.scale * factor));
  updateImageTransform();
}

function bindImageControls() {
  elements.zoomIn.addEventListener('click', () => zoom(1.2));
  elements.zoomOut.addEventListener('click', () => zoom(0.8));
  elements.zoomReset.addEventListener('click', resetZoom);
  elements.imageContainer.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoom(event.deltaY > 0 ? 0.9 : 1.1);
  });
  elements.imageContainer.addEventListener('pointerdown', (event) => {
    state.image.dragging = true;
    state.image.startX = event.clientX - state.image.x;
    state.image.startY = event.clientY - state.image.y;
    elements.imageContainer.setPointerCapture(event.pointerId);
  });
  elements.imageContainer.addEventListener('pointermove', (event) => {
    if (!state.image.dragging) return;
    state.image.x = event.clientX - state.image.startX;
    state.image.y = event.clientY - state.image.startY;
    updateImageTransform();
  });
  elements.imageContainer.addEventListener('pointerup', () => {
    state.image.dragging = false;
  });
}

function printReport() {
  if (elements.reportImage.hidden || !elements.reportImage.src) {
    setStatus('請先載入報表影像。', 'warning');
    return;
  }
  elements.printImage.src = elements.reportImage.src;
  window.print();
}

function cacheElements() {
  elements.dashboardStatus = createLiveStatus(query('#dashboard-status'));
  elements.toast = createToast(query('#toast'));
  elements.networkStatus = query('#network-status');
  elements.userRole = query('#user-role');
  elements.reloadButton = query('#reload-list');
  elements.searchInput = query('#list-search');
  elements.statusSelect = query('#status-select');
  elements.updateStatusButton = query('#update-status');
  elements.unlockButton = query('#unlock-record');
  elements.currentStation = query('#current-station');
  elements.printReport = query('#print-report');
  elements.lists = { gov: query('#list-gov'), ref: query('#list-ref') };
  elements.headers = { gov: query('#header-gov'), ref: query('#header-ref') };
  elements.dataBody = query('#data-tbody');
  elements.imageContainer = query('#image-container');
  elements.imageLoading = query('#image-loading');
  elements.reportImage = query('#report-image');
  elements.printImage = query('#print-image');
  elements.zoomIn = query('#zoom-in');
  elements.zoomOut = query('#zoom-out');
  elements.zoomReset = query('#zoom-reset');
  query('#dashboard-mode').textContent = isMockMode() ? 'Mock Mode（不寫入正式 API）' : '正式 API 模式';
}

function bindEvents() {
  elements.reloadButton.addEventListener('click', fetchListData);
  elements.searchInput.addEventListener('input', () => {
    state.searchTerm = elements.searchInput.value.trim().toLowerCase();
    renderList('gov');
    renderList('ref');
  });
  elements.updateStatusButton.addEventListener('click', updateStatus);
  elements.unlockButton.addEventListener('click', unlockRecord);
  elements.printReport.addEventListener('click', printReport);
  bindImageControls();
}

async function initialize() {
  cacheElements();
  state.client = isMockMode() ? createMockApiClient() : createApiClient();
  bindEvents();
  registerServiceWorker();
  await fetchListData();
}

document.addEventListener('DOMContentLoaded', initialize);
