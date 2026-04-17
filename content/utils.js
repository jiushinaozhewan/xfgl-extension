// content/utils.js — Shared utilities for XFGL extension

const SCRIPT_SOURCE = "xfgl-query";
const LOG_PREFIX = `[XFGL:${SCRIPT_SOURCE}]`;
const STOP_ERROR_MESSAGE = "流程已被用户停止。";

let flowStopped = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "STOP_FLOW") {
    flowStopped = true;
    console.warn(LOG_PREFIX, STOP_ERROR_MESSAGE);
    return;
  }
  if (message.type === "PING") {
    sendResponse({ ok: true, source: SCRIPT_SOURCE });
  }
});

function resetStopState() {
  flowStopped = false;
}

function throwIfStopped() {
  if (flowStopped) throw new Error(STOP_ERROR_MESSAGE);
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    throwIfStopped();
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      if (flowStopped) {
        cleanup();
        reject(new Error(STOP_ERROR_MESSAGE));
        return;
      }
      const el = document.querySelector(selector);
      if (el) {
        cleanup();
        resolve(el);
      }
    });
    const cleanup = () => {
      observer.disconnect();
      clearTimeout(timer);
    };
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`等待元素 ${selector} 超时`));
    }, timeout);
  });
}

function waitForElementByText(containerSelector, textPattern, timeout = 10000) {
  return new Promise((resolve, reject) => {
    throwIfStopped();
    function search() {
      const candidates = document.querySelectorAll(containerSelector);
      for (const el of candidates) {
        if (textPattern.test(el.textContent)) return el;
      }
      return null;
    }
    const existing = search();
    if (existing) {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      if (flowStopped) {
        cleanup();
        reject(new Error(STOP_ERROR_MESSAGE));
        return;
      }
      const el = search();
      if (el) {
        cleanup();
        resolve(el);
      }
    });
    const cleanup = () => {
      observer.disconnect();
      clearTimeout(timer);
    };
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`等待文本 "${textPattern}" 超时`));
    }, timeout);
  });
}

function fillInput(el, value) {
  throwIfStopped();
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  nativeSetter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillSelect(el, value) {
  throwIfStopped();
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function log(message, level = "info") {
  chrome.runtime.sendMessage({
    type: "LOG",
    source: SCRIPT_SOURCE,
    step: null,
    payload: { message, level, timestamp: Date.now() },
  });
}

function reportComplete(step, data = {}) {
  console.log(LOG_PREFIX, `步骤 ${step} 已完成`, data);
  chrome.runtime.sendMessage({
    type: "STEP_COMPLETE",
    source: SCRIPT_SOURCE,
    step,
    payload: data,
  });
}

function reportError(step, errorMessage) {
  console.error(LOG_PREFIX, `步骤 ${step} 失败: ${errorMessage}`);
  chrome.runtime.sendMessage({
    type: "STEP_ERROR",
    source: SCRIPT_SOURCE,
    step,
    error: errorMessage,
  });
}

function reportReady() {
  chrome.runtime
    .sendMessage({ type: "CONTENT_SCRIPT_READY", source: SCRIPT_SOURCE })
    .catch(() => {});
}

function simulateClick(el) {
  throwIfStopped();
  if (!el) throw new Error("无法点击空元素");
  el.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });

  const eventNames = [
    "pointerover",
    "mouseover",
    "pointerenter",
    "mouseenter",
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
  ];

  for (const eventName of eventNames) {
    const EventCtor = eventName.startsWith("pointer")
      ? window.PointerEvent || window.MouseEvent
      : window.MouseEvent;
    el.dispatchEvent(
      new EventCtor(eventName, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
      }),
    );
  }

  if (typeof el.click === "function") {
    el.click();
  }
}

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function isElementVisible(el) {
  if (!el || !(el instanceof Element)) return false;
  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.pointerEvents === "none"
  ) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function collectButtonCandidates(root = document) {
  const selector = [
    "button",
    "[role='button']",
    ".el-button",
    "a",
    "span",
    "div",
  ].join(", ");
  return Array.from(root.querySelectorAll(selector));
}

function listVisibleButtonTexts(root = document, options = {}) {
  const { includeFrames = false, limit = 20 } = options;
  const roots = includeFrames ? getSearchableDocuments(root) : [root];
  const texts = [];
  const seen = new Set();

  for (const currentRoot of roots) {
    for (const candidate of collectButtonCandidates(currentRoot)) {
      const clickable =
        candidate.closest("button, [role='button'], .el-button, a") || candidate;
      if (!isElementVisible(clickable)) continue;

      const text = normalizeText(clickable.textContent);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      texts.push(text);

      if (texts.length >= limit) {
        return texts;
      }
    }
  }

  return texts;
}

function getSearchableDocuments(root = document) {
  const docs = [root];
  const frameEls = Array.from(root.querySelectorAll("iframe, frame"));

  for (const frameEl of frameEls) {
    try {
      const frameDoc =
        frameEl.contentDocument || frameEl.contentWindow?.document || null;
      if (frameDoc?.documentElement) {
        docs.push(...getSearchableDocuments(frameDoc));
      }
    } catch (_) {
      // 忽略跨域 frame
    }
  }

  return docs;
}

function findButtonByText(text, options = {}) {
  const { exact = true, root = document, includeFrames = false } = options;
  const expectedText = normalizeText(text);
  const matched = [];
  const seen = new Set();
  const roots = includeFrames ? getSearchableDocuments(root) : [root];

  for (const currentRoot of roots) {
    for (const candidate of collectButtonCandidates(currentRoot)) {
      const candidateText = normalizeText(candidate.textContent);
      const isMatch = exact
        ? candidateText === expectedText
        : candidateText.includes(expectedText);

      if (!isMatch) continue;

      const clickable =
        candidate.closest("button, [role='button'], .el-button, a") || candidate;
      if (!isElementVisible(clickable)) continue;

      const key = clickable;
      if (seen.has(key)) continue;
      seen.add(key);

      matched.push({
        element: clickable,
        text: candidateText,
        isExact: candidateText === expectedText,
        priority: clickable.tagName === "BUTTON" ? 2 : 1,
      });
    }
  }

  matched.sort((a, b) => {
    if (a.isExact !== b.isExact) return a.isExact ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return 0;
  });

  return matched[0]?.element || null;
}

async function clickButtonByText(text, options = {}) {
  const target = findButtonByText(text, options);
  if (!target) {
    throw new Error(`未找到按钮: ${text}`);
  }
  simulateClick(target);
  await sleep(options.afterClickDelay || 300);
  return target;
}

async function waitForButtonByText(text, options = {}) {
  const timeout = options.timeout || 10000;
  const interval = options.interval || 200;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    throwIfStopped();
    const target = findButtonByText(text, options);
    if (target) {
      return target;
    }
    await sleep(interval);
  }

  throw new Error(`等待按钮超时: ${text}`);
}

async function waitAndClickButtonByText(text, options = {}) {
  const target = await waitForButtonByText(text, options);
  simulateClick(target);
  await sleep(options.afterClickDelay || 300);
  return target;
}

function sleep(ms) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function tick() {
      if (flowStopped) {
        reject(new Error(STOP_ERROR_MESSAGE));
        return;
      }
      if (Date.now() - start >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, Math.min(100, ms - (Date.now() - start)));
    }
    tick();
  });
}

reportReady();
