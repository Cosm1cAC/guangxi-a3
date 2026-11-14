import assert from 'node:assert/strict';
import { movesFor } from '../src/core/game';

const base=process.env.A3_API_BASE||'http://127.0.0.1:3001/api',tokens:string[]=[];
const req=async(path:string,seat=0,body?:unknown)=>{
  const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(tokens[seat]?{Authorization:`Bearer ${tokens[seat]}`}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};
};
const run=Date.now().toString(36);
for(let seat=0;seat<4;seat++){
  const r=await req('/auth/register',seat,{email:`tribute-${run}-${seat}@example.com`,password:`test-${run}`,name:`预选测试${seat}`});assert.equal(r.status,201);tokens.push(r.data.token);
}
const created=await req('/rooms',0,{});assert.equal(created.status,201);const room=created.data.room,path=`/rooms/${room}`;
for(let seat=1;seat<4;seat++)assert.equal((await req(path+'/join',seat,{})).status,200);
const state=async(seat=0)=>(await req(path,seat)).data;
let g:any;
for(let round=0;round<12;round++){
  for(let step=0;step<1000;step++){
    g=await state();if(g.status==='finished')break;
    if(g.status==='tribute'){
      for(let seat=0;seat<4;seat++){
        const s=await state(seat),selection=s.tribute.selection;
        if(selection){const quota=selection.quotas[seat];if(!quota||selection.choices[seat]?.length===quota)continue;const used=new Set(Object.entries(selection.choices).filter(([who])=>Number(who)!==seat).flatMap(([,cards])=>cards as number[]));const cards=s.tribute.transfers.map((_:unknown,i:number)=>i).filter((i:number)=>!used.has(i)).slice(0,quota);assert.equal((await req(path+'/tribute-choice',seat,{version:s.version,round:s.round,action:{kind:'select',cards}})).status,200);}
        else{const t=s.tribute.transfers.find((t:any)=>t.to===seat&&!t.returned);if(t)assert.equal((await req(path+'/tribute',seat,{version:s.version,card:t.card})).status,200);}
      }continue;
    }
    const s=await state(g.turn);assert.equal((await req(path+'/actions',g.turn,{version:s.version,cards:movesFor(s.hand,s.last?.cards||null,s.first)[0]||[]})).status,200);
  }
  g=(await req(path+'/next',0,{})).data;
  if(g.tribute?.selection)break;
}
assert(g.tribute?.selection,'No shared pool in twelve rounds');
const recipients=Object.keys(g.tribute.selection.quotas).map(Number),[a,b]=recipients;
const submit=(seat:number,action:unknown,s:any=g)=>req(path+'/tribute-choice',seat,{version:s.version,round:s.round,action});
const simultaneous=await Promise.all([submit(a,{kind:'select',cards:Array.from({length:g.tribute.selection.quotas[a]},(_,i)=>i)}),submit(b,{kind:'select',cards:Array.from({length:g.tribute.selection.quotas[b]},(_,i)=>i)})]);
assert(simultaneous.every(r=>r.status===200),'Independent simultaneous submissions must merge');g=await state(a);assert(g.tribute.selection);
assert.equal((await req(path+'/tribute',a,{version:g.version,card:g.hand[0]})).status,422);
const started=await submit(a,{kind:'rps-start',opponent:b});assert.equal(started.status,200);g=started.data;
const duel=g.tribute.selection.duel;
assert.equal((await submit(a,{kind:'rps',move:'rock',round:1,duelId:duel.id})).status,200);
const peer=await state(b);assert.equal(peer.tribute.selection.duel.ownMove,null);assert(!JSON.stringify(peer).includes('"rock"'));
assert.equal((await submit(b,{kind:'rps',move:'rock',round:1,duelId:duel.id},peer)).status,200);g=await state(a);assert.equal(g.tribute.selection.duel.round,2);
assert.equal((await submit(a,{kind:'rps',move:'paper',round:1,duelId:duel.id})).status,422);
const gestures=await Promise.all([submit(a,{kind:'rps',move:'rock',round:2,duelId:duel.id}),submit(b,{kind:'rps',move:'scissors',round:2,duelId:duel.id})]);assert(gestures.every(r=>r.status===200));g=await state(a);assert(g.tribute.selection.locked.includes(a));
for(const seat of recipients){
  g=await state(seat);if(!g.tribute.selection)break;const selection=g.tribute.selection;
  if(selection.locked.includes(seat))continue;
  const used=new Set(Object.entries(selection.choices).filter(([who])=>Number(who)!==seat).flatMap(([,cards])=>cards as number[]));
  const cards=g.tribute.transfers.map((_:unknown,i:number)=>i).filter((i:number)=>!used.has(i)).slice(0,selection.quotas[seat]);assert.equal((await submit(seat,{kind:'select',cards})).status,200);
}
g=await state();assert.equal(g.tribute.selection,null);
for(let step=0;g.status==='tribute'&&step<20;step++){
  const t=g.tribute.transfers.find((t:any)=>!t.returned),s=await state(t.to),own=s.tribute.transfers.find((t:any)=>!t.returned&&t.to===s.seat);
  const returned=await req(path+'/tribute',s.seat,{version:s.version,card:own.card});assert.equal(returned.status,200);g=await state();
}
assert.equal(g.status,'playing');assert(g.players.every((p:any)=>p.count===13));
console.log(`TRIBUTE API PASS: simultaneous selections, conflict, hidden gestures, tie/replay protection, simultaneous RPS, winner lock, remaining picks and 13-card returns. Room ${room}`);
