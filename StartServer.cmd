@echo off
setlocal
cd /d "%~dp0"

if not defined PORT set "PORT=8080"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the LTS version from https://nodejs.org and try again.
  goto :error
)
where npx >nul 2>nul
if errorlevel 1 (
  echo npx is required. Reinstall Node.js LTS with npm from https://nodejs.org and try again.
  goto :error
)

echo Serving on http://127.0.0.1:%PORT%/
echo Close this window or press Ctrl+C to stop.
call npx --yes serve -l tcp://127.0.0.1:%PORT% .
if errorlevel 1 goto :error
exit /b 0

:error
echo The local server could not start. See the error above.
if not "%AC_NO_PAUSE%"=="1" pause
exit /b 1
