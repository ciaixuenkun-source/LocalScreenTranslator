$ErrorActionPreference = "Stop"

$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx install-electron
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
