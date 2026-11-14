import { createGame, createNextGame, act, returnTribute, tributeAction, botTributeAction, tributeConflicts, rpsLabel, isIdentity, isOpeningCard, canReturnTribute, view, legalMoves, movesFor, id, label, rankLabel, suits, classify, power, type Game, type GameView, type Card, type TributeAction, type RpsMove } from '../core/game';
import { SoundEngine } from './audio';
import { MUSIC_TRACKS, musicTime, type PlayMode } from '../core/music';
import { createChat, banter, type ChatMsg } from './chat';
import type { Stage } from './scene/stage';
import { api as request, session, myAvatar, saveGuestAvatar, faceImg, createAccount, type User } from './account';
import { AVATAR_OPTIONS, AVATAR_LABELS, AVATAR_KEYS, BOT_AVATARS, DEFAULT_AVATAR, randomAvatar, type Avatar } from '../core/avatar';
import './style.css';

type Remote = GameView & { room: string; roomStatus: string; members: { name: string; bot: boolean; avatar?: Avatar }[] };
const app = document.querySelector<HTMLDivElement>('#app')!;
const icon = {
  rules: '<svg viewBox="0 0 24 24"><path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z"/><path d="M9 8h6M9 12h6"/></svg>',
  log: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg>',
  user: '<svg viewBox="0 0 24 24"><path d="M8 4h8v8H8zM4 20v-4h16v4"/></svg>',
};
app.innerHTML = `
<canvas id="scene" aria-label="3D 牌桌：方块漓江茶亭"></canvas>
<div class="vignette" aria-hidden="true"></div>
<header class="hud-top">
  <a class="brand" href="/" aria-label="山水尖3 首页"><img src="/assets/emblem.svg" alt=""><span><b>山水尖3</b><small id="mode">方块漓江 · 四人扑克</small></span></a>
  <nav>
    <button class="icon-btn account" id="account" aria-label="账号" title="账号"></button>
    <button class="icon-btn" id="rules" aria-label="玩法说明" title="玩法说明">${icon.rules}<span>玩法</span></button>
    <button class="icon-btn" id="history" aria-label="出牌记录" title="出牌记录" hidden>${icon.log}<span>记录</span></button>
    <button class="icon-btn" id="chat-btn" aria-label="聊天" title="聊天（C）" hidden>${icon.chat}<span>闲话</span><i class="badge" id="chat-badge" hidden></i></button>
    <button class="icon-btn" id="sound" aria-label="声音设置" title="声音设置" aria-expanded="false">${icon.sound}<span>声音</span></button>
    <button class="icon-btn" id="restart" aria-label="新开一局" title="新开一局" hidden>${icon.home}<span>新局</span></button>
    <button class="icon-btn hide-sm" id="fullscreen" aria-label="全屏" title="全屏">${icon.full}</button>
  </nav>
</header>
<div class="sound-panel glass" id="sound-panel" hidden>
  <div class="music-heading"><h3>方块留声机</h3><span>4 首 · CC0</span></div>
  <div class="now-playing"><div class="music-disc" id="music-disc" aria-hidden="true"><i></i></div><div><b id="music-title"></b><small id="music-artist"></small><span id="music-status" role="status" aria-live="polite">点击播放，开启音乐</span></div></div>
  <div class="music-controls"><button id="music-prev" aria-label="上一首" title="上一首">◀◀</button><button id="music-play" aria-label="播放音乐">播放</button><button id="music-next" aria-label="下一首" title="下一首">▶▶</button></div>
  <label class="music-seek"><span><b id="music-current">0:00</b><b id="music-duration">0:00</b></span><input id="music-progress" aria-label="音乐播放进度" type="range" min="0" max="1" step="1" value="0" disabled></label>
  <label class="music-mode">播放方式<select id="music-mode" aria-label="播放方式"><option value="list">列表循环</option><option value="shuffle">随机播放</option><option value="single">单曲循环</option></select></label>
  <div id="music-list" class="music-list" aria-label="预置曲目">${MUSIC_TRACKS.map((track,i)=>`<button data-track="${track.id}" aria-label="播放 ${track.title}"><span class="track-number">${String(i+1).padStart(2,'0')}</span><span><b>${track.title}</b><small>${track.caption}</small></span><span class="track-marker" aria-hidden="true">♪</span></button>`).join('')}</div>
  <p id="music-error" class="music-error" role="alert" hidden></p><button id="music-retry" class="music-retry" hidden>重试当前曲目</button>
  <label class="slider">音乐音量<input id="music-volume" aria-label="音乐音量" type="range" min="0" max="1" step=".05"></label>
  <div class="sound-divider"></div>
  <label class="switch"><input type="checkbox" data-key="sfx"><span></span>牌桌音效</label>
  <label class="switch"><input type="checkbox" data-key="music"><span></span>背景音乐</label>
  <label class="switch"><input type="checkbox" data-key="ambient"><span></span>江水虫鸣</label>
  <label class="slider">总音量<input type="range" min="0" max="1" step=".05" id="volume"></label>
  <a class="music-license" href="/audio/CREDITS.txt" target="_blank" rel="noopener">曲目来源与 CC0 授权 ↗</a>
</div>
<aside class="chat glass" id="chat" hidden aria-label="茶亭闲话"></aside>
<aside class="wardrobe glass" id="wardrobe" hidden aria-label="更换形象"></aside>

<section class="intro" id="intro">
  <div class="intro-card">
    <div class="kicker"><i></i>广西民间扑克 · 方块漓江</div>
    <h1 class="title" aria-label="山水尖3"><span class="t1">山水</span><span class="t2">尖<em>3</em></span></h1>
    <p class="lede">黑桃 A 与黑桃 3，藏着你的队友。<br>捏好你的方块人，江上开局。</p>
    <div class="intro-actions">
      <button class="btn lacquer" id="practice"><span>开始练习</span><small>三位牌友已就座</small></button>
      <button class="btn ghost" id="online"><span>好友开桌</span><small>房号邀请 · 四人同桌</small></button>
      <button class="btn ghost" id="dress"><span>我的形象</span><small>肤色 · 发型 · 衣帽</small></button>
      <a class="btn ghost" href="/download/"><span>安卓下载</span><small>把牌桌装进口袋</small></a>
      <button class="btn lacquer" id="resume" hidden><span>回到牌桌</span><small id="resume-room"></small></button>
    </div>
    <ul class="pillars">
      <li><b>找队友</b><span>♠A 与 ♠3 同队，双牌在手即独食</span></li>
      <li><b>会压牌</b><span>同花顺 ＞ 四带一 ＞ 三带二 ＞ 同花 ＞ 顺子</span></li>
      <li><b>有来往</b><span>输方进贡最大牌，赢方等量还贡</span></li>
    </ul>
  </div>
  <div class="calligraphy" aria-hidden="true">好山好水好牌友</div>
</section>

<div id="plates"></div>
<div id="fx" aria-hidden="true"></div>
<div id="trick" class="flat-only"></div>

<section class="game-panel" id="game-panel" hidden>
  <div class="me glass" id="me"></div>
  <div class="identity-reminders" aria-live="polite"><div id="identity-held"></div><div id="identity-played"></div></div>
  <div class="dock">
    <div class="selection" id="selection-info">点选手牌，再点出牌</div>
    <div class="actions">
      <button class="btn ghost" id="pass">过牌<kbd>P</kbd></button>
      <button class="btn ghost" id="hint">提示<kbd>H</kbd></button>
      <button class="btn lacquer" id="play"><span id="play-label">出牌</span><kbd>␣</kbd></button>
    </div>
  </div>
  <div id="hand" aria-label="你的手牌"></div>
</section>
<footer class="foot" id="footer-state">纯娱乐积分 · 不涉及现金</footer>
<section id="tribute-choice" class="tribute-choice glass" aria-label="贡牌预选" hidden></section>
<div class="turn-banner" id="turn-banner" role="status" aria-live="polite"></div>
<div id="toast" role="status" aria-live="polite"></div>
<dialog id="dialog"><button class="close" aria-label="关闭">×</button><div id="dialog-body"></div></dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const sound = new SoundEngine();
let local: Game | null = null, remote: Remote | null = null, selected = new Set<string>(), busy = false, botTimer: ReturnType<typeof setTimeout> | undefined;
let poll: ReturnType<typeof setInterval> | undefined, roomId: string | null = null;
let prev: GameView | null = null, freshDeal = false, animUntil = 0;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(s: string) { $('#toast').textContent = s; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2800); }
const state = (): GameView | null => remote || (local ? view(local, 0) : null);
const BOTS = ['你', '阿桂', '小漓', '老邕'];
const playerName = (s: number) => remote ? (remote.members[s]?.name || '等待入座') : s === 0 && session.user ? session.user.name : BOTS[s];
/** 座位的人物形象：好友桌取成员快照，练习桌是自己加三位机器人；空座返回 null。 */
const seatAvatar = (s: number): Avatar | null => remote ? (remote.members[s] ? remote.members[s].avatar ?? DEFAULT_AVATAR : null) : s === 0 ? (draft ?? myAvatar()) : BOT_AVATARS[s - 1];
let draft: Avatar | null = null;
function syncAvatars() { const v = state(), me = v?.seat ?? 0; stage?.setAvatars([0, 1, 2, 3].map(r => seatAvatar((me + r) % 4))); }
const rel = (seat: number, me: number) => (seat - me + 4) % 4;
const countsOf = (s: GameView) => [0, 1, 2, 3].map(r => s.players[(s.seat + r) % 4].count);
const pans = [0, .6, 0, -.6];
const red = (c: Card) => c.suit === 0 || c.suit === 2;
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;
const cn = '一二三四';

// ---------- 3D stage (lazy, with graceful 2D fallback) ----------
let stage: Stage | undefined;
async function boot3D() {
  try {
    const { createStage } = await import('./scene/stage');
    stage = createStage($<HTMLCanvasElement>('#scene'), { toggle: k => toggleCard(k), hover: () => sound.hover() });
    const resize = () => stage?.resize(innerWidth, innerHeight);
    addEventListener('resize', resize); resize();
    stage.onFrame(placePlates);
    document.body.classList.add('webgl');
    syncAvatars();
    if (state()) { stage.setMode('table'); syncStage(state()!, true); }
  } catch (e) {
    console.warn(e); document.body.classList.add('flat'); toast('当前设备不支持 3D，已切换为平面牌桌');
  }
}
void boot3D();

addEventListener('pointerdown', () => sound.unlock(), { once: true, capture: true });
addEventListener('keydown', () => sound.unlock(), { once: true, capture: true });

// ---------- sound panel ----------
function renderSoundBtn() { const on = sound.settings.sfx || sound.settings.music || sound.settings.ambient; $('#sound').innerHTML = `${on ? icon.sound : icon.mute}<span>声音</span>`; }
function renderMusic(){
  const player=sound.musicPlayer;
  $('#music-title').textContent=player.track.title;$('#music-artist').textContent=player.track.artist;
  $('#music-status').textContent=player.status==='playing'?'正在播放':player.status==='loading'?'正在加载…':player.status==='error'?'播放遇到问题':player.status==='idle'?'点击播放，开启音乐':'已暂停';
  $('#music-current').textContent=musicTime(player.position);$('#music-duration').textContent=musicTime(player.duration);
  const progress=$<HTMLInputElement>('#music-progress');progress.max=String(player.duration||1);progress.disabled=player.duration<=0;progress.value=String(player.position);
  $('#music-play').textContent=player.wantsPlayback&&player.status!=='error'?'暂停':'播放';$('#music-play').setAttribute('aria-label',player.wantsPlayback&&player.status!=='error'?'暂停音乐':'播放音乐');
  $('#music-disc').classList.toggle('spinning',player.playing);
  $<HTMLSelectElement>('#music-mode').value=player.settings.mode;$<HTMLInputElement>('#music-volume').value=String(player.settings.volume);
  document.querySelectorAll<HTMLButtonElement>('[data-track]').forEach(button=>{const current=button.dataset.track===player.track.id;button.classList.toggle('current',current);button.setAttribute('aria-pressed',String(current));});
  $('#music-error').textContent=player.error;$('#music-error').hidden=!player.error;$('#music-retry').hidden=!player.error;
}
sound.musicPlayer.changed=renderMusic;
$('#music-prev').onclick=()=>{sound.unlock();sound.musicPlayer.previous();};
$('#music-next').onclick=()=>{sound.unlock();sound.musicPlayer.next();};
$('#music-play').onclick=()=>{
  const player=sound.musicPlayer,on=!player.wantsPlayback||player.status==='error';sound.settings.music=on;sound.unlock();sound.save();
  if(on&&player.status==='error')player.retry();$<HTMLInputElement>('[data-key="music"]').checked=on;renderSoundBtn();
};
document.querySelectorAll<HTMLButtonElement>('[data-track]').forEach(button=>button.onclick=()=>{
  sound.musicPlayer.select(button.dataset.track!);sound.settings.music=true;sound.unlock();sound.save();$<HTMLInputElement>('[data-key="music"]').checked=true;renderSoundBtn();
});
$<HTMLInputElement>('#music-progress').oninput=e=>sound.musicPlayer.seek(Number((e.target as HTMLInputElement).value));
$<HTMLInputElement>('#music-volume').oninput=e=>sound.musicPlayer.setVolume(Number((e.target as HTMLInputElement).value));
$<HTMLSelectElement>('#music-mode').onchange=e=>sound.musicPlayer.setMode((e.target as HTMLSelectElement).value as PlayMode);
$('#music-retry').onclick=()=>{sound.unlock();sound.musicPlayer.retry();};
document.addEventListener('visibilitychange',()=>{if(document.hidden)sound.musicPlayer.suspend();else sound.musicPlayer.resume();});
addEventListener('pagehide',()=>sound.musicPlayer.suspend());addEventListener('pageshow',()=>sound.musicPlayer.resume());
renderMusic();
document.querySelectorAll<HTMLInputElement>('#sound-panel [data-key]').forEach(inp => {
  const k = inp.dataset.key as 'sfx' | 'music' | 'ambient'; inp.checked = sound.settings[k];
  inp.onchange = () => { sound.settings[k] = inp.checked; sound.unlock(); sound.save(); renderSoundBtn(); sound.button(); };
});
$<HTMLInputElement>('#volume').value = String(sound.settings.volume);
$<HTMLInputElement>('#volume').oninput = e => { sound.settings.volume = Number((e.target as HTMLInputElement).value); sound.save(); };
$('#sound').onclick = e => { e.stopPropagation(); const p = $('#sound-panel'); p.hidden = !p.hidden; $('#sound').setAttribute('aria-expanded', String(!p.hidden)); sound.button(); };
document.addEventListener('click', e => { const p = $('#sound-panel'); if (!p.hidden && !p.contains(e.target as Node)) { p.hidden = true; $('#sound').setAttribute('aria-expanded', 'false'); } });
renderSoundBtn();
$('#fullscreen').onclick = () => { sound.button(); document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.().catch(() => {}); };
document.addEventListener('click', e => { if ((e.target as HTMLElement).closest('.btn:not(#play)')) sound.button(); });

// ---------- chat ----------
let localMsgId = 1_000_000_000, lastMsgId = 0;
const chat = createChat($('#chat'), { send: sendChat });
chat.onUnread(n => { const b = $('#chat-badge'); b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n); });
$('#chat-btn').onclick = e => { e.stopPropagation(); chat.toggle(); sound.button(); };
function onMessage(m: ChatMsg) {
  const s = state(); const mine = !!s && m.seat === s.seat;
  if (!chat.add(m, mine)) return;
  if (!s) return;
  bubble(rel(m.seat, s.seat), m.text.length > 18 ? m.text.slice(0, 17) + '…' : m.text, false, 'talk');
  if (!mine) sound.chat();
}
async function sendChat(text: string) {
  sound.unlock();
  if (remote && roomId) { const m = await api<ChatMsg & { id: number }>(`/rooms/${roomId}/messages`, { text }); lastMsgId = Math.max(lastMsgId, m.id); onMessage(m); return; }
  if (!local) throw Error('开局后才能聊天');
  onMessage({ id: localMsgId++, seat: 0, name: playerName(0), text });
  if (Math.random() < .6) { const seat = 1 + Math.floor(Math.random() * 3); setTimeout(() => botSay(seat, banter.reply(text)), 1100 + Math.random() * 1600); }
}
function botSay(seat: number, text: string) { if (!local || remote || seat === 0) return; onMessage({ id: localMsgId++, seat, name: BOTS[seat], text }); }
const maybe = (p: number, fn: () => void, delay = 900) => { if (!remote && Math.random() < p) setTimeout(fn, delay + Math.random() * 900); };

// ---------- dialogs ----------
function modal(html: string, cls = '') { $('#dialog-body').innerHTML = html; $('#dialog').className = cls; const d = $<HTMLDialogElement>('#dialog'); if (!d.open) d.showModal(); }
$('.close').onclick = () => $<HTMLDialogElement>('#dialog').close();
$('#rules').onclick = () => modal(`<div class="seal">规</div><div class="eyebrow">30 秒速查</div><h2>一看就会的尖3</h2>
<p>四人各 13 张。持 ♠A、♠3 的两人同队；同一人拿两张则<b>独食</b>，一打三。身份牌打出后才公开。</p>
<ol class="rule-list"><li><b>♦4 先出</b><span>首手必须包含 ♦4，逆时针轮转。</span></li><li><b>单 · 对 · 三 · 五张</b><span>只跟相同张数。四张不能裸出，没有炸弹。</span></li><li><b>五张层级</b><span>同花顺 ＞ 四带一 ＞ 三带二 ＞ 同花 ＞ 顺子。</span></li><li><b>牌序</b><span>3 ＞ 2 ＞ A ＞ K … ＞ 4；同点比 ♠ ＞ ♥ ＞ ♣ ＞ ♦。同花比最大牌。</span></li><li><b>顺子</b><span>仅 34567 到 10JQKA，2 不入顺。</span></li><li><b>接风</b><span>其余在局玩家全过，最后出牌者领出；已出完则下家接风。过牌后可再出。</span></li><li><b>报单</b><span>只剩一张且能压时，必须出牌。</span></li>
<li><b>进贡与预选</b><span>从第二局起：全胜／全败为大贡，2v2 两名输方各交 2 张、两名赢方各收 2 张；半胜／半败为小贡，各交各收 1 张；平局不贡。独食全胜／全败每家两张，半胜／半败每家一张。输方交出最大非身份牌放入同一贡牌池，受贡者自己预选，无冲突才统一分牌。</span></li>
<li><b>冲突与还贡</b><span>预选冲突时双方可改选，或发起石头剪刀布猜拳；双方提交后才公开手势，平手重来。胜者锁定预选，另一人从剩余牌重选。分牌后，逐张向所收贡牌的原交牌者等量返还，可退原贡牌；不能返还 ♠A、♠3、♦4。全部还完仍由 ♦4 先出。</span></li>
<li><b>照常进贡</b><span>不采用免贡／抗贡；即使进贡方摸到 ♠A＋♠3，也照常进贡。</span></li></ol>
<p class="muted">2v2：1、2 名一队全胜，每人 +2；1、3 名一队半胜，每人 +1；1、4 名对 2、3 名平局，双方 0 分且无贡牌；独食按名次 +6 / +3 / −3 / −6。多局累计积分。</p>
<p class="muted">快捷键：空格出牌 · P 过牌 · H 提示 · C 聊天 · Esc 取消选择</p>`, 'paper');
$('#history').onclick = () => { const s = state(); if (!s) return; modal(`<div class="eyebrow">第 ${s.round} 局</div><h2>出牌记录</h2><div class="history">${s.log.map(l => `<p>${escape(l.replace(/([0-3])号位/g, (_, n) => playerName(Number(n))))}</p>`).join('')}</div>`, 'paper'); const h = $('.history'); h.scrollTop = h.scrollHeight; };

// ---------- rendering ----------
const owesReturn = (s: GameView, seat: number) => s.status === 'tribute' && !s.tribute?.selection && !!s.tribute?.transfers.some(t => t.to === seat && !t.returned);
let tributeDraft=new Set<number>(),tributeDraftKey='';
function renderTributeChoice(s:GameView){
  const panel=$('#tribute-choice'),selection=s.status==='tribute'?s.tribute?.selection:null;
  panel.hidden=!selection;$('#turn-banner').hidden=!!selection;
  if(!selection)return;
  const quota=selection.quotas[s.seat]||0,locked=selection.locked.includes(s.seat),duel=selection.duel;
  const key=`${s.round}:${s.seat}:${JSON.stringify(selection.choices[s.seat]||[])}:${locked}:${duel?.id||0}`;
  if(key!==tributeDraftKey){tributeDraftKey=key;tributeDraft=new Set(selection.choices[s.seat]||[]);}
  const conflicts=tributeConflicts(selection),opponents=conflicts.filter(pair=>pair.includes(s.seat)).map(pair=>pair.find(who=>who!==s.seat)!);
  const reserved=new Set(selection.locked.filter(who=>who!==s.seat).flatMap(who=>selection.choices[who]));
  const last=s.tribute!.contests.at(-1);
  panel.innerHTML=`<h3>贡牌池 · 双方预选</h3><p>${quota?`你可选 ${quota} 张；双方无冲突才分牌`:'等待受贡者选牌；预选完成后开始还贡'}</p>
    <div class="tribute-pool">${s.tribute!.transfers.map((t,i)=>{
      const picked=Object.entries(selection.choices).filter(([,cards])=>cards.includes(i)).map(([who])=>playerName(Number(who)));
      return `<button class="tribute-card ${t.card&&red(t.card)?'red':''} ${tributeDraft.has(i)?'selected':''} ${picked.length>1?'conflict':''}" data-tribute-card="${i}" aria-pressed="${tributeDraft.has(i)}" ${!quota||locked||duel||reserved.has(i)||busy?'disabled':''}><b>${t.card?label(t.card):'牌背'}</b><small>${escape(playerName(t.from))} 交出</small><small>${picked.length?escape(picked.join('、'))+' 预选':'尚未预选'}</small></button>`;
    }).join('')}</div>
    <p class="tribute-status" role="status">${duel?`猜拳第 ${duel.round} 轮 · ${duel.players.map(who=>escape(playerName(who))).join(' 对 ')}${duel.submitted.includes(s.seat)?' · 你已出拳，等待对方':''}`:conflicts.length?'选牌有冲突：双方可改选，或发起猜拳':locked?'猜拳胜出，你的预选已锁定':quota?`已选 ${tributeDraft.size}/${quota} 张${selection.choices[s.seat]?.length===quota?' · 已提交，可修改预选':''}`:'等待双方提交预选'}</p>
    ${last?`<p class="rps-result">${last.players.map((who,i)=>`${escape(playerName(who))}：${rpsLabel(last.moves[i])}`).join(' · ')} · ${last.winner===null?'平手，再来一轮':escape(playerName(last.winner))+' 胜出，保留预选'}</p>`:''}
    <div class="tribute-controls">${duel?duel.players.includes(s.seat)?(['rock','scissors','paper'] as const).map(move=>`<button class="btn ghost" data-rps="${move}" ${busy||duel.submitted.includes(s.seat)?'disabled':''}>${rpsLabel(move)}</button>`).join(''):'<span>等待双方猜拳</span>':`${quota&&!locked?`<button class="btn lacquer" id="tribute-confirm" ${busy||tributeDraft.size!==quota?'disabled':''}>提交预选 ${tributeDraft.size}/${quota}</button>`:''}${opponents.map(who=>`<button class="btn ghost" data-rps-start="${who}" ${busy?'disabled':''}>与${escape(playerName(who))}猜拳</button>`).join('')}`}</div>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-tribute-card]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.tributeCard);tributeDraft.has(i)?tributeDraft.delete(i):tributeDraft.add(i);render();});
  const confirm=panel.querySelector<HTMLButtonElement>('#tribute-confirm');if(confirm)confirm.onclick=()=>void sendTributeChoice({kind:'select',cards:[...tributeDraft]});
  panel.querySelectorAll<HTMLButtonElement>('[data-rps-start]').forEach(button=>button.onclick=()=>void sendTributeChoice({kind:'rps-start',opponent:Number(button.dataset.rpsStart)}));
  panel.querySelectorAll<HTMLButtonElement>('[data-rps]').forEach(button=>button.onclick=()=>void sendTributeChoice({kind:'rps',move:button.dataset.rps as RpsMove,round:duel!.round,duelId:duel!.id}));
}
async function sendTributeChoice(action:TributeAction){
  const s=state();if(!s||busy)return;busy=true;render();
  try{if(remote&&roomId)remote=await api(`/rooms/${roomId}/tribute-choice`,{version:s.version,round:s.round,action});
    else if(local){const result=tributeAction(local,s.seat,action);if(!result.ok)throw Error(result.error);local=result.state;saveLocal();}}
  catch(error){toast(error instanceof Error?error.message:'贡牌操作失败');}
  finally{busy=false;render();scheduleBot();}
}
function plateHTML(s: GameView, seat: number) {
  const p = s.players[seat], r = rel(seat, s.seat), active = (s.turn === seat && s.status === 'playing') || owesReturn(s, seat);
  const ident = p.identity === '身份未明' ? '' : `<em class="ident ${p.identity === '农民方' ? 'farmer' : 'a3'}">${p.identity}</em>`;
  const status = p.rank ? `<span class="rank r${p.rank}">第${cn[p.rank - 1]}名</span>` : `<span class="count${p.count === 1 ? ' warn' : ''}"><i class="mini-back"></i>${p.count}${p.count === 1 ? ' · 报单' : ''}</span>`;
  const total = s.round > 1 || s.status === 'finished' ? `<span class="total ${s.totals[seat] > 0 ? 'up' : s.totals[seat] < 0 ? 'down' : ''}">${signed(s.totals[seat])}</span>` : '';
  return `<div class="plate glass seat-${r} ${active ? 'active' : ''}" data-rel="${r}"><div class="avatar">${seatAvatar(seat) ? faceImg(seatAvatar(seat)!) : '?'}</div><div class="who"><b>${escape(playerName(seat))}</b><div class="tags">${status}${ident}${total}</div></div>${active ? '<div class="thinking"><i></i><i></i><i></i></div>' : ''}<div class="bubble" data-bubble></div></div>`;
}
function render() {
  const s = state(); if (!s) return;
  document.body.classList.add('playing'); $('#intro').hidden = true; $('#game-panel').hidden = false;
  for (const b of ['#history', '#restart', '#chat-btn']) $(b).hidden = false;
  $('#mode').textContent = `${remote ? `好友桌 · ${remote.room}` : '练习桌'} · 第 ${s.round} 局`;
  chat.setSubtitle(remote ? `房间 ${remote.room} · ${remote.members.length} 人` : '练习桌 · 三位牌友');
  $('#plates').innerHTML = [1, 2, 3].map(r => plateHTML(s, (s.seat + r) % 4)).join('');
  const me = s.players[s.seat], tributing = s.status === 'tribute', owe = owesReturn(s, s.seat);
  const pendingT = s.tribute?.transfers.find(t => t.to === s.seat && !t.returned);
  const held = s.hand.filter(isIdentity);
  $('#identity-held').textContent = held.length ? `你持有 ${held.map(label).join('、')}${held.length === 2 ? ' · 双牌独食，一打三' : ' · 留意队友'}` : '';
  const identityPlay = [...s.log].reverse().find(line => /^\d号位 · /.test(line) && /♠A|♠3/.test(line));
  $('#identity-played').textContent = identityPlay ? identityPlay.replace(/^(\d)号位 · /, (_, seat) => `${playerName(Number(seat))} 已打出：`) : '';
  $('#me').innerHTML = `${faceImg(seatAvatar(s.seat) ?? DEFAULT_AVATAR, 'mid')}<div class="seal-id ${s.ownIdentity === '农民方' ? 'farmer' : 'a3'}">${s.ownIdentity === '独食' ? '独食' : s.ownIdentity === 'A3方' ? 'A3' : '农'}</div><div><b>${escape(playerName(s.seat))}<small>${s.ownIdentity}</small>${s.round > 1 || s.status === 'finished' ? `<small class="total ${s.totals[s.seat] > 0 ? 'up' : s.totals[s.seat] < 0 ? 'down' : ''}">累计 ${signed(s.totals[s.seat])}</small>` : ''}</b><span>${me.rank ? `第 ${me.rank} 名` : `手牌 ${s.hand.length} 张`}${(s.turn === s.seat && s.status === 'playing') || owe ? ` · <em>${owe ? '请还贡' : '轮到你'}</em>` : ''}</span></div>`;
  $('#hand').innerHTML = s.hand.map(c => `<button class="card ${isIdentity(c) ? 'identity-card' : ''} ${red(c) ? 'red' : ''} ${selected.has(id(c)) ? 'selected' : ''}" data-card="${id(c)}" aria-label="${label(c)}" aria-pressed="${selected.has(id(c))}"><b>${rankLabel(c.rank)}</b><span>${suits[c.suit]}</span></button>`).join('');
  document.querySelectorAll<HTMLButtonElement>('[data-card]').forEach(b => b.onclick = () => toggleCard(b.dataset.card!));
  $('#trick').innerHTML = s.last ? `<small>${escape(playerName(s.last.seat))} · ${classify(s.last.cards)!.kind}</small><div>${s.last.cards.map(c => `<span class="mini-card ${red(c) ? 'red' : ''}">${rankLabel(c.rank)}<i>${suits[c.suit]}</i></span>`).join('')}</div>` : '';
  const waiting = remote?.roomStatus === 'waiting', myTurn = s.turn === s.seat && s.status === 'playing' && !waiting;
  const banner = $('#turn-banner');
  const waitingFor = s.tribute?.transfers.filter(t => !t.returned).map(t => playerName(t.to)).filter((v, i, a) => a.indexOf(v) === i).join('、');
  banner.innerHTML = waiting ? `等待牌友入座 · ${remote!.members.length}/4 · 房号 <b class="room-code">${remote!.room}</b>`
    : tributing ? (owe ? `还贡：还给 ${escape(playerName(pendingT!.from))} · 待还 ${s.pendingReturns} 张` : `进贡环节 · 等待 ${escape(waitingFor || '')} 还贡`)
    : s.status === 'finished' ? '本局结束，山水有相逢' : myTurn ? (s.first ? '轮到你，首手须含 ♦4' : s.last ? '轮到你，压过上家或过牌' : '轮到你，自由领出') : `${escape(playerName(s.turn))} 正在思考…`;
  banner.classList.toggle('mine', myTurn || owe); banner.classList.add('show');
  renderTributeChoice(s);
  const canAct = (myTurn || owe) && !busy;
  $('#play-label').textContent = tributing ? '确认还贡' : '出牌';
  $<HTMLButtonElement>('#play').disabled = !canAct; $<HTMLButtonElement>('#pass').disabled = !myTurn || !s.last || busy; $<HTMLButtonElement>('#hint').disabled = !canAct;
  const chosen = s.hand.filter(c => selected.has(id(c)));
  const info = $('#selection-info');
  if (tributing) {
    const ok = owe && chosen.length === 1 && canReturnTribute(chosen[0]);
    info.textContent = !owe ? '等待其他玩家确认还贡…' : chosen.some(isIdentity) ? '不能返还身份牌 ♠A、♠3，请选其他牌' : chosen.some(isOpeningCard) ? '不能返还 ♦4，请选其他牌' : chosen.length === 1 ? `还给 ${playerName(pendingT!.from)}：${label(chosen[0])} · 待确认` : `选 1 张牌返还（♠A、♠3、♦4 除外）· 待还 ${s.pendingReturns} 张`;
    $<HTMLButtonElement>('#play').disabled = !ok || busy;
    info.classList.toggle('ok', ok); info.classList.toggle('bad', owe && chosen.length > 0 && !ok);
    $('#play').classList.toggle('ready', ok);
  } else {
    const combo = chosen.length ? classify(chosen) : null;
    info.textContent = chosen.length ? `已选 ${chosen.length} 张 · ${combo?.kind || '未组成合法牌型'}` : myTurn ? '点选手牌，再点出牌' : '可先挑好下一手';
    info.classList.toggle('ok', !!combo); info.classList.toggle('bad', chosen.length > 0 && !combo);
    $('#play').classList.toggle('ready', myTurn && !!combo);
  }
  $('#footer-state').textContent = remote ? '房间已保存 · 任意设备登录同一账号可接着打' : '本地练习 · 纯娱乐积分';
  syncAvatars();
  syncStage(s);
  stage?.setSelected(selected);
  if (s.status === 'finished' && prev?.status !== 'finished') setTimeout(showResult, 1500);
  if (s.status !== 'finished' && $('#dialog').classList.contains('result') && $<HTMLDialogElement>('#dialog').open) $<HTMLDialogElement>('#dialog').close();
  prev = s;
}

