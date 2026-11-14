import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root='douyin';
const project=JSON.parse(readFileSync(`${root}/project.config.json`,'utf8'));
const appid=process.env.A3_DOUYIN_APP_ID||project.appid;
const api=process.env.A3_DOUYIN_API_BASE||'https://a3.vibelink.cloud/api';
if(!/^https:\/\/[^/]+\/api$/.test(api))throw Error('A3_DOUYIN_API_BASE must be an HTTPS /api endpoint');
if(process.argv.includes('--release')&&!/^tt[0-9a-f]{16,}$/i.test(appid))throw Error('A real Douyin AppID is required for upload');
project.appid=appid;project.projectname='像素A3';
writeFileSync(`${root}/project.config.json`,JSON.stringify(project,null,2)+'\n');
await build({entryPoints:['src/douyin/main.ts'],bundle:true,format:'cjs',platform:'neutral',target:'es2018',minify:true,outfile:`${root}/game.js`,define:{__A3_DOUYIN_API_BASE__:JSON.stringify(api)},legalComments:'eof'});
mkdirSync(`${root}/assets`,{recursive:true});
// Reuse the licensed pixel subset; native Canvas requires a TTF resource.
const python=process.env.A3_PYTHON||'C:/Users/TEMP/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const subset=readFileSync('miniprogram/fonts/pixel.wxss','utf8').match(/base64,([^"\)]+)/)[1];
if((!existsSync(`${root}/assets/pixel.ttf`)||process.argv.includes('--font'))&&existsSync('.local/font-tools')&&existsSync(python)){
  execFileSync(python,['-c',"import sys,base64,io;sys.path.insert(0,'.local/font-tools');from fontTools.ttLib import TTFont;f=TTFont(io.BytesIO(base64.b64decode(sys.argv[1])));f.flavor=None;f.save('douyin/assets/pixel.ttf')",subset]);
}else if(!existsSync(`${root}/assets/pixel.ttf`))throw Error('Missing pixel.ttf. Build font once with fontTools, or restore the licensed font asset.');
function copyTree(from,to){mkdirSync(to,{recursive:true});for(const item of readdirSync(from,{withFileTypes:true})){if(item.isDirectory())copyTree(`${from}/${item.name}`,`${to}/${item.name}`);else writeFileSync(`${to}/${item.name}`,readFileSync(`${from}/${item.name}`));}}
writeFileSync(`${root}/assets/OFL.txt`,readFileSync('miniprogram/fonts/OFL.txt'));copyTree('miniprogram/fonts/LICENSES',`${root}/assets/LICENSES`);
console.log(JSON.stringify({project:project.projectname,appid:appid||'not configured',api,bundleBytes:readFileSync(`${root}/game.js`).length}));
