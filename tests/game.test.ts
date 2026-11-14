import { expect, test } from 'vitest';
import { classify, createGame, act, legalMoves, view, settle, beats } from '../src/core/game';
const cards = (ranks: number[], suits = ranks.map((_,i)=>i%4)) => ranks.map((rank,i)=>({rank,suit:suits[i]}));
test('八种牌型、3最小的顺子、2禁止入顺，四张不能裸出',()=>{
  expect(classify(cards([3,4,5,6,7]))?.kind).toBe('顺子');
  expect(classify(cards([2,3,4,5,6]))).toBeNull();
  expect(classify(cards([8,8,8,8]))).toBeNull();
  expect(classify(cards([8,8,8,8,4]))?.kind).toBe('四带一');
  expect(classify(cards([8,8,8,4,4],[0,1,2,0,1]))?.kind).toBe('三带二');
  expect(classify(cards([10,11,12,13,14],[3,3,3,3,3]))?.kind).toBe('同花顺');
});
test('洗牌守恒、首出校验、完整对局和零和结算',()=>{
  for(let seed=1;seed<=40;seed++){
    let n=seed;const random=()=>((n=(n*1664525+1013904223)>>>0)/4294967296);
    let g=createGame(random);
    expect(new Set(g.hands.flat().map(c=>`${c.rank}-${c.suit}`)).size).toBe(52);
    expect(act(g,g.turn,[]).ok).toBe(false);
    expect(view(g,0).players[1]).not.toHaveProperty('hand');
    let steps=0;
    while(g.status==='playing'&&steps++<1000){
      const move=legalMoves(g,g.turn)[0]||[];
      const result=act(g,g.turn,move);expect(result.ok).toBe(true);
      if(result.ok)g=result.state;
    }
    expect(g.status).toBe('finished');
    expect(g.scores.reduce((a,b)=>a+b,0)).toBe(0);
    expect(g.order).toHaveLength(4);
  }
});
