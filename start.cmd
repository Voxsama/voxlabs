@echo off
rem Start Voxlabs on Windows.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22+ is required: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (call npm install || (pause & exit /b 1))
if not exist .next\BUILD_ID (call npm run build || (pause & exit /b 1))
if "%REBUILD%"=="1" (call npm run build || (pause & exit /b 1))
if "%PORT%"=="" set PORT=3000
start "" http://localhost:%PORT%
echo Voxlabs running at http://localhost:%PORT%  (close this window to stop)
call npx next start -p %PORT%
