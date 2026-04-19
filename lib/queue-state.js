(function (global) {
  function normalizeItems(items) {
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
  }

  function normalizeRetryItems(retryItems) {
    if (!Array.isArray(retryItems)) return [];

    return retryItems
      .map((entry) => {
        const item = String(entry?.item ?? "").trim();
        const reason = String(entry?.reason ?? "失败").trim() || "失败";
        if (!item) return null;

        return { item, reason };
      })
      .filter(Boolean);
  }

  function normalizeQueueState(state = {}) {
    return {
      ...state,
      pendingItems: normalizeItems(state.pendingItems),
      successItems: normalizeItems(state.successItems),
      retryItems: normalizeRetryItems(state.retryItems),
    };
  }

  function createQueueState(items) {
    return {
      pendingItems: normalizeItems(items),
      successItems: [],
      retryItems: [],
    };
  }

  function getCurrentItem(state) {
    const normalizedState = normalizeQueueState(state);
    return normalizedState.pendingItems[0] || null;
  }

  function markCurrentItemSuccess(state) {
    const normalizedState = normalizeQueueState(state);
    const [currentItem, ...restPendingItems] = normalizedState.pendingItems;

    if (!currentItem) return normalizedState;

    return {
      ...normalizedState,
      pendingItems: restPendingItems,
      successItems: [...normalizedState.successItems, currentItem],
    };
  }

  function markCurrentItemRetry(state, reason = "失败") {
    const normalizedState = normalizeQueueState(state);
    const [currentItem, ...restPendingItems] = normalizedState.pendingItems;

    if (!currentItem) return normalizedState;

    return {
      ...normalizedState,
      pendingItems: restPendingItems,
      retryItems: [
        ...normalizedState.retryItems,
        { item: currentItem, reason: String(reason || "失败") },
      ],
    };
  }

  function getQueueProgress(state) {
    const normalizedState = normalizeQueueState(state);
    const success = normalizedState.successItems.length;
    const fail = normalizedState.retryItems.length;
    const pending = normalizedState.pendingItems.length;

    return {
      total: success + fail + pending,
      done: success + fail,
      success,
      fail,
      pending,
    };
  }

  const api = {
    createQueueState,
    getCurrentItem,
    getQueueProgress,
    markCurrentItemRetry,
    markCurrentItemSuccess,
    normalizeItems,
    normalizeQueueState,
    normalizeRetryItems,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.QueueState = api;
})(globalThis);
