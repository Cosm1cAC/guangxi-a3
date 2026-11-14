import { MusicPlayer, type MusicEvent, type MusicPort } from './music';

/** wx/tt expose the same InnerAudioContext interface; music stays out of main packages. */
export function createNativeMusicPlayer(platform:any,apiBase:string){
  const root=apiBase.replace(/\/api\/?$/,'');
  return new MusicPlayer(()=>{
    const audio=platform.createInnerAudioContext();audio.autoplay=false;audio.loop=false;audio.obeyMuteSwitch=true;
    const callbacks:Partial<Record<MusicEvent,string>>={play:'onPlay',pause:'onPause',ended:'onEnded',timeupdate:'onTimeUpdate',loadedmetadata:'onCanplay',waiting:'onWaiting',error:'onError'};
    const port:MusicPort={
      get src(){return audio.src;},set src(value){audio.src=root+value;},
      get volume(){return audio.volume;},set volume(value){audio.volume=value;},
      get currentTime(){return audio.currentTime||0;},get duration(){return audio.duration||0;},
      play:()=>audio.play(),pause:()=>audio.pause(),seek:seconds=>audio.seek(seconds),
      load:()=>{const src=audio.src;audio.stop();audio.src=src;},
      on:(event,listener)=>{audio[callbacks[event]!]?.(listener);},dispose:()=>{audio.stop();audio.destroy();}
    };return port;
  },{read:()=>platform.getStorageSync('a3-music'),write:settings=>platform.setStorageSync('a3-music',settings)});
}
