// background.js — XFGL 学分查询自动化扩展后台服务

const TARGET_URL =
  "http://xsgl.jyt.henan.gov.cn/xfgl/credit/newsubject/newsubjectBF";
const SITE_URL_PATTERN = "http://xsgl.jyt.henan.gov.cn/*";

// 状态管理
let state = {
  step: "idle",
  dataList: [],
  currentIndex: 0,
  queryType: "姓名",
  printMode: "kiosk",
  results: [],
  tabId: null,
  detailTabId: null,
  printTabId: null,
  isRunning: false,
  isPaused: false,
  intervalMs: 3000, // 循环间隔（毫秒）
};

// 日志
const logs = [];
function addLog(message, level = "info") {
  const entry = { message, level, timestamp: Date.now() };
  logs.push(entry);
  if (logs.length > 500) logs.shift();
  broadcastLog(entry);
}

function broadcastLog(entry) {
  chrome.runtime.sendMessage({ type: "LOG_BROADCAST", entry }).catch(() => {});
}

function broadcastProgress() {
  chrome.runtime
    .sendMessage({
      type: "PROGRESS_UPDATE",
      current: state.currentIndex,
      total: state.dataList.length,
      results: state.results,
    })
    .catch(() => {});
}

// 查找或创建查询页标签
async function getOrCreateTab() {
  const tabs = await chrome.tabs.query({ url: TARGET_URL + "*" });
  if (tabs.length > 0) {
    return tabs[0];
  }
  return chrome.tabs.create({ url: TARGET_URL, active: true });
}

async function listWorkflowTabs() {
  return chrome.tabs.query({ url: SITE_URL_PATTERN });
}

async function listAllTabs() {
  return chrome.tabs.query({});
}

async function snapshotWorkflowTabIds() {
  const tabs = await listWorkflowTabs();
  return new Set(
    tabs.map((tab) => tab.id).filter((tabId) => Number.isInteger(tabId)),
  );
}

async function snapshotAllTabIds() {
  const tabs = await listAllTabs();
  return new Set(
    tabs.map((tab) => tab.id).filter((tabId) => Number.isInteger(tabId)),
  );
}

// 发送消息到 content script
async function sendToContent(type, data = {}, tabId = state.tabId) {
  if (!tabId) throw new Error("无活动标签页");
  const timeoutMs = data.timeoutMs || 15000;

  const response = await Promise.race([
    chrome.tabs.sendMessage(tabId, { type, ...data }),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`消息超时: ${type} (tab ${tabId})`));
      }, timeoutMs);
    }),
  ]);

  if (response?.ok === false) {
    throw new Error(response.error || `内容脚本执行失败: ${type}`);
  }

  return response;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 等待 content script 就绪
async function waitForContentScript(tabId = state.tabId) {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      if (res?.ok) {
        addLog(`内容脚本已就绪 (tab ${tabId})`);
        return true;
      }
    } catch (_) {}
    await sleep(1000);
  }
  addLog(`内容脚本未响应，继续执行 (tab ${tabId})`, "warn");
  return false;
}

async function waitForNewWorkflowTab(beforeIds, options = {}) {
  const { timeout = 8000, excludeIds = [] } = options;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const tabs = await listWorkflowTabs();
    const candidates = tabs
      .filter((tab) => Number.isInteger(tab.id))
      .filter((tab) => !beforeIds.has(tab.id))
      .filter((tab) => !excludeIds.includes(tab.id));

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (Boolean(a.active) !== Boolean(b.active)) {
          return a.active ? -1 : 1;
        }
        return (b.id || 0) - (a.id || 0);
      });
      return candidates[0];
    }

    await sleep(300);
  }

  return null;
}

