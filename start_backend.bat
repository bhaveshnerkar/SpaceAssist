@echo off
setlocal
cd /d "%~dp0backend"
echo ============================================================
echo  SpaceAssist AI - Backend
 echo ============================================================
if not exist venv (
  echo Creating Python virtual environment...
  python -m venv venv
)
call venv\Scripts\activate.bat
python -m pip install --upgrade pip
 echo Installing backend dependencies (first run can take a while)...
pip install -r requirements.txt
 echo.
echo Starting API at http://127.0.0.1:8000
 echo The first Camera Mode launch downloads the official MediaPipe
 echo pose/hand model files into the project's models folder.
echo.
python -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
