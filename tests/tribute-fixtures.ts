import { botTributeAction, tributeAction, type Game } from '../src/core/game';

export function chooseTribute(source:Game):Game{
  let game=source;
  for(let steps=0;game.tribute?.selection&&steps<20;steps++){
    const seat=[0,1,2,3].find(who=>botTributeAction(game,who));
    if(seat===undefined)throw Error('预选无法推进');
    const result=tributeAction(game,seat,botTributeAction(game,seat)!);
    if(!result.ok)throw Error(result.error);game=result.state;
  }
  if(game.tribute?.selection)throw Error('预选未结束');return game;
}

export function finishTribute(source:Game):Game{
  let game=chooseTribute(source);
  for(let steps=0;game.status==='tribute'&&steps<40;steps++){
    const seat=[0,1,2,3].find(who=>botTributeAction(game,who));
    if(seat===undefined)throw Error('还贡无法推进');
    const result=tributeAction(game,seat,botTributeAction(game,seat)!);
    if(!result.ok)throw Error(result.error);game=result.state;
  }
  if(game.status==='tribute')throw Error('还贡未结束');return game;
}
