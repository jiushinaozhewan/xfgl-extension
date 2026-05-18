# 学分查询自动化扩展

一个基于 Chrome Manifest V3 的浏览器扩展，用于在河南省学生管理相关页面中批量查询学生学分信息，并按流程打开详情页与打印页。

当前版本：`1.0.0`

## 功能概览

- 支持批量导入查询数据，每行一条
- 支持按 `姓名`、`学生标识码`、`身份证件号` 三种方式查询
- 自动完成查询、结果判断、进入详情页、触发打印流程
- 提供侧边栏控制面板，显示日志、进度、成功/失败统计
- 支持两种打印模式：
  - `自动打印`：需要浏览器以 `--kiosk-printing` 启动
  - `手动确认`：扩展只负责点到“点击打印”，最终打印需人工确认
- 支持两种输出方式：
  - `直接出表`：保持当前打印流程不变
  - `本地保存`：使用当前查询值自动填写系统保存框文件名并点击保存

## 适用场景

适用于需要在 `http://xsgl.jyt.henan.gov.cn/` 相关页面上，按固定列表批量查询学生学分并逐条打印结果的场景。

## 运行要求

- Windows 环境
- Chrome 或基于 Chromium 的浏览器
- 能访问目标业务系统：`http://xsgl.jyt.henan.gov.cn/`

## 项目结构

```text
xfgl-extension/
├─ manifest.json              # 扩展清单
├─ background.js              # 后台流程编排与状态管理
├─ content/
│  ├─ utils.js                # 页面操作与通用 DOM 工具
│  └─ query-page.js           # 查询页自动化逻辑
├─ sidepanel/
│  ├─ sidepanel.html          # 侧边栏界面
│  └─ sidepanel.js            # 侧边栏交互逻辑
├─ native/
│  ├─ XfglSaveDialogHost.cs   # 原生保存辅助程序源码
│  ├─ build-native-host.ps1   # 编译原生辅助程序
│  └─ install-native-host.ps1 # 注册 Native Messaging Host
├─ icons/                     # 扩展图标
└─ readme.txt                 # 原始简要使用说明
```

## 安装方式

### 方式一：开发者模式加载扩展

1. 打开 Chrome 扩展管理页：`chrome://extensions/`
2. 开启右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择当前项目目录：`D:/meta/xfgl-extension`

### 方式二：命令行启动浏览器并加载扩展

适用于需要自动打印的场景，示例命令如下：

```powershell
& "C:/Program Files/Google/Chrome/Application/chrome.exe" `
  --user-data-dir="D:/meta/chrome-kiosk-profile" `
  --load-extension="D:/meta/xfgl-extension" `
  --kiosk-printing
```

参数说明：

- `--user-data-dir`：使用独立浏览器配置目录，避免污染日常环境
- `--load-extension`：加载当前扩展目录
- `--kiosk-printing`：启用静默打印，减少人工确认

## 使用流程

1. 打开目标网站的学分查询页面
2. 打开扩展侧边栏
3. 选择查询类型：
   - `姓名`
   - `学生标识码`
   - `身份证件号`
4. 设置循环间隔（秒）
5. 选择打印方式
6. 选择输出方式
7. 粘贴待查询数据，每行一条
8. 点击“开始”
9. 观察侧边栏中的日志、进度和统计结果

## 打印模式说明

### 自动打印

- 推荐在批量处理时使用
- 依赖浏览器启动参数 `--kiosk-printing`
- 扩展会自动触发打印流程

### 手动确认

- 扩展会自动点击详情页中的“点击打印”
- Chrome 打印预览中的最终“打印”按钮不在普通页面 DOM 权限范围内
- 因此最终确认打印仍需人工操作

## 输出方式说明

### 直接出表

- 保持现有打印流程
- 不改变当前自动打印或手动确认的行为

### 本地保存

- 需要先安装 `native/install-native-host.ps1` 注册本机辅助程序
- 点击“点击打印”后，扩展会调用 Native Messaging Host
- Host 会在系统“将打印输出另存为”窗口中自动填写当前查询值并点击“保存”
- 文件名取当前查询值，例如姓名、身份证件号或学生标识码
- 保存目录保持浏览器或系统当前默认目录不变
- 安装完成后，无需再手动确认保存

## 权限说明

扩展在 `manifest.json` 中申请了以下能力：

- `sidePanel`：展示操作侧边栏
- `tabs`：管理查询页、详情页和打印页标签
- `storage`：保存运行状态
- `scripting`、`activeTab`：执行页面交互
- `nativeMessaging`：调用本机保存辅助程序
- `host_permissions`：访问 `http://xsgl.jyt.henan.gov.cn/*`

