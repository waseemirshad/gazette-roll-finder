const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  let attachedHere = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attachedHere = true;
  } catch (error) {
    if (!String(error?.message || error).includes("already attached")) throw error;
  }

  try {
    await chrome.debugger.sendCommand(target, "Page.bringToFront");
    await key(tab.id, "keyDown", { key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 });
    await key(tab.id, "keyDown", { key: "f", code: "KeyF", windowsVirtualKeyCode: 70, modifiers: 2 });
    await key(tab.id, "keyUp", { key: "f", code: "KeyF", windowsVirtualKeyCode: 70, modifiers: 2 });
    await key(tab.id, "keyUp", { key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 });
    await sleep(160);
    await key(tab.id, "keyDown", { key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await key(tab.id, "keyUp", { key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await chrome.debugger.sendCommand(target, "Input.insertText", { text: String(rollNo) });
    await sleep(80);
    await key(tab.id, "keyDown", { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await key(tab.id, "keyUp", { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await sleep(140);
    await key(tab.id, "keyDown", { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await key(tab.id, "keyUp", { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    return { ok: true, tabTitle: tab.title || "Gazette" };
  } finally {
    if (attachedHere) {
      await sleep(120);
      await chrome.debugger.detach(target).catch(() => {});
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SEARCH_ROLL") return;
  searchActiveTab(message.rollNo)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
