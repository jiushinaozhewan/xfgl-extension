// content/query-page.js — 查询页面逻辑

/**
 * 填充查询选项
 * @param {string} queryType - 查询类型: '姓名' | '学生标识码' | '身份证件号'
 * @param {string} value - 要查询的值
 */
async function fillQueryOption(queryType, value) {
  log(`开始填充查询选项: ${queryType} = ${value}`);

  // 1. 点击查询类型下拉框打开选项
  const typeDropdown = await waitForElement(
    'input[readonly][placeholder="姓名"]',
  );
  await simulateClick(typeDropdown);
  await sleep(300);

  // 2. 选择对应类型
  const option = await waitForElementByText(
    ".el-select-dropdown__item > span",
    new RegExp(`^${queryType}$`),
  );
  await simulateClick(option);
  await sleep(200);

  // 3. 填写查询内容
  const valueInput = await waitForElement(
    'input[name="key"][placeholder="请输入内容"]',
  );
  await fillInput(valueInput, value);
  await sleep(100);

  log(`已填写: ${queryType} = ${value}`);
}

/**
 * 点击确定按钮
 */
async function clickConfirm() {
  log("[DEBUG] 准备点击确定按钮");

  const queryInput = document.querySelector(
    'input[name="key"][placeholder="请输入内容"]',
  );

  const preferredRoot =
    queryInput?.closest("form, .el-form, .el-card, .app-container") || document;

  try {
    await clickButtonByText("确定", {
      exact: true,
      root: preferredRoot,
      afterClickDelay: 500,
    });
    log("已点击确定按钮");
    return;
  } catch (error) {
    if (preferredRoot !== document) {
      await clickButtonByText("确定", {
        exact: true,
        root: document,
        afterClickDelay: 500,
      });
      log("已点击确定按钮");
      return;
    }
    throw error;
  }
}

/**
 * 等待查询结果加载
 * @param {number} timeout - 超时时间(毫秒)
 * @returns {Promise<{hasData: boolean}>}
 */
async function waitForQueryResult(timeout = 15000) {
  return new Promise((resolve, reject) => {
    // 检查表格是否有数据行
    const checkData = () => {
      // 查找表格中的数据行（包含td元素的tr）
      const rows = document.querySelectorAll("table tr");
      for (const row of rows) {
        if (row.querySelector("td")) {
          return true;
        }
      }
      return false;
    };

    if (checkData()) {
      resolve({ hasData: true });
      return;
    }

    const observer = new MutationObserver(() => {
      if (flowStopped) {
        cleanup();
        reject(new Error(STOP_ERROR_MESSAGE));
        return;
      }
      if (checkData()) {
        cleanup();
        resolve({ hasData: true });
        return;
      }
      // 也检查是否显示"暂无数据"
      if (document.body.textContent.includes("暂无数据")) {
        cleanup();
        resolve({ hasData: false });
        return;
      }
    });

    const cleanup = () => {
      observer.disconnect();
      clearTimeout(timer);
    };
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      cleanup();
      resolve({ hasData: false });
    }, timeout);
  });
}

/**
 * 点击第一条结果行的查看按钮
 */
async function clickFirstRowView() {
  // 1. 查找包含 td 的数据行（排除表头）
  const rows = document.querySelectorAll("table tr");
  let dataRow = null;
  for (const row of rows) {
    if (row.querySelector("td")) {
      dataRow = row;
      break;
    }
  }
  if (!dataRow) throw new Error("未找到数据行");

  // 2. 先点击行以选中学生
  dataRow.click();
  await sleep(300);
  log("已选中数据行");

  // 3. 查找面板中的查看按钮并点击
  await clickButtonByText("查看", {
    exact: false,
    root: document,
    afterClickDelay: 600,
  });
  log("已点击查看按钮");
}

/**
 * 检查是否有弹窗提示"请选择一条数据"
 */
async function checkNoDataDialog() {
  const dialog = document.querySelector(".el-message-box");
  if (dialog && dialog.textContent.includes("请选择一条")) {
    return true;
  }
  return false;
}

