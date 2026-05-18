(function initOutputModeModule(globalScope) {
  function normalizeOutputMode(value) {
    return value === "save-local" ? "save-local" : "direct";
  }

  function sanitizeFileName(value, fallback = "未命名") {
    const normalizedFallback = String(fallback || "").trim() || "未命名";
    const cleaned = String(value || "")
      .trim()
      .replace(/[<>:"/\\|?*]/g, "_");

    return cleaned || normalizedFallback;
  }

  const api = {
    normalizeOutputMode,
    sanitizeFileName,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.OutputMode = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
