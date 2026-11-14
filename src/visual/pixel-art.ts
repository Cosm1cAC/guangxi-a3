import type {RpsMove} from '../core/game';

/** A pointed connected spade and a distinctly separated three-leaf club. */
export const SUIT_GLYPHS=[
  ['....#....','...###...','..#####..','.#######.','#########','.#######.','..#####..','...###...','....#....'],
  ['...###...','..#####..','..#####..','...###...','.##...##.','####.####','#########','.#######.','...###...','...###...','..#####..'],
  ['.###.###.','#########','#########','#########','.#######.','..#####..','...###...','....#....','.........'],
  ['....#....','...###...','..#####..','.#######.','#########','#########','.#######.','..##.##..','....#....','...###...','..#####..'],
];
export const SUIT_NAMES=['方块','梅花','红桃','黑桃'];
export const RPS_GLYPHS:Record<RpsMove|string,string[]>={
  rock:['................','................','.....xxxxxx.....','...xxhhhhhhx....','..xhh#h#h#hhx...','..xh######ssx...','.xhh######ssx...','.xh#######ssx...','.xh#######ssx...','..x#######sx....','...xssssssx.....','...xccccccx.....','...xccccccx.....','...xxxxxxxx.....','................','................'],
  scissors:['................','...xx....xx.....','..xhhx..xhhx....','..xhhx..xhhx....','...xhhxxhhx.....','...xhhxxhhx.....','....xhhhhx......','...xx####xxx....','..xhh####sssx...','..xhh#####ssx...','...x######sx....','....xsssssx.....','....xcccccx.....','....xcccccx.....','....xxxxxxx.....','................'],
  paper:['................','......xx........','...xxxhhxxx.....','..xhhxhhxhhxx...','..xhhxhhxhhxhx..','..xhhxhhxhhxhx..','..xhh#hh#hh#hx..','..xhh#######hx..','.xxhh#######sx..','xhhh########sx..','xhh########ssx..','.x########ssx...','..xssssssssx....','...xccccccx.....','...xccccccx.....','...xxxxxxxx.....'],
  hidden:['................','....xxxxxxxx....','...xhhhhhhhhx...','...xhxxxxxxhx...','...xhhx..xhhx...','....xxx.xhhx....','.......xhhx.....','......xhhx......','......xhx.......','......xxx.......','................','......xxx.......','......xhx.......','......xxx.......','................','................'],
};
export const HAND_PALETTE:Record<string,string>={x:'#232b29',h:'#ffe0aa','#':'#e8bb82',s:'#b57c53',c:'#5b928b'};
export function pixelRects(rows:readonly string[],palette:Record<string,string>){return rows.flatMap((row,y)=>[...row].flatMap((char,x)=>palette[char]?[{x,y,color:palette[char]}]:[]));}
export function pixelSvg(rows:readonly string[],palette:Record<string,string>={'#':'currentColor'}){
  const width=rows[0].length,height=rows.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" aria-hidden="true">${pixelRects(rows,palette).map(p=>`<rect x="${p.x}" y="${p.y}" width="1" height="1" fill="${p.color}"/>`).join('')}</svg>`;
}
export const suitSvg=(suit:number)=>pixelSvg(SUIT_GLYPHS[suit]);
export const handSvg=(move:string)=>pixelSvg(RPS_GLYPHS[move]||RPS_GLYPHS.hidden,HAND_PALETTE);
export function pixelRows(rows:readonly string[],palette:Record<string,string>){return rows.map(row=>`background:linear-gradient(90deg,${[...row].map((char,i)=>`${palette[char]||'transparent'} ${i*100/row.length}% ${(i+1)*100/row.length}%`).join(',')})`);}
