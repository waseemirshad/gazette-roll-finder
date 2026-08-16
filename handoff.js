async function safeFindCurrent() {
  const record = state.records[state.index];
  if (!record) return;

  els.findBtn.disabled = true;
  try {
    await navigator.clipboard.writeText(record.rollNo);
    setStatus(`Roll ${record.rollNo} copied. Opening Chrome Find…`);
    const response = await chrome.runtime.sendMessage({ type: 'SEARCH_ROLL', rollNo: record.rollNo });
    if (response?.ok) {
      setStatus(`Chrome Find is open. Press Ctrl+V, then Enter to highlight roll ${record.rollNo}.`, 'success');
    } else {
      setStatus(response?.error || 'Chrome Find could not be opened.', 'error');
    }
  } catch (error) {
    setStatus(error?.message || String(error), 'error');
  } finally {
    render();
  }
}

findCurrent = safeFindCurrent;
els.findBtn.addEventListener('click', (event) => {
  event.stopImmediatePropagation();
  safeFindCurrent();
}, true);
