import pg from 'pg';
import { existsSync, mkdirSync, symlinkSync, realpathSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

function execute(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`PostgreSQL 命令失败（${code}），请查看上方日志。`)));
  });
}

// Native Windows executables; pg_ctl provides graceful shutdown and persistence.
export async function startNativeDatabase(connectionString) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('自动准备原生数据库仅支持 Windows x64；其他系统请在 .env 配置已有 PostgreSQL。');
  const project = resolve('.');
  // initdb on Windows cannot reliably use UTF-8 paths containing Chinese.
  // An ASCII junction gives both executable and data paths an alias; data stays in the project.
  const key = createHash('sha256').update(project).digest('hex').slice(0,16);
  const alias = join(process.env.LOCALAPPDATA, 'A3-native', key);
  if (/[^\x00-\x7F]/.test(alias)) throw new Error('本机用户目录含非 ASCII 字符，请在 .env 配置已安装的 PostgreSQL。');
  mkdirSync(dirname(alias), { recursive: true });
  if (!existsSync(alias)) symlinkSync(project, alias, 'junction');
  if (realpathSync(alias).toLowerCase() !== realpathSync(project).toLowerCase()) throw new Error('数据库路径别名冲突，请检查本机 A3-native 目录。');
  const bin = join(alias, 'node_modules/@embedded-postgres/windows-x64/native/bin');
  const databaseDir = join(alias, '.local/postgres');
  const url = new URL(connectionString);
  const port = Number(url.port || 5432);
  mkdirSync(join(alias, '.local'), { recursive: true });
  if (!existsSync(join(databaseDir, 'PG_VERSION'))) {
    const passwordFile = join(alias, '.local', `pg-password-${randomBytes(8).toString('hex')}`);
    writeFileSync(passwordFile, decodeURIComponent(url.password) + '\n', { mode: 0o600 });
    try {
      await execute(join(bin, 'initdb.exe'), ['-D', databaseDir, '--auth=scram-sha-256', `--username=${decodeURIComponent(url.username)}`, `--pwfile=${passwordFile}`, '--encoding=UTF8', '--locale=C']);
    } finally { unlinkSync(passwordFile); }
  }
  const ctl = join(bin, 'pg_ctl.exe');
  const stop = () => execute(ctl, ['-D', databaseDir, 'stop', '-m', 'fast', '-w', '-t', '30']);
  let started = false;
  try {
    await execute(ctl, ['-D', databaseDir, '-l', join(alias, '.local/postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, 'start', '-w', '-t', '30']);
    started = true;
    const adminUrl = new URL(connectionString);
    adminUrl.hostname = '127.0.0.1';
    adminUrl.pathname = '/postgres';
    const client = new pg.Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 3000 });
    try {
      await client.connect();
      const name = decodeURIComponent(url.pathname.slice(1));
      if (!name) throw new Error('DATABASE_URL 缺少数据库名。');
      const existing = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
      if (!existing.rowCount) await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
    } finally { await client.end(); }
    return { stop };
  } catch (error) {
    if (started) await stop().catch(() => {});
    throw error;
  }
}