// ---------- serial animation queue (deal → tribute → returns) ----------
let gen = 0, qBusy = 0, q: Promise<void> = Promise.resolve();
function later(fn: () => void, ms: number) {
  const g = gen; qBusy++;
  q = q.then(() => new Promise<void>(res => setTimeout(() => { if (g === gen) { qBusy--; try { fn(); } catch (e) { console.warn(e); } } res(); }, ms)));
}
function reconcileLatest() { const v = state(); if (v) stage?.reconcile(v.hand, countsOf(v)); }
/** Hands as they were before any tribute moved, so the deal can be animated honestly. */
function preTribute(s: GameView) {
  const me = s.seat; let hand = [...s.hand]; const counts = countsOf(s);
  const rm = (c: Card | null) => { if (c) hand = hand.filter(h => id(h) !== id(c)); }, add = (c: Card | null) => { if (c) hand.push(c); };
  for (const t of s.tribute?.transfers ?? []) {
    if (t.returned) { if (t.from === me) rm(t.back); if (t.to === me) add(t.back); counts[rel(t.from, me)]--; counts[rel(t.to, me)]++; }
    if (t.to === me) rm(t.card); if (t.from === me) add(t.card); if(t.to>=0)counts[rel(t.to, me)]--; counts[rel(t.from, me)]++;
  }
  hand.sort((a, b) => power(a) - power(b)); return { hand, counts };
}
function animateTransfer(from: number, to: number, card: Card | null, what: '进贡' | '还贡') {
  const s = state(); if (!s) return; const me = s.seat;
  const at = stage?.transfer(rel(from, me), rel(to, me), card);
  sound.tribute(pans[rel(from, me)]);
  bubble(rel(from, me), what, false, 'gold');
  if (from === me || to === me) toast(`${from === me ? '你' : playerName(from)}${what}${card ? ` ${label(card)} ` : ''}→ ${to === me ? '你' : playerName(to)}`);
  if (at && stage) { const p = stage.project(at); caption(what, p.x, p.y, 1, 1); }
  if (what === '进贡' && from !== me) maybe(.35, () => botSay(from, banter.pick(banter.tribute)), 300);
}

