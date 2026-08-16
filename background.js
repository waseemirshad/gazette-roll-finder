const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let searchQueue = Promise.resolve();

async function enableSidePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

chrome.runtime.onInstalled.addListener(() => enableSidePanel().catch(() => {}));
chrome.runtime.onStartup.addListener(() => enableSidePanel().catch(() => {}));
enableSidePanel().catch(() => {});

async function key(tabId, type, options) {
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
    type,
    ...options,
  });
}

async function searchActiveTab(rollNo) {
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
    await sleep(100);
    await chrome.debugger.sendCommand(target, "Page.bringToFront");
    await key(tab.id, "keyDown", { key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 });
    await key(tab.id, "keyDown", { key: "f", code: "KeyF", windowsVirtualKeyCode: 70, modifiers: 2 });
    await key(tab.id, "keyUp", { key: "f", code: "KeyF", windowsVirtualKeyCode: 70, modifiers: 2 });
    await key(tab.id, "keyUp", { key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 });
    await sleep(180);
    await key(tab.id, "keyDown", { key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await key(tab.id, "keyUp", { key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await chrome.debugger.sendCommand(target, "Input.insertText", { text: String(rollNo) });
    await sleep(100);
    await key(tab.id, "keyDown", { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await key(tab.id, "keyUp", { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await sleep(160);
    await key(tab.id, "keyDown", { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await key(tab.id, "keyUp", { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    return { ok: true, tabTitle: tab.title || "Gazette" };
  } catch (error) {
    const message = error?.message || String(error);
    if (/already attached|not attached/i.test(message)) {
      throw new Error("Automatic search was busy. Reload the extension once, then try Next again.");
    }
    throw error;
  } finally {
    if (attached) {
      await sleep(150);
      await chrome.debugger.detach(target).catch(() => {});
    }
  }
}

function queuedSearch(rollNo) {
  const task = searchQueue.catch(() => {}).then(() => searchActiveTab(rollNo));
  searchQueue = task.catch(() => {});
  return task;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SEARCH_ROLL") return;
  queuedSearch(message.rollNo)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
