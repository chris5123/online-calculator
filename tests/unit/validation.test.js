import { describe, expect, it } from 'vitest';
import { validateImageFile, validateStationId, validateVoteInput } from '../../src/core/validation.js';

describe('validation', () => {
  it('validates the supported station range', () => {
    expect(validateStationId('1282').valid).toBe(true);
    expect(validateStationId('1419').valid).toBe(true);
    expect(validateStationId('1281').valid).toBe(false);
    expect(validateStationId('abc').valid).toBe(false);
  });

  it('accepts blank and integer vote values only', () => {
    expect(validateVoteInput('').valid).toBe(true);
    expect(validateVoteInput('123').valid).toBe(true);
    expect(validateVoteInput('-1').valid).toBe(false);
    expect(validateVoteInput('1.5').valid).toBe(false);
  });

  it('rejects non-image files and files over the size limit', () => {
    expect(validateImageFile({ type: 'text/plain', size: 10 }).valid).toBe(false);
    expect(validateImageFile({ type: 'image/png', size: 11 * 1024 * 1024 }).valid).toBe(false);
    expect(validateImageFile({ type: 'image/png', size: 100 }).valid).toBe(true);
  });
});
