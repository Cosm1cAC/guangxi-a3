import { chooseTribute } from './tribute-fixtures';
import {afterEach,expect,test,vi} from 'vitest';
import {DouyinGame,type GameServices,type RoomView} from '../src/douyin/controller';
import {createGame,createNextGame,view,id,isIdentity,isOpeningCard,canReturnTribute,legalMoves,tributeAction,type TributeAction} from '../src/core/game';

const make=()=>new DouyinGame({get:()=>null,put(){},remove(){},request:async()=>{throw Error('unexpected request');}});
afterEach(()=>vi.useRealTimers());

test('Douyin RPS waits for a manual confirmation and clears the draft after a tie',async()=>{
  vi.useFakeTimers();const game=make();game.pause();
  let g=createNextGame({...createGame(),status:'finished',teams:[1,1,0,0],order:[0,1,2,3],scores:[2,2,-2,-2]});
  const apply=(seat:number,action:TributeAction)=>{const result=tributeAction(g,seat,action);if(!result.ok)throw Error(result.error);g=result.state;};
  apply(0,{kind:'select',cards:[0,1]});apply(1,{kind:'select',cards:[1,2]});apply(0,{kind:'rps-start',opponent:1});
  const duel=g.tribute!.selection!.duel!;apply(1,{kind:'rps',move:'rock',round:duel.round,duelId:duel.id});
  game.local=g;game.toggleTeammates();expect(game.rpsDraft).toBeNull();
  await game.confirmRps();expect(game.local!.version).toBe(g.version);
  game.rps('rock');expect(game.rpsDraft).toBe('rock');expect(game.local!.version).toBe(g.version);
  await vi.advanceTimersByTimeAsync(60000);expect(game.local!.version).toBe(g.version);
  await game.confirmRps();expect(game.local!.tribute!.selection!.duel!.round).toBe(duel.round+1);expect(game.rpsDraft).toBeNull();
  const version=game.local!.version;await game.confirmRps();expect(game.local!.version).toBe(version);game.dispose();
});

test('Douyin practice completes two rounds with shared rules and zero-sum scores',async()=>{
  vi.useFakeTimers();const game=make();game.practice();
  for(let round=1;round<=2;round++){
    for(let step=0;step<500&&game.local!.status!=='finished';step++){
      const state=game.state!;
      if(state.tribute?.selection&&state.tribute.selection.choices[state.seat]?.length===state.tribute.selection.quotas[state.seat]){await vi.advanceTimersByTimeAsync(660);continue;}
      if(game.canAct){if(state.status==='tribute')game.hint();else game.selected=new Set((legalMoves(game.local!,0)[0]||[]).map(id));await game.submit(state.status==='playing'&&game.selected.size===0);}
      else await vi.advanceTimersByTimeAsync(660);
    }
    expect(game.local!.status).toBe('finished');expect(game.state!.scores.reduce((a,b)=>a+b,0)).toBe(0);
    if(round===1)await game.nextRound();
  }
  game.dispose();
});

test('Douyin exchange forbids identity/opening cards and confirms one return at a time',async()=>{
  vi.useFakeTimers();const game=make();
  const prev={...createGame(),status:'finished' as const,teams:[1,1,0,0],order:[0,1,2,3],scores:[2,2,-2,-2]};
  for(let seed=1;seed<100;seed++){let n=seed;const g=chooseTribute(createNextGame(prev,()=>((n=(n*1664525+1013904223)>>>0)/4294967296)));if(g.hands[0].some(isIdentity)&&g.hands[0].some(isOpeningCard)){game.local=g;break;}}
  expect(game.state!.pendingReturns).toBe(2);expect(game.message).toContain('待回 2 张');
  for(const card of game.state!.hand.filter(c=>isIdentity(c)||isOpeningCard(c))){game.selected=new Set([id(card)]);expect(game.canPlay).toBe(false);}
  game.hint();expect(game.state!.hand.filter(c=>game.selected.has(id(c))).every(canReturnTribute)).toBe(true);
  await game.submit();expect(game.state!.pendingReturns).toBe(1);game.hint();await game.submit();
  for(let step=0;step<10&&game.state!.status==='tribute';step++)await vi.advanceTimersByTimeAsync(650);
  expect(game.state!.status).toBe('playing');expect(game.local!.hands.map(hand=>hand.length)).toEqual([13,13,13,13]);
  game.dispose();
});

test('Douyin lifecycle pauses robots and drops replies belonging to an old room',async()=>{
  vi.useFakeTimers();const game=make();game.practice();game.local!.turn=1;game.local!.first=false;game.bot();game.pause();const version=game.local!.version;
  await vi.advanceTimersByTimeAsync(2000);expect(game.local!.version).toBe(version);game.resume();await vi.advanceTimersByTimeAsync(660);expect(game.local!.version).toBeGreaterThan(version);game.dispose();
  let reply!:(value:RoomView)=>void;
  const services:GameServices={get:()=>null,put(){},remove(){},request:()=>new Promise(resolve=>{reply=resolve;})};
  const online=new DouyinGame(services);online.session={token:'test',user:{name:'牌友',score:0,games:0,wins:0}};
  const room={...view(createGame(),0),room:'0123456789',roomStatus:'playing' as const,members:[{name:'牌友'}]};
  online.attach(room);const pending=online.refresh();online.practice();reply({...room,version:room.version+1});await pending;
  expect(online.remote).toBeNull();expect(online.local).not.toBeNull();online.dispose();
});
