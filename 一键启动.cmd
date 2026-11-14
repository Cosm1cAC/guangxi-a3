@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title 广西 A3 - 一键启动
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请安装 Node.js 22.12 或更新版本后重试。
  pause
  exit /b 1
)
node scripts/start.mjs
if errorlevel 1 (
  echo.
  echo 启动失败，请查看上方提示。
  pause
)
endlocal
