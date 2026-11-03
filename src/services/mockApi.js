function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const mockStationData = {
  '1282': {
    checkValues: { mayor: 1000, councilor: 1000, flatland: 0, mountain: 0, village: 100, referendum: 1000 },
    villageCandidates: ['李珮忻', '徐庭崇'],
  },
  '1285': {
    checkValues: { mayor: 1200, councilor: 1200, flatland: 10, mountain: 20, village: 100, referendum: 1200 },
    villageCandidates: ['吳美玫'],
  },
};

const mockRecords = {
  govList: [
    {
      stationId: '1282',
      timestamp: '2026/11/03 下午 17:49',
      status: '',
      lockedBy: '',
      txId: 'mock-gov-1282',
      type: 'gov',
      records: {},
    },
  ],
  refList: [
    {
      stationId: '1282',
      timestamp: '2026/11/03 下午 17:50',
      status: '',
      lockedBy: '',
      txId: 'mock-ref-1282',
      type: 'ref',
      records: {},
    },
  ],
};

const mockImage =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="50%" text-anchor="middle" font-size="48" fill="#1e3a8a">Mock Report</text></svg>',
  );

export function createMockApiClient() {
  const state = clone(mockRecords);
  return {
    mode: 'mock',
    async getAll() {
      return { status: 'success', data: clone(mockStationData) };
    },
    async getDashboardData() {
      return { status: 'success', data: clone(state) };
    },
    async getImage() {
      return { status: 'success', data: mockImage };
    },
    async submitRecord() {
      return { status: 'success', message: 'Mock submission completed.' };
    },
    async updateStatus(payload) {
      [...state.govList, ...state.refList].forEach((record) => {
        if (record.txId === payload.txId) {
          record.status = payload.status ?? record.status;
          record.lockedBy = payload.lockedBy ?? record.lockedBy;
        }
      });
      return { status: 'success', message: 'Mock status update completed.' };
    },
  };
}
