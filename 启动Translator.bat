@echo off
setlocal
for %%I in ("%~dp0.") do set "PROJECT_ROOT=%%~fI"
set "ELECTRON_EXE=%PROJECT_ROOT%\node_modules\electron\dist\electron.exe"
cd /d "%PROJECT_ROOT%"

if not exist "%ELECTRON_EXE%" (
  echo Translator dependencies are not installed.
  echo Run npm install in this folder first.
  pause
  exit /b 1
)

start "" /D "%PROJECT_ROOT%" "%ELECTRON_EXE%" "%PROJECT_ROOT%"
exit /b 0
