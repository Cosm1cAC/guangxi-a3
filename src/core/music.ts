export const MUSIC_TRACKS=[
  {id:'first-light',title:'First Light Particles',caption:'晨光微粒 · 轻柔钢琴',artist:'Yoiyami',src:'/audio/first-light.mp3',source:'https://opengameart.org/content/first-light-particles-%E2%80%93-cc0-atmospheric-pianoambient-track'},
  {id:'deep-blue',title:'Yoiyami Core Theme',caption:'深蓝夜色 · 钢琴与氛围',artist:'Yoiyami',src:'/audio/deep-blue.mp3',source:'https://opengameart.org/content/yoiyami-core-theme-%E2%80%93-deep-blue-ambient-piano'},
  {id:'vaporware',title:'Vaporware',caption:'云间浮游 · 钢琴与合成器',artist:'The Cynic Project',src:'/audio/vaporware.mp3',source:'https://opengameart.org/content/calm-piano-1-vaporware'},
  {id:'mystical-piano',title:'Mystical Piano',caption:'静谧琴声 · 舒缓钢琴',artist:'Indieteur',src:'/audio/mystical-piano.mp3',source:'https://opengameart.org/content/mystical-piano'},
] as const;
export type MusicTrack=typeof MUSIC_TRACKS[number];
export type PlayMode='list'|'shuffle'|'single';
export type MusicSettings={trackId:string;mode:PlayMode;volume:number;enabled:boolean};
export type MusicEvent='play'|'pause'|'ended'|'timeupdate'|'loadedmetadata'|'waiting'|'error';
export interface MusicPort {
  src:string;volume:number;readonly currentTime:number;readonly duration:number;
  play():Promise<void>|void;pause():void;seek(seconds:number):void;load?():void;
  on(event:MusicEvent,listener:()=>void):void;dispose():void;
}
export interface MusicStorage {read():unknown;write(settings:MusicSettings):void;}

