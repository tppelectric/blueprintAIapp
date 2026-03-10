@echo off
start "" powershell.exe -ExecutionPolicy Bypass -NoExit -File "%~dp0scripts\start-web.ps1"
timeout /t 8 /nobreak >nul
start "" http://127.0.0.1:3000
