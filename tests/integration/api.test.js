import { describe, expect, it, vi } from 'vitest';
import { ApiError, requestJson } from '../../src/services/api.js';

function response(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    text: async () => JSON.stringify(body),
  };
}

describe('API service', () => {
  it('preserves the existing GET action contract', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ status: 'success', data: { '1282': {} } }));
    const result = await requestJson('', {
      apiUrl: 'https://example.test/exec',
      query: { action: 'getAll' },
      fetchImpl,
    });
    expect(result.status).toBe('success');
    expect(fetchImpl.mock.calls[0][0].toString()).toContain('action=getAll');
  });

  it('preserves the existing POST JSON payload transport', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ status: 'success' }));
    await requestJson('', {
      apiUrl: 'https://example.test/exec',
      method: 'POST',
      body: { action: 'updateStatus', txId: 'test-1' },
      fetchImpl,
    });
    const request = fetchImpl.mock.calls[0][1];
    expect(request.method).toBe('POST');
    expect(request.headers['Content-Type']).toBe('text/plain;charset=utf-8');
    expect(JSON.parse(request.body)).toEqual({ action: 'updateStatus', txId: 'test-1' });
  });

  it('reports invalid JSON instead of treating it as success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<html>error</html>' });
    await expect(requestJson('', { apiUrl: 'https://example.test/exec', fetchImpl })).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('reports server errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ status: 'error', message: 'Rejected' }, { ok: false, status: 500 }),
    );
    await expect(requestJson('', { apiUrl: 'https://example.test/exec', fetchImpl })).rejects.toBeInstanceOf(ApiError);
  });

  it('reports timeouts without contacting a second endpoint', async () => {
    const fetchImpl = vi.fn((_url, options) =>
      new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    );
    await expect(
      requestJson('', { apiUrl: 'https://example.test/exec', fetchImpl, timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
