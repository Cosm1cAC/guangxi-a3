import {act,botTributeAction,tributeAction,tributeConflicts,canReturnTribute,createGame,createNextGame,id,isIdentity,label,legalMoves,movesFor,returnTribute,view,type TributeAction,type RpsMove,type Card,type Game,type GameView} from '../core/game';
import {miniText} from '../../miniprogram/presentation';

export type Member={name:string;avatar?:unknown;bot?:boolean};
export type RoomView=GameView&{room:string;roomStatus:'waiting'|'playing'|'finished';canFillBots?:boolean;rankedRound?:boolean;members:Member[]};
export type Session={token:string;user:{name:string;score:number;games:number;wins:number;avatar?:unknown}};
export interface GameServices {
  request(path:string,data:unknown|undefined,token:string|null):Promise<any>;
  get(key:string):unknown;
  put(key:string,value:unknown):void;
  remove(key:string):void;
}

/** Platform-independent state controller; all rules remain in the shared engine. */
export class DouyinGame {
  local:Game|null=null;
  remote:RoomView|null=null;
  session:Session|null=null;
  selected=new Set<string>();
  selectedPool=new Set<number>();
  private poolKey='';
  rpsDraft:RpsMove|null=null;private rpsKey='';
  showTeammates=false;
  busy=false;error='';hidden=false;
  changed=()=>{};
  private timer:ReturnType<typeof setTimeout>|undefined;
  private poll:ReturnType<typeof setInterval>|undefined;
  private generation=0;
  constructor(private services:GameServices){
    const saved=services.get('a3-douyin-session') as Session|null;
    if(saved&&typeof saved.token==='string'&&saved.user&&typeof saved.user.name==='string')this.session=saved;
  }
  get state():GameView|null{return this.remote||(this.local?view(this.local,0):null);}
  get waiting(){return this.remote?.roomStatus==='waiting';}
  get canFillBots(){return !!this.waiting&&!!this.remote?.canFillBots&&!this.busy;}
  get choosing(){return this.state?.status==='tribute'?this.state.tribute?.selection:null;}
  get pending(){const s=this.state;return s?.tribute?.transfers.find(t=>t.to===s.seat&&!t.returned);}
  get canAct(){const s=this.state;return !!s&&!this.waiting&&!this.busy&&(s.status==='tribute'?this.choosing?!!this.choosing.quotas[s.seat]&&!this.choosing.locked.includes(s.seat)&&!this.choosing.duel:!!this.pending:s.status==='playing'&&s.turn===s.seat);}
  get canPlay(){const s=this.state;return this.canAct&&!!s&&(this.choosing?this.selectedPool.size===this.choosing.quotas[s.seat]:s.status!=='tribute'||this.selected.size===1&&s.hand.some(c=>this.selected.has(id(c))&&canReturnTribute(c)));}
  get canPass(){return this.canAct&&this.state?.status==='playing'&&!!this.state.last;}
  name(seat:number){return this.remote?.members[seat]?.name||(seat===0?(this.session?.user.name||'你'):'牌友'+seat);}
  get message(){const s=this.state;if(!s)return '四位牌友，一桌像素扑克。';
    if(this.waiting)return `等待好友入座 ${this.remote!.members.length}/4`;
    if(s.status==='finished')return '本局结束 · 查看积分';
    if(this.choosing){const c=this.choosing;return c.duel?`猜拳第 ${c.duel.round} 轮` :tributeConflicts(c).length?'预选冲突 · 可改选或猜拳':c.locked.includes(s.seat)?'猜拳胜出 · 已锁定预选':c.quotas[s.seat]?`预选 ${c.quotas[s.seat]} 张 · 无冲突才分牌`:'等待受贡者预选交出牌';}
    if(s.status==='tribute')return this.pending?`回给 ${this.name(this.pending.from)} · 待回 ${s.pendingReturns} 张`:'等待其他玩家确认回牌';
    return s.turn===s.seat?(s.first?'轮到你 · 首手必含 ♦4':'轮到你出牌'):`${this.name(s.turn)} 正在思考…`;
  }
  get heldIdentity(){return this.state?.hand.filter(isIdentity).map(label).join('、')||'';}
  get playedIdentity(){return this.state?.log.slice().reverse().find(line=>/^\d号位 · /.test(line)&&/♠A|♠3/.test(line))?.replace(/^(\d)号位 · /,(_,seat)=>`${this.name(Number(seat))} 已打出：`)||'';}
  private notify(){const s=this.state,c=this.choosing;const key=c?.duel?`${s!.round}:${c.duel.id}:${c.duel.round}`:'';if(key!==this.rpsKey){this.rpsKey=key;this.rpsDraft=null;}if(!(s?.teammateHands||[]).length)this.showTeammates=false;if(s&&c){const key=JSON.stringify([s.round,s.seat,c.choices[s.seat]||[],c.locked,c.duel?.id||0]);if(key!==this.poolKey){this.poolKey=key;this.selectedPool=new Set(c.choices[s.seat]||[]);}}this.changed();}
  choosePool(index:number){const s=this.state,c=this.choosing;if(!s||!c||!this.canAct||c.locked.some(who=>who!==s.seat&&c.choices[who].includes(index)))return;this.selectedPool.has(index)?this.selectedPool.delete(index):this.selectedPool.add(index);this.notify();}
  async choiceAction(action:TributeAction){const s=this.state;if(!s||this.busy)return;this.busy=true;this.notify();try{
    if(this.remote)this.remote=await this.services.request(`/rooms/${this.remote.room}/tribute-choice`,{version:s.version,round:s.round,action},this.session!.token);
    else if(this.local){const result=tributeAction(this.local,s.seat,action);if(!result.ok)throw Error(result.error);this.local=result.state;}
  }catch(e){this.error=miniText(e instanceof Error?e.message:String(e));}finally{this.busy=false;this.notify();this.bot();}}
  rps(move:RpsMove){const s=this.state,duel=this.choosing?.duel;if(!s||!duel||!duel.players.includes(s.seat)||duel.submitted.includes(s.seat)||this.busy)return;this.rpsDraft=move;this.notify();}
  async confirmRps(){const s=this.state,duel=this.choosing?.duel;if(!s||!duel||!this.rpsDraft||duel.submitted.includes(s.seat)||this.busy)return;await this.choiceAction({kind:'rps',move:this.rpsDraft,round:duel.round,duelId:duel.id});}
  toggleTeammates(){this.showTeammates=!this.showTeammates;this.notify();}
  private stop(){clearTimeout(this.timer);clearInterval(this.poll);this.timer=undefined;this.poll=undefined;this.generation++;}
  practice(){this.stop();this.remote=null;this.services.remove('a3-douyin-room');this.local=createGame();this.selected.clear();this.error='';this.notify();this.bot();}
  select(key:string){if(this.selected.has(key))this.selected.delete(key);else{if(this.state?.status==='tribute')this.selected.clear();this.selected.add(key);}this.notify();}
  hint(){const s=this.state;if(!s||!this.canAct)return;
    if(this.choosing){const c=this.choosing,taken=new Set(Object.entries(c.choices).filter(([who])=>Number(who)!==s.seat).flatMap(([,cards])=>cards));this.selectedPool=new Set(s.tribute!.transfers.map((_,i)=>i).filter(i=>!taken.has(i)).slice(0,c.quotas[s.seat]));this.notify();return;}
    const cards=s.status==='tribute'?[s.hand.find(canReturnTribute)].filter((c):c is Card=>!!c):(movesFor(s.hand,s.last?.cards||null,s.first)[0]||[]);
    if(!cards.length){this.error='没有能压的牌，请过牌';this.notify();return;}
    this.selected=new Set(cards.map(id));this.error='';this.notify();
  }
  async submit(pass=false){
    const s=this.state;if(!s||this.busy)return;
    if(pass?!this.canPass:!this.canPlay)return;
    if(this.choosing){await this.choiceAction({kind:'select',cards:[...this.selectedPool]});return;}
    const cards=pass?[]:s.hand.filter(c=>this.selected.has(id(c)));
    if(!pass&&!cards.length){this.error='请先选牌';this.notify();return;}
    this.busy=true;this.error='';this.notify();
    try{
      if(this.remote){this.remote=await this.services.request(`/rooms/${this.remote.room}/${s.status==='tribute'?'tribute':'actions'}`,s.status==='tribute'?{version:s.version,card:cards[0]}:{version:s.version,cards},this.session!.token);}
      else if(this.local){const result=s.status==='tribute'?returnTribute(this.local,s.seat,cards[0]):act(this.local,s.seat,cards);if(!result.ok)throw Error(result.error);this.local=result.state;}
      this.selected.clear();
    }catch(e){this.error=miniText(e instanceof Error?e.message:String(e));}
    finally{this.busy=false;this.notify();this.bot();}
    if(this.remote)void this.refresh();
  }
  async nextRound(){if(this.busy||this.state?.status!=='finished')return;this.busy=true;this.error='';this.notify();
    try{if(this.remote)this.remote=await this.services.request(`/rooms/${this.remote.room}/next`,{},this.session!.token);else this.local=createNextGame(this.local!);this.selected.clear();}
    catch(e){this.error=miniText(e instanceof Error?e.message:String(e));}
    finally{this.busy=false;this.notify();this.bot();}
  }
  bot(){
    clearTimeout(this.timer);if(this.hidden||this.remote||!this.local)return;
    const g=this.local;
    const receiver=g.status==='tribute'?[1,2,3].find(seat=>botTributeAction(g,seat)):undefined;
    if(g.status==='tribute'?receiver===undefined:g.status!=='playing'||g.turn===0)return;
    const generation=this.generation;
    this.timer=setTimeout(()=>{
      if(generation!==this.generation||this.hidden||this.remote||this.local!==g)return;
      const result=receiver!==undefined?tributeAction(g,receiver,botTributeAction(g,receiver)!):act(g,g.turn,legalMoves(g,g.turn)[0]||[]);
      if(result.ok){this.local=result.state;this.notify();this.bot();}else{this.error=miniText(result.error);this.notify();}
    },650);
  }
  async login(email:string,password:string,name?:string,code?:string,username?:string){
    if(this.busy)return;this.busy=true;this.error='';this.notify();
    try{const data=await this.services.request(name?'/auth/register':'/auth/login',name?{email,password,name,code,username}:{identifier:email,password},null);this.session={token:data.token,user:data.user};this.services.put('a3-douyin-session',this.session);this.notify();return true;}
    catch(e){this.error=miniText(e instanceof Error?e.message:String(e));return false;}
    finally{this.busy=false;this.notify();}
  }
  async sendEmailCode(email:string){try{await this.services.request('/auth/email/code',{email},null);this.error='验证码已发送，请查收邮箱';}catch(e){this.error=miniText(e instanceof Error?e.message:String(e));}this.notify();}
  async enterRoom(code?:string){if(this.busy||!this.session)return;this.busy=true;this.error='';this.notify();
    try{const room=await this.services.request(code?`/rooms/${code.toUpperCase()}/join`:'/rooms',{},this.session.token);this.attach(room);return true;}
    catch(e){this.error=miniText(e instanceof Error?e.message:String(e));return false;}
    finally{this.busy=false;this.notify();}
  }
  attach(room:RoomView){this.stop();this.remote=room;this.local=null;this.selected.clear();this.services.put('a3-douyin-room',room.room);this.watch();this.notify();}
  async fillBots(){const room=this.remote;if(!room||!this.canFillBots||!this.session)return;this.busy=true;this.error='';this.notify();
    try{const result=await this.services.request(`/rooms/${room.room}/fill-bots`,{},this.session.token);if(this.remote?.room===room.room){this.remote=result;this.selected.clear();}}
    catch(e){this.error=miniText(e instanceof Error?e.message:String(e));}
    finally{this.busy=false;this.notify();}
  }
  async refresh(){const room=this.remote;if(!room||!this.session||this.busy||this.hidden)return;
    const generation=this.generation;
    try{const result:RoomView=await this.services.request(`/rooms/${room.room}`,undefined,this.session.token);
      if(this.generation!==generation||this.remote?.room!==room.room||this.busy||result.version<this.remote.version)return;
      if(result.version!==room.version||JSON.stringify(result.members)!==JSON.stringify(room.members)||result.roomStatus!==room.roomStatus){this.remote=result;this.selected.clear();this.error='';this.notify();}
    }catch(e){if(this.generation===generation){this.error=miniText(e instanceof Error?e.message:String(e));this.notify();}}
  }
  async restore(){const code=this.services.get('a3-douyin-room');if(this.session&&typeof code==='string'&&/^[A-F0-9]{10}$/.test(code))await this.enterRoom(code);}
  logout(){const token=this.session?.token;if(token)void this.services.request('/auth/logout',{},token).catch(()=>{});this.stop();this.session=null;this.remote=null;this.services.remove('a3-douyin-session');this.services.remove('a3-douyin-room');this.error='';this.notify();}
  private watch(){clearInterval(this.poll);if(!this.hidden&&this.remote)this.poll=setInterval(()=>void this.refresh(),1800);}
  pause(){this.hidden=true;clearTimeout(this.timer);clearInterval(this.poll);}
  resume(){this.hidden=false;if(this.remote){void this.refresh();this.watch();}else this.bot();this.notify();}
  dispose(){this.stop();this.hidden=true;this.changed=()=>{};}
}