// Translate state changes into 3D motion, sound and floating captions.
function syncStage(s: GameView, restore = false) {
  const counts = countsOf(s);
  const lastKey = (v: GameView | null) => v?.last ? `${v.last.seat}:${v.last.cards.map(id).join(',')}` : '';
  stage?.setTurn(s.status === 'playing' && !(remote?.roomStatus === 'waiting') ? rel(s.turn, s.seat) : -1);
  if (freshDeal || (prev && s.round !== prev.round)) {
    freshDeal = false; gen++; qBusy = 0; q = Promise.resolve();
    const pre = preTribute(s);
    const ms = stage?.deal(pre.hand, pre.counts) ?? 0;
    sound.shuffle(); setTimeout(() => sound.deal(52, 34), 300);
    let total = ms + 200;
    later(() => {}, ms + 200);
    if (s.tribute?.exempt) later(() => { toast(s.tribute!.exempt!); sound.reveal(); }, 0);
    const ts = s.tribute?.transfers ?? [];
    for (const t of ts.filter(t=>t.to>=0)) { later(() => animateTransfer(t.from, t.to, t.card, '进贡'), 150); later(() => {}, 750); total += 900; }
    for (const t of ts.filter(t => t.returned)) { later(() => animateTransfer(t.to, t.from, t.back, '还贡'), 150); later(() => {}, 750); total += 900; }
    later(reconcileLatest, 100);
    later(() => { const v = state(); if (!v) return; if (v.status === 'tribute' && owesReturn(v, v.seat)) { sound.bell(); toast('请选一张牌还贡'); } else if (v.status === 'playing' && v.turn === v.seat) sound.bell(); }, 0);
    animUntil = performance.now() + total + 300;
    if (!remote && s.round === 1) maybe(.8, () => botSay(1 + Math.floor(Math.random() * 3), banter.pick(banter.greet)), ms);
    return;
  }
  if (restore || !prev) { stage?.reconcile(s.hand, counts); stage?.showTrick(s.last ? { rel: rel(s.last.seat, s.seat), cards: s.last.cards } : null); return; }
  if (s.version === prev.version) return;
  const steps = s.version - prev.version;
  // tribute returns arriving after the deal
  if (s.tribute && prev.tribute) s.tribute.transfers.forEach((t, i) => {
    if(t.to>=0&&prev!.tribute!.transfers[i]?.to===-1)animateTransfer(t.from,t.to,t.card,'进贡');
    if (t.returned && !prev!.tribute!.transfers[i]?.returned) { const run = () => animateTransfer(t.to, t.from, t.back, '还贡'); if (qBusy) { later(run, 100); later(() => {}, 750); } else run(); }
  });
  if (prev.status === 'tribute' && s.status === 'playing') { const done = () => { toast('进贡完成 · ♦4 先出'); }; qBusy ? later(done, 0) : setTimeout(done, 900); animUntil = Math.max(animUntil, performance.now() + 1100); }
  const changed = lastKey(s) !== lastKey(prev);
  if (changed && s.last) {
    if (steps > 1 || !prev.last) stage?.clearTrick();
    const r = rel(s.last.seat, s.seat), combo = classify(s.last.cards)!;
    const big = combo.level >= 3;
    const at = stage?.play(r, s.last.cards, big);
    s.last.cards.forEach((_, i) => sound.flick(pans[r], i * .045));
    sound.place(pans[r], big ? .62 : .5, big);
    const identityCards = s.last.cards.filter(isIdentity);
    if (identityCards.length) { toast(`${playerName(s.last.seat)} 打出 ${identityCards.map(label).join('、')}`); sound.reveal(); }
    if (combo.level >= 4) setTimeout(() => sound.gong(), 600); else if (combo.level >= 1) setTimeout(() => sound.bell(660, .07), 520);
    if (at && stage) { const p = stage.project(at); caption(combo.kind, p.x, p.y, combo.level, s.last.cards.length); }
    if (r) stage?.react(r);
    if (big) { if (s.last.seat === s.seat) maybe(.45, () => botSay(1 + Math.floor(Math.random() * 3), banter.pick(banter.praise))); else maybe(.45, () => botSay(s.last!.seat, banter.pick(banter.bigPlay)), 300); }
    animUntil = performance.now() + (big ? 900 : 650);
  } else if (!s.last && prev.last) {
    if (steps === 1) bubble(rel(prev.turn, s.seat), '过', true);
    setTimeout(() => { stage?.clearTrick(); sound.flick(0); sound.flick(0, .05); }, 350);
    setTimeout(() => toastLead(s), 500);
  } else if (!changed && steps === 1 && prev.status === 'playing') bubble(rel(prev.turn, s.seat), '过', true);
  s.players.forEach((p, i) => {
    const qq = prev!.players[i], r = rel(i, s.seat);
    if (qq.identity === '身份未明' && p.identity !== '身份未明' && s.status === 'playing') setTimeout(() => { bubble(r, p.identity, false, 'seal'); sound.reveal(); }, 600);
    if (p.count === 1 && qq.count > 1 && !p.rank && s.status === 'playing') setTimeout(() => { bubble(r, '报单', false, 'warn'); sound.alarm(); }, 700);
    if (p.rank && !qq.rank && !p.supplemented) {
      setTimeout(() => { bubble(r, `第${cn[p.rank! - 1]}名`, false, 'gold'); sound.finish(); stage?.react(r); }, 800);
      if (p.rank === 1 && i !== s.seat) maybe(.6, () => botSay(i, banter.pick(banter.first)), 1200);
    }
  });
  if (qBusy) later(reconcileLatest, 0); else stage?.reconcile(s.hand, counts);
  if (s.turn === s.seat && (prev.turn !== s.seat || prev.status !== 'playing') && s.status === 'playing') setTimeout(() => sound.bell(), 450);
  if (s.status === 'finished' && prev.status !== 'finished') {
    const score = s.scores[s.seat];
    setTimeout(() => { if (score > 0) { sound.win(); stage?.fireworks(8); for (let i = 0; i < 4; i++) sound.firework(i * .45); } else if (score < 0) sound.lose(); else sound.finish(); }, 900);
    if (!remote) { const seat = 1 + Math.floor(Math.random() * 3); maybe(.8, () => botSay(seat, banter.pick(s.scores[seat] > 0 ? banter.win : banter.lose)), 1600); }
  }
}
function toastLead(s: GameView) { if (s.status === 'playing') { bubble(rel(s.turn, s.seat), '领出', false, 'gold'); if (s.turn === s.seat) toast('一轮结束 · 你重新领出'); } }

