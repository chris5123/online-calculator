import { ELECTION_SECTIONS, MAX_CANDIDATES } from '../config/constants.js';

export function toSafeNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numericValue = Number(value);
  if (!Number.isSafeInteger(numericValue) || numericValue < 0) return 0;
  return numericValue;
}

export function calculateTotals({
  candidateValues = [],
  invalid = 0,
  issuedNotVoted = 0,
  remaining = 0,
  check = 0,
} = {}) {
  const valid = candidateValues.reduce(
    (total, value) => total + toSafeNonNegativeInteger(value),
    0,
  );
  const invalidVotes = toSafeNonNegativeInteger(invalid);
  const issuedNotVotedVotes = toSafeNonNegativeInteger(issuedNotVoted);
  const remainingVotes = toSafeNonNegativeInteger(remaining);
  const checkValue = toSafeNonNegativeInteger(check);
  const total = valid + invalidVotes;
  const issued = total + issuedNotVotedVotes;
  const electors = issued + remainingVotes;

  return {
    valid,
    invalid: invalidVotes,
    total,
    issuedNotVoted: issuedNotVotedVotes,
    issued,
    remaining: remainingVotes,
    electors,
    check: checkValue,
    matches: electors === checkValue,
    isValidCheck: checkValue !== 0 && electors === checkValue,
  };
}

export function normalizeCandidateNames(candidateNames, fallback = []) {
  if (!Array.isArray(candidateNames)) return [...fallback].slice(0, MAX_CANDIDATES);
  return candidateNames
    .map((name) => String(name ?? '').trim())
    .filter(Boolean)
    .slice(0, MAX_CANDIDATES);
}

export function getSectionDefinition(sectionKey) {
  return ELECTION_SECTIONS.find((section) => section.key === sectionKey) ?? null;
}

export function getInitialCandidateNames(sectionKey, stationData = {}) {
  const definition = getSectionDefinition(sectionKey);
  if (!definition) return [];
  if (definition.dynamic && Array.isArray(stationData.villageCandidates)) {
    return normalizeCandidateNames(stationData.villageCandidates, definition.candidateNames);
  }
  return [...definition.candidateNames];
}

export function isSectionEnabled(checkValue) {
  return Boolean(checkValue) && Number(checkValue) !== 0;
}

export function calculateStationSections(stationData = {}) {
  return ELECTION_SECTIONS.reduce((result, section) => {
    const checkValue = stationData.checkValues?.[section.key] ?? 0;
    result[section.key] = {
      candidateNames: getInitialCandidateNames(section.key, stationData),
      enabled: isSectionEnabled(checkValue),
      checkValue: toSafeNonNegativeInteger(checkValue),
    };
    return result;
  }, {});
}
