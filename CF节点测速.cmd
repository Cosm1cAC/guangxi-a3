@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
node scripts/cf-benchmark.mjs
echo.
echo 测速完成。结果保存在 .local\cloudflared\benchmark.json，重启穿透服务后应用新候选池。
pause
endlocal