function caption(kind: string, x: number, y: number, level: number, n: number) {
  const el = document.createElement('div'); el.className = `caption lv${level} n${n}`; el.textContent = kind;
  el.style.left = `${x}px`; el.style.top = `${y}px`; $('#fx').append(el); setTimeout(() => el.remove(), 1800);
}
function bubble(r: number, text: string, pass = false, kind = '') {
  const ms = kind === 'talk' ? 3200 : 1500;
  if (r === 0) { const el = document.createElement('div'); el.className = `me-bubble ${kind} ${pass ? 'pass' : ''}`; el.textContent = text; $('#fx').append(el); setTimeout(() => el.remove(), ms + 100); if (pass) sound.pass(0); return; }
  const plate = document.querySelector(`.plate[data-rel="${r}"] [data-bubble]`) as HTMLElement | null;
  if (plate) { plate.textContent = text; plate.className = `bubble show ${kind} ${pass ? 'pass' : ''}`; clearTimeout(Number(plate.dataset.timer)); plate.dataset.timer = String(setTimeout(() => plate.classList.remove('show'), ms)); }
  if (pass) sound.pass(pans[r]);
}
function placePlates() {
  if (!stage) return;
  // 名牌避让顶栏和挖孔屏安全区；回合提示位于牌桌中部。
  const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
  const minY = 64 + safeTop;
  document.querySelectorAll<HTMLElement>('.plate').forEach(el => {
    const r = Number(el.dataset.rel), a = stage!.anchor(r);
    const w = el.offsetWidth, h = el.offsetHeight, m = 10;
    const x = Math.min(innerWidth - w - m, Math.max(m, a.x - w / 2)), y = Math.min(innerHeight - h - 160, Math.max(minY, a.y - h));
    el.style.transform = `translate(${x}px,${y}px)`;
  });
}

