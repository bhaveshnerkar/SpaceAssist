@echo off
setlocal
cd /d "%~dp0frontend"
echo ============================================================
echo  SpaceAssist AI - Fix Frontend Dependencies
 echo ============================================================
echo.
where node >nul 2>&1 || (echo Node.js not found in PATH. Install Node.js first.& pause & exit /b 1)
where npm >nul 2>&1 || (echo npm not found in PATH. Reopen the terminal or reinstall Node.js.& pause & exit /b 1)
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json (
  echo Installing from package-lock.json...
  call npm ci --include=dev --no-audit --no-fund
) else (
  call npm install --include=dev --no-audit --no-fund
)
if errorlevel 1 (
  echo.
  echo INSTALL FAILED. Send the full error above to ChatGPT.
  pause
  exit /b 1
)
if not exist node_modules\.bin\vite.cmd (
  echo Vite was not installed. Installing it explicitly...
  call npm install --save-dev vite@5.4.2 --no-audit --no-fund
)
if exist node_modules\.bin\vite.cmd (
  echo.
  echo SUCCESS: Vite is installed.
  echo Run start_frontend.bat now.
) else (
  echo ERROR: Vite is still missing.
)
pause
