import { chooseTribute } from './tribute-fixtures';
import { expect, test } from 'vitest';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { createGame, createNextGame, tributeAction, isOpeningCard, isIdentity, canReturnTribute, id, view, type TributeAction } from '../src/core/game';

test('小程序等待房主可补齐机器人，客人和已开局的房间不提交请求',async()=>{
  const bundle=await build({entryPoints:['miniprogram/pages/table/index.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['threejs-miniprogram']});
  let page:any,calls=0;
  const waiting={...view(createGame(),0),room:'1234567890',roomStatus:'waiting',canFillBots:true,members:[{name:'房主',bot:false}]};
  const filled={...waiting,version:waiting.version+1,roomStatus:'playing',canFillBots:false,members:[...waiting.members,...[1,2,3].map(i=>({name:'机器人'+i,bot:true}))]};
  runInNewContext(bundle.outputFiles[0].text,{exports:{},require:()=>({}),Page:(options:any)=>{page=options;},wx:{setStorageSync(){},request(r:any){calls++;expect(r.url).toContain('/rooms/1234567890/fill-bots');r.success({statusCode:200,data:filled});}},setTimeout,clearTimeout,setInterval:()=>0,clearInterval});
  page.setData=(patch:any)=>Object.assign(page.data,patch);page.enter(waiting);expect(page.data.canFillBots).toBe(true);
  await page.fillBots();expect(calls).toBe(1);expect(page.data.waiting).toBe(false);expect(page.data.mixedRoom).toBe(true);expect(page.data.players.filter((p:any)=>p.bot)).toHaveLength(3);
  await page.fillBots();page.enter({...waiting,seat:1,canFillBots:false});await page.fillBots();expect(calls).toBe(1);page.onUnload();
});

test('小程序还贡禁选 ♦4 和身份牌，提示选合法牌，大贡需确认两张', async()=>{
  const bundle=await build({entryPoints:['miniprogram/pages/table/index.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['threejs-miniprogram']});
  let page:any;
  runInNewContext(bundle.outputFiles[0].text,{
    exports:{},require:()=>({}),Page:(options:any)=>{page=options;},
    wx:{setStorageSync(){}},setTimeout,clearTimeout,setInterval:()=>0,clearInterval
  });
  page.setData=(patch:any)=>Object.assign(page.data,patch);
  const previous={...createGame(),status:'finished' as const,teams:[1,1,0,0],order:[0,1,2,3],scores:[2,2,-2,-2]};
  for(let seed=1;seed<100;seed++){
    let n=seed;
    const g=chooseTribute(createNextGame(previous,()=>((n=(n*1664525+1013904223)>>>0)/4294967296)));
    if(!g.hands[0].some(isOpeningCard)||!g.hands[0].some(isIdentity))continue;
    page.enter({...view(g,0),room:'1234567890',roomStatus:'playing',members:[0,1,2,3].map(s=>({name:`玩家${s}`}))});
    expect(page.data.message).toContain('待回 2 张');
    expect(page.data.identity).toBe('A3阵营');
    expect(page.data.players.some((p:any)=>p.identity==='农民方'||p.identity==='独食')).toBe(false);
    for(const card of g.hands[0].filter(c=>isOpeningCard(c)||isIdentity(c))){
      page.select({currentTarget:{dataset:{id:id(card)}}});
      expect(page.data.canPlay).toBe(false);
    }
    page.hint();
    const selected=page.data.cards.filter((c:any)=>c.selected);
    expect(selected).toHaveLength(1);
    expect(canReturnTribute(selected[0])).toBe(true);
    expect(page.data.canPlay).toBe(true);
    page.onUnload();
    return;
  }
  throw Error('未找到受贡者同时持有 ♦4 和身份牌的牌局');
});

test('小程序贡牌池：预选冲突、发起猜拳、隐藏手势、胜者保留后进入还贡',async()=>{
  const bundle=await build({entryPoints:['miniprogram/pages/table/index.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['threejs-miniprogram']});
  let g=createNextGame({...createGame(),status:'finished',teams:[1,1,0,0],order:[0,1,2,3],scores:[2,2,-2,-2]}),page:any;
  const remote=()=>({...view(g,0),room:'1234567890',roomStatus:'playing',members:[0,1,2,3].map(s=>({name:`玩家${s}`}))});
  const apply=(seat:number,action:TributeAction)=>{const r=tributeAction(g,seat,action);if(!r.ok)throw Error(r.error);g=r.state;};
  runInNewContext(bundle.outputFiles[0].text,{exports:{},require:()=>({}),Page:(options:any)=>{page=options;},wx:{setStorageSync(){},showToast(){throw Error('unexpected toast');},request(r:any){apply(0,r.data.action);r.success({statusCode:200,data:remote()});}},setTimeout,clearTimeout,setInterval:()=>0,clearInterval});
  page.setData=(patch:any)=>Object.assign(page.data,patch);
  apply(1,{kind:'select',cards:[1,2]});page.enter(remote());
  expect(page.data.choiceStage).toBe(true);expect(page.data.tributePool).toHaveLength(4);expect(page.data.canPlay).toBe(false);
  page.chooseTribute({currentTarget:{dataset:{index:0}}});page.chooseTribute({currentTarget:{dataset:{index:1}}});expect(page.data.choiceCanConfirm).toBe(true);
  await page.choiceAction({kind:'select',cards:[0,1]});expect(page.data.choiceOpponents).toEqual([{seat:1,name:'玩家1'}]);
  await page.choiceAction({kind:'rps-start',opponent:1});const duel=g.tribute!.selection!.duel!;
  expect(page.data.choiceDuel.canConfirm).toBe(false);page.rps({currentTarget:{dataset:{move:'rock'}}});expect(g.tribute!.selection!.duel!.moves[0]).toBeUndefined();expect(page.data.choiceDuel.canConfirm).toBe(true);
  await page.confirmRps();expect(page.data.choiceDuel.submitted).toBe(true);expect(page.data.choiceDuel.canMove).toBe(false);expect(page.data.choiceResult).toBe('');
  apply(1,{kind:'rps',move:'scissors',round:1,duelId:duel.id});page.enter(remote());expect(page.data.choiceLocked).toBe(true);expect(page.data.choiceResult).toContain('玩家0 胜出');
  apply(1,{kind:'select',cards:[2,3]});page.enter(remote());expect(page.data.choiceStage).toBe(false);expect(page.data.message).toContain('待回 2 张');page.onUnload();
});
