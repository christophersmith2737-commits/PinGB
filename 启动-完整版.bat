@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Cleaning previous server on port 8788...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8788.*LISTENING" 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo Building PinGB...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b %errorlevel%
)

echo Starting server on http://127.0.0.1:8788 ...
echo.

start /min "" cmd /c "npm run pages:dev"

:loop
timeout /t 1 /nobreak >nul
curl -s http://127.0.0.1:8788 >nul 2>&1
if %errorlevel% neq 0 goto loop

start http://127.0.0.1:8788
echo Done.
exit
