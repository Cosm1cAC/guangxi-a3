export type Card = { rank: number; suit: number };
export type Combo = {kind:string; size:number; level:number; value:number};
export const suits=['♦','♣','♥','♠'];
export const rankLabel=(rank:number)=>({11:'J',12:'Q',13:'K',14:'A'}[rank] ?? String(rank));
export const id=(c:Card)=>`${c.rank}-${c.suit}`;
export const label=(c:Card)=>suits[c.suit]+rankLabel(c.rank);
export const power=(c:Card)=>(c.rank===3?16:c.rank===2?15:c.rank)*4+c.suit;
export const sort=(cards:Card[])=>[...cards].sort((a,b)=>power(a)-power(b));
export function classify(cards:Card[]):Combo|null {
  const n=cards.length;
  if(![1,2,3,5].includes(n)||new Set(cards.map(id)).size!==n||cards.some(c=>!Number.isInteger(c.rank)||c.rank<2||c.rank>14||!Number.isInteger(c.suit)||c.suit<0||c.suit>3))return null;
  const groups=new Map<number,Card[]>();for(const c of cards)groups.set(c.rank,[...(groups.get(c.rank)||[]),c]);
  const value=Math.max(...cards.map(power));
  if(n<=3)return groups.size===1?{kind:['','单张','对子','三张'][n],size:n,level:0,value}:null;
  const natural=[...cards].sort((a,b)=>a.rank-b.rank);
  const straight=natural[0].rank>=3&&natural.every((c,i)=>c.rank===natural[0].rank+i);
  const flush=cards.every(c=>c.suit===cards[0].suit);
  const four=[...groups.values()].find(g=>g.length===4),triple=[...groups.values()].find(g=>g.length===3);
  if(straight&&flush)return {kind:'同花顺',size:n,level:5,value:natural[4].rank*4+natural[4].suit};
  if(four)return {kind:'四带一',size:n,level:4,value:power({...four[0],suit:0})};
  if(triple&&groups.size===2)return {kind:'三带二',size:n,level:3,value:power({...triple[0],suit:0})};
  if(flush)return {kind:'同花',size:n,level:2,value};
  if(straight)return {kind:'顺子',size:n,level:1,value:natural[4].rank*4+natural[4].suit};
  return null;
}
export const beats=(a:Card[],b:Card[])=>{const x=classify(a),y=classify(b);return !!x&&!!y&&x.size===y.size&&(x.level>y.level||(x.level===y.level&&x.value>y.value));};

