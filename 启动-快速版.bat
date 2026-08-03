@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Cleaning previous server on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING" 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

if exist .next rd /s /q .next

echo Starting PinGB on http://localhost:3000 ...
echo.

start /min "" cmd /c "npx next dev -p 3000"

:loop
timeout /t 1 /nobreak >nul
curl -s http://localhost:3000 >nul 2>&1
if %errorlevel% neq 0 goto loop

start http://localhost:3000
echo Done.
exit
