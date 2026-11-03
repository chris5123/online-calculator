import { ELECTION_SECTIONS, MAX_CANDIDATES } from '../config/constants.js';

const STAT_FIELDS = [
  ['valid', '有效票數', true],
  ['invalid', '無效票數', false],
  ['total', '投票數', true],
  ['issuedNotVoted', '已領未投', false],
  ['issued', '發出票數', true],
  ['remaining', '用餘票數', false],
  ['electors', '選舉人數', true],
  ['check', '檢查值', true],
];

const CANDIDATES_PER_ROW = 7;

function createElement(tagName, className = '', text = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function createInput({ id, sectionKey, field, readOnly = false, candidateIndex = null }) {
  const input = createElement('input', 'vote-input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.id = id;
  input.dataset.section = sectionKey;
  input.dataset.field = field;
  input.autocomplete = 'off';
  if (candidateIndex !== null) {
    input.classList.add('candidate-input');
    input.dataset.candidateIndex = String(candidateIndex);
  }
  if (readOnly) {
    input.readOnly = true;
    input.classList.add('computed-input');
  } else {
    input.classList.add('editable-input');
  }
  return input;
}

function createCandidateHeader(name, index) {
  const cell = createElement('th', 'candidate-header');
  if (!name) return cell;
  const number = createElement('span', 'candidate-number', String(index + 1));
  const label = createElement('span', 'candidate-name', name);
  cell.append(number, label);
  return cell;
}

export function renderCalculatorTable(table, candidateNamesBySection = {}) {
  const thead = createElement('thead');
  const headerRow = createElement('tr');
  const electionHeader = createElement('th', '', '開票結果 / 選舉種類');
  electionHeader.colSpan = 2;
  headerRow.appendChild(electionHeader);
  const candidateHeader = createElement('th', '', '各候選人得票數');
  candidateHeader.colSpan = CANDIDATES_PER_ROW;
  headerRow.appendChild(candidateHeader);
  STAT_FIELDS.forEach(([field, label]) => {
    const cell = createElement('th', '', label);
    cell.classList.add(`stat-header-${field}`);
    headerRow.appendChild(cell);
  });
  thead.appendChild(headerRow);

  const tbody = createElement('tbody');
  ELECTION_SECTIONS.forEach((section) => {
    const candidateNames = candidateNamesBySection[section.key] ?? section.candidateNames;
    const visibleCandidateNames = Array.isArray(candidateNames)
      ? candidateNames.slice(0, MAX_CANDIDATES)
      : [];
    const candidateRowCount = Math.max(
      1,
      Math.ceil(visibleCandidateNames.length / CANDIDATES_PER_ROW),
    );
    const sectionRowSpan = candidateRowCount * 2;

    for (let rowIndex = 0; rowIndex < candidateRowCount; rowIndex += 1) {
      const headerRowForSection = createElement('tr');
      if (rowIndex === 0) {
        const sectionHeader = createElement('th', 'section-header', section.label);
        sectionHeader.rowSpan = sectionRowSpan;
        sectionHeader.colSpan = 2;
        headerRowForSection.appendChild(sectionHeader);
      }

      for (let columnIndex = 0; columnIndex < CANDIDATES_PER_ROW; columnIndex += 1) {
        const candidateIndex = rowIndex * CANDIDATES_PER_ROW + columnIndex;
        headerRowForSection.appendChild(
          createCandidateHeader(visibleCandidateNames[candidateIndex] ?? '', candidateIndex),
        );
      }

      if (rowIndex === 0) {
        STAT_FIELDS.forEach(([field, label, computed]) => {
          const cell = createElement('td', `stat-cell stat-${field}`);
          cell.rowSpan = sectionRowSpan;
          const input = createInput({
            id: `${section.key}_${field}`,
            sectionKey: section.key,
            field,
            readOnly: computed,
          });
          input.setAttribute('aria-label', `${section.label} ${label}`);
          if (field === 'check') input.classList.add('check-input');
          cell.appendChild(input);
          headerRowForSection.appendChild(cell);
        });
      }
      tbody.appendChild(headerRowForSection);

      const inputRow = createElement('tr');
      for (let columnIndex = 0; columnIndex < CANDIDATES_PER_ROW; columnIndex += 1) {
        const candidateIndex = rowIndex * CANDIDATES_PER_ROW + columnIndex;
        const cell = createElement('td', 'candidate-input-cell');
        if (visibleCandidateNames[candidateIndex]) {
          const input = createInput({
            id: `${section.key}_candidate_${candidateIndex + 1}`,
            sectionKey: section.key,
            field: 'candidate',
            candidateIndex: candidateIndex + 1,
          });
          input.setAttribute('aria-label', `${section.label} ${candidateIndex + 1} 號候選人票數`);
          cell.appendChild(input);
        } else {
          cell.classList.add('empty-cell');
        }
        inputRow.appendChild(cell);
      }
      tbody.appendChild(inputRow);
    }
  });

  table.replaceChildren(thead, tbody);
}

export function getSectionInputs(sectionKey) {
  return {
    candidates: [...document.querySelectorAll(`.candidate-input[data-section="${sectionKey}"]`)],
    invalid: document.getElementById(`${sectionKey}_invalid`),
    issuedNotVoted: document.getElementById(`${sectionKey}_issuedNotVoted`),
    remaining: document.getElementById(`${sectionKey}_remaining`),
    valid: document.getElementById(`${sectionKey}_valid`),
    total: document.getElementById(`${sectionKey}_total`),
    issued: document.getElementById(`${sectionKey}_issued`),
    electors: document.getElementById(`${sectionKey}_electors`),
    check: document.getElementById(`${sectionKey}_check`),
  };
}