async function waitForNewTab(beforeIds, options = {}) {
  const { timeout = 8000, excludeIds = [], preferredOpenerTabId = null } = options;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const tabs = await listAllTabs();
    const candidates = tabs
      .filter((tab) => Number.isInteger(tab.id))
      .filter((tab) => !beforeIds.has(tab.id))
      .filter((tab) => !excludeIds.includes(tab.id));

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const aScore =
          (preferredOpenerTabId && a.openerTabId === preferredOpenerTabId ? 4 : 0) +
          (a.active ? 2 : 0) +
          ((a.url || "").startsWith("http://xsgl.jyt.henan.gov.cn/") ? 1 : 0);
        const bScore =
          (preferredOpenerTabId && b.openerTabId === preferredOpenerTabId ? 4 : 0) +
          (b.active ? 2 : 0) +
          ((b.url || "").startsWith("http://xsgl.jyt.henan.gov.cn/") ? 1 : 0);

        if (aScore !== bScore) return bScore - aScore;
        return (b.id || 0) - (a.id || 0);
      });
      return candidates[0];
    }

    await sleep(300);
  }

  return null;
}

async function focusTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch (_) {}
}

async function closeTabIfNeeded(tabId, keepIds = []) {
  if (!tabId || keepIds.includes(tabId)) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch (_) {}
}

async function cleanupTransientTabs() {
  const keepIds = [state.tabId].filter(Boolean);

  if (state.printTabId && state.printTabId !== state.detailTabId) {
    await closeTabIfNeeded(state.printTabId, keepIds);
  }

  await closeTabIfNeeded(state.detailTabId, keepIds);

  state.detailTabId = null;
  state.printTabId = null;

  await focusTab(state.tabId);

  try {
    await sendToContent("CLOSE_DETAIL_AND_RETURN");
  } catch (_) {}
}

// 主流程：处理单条数据
async function processOneItem(item) {
  addLog(`[${state.currentIndex + 1}/${state.dataList.length}] 查询: ${item}`);

  try {
    state.detailTabId = null;
    state.printTabId = null;

    // Step 1: 填查询选项并点确定
    await sendToContent("FILL_QUERY", {
      queryType: state.queryType,
      value: item,
    });
    addLog("已填写查询条件，等待结果...");

    // Step 2: 等待查询结果
    const result = await sendToContent("WAIT_RESULT", { timeout: 15000 });
    await sleep(500);

    if (!result.hasData) {
      addLog(`❌ 无数据: ${item}`, "warn");
      state.results.push({ item, status: "无数据" });
      return false;
    }

    addLog("✅ 找到数据，点击查看...");

    // Step 3: 点击查看
    const tabsBeforeView = await snapshotWorkflowTabIds();
    await sendToContent("CLICK_VIEW");
    await sleep(800);

    // Step 4: 检测是否成功进入详情页
    const checkResult = await sendToContent("CHECK_DIALOG");
    if (checkResult.hasDialog) {
      addLog(`❌ 无数据: ${item}`, "warn");
      state.results.push({ item, status: "无数据" });
      await sendToContent("CLOSE_DIALOG");
      return false;
    }

    const detailTab = await waitForNewWorkflowTab(tabsBeforeView, {
      timeout: 5000,
      excludeIds: [state.tabId],
    });
    if (detailTab?.id) {
      state.detailTabId = detailTab.id;
      addLog(`已检测到详情页标签: ${detailTab.id}`);
      await waitForContentScript(detailTab.id);
      await focusTab(detailTab.id);
    } else {
      addLog("详情页未新开标签，继续在当前页面处理");
    }

    const detailTargetTabId = state.detailTabId || state.tabId;

    // Step 5: 点击打印
    addLog("📋 进入详情页，点击“点击打印”...");
    await sendToContent(
      "CLICK_PRINT",
      { timeoutMs: 3000 },
      detailTargetTabId,
    );
    await sleep(1000);

    if (state.printMode === "kiosk") {
      addLog(
        "已触发打印。若浏览器使用 --kiosk-printing 启动，将自动确认最终打印。",
        "ok",
      );
      await sleep(1500);
    } else {
      addLog(
        "最终“打印”按钮位于 Chrome 打印预览（cr-button.action-button），扩展无法自动点击，请手动确认打印。",
        "warn",
      );
      await sleep(3000);
    }

    // Step 6: 关闭详情页/打印页，返回查询页
    addLog("🔙 关闭详情页，返回查询页...");
    await cleanupTransientTabs();
    await sleep(state.intervalMs);

    state.results.push({ item, status: "成功" });
    addLog(`✅ 完成: ${item}`, "ok");
    return true;
  } catch (err) {
    addLog(`处理失败: ${err.message}`, "error");
    state.results.push({ item, status: "失败: " + err.message });
    return false;
  }
}

