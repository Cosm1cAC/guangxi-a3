import {expect,test} from 'vitest';
import {act,createGame,view,type Game,type Card} from '../src/core/game';

const c=(rank:number,suit=0):Card=>({rank,suit});
function game():Game{return {...createGame(),hands:[[c(4)],[c(9),c(10)],[c(13,1),c(13,3)],[c(11),c(12)]],teams:[1,0,1,0],first:false,turn:0,last:null};}
test('只有真正出完牌的玩家能查看队友当前手牌，不能看到敌方',()=>{
  const g=game();for(let seat=0;seat<4;seat++)expect(view(g,seat).teammateHands).toEqual([]);
  const out=act(g,0,[c(4)]);expect(out.ok).toBe(true);if(!out.ok)return;
  expect(out.state.status).toBe('playing');expect(view(out.state,0).teammateHands).toEqual([{seat:2,hand:[c(13,1),c(13,3)]}]);
  for(const seat of [1,2,3])expect(view(out.state,seat).teammateHands).toEqual([]);
  const passed=act(out.state,1,[]);if(!passed.ok)throw Error(passed.error);
  const played=act(passed.state,2,[c(13,1)]);if(!played.ok)throw Error(played.error);
  expect(view(played.state,0).teammateHands).toEqual([{seat:2,hand:[c(13,3)]}]);
  const publicView=view(played.state,0);publicView.teammateHands[0].hand[0].rank=2;expect(played.state.hands[2][0].rank).toBe(13);
});
test('自动补名次、仅手牌空或仅标记走掉都不能解锁；新局不会沿用权限',()=>{
  const g=game();g.order=[0];expect(view(g,0).teammateHands).toEqual([]);g.hands[0]=[];expect(view(g,0).teammateHands).toEqual([]);
  const forged=game();forged.finishedNaturally=[0];expect(view(forged,0).teammateHands).toEqual([]);
  expect(view(createGame(),0).teammateHands).toEqual([]);
});
test('独食无队友，三人方出完者可查看另外两名队友',()=>{
  const g=game();g.teams=[0,0,0,1];g.hands[0]=[];g.finishedNaturally=[0];g.order=[0];
  expect(view(g,0).teammateHands.map(p=>p.seat)).toEqual([1,2]);
  g.hands[3]=[];g.finishedNaturally=[0,3];expect(view(g,3).teammateHands).toEqual([]);
});