function showResult() {
  const s = state(); if (!s || s.status !== 'finished') return;
  const score = s.scores[s.seat];
  modal(`<div class="seal big">${score > 0 ? '胜' : score < 0 ? '负' : '和'}</div><div class="eyebrow">第 ${s.round} 局结算 · ${s.ownIdentity}</div><h2>${score > 0 ? '好牌，赢得漂亮。' : score < 0 ? '再来一局，有来有回。' : '平分秋色。'}</h2>
  <div class="score-big ${score > 0 ? 'up' : score < 0 ? 'down' : ''}">${signed(score)}<small>分</small><span class="score-total">累计 ${signed(s.totals[s.seat])}</span></div>
  <div class="results"><div class="head"><span></span><span>牌友</span><span class="tag">身份</span><span>本局</span><span>累计</span></div>${[...s.players].sort((a, b) => a.rank! - b.rank!).map(p => `<div class="${p.seat === s.seat ? 'self' : ''}"><span class="place">${cn[p.rank! - 1]}</span><b>${escape(playerName(p.seat))}</b><span class="tag">${p.identity}</span><strong class="${s.scores[p.seat] > 0 ? 'up' : s.scores[p.seat] < 0 ? 'down' : ''}">${signed(s.scores[p.seat])}</strong><em class="${s.totals[p.seat] > 0 ? 'up' : s.totals[p.seat] < 0 ? 'down' : ''}">${signed(s.totals[p.seat])}</em></div>`).join('')}</div>
  <p class="muted">${remote ? '结算已保存到房间数据库。' : '练习积分，仅供娱乐。'}下一局输方向赢方进贡（除 ♠A、♠3 外最大的牌），全胜／全败为大贡、每家 2 张，半胜／半败为小贡、每家 1 张；平局不贡。赢方等量还贡，不能返还 ♠A、♠3、♦4。</p>
  <div class="row"><button class="btn lacquer" id="again">下一局 · 进贡</button>${remote ? '' : '<button class="btn ghost" id="fresh">重新开始</button>'}</div>`, 'paper result');
  $('#again').onclick = () => void nextRound();
  if (!remote) $('#fresh').onclick = () => { $<HTMLDialogElement>('#dialog').close(); startPractice(); };
}

