@echo off
REM ========================================
REM Showduino GitHub Deployment Script
REM ========================================

echo.
echo ========================================
echo Showduino GitHub Deployment
echo ========================================
echo.

set /p REPO_PATH="Enter path to your GitHub repository folder: "

if "%REPO_PATH%"=="" (
    echo ERROR: No path provided!
    pause
    exit /b 1
)

if not exist "%REPO_PATH%" (
    echo ERROR: Directory does not exist: %REPO_PATH%
    pause
    exit /b 1
)

echo.
echo Copying files to: %REPO_PATH%
echo.

REM Copy all files
xcopy /E /Y /I "%~dp0*" "%REPO_PATH%"

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to copy files!
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! Files copied successfully!
echo ========================================
echo.
echo Next steps:
echo 1. Open Command Prompt or Git Bash
echo 2. Navigate to: %REPO_PATH%
echo 3. Run these commands:
echo.
echo    git add .
echo    git commit -m "Update website with HauntSync and Studio"
echo    git push origin main
echo.
echo Your website will be live in 2-3 minutes!
echo.

pause
