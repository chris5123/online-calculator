import { API_URL } from '../config/constants.js';

export class ApiError extends Error {
  constructor(message, { code = 'API_ERROR', status = 0, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function parseResponse(response) {
  const rawText = typeof response.text === 'function' ? await response.text() : '';
  if (!rawText) {
    throw new ApiError('The API returned an empty response.', {
      code: 'EMPTY_RESPONSE',
      status: response.status,
    });
  }
  try {
    return JSON.parse(rawText);
  } catch {
    throw new ApiError('The API returned invalid JSON.', {
      code: 'INVALID_JSON',
      status: response.status,
      details: rawText.slice(0, 200),
    });
  }
}

export async function requestJson(
  path = '',
  { method = 'GET', query = {}, body, apiUrl = API_URL, timeoutMs = 15000, fetchImpl = globalThis.fetch } = {},
) {
  if (typeof fetchImpl !== 'function') {
    throw new ApiError('Fetch is not available in this environment.', { code: 'FETCH_UNAVAILABLE' });
  }

  const url = new URL(path, apiUrl);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = body ? { 'Content-Type': 'text/plain;charset=utf-8' } : undefined;

  try {
    const response = await fetchImpl(url, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      signal: controller.signal,
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new ApiError(payload?.message || `API request failed with status ${response.status}.`, {
        code: 'HTTP_ERROR',
        status: response.status,
        details: payload,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') {
      throw new ApiError('The API request timed out.', { code: 'TIMEOUT' });
    }
    throw new ApiError('A network error prevented the API request.', {
      code: 'NETWORK_ERROR',
      details: error,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createApiClient(options = {}) {
  const request = (path, requestOptions = {}) => requestJson(path, { ...options, ...requestOptions });
  return {
    mode: 'production',
    getAll: () => request('', { query: { action: 'getAll' } }),
    getDashboardData: () => request('', { query: { action: 'getDashboardData' } }),
    getImage: (stationId, type) =>
      request('', { query: { action: 'getImage', stationId, type } }),
    submitRecord: (payload) => request('', { method: 'POST', body: payload }),
    updateStatus: (payload) => request('', { method: 'POST', body: payload }),
  };
}
