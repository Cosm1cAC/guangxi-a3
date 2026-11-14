// 打安卓安装包：node scripts/build-apk.mjs [--debug]
// 构建应用版网页 → 同步进安卓工程 → Gradle 打包 → 复制到 release/。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, realpathSync, writeFileSync, copyFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const debug = process.argv.includes('--debug');
const windows = process.platform === 'win32';
const project = resolve('.');
const log = m => console.log(`\n[APK] ${m}`);
function run(command, args, cwd, env = process.env) {
  const r = spawnSync(command, args, { cwd, env, stdio: 'inherit', windowsHide: true, shell: false });
  if (r.status !== 0) { console.error(`\n[APK] ${command} ${args.join(' ')} 失败（${r.status ?? r.error?.message}）`); process.exit(1); }
}

// Gradle / AAPT 在 Windows 上处理不了含中文的工程路径：复用数据库脚本的 ASCII 目录联接。
let root = project;
if (windows && /[^\x00-\x7F]/.test(project)) {
  const alias = join(process.env.LOCALAPPDATA, 'A3-native', createHash('sha256').update(project).digest('hex').slice(0, 16));
  if (/[^\x00-\x7F]/.test(alias)) throw new Error('本机用户目录含非 ASCII 字符，请把项目放到纯英文路径后再打包。');
  mkdirSync(dirname(alias), { recursive: true });
  if (!existsSync(alias)) symlinkSync(project, alias, 'junction');
  if (realpathSync(alias).toLowerCase() !== realpathSync(project).toLowerCase()) throw new Error('路径别名冲突，请检查本机 A3-native 目录。');
  root = alias;
}

// Android SDK 位置
const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk')];
if (windows && existsSync('C:/Users')) for (const u of readdirSync('C:/Users')) candidates.push(`C:/Users/${u}/AppData/Local/Android/Sdk`);
const sdk = candidates.find(p => p && existsSync(join(p, 'platforms')));
if (!sdk) throw new Error('找不到 Android SDK。请安装 Android Studio，或设置 ANDROID_HOME。');
writeFileSync('android/local.properties', `sdk.dir=${sdk.replaceAll('\\', '/')}\n`);

// 发布签名密钥：首次打包时生成，之后一直复用——换了密钥，已安装的应用就无法覆盖升级。
if (!debug && !existsSync('android/keystore.properties')) {
  mkdirSync('.local/android', { recursive: true });
  const password = randomBytes(18).toString('base64url');
  log('首次打包：生成发布签名密钥 .local/android/a3-release.jks（请备份此文件和 android/keystore.properties）');
  run('keytool', ['-genkeypair', '-keystore', join(root, '.local/android/a3-release.jks'), '-storepass', password, '-keypass', password, '-alias', 'a3', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Shanshui A3, O=vibelink.cloud'], root);
  writeFileSync('android/keystore.properties', `storeFile=../../.local/android/a3-release.jks\nstorePassword=${password}\nkeyAlias=a3\nkeyPassword=${password}\n`);
}

log('构建应用版网页（默认服务器见 .env.app）…');
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'app', '--outDir', 'dist-app'], project);   // Vite 需要真实路径，只有 Gradle 走 ASCII 别名
run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'], project);

log(`Gradle 打包（${debug ? 'debug' : 'release'}）… 首次需要下载 Gradle 与依赖，耗时较长`);
const task = debug ? 'assembleDebug' : 'assembleRelease';
if (windows) run(process.env.ComSpec || 'cmd.exe', ['/d', '/c', join(root, 'android', 'gradlew.bat'), task, '--console=plain'], join(root, 'android'));
else run('./gradlew', [task, '--console=plain'], join(root, 'android'));

const out = `android/app/build/outputs/apk/${debug ? 'debug/app-debug.apk' : 'release/app-release.apk'}`;
if (!existsSync(out)) throw new Error(`没有找到打包产物 ${out}`);
const version = /versionName "([^"]+)"/.exec(readFileSync('android/app/build.gradle', 'utf8'))?.[1] ?? '1.0.0';
mkdirSync('release', { recursive: true });
const target = `release/shanshui-a3-${version}${debug ? '-debug' : ''}.apk`;
copyFileSync(out, target);
log(`完成：${target}（${(statSync(target).size / 1048576).toFixed(1)} MB）`);
