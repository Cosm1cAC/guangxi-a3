import { expect, test } from 'vitest';
import { createGame, createNextGame, tributeAction, tributeConflicts, botTributeAction, returnTribute, view, isIdentity, id, power, type Game, type TributeAction } from '../src/core/game';
import { finishTribute } from './tribute-fixtures';

const seeded=(seed:number)=>{let n=seed;return()=>((n=(n*1664525+1013904223)>>>0)/4294967296);};
const next=()=>createNextGame({...createGame(),status:'finished',teams:[1,1,0,0],order:[0,1,2,3],scores:[2,2,-2,-2]},seeded(11));
const apply=(g:Game,seat:number,action:TributeAction)=>{const r=tributeAction(g,seat,action);if(!r.ok)throw Error(r.error);return r.state;};
const invariant=(g:Game)=>{
  const cards=[...g.hands.flat(),...(g.tribute?.selection?g.tribute.transfers.map(t=>t.card):[])];
  expect(cards).toHaveLength(52);expect(new Set(cards.map(id)).size).toBe(52);
};

test('两人交大贡入池，每人预选两张，无冲突后共同分牌并向原交牌者还贡',()=>{
  let g=next();const dealt=createGame(seeded(11));
  expect(g.hands.map(h=>h.length)).toEqual([13,13,11,11]);
  expect(g.tribute!.transfers.every(t=>t.to===-1)).toBe(true);expect(g.tribute!.selection!.quotas).toEqual({0:2,1:2});invariant(g);
  for(const payer of [2,3])expect(g.tribute!.transfers.filter(t=>t.from===payer).map(t=>t.card)).toEqual(dealt.hands[payer].filter(c=>!isIdentity(c)).sort((a,b)=>power(b)-power(a)).slice(0,2));
  expect(returnTribute(g,0,g.hands[0][0]).ok).toBe(false);
  expect(view(g,0).tribute!.transfers.every(t=>t.card)).toBe(true);expect(view(g,2).tribute!.transfers.filter(t=>t.from===3).every(t=>t.card===null)).toBe(true);
  g=apply(g,0,{kind:'select',cards:[0,2]});expect(g.hands[0]).toHaveLength(13);expect(view(g,0).pendingReturns).toBe(0);invariant(g);
  g=apply(g,1,{kind:'select',cards:[1,3]});
  expect(g.tribute!.selection).toBeNull();expect(g.hands.map(h=>h.length)).toEqual([15,15,11,11]);expect(g.tribute!.transfers.map(t=>t.to)).toEqual([0,1,0,1]);invariant(g);
  for(const t of [...g.tribute!.transfers]){const r=returnTribute(g,t.to,t.card);expect(r.ok).toBe(true);if(r.ok)g=r.state;}
  expect(g.status).toBe('playing');expect(g.hands.map(h=>h.length)).toEqual([13,13,13,13]);expect(g.turn).toBe(dealt.turn);invariant(g);
});

test('预选冲突不分牌；双方可改选协商，重复、越界、越权与自己猜拳均被拒绝',()=>{
  let g=apply(next(),0,{kind:'select',cards:[0,1]});g=apply(g,1,{kind:'select',cards:[1,2]});
  expect(tributeConflicts(g.tribute!.selection!)).toEqual([[0,1]]);expect(g.hands[0]).toHaveLength(13);invariant(g);
  const original=JSON.stringify(g);
  for(const [seat,action] of [[0,{kind:'select',cards:[0,0]}],[0,{kind:'select',cards:[0]}],[0,{kind:'select',cards:[0,99]}],[2,{kind:'select',cards:[0,1]}],[0,{kind:'rps-start',opponent:0}]] as [number,TributeAction][]){expect(tributeAction(g,seat,action).ok).toBe(false);}
  expect(JSON.stringify(g)).toBe(original);g=apply(g,1,{kind:'select',cards:[2,3]});expect(g.tribute!.selection).toBeNull();invariant(g);
});

