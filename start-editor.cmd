@echo off
rem Double-click to open the editor. This window is the server: keep it open, close it to stop.
chcp 65001 >nul
title Saba Yehuda 80 - server (http://127.0.0.1:4000)
cd /d "%~dp0"

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:4000/api/health | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  echo The server is already running. Opening the editor...
  start "" http://127.0.0.1:4000/edit
  timeout /t 3 >nul
  exit /b 0
)

if not exist node_modules call npm install
if not exist dist\index.html call npm run build

rem Open the browser as soon as the server answers.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 240; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:4000/api/health | Out-Null; Start-Process 'http://127.0.0.1:4000/edit'; break } catch { Start-Sleep -Milliseconds 500 } }"

echo Starting the server. Keep this window open during editing and the show; close it to stop.
call npm start
echo.
echo The server stopped. Press any key to close this window.
pause >nul