/**
 * 关闭弹窗
 */
async function closeDialog() {
  const closeBtn = document.querySelector(
    '.el-message-box__close, .el-dialog__close, [aria-label="关闭"]',
  );
  if (closeBtn) {
    simulateClick(closeBtn);
    await sleep(300);
  }
}

function getPrintDialogRoot() {
  const candidates = Array.from(
    document.querySelectorAll(
      ".el-dialog, .el-dialog__wrapper, .el-message-box, [role='dialog']",
    ),
  ).filter((el) => isElementVisible(el));

  const matched = candidates.filter((el) => {
    const text = normalizeText(el.textContent);
    return text.includes("打印");
  });

  return matched.at(-1) || null;
}

async function triggerClickPrint() {
  await clickButtonByText("点击打印", {
    exact: true,
    root: document,
    includeFrames: true,
    afterClickDelay: 200,
  });
  log("已点击“点击打印”按钮");
}

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CLICK_PRINT") {
    sendResponse({ ok: true });

    setTimeout(() => {
      void triggerClickPrint().catch((err) => {
        console.error(LOG_PREFIX, "执行 CLICK_PRINT 失败:", err);
        log(`执行“点击打印”失败: ${err.message}`, "error");
      });
    }, 0);

    return true;
  }

  void (async () => {
    try {
      switch (message.type) {
        case "FILL_QUERY":
          await fillQueryOption(message.queryType, message.value);
          await clickConfirm();
          sendResponse({ ok: true });
          break;

        case "WAIT_RESULT":
          try {
            const result = await waitForQueryResult(message.timeout || 15000);
            sendResponse({ ok: true, ...result });
          } catch (e) {
            if (e.message.includes("超时")) {
              sendResponse({ ok: true, hasData: false });
            } else {
              throw e;
            }
          }
          break;

        case "CLICK_VIEW":
          await clickFirstRowView();
          sendResponse({ ok: true });
          break;

        case "CONFIRM_PRINT_PAGE":
          try {
            const dialogRoot = getPrintDialogRoot();
            let clicked = false;

            if (dialogRoot) {
              try {
                await waitAndClickButtonByText("打印", {
                  exact: true,
                  root: dialogRoot,
                  includeFrames: true,
                  timeout: 4000,
                  afterClickDelay: 800,
                });
                clicked = true;
                log("已在打印弹窗中点击“打印”按钮");
              } catch (_) {
                // 回退到整页继续查找
              }
            }

            if (!clicked) {
              await waitAndClickButtonByText("打印", {
                exact: true,
                root: document,
                includeFrames: true,
                timeout: 8000,
                afterClickDelay: 800,
              });
              log("已点击打印页中的“打印”按钮");
            }
          } catch (error) {
            const dialogRoot = getPrintDialogRoot();
            const dialogButtons = dialogRoot
              ? listVisibleButtonTexts(dialogRoot, { includeFrames: true }).join(" | ")
              : "无打印弹窗";
            const pageButtons = listVisibleButtonTexts(document, {
              includeFrames: true,
            }).join(" | ");

            log(`打印弹窗按钮: ${dialogButtons || "无"}`, "warn");
            log(`当前页可见按钮: ${pageButtons || "无"}`, "warn");
            throw new Error(`未找到“打印”按钮: ${error.message}`);
          }
          sendResponse({ ok: true });
          break;

        case "CLOSE_DIALOG":
          await closeDialog();
          sendResponse({ ok: true });
          break;

        case "CLOSE_DETAIL_AND_RETURN":
          // 关闭详情页弹窗
          await closeDialog();
          await sleep(500);
          sendResponse({ ok: true });
          break;

        case "CHECK_DIALOG":
          const hasDialog = await checkNoDataDialog();
          sendResponse({ ok: true, hasDialog });
          break;

        case "PING":
          sendResponse({ ok: true, source: SCRIPT_SOURCE });
          break;

        default:
          sendResponse({ ok: false, error: "未知消息类型: " + message.type });
      }
    } catch (err) {
      console.error(LOG_PREFIX, "处理消息失败:", err);
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true;
});
