// sidepanel.js — 侧边栏交互逻辑

const logContainer = document.getElementById("logContainer");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const queryType = document.getElementById("queryType");
const dataInput = document.getElementById("dataInput");
const intervalInput = document.getElementById("intervalInput");
const printMode = document.getElementById("printMode");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const statusText = document.getElementById("statusText");
const statSuccess = document.getElementById("statSuccess");
const statFail = document.getElementById("statFail");
const statPending = document.getElementById("statPending");

let isRunning = false;

// 添加日志
function addLog(message, level = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry log-${level}`;
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  entry.textContent = `[${time}] ${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// 更新进度
function updateProgress(current, total, results = []) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  progressText.textContent = `${current} / ${total}`;

  const success = results.filter((r) => r.status === "成功").length;
  const fail = results.filter((r) => r.status !== "成功").length;
  const pending = total - current;

  statSuccess.textContent = success;
  statFail.textContent = fail;
  statPending.textContent = pending;

  if (current === 0) {
    statusText.textContent = "等待开始";
  } else if (current >= total) {
    statusText.textContent = "全部完成";
  } else {
    statusText.textContent = `处理中...`;
  }
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

  isRunning = true;
  btnStart.disabled = true;
  btnStop.disabled = false;
  dataInput.disabled = true;
  queryType.disabled = true;
  printMode.disabled = true;

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
      resetUI();
    } else {
      addLog("流程已启动", "ok");
    }
  } catch (err) {
    addLog(`启动失败: ${err.message}`, "error");
    resetUI();
  }
});

// 停止
btnStop.addEventListener("click", async () => {
  try {
    await chrome.runtime.sendMessage({ type: "STOP" });
    addLog("已发送停止指令", "warn");
    isRunning = false;
  } catch (err) {
    addLog(`停止失败: ${err.message}`, "error");
  }
});

// 重置UI
function resetUI() {
  btnStart.disabled = false;
  btnStop.disabled = true;
  dataInput.disabled = false;
  queryType.disabled = false;
  printMode.disabled = false;
  isRunning = false;
}

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "LOG_BROADCAST") {
    const { entry } = message;
    addLog(entry.message, entry.level);
  }

  if (message.type === "PROGRESS_UPDATE") {
    const { current, total, results } = message;
    updateProgress(current, total, results);
  }

  if (message.type === "RUN_STATE_CHANGED") {
    if (!message.isRunning) {
      resetUI();
      addLog("流程已结束", "ok");
    }
  }
});

// 初始化：获取当前状态
async function init() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    if (response.ok && response.state) {
      const {
        currentIndex,
        dataList,
        results,
        isRunning: running,
      } = response.state;
      if (running && dataList.length > 0) {
        updateProgress(currentIndex, dataList.length, results);
        addLog(`恢复进度: ${currentIndex}/${dataList.length}`, "warn");
        isRunning = true;
        btnStart.disabled = true;
        btnStop.disabled = false;
        dataInput.disabled = true;
        queryType.disabled = true;
        printMode.disabled = true;
      } else if (dataList.length > 0) {
        updateProgress(currentIndex, dataList.length, results);
      }
    }
  } catch (err) {
    // 忽略
  }
}

init();
