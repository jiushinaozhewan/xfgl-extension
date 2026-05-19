param(
  [string]$OutputPath = (Join-Path $PSScriptRoot "XfglSaveDialogHost.exe")
)

$sourcePath = Join-Path $PSScriptRoot "XfglSaveDialogHost.cs"
$zipPath = Join-Path $PSScriptRoot "XfglSaveDialogHost.zip"

# 如果 zip 存在但 exe 不存在，直接解压
if ((-not (Test-Path $OutputPath)) -and (Test-Path $zipPath)) {
  Expand-Archive -Path $zipPath -DestinationPath $PSScriptRoot -Force
  if (Test-Path $OutputPath) {
    Write-Host "已从 ZIP 解压 Native Host: $OutputPath"
    exit 0
  }
}

$frameworkBase = Join-Path $env:WINDIR "Microsoft.NET/Framework64/v4.0.30319"
$wpfBase = Join-Path $frameworkBase "WPF"
$cscPath = Join-Path $frameworkBase "csc.exe"
$uiAutomationClient = Join-Path $wpfBase "UIAutomationClient.dll"
$uiAutomationTypes = Join-Path $wpfBase "UIAutomationTypes.dll"
$runtimeSerialization = Join-Path $frameworkBase "System.Runtime.Serialization.dll"
$systemXml = Join-Path $frameworkBase "System.Xml.dll"

if (-not (Test-Path $sourcePath)) {
  throw "未找到源码文件: $sourcePath"
}

foreach ($dependency in @(
  $cscPath,
  $uiAutomationClient,
  $uiAutomationTypes,
  $runtimeSerialization,
  $systemXml
)) {
  if (-not (Test-Path $dependency)) {
    throw "未找到编译依赖: $dependency"
  }
}

if (Test-Path $OutputPath) {
  Remove-Item $OutputPath -Force -ErrorAction SilentlyContinue
}

& $cscPath `
  /nologo `
  /target:exe `
  /out:$OutputPath `
  /r:$runtimeSerialization `
  /r:$systemXml `
  /r:$uiAutomationClient `
  /r:$uiAutomationTypes `
  $sourcePath

if ($LASTEXITCODE -ne 0) {
  throw "Native Host 编译失败，退出码: $LASTEXITCODE"
}

Write-Host "已生成 Native Host: $OutputPath"
