@echo off
setlocal EnableExtensions
cd /d "%~dp0frontend"

echo ============================================================
echo  SpaceAssist AI - Frontend Launcher
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in PATH.
  echo Install Node.js 20+ and reopen this window.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm is not available in PATH.
  echo Reinstall Node.js or reopen the terminal after installation.
  pause
  exit /b 1
)

echo Node version:
node --version
echo npm version:
npm --version
echo.

if not exist public mkdir public
if not exist public\models mkdir public\models
if not exist public\models\pose_landmarker_full.task (
  echo.
  echo Downloading MediaPipe Pose model (first run only)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task' -OutFile 'public\models\pose_landmarker_full.task'; Write-Host 'MediaPipe Pose model downloaded.' } catch { Write-Host ('MODEL DOWNLOAD FAILED: ' + $_.Exception.Message); exit 1 }"
  if errorlevel 1 (
    echo WARNING: MediaPipe model could not be downloaded.
    echo Check internet access before starting the camera.
  )
)

if not exist package.json (
  echo ERROR: frontend\package.json was not found.
  pause
  exit /b 1
)

if not exist node_modules\.bin\vite.cmd (
  echo Vite is not installed yet. Installing frontend dependencies...
  echo This can take a few minutes on the first run.
  call npm.cmd install --include=dev --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    echo Please copy the npm error above and send it to ChatGPT.
    pause
    exit /b 1
  )
)

if not exist node_modules\.bin\vite.cmd (
  echo.
  echo Vite is still missing after npm install.
  echo Installing Vite explicitly...
  call npm.cmd install --save-dev vite@5.4.2 --no-audit --no-fund
  if errorlevel 1 (
    echo ERROR: Vite installation failed.
    pause
    exit /b 1
  )
)


if exist node_modules\@mediapipe\tasks-vision\wasm (
  if not exist public mkdir public
  if not exist public\wasm mkdir public\wasm
  xcopy /E /I /Y node_modules\@mediapipe\tasks-vision\wasm public\wasm >nul
)

echo.
echo ============================================================
echo  Starting SpaceAssist AI frontend
 echo  URL: http://localhost:5173
 echo  Press Ctrl+C to stop the server.
echo ============================================================
echo.
call npm.cmd run dev -- --host 127.0.0.1

if errorlevel 1 (
  echo.
  echo Frontend stopped with an error.
  pause
)