## 已实现的流程能力

- 自动检测或创建查询页标签
- 自动填写查询条件并点击“确定”
- 自动等待结果表格出现
- 自动判断“有数据 / 无数据”
- 自动点击“查看”
- 自动识别详情页标签
- 自动触发“点击打印”
- 自动记录结果并汇总成功、失败、待处理数量

## 本地保存安装

1. 确保扩展已通过以下命令加载到专用 Chrome 配置目录：

```powershell
& "C:/Program Files/Google/Chrome/Application/chrome.exe" `
  --user-data-dir="D:/meta/chrome-kiosk-profile" `
  --load-extension="D:/meta/xfgl-extension" `
  --kiosk-printing
```

2. 在 PowerShell 中执行安装脚本：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& "D:/meta/xfgl-extension/native/install-native-host.ps1"
```

默认会从 `D:/meta/chrome-kiosk-profile/Default/Local Extension Settings` 自动识别当前扩展 ID。

如果自动识别失败，也可以手动指定：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& "D:/meta/xfgl-extension/native/install-native-host.ps1" `
  -ExtensionId "<你的扩展 ID>" `
  -ChromeProfilePath "D:/meta/chrome-kiosk-profile/Default"
```

3. 安装脚本会自动：
   - 编译 `native/XfglSaveDialogHost.exe`（若尚未生成）
   - 生成 `native/com.xfgl.save_dialog.json`
   - 写入 Chrome / Edge 的 Native Messaging Host 注册表
4. 回到 `chrome://extensions/`，对当前扩展点一次“重新加载”
5. 重新使用同一组 `--user-data-dir` + `--load-extension` + `--kiosk-printing` 参数启动 Chrome

## 本地保存排错

- 报错 `Access to the specified native messaging host is forbidden`
  说明 Native Host 的 `allowed_origins` 里记录的扩展 ID 不等于当前实际扩展 ID。重新运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& "D:/meta/xfgl-extension/native/install-native-host.ps1"
```

  然后在 `chrome://extensions/` 里重载扩展。

- 报错 `本地保存辅助程序不可用`
  先检查以下文件是否存在：
  - `D:/meta/xfgl-extension/native/XfglSaveDialogHost.exe`
  - `D:/meta/xfgl-extension/native/com.xfgl.save_dialog.json`

- 已弹出保存框，但没有自动填写文件名
  当前实现依赖 Windows 原生“将打印输出另存为”窗口，并假定文件名输入框和保存按钮仍为标准控件。若 Chrome、系统语言或打印机行为变化，需重新适配 `native/XfglSaveDialogHost.cs`。

- 文件名来源
  “本地保存”模式使用当前查询值作为文件名：
  - 查询类型为 `姓名` 时，文件名就是姓名
  - 查询类型为 `身份证件号` 时，文件名就是身份证号
  - 查询类型为 `学生标识码` 时，文件名就是学生标识码

## 已知限制

- 仅适配当前目标站点及页面结构，若目标页面 DOM 结构变化，脚本可能需要同步调整
- `本地保存` 模式依赖 Windows + Chrome Native Messaging Host
- 非 `--kiosk-printing` 模式下，浏览器保存行为可能与当前流程不一致
- 目前没有打包构建流程，属于直接加载源码运行的浏览器扩展项目

## 本地开发与调试

项目不依赖构建工具，直接修改源码后可在扩展管理页点击“重新加载”进行调试。

建议优先关注以下文件：

- `background.js`：整体流程、日志、状态管理
- `content/query-page.js`：查询与打印的页面自动化逻辑
- `content/utils.js`：按钮查找、等待、点击、输入等基础能力
- `sidepanel/sidepanel.js`：交互入口与进度展示

## 后续建议

- 补充真实业务截图，帮助使用者快速理解操作流程
- 增加错误场景说明，例如网络异常、目标页面改版、无权限访问
- 如需公开发布，可补充许可证与版本发布记录
