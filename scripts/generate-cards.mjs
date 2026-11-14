import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('public/assets/cards',{recursive:true});
for(let rank=2;rank<=14;rank++)for(let suit=0;suit<4;suit++){
 const r=({11:'J',12:'Q',13:'K',14:'A'})[rank]||rank,s=['♦','♣','♥','♠'][suit],color=suit===0||suit===2?'#b34c49':'#233d45';
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 252"><rect x="1" y="1" width="178" height="250" rx="12" fill="#f2efe3" stroke="#c5c5b2"/><g fill="${color}" font-family="Georgia,serif"><text x="14" y="39" font-size="32">${r}</text><text x="15" y="67" font-size="28">${s}</text><text x="90" y="151" text-anchor="middle" font-size="74">${s}</text><g transform="rotate(180 90 126)"><text x="14" y="39" font-size="32">${r}</text><text x="15" y="67" font-size="28">${s}</text></g></g></svg>`;
 await writeFile(`public/assets/cards/${rank}-${suit}.svg`,svg);
}
console.log('52 original vector card faces generated.');
