import { expect, test } from 'vitest';
import { MusicPlayer, MUSIC_TRACKS, musicTime, type MusicEvent, type MusicPort } from '../src/core/music';
import { createNativeMusicPlayer } from '../src/core/native-music';

class FakeAudio implements MusicPort {
  src='';volume=1;currentTime=0;duration=120;plays=0;pauses=0;loads=0;disposed=false;
  events=new Map<MusicEvent,(()=>void)[]>();
  play=()=>{this.plays++;this.emit('play');};
  pause(){this.pauses++;this.emit('pause');}
  seek(seconds:number){this.currentTime=seconds;}
  load(){this.loads++;this.currentTime=0;}
  on(event:MusicEvent,cb:()=>void){this.events.set(event,[...(this.events.get(event)||[]),cb]);}
  emit(event:MusicEvent){for(const cb of this.events.get(event)||[])cb();}
  dispose(){this.disposed=true;}
}
function setup(saved:unknown=null,random=()=>0){const audio=new FakeAudio();let stored:any;const player=new MusicPlayer(()=>audio,{read:()=>saved,write:s=>{stored=s;}},random);return {audio,player,saved:()=>stored};}

test('音乐在用户手势前不加载，启用后播放，暂停保留进度并记住曲目',()=>{
  const {player,audio,saved}=setup();expect(audio.plays).toBe(0);expect(audio.src).toBe('');
  player.activate();expect(audio.plays).toBe(1);expect(player.status).toBe('playing');
  audio.currentTime=42;audio.emit('timeupdate');player.setEnabled(false);expect(player.position).toBe(42);expect(player.status).toBe('paused');
  player.next();expect(audio.plays).toBe(1);expect(player.track.id).toBe(MUSIC_TRACKS[1].id);expect(saved().enabled).toBe(false);
  player.setEnabled(true);expect(player.status).toBe('playing');
  const restored=setup(saved()).player;expect(restored.track.id).toBe(MUSIC_TRACKS[1].id);expect(restored.status).toBe('idle');
});

test('列表自动连播与末曲回首，单曲循环，手动下一首能跳过单曲循环',()=>{
  const {player,audio}=setup();player.activate();audio.emit('ended');expect(player.track.id).toBe(MUSIC_TRACKS[1].id);
  player.select(MUSIC_TRACKS[3].id);audio.emit('ended');expect(player.track.id).toBe(MUSIC_TRACKS[0].id);
  player.setMode('single');audio.currentTime=120;audio.emit('loadedmetadata');const id=player.track.id;audio.emit('ended');expect(player.track.id).toBe(id);expect(audio.currentTime).toBe(0);
  player.next();expect(player.track.id).not.toBe(id);
});

test('随机切歌不立即重复，上一首遵循实际播放历史',()=>{
  const {player}=setup(null,()=>.99);player.setMode('shuffle');const first=player.track.id;player.next();const second=player.track.id;player.next();const third=player.track.id;
  expect(second).not.toBe(first);expect(third).not.toBe(second);player.previous();expect(player.track.id).toBe(second);player.previous();expect(player.track.id).toBe(first);
});

test('音乐音量与总音量相乘，进度拖动限制范围并拒绝非有限数值',()=>{
  const {player,audio}=setup();player.activate();player.setVolume(.4);player.setMasterVolume(.5);expect(audio.volume).toBe(.2);
  audio.emit('loadedmetadata');player.seek(500);expect(audio.currentTime).toBe(120);player.seek(-10);expect(audio.currentTime).toBe(0);player.seek(NaN);expect(audio.currentTime).toBe(0);
  player.setVolume(10);expect(audio.volume).toBe(.5);player.setVolume(NaN);expect(audio.volume).toBe(.5);
  expect(musicTime(134.9)).toBe('2:14');expect(musicTime(Infinity)).toBe('0:00');
});

test('后台暂停与前台恢复尊重用户暂停选择',()=>{
  const {player,audio}=setup();player.activate();player.suspend();expect(player.status).toBe('paused');const plays=audio.plays;audio.emit('ended');expect(player.track.id).toBe(MUSIC_TRACKS[0].id);
  player.resume();expect(audio.plays).toBe(plays+1);player.setEnabled(false);player.suspend();player.resume();expect(audio.plays).toBe(plays+1);
});

test('快速切歌后旧播放请求失败，不污染新曲目状态',async()=>{
  const {player,audio}=setup();let rejectOld!:(e:Error)=>void;
  audio.play=(()=>{audio.plays++;if(audio.plays===1)return new Promise<void>((_,reject)=>{rejectOld=reject;});audio.emit('play');return Promise.resolve();}) as any;
  player.activate();player.next();await Promise.resolve();rejectOld(Error('old aborted'));await Promise.resolve();await Promise.resolve();
  expect(player.track.id).toBe(MUSIC_TRACKS[1].id);expect(player.error).toBe('');expect(player.status).toBe('playing');
});

test('文件错误可重试或切歌，自动播放拒绝显示可操作提示，释放资源后不继续播放',async()=>{
  const {player,audio}=setup();player.activate();audio.emit('error');expect(player.status).toBe('error');player.retry();expect(audio.loads).toBe(1);expect(player.error).toBe('');
  audio.play=(()=>Promise.reject(Object.assign(Error(),{name:'NotAllowedError'}))) as any;player.next();await Promise.resolve();await Promise.resolve();expect(player.error).toContain('点击播放');
  player.dispose();expect(audio.disposed).toBe(true);expect(player.status).toBe('idle');
});

test('无效本地设置回退，正常设置保留，存储失败不阻止播放',()=>{
  const {player}=setup({trackId:'unknown',mode:'bad',volume:-4,enabled:'yes'});expect(player.track.id).toBe(MUSIC_TRACKS[0].id);expect(player.settings).toMatchObject({mode:'list',volume:0,enabled:true});
  const audio=new FakeAudio(),p=new MusicPlayer(()=>audio,{read(){throw Error('storage');},write(){throw Error('quota');}});p.activate();p.next();expect(p.status).toBe('playing');
});

test('原生播放器采用同一曲库，使用游戏服务域名，真实 onPlay 前保持加载状态',()=>{
  const callbacks:Record<string,()=>void>={},inner:any={src:'',volume:1,currentTime:0,duration:180,autoplay:true,loop:true,obeyMuteSwitch:false,play(){},pause(){callbacks.onPause?.();},seek(n:number){this.currentTime=n;},stop(){},destroy(){}};
  for(const name of ['onPlay','onPause','onEnded','onCanplay','onTimeUpdate','onWaiting','onError'])inner[name]=(cb:()=>void)=>{callbacks[name]=cb;};
  const player=createNativeMusicPlayer({createInnerAudioContext:()=>inner,getStorageSync:()=>null,setStorageSync(){}},'https://a3.example.com/api');
  player.activate();expect(inner.src).toBe('https://a3.example.com'+MUSIC_TRACKS[0].src);expect(inner.autoplay).toBe(false);expect(player.status).toBe('loading');
  callbacks.onPlay();expect(player.status).toBe('playing');callbacks.onCanplay();player.seek(90);expect(inner.currentTime).toBe(90);player.suspend();expect(player.status).toBe('paused');
});