function toggleCard(k: string) {
  const s = state(); if (!s || !s.hand.some(c => id(c) === k)) return;
  const on = !selected.has(k);
  if (s.status === 'tribute' && on) selected.clear(); // returning tribute: exactly one card
  on ? selected.add(k) : selected.delete(k); sound.select(on); render();
}

// ---------- local practice ----------
function saveLocal() { if (local) sessionStorage.setItem('a3-practice', JSON.stringify(local)); }
function scheduleBot() {
  clearTimeout(botTimer); if (!local || remote) return;
  const g = local;
  const tributeSeat = g.status === 'tribute' ? [1, 2, 3].find(i => botTributeAction(g,i)) : undefined;
  if (g.status === 'tribute' ? tributeSeat === undefined : g.status !== 'playing' || g.turn === 0) return;
  const delay = Math.max(950, animUntil - performance.now() + 450) + Math.random() * 350;
  botTimer = setTimeout(() => {
    if (!local || remote) return;
    const r = tributeSeat !== undefined ? tributeAction(local, tributeSeat, botTributeAction(local,tributeSeat)!) : act(local, local.turn, legalMoves(local, local.turn)[0] || []);
    if (r.ok) { local = r.state; saveLocal(); render(); scheduleBot(); }
  }, delay);
}
function enterTable() { stage?.setMode('table'); }
function startPractice() {
  closeWardrobe(false); clearInterval(poll); roomId = null; remote = null; localStorage.removeItem('a3-room');
  local = createGame(); selected.clear(); saveLocal(); freshDeal = true; prev = null; chat.clear(); enterTable(); render(); scheduleBot();
}
async function nextRound() {
  $<HTMLDialogElement>('#dialog').close(); selected.clear();
  if (remote && roomId) { try { remote = await api(`/rooms/${roomId}/next`, {}); render(); } catch (e) { toast(e instanceof Error ? e.message : '开局失败'); } return; }
  if (local) { local = createNextGame(local); saveLocal(); render(); scheduleBot(); }
}
$('#practice').onclick = startPractice;
$('#restart').onclick = () => {
  modal(remote ? '<div class="eyebrow">好友桌</div><h2>离开这一桌？</h2><p>牌局开始后座位会为你保留：回到大厅或换一台设备登录，都可以点「回到牌桌」接着打。</p><div class="row"><button class="btn lacquer" id="to-lobby">回到大厅</button><button class="btn ghost" id="confirm-new">改打机器人练习</button></div>'
    : '<div class="eyebrow">新开一局</div><h2>重新洗牌？</h2><p>开启新的机器人练习（积分清零）？</p><div class="row"><button class="btn lacquer" id="confirm-new">开始新练习</button><button class="btn ghost" id="to-lobby">回到大厅</button></div>', 'paper');
  $('#confirm-new').onclick = () => { $<HTMLDialogElement>('#dialog').close(); startPractice(); };
  $('#to-lobby').onclick = async () => {
    // 还没开局就离席：把座位让出来；已开局则只是暂时离开
    if (remote && roomId && remote.roomStatus === 'waiting') await request(`/rooms/${roomId}/leave`, {}).catch(() => {});
    sessionStorage.removeItem('a3-practice'); localStorage.removeItem('a3-room'); location.href = '/';
  };
};