test('猜拳手势保密、平手重猜、防重复与旧轮次，胜者锁定，败者从剩余牌重选',()=>{
  let g=apply(next(),0,{kind:'select',cards:[0,1]});g=apply(g,1,{kind:'select',cards:[1,2]});g=apply(g,1,{kind:'rps-start',opponent:0});
  const duelId=g.tribute!.selection!.duel!.id;
  g=apply(g,0,{kind:'rps',move:'rock',round:1,duelId});
  expect(view(g,1).tribute!.selection!.duel).toMatchObject({ownMove:null,submitted:[0]});
  expect(JSON.stringify(view(g,1))).not.toContain('rock');expect(view(g,0).tribute!.selection!.duel!.ownMove).toBe('rock');
  for(const seat of [2,3])expect(JSON.stringify(view(g,seat))).not.toContain('rock');
  expect(tributeAction(g,0,{kind:'rps',move:'paper',round:1,duelId}).ok).toBe(false);
  expect(tributeAction(g,2,{kind:'rps',move:'paper',round:1,duelId}).ok).toBe(false);
  expect(tributeAction(g,0,{kind:'select',cards:[2,3]}).ok).toBe(false);
  g=apply(g,1,{kind:'rps',move:'rock',round:1,duelId});
  expect(g.tribute!.contests!.at(-1)!.winner).toBeNull();expect(g.tribute!.selection!.duel!.round).toBe(2);
  expect(tributeAction(g,0,{kind:'rps',move:'paper',round:1,duelId}).ok).toBe(false);
  expect(tributeAction(g,0,{kind:'rps',move:'paper',round:2,duelId:duelId+1}).ok).toBe(false);
  g=apply(g,0,{kind:'rps',move:'paper',round:2,duelId});g=apply(g,1,{kind:'rps',move:'rock',round:2,duelId});
  expect(g.tribute!.selection!.locked).toEqual([0]);expect(g.tribute!.selection!.choices).toEqual({0:[0,1],1:[2]});expect(g.tribute!.contests!.at(-1)!.winner).toBe(0);invariant(g);
  expect(tributeAction(g,0,{kind:'select',cards:[2,3]}).ok).toBe(false);expect(tributeAction(g,1,{kind:'select',cards:[1,3]}).ok).toBe(false);
  g=apply(g,1,{kind:'select',cards:[2,3]});expect(g.tribute!.selection).toBeNull();
  const done=finishTribute(g);expect(done.status).toBe('playing');invariant(done);expect(done.hands.every(h=>h.length===13)).toBe(true);
});

test('小贡各选一张；独食全败的三名受贡者也能从六张牌中协商或猜拳分牌',()=>{
  const small=createNextGame({...createGame(),status:'finished',teams:[1,0,1,0],order:[0,1,2,3],scores:[1,-1,1,-1]},seeded(1));
  expect(small.tribute!.transfers).toHaveLength(2);expect(small.tribute!.selection!.quotas).toEqual({0:1,2:1});expect(finishTribute(small).hands.every(h=>h.length===13)).toBe(true);
  let g=createNextGame({...createGame(),status:'finished',teams:[0,0,0,1],order:[0,1,2,3],scores:[2,2,2,-6]},seeded(11));
  expect(g.tribute!.selection!.quotas).toEqual({0:2,1:2,2:2});
  g=apply(g,0,{kind:'select',cards:[0,1]});g=apply(g,1,{kind:'select',cards:[1,2]});g=apply(g,2,{kind:'select',cards:[0,3]});g=apply(g,0,{kind:'rps-start',opponent:1});
  const duel=g.tribute!.selection!.duel!;
  g=apply(g,0,{kind:'rps',move:'rock',round:1,duelId:duel.id});g=apply(g,1,{kind:'rps',move:'scissors',round:1,duelId:duel.id});
  expect(g.tribute!.selection!.choices).toEqual({0:[0,1],1:[2],2:[3]});const done=finishTribute(g);invariant(done);expect(done.hands.every(h=>h.length===13)).toBe(true);
});

test('机器人会避开对方预选，并在受邀猜拳后只提交一次自己的手势',()=>{
  let g=apply(next(),0,{kind:'select',cards:[0,1]});expect(botTributeAction(g,1)).toEqual({kind:'select',cards:[2,3]});
  g=apply(g,1,{kind:'select',cards:[0,2]});g=apply(g,0,{kind:'rps-start',opponent:1});
  const action=botTributeAction(g,1,()=>0)!;expect(action).toMatchObject({kind:'rps',move:'rock'});g=apply(g,1,action);expect(botTributeAction(g,1)).toBeNull();
});

test('结算公开独食身份，普通 A3 队伍仍显示 A3方',()=>{
  const solo={...createGame(),status:'finished' as const,teams:[0,0,0,1],order:[0,1,2,3],finishedNaturally:[0,1,2],scores:[2,2,2,-6]};
  for(let seat=0;seat<4;seat++)expect(view(solo,seat).players[3].identity).toBe('独食');
  expect(view({...solo,teams:[1,1,0,0]},0).players[0].identity).toBe('A3方');
});