/** One queue for Web/Android and native clients; the platform adapter owns playback. */
export class MusicPlayer {
  settings:MusicSettings={trackId:MUSIC_TRACKS[0].id,mode:'list',volume:.5,enabled:true};
  status:'idle'|'loading'|'playing'|'paused'|'error'='idle';
  position=0;duration=0;error='';changed=()=>{};
  private port:MusicPort|null=null;
  private active=false;
  private suspended=false;
  private masterVolume=1;
  private generation=0;
  private history:string[]=[];
  constructor(private createPort:()=>MusicPort,private storage:MusicStorage,private random:()=>number=Math.random){
    try{
      const saved=storage.read();
      if(saved&&typeof saved==='object'){
        const s=saved as Partial<MusicSettings>;
        if(MUSIC_TRACKS.some(t=>t.id===s.trackId))this.settings.trackId=s.trackId!;
        if(s.mode==='list'||s.mode==='shuffle'||s.mode==='single')this.settings.mode=s.mode;
        if(typeof s.volume==='number'&&Number.isFinite(s.volume))this.settings.volume=Math.max(0,Math.min(1,s.volume));
        if(typeof s.enabled==='boolean')this.settings.enabled=s.enabled;
      }
    }catch{/* Storage may be disabled. */}
  }
  get track():MusicTrack{return MUSIC_TRACKS.find(t=>t.id===this.settings.trackId)||MUSIC_TRACKS[0];}
  get playing(){return this.status==='playing';}
  get wantsPlayback(){return this.settings.enabled&&this.active&&!this.suspended;}
  private save(){try{this.storage.write({...this.settings});}catch{/* Playback works without storage. */}}
  private notify(){this.changed();}
  /** Called from a real user interaction; construction alone never starts audio. */
  activate(){if(this.active)return;this.active=true;this.sync();}
  setEnabled(enabled:boolean){if(this.settings.enabled===enabled&&this.status!=='error')return;this.generation++;this.settings.enabled=enabled;this.save();this.sync();}
  setMasterVolume(volume:number){this.masterVolume=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):1;this.volume();}
  setVolume(volume:number){if(!Number.isFinite(volume))return;this.settings.volume=Math.max(0,Math.min(1,volume));this.save();this.volume();this.notify();}
  setMode(mode:PlayMode){if(!['list','shuffle','single'].includes(mode))return;this.settings.mode=mode;this.save();this.notify();}
  select(trackId:string){
    if(!MUSIC_TRACKS.some(t=>t.id===trackId))return;
    if(trackId!==this.track.id){this.history.push(this.track.id);this.history=this.history.slice(-100);}
    this.settings.trackId=trackId;this.generation++;this.position=0;this.duration=0;this.error='';this.save();
    if(this.port){this.port.pause();this.port.src=this.track.src;this.port.load?.();}
    this.status=this.wantsPlayback?'loading':'paused';this.sync();
  }
  next(){
    const index=MUSIC_TRACKS.findIndex(t=>t.id===this.track.id);
    const next=this.settings.mode==='shuffle'?(index+1+Math.floor(this.random()*(MUSIC_TRACKS.length-1)))%MUSIC_TRACKS.length:(index+1)%MUSIC_TRACKS.length;
    this.select(MUSIC_TRACKS[next].id);
  }
  previous(){const previous=this.history.pop();const index=MUSIC_TRACKS.findIndex(t=>t.id===this.track.id);this.select(previous||MUSIC_TRACKS[(index+MUSIC_TRACKS.length-1)%MUSIC_TRACKS.length].id);this.history.pop();}
  seek(seconds:number){if(!this.port||!Number.isFinite(seconds)||this.duration<=0)return;this.position=Math.max(0,Math.min(this.duration,seconds));this.port.seek(this.position);this.notify();}
  suspend(){this.generation++;this.suspended=true;this.sync();}
  resume(){this.suspended=false;this.sync();}
  retry(){this.generation++;this.error='';if(this.port){this.port.src=this.track.src;this.port.load?.();}this.sync();}
  private volume(){if(this.port)this.port.volume=this.settings.volume*this.masterVolume;}
  private getPort(){
    if(this.port)return this.port;
    const port=this.port=this.createPort();
    const time=()=>{this.position=Number.isFinite(port.currentTime)?Math.max(0,port.currentTime):0;this.duration=Number.isFinite(port.duration)?Math.max(0,port.duration):0;this.notify();};
    port.on('timeupdate',time);port.on('loadedmetadata',time);
    port.on('play',()=>{if(!this.wantsPlayback){port.pause();return;}this.status='playing';this.error='';this.notify();});
    port.on('pause',()=>{if(!this.wantsPlayback){this.status='paused';this.notify();}});
    port.on('waiting',()=>{if(this.wantsPlayback){this.status='loading';this.notify();}});
    port.on('error',()=>{this.status='error';this.error='这首音乐暂时无法播放，可重试或切换下一首';this.notify();});
    port.on('ended',()=>{if(!this.wantsPlayback)return;if(this.settings.mode==='single'){this.seek(0);this.sync();}else this.next();});
    port.src=this.track.src;this.volume();return port;
  }
  private sync(){
    if(!this.wantsPlayback){if(this.port)this.port.pause();if(this.active)this.status='paused';this.notify();return;}
    try{
      const port=this.getPort(),generation=this.generation;this.volume();this.status='loading';this.notify();
      const promise=port.play();
      if(promise)promise.then(()=>{if(generation!==this.generation||!this.wantsPlayback)return;this.status='playing';this.error='';this.notify();}).catch(error=>{
        if(generation!==this.generation||!this.wantsPlayback)return;
        this.status='error';this.error=error?.name==='NotAllowedError'?'点击播放，开启音乐':'这首音乐暂时无法播放，可重试或切换下一首';this.notify();
      });
    }catch{this.status='error';this.error='当前设备暂不支持音乐播放';this.notify();}
  }
  dispose(){this.active=false;this.generation++;this.port?.dispose();this.port=null;this.status='idle';this.changed=()=>{};}
}

export function musicTime(seconds:number){const s=Number.isFinite(seconds)?Math.max(0,Math.floor(seconds)):0;return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
