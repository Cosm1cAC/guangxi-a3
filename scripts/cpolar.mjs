import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function cpolarConfig(root = '.') {
  const executable = resolve(root, '.local/cpolar/cpolar.exe');
  const config = resolve(root, '.local/cpolar/auth.yml');
  if (!existsSync(executable)) throw new Error('缺少 cpolar 客户端：请从官网下载并将 cpolar.exe 放到 .local/cpolar/。');
  if (!existsSync(config)) throw new Error('尚未配置 cpolar 认证，请先双击「配置穿透.cmd」，在本机粘贴官网后台的 Token。');
  const match = readFileSync(config, 'utf8').match(/^authtoken:\s*("[^\r\n]*")\s*$/m);
  let token;
  try { token = match && JSON.parse(match[1]); } catch {}
  if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{16,256}$/.test(token) || token.includes('PASTE_TOKEN')) throw new Error('cpolar Token 尚未填写或格式不正确，请重新运行「配置穿透.cmd」。');
  return { executable, config, token };
}

export function cpolarArgs(config, port) {
  return ['http', `-config=${config}`, '-region=cn', '-proto=https', '-redirect-https=true', '-inspect-addr=127.0.0.1:0', '-dashboard=off', '-daemon=off', '-log=stdout', '-log-level=INFO', `127.0.0.1:${port}`];
}

export function cpolarEnvironment(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !/^(https?|all|socks5?)_proxy$/i.test(key)));
}

export function cpolarPublicUrl(line) {
  let latest=null;
  for (const match of line.matchAll(/https:\/\/[a-z0-9.-]+(?::\d+)?/gi)) {
    const url = new URL(match[0]);
    if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.cpolar\.(cn|top|io|net|vip|xyz|site|cyou)$/i.test(url.hostname) && !/^(www|dashboard)\./i.test(url.hostname)) latest=url.origin;
  }
  return latest;
}