// A tribute transfer: `from` hands `card` (face down) to `to`; `to` later returns `back`.
export type Transfer={from:number;to:number;card:Card;back:Card|null};
export type RpsMove='rock'|'paper'|'scissors';
export type TributeSelection={quotas:Record<number,number>;choices:Record<number,number[]>;locked:number[];duel:{id:number;players:number[];moves:Record<number,RpsMove>;round:number}|null};
export type TributeContest={players:number[];moves:RpsMove[];winner:number|null;round:number};
export type Tribute={transfers:Transfer[];exempt:string|null;selection?:TributeSelection|null;contests?:TributeContest[]};
export type TributeAction={kind:'select';cards:number[]}|{kind:'rps-start';opponent:number}|{kind:'rps';move:RpsMove;round:number;duelId:number}|{kind:'return';card:Card};
export type Game={hands:Card[][];teams:number[];revealed:number[];turn:number;first:boolean;last:{seat:number;cards:Card[]}|null;passes:number;order:number[];finishedNaturally:number[];status:'tribute'|'playing'|'finished';scores:number[];log:string[];version:number;round?:number;totals?:number[];tribute?:Tribute|null};
export type Result={ok:true;state:Game}|{ok:false;error:string};
export function createGame(random:()=>number=Math.random):Game{
  const deck:Card[]=[];for(let rank=2;rank<=14;rank++)for(let suit=0;suit<4;suit++)deck.push({rank,suit});
  for(let i=51;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  const hands=Array.from({length:4},(_,i)=>sort(deck.filter((_,j)=>j%4===i)));
  return {hands,teams:hands.map(h=>h.some(c=>c.suit===3&&(c.rank===14||c.rank===3))?1:0),revealed:[0,0,0,0],turn:hands.findIndex(h=>h.some(c=>c.rank===4&&c.suit===0)),first:true,last:null,passes:0,order:[],finishedNaturally:[],status:'playing',scores:[0,0,0,0],log:['新局开始 · ♦4 先出'],version:0};
}
export const names=['你','阿桂','小漓','老邕'];
export function settle(teams:number[],order:number[]):number[]{
  const a3=teams.map((t,i)=>t?i:-1).filter(i=>i>=0);
  if(a3.length===1){const total=[6,3,-3,-6][order.indexOf(a3[0])];return teams.map(t=>t?total:-total/3);}
  const score=5-a3.reduce((sum,s)=>sum+order.indexOf(s),0)-2;
  return teams.map(t=>t?score:-score);
}
const next=(g:Game,seat:number)=>{for(let i=1;i<=4;i++){const s=(seat+i)%4;if(g.hands[s].length)return s;}return seat;};
export function act(source:Game,seat:number,cards:Card[]):Result{
  if(source.status==='tribute')return {ok:false,error:'请先完成进贡与还贡'};
  if(source.status!=='playing')return {ok:false,error:'本局已经结束'};
  if(seat!==source.turn)return {ok:false,error:'还没轮到你'};
  if(new Set(cards.map(id)).size!==cards.length||cards.some(c=>!source.hands[seat].some(h=>id(h)===id(c))))return {ok:false,error:'只能打出自己的手牌，不能重复选牌'};
  if(!cards.length){
    if(!source.last)return {ok:false,error:'领出时不能过牌'};
    if(source.hands[seat].length===1&&beats(source.hands[seat],source.last.cards))return {ok:false,error:'报单后，能压必须打'};
  }else{
    if(!classify(cards))return {ok:false,error:'请选择单张、对子、三张或合法五张牌型'};
    if(source.first&&!cards.some(c=>c.rank===4&&c.suit===0))return {ok:false,error:'第一手必须带上 ♦4'};
    if(source.last&&!beats(cards,source.last.cards))return {ok:false,error:'需要同张数且更大的牌'};
  }
  const g:Game=JSON.parse(JSON.stringify(source));g.version++;
  if(!cards.length){
    g.passes++;g.log.push(`${seat}号位 · 过牌`);
    const active=g.hands.filter(h=>h.length).length;
    const needed=active-(g.hands[g.last!.seat].length?1:0);
    if(g.passes>=needed){const winner=g.last!.seat;g.turn=g.hands[winner].length?winner:next(g,winner);g.last=null;g.passes=0;g.log.push(`${g.turn}号位 · 重新领出`);}else g.turn=next(g,seat);
  }else{
    g.hands[seat]=g.hands[seat].filter(c=>!cards.some(p=>id(p)===id(c)));
    g.revealed[seat]+=cards.filter(c=>c.suit===3&&(c.rank===14||c.rank===3)).length;
    g.last={seat,cards:[...cards]};g.first=false;g.passes=0;
    g.log.push(`${seat}号位 · ${classify(cards)!.kind} ${cards.map(label).join(' ')}`);
    if(g.hands[seat].length===1)g.log.push(`${seat}号位 · 报单`);
    if(!g.hands[seat].length){g.order.push(seat);g.finishedNaturally.push(seat);g.log.push(`${seat}号位 · 第${g.order.length}名`);}
    const solo=g.teams.filter(t=>t===1).length===1;
    const done=solo?(g.order.some(s=>g.teams[s]===1)||g.order.length===3):[0,1].some(t=>g.teams.every((team,s)=>team!==t||g.order.includes(s)));
    if(done){g.order.push(...[0,1,2,3].filter(s=>!g.order.includes(s)));g.scores=settle(g.teams,g.order);g.totals=(g.totals||[0,0,0,0]).map((t,i)=>t+g.scores[i]);g.status='finished';}
    else g.turn=next(g,seat);
  }
  g.log=g.log.slice(-40);return {ok:true,state:g};
}
function combinations(hand:Card[],size:number):Card[][]{
  const all:Card[][]=[];const walk=(at:number,c:Card[])=>{if(c.length===size){all.push(c);return;}for(let i=at;i<=hand.length-(size-c.length);i++)walk(i+1,[...c,hand[i]]);};walk(0,[]);return all;
}
export function movesFor(hand:Card[],last:Card[]|null,first:boolean):Card[][]{
  return (last?[last.length]:[5,3,2,1]).flatMap(n=>combinations(hand,n)).filter(c=>classify(c)&&(!first||c.some(p=>p.rank===4&&p.suit===0))&&(!last||beats(c,last))).sort((a,b)=>b.length-a.length||(classify(a)!.level-classify(b)!.level)||classify(a)!.value-classify(b)!.value);
}
export function legalMoves(g:Game,seat:number){return g.status==='playing'&&g.turn===seat?movesFor(g.hands[seat],g.last?.cards||null,g.first):[];}
export function view(g:Game,seat:number){
  const mine=(t:Transfer)=>t.from===seat||t.to===seat;
  const selecting=g.tribute?.selection;
  const selection=selecting?{quotas:{...selecting.quotas},choices:JSON.parse(JSON.stringify(selecting.choices)) as Record<number,number[]>,locked:[...selecting.locked],duel:selecting.duel?{id:selecting.duel.id,players:[...selecting.duel.players],round:selecting.duel.round,submitted:Object.keys(selecting.duel.moves).map(Number),ownMove:selecting.duel.moves[seat]||null}:null}:null;
  const tribute=g.tribute?{exempt:g.tribute.exempt,selection,contests:JSON.parse(JSON.stringify(g.tribute.contests||[])) as TributeContest[],transfers:g.tribute.transfers.map(t=>({from:t.from,to:t.to,card:mine(t)||!!selecting?.quotas[seat]?t.card:null,returned:!!t.back,back:mine(t)?t.back:null}))}:null;
  const identity=(s:number)=>g.teams[s]?(g.teams.filter(t=>t===1).length===1?'独食':'A3方'):'农民方';
  const teammateHands=g.finishedNaturally.includes(seat)&&g.hands[seat].length===0?g.hands.flatMap((hand,who)=>who!==seat&&g.teams[who]===g.teams[seat]&&hand.length?[{seat:who,hand:hand.map(card=>({...card}))}]:[]):[];
  return {round:g.round||1,totals:g.totals||[0,0,0,0],tribute,pendingReturns:g.status==='tribute'&&!selecting?(g.tribute?.transfers.filter(t=>t.to===seat&&!t.back).length||0):0,seat,hand:g.hands[seat],teammateHands,players:g.hands.map((h,i)=>({seat:i,count:h.length,identity:g.status==='finished'?identity(i):g.revealed[i]===2?'独食':g.revealed[i]?'A3方':'身份未明',rank:g.order.includes(i)?g.order.indexOf(i)+1:null,supplemented:g.order.includes(i)&&!g.finishedNaturally.includes(i)})),ownIdentity:identity(seat),turn:g.turn,first:g.first,last:g.last,status:g.status,scores:g.scores,log:g.log,version:g.version};}
export type GameView=ReturnType<typeof view>;

// ---------------- 进贡 / 还贡 (rules §10, recommended fixed rules §17) ----------------
export const isIdentity=(c:Card)=>c.suit===3&&(c.rank===14||c.rank===3);
/** ♦4 stays with its holder during returns so the opening seat cannot change. */
export const isOpeningCard=(c:Card)=>c.rank===4&&c.suit===0;
export const canReturnTribute=(c:Card)=>!isIdentity(c)&&!isOpeningCard(c);
/** Who pays whom, from the finished previous game. */
export function tributePlan(prev:Game):{from:number;to:number}[]{
  if(prev.status!=='finished')return [];
  const o=prev.order,solo=prev.teams.filter(t=>t===1).length===1;
  if(solo){const s=prev.teams.indexOf(1),others=o.filter(x=>x!==s),rank=o.indexOf(s),count=rank===0||rank===3?2:1;return others.flatMap(other=>Array.from({length:count},()=>rank<2?{from:other,to:s}:{from:s,to:other}));}
  const win=prev.scores[o[0]];
  if(win>=2)return [{from:o[3],to:o[0]},{from:o[3],to:o[0]},{from:o[2],to:o[1]},{from:o[2],to:o[1]}]; // 全败：每人两张
  if(win===1)return [{from:o[3],to:o[0]},{from:o[1],to:o[2]}]; // 半败：末游→头游，二游→三游，各一张
  return [];                                                   // 平局不进贡
}
/** Largest card except ♠A / ♠3. */
export const tributeCard=(hand:Card[])=>sort(hand.filter(c=>!isIdentity(c))).pop()!;
export function createNextGame(prev:Game,random:()=>number=Math.random):Game{
  const g=createGame(random);
  g.round=(prev.round||1)+1;g.totals=[...(prev.totals||prev.scores||[0,0,0,0])];g.version=prev.version+1;
  g.log=[`第 ${g.round} 局开始`];
  const plan=tributePlan(prev);
  if(!plan.length){g.tribute=null;g.log.push(prev.status==='finished'?'上局平局 · 不进贡':'不进贡','♦4 先出');return g;}
  const transfers:Transfer[]=[];
  const quotas:Record<number,number>={};
  for(const p of plan)quotas[p.to]=(quotas[p.to]||0)+1;
  const selecting=Object.keys(quotas).length>1;
  for(const p of plan){
    const card=tributeCard(g.hands[p.from]);
    g.hands[p.from]=g.hands[p.from].filter(c=>id(c)!==id(card));
    if(!selecting)g.hands[p.to]=sort([...g.hands[p.to],card]);
    transfers.push({from:p.from,to:selecting?-1:p.to,card,back:null});
  }
  for(const [i,p] of plan.entries()){
    if(plan.findIndex(t=>t.from===p.from&&t.to===p.to)!==i)continue;
    const count=plan.filter(t=>t.from===p.from&&t.to===p.to).length;
    g.log.push(`${p.from}号位 · ${count===2?'大贡':'小贡'} ${count} 张${selecting?'放入贡牌池':` → ${p.to}号位`}`);
  }
  g.tribute={transfers,exempt:null,selection:selecting?{quotas,choices:{},locked:[],duel:null}:null,contests:[]};g.status='tribute';g.turn=-1;
  return g;
}
export function returnTribute(source:Game,seat:number,card:Card):Result{
  if(source.status!=='tribute'||!source.tribute)return {ok:false,error:'现在不是还贡环节'};
  if(source.tribute.selection)return {ok:false,error:'请先完成贡牌预选，冲突解决后才能还贡'};
  const t=source.tribute.transfers.find(t=>t.to===seat&&!t.back);
  if(!t)return {ok:false,error:'你无需还贡'};
  if(!source.hands[seat].some(c=>id(c)===id(card)))return {ok:false,error:'只能还自己的手牌'};
  if(isIdentity(card))return {ok:false,error:'还贡不能返还身份牌 ♠A、♠3'};
  if(isOpeningCard(card))return {ok:false,error:'还贡不能返还 ♦4，请选其他牌'};
  const g:Game=JSON.parse(JSON.stringify(source));g.version++;
  const tt=g.tribute!.transfers.find(x=>x.to===seat&&!x.back)!;
  g.hands[seat]=g.hands[seat].filter(c=>id(c)!==id(card));g.hands[tt.from]=sort([...g.hands[tt.from],card]);tt.back=card;
  g.log.push(`${seat}号位 → ${tt.from}号位 · 还贡一张`);
  if(g.tribute!.transfers.every(x=>x.back)){
    g.status='playing';g.first=true;g.turn=g.hands.findIndex(h=>h.some(c=>c.rank===4&&c.suit===0));
    g.teams=g.hands.map(h=>h.some(isIdentity)?1:0);g.log.push('进贡完成 · ♦4 先出');
  }
  return {ok:true,state:g};
}
/** Bot choice: return the smallest eligible card other than the tribute received. */
export function botReturn(g:Game,seat:number):Card|null{
  const t=g.tribute?.transfers.find(t=>t.to===seat&&!t.back);if(!t)return null;
  return sort(g.hands[seat]).find(c=>canReturnTribute(c)&&id(c)!==id(t.card))||null;
}

/** Shared by every client: only overlapping complete pre-selections need arbitration. */
export function tributeConflicts(selection:Pick<TributeSelection,'choices'>):[number,number][]{
  const seats=Object.keys(selection.choices).map(Number),pairs:[number,number][]=[];
  for(let i=0;i<seats.length;i++)for(let j=i+1;j<seats.length;j++){
    const a=seats[i],b=seats[j];if(selection.choices[a].some(card=>selection.choices[b].includes(card)))pairs.push([a,b]);
  }
  return pairs;
}
export const rpsLabel=(move:RpsMove)=>({rock:'石头',paper:'布',scissors:'剪刀'})[move];
export function tributeAction(source:Game,seat:number,action:TributeAction):Result{
  if(action.kind==='return')return returnTribute(source,seat,action.card);
  const selection=source.tribute?.selection;
  if(source.status!=='tribute'||!selection)return {ok:false,error:'现在不是贡牌预选环节'};
  if(!selection.quotas[seat])return {ok:false,error:'你不是本轮受贡者'};
  const fail=(error:string):Result=>({ok:false,error});
  if(action.kind==='select'){
    if(selection.duel)return fail('猜拳进行中，出结果后再改选');
    if(selection.locked.includes(seat))return fail('猜拳胜出的预选已经锁定');
    if(action.cards.length!==selection.quotas[seat]||new Set(action.cards).size!==action.cards.length)return fail(`请预选 ${selection.quotas[seat]} 张不同的贡牌`);
    if(action.cards.some(i=>!Number.isInteger(i)||i<0||i>=source.tribute!.transfers.length))return fail('只能选择贡牌池中的牌');
    if(selection.locked.some(s=>selection.choices[s].some(i=>action.cards.includes(i))))return fail('这些牌已经由猜拳胜者选定，请选择剩余贡牌');
  }else if(action.kind==='rps-start'){
    if(selection.duel)return fail('已经有一场猜拳正在进行');
    if(action.opponent===seat||!tributeConflicts(selection).some(pair=>pair.includes(seat)&&pair.includes(action.opponent)))return fail('只有选牌冲突的两人可以发起猜拳');
  }else{
    const duel=selection.duel;
    if(!duel||!duel.players.includes(seat))return fail('你不在本次猜拳中');
    if(action.duelId!==duel.id||action.round!==duel.round)return fail('猜拳已进入下一轮，请重新出拳');
    if(duel.moves[seat])return fail('已出拳，等待对方');
    if(!['rock','paper','scissors'].includes(action.move))return fail('请选择石头、剪刀或布');
  }
  const g:Game=JSON.parse(JSON.stringify(source));g.version++;
  const s=g.tribute!.selection!;
  if(action.kind==='select'){
    s.choices[seat]=[...action.cards];g.log.push(`${seat}号位 · 已提交贡牌预选`);
  }else if(action.kind==='rps-start'){
    s.duel={id:g.version,players:[seat,action.opponent],moves:{},round:1};
    g.log.push(`${seat}号位 与 ${action.opponent}号位 · 选牌冲突，发起猜拳`);
  }else{
    const duel=s.duel!;duel.moves[seat]=action.move;
    const [a,b]=duel.players;
    if(duel.moves[a]&&duel.moves[b]){
      const moves=[duel.moves[a],duel.moves[b]],draw=moves[0]===moves[1];
      const winner=draw?null:({rock:'scissors',scissors:'paper',paper:'rock'}[moves[0]]===moves[1]?a:b);
      (g.tribute!.contests??=[]).push({players:[a,b],moves,winner,round:duel.round});
      if(winner===null){g.log.push(`猜拳第 ${duel.round} 轮 · 双方${rpsLabel(moves[0])}，平手重来`);duel.round++;duel.moves={};}
      else{
        s.locked.push(winner);
        for(const other of Object.keys(s.choices).map(Number))if(other!==winner)s.choices[other]=s.choices[other].filter(i=>!s.choices[winner].includes(i));
        g.log.push(`${winner}号位 · 猜拳胜出，保留预选；其他受贡者重选冲突牌`);s.duel=null;
      }
    }
  }
  if(!s.duel&&!tributeConflicts(s).length&&Object.entries(s.quotas).every(([who,quota])=>s.choices[Number(who)]?.length===quota)){
    for(const who of Object.keys(s.quotas).map(Number))for(const i of s.choices[who]){
      const transfer=g.tribute!.transfers[i];transfer.to=who;g.hands[who]=sort([...g.hands[who],transfer.card]);
    }
    g.tribute!.selection=null;g.log.push('贡牌预选无冲突 · 分牌完成，请等量还贡');
  }
  return {ok:true,state:g};
}

/** Robots prefer uncontested cards, and submit a hidden random gesture if challenged. */
export function botTributeAction(g:Game,seat:number,random:()=>number=Math.random):TributeAction|null{
  if(g.status!=='tribute'||!g.tribute)return null;
  const s=g.tribute.selection;
  if(!s){const card=botReturn(g,seat);return card?{kind:'return',card}:null;}
  if(!s.quotas[seat])return null;
  if(s.duel)return s.duel.players.includes(seat)&&!s.duel.moves[seat]?{kind:'rps',move:(['rock','paper','scissors'] as const)[Math.floor(random()*3)],round:s.duel.round,duelId:s.duel.id}:null;
  if(s.locked.includes(seat))return null;
  const own=s.choices[seat]||[],conflict=tributeConflicts(s).some(pair=>pair.includes(seat));
  if(own.length===s.quotas[seat]&&!conflict)return null;
  const taken=new Set(Object.entries(s.choices).filter(([who])=>Number(who)!==seat).flatMap(([,cards])=>cards));
  const cards=g.tribute.transfers.map((_,i)=>i).filter(i=>!taken.has(i)).slice(0,s.quotas[seat]);
  return cards.length===s.quotas[seat]?{kind:'select',cards}:null;
}
