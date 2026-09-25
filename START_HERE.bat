@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo  SPACEASSIST AI - START HERE
echo ============================================================
echo.
echo Starting backend in a separate window...
start "SpaceAssist AI - BACKEND" cmd /k "%~dp0start_backend.bat"
timeout /t 5 /nobreak >nul
echo Starting frontend in a separate window...
start "SpaceAssist AI - FRONTEND" cmd /k "%~dp0start_frontend.bat"
timeout /t 10 /nobreak >nul
start "" http://localhost:5173
echo.
echo If the frontend window reports an npm/Vite error, run:
echo    FIX_FRONTEND.bat
 echo.
pause
