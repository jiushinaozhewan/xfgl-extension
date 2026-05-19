# Release Notes

## 2026-05-19

### 新增

- 新增“本地保存”输出方式
- 新增 Windows 原生保存辅助程序 `native/XfglSaveDialogHost.exe`
- 新增 `Native Messaging Host` 集成，用于在系统“将打印输出另存为”窗口中自动填写文件名并点击“保存”

### 本地保存安装步骤

1. 使用以下命令启动 Chrome，并加载当前扩展：

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

3. 安装脚本会自动完成以下操作：
   - 编译 `native/XfglSaveDialogHost.exe`（若尚未生成）
   - 生成 `native/com.xfgl.save_dialog.json`
   - 注册 Chrome / Edge 的 `Native Messaging Host`
   - 自动识别当前专用配置目录中的扩展 ID，并写入 `allowed_origins`

4. 返回 `chrome://extensions/`，对当前扩展执行一次“重新加载”

5. 重新使用相同的 `--user-data-dir`、`--load-extension`、`--kiosk-printing` 参数启动 Chrome

### 使用说明

- 当侧边栏“输出方式”选择“本地保存”时，扩展会使用当前查询值作为文件名
- 查询类型为“姓名”时，文件名为姓名
- 查询类型为“身份证件号”时，文件名为身份证号
- 查询类型为“学生标识码”时，文件名为学生标识码

### 常见问题

- 若提示 `Access to the specified native messaging host is forbidden`
  说明当前扩展 ID 与 `Native Messaging Host` 清单中的 `allowed_origins` 不一致。重新执行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& "D:/meta/xfgl-extension/native/install-native-host.ps1"
```

然后重载扩展即可。

- 若提示“本地保存辅助程序不可用”
  请检查以下文件是否存在：
  - `D:/meta/xfgl-extension/native/XfglSaveDialogHost.exe`
  - `D:/meta/xfgl-extension/native/com.xfgl.save_dialog.json`
