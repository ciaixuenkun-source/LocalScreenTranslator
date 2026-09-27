$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$electronPath = Join-Path $projectRoot "node_modules\electron\dist\electron.exe"
$iconPath = Join-Path $projectRoot "src\assets\icons\app-icon.ico"
$stagingShortcut = Join-Path $projectRoot "Translator.lnk"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Translator.lnk"

if (-not (Test-Path -LiteralPath $electronPath)) {
  throw "Electron is not installed. Run npm install first."
}
if (-not (Test-Path -LiteralPath $iconPath)) {
  throw "Translator icon is missing. Run npm run icon:generate first."
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($stagingShortcut)
$shortcut.TargetPath = $electronPath
$shortcut.Arguments = "`"$projectRoot`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "启动 Translator 悬浮翻译工具"
$shortcut.Save()

if (Test-Path -LiteralPath $desktopShortcut) {
  Write-Host "Desktop shortcut already exists: $desktopShortcut"
  exit 0
}

# Shell.CopyHere works with desktops whose folder ACL is managed by Explorer.
$shell = New-Object -ComObject Shell.Application
$shell.Namespace(0).CopyHere($stagingShortcut, 16)

$deadline = (Get-Date).AddSeconds(15)
while (-not (Test-Path -LiteralPath $desktopShortcut) -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 250
}
if (-not (Test-Path -LiteralPath $desktopShortcut)) {
  throw "Windows did not allow the shortcut to be created on the desktop."
}

Write-Host "Desktop shortcut ready: $desktopShortcut"
