$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$electronPath = Join-Path $projectRoot "node_modules\electron\dist\electron.exe"
$iconPath = Join-Path $projectRoot "src\assets\icons\app-icon.ico"
$projectShortcut = Join-Path $projectRoot "Translator.lnk"
$startMenuDirectory = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$startMenuShortcut = Join-Path $startMenuDirectory "Translator.lnk"

foreach ($required in @($electronPath, $iconPath)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required Translator file is missing: $required"
  }
}

function Write-TranslatorShortcut([string]$shortcutPath) {
  $wsh = New-Object -ComObject WScript.Shell
  $shortcut = $wsh.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $electronPath
  $shortcut.Arguments = "`"$projectRoot`""
  $shortcut.WorkingDirectory = $projectRoot
  $shortcut.IconLocation = "$iconPath,0"
  $shortcut.Description = "启动 Translator 悬浮翻译工具"
  $shortcut.Save()
}

New-Item -ItemType Directory -Path $startMenuDirectory -Force | Out-Null
Write-TranslatorShortcut $projectShortcut
Write-TranslatorShortcut $startMenuShortcut

Write-Host "Project shortcut ready: $projectShortcut"
Write-Host "Start menu shortcut ready: $startMenuShortcut"
