import {
  MAX_IMAGE_SIZE_BYTES,
  MAX_STATION_ID,
  MIN_STATION_ID,
} from '../config/constants.js';

export function validateStationId(value) {
  const stationId = Number(String(value ?? '').trim());
  if (!Number.isInteger(stationId)) {
    return { valid: false, message: '請輸入整數票所編號。' };
  }
  if (stationId < MIN_STATION_ID || stationId > MAX_STATION_ID) {
    return {
      valid: false,
      message: `票所編號必須介於 ${MIN_STATION_ID} 至 ${MAX_STATION_ID}。`,
    };
  }
  return { valid: true, value: String(stationId), message: '' };
}

export function validateVoteInput(value) {
  const normalized = String(value ?? '').trim();
  if (normalized === '') return { valid: true, value: '' };
  if (!/^\d+$/.test(normalized)) {
    return { valid: false, value: normalized, message: '票數只能輸入非負整數。' };
  }
  const numericValue = Number(normalized);
  if (!Number.isSafeInteger(numericValue)) {
    return { valid: false, value: normalized, message: '票數超過安全整數範圍。' };
  }
  return { valid: true, value: normalized, message: '' };
}

export function validateImageFile(file) {
  if (!file) return { valid: false, message: '請選擇圖檔。' };
  if (!file.type.startsWith('image/')) {
    return { valid: false, message: '只允許上傳圖片檔案。' };
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { valid: false, message: '圖片檔案不可超過 10 MB。' };
  }
  return { valid: true, message: '' };
}

export function isSafeImageSource(source) {
  if (typeof source !== 'string' || source.length === 0) return false;
  return source.startsWith('data:image/') || /^https:\/\//i.test(source);
}