// ---------- online rooms ----------
const api = <T = Remote>(path: string, body?: unknown) => request<T>(path, body);
async function pullMessages() {
  if (!roomId) return;
  const { messages } = await api<{ messages: ChatMsg[] }>(`/rooms/${roomId}/messages?after=${lastMsgId}`);
  for (const m of messages) { lastMsgId = Math.max(lastMsgId, m.id); onMessage(m); }
}
function watchRoom() {
  clearInterval(poll);
  void pullMessages().catch(() => {});
  let polling = false;   // 网络慢时上一轮还没回来就不再叠加请求
  poll = setInterval(async () => {
    if (!roomId || busy || polling) return;
    polling = true;
    try {
      const next = await api(`/rooms/${roomId}`);
      if (!remote || next.version !== remote.version || next.members.length !== remote.members.length) {
        if (remote && next.members.length > remote.members.length) { sound.bell(990, .06); chat.add({ id: -next.members.length, seat: -1, name: '', text: `${next.members.at(-1)!.name} 入座了` }, false, true); }
        remote = next; selected.clear(); render();
      }
      await pullMessages();
    } catch { $('#footer-state').textContent = '连接中断 · 正在重试'; }
    finally { polling = false; }
  }, 1500);
}
function enterRoom(r: Remote) {
  closeWardrobe(false);
  roomId = r.room; localStorage.setItem('a3-room', r.room); sessionStorage.removeItem('a3-practice');
  clearTimeout(botTimer); local = null; remote = r; selected.clear(); prev = null; freshDeal = true; lastMsgId = 0; chat.clear();
  chat.add({ id: -100, seat: -1, name: '', text: `已进入房间 ${r.room}` }, false, true);
  if ($<HTMLDialogElement>('#dialog').open) $<HTMLDialogElement>('#dialog').close();
  enterTable(); render(); watchRoom();
}
function openOnline() {
  const u = session.user; if (!u) return account.openLogin(openOnline);
  modal(`<div class="seal">邀</div><div class="eyebrow">邀请好友 · 四人同桌</div><h2>茶亭已备，等你入座。</h2>
  <div class="profile-head">${faceImg(u.avatar, 'big')}<div><b>${escape(u.name)}</b><p class="muted">以此账号入座 · 形象与积分随账号走</p></div></div>
  <button class="btn lacquer wide" id="create-room">创建好友房</button>
  <div class="divider"><span>已有房号</span></div>
  <label class="field">房间号<input id="room-code" maxlength="10" placeholder="输入好友分享的 10 位房号" autocapitalize="characters"></label>
  <button class="btn ghost wide" id="join-room">加入房间</button>
  <p class="muted">四人到齐自动开局；房内可聊天，多局累计并进贡。手机、电脑、小程序登录同一账号即可互通。</p><p id="room-error" role="alert"></p>`, 'paper');
  const connect = async (join: boolean) => {
    const code = $<HTMLInputElement>('#room-code').value.trim().toUpperCase();
    try {
      if (join && !/^[A-F0-9]{10}$/.test(code)) throw Error('请输入 10 位房号');
      enterRoom(await api(join ? `/rooms/${code}/join` : '/rooms', {}));
    } catch (e) { const el = document.querySelector('#room-error'); if (el) el.textContent = e instanceof Error ? e.message : '连接失败'; sound.error(); }
  };
  $('#create-room').onclick = () => void connect(false); $('#join-room').onclick = () => void connect(true);
}
$('#online').onclick = openOnline;

