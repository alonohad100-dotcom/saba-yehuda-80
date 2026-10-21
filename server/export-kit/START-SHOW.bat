@echo off
rem Saba Yehuda 80 - double-click to play the exported show (Windows 10/11, nothing to install).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0player\serve.ps1"
if errorlevel 1 pause
