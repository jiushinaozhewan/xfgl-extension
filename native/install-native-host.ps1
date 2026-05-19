param(
  [string[]]$ExtensionId,
  [string]$ChromeProfilePath = "D:/meta/chrome-kiosk-profile/Default"
)

$hostName = "com.xfgl.save_dialog"
$exePath = Join-Path $PSScriptRoot "XfglSaveDialogHost.exe"
$zipPath = Join-Path $PSScriptRoot "XfglSaveDialogHost.zip"
$manifestPath = Join-Path $PSScriptRoot "$hostName.json"
$buildScript = Join-Path $PSScriptRoot "build-native-host.ps1"

if (-not $ExtensionId -or $ExtensionId.Count -eq 0) {
  $settingsPath = Join-Path $ChromeProfilePath "Local Extension Settings"
  if (-not (Test-Path $settingsPath)) {
    throw "未找到扩展设置目录: $settingsPath"
  }

  $detectedIds = Get-ChildItem $settingsPath -Directory | Select-Object -ExpandProperty Name
  if (-not $detectedIds -or $detectedIds.Count -eq 0) {
    throw "未在 $settingsPath 中检测到扩展 ID，请手动传入 -ExtensionId"
  }

  $ExtensionId = $detectedIds
}

if (-not (Test-Path $exePath)) {
  # exe 不存在时，优先尝试从 zip 解压
  if (Test-Path $zipPath) {
    Expand-Archive -Path $zipPath -DestinationPath $PSScriptRoot -Force
    if (-not (Test-Path $exePath)) {
      & $buildScript -OutputPath $exePath
    }
  } else {
    & $buildScript -OutputPath $exePath
  }
}

$manifest = @{
  name = $hostName
  description = "XFGL 本地保存辅助程序"
  path = $exePath
  type = "stdio"
  allowed_origins = @(
    $ExtensionId | ForEach-Object { "chrome-extension://$_/" }
  )
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

$chromeRegPath = "HKCU\Software\Google\Chrome\NativeMessagingHosts\$hostName"
$edgeRegPath = "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"

reg.exe add $chromeRegPath /ve /t REG_SZ /d $manifestPath /f | Out-Null
reg.exe add $edgeRegPath /ve /t REG_SZ /d $manifestPath /f | Out-Null

Write-Host "已注册 Native Messaging Host: $hostName"
Write-Host "Manifest: $manifestPath"
Write-Host "允许的扩展 ID: $($ExtensionId -join ', ')"
Write-Host "Chrome/Edge 重载扩展后即可使用“本地保存”。"