// ---------- account ----------
const account = createAccount({ modal, close: () => $<HTMLDialogElement>('#dialog').close(), toast, error: () => sound.error(), openWardrobe: () => openWardrobe(), canDress: () => !state() });
function renderAccount(u: User | null) {
  $('#account').innerHTML = u ? `${faceImg(u.avatar)}<span>${escape(u.name)}</span>` : `${icon.user}<span>登录</span>`;
  if (!u) $('#resume').hidden = true;
  syncAvatars(); if (state()) render();
}
$('#account').onclick = () => { sound.button(); void account.openProfile(); };
session.onChange(u => { renderAccount(u); if (u) void checkActiveRoom(); else if (remote) { clearInterval(poll); localStorage.removeItem('a3-room'); location.href = '/'; } });
/** 账号在别处有进行中的牌局：大厅给出「回到牌桌」。 */
async function checkActiveRoom() {
  if (!session.user) return;
  try {
    const me = await api<{ user: User; activeRoom: { id: string; status: string } | null }>('/me');
    if (JSON.stringify(me.user) !== JSON.stringify(session.user)) session.setUser(me.user);
    const show = !!me.activeRoom && !remote;
    $('#resume').hidden = !show;
    if (show) { $('#resume-room').textContent = `房号 ${me.activeRoom!.id} · ${me.activeRoom!.status === 'waiting' ? '等待入座' : '牌局进行中'}`; $('#resume').onclick = async () => { try { enterRoom(await api(`/rooms/${me.activeRoom!.id}/join`, {})); } catch (e) { toast(e instanceof Error ? e.message : '无法回到牌桌'); } }; }
  } catch { /* 离线时大厅照常可用 */ }
}

// ---------- wardrobe（换装）----------
function openWardrobe() {
  if (state()) return toast('牌局进行中，回到大厅后再换装');
  draft = { ...myAvatar() };
  const panel = $('#wardrobe');
  const paint = () => {
    panel.innerHTML = `<header><div><b>我的形象</b><small>拖动人物可旋转 · ${session.user ? '保存到账号，多端同步' : '游客形象存在本机，注册时带上'}</small></div>${faceImg(draft!, 'big')}</header>
    <div class="wd-rows">${AVATAR_KEYS.map(k => `<div class="wd-row"><span>${AVATAR_LABELS[k]}</span><div class="wd-opts">${AVATAR_OPTIONS[k].map((o, i) => o.startsWith('#')
      ? `<button class="swatch ${draft![k] === i ? 'on' : ''}" data-k="${k}" data-i="${i}" style="background:${o}" aria-label="${AVATAR_LABELS[k]} ${i + 1}" aria-pressed="${draft![k] === i}"></button>`
      : `<button class="chip ${draft![k] === i ? 'on' : ''}" data-k="${k}" data-i="${i}" aria-pressed="${draft![k] === i}">${o}</button>`).join('')}</div></div>`).join('')}</div>
    <div class="row"><button class="btn ghost" id="wd-random">随机</button><button class="btn ghost" id="wd-cancel">取消</button><button class="btn lacquer" id="wd-save">保存形象</button></div>`;
    panel.querySelectorAll<HTMLButtonElement>('[data-k]').forEach(b => b.onclick = () => { draft![b.dataset.k as keyof Avatar] = Number(b.dataset.i); sound.select(true); paint(); });
    $('#wd-random').onclick = () => { draft = randomAvatar(); sound.shuffle(); paint(); };
    $('#wd-cancel').onclick = () => closeWardrobe(true);
    $('#wd-save').onclick = async () => {
      const a = draft!;
      try {
        if (session.user) session.setUser((await api<{ user: User }>('/me', { avatar: a })).user); else saveGuestAvatar(a);
        toast('形象已保存'); sound.finish(); closeWardrobe(true);
      } catch (e) { toast(e instanceof Error ? e.message : '保存失败'); sound.error(); }
    };
    syncAvatars();
  };
  panel.hidden = false; document.body.classList.add('dressing'); $('#intro').hidden = true;
  stage?.setMode('wardrobe'); paint();
}
function closeWardrobe(toLobby: boolean) {
  if ($('#wardrobe').hidden) return;
  draft = null; $('#wardrobe').hidden = true; document.body.classList.remove('dressing');
  if (toLobby) { $('#intro').hidden = false; stage?.setMode('lobby'); }
  syncAvatars();
}
$('#dress').onclick = openWardrobe;

// ---------- actions ----------
async function submit(cards: Card[]) {
  if (busy) return; busy = true;
  try {
    const s = state()!;
    if (s.status === 'tribute') {
      if (cards.length !== 1) throw Error('还贡请只选 1 张牌');
      if (remote && roomId) remote = await api(`/rooms/${roomId}/tribute`, { version: remote.version, card: cards[0] });
      else if (local) { const r = returnTribute(local, 0, cards[0]); if (!r.ok) throw Error(r.error); local = r.state; saveLocal(); }
    } else if (remote && roomId) remote = await api(`/rooms/${roomId}/actions`, { version: remote.version, cards });
    else if (local) { const r = act(local, 0, cards); if (!r.ok) throw Error(r.error); local = r.state; saveLocal(); }
    selected.clear();
  } catch (e) { toast(e instanceof Error ? e.message : '出牌失败'); sound.error(); shakeDock(); }
  finally { busy = false; render(); scheduleBot(); }
}
function shakeDock() { const d = $('.actions'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); }
function playSelected() { const s = state(); if (!s) return; const c = s.hand.filter(c => selected.has(id(c))); if (!c.length) { sound.error(); return toast(s.status === 'tribute' ? '先选一张要还的牌' : '先点选要出的手牌'); } void submit(c); }
$('#play').onclick = playSelected; $('#pass').onclick = () => void submit([]);
let hintIndex = 0;
$('#hint').onclick = () => {
  const s = state()!;
  if (s.status === 'tribute') {
    const t = s.tribute?.transfers.find(t => t.to === s.seat && !t.returned);
    const c = [...s.hand].sort((a, b) => power(a) - power(b)).find(c => canReturnTribute(c) && (!t?.card || id(c) !== id(t.card)));
    if (c) { selected = new Set([id(c)]); sound.select(true); render(); } return;
  }
  const moves = movesFor(s.hand, s.last?.cards || null, s.first);
  if (!moves.length) { sound.error(); return toast('没有能压过的牌，可以过牌'); }
  selected = new Set(moves[hintIndex++ % moves.length].map(id)); sound.select(true); render();
};
addEventListener('keydown', e => {
  if ((e.target as HTMLElement).closest('input,dialog[open]') || !state()) return;
  const btn = (s: string) => { const b = $<HTMLButtonElement>(s); if (!b.disabled) b.click(); };
  if (e.key === ' ' || e.key === 'Enter') { if ((e.target as HTMLElement).tagName === 'BUTTON' && e.key === 'Enter') return; e.preventDefault(); btn('#play'); }
  else if (e.key.toLowerCase() === 'p') btn('#pass');
  else if (e.key.toLowerCase() === 'h') btn('#hint');
  else if (e.key.toLowerCase() === 'c') { e.preventDefault(); chat.toggle(); }
  else if (e.key === 'Escape' && selected.size) { selected.clear(); sound.select(false); render(); }
});

async function restore() {
  try {
    const saved = localStorage.getItem('a3-room');
    if (saved && session.user && /^[A-F0-9]{10}$/.test(saved)) { roomId = saved; remote = await api(`/rooms/${roomId}`); sessionStorage.removeItem('a3-practice'); enterTable(); render(); watchRoom(); }
    else { const savedLocal = sessionStorage.getItem('a3-practice'); if (savedLocal) { local = JSON.parse(savedLocal); enterTable(); render(); scheduleBot(); } }
  } catch { roomId = null; remote = null; localStorage.removeItem('a3-room'); toast('未能恢复上局，可以重新开桌'); }
}
renderAccount(session.user);
void account.handleScan();
void restore().then(() => void checkActiveRoom());
