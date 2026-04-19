# Persistent Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让扩展在批量处理过程中把成功项从待处理列表中移除，并持久化剩余待处理项与异常项，支持中断后继续。

**Architecture:** 抽离一个独立的队列状态模块，集中处理待处理/成功/异常三组状态的迁移规则，并由后台服务统一持久化到 `chrome.storage.local`。侧边栏仅消费后台状态并同步展示，不自行推导进度。

**Tech Stack:** Chrome Extension Manifest V3、原生 JavaScript、Node.js 内置 `node:test`

---

### Task 1: 队列状态模块

**Files:**
- Create: `D:/meta/xfgl-extension/lib/queue-state.js`
- Create: `D:/meta/xfgl-extension/tests/queue-state.test.js`

- [ ] Step 1: 写失败测试，覆盖新任务初始化、成功迁移、失败迁移、恢复统计
- [ ] Step 2: 运行 `node --test "D:/meta/xfgl-extension/tests/queue-state.test.js"`，确认失败
- [ ] Step 3: 实现最小队列状态模块
- [ ] Step 4: 再次运行同一测试，确认通过

### Task 2: 后台状态接入

**Files:**
- Modify: `D:/meta/xfgl-extension/background.js`

- [ ] Step 1: 用队列状态模块替换 `dataList/currentIndex` 的核心推进逻辑
- [ ] Step 2: 将状态持久化从 `chrome.storage.session` 改为 `chrome.storage.local`
- [ ] Step 3: 统一广播显式队列状态，保留现有日志与页面自动化流程

### Task 3: 侧边栏展示

**Files:**
- Modify: `D:/meta/xfgl-extension/sidepanel/sidepanel.html`
- Modify: `D:/meta/xfgl-extension/sidepanel/sidepanel.js`

- [ ] Step 1: 新增失败/无数据列表展示区域
- [ ] Step 2: 改为根据后台显式队列刷新文本框和统计
- [ ] Step 3: 处理恢复场景和“继续历史任务”入口文案

### Task 4: 验证

**Files:**
- Verify: `D:/meta/xfgl-extension/tests/queue-state.test.js`
- Verify: `D:/meta/xfgl-extension/background.js`
- Verify: `D:/meta/xfgl-extension/sidepanel/sidepanel.js`

- [ ] Step 1: 运行队列状态测试
- [ ] Step 2: 运行语法检查命令验证扩展脚本可解析
- [ ] Step 3: 复核需求与实现是否一致
