import {test,expect} from 'vitest';
import {createGame,act,settle,beats,classify,view,type Card} from '../src/core/game';
const c=(rank:number,suit=0):Card=>({rank,suit});
test('主规则边界：报单必打、下家接风、身份隐藏和全部名次计分',()=>{
 const g=createGame();g.first=false;g.hands=[[c(14)],[c(5),c(6)],[c(7),c(8)],[c(9),c(10)]];g.last={seat:3,cards:[c(13)]};g.turn=0;
 expect(act(g,0,[])).toEqual({ok:false,error:'报单后，能压必须打'});
 expect(act(g,1,[c(5)])).toEqual({ok:false,error:'还没轮到你'});
 g.hands[3]=[];g.order=[3];g.finishedNaturally=[3];g.last={seat:3,cards:[c(3,3)]};g.turn=0;
 let r=act(g,0,[]);expect(r.ok).toBe(true);if(!r.ok)return;r=act(r.state,1,[]);if(!r.ok)throw Error(r.error);r=act(r.state,2,[]);if(!r.ok)throw Error(r.error);
 expect(r.state.last).toBeNull();expect(r.state.turn).toBe(0);
 expect(view(createGame(),0).players.every(p=>p.identity==='身份未明')).toBe(true);
 for(const [order,expected] of [[[0,1,2,3],2],[[0,2,1,3],1],[[0,2,3,1],0],[[2,0,1,3],0],[[2,0,3,1],-1],[[2,3,0,1],-2]] as [number[],number][]){expect(settle([1,1,0,0],order)).toEqual([expected,expected,-expected,-expected]);}
 for(let rank=0;rank<4;rank++){const order=[1,2,3];order.splice(rank,0,0);expect(settle([1,0,0,0],order)[0]).toBe([6,3,-3,-6][rank]);}
 expect(beats([c(3)],[c(2,3)])).toBe(true);
 expect(classify([c(3,3),c(2,3),c(13,3),c(5,3),c(4,3)])!.value).toBe(67);
 expect(beats([c(3,3),c(4,3),c(5,3),c(6,3),c(7,3)],[c(3),c(3,1),c(3,2),c(3,3),c(4)])).toBe(true);
});
