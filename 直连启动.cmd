@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title 广西 A3 - 本机直连
node scripts/start.mjs --direct
if errorlevel 1 pause
endlocal
