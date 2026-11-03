import { describe, expect, it } from 'vitest';
import {
  discoverKeyboardRelayUrls,
  generatePairCode,
  getDefaultKeyboardRelayUrl,
  getKeyboardRelayDiscoveryUrl,
  isLocalNetworkHostname,
  isLoopbackHostname,
  isLoopbackRelayUrl,
  normalizePairCode,
  normalizeRelayUrl,
  validateRelayUrlForPage,
} from '../../src/services/keyboardRelay.js';

describe('keyboard relay helpers', () => {
  it('normalizes valid pairing codes', () => {
    expect(normalizePairCode(' abcd2345 ')).toBe('ABCD2345');
  });

  it('rejects invalid pairing codes and relay protocols', () => {
    expect(() => normalizePairCode('short')).toThrow();
    expect(() => normalizeRelayUrl('')).toThrow(/relay URL/i);
    expect(() => normalizeRelayUrl('https://example.com')).toThrow();
  });

  it('uses the computer host for local HTTP relay URLs', () => {
    expect(getDefaultKeyboardRelayUrl({ protocol: 'http:', hostname: '192.168.1.25' })).toBe(
      'ws://192.168.1.25:8787',
    );
    expect(getDefaultKeyboardRelayUrl({ protocol: 'http:', hostname: 'localhost' })).toBe('');
    expect(
      getDefaultKeyboardRelayUrl({ protocol: 'https:', hostname: 'chris5123.github.io' }),
    ).toBe('');
  });

  it('recognizes phone-hotspot network addresses', () => {
    expect(isLoopbackHostname('127.0.0.2')).toBe(true);
    expect(isLocalNetworkHostname('172.20.10.2')).toBe(true);
    expect(isLocalNetworkHostname('192.168.1.25')).toBe(true);
    expect(isLocalNetworkHostname('relay.example.com')).toBe(false);
  });

  it('discovers non-loopback relay URLs from the local relay server', async () => {
    const location = { protocol: 'http:', hostname: 'localhost' };
    const requests = [];
    const relayUrls = await discoverKeyboardRelayUrls({
      location,
      fetchImpl: async (url) => {
        requests.push(url);
        return {
          ok: true,
          json: async () => ({
            relayUrls: ['ws://172.20.10.2:8787', 'ws://172.20.10.2:8787', 'ws://127.0.0.1:8787'],
          }),
        };
      },
    });

    expect(requests).toEqual(['http://127.0.0.1:8787/network']);
    expect(getKeyboardRelayDiscoveryUrl(location)).toBe('http://127.0.0.1:8787/network');
    expect(relayUrls).toEqual(['ws://172.20.10.2:8787/']);
  });

  it('requires a secure relay for discovery from HTTPS pages', async () => {
    await expect(
      discoverKeyboardRelayUrls({ location: { protocol: 'https:', hostname: 'example.com' } }),
    ).rejects.toThrow(/wss/i);
  });

  it('rejects insecure relay URLs from HTTPS pages', () => {
    expect(() => validateRelayUrlForPage('ws://192.168.1.25:8787', { protocol: 'https:' })).toThrow(
      /wss/i,
    );
    expect(validateRelayUrlForPage('ws://192.168.1.25:8787', { protocol: 'http:' })).toBe(
      'ws://192.168.1.25:8787/',
    );
    expect(isLoopbackRelayUrl('ws://localhost:8787')).toBe(true);
    expect(isLoopbackRelayUrl('ws://192.168.1.25:8787')).toBe(false);
  });

  it('generates an alphanumeric pairing code', () => {
    expect(generatePairCode()).toMatch(/^[A-Z2-9]{8}$/);
  });
});
