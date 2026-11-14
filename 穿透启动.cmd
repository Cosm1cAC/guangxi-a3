@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title 广西 A3 - 国内内网穿透
if not defined PORT set PORT=3002
node scripts/start.mjs --cpolar
if errorlevel 1 pause
endlocal
