const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let searchQueue = Promise.resolve();

async function enableSidePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

chrome.runtime.onInstalled.addListener(() => enableSidePanel().catch(() => {}));
chrome.runtime.onStartup.addListener(() => enableSidePanel().catch(() => {}));
enableSidePanel().catch(() => {});

async function key(tabId, type, options) {
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", { type, ...options });
}

async function openFindInActivePdf() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  if (!/^(https?|file):/i.test(tab.url || "")) {
    throw new Error("Open the gazette PDF in a normal Chrome tab first.");
  }

  const target = { tabId: tab.id };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await sleep(80);
    await key(tab.id, "keyDown", { key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 });
    await key(tab.id, "keyDown", { key: "f", code: "KeyF", windowsVirtualKeyCode: 70, modifiers: 2 });
    await key(tab.id, "keyUp", { key: "f", code: "KeyF", windowsVirtualKeyCode: 70, modifiers: 2 });
    await key(tab.id, "keyUp", { key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 });
    await sleep(120);
    return { ok: true, tabTitle: tab.title || "Gazette" };
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
  }
}

function queuedFind() {
  const task = searchQueue.catch(() => {}).then(openFindInActivePdf);
  searchQueue = task.catch(() => {});
  return task;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SEARCH_ROLL") return;
  queuedFind()
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
