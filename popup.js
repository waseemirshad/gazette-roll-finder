const els = {
  fileInput: document.querySelector('#fileInput'),
  fileMeta: document.querySelector('#fileMeta'),
  position: document.querySelector('#position'),
  sectionBadge: document.querySelector('#sectionBadge'),
  rollNo: document.querySelector('#rollNo'),
  studentName: document.querySelector('#studentName'),
  fatherName: document.querySelector('#fatherName'),
  prevBtn: document.querySelector('#prevBtn'),
  nextBtn: document.querySelector('#nextBtn'),
  findBtn: document.querySelector('#findBtn'),
  copyBtn: document.querySelector('#copyBtn'),
  autoSearch: document.querySelector('#autoSearch'),
  status: document.querySelector('#status'),
};

let state = { records: [], index: 0, fileName: '', sheetName: '' };

function setStatus(message, type = 'info') {
  els.status.textContent = message;
  els.status.className = `status ${type}`;
}

function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}

function findColumn(headers, patterns) {
  const normalized = headers.map(normalizeHeader);
  for (const pattern of patterns) {
    const index = normalized.findIndex((header) => pattern.test(header));
    if (index >= 0) return index;
  }
  return -1;
}

function columnIndex(ref = '') {
  const letters = ref.match(/[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}

function xml(text) {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function textOf(node, selector) {
  return Array.from(node.querySelectorAll(selector)).map((item) => item.textContent || '').join('');
}

const decoder = new TextDecoder();

async function unzipXlsx(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Invalid XLSX file: ZIP directory was not found.');
  const entries = new Map();
  const total = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  for (let index = 0; index < total; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid XLSX directory entry.');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error(`Unsupported XLSX compression method: ${method}`);
    entries.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function entryText(entries, path) {
  const data = entries.get(path);
  return data ? decoder.decode(data) : null;
}

async function sharedStrings(entries) {
  const content = entryText(entries, 'xl/sharedStrings.xml');
  if (!content) return [];
  const doc = xml(content);
  return Array.from(doc.getElementsByTagName('si')).map((si) => textOf(si, 't'));
}

async function workbookSheets(entries) {
  const workbook = xml(entryText(entries, 'xl/workbook.xml'));
  const rels = xml(entryText(entries, 'xl/_rels/workbook.xml.rels'));
  const targets = new Map(Array.from(rels.getElementsByTagName('Relationship')).map((rel) => [rel.getAttribute('Id'), rel.getAttribute('Target')]));
  return Array.from(workbook.getElementsByTagName('sheet')).map((sheet) => {
    const relationshipId = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = targets.get(relationshipId) || '';
    return {
      name: sheet.getAttribute('name') || 'Sheet',
      path: target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`,
    };
  });
}

async function parseSheet(entries, sheet, strings) {
  const content = entryText(entries, sheet.path);
  if (!content) return [];
  const doc = xml(content);
  const rows = [];
  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const values = [];
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      const index = columnIndex(cell.getAttribute('r') || 'A1');
      const type = cell.getAttribute('t');
      let value = '';
      if (type === 'inlineStr') value = textOf(cell, 't');
      else {
        const raw = cell.getElementsByTagName('v')[0]?.textContent || '';
        value = type === 's' ? strings[Number(raw)] ?? '' : raw;
      }
      values[index] = String(value).trim();
    }
    rows.push(values);
  }
  return rows;
}

function rowsToRecords(rows) {
  let best = null;
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 25); rowIndex += 1) {
    const headers = rows[rowIndex] || [];
    const rollIndex = findColumn(headers, [/(^|\b)(10th )?roll (no|number)( 2026)?(\b|$)/, /roll/]);
    if (rollIndex < 0) continue;
    const nameIndex = findColumn(headers, [/^name$/, /student name/, /candidate.*name/]);
    const fatherIndex = findColumn(headers, [/father.*name/, /^father$/]);
    const sectionIndex = findColumn(headers, [/section/, /teacher/]);
    const score = 10 + (nameIndex >= 0 ? 3 : 0) + (fatherIndex >= 0 ? 2 : 0) + (sectionIndex >= 0 ? 1 : 0);
    if (!best || score > best.score) best = { rowIndex, rollIndex, nameIndex, fatherIndex, sectionIndex, score };
  }
  if (!best) throw new Error('Roll No column was not found. Use a header such as “10th Roll No 2026”.');

  const records = [];
  for (const row of rows.slice(best.rowIndex + 1)) {
    const rollNo = String(row[best.rollIndex] ?? '').trim().replace(/\.0$/, '');
    if (!/^\d{4,}$/.test(rollNo)) continue;
    records.push({
      rollNo,
      name: best.nameIndex >= 0 ? String(row[best.nameIndex] ?? '').trim() : '',
      fatherName: best.fatherIndex >= 0 ? String(row[best.fatherIndex] ?? '').trim() : '',
      section: best.sectionIndex >= 0 ? String(row[best.sectionIndex] ?? '').trim() : '',
    });
  }
  if (!records.length) throw new Error('No roll numbers were found below the detected header.');
  return records;
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rowsToRecords(rows);
}

async function parseXlsx(file) {
  const entries = await unzipXlsx(await file.arrayBuffer());
  const strings = await sharedStrings(entries);
  const sheets = await workbookSheets(entries);
  let fallbackError;
  for (const sheet of sheets) {
    try {
      const rows = await parseSheet(entries, sheet, strings);
      const records = rowsToRecords(rows);
      return { records, sheetName: sheet.name };
    } catch (error) { fallbackError = error; }
  }
  throw fallbackError || new Error('No readable worksheet was found.');
}

async function saveState() {
  await chrome.storage.local.set({ gazetteRollFinderState: state, autoSearch: els.autoSearch.checked });
}

function render() {
  const hasRecords = state.records.length > 0;
  state.index = hasRecords ? Math.max(0, Math.min(state.index, state.records.length - 1)) : 0;
  const record = hasRecords ? state.records[state.index] : null;
  els.position.textContent = hasRecords ? `${state.index + 1} / ${state.records.length}` : '0 / 0';
  els.sectionBadge.textContent = record?.section || 'No section';
  els.rollNo.textContent = record?.rollNo || '—';
  els.studentName.textContent = record?.name || (hasRecords ? 'Name not supplied' : 'Upload the Excel file to begin');
  els.fatherName.textContent = record?.fatherName ? `Father: ${record.fatherName}` : 'Father name will appear here';
  els.fileMeta.textContent = hasRecords ? `${state.fileName}${state.sheetName ? ` · ${state.sheetName}` : ''} · ${state.records.length} students` : 'No list loaded';
  els.prevBtn.disabled = !hasRecords || state.index === 0;
  els.nextBtn.disabled = !hasRecords || state.index === state.records.length - 1;
  els.findBtn.disabled = !hasRecords;
  els.copyBtn.disabled = !hasRecords;
}

async function importFile(file) {
  setStatus('Reading the file…');
  try {
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const parsed = isCsv ? { records: parseCsv(await file.text()), sheetName: '' } : await parseXlsx(file);
    state = { records: parsed.records, index: 0, fileName: file.name, sheetName: parsed.sheetName };
    await saveState();
    render();
    setStatus(`${parsed.records.length} students loaded successfully.`, 'success');
  } catch (error) {
    setStatus(error?.message || String(error), 'error');
  } finally { els.fileInput.value = ''; }
}

async function copyCurrent(showMessage = true) {
  const record = state.records[state.index];
  if (!record) return;
  await navigator.clipboard.writeText(record.rollNo);
  if (showMessage) setStatus(`Copied roll ${record.rollNo}.`, 'success');
}

async function findCurrent() {
  const record = state.records[state.index];
  if (!record) return;
  els.findBtn.disabled = true;
  setStatus(`Searching roll ${record.rollNo} in the active PDF…`);
  const response = await chrome.runtime.sendMessage({ type: 'SEARCH_ROLL', rollNo: record.rollNo });
  els.findBtn.disabled = false;
  if (response?.ok) setStatus(`Roll ${record.rollNo} searched in ${response.tabTitle}.`, 'success');
  else setStatus(response?.error || 'Chrome could not search the active tab.', 'error');
}

async function move(delta) {
  const next = state.index + delta;
  if (next < 0 || next >= state.records.length) return;
  state.index = next;
  await saveState();
  render();
  if (els.autoSearch.checked) await findCurrent();
  else await copyCurrent(false);
}

els.fileInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) importFile(file);
});
els.prevBtn.addEventListener('click', () => move(-1));
els.nextBtn.addEventListener('click', () => move(1));
els.findBtn.addEventListener('click', findCurrent);
els.copyBtn.addEventListener('click', () => copyCurrent(true));
els.autoSearch.addEventListener('change', saveState);
document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight') move(1);
  if (event.key === 'ArrowLeft') move(-1);
  if (event.key === 'Enter') findCurrent();
});

(async function initialize() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) { render(); return; }
  const stored = await chrome.storage.local.get(['gazetteRollFinderState', 'autoSearch']);
  if (stored.gazetteRollFinderState) state = stored.gazetteRollFinderState;
  if (typeof stored.autoSearch === 'boolean') els.autoSearch.checked = stored.autoSearch;
  render();
  if (state.records.length) setStatus('Saved list restored. Open the gazette PDF and continue.', 'success');
})();
