// sidepanel.js — 侧边栏交互逻辑

const logContainer = document.getElementById("logContainer");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const queryType = document.getElementById("queryType");
const dataInput = document.getElementById("dataInput");
const retryInput = document.getElementById("retryInput");
const intervalInput = document.getElementById("intervalInput");
const printMode = document.getElementById("printMode");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const statusText = document.getElementById("statusText");
const statSuccess = document.getElementById("statSuccess");
const statFail = document.getElementById("statFail");
const statPending = document.getElementById("statPending");

let isRunning = false;
let latestState = null;

// 添加日志
function addLog(message, level = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry log-${level}`;
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  entry.textContent = `[${time}] ${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

function getProgress(state = {}) {
  const success = Array.isArray(state.successItems) ? state.successItems.length : 0;
  const fail = Array.isArray(state.retryItems) ? state.retryItems.length : 0;
  const pending = Array.isArray(state.pendingItems) ? state.pendingItems.length : 0;
  const total = success + fail + pending;
  const done = success + fail;

  return { total, done, success, fail, pending };
}

function formatRetryItems(retryItems = []) {
  return retryItems
    .map((entry) => `${entry.item} ｜ ${entry.reason}`)
    .join("\n");
}

function setStartButtonText() {
  const hasPending = Array.isArray(latestState?.pendingItems) && latestState.pendingItems.length > 0;
  btnStart.textContent = !isRunning && hasPending ? "▶ 继续" : "▶ 开始";
}

function applyRunningState(running) {
  isRunning = running;
  btnStart.disabled = running;
  btnStop.disabled = !running;
  dataInput.disabled = running;
  queryType.disabled = running;
  printMode.disabled = running;
  intervalInput.disabled = running;
  setStartButtonText();
}

// 更新进度
function renderState(state = {}) {
  latestState = state;

  const progress = state.progress || getProgress(state);
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  progressText.textContent = `${progress.done} / ${progress.total}`;

  statSuccess.textContent = progress.success;
  statFail.textContent = progress.fail;
  statPending.textContent = progress.pending;

  dataInput.value = Array.isArray(state.pendingItems)
    ? state.pendingItems.join("\n")
    : "";
  retryInput.value = Array.isArray(state.retryItems)
    ? formatRetryItems(state.retryItems)
    : "";

  if (state.isRunning) {
    statusText.textContent = "处理中...";
  } else if (progress.total === 0) {
    statusText.textContent = "等待开始";
  } else if (progress.pending === 0) {
    statusText.textContent = "全部完成";
  } else {
    statusText.textContent = "已停止，可继续";
  }

  applyRunningState(Boolean(state.isRunning));
}

// 解析数据
function parseData(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// 开始
btnStart.addEventListener("click", async () => {
  const data = parseData(dataInput.value);
  if (data.length === 0) {
    addLog("请先粘贴数据", "warn");
    return;
  }

  applyRunningState(true);

  addLog(`开始处理 ${data.length} 条数据 (${queryType.value})`, "info");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "START",
      data: data,
      queryType: queryType.value,
      intervalMs: (parseInt(intervalInput.value) || 3) * 1000,
      printMode: printMode.value,
    });

    if (!response.ok) {
      addLog(`启动失败: ${response.error}`, "error");
      applyRunningState(false);
    } else {
      addLog("流程已启动", "ok");
    }
  } catch (err) {
    addLog(`启动失败: ${err.message}`, "error");
    applyRunningState(false);
  }
});

// 停止
btnStop.addEventListener("click", async () => {
  try {
    await chrome.runtime.sendMessage({ type: "STOP" });
    addLog("已发送停止指令", "warn");
  } catch (err) {
    addLog(`停止失败: ${err.message}`, "error");
  }
});

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "LOG_BROADCAST") {
    const { entry } = message;
    addLog(entry.message, entry.level);
  }

  if (message.type === "PROGRESS_UPDATE") {
    renderState(message.state || {});
  }

  if (message.type === "RUN_STATE_CHANGED") {
    if (message.state) {
      renderState(message.state);
    }
    if (!message.isRunning) {
      addLog("流程已结束", "ok");
    }
  }
});

// 初始化：获取当前状态
async function init() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    if (response.ok && response.state) {
      const state = response.state;
      queryType.value = state.queryType || queryType.value;
      printMode.value = state.printMode || printMode.value;
      intervalInput.value = String(
        Math.max(0, Math.round((state.intervalMs || 3000) / 1000)),
      );
      renderState(state);

      const progress = state.progress || getProgress(state);
      if (state.isRunning && progress.total > 0) {
        addLog(`恢复进度: ${progress.done}/${progress.total}`, "warn");
      } else if (progress.pending > 0) {
        addLog(`发现剩余 ${progress.pending} 条待处理数据，点击“继续”可恢复流程`, "warn");
      }
    }
  } catch (err) {
    // 忽略
  }
}

init();
