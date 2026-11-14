import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const compiled=await transform(await readFile('src/visual/pixel-art.ts','utf8'),{loader:'ts',format:'esm'});
const {SUIT_GLYPHS,pixelSvg,SUIT_NAMES}=await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));
await mkdir('public/assets/cards',{recursive:true});
for(let rank=2;rank<=14;rank++)for(let suit=0;suit<4;suit++){
 const r=({11:'J',12:'Q',13:'K',14:'A'})[rank]||rank,s=['♦','♣','♥','♠'][suit],color=suit===0||suit===2?'#b34c49':'#233d45';
 const glyph=pixelSvg(SUIT_GLYPHS[suit],{'#':color}),icon=(x,y,w,h)=>glyph.replace('<svg ',`<svg x="${x}" y="${y}" width="${w}" height="${h}" `);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 252"><title>${SUIT_NAMES[suit]}${r}</title><rect x="1" y="1" width="178" height="250" rx="2" fill="#f2efe3" stroke="#9b9d8b" stroke-width="2"/><g fill="${color}" font-family="Georgia,serif"><text x="14" y="39" font-size="32">${r}</text>${icon(15,44,23,29)}${icon(57,95,66,81)}<g transform="rotate(180 90 126)"><text x="14" y="39" font-size="32">${r}</text>${icon(15,44,23,29)}</g></g></svg>`;
 await writeFile(`public/assets/cards/${rank}-${suit}.svg`,svg);
}
console.log('52 original vector card faces generated.');
