import { chooseTribute } from './tribute-fixtures';
import { expect, test } from 'vitest';
import { createGame, createNextGame, returnTribute, botReturn, tributePlan, settle, act, legalMoves, view, isIdentity, isOpeningCard, id, power, type Game } from '../src/core/game';

const seeded = (seed: number) => { let n = seed; return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296); };
const finished = (teams: number[], order: number[], scores: number[]): Game => ({ ...createGame(seeded(1)), teams, order, scores, status: 'finished', totals: scores });
const play = (g: Game) => { let steps = 0; while (g.status === 'playing' && steps++ < 1000) { const r = act(g, g.turn, legalMoves(g, g.turn)[0] || []); if (!r.ok) throw Error(r.error); g = r.state; } return g; };
const settleTribute = (g: Game) => { while (g.status === 'tribute') { const t = g.tribute!.transfers.find(t => !t.back)!; const r = returnTribute(g, t.to, botReturn(g, t.to)!); if (!r.ok) throw Error(r.error); g = r.state; } return g; };

test('进贡对象：全败两张、半败一张、平局不贡、独食胜负', () => {
  expect(tributePlan(finished([1, 1, 0, 0], [0, 1, 2, 3], [2, 2, -2, -2]))).toEqual([{ from: 3, to: 0 }, { from: 3, to: 0 }, { from: 2, to: 1 }, { from: 2, to: 1 }]);
  expect(tributePlan(finished([1, 0, 1, 0], [0, 1, 2, 3], [1, -1, 1, -1]))).toEqual([{ from: 3, to: 0 }, { from: 1, to: 2 }]);
  expect(tributePlan(finished([1, 0, 0, 1], [0, 1, 2, 3], [0, 0, 0, 0]))).toEqual([]);
  for(let rank=0;rank<4;rank++){
    const order=[3,0,1];order.splice(rank,0,2);
    const teams=[0,0,1,0],plan=tributePlan(finished(teams,order,settle(teams,order)));
    const count=rank===0||rank===3?2:1;
    expect(plan).toHaveLength(count*3);
    for(const other of [0,1,3])expect(plan.filter(t=>rank<2?t.from===other&&t.to===2:t.from===2&&t.to===other)).toHaveLength(count);
  }
  for(const teams of [[1,0,0,1],[0,1,1,0]]){
    const prev=finished(teams,[0,1,2,3],settle(teams,[0,1,2,3]));
    expect(prev.scores.every(s=>s===0)).toBe(true);
    const next=chooseTribute(createNextGame(prev,seeded(5)));expect(next.tribute).toBeNull();expect(next.status).toBe('playing');
  }
});

test('贡最大非身份牌、还贡校验、张数守恒、♦4 先出与累计积分', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rnd = seeded(seed);
    let g = play(createGame(rnd));
    const prevTotals = g.totals!;
    const next = chooseTribute(createNextGame(g, rnd));
    expect(next.round).toBe(2); expect(next.version).toBeGreaterThan(g.version); expect(next.totals).toEqual(prevTotals);
    expect(next.hands.flat()).toHaveLength(52);
    if (next.status === 'tribute') {
      for (const t of next.tribute!.transfers) {
        expect(isIdentity(t.card)).toBe(false);
        // tribute was the giver's largest non-identity card at the time of paying
        expect(next.hands[t.from].filter(c => !isIdentity(c)).every(c => power(c) < power(t.card))).toBe(true);
      }
      expect(act(next, 0, []).ok).toBe(false);
      expect(view(next, 0).players.every(p => p.identity === '身份未明')).toBe(true);
      const t = next.tribute!.transfers[0];
      expect(returnTribute(next, t.to, t.card).ok).toBe(true);
      const identity = next.hands[t.to].find(isIdentity); if (identity) expect(returnTribute(next, t.to, identity).ok).toBe(false);
      const nonReceiver = [0, 1, 2, 3].find(s => !next.tribute!.transfers.some(x => x.to === s))!;
      expect(returnTribute(next, nonReceiver, next.hands[nonReceiver][0])).toEqual({ ok: false, error: '你无需还贡' });
      // others cannot see the face-down tribute card
      const outsider = [0, 1, 2, 3].find(s => !next.tribute!.transfers.some(x => x.from === s || x.to === s));
      if (outsider !== undefined) expect(view(next, outsider).tribute!.transfers.every(x => x.card === null)).toBe(true);
    }
    g = settleTribute(next);
    expect(g.status).toBe('playing'); expect(g.hands.every(h => h.length === 13)).toBe(true);
    expect(g.hands[g.turn].some(c => c.rank === 4 && c.suit === 0)).toBe(true);
    expect(g.teams).toEqual(g.hands.map(h => h.some(isIdentity) ? 1 : 0));
    g = play(g);
    expect(g.totals!.reduce((a, b) => a + b, 0)).toBe(0);
    expect(g.totals).toEqual(prevTotals.map((t, i) => t + g.scores[i]));
    expect(new Set(g.hands.flat().map(id)).size).toBe(g.hands.flat().length);
  }
});

