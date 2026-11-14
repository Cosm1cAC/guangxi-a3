import { MusicPlayer, type MusicEvent, type MusicPort } from '../core/music';

export function browserMusicPort():MusicPort{
  const audio=new Audio();audio.preload='metadata';
  return {
    get src(){return audio.src;},set src(value){audio.src=value;},
    get volume(){return audio.volume;},set volume(value){audio.volume=value;},
    get currentTime(){return audio.currentTime;},get duration(){return audio.duration;},
    play:()=>audio.play(),pause:()=>audio.pause(),seek:seconds=>{audio.currentTime=seconds;},load:()=>audio.load(),
    on:(event:MusicEvent,listener)=>audio.addEventListener(event,listener),
    dispose:()=>{audio.pause();audio.removeAttribute('src');audio.load();}
  };
}
export function createBrowserMusicPlayer(){return new MusicPlayer(browserMusicPort,{
  read:()=>JSON.parse(localStorage.getItem('a3-music')||'null'),write:settings=>localStorage.setItem('a3-music',JSON.stringify(settings))
});}