// 主循环
async function runLoop() {
  if (!state.isRunning || state.isPaused) return;

  while (
    state.currentIndex < state.dataList.length &&
    state.isRunning &&
    !state.isPaused
  ) {
    const item = state.dataList[state.currentIndex];
    await processOneItem(item);
    state.currentIndex++;

    await chrome.storage.session.set({ state });
    broadcastProgress();
  }

  if (state.currentIndex >= state.dataList.length) {
    addLog(`🎉 全部完成！共处理 ${state.dataList.length} 条数据`, "ok");
    state.isRunning = false;
    state.step = "done";
    broadcastProgress();
    chrome.runtime
      .sendMessage({ type: "RUN_STATE_CHANGED", isRunning: false })
      .catch(() => {});
  }
}

// 消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "START":
      if (state.isRunning) {
        sendResponse({ ok: false, error: "流程已在运行中" });
        return;
      }
      if (!message.data || message.data.length === 0) {
        sendResponse({ ok: false, error: "请先粘贴数据" });
        return;
      }
      state.dataList = message.data;
      state.currentIndex = 0;
      state.queryType = message.queryType || "姓名";
      state.printMode = message.printMode || "kiosk";
      state.intervalMs = message.intervalMs || 3000;
      state.isRunning = true;
      state.isPaused = false;
      state.results = [];
      state.detailTabId = null;
      state.printTabId = null;
      state.step = "running";
      addLog(
        `开始处理 ${state.dataList.length} 条数据 (${state.queryType}，打印方式: ${state.printMode})`,
      );
      chrome.storage.session.set({ state });

      getOrCreateTab()
        .then(async (tab) => {
          state.tabId = tab.id;
          addLog(`已获取查询页标签 ID: ${tab.id}`);
          await waitForContentScript(tab.id);
          runLoop();
        })
        .catch((err) => {
          addLog(`启动失败: ${err.message}`, "error");
          state.isRunning = false;
        });

      sendResponse({ ok: true });
      break;

    case "STOP":
      state.isRunning = false;
      addLog("用户停止流程");
      chrome.storage.session.set({ state });
      sendResponse({ ok: true });
      break;

    case "PAUSE":
      state.isPaused = true;
      addLog("流程已暂停");
      sendResponse({ ok: true });
      break;

    case "RESUME":
      state.isPaused = false;
      addLog("流程继续");
      runLoop();
      sendResponse({ ok: true });
      break;

    case "GET_STATE":
      sendResponse({ ok: true, state, logs: logs.slice(-50) });
      break;

    case "GET_LOGS":
      sendResponse({ ok: true, logs });
      break;

    case "CONTENT_SCRIPT_READY":
      if (sender.tab?.url?.startsWith(TARGET_URL)) {
        state.tabId = sender.tab.id;
      }
      sendResponse({ ok: true });
      break;

    case "LOG":
    case "STEP_COMPLETE":
    case "STEP_ERROR":
      addLog(
        `[${message.source || "system"}] ${message.payload?.message || message.step || ""}`,
        message.payload?.level || "info",
      );
      sendResponse({ ok: true });
      break;

    case "PING":
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ ok: false, error: "未知消息类型" });
  }
});

// 初始化时恢复状态
chrome.runtime.onStartup.addListener(async () => {
  const saved = await chrome.storage.session.get("state");
  if (saved.state) {
    state = { ...state, ...saved.state, isRunning: false };
  }
});

chrome.runtime.onInstalled.addListener(() => {
  addLog("扩展已安装");
});
