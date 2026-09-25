@echo off
REM ============================================================
REM SpaceAssist AI - Training Pipeline Launcher
REM Double-click this file for a simple menu to run each step
REM of the training pipeline in order.
REM ============================================================

cd /d "%~dp0"

if not exist venv (
    echo Creating training virtual environment - first run only...
    python -m venv venv
)

call venv\Scripts\activate.bat

echo Checking training dependencies are installed...
pip install --quiet -r requirements.txt

:menu
cls
echo ============================================================
echo  SpaceAssist AI - Training Pipeline
echo ============================================================
echo.
echo   1. Collect training data - webcam
echo   2. Extract features from collected images
echo   3. Train the model
echo   4. Test the trained model
echo   5. Run live prediction - webcam
echo   6. Exit
echo.
set /p choice="Choose an option (1-6): "

if "%choice%"=="1" (
    python collect_data.py
    pause
    goto menu
)
if "%choice%"=="2" (
    python extract_features.py
    pause
    goto menu
)
if "%choice%"=="3" (
    python train_model.py
    pause
    goto menu
)
if "%choice%"=="4" (
    python test_model.py
    pause
    goto menu
)
if "%choice%"=="5" (
    python predict.py
    pause
    goto menu
)
if "%choice%"=="6" (
    exit /b
)

echo Invalid choice, try again.
pause
goto menu
