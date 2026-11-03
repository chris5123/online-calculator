export const API_URL =
  'https://script.google.com/macros/s/AKfycbw7-9Axst2b44keFWFllxzuLWGJPuWoVOijT1-C79K-6AkqPqEwQ6iL02zzjqlalNwhuA/exec';

export const APP_BASE_PATH = '/online-calculator/';
export const MAX_STATION_ID = 1419;
export const MIN_STATION_ID = 1282;
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_CANDIDATES = 14;

export const ELECTION_SECTIONS = Object.freeze([
  {
    key: 'mayor',
    label: '直轄市長',
    candidateNames: ['郭璽', '林志成', '沈伯洋', '蕭文乾', '蔣萬安', '唐新民'],
  },
  {
    key: 'councilor',
    label: '區域議員',
    candidateNames: [
      '張延廷',
      '吳志剛',
      '陳力新',
      '吳怡萱',
      '徐立信',
      '馬郁雯',
      '鍾小平',
      '郭昭巖',
      '譚傳紹',
      '張銘祐',
      '王振庭',
      '洪婉臻',
      '劉耀仁',
      '應佳妤',
    ],
  },
  {
    key: 'flatland',
    label: '平地原住民議員',
    candidateNames: ['李芳儒', '林筱薇'],
  },
  {
    key: 'mountain',
    label: '山地原住民議員',
    candidateNames: ['林家豪', '李傅鈺婷', '孔垂崢'],
  },
  {
    key: 'village',
    label: '里長',
    candidateNames: ['AAA', 'BBB'],
    dynamic: true,
  },
  {
    key: 'referendum',
    label: '公投',
    candidateNames: ['同意', '不同意'],
  },
]);

export const DASHBOARD_RECORD_TYPES = Object.freeze([
  { key: '市長', label: '市長' },
  { key: '區域議員', label: '區域議員' },
  { key: '平地原住民議員', label: '平地原住民議員' },
  { key: '山地原住民議員', label: '山地原住民議員' },
  { key: '里長', label: '里長' },
  { key: '公投', label: '公投' },
]);

export const REVIEW_STATUSES = Object.freeze([
  '',
  '數字有誤(紅)',
  '待補正(黃)',
  '一聯報表ok(綠)',
  '一二聯報表ok(綠)',
]);

export function isMockMode() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mode') === 'mock';
}
