$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$configDirectory = Join-Path $taskRoot '.local/cpolar'
New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
Write-Host '登录 https://dashboard.cpolar.com/ ，在“验证”页复制 Authtoken。'
Write-Host 'Token 只写入本机配置文件，不显示在屏幕上。无需购买套餐。'
$secureToken = Read-Host '粘贴 Token 后按回车（输入不会显示）' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $taskToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer).Trim()
    if ($taskToken -notmatch '^[a-zA-Z0-9_-]{16,256}$') { throw 'Token 格式不正确。请复制官网的 Authtoken。' }
    $taskConfig = 'authtoken: ' + (ConvertTo-Json -InputObject $taskToken -Compress) + "`ninspect_db_size: -1"
    $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText((Join-Path $configDirectory 'auth.yml'), $taskConfig + "`n", $utf8WithoutBom)
    Write-Host '认证配置已保存。现在可以双击“穿透启动.cmd”。'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    $taskToken = $null
}
