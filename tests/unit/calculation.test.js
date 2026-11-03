import { describe, expect, it } from 'vitest';
import {
  calculateStationSections,
  calculateTotals,
  getInitialCandidateNames,
  normalizeCandidateNames,
  toSafeNonNegativeInteger,
} from '../../src/core/calculation.js';
import { regressionBaseline } from '../fixtures/regression-baseline.js';

describe('calculateTotals regression baseline', () => {
  Object.entries(regressionBaseline).forEach(([section, input]) => {
    it(`preserves the ${section} calculation contract`, () => {
      expect(calculateTotals(input)).toEqual(input.expected);
    });
  });
});

describe('calculation input handling', () => {
  it('treats empty values as zero, matching the original behavior', () => {
    expect(toSafeNonNegativeInteger('')).toBe(0);
    expect(toSafeNonNegativeInteger(null)).toBe(0);
  });

  it('does not accept negative, decimal, or unsafe values as vote counts', () => {
    expect(toSafeNonNegativeInteger(-1)).toBe(0);
    expect(toSafeNonNegativeInteger(1.2)).toBe(0);
    expect(toSafeNonNegativeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(0);
  });

  it('normalizes dynamic village candidate names', () => {
    expect(normalizeCandidateNames([' A ', '', null, 'B'])).toEqual(['A', 'B']);
    expect(getInitialCandidateNames('village', { villageCandidates: ['里長甲'] })).toEqual(['里長甲']);
  });

  it('locks sections with a zero check value', () => {
    const sections = calculateStationSections({
      checkValues: { flatland: 0, mayor: 100 },
      villageCandidates: ['甲'],
    });
    expect(sections.flatland.enabled).toBe(false);
    expect(sections.mayor.enabled).toBe(true);
    expect(sections.village.candidateNames).toEqual(['甲']);
  });
});
