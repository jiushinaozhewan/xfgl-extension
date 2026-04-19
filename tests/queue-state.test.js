const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createQueueState,
  markCurrentItemSuccess,
  markCurrentItemRetry,
  getQueueProgress,
} = require("../lib/queue-state.js");

test("createQueueState 初始化待处理列表并过滤空行", () => {
  const state = createQueueState(["张三", " ", "", "李四"]);

  assert.deepEqual(state.pendingItems, ["张三", "李四"]);
  assert.deepEqual(state.successItems, []);
  assert.deepEqual(state.retryItems, []);
});

test("markCurrentItemSuccess 会移除当前项并追加到成功列表", () => {
  const nextState = markCurrentItemSuccess(
    createQueueState(["张三", "李四", "王五"]),
  );

  assert.deepEqual(nextState.pendingItems, ["李四", "王五"]);
  assert.deepEqual(nextState.successItems, ["张三"]);
  assert.deepEqual(nextState.retryItems, []);
});

test("markCurrentItemRetry 会移除当前项并追加到异常列表", () => {
  const nextState = markCurrentItemRetry(
    createQueueState(["张三", "李四"]),
    "无数据",
  );

  assert.deepEqual(nextState.pendingItems, ["李四"]);
  assert.deepEqual(nextState.successItems, []);
  assert.equal(nextState.retryItems.length, 1);
  assert.equal(nextState.retryItems[0].item, "张三");
  assert.equal(nextState.retryItems[0].reason, "无数据");
});

test("getQueueProgress 基于三组显式队列返回统计数据", () => {
  const progress = getQueueProgress({
    pendingItems: ["王五"],
    successItems: ["张三", "李四"],
    retryItems: [{ item: "赵六", reason: "失败" }],
  });

  assert.deepEqual(progress, {
    total: 4,
    done: 3,
    success: 2,
    fail: 1,
    pending: 1,
  });
});
