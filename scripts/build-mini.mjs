import {build} from 'esbuild';
await build({entryPoints:['miniprogram/pages/table/index.ts'],bundle:true,platform:'browser',format:'cjs',target:'es2018',minify:true,outfile:'miniprogram/pages/table/index.js',legalComments:'eof'});
console.log('WeChat bundle ready: miniprogram/');