test('输方摸到双牌仍照常进贡，不再免贡或抗贡', () => {
  for (let seed = 1; seed < 400; seed++) {
    const prev = finished([1, 1, 0, 0], [0, 1, 2, 3], [2, 2, -2, -2]);
    const next = chooseTribute(createNextGame(prev, seeded(seed)));
    const solo = next.teams.filter(t => t).length === 1 ? next.teams.indexOf(1) : -1;
    if (solo === 2 || solo === 3) { expect(next.status).toBe('tribute'); expect(next.tribute?.exempt).toBeNull(); expect(next.tribute!.transfers).toHaveLength(4); expect(next.tribute!.transfers.every(t => !isIdentity(t.card))).toBe(true); return; }
  }
  throw Error('no exemption seed found');
});


test('受贡者可返还原贡牌、禁止身份牌和 ♦4，多张逐笔返还且所有人还完前不能开打', () => {
  const prev = finished([1, 1, 0, 0], [0, 1, 2, 3], [2, 2, -2, -2]);
  let identityChecked = false;
  let openingChecked = false;
  for (let seed = 1; seed <= 30; seed++) {
    const next = chooseTribute(createNextGame(prev, seeded(seed)));
    if (next.status !== 'tribute') continue;
    const transfer = next.tribute!.transfers[0];
    for (const card of next.hands[transfer.to]) {
      identityChecked ||= isIdentity(card);
      const r = returnTribute(next, transfer.to, card);
      if(isIdentity(card)){expect(r).toEqual({ok:false,error:'还贡不能返还身份牌 ♠A、♠3'});continue;}
      if(isOpeningCard(card)){
        openingChecked=true;
        expect(r).toEqual({ok:false,error:'还贡不能返还 ♦4，请选其他牌'});
        expect(next.hands[transfer.to]).toContainEqual(card);
        expect(next.tribute!.transfers[0].back).toBeNull();
        expect(botReturn(next,transfer.to)).not.toEqual(card);
        continue;
      }
      expect(r.ok, `应允许自由返还 ${id(card)}`).toBe(true);
      if (!r.ok) throw Error(r.error);
      expect(r.state.status).toBe('tribute');
      expect(r.state.hands[transfer.from]).toContainEqual(card);
      expect(r.state.hands[transfer.to]).not.toContainEqual(card);
      expect(act(r.state, 0, []).ok).toBe(false);
      expect(returnTribute(r.state, transfer.to, card).ok).toBe(false);
      const done = settleTribute(r.state);
      expect(done.hands.every(h => h.length === 13)).toBe(true);
      expect(new Set(done.hands.flat().map(id)).size).toBe(52);
      expect(done.teams).toEqual(done.hands.map(h => h.some(isIdentity) ? 1 : 0));
      expect(done.hands[done.turn]).toContainEqual({rank:4,suit:0});
    }
  }
  expect(identityChecked).toBe(true);
  expect(openingChecked).toBe(true);
});

test('所有座位和名次组合均按大贡两张、小贡一张、平局零张发放并等量返还',()=>{
  const permutations=(seats:number[]):number[][]=>seats.length?seats.flatMap(s=>permutations(seats.filter(x=>x!==s)).map(rest=>[s,...rest])):[[]];
  for(const order of permutations([0,1,2,3]))for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
    const teams=[0,1,2,3].map(s=>s===a||s===b?1:0);
    const tier=teams[order[0]]===teams[order[1]]?2:teams[order[0]]===teams[order[2]]?1:0;
    const next=chooseTribute(createNextGame(finished(teams,order,settle(teams,order)),seeded(11)));
    expect(next.tribute?.transfers.length||0).toBe(tier*2);
    for(const winner of tier===2?order.slice(0,2):tier===1?[order[0],order[2]]:[]){
      expect(view(next,winner).pendingReturns).toBe(tier);
      expect(next.hands[winner]).toHaveLength(13+tier);
    }
    const opener=next.hands.findIndex(h=>h.some(isOpeningCard));
    const done=settleTribute(next);
    expect(done.turn).toBe(opener);
    expect(done.hands.every(h=>h.length===13)).toBe(true);
    expect(new Set(done.hands.flat().map(id)).size).toBe(52);
  }
});

test('独食四档贡牌：最大牌顺序、隐私、52张唯一牌与身份不变',()=>{
  for(let rank=0;rank<4;rank++){
    const order=[3,0,1];order.splice(rank,0,2);const teams=[0,0,1,0];
    const next=chooseTribute(createNextGame(finished(teams,order,settle(teams,order)),seeded(11)));
    const dealt=createGame(seeded(11)),expected=dealt.hands.map(h=>h.filter(c=>!isIdentity(c)).sort((a,b)=>power(b)-power(a)));
    for(const t of next.tribute!.transfers){
      expect(t.card).toEqual(expected[t.from].shift());
      for(const seat of [0,1,2,3].filter(s=>s!==t.from&&s!==t.to))expect(view(next,seat).tribute!.transfers[next.tribute!.transfers.indexOf(t)].card).toBeNull();
    }
    const done=settleTribute(next);
    expect(done.hands.every(h=>h.length===13)).toBe(true);
    expect(new Set(done.hands.flat().map(id)).size).toBe(52);
    expect(done.teams).toEqual(dealt.teams);
  }
});
