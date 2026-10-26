@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Export-Static.ps1" %*
set "EXPORT_EXIT_CODE=%ERRORLEVEL%"

if not "%EXPORT_EXIT_CODE%"=="0" echo Export failed with exit code %EXPORT_EXIT_CODE%.
if not "%AC_NO_PAUSE%"=="1" pause

exit /b %EXPORT_EXIT_CODE%
