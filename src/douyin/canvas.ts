import {id,isIdentity,label,rankLabel,suits,tributeConflicts,rpsLabel,type Card} from '../core/game';
import {BOT_AVATARS,DEFAULT_AVATAR,headPixels,normalizeAvatar} from '../core/avatar';
import {miniText} from '../../miniprogram/presentation';
import {DouyinGame,type GameServices} from './controller';
import {RULE_PAGES} from './rules';
import {SUIT_GLYPHS,SUIT_NAMES,RPS_GLYPHS,HAND_PALETTE,pixelRects} from '../visual/pixel-art';
import {MUSIC_TRACKS,musicTime,type MusicPlayer,type PlayMode} from '../core/music';
import {createNativeMusicPlayer} from '../core/native-music';

type Box={x:number;y:number;w:number;h:number;key:string;action:()=>void};
type Panel='table'|'account'|'rules'|'privacy'|'music';
const colors={bg:'#17232e',panel:'#253641',edge:'#61737a',ink:'#edf0df',muted:'#b7c7bf',accent:'#abd082',red:'#b63f42'};

/** Canvas-only UI: no DOM, WXML, browser navigation or remote page wrapper. */
export class CanvasGame {
  readonly canvas:HTMLCanvasElement;
  readonly ctx:CanvasRenderingContext2D;
  readonly game:DouyinGame;
  readonly music:MusicPlayer;
  panel:Panel='table';
  scroll=0;rulePage=0;targets:Box[]=[];fixedTargets:Box[]=[];
  width=390;height=844;scale=1;top=60;contentHeight=0;
  private font='monospace';
  private touch:{x:number;y:number;lastY:number;moved:boolean}|null=null;
  private editing:string|null=null;
  private keyboardOpen=false;
  private fields:Record<string,string>={email:'',password:'',username:'',name:'',code:'',room:''};
  private register=false;
  private emailCode=false;
  private sidebar=false;
  private fromSidebar=false;
  constructor(readonly tt:any,readonly apiBase:string){
    this.canvas=tt.createCanvas();this.ctx=this.canvas.getContext('2d')!;
    try{this.font=tt.loadFont?.('assets/pixel.ttf')||'monospace';}catch{/* System font keeps the game readable. */}
    const services:GameServices={
      get:key=>{try{return tt.getStorageSync(key)??null;}catch{return null;}},
      put:(key,value)=>tt.setStorageSync(key,value),remove:key=>tt.removeStorageSync(key),
      request:(path,data,token)=>new Promise((resolve,reject)=>tt.request({
        url:apiBase+path,method:data===undefined?'GET':'POST',data,timeout:10000,
        header:{'content-type':'application/json','x-a3-client':'douyin',...(token?{Authorization:`Bearer ${token}`}:{})},
        success:(r:any)=>r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(Error(r.data?.error||'连接失败，请稍后重试')),
        fail:()=>reject(Error('房间服务暂时无法连接，可继续离线练习'))
      }))
    };
    this.game=new DouyinGame(services);this.game.changed=()=>this.draw();
    this.music=createNativeMusicPlayer(tt,apiBase);this.music.changed=()=>this.draw();
    this.resize();
    tt.onTouchStart((e:any)=>{if(this.keyboardOpen)return;const t=e.touches?.[0];if(t)this.touch={x:t.clientX/this.scale,y:t.clientY/this.scale,lastY:t.clientY/this.scale,moved:false};});
    tt.onTouchMove((e:any)=>{const t=e.touches?.[0];if(!t||!this.touch)return;const y=t.clientY/this.scale;if(Math.abs(y-this.touch.y)>8)this.touch.moved=true;if(this.touch.moved){this.scroll=Math.max(0,Math.min(this.contentHeight-this.height,this.scroll+this.touch.lastY-y));this.draw();}this.touch.lastY=y;});
    tt.onTouchEnd((e:any)=>{const start=this.touch;this.touch=null;if(!start||start.moved||this.keyboardOpen)return;const t=e.changedTouches?.[0];if(!t)return;this.tap(t.clientX/this.scale,t.clientY/this.scale);});
    tt.onTouchCancel?.(()=>{this.touch=null;});
    tt.onKeyboardComplete((e:any)=>{if(this.editing)this.fields[this.editing]=String(e.value||'');this.editing=null;this.keyboardOpen=false;this.draw();});
    tt.onHide(()=>{this.touch=null;this.game.pause();this.music.suspend();});
    tt.onShow((options:any)=>{this.fromSidebar=options?.launch_from==='homepage'&&options?.location==='sidebar_card';this.game.resume();this.music.resume();});
    tt.checkScene?.({scene:'sidebar',success:(result:any)=>{this.sidebar=result.isExist===true;this.draw();}});
    tt.onWindowResize?.(()=>this.resize());
    void this.game.restore();
  }
  resize(){
    const info=this.tt.getSystemInfoSync();this.scale=info.windowWidth/390;this.height=info.windowHeight/this.scale;
    let menuBottom=0;try{const menu=this.tt.getMenuButtonLayout?.();menuBottom=menu?.bottom||menu?.rect?.bottom||0;}catch{}
    this.top=Math.max(info.statusBarHeight||24,info.safeArea?.top||0,menuBottom)/this.scale+14;
    const dpr=Math.min(info.pixelRatio||1,3);this.canvas.width=Math.round(info.windowWidth*dpr);this.canvas.height=Math.round(info.windowHeight*dpr);
    this.ctx.setTransform(dpr*this.scale,0,0,dpr*this.scale,0,0);this.ctx.imageSmoothingEnabled=false;this.scroll=0;this.draw();
  }
  private rect(x:number,y:number,w:number,h:number,color:string){this.ctx.fillStyle=color;this.ctx.fillRect(x,y,w,h);}
  private text(text:string,x:number,y:number,size=14,color:string=colors.ink,align:CanvasTextAlign='left'){
    this.ctx.font=`${size}px ${this.font}`;this.ctx.fillStyle=color;this.ctx.textAlign=align;this.ctx.textBaseline='top';this.ctx.fillText(text,x,y);this.ctx.textAlign='left';
  }
  private fitted(text:string,maxWidth:number,size=14){this.ctx.font=`${size}px ${this.font}`;let value=text;while(value&&this.ctx.measureText(value).width>maxWidth)value=value.slice(0,-1);return value===text?text:value.slice(0,-1)+'…';}
  private wrap(text:string,x:number,y:number,width:number,size=14,color:string=colors.ink,lineHeight=24){
    this.ctx.font=`${size}px ${this.font}`;let line='';let rows=0;
    for(const char of text){if(char==='\n'||this.ctx.measureText(line+char).width>width){this.text(line,x,y+rows*lineHeight,size,color);line=char==='\n'?'':char;rows++;}else line+=char;}
    if(line){this.text(line,x,y+rows*lineHeight,size,color);rows++;}return y+rows*lineHeight;
  }
  private box(x:number,y:number,w:number,h:number,fill=colors.panel,border=colors.edge){this.rect(x+3,y+4,w,h,'#0b151d');this.rect(x,y,w,h,border);this.rect(x+2,y+2,w-4,h-4,fill);}
  private button(key:string,title:string,x:number,y:number,w:number,action:()=>void,primary=false,enabled=true,h=54,fixed=false){
    this.rect(x,y,w,h,enabled?(primary?colors.accent:'#344650'):'#293841');this.rect(x,y,w,3,enabled?(primary?'#d9edb3':'#849297'):'#405058');this.rect(x,y,3,h,enabled?(primary?'#d9edb3':'#849297'):'#405058');this.rect(x,y+h-4,w,4,primary?'#587747':'#101c24');this.rect(x+w-3,y,3,h,primary?'#587747':'#101c24');
    this.text(this.fitted(title,w-12,15),x+w/2,y+(h-15)/2,15,enabled?(primary?'#192a20':colors.ink):'#839087','center');
    if(enabled)(fixed?this.fixedTargets:this.targets).push({x,y,w,h,key,action});
  }
  private open(panel:Panel){this.panel=panel;this.scroll=0;this.draw();}
  tap(x:number,y:number){
    const fixed=this.fixedTargets.find(t=>x>=t.x&&x<=t.x+t.w&&y>=t.y&&y<=t.y+t.h);
    if(fixed){fixed.action();return;}if(y<this.top+62)return;
    const target=this.targets.slice().reverse().find(t=>x>=t.x&&x<=t.x+t.w&&y+this.scroll>=t.y&&y+this.scroll<=t.y+t.h);target?.action();
  }
  draw(){
    const c=this.ctx;c.save();this.rect(0,0,390,this.height,colors.bg);this.targets=[];this.fixedTargets=[];
    c.beginPath();c.rect(0,this.top+62,390,Math.max(1,this.height-this.top-62));c.clip();c.translate(0,-this.scroll);
    let y=this.top+76;
    if(this.panel==='table')y=this.drawTablePage(y);
    else if(this.panel==='rules')y=this.drawRules(y);
    else if(this.panel==='account')y=this.drawAccount(y);
    else if(this.panel==='music')y=this.drawMusic(y);
    else y=this.drawPrivacy(y);
    this.contentHeight=y+35;
    c.restore();this.rect(0,0,390,this.top+62,colors.bg);this.text('像素A3',16,this.top+12,24);this.rect(16,this.top+59,358,2,'#3c4c55');
    this.button('header',this.panel==='table'?'玩法规则 ＋':'返回牌桌',260,this.top,114,()=>this.open(this.panel==='table'?'rules':'table'),false,true,50,true);
    this.button('music-header','音乐 ♪',176,this.top,74,()=>this.open(this.panel==='music'?'table':'music'),false,true,50,true);
    if(this.scroll>0)this.text('↑ 滑动查看',195,this.height-18,10,colors.muted,'center');
  }
  private drawMusic(y:number){
    const p=this.music;
    this.text('方块留声机 · CC0',16,y,22,colors.accent);y+=42;
    y=this.wrap(p.track.title,16,y,358,21,colors.ink,28);this.text(p.track.artist,16,y+6,12,colors.muted);y+=38;
    this.text(p.status==='playing'?'正在播放':p.status==='loading'?'正在加载…':p.status==='error'?'播放遇到问题':p.status==='idle'?'点击播放，开启音乐':'已暂停',16,y,12,colors.accent);y+=30;
    this.button('music-prev','上一首',16,y,105,()=>p.previous());
    this.button('music-play',p.wantsPlayback&&p.status!=='error'?'暂停':'播放',133,y,105,()=>{const on=!p.wantsPlayback||p.status==='error';p.setEnabled(on);p.activate();},true);
    this.button('music-next','下一首',250,y,124,()=>p.next());y+=70;
    this.text(musicTime(p.position)+' / '+musicTime(p.duration),16,y,12,colors.muted);y+=25;
    this.rect(16,y,358,6,'#405446');if(p.duration)this.rect(16,y,358*Math.min(1,p.position/p.duration),6,colors.accent);y+=22;
    this.button('music-rewind','退 15 秒',16,y,173,()=>p.seek(p.position-15),false,p.duration>0,42);
    this.button('music-forward','进 15 秒',201,y,173,()=>p.seek(p.position+15),false,p.duration>0,42);y+=58;
    const modes:PlayMode[]=['list','shuffle','single'],mode=modes.indexOf(p.settings.mode);
    this.button('music-mode','播放方式：'+['列表循环','随机播放','单曲循环'][mode],16,y,358,()=>p.setMode(modes[(mode+1)%3]),false,true,44);y+=62;
    MUSIC_TRACKS.forEach((track,i)=>{this.button('music-track-'+track.id,`${i+1}. ${track.title}`,16,y,358,()=>{p.select(track.id);p.setEnabled(true);p.activate();},p.track.id===track.id,true,48);y+=56;this.text(track.caption+' · '+track.artist,20,y,10,colors.muted);y+=26;});
    this.text('音乐音量 '+Math.round(p.settings.volume*100)+'%',16,y,13);y+=26;
    this.button('music-quieter','音量 −',16,y,173,()=>p.setVolume(p.settings.volume-.1),false,true,42);this.button('music-louder','音量 ＋',201,y,173,()=>p.setVolume(p.settings.volume+.1),false,true,42);y+=62;
    if(p.error){y=this.wrap(p.error,16,y,358,12,'#f4b6a7',20);y+=10;this.button('music-retry','重试当前曲目',16,y,358,()=>{p.setEnabled(true);p.activate();p.retry();});y+=68;}
    return this.wrap('4 首舒缓钢琴与氛围音乐，均以 CC0 发布。作者信息见曲目列表。',16,y,358,12,colors.muted,21)+20;
  }
  private avatar(seat:number,x:number,y:number){
    const own=seat===this.game.state?.seat;
    const pixels=headPixels(normalizeAvatar(this.game.remote?.members[seat]?.avatar||(own?this.game.session?.user.avatar||DEFAULT_AVATAR:BOT_AVATARS[(seat+2)%3])),'front');
    pixels.forEach((row,dy)=>row.forEach((color,dx)=>this.rect(x+dx*3,y+dy*3,3,3,color)));
  }
  private player(seat:number,x:number,y:number,w:number){const s=this.game.state!;const p=s.players[seat];
    this.box(x,y,w,58,colors.panel,s.turn===seat?colors.accent:colors.edge);this.avatar(seat,x+8,y+8);
    this.text(this.fitted(this.game.name(seat),w-47,12),x+40,y+10,12);this.text(this.fitted(`${p.rank?'第'+p.rank+'名':p.count+' 张'} · ${miniText(p.identity)}`,w-12,10),x+6,y+39,10,colors.muted);
  }
  private poly(points:number[][],color:string){this.ctx.beginPath();points.forEach(([x,y],i)=>i?this.ctx.lineTo(x,y):this.ctx.moveTo(x,y));this.ctx.closePath();this.ctx.fillStyle=color;this.ctx.fill();}
  private scene(y:number){
    this.rect(0,y,390,318,'#28343c');this.rect(0,y,390,70,'#202a30');
    for(let i=-5;i<15;i++){this.poly([[195+i*32,y+70],[197+i*32,y+70],[195+i*64,y+318],[193+i*64,y+318]],'#35424a');}
    for(let z=90;z<318;z+=38)this.rect(0,y+z,390,1,'#35424a');
    this.poly([[52,y+93],[338,y+93],[375,y+252],[15,y+252]],'#101c23');this.poly([[52,y+84],[338,y+84],[375,y+240],[15,y+240]],'#76583d');
    this.poly([[61,y+90],[329,y+90],[361,y+231],[29,y+231]],'#a38158');this.poly([[65,y+95],[325,y+95],[353,y+224],[37,y+224]],'#28664e');
    for(let x=83;x<325;x+=20){this.rect(x,y+103,4,2,'#9cbd8e');this.rect(x-13,y+212,4,2,'#9cbd8e');}
    const pattern=['00011000','00111100','01111110','11111111','11111111','01111110','00011000','00111100'];
    pattern.forEach((row,dy)=>[...row].forEach((v,dx)=>{if(v==='1')this.rect(179+dx*4,y+142+dy*4,4,4,'#92ae84');}));
    const s=this.game.state;
    if(!s){this.text('A · 3',195,y+184,24,'#d2dfb6','center');return;}
    const me=s.seat;this.player((me+2)%4,142,y+4,106);this.player((me+3)%4,8,y+73,100);this.player((me+1)%4,282,y+73,100);this.player(me,142,y+254,106);
    this.box(52,y+139,286,41,'#173128','#789565');this.text(this.fitted(this.game.message,268,13),195,y+153,13,'#d8e9ab','center');
    if(s.last){const cards=s.last.cards;const w=33;cards.forEach((card,i)=>{const x=195-cards.length*(w+4)/2+i*(w+4);this.box(x,y+187,w,38,'#f0f0dd','#adb99e');this.text(label(card),x+w/2,y+198,15,card.suit===0||card.suit===2?colors.red:colors.bg,'center');});}
  }
  private note(text:string,y:number){this.rect(16,y,358,34,'#303d34');this.rect(16,y,4,34,'#d0b36c');this.text(this.fitted(text,333,12),28,y+11,12,'#f1e1ad');return y+44;}
  private drawTablePage(y:number){
    const s=this.game.state;
    if(!s){this.text('好友同桌 · 像素牌局',16,y,12,colors.accent);this.text('四位牌友，即刻开局。',16,y+30,25);y=this.wrap('♠A 与 ♠3 同队 · 双牌单人组队 · ♦4 首出',16,y+70,358,12,colors.muted,20)+10;}
    this.scene(y);y+=330;
    if(s){
      if(this.game.heldIdentity)y=this.note('身份牌提醒 · 你持有 '+this.game.heldIdentity,y);
      if(this.game.playedIdentity)y=this.note('桌面提醒 · '+this.game.playedIdentity,y);
      if(this.game.remote){const room=this.game.remote.room;this.button('copy-room','房号 '+room+' · 复制',16,y,358,()=>this.tt.setClipboardData({data:room}),false,true,44);y+=56;}
      const choice=this.game.choosing;
      if(choice){
        this.text('交出牌池 · 双方预选',16,y,17,colors.accent);y+=32;
        this.text(`你可选 ${choice.quotas[s.seat]||0} 张 · 已选 ${this.game.selectedPool.size} 张`,16,y,12);y+=28;
        s.tribute!.transfers.forEach((t,index)=>{
          const owners=Object.entries(choice.choices).filter(([,cards])=>cards.includes(index)).map(([who])=>this.game.name(Number(who))).join('、');
          const locked=choice.locked.some(who=>who!==s.seat&&choice.choices[who].includes(index));
          this.button('pool-'+index,`${t.card?SUIT_NAMES[t.card.suit]+rankLabel(t.card.rank):'牌背'} · ${owners||this.game.name(t.from)+'交出'}`,16+(index%2)*182,y+Math.floor(index/2)*58,176,()=>this.game.choosePool(index),this.game.selectedPool.has(index),this.game.canAct&&!locked,48);
        });y+=Math.ceil(s.tribute!.transfers.length/2)*58;
        if(choice.duel){const duel=choice.duel;this.text(duel.submitted.includes(s.seat)?'你已出拳，等待对方':'双方提交后才公开手势',16,y,12);y+=30;
          const canChoose=duel.players.includes(s.seat)&&!duel.submitted.includes(s.seat)&&!this.game.busy;
          (['rock','scissors','paper'] as const).forEach((move,i)=>{const x=16+i*122;this.button('rps-'+move,rpsLabel(move),x,y+68,114,()=>this.game.rps(move),this.game.rpsDraft===move,canChoose,42);this.box(x,y,114,64,this.game.rpsDraft===move?'#b1c591':'#8b8b8b','#e5e9dc');this.pixel(RPS_GLYPHS[move],HAND_PALETTE,x+33,y+5,3);});y+=124;
          this.button('rps-confirm',duel.submitted.includes(s.seat)?'已出拳，等待对方':this.game.rpsDraft?'确认出拳 · '+rpsLabel(this.game.rpsDraft):'请先选择手势',16,y,358,()=>void this.game.confirmRps(),true,canChoose&&!!this.game.rpsDraft);y+=70;
        }else{
          if(choice.quotas[s.seat]&&!choice.locked.includes(s.seat)){this.button('choose-submit','提交预选',16,y,358,()=>void this.game.submit(),true,this.game.canPlay);y+=70;}
          for(const pair of tributeConflicts(choice).filter(pair=>pair.includes(s.seat))){const opponent=pair.find(who=>who!==s.seat)!;this.button('duel-'+opponent,'与'+this.game.name(opponent)+'猜拳',16,y,358,()=>void this.game.choiceAction({kind:'rps-start',opponent}),false,!this.game.busy);y+=70;}
        }
      }
      const contest=s.status==='tribute'?s.tribute?.contests.at(-1):null;
      if(contest)y=this.note(contest.players.map((who,i)=>this.game.name(who)+':'+rpsLabel(contest.moves[i])).join(' · ')+' · '+(contest.winner===null?'平手重猜':this.game.name(contest.winner)+'胜出'),y);
      if((s.teammateHands||[]).length){this.button('teammates',(this.game.showTeammates?'收起':'查看')+'队友手牌',16,y,358,()=>this.game.toggleTeammates(),true);y+=70;
        if(this.game.showTeammates){for(const player of s.teammateHands||[]){this.text(this.game.name(player.seat)+' · '+player.hand.length+' 张',16,y,13,colors.accent);y+=28;player.hand.forEach((card,index)=>{const x=16+(index%7)*52,row=y+Math.floor(index/7)*73;this.box(x,row,46,64,'#f0f0dd','#adb99e');const color=card.suit===0||card.suit===2?colors.red:colors.bg;this.text(rankLabel(card.rank),x+6,row+7,17,color);this.pixel(SUIT_GLYPHS[card.suit],{'#':color},x+20,row+36,2);});y+=Math.ceil(player.hand.length/7)*73+12;}}}
      this.text(miniText(s.ownIdentity)+' · '+(this.game.remote?'好友房':'机器人练习'),16,y,12,colors.muted);
      this.text(s.status==='tribute'?'回牌禁选 ♠A、♠3、♦4':'点选手牌后出牌',374,y,11,colors.muted,'right');y+=32;
      const rows=Math.ceil(s.hand.length/7);
      s.hand.forEach((card,i)=>this.card(card,16+(i%7)*52,y+Math.floor(i/7)*78));y+=rows*78+5;
      const busy=this.game.busy;
      this.button('pass','过牌',16,y,105,()=>void this.game.submit(true),false,this.game.canPass);
      this.button('hint','提示',133,y,105,()=>this.game.hint(),false,this.game.canAct);
      this.button('play',s.status==='tribute'?'确认回牌':busy?'处理中…':'出牌 ↑',250,y,124,()=>void this.game.submit(),true,this.game.canPlay);y+=68;
      if(s.status==='finished'){
        this.box(16,y,358,178);this.text('本局积分',30,y+15,18,colors.accent);
        s.players.slice().sort((a,b)=>(a.rank||0)-(b.rank||0)).forEach((p,i)=>{this.text(this.fitted(`第${p.rank}名 ${this.game.name(p.seat)} · ${miniText(p.identity)}`,275,12),30,y+50+i*28,12);this.text((s.scores[p.seat]>0?'+':'')+s.scores[p.seat],358,y+50+i*28,14,colors.accent,'right');});y+=194;
        this.button('next','下一局 · 换牌',16,y,358,()=>void this.game.nextRound(),true,!busy);y+=68;
      }
    }
    if(this.game.error)y=this.wrap(this.game.error,16,y,358,13,'#f4b6a7',22)+14;
    this.button('practice',s?'新开练习':'开始练习 →',16,y,173,()=>{this.scroll=0;this.game.practice();},true,!this.game.busy);
    this.button('friends','好友开桌',201,y,173,()=>{this.open('account');void this.authConfig();},false,!this.game.busy);y+=76;
    this.text('四人扑克 · 纯娱乐积分 · 等量换牌',195,y,11,colors.muted,'center');y+=30;
    if(this.sidebar){
      this.button('sidebar',this.fromSidebar?'从侧边栏回来啦':'下次从侧边栏找我',16,y,358,()=>this.tt.navigateToScene({scene:'sidebar',fail:()=>{this.game.error='暂时无法打开侧边栏，请稍后再试';this.draw();}}));y+=68;
    }
    this.button('privacy','隐私说明',131,y,128,()=>this.open('privacy'),false,true,44);return y+52;
  }
  private pixel(rows:string[],palette:Record<string,string>,x:number,y:number,scale:number){for(const p of pixelRects(rows,palette))this.rect(x+p.x*scale,y+p.y*scale,scale,scale,p.color);}
  private card(card:Card,x:number,y:number){
    const selected=this.game.selected.has(id(card));if(selected)y-=6;this.box(x,y,46,69,selected?'#e2efbb':'#f0f0dd',selected?'#96cc68':'#adb99e');
    if(isIdentity(card)){this.ctx.strokeStyle='#d0b36c';this.ctx.lineWidth=2;this.ctx.strokeRect(x+4,y+4,38,61);}
    const color=card.suit===0||card.suit===2?colors.red:colors.bg;this.text(rankLabel(card.rank),x+6,y+8,18,color);this.pixel(SUIT_GLYPHS[card.suit],{'#':color},x+22,y+39,2);
    this.targets.push({x,y,w:46,h:69,key:'card:'+id(card),action:()=>this.game.select(id(card))});
  }
  private drawRules(y:number){
    const page=RULE_PAGES[this.rulePage];this.text(page.title,16,y,22,colors.accent);y+=42;
    for(const paragraph of page.paragraphs)y=this.wrap(paragraph,16,y,358,16,colors.ink,28)+20;
    this.button('previous','上一页',16,y,108,()=>{this.rulePage--;this.scroll=0;this.draw();},false,this.rulePage>0);
    this.text(`${this.rulePage+1} / ${RULE_PAGES.length}`,195,y+20,14,colors.muted,'center');
    this.button('next-rule','下一页',266,y,108,()=>{this.rulePage++;this.scroll=0;this.draw();},false,this.rulePage<RULE_PAGES.length-1);return y+80;
  }
  private async authConfig(){try{const data=await this.call('/auth/config');this.emailCode=!!data.emailCode;this.draw();}catch(e){this.game.error=e instanceof Error?e.message:String(e);this.draw();}}
  private call(path:string,data?:unknown):Promise<any>{return new Promise((resolve,reject)=>this.tt.request({url:this.apiBase+path,method:data?'POST':'GET',data,success:(r:any)=>r.statusCode<300?resolve(r.data):reject(Error(r.data?.error||'连接失败')),fail:()=>reject(Error('房间服务暂时无法连接，可继续离线练习'))}));}
  private field(key:string,title:string,y:number,max=80){
    this.text(title,16,y,13,colors.muted);y+=23;this.box(16,y,358,48,'#14212a');
    this.text(this.fitted(key==='password'?'•'.repeat(this.fields[key].length):(this.fields[key]||'点击输入'),330,14),29,y+17,14,this.fields[key]?colors.ink:colors.muted);
    this.targets.push({x:16,y,w:358,h:48,key:'input:'+key,action:()=>{this.editing=key;this.keyboardOpen=true;this.tt.showKeyboard({defaultValue:this.fields[key],maxLength:max,multiple:false,confirmHold:false,confirmType:'done',fail:()=>{this.editing=null;this.keyboardOpen=false;this.game.error='键盘暂不可用，请重试';this.draw();}});}});return y+63;
  }
  private drawAccount(y:number){
    const user=this.game.session?.user;this.text(user?'好友牌桌':this.register?'注册牌友账号':'登录牌友账号',16,y,24,colors.accent);y+=44;
    if(user){
      y=this.wrap(`${user.name} · 积分 ${user.score} · ${user.wins}/${user.games} 胜`,16,y,358,15,colors.ink,26)+18;
      this.button('create-room','创建好友房',16,y,358,()=>void this.connect(),true,!this.game.busy);y+=74;
      y=this.field('room','输入 10 位房号',y,10);this.button('join-room','加入房间',16,y,358,()=>void this.connect(this.fields.room),true,!this.game.busy&&/^[a-f0-9]{10}$/i.test(this.fields.room));y+=76;
      this.button('logout','退出账号',16,y,358,()=>{this.game.logout();this.draw();});y+=74;
    }else{
      y=this.wrap('账号名或邮箱均可登录，牌桌显示昵称。离线练习无需登录。',16,y,358,14,colors.muted,24)+18;
      y=this.field('email',this.register?'邮箱':'账号名或邮箱',y,100);y=this.field('password','密码（至少 8 位）',y,72);
      if(this.register){y=this.field('username','账号名（3–24 位字母、数字或下划线）',y,24);y=this.field('name','昵称',y,12);if(this.emailCode){y=this.field('code','邮箱验证码（可选）',y,6);this.button('send-code','发送邮箱验证码',16,y,358,()=>void this.game.sendEmailCode(this.fields.email));y+=70;}}
      this.button('login',this.game.busy?'连接中…':this.register?'注册并登录':'登录',16,y,358,()=>{void this.game.login(this.fields.email,this.fields.password,this.register?this.fields.name:undefined,this.fields.code,this.register?this.fields.username:undefined).then(ok=>{if(ok)this.fields.password='';});},true,!this.game.busy&&!!this.fields.email&&this.fields.password.length>=8&&(!this.register||(!!this.fields.name&&/^[a-z0-9_]{3,24}$/i.test(this.fields.username))));y+=74;
      this.button('switch-auth',this.register?'已有账号，去登录':'没有账号，去注册',16,y,358,()=>{this.register=!this.register;this.draw();});y+=74;
    }
    if(this.game.error)y=this.wrap(this.game.error,16,y,358,14,'#f4b6a7',24)+16;
    return y+10;
  }
  private async connect(code?:string){if(await this.game.enterRoom(code)){this.panel='table';this.scroll=0;this.draw();}}
  private drawPrivacy(y:number){
    this.text('隐私说明',16,y,24,colors.accent);y+=44;
    for(const text of [
      '离线练习仅在当前设备运行，不需要账号，不上传手牌或练习记录。',
      '使用好友房时，房间服务处理邮箱、昵称、密码、头像、对局动作和积分；密码在服务端加盐哈希，设备仅保存登录会话和房号。昵称、头像、出牌与公开积分会展示给同桌玩家，手牌仅自己可见。',
      '退出账号会移除设备上的会话与房号。不申请通讯录、位置、摄像头或麦克风权限；不包含付费、广告或积分兑换。',
      '请勿在昵称中填写真实姓名、电话等个人资料。隐私问题可通过抖音平台的反馈入口联系运营者。'
    ])y=this.wrap(text,16,y,358,15,colors.ink,27)+20;
    return y;
  }
}
