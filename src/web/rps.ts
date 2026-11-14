import {rpsLabel,type GameView,type RpsMove,type TributeAction} from '../core/game';
import {handSvg} from '../visual/pixel-art';

const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function createRpsPanel(root:HTMLElement,deps:{name:(seat:number)=>string;face:(seat:number)=>string;send:(action:TributeAction)=>void;busy:()=>boolean}){
  let draft:RpsMove|null=null,draftKey='',acknowledged='',current:GameView|null=null;
  function render(s:GameView){
    current=s;const duel=s.tribute?.selection?.duel,last=s.tribute?.contests.at(-1);
    const resultKey=last?`${s.round}:${s.tribute!.contests.length}:${last.players.join('-')}`:'';
    const result=last?.winner!==null&&last?.players.includes(s.seat)&&resultKey!==acknowledged?last:null;
    root.hidden=!duel&&!result;if(root.hidden)return;
    const key=duel?`${s.round}:${duel.id}:${duel.round}`:'';
    if(key!==draftKey){draftKey=key;draft=null;}
    const players=result?.players||duel!.players,participant=players.includes(s.seat),submitted=!!duel?.submitted.includes(s.seat);
    const chosen=submitted?duel!.ownMove:draft,focus=root.contains(document.activeElement)?(document.activeElement as HTMLElement).id:'';
    root.innerHTML=`<div class="rps-window" role="dialog" aria-modal="true" aria-labelledby="rps-title">
      <header class="rps-heading"><div><small>TRIBUTE DUEL</small><h2 id="rps-title">石头 · 剪刀 · 布</h2></div><b>第 ${result?.round||duel!.round} 回合</b></header>
      <div class="rps-vs">${players.map((who,i)=>{
        const move=result?.moves[i]||(who===s.seat&&submitted?duel!.ownMove:null);
        return `<section class="rps-player">${deps.face(who)}<b>${escape(deps.name(who))}${who===s.seat&&deps.name(who)!=='你'?'（你）':''}</b><div class="rps-reveal">${handSvg(move||'hidden')}</div><span>${result?rpsLabel(result.moves[i]):who===s.seat?submitted?'已确认 '+rpsLabel(duel!.ownMove!):'等待你手动出拳':duel!.submitted.includes(who)?'已出拳 · 手势保密':'等待对方出拳'}</span></section>`;
      }).join('<strong class="rps-versus">VS</strong>')}</div>
      <p class="rps-instruction" role="status">${result?`${escape(deps.name(result.winner!))} 胜出，保留预选`:submitted?'已确认出拳，等待对方。':participant?'先选手势，再点击「确认出拳」。':'观战中，等待双方手动出拳。'}</p>
      ${!result&&participant?`<div class="rps-inventory">${(['rock','scissors','paper'] as const).map((move,i)=>`<button type="button" id="rps-choice-${move}" class="rps-slot ${chosen===move?'selected':''}" data-rps="${move}" aria-pressed="${chosen===move}" ${submitted||deps.busy()?'disabled':''}><span class="rps-hand">${handSvg(move)}</span><b>${rpsLabel(move)}</b><small>${i+1}</small></button>`).join('')}</div><button type="button" id="rps-confirm" class="rps-confirm" ${!chosen||submitted||deps.busy()?'disabled':''}>${submitted?'已出拳':chosen?'确认出拳 · '+rpsLabel(chosen):'请先选择手势'}</button>`:''}
      ${result?'<button type="button" id="rps-continue" class="rps-confirm">继续选牌／还贡</button>':''}
      ${!result&&last?.winner===null?`<p class="rps-tie">上一回合平手 · 请重新手动选择，不会自动出拳。</p>`:''}
      <footer>双方确认后才揭晓 · 没有默认手势 · 不自动代出</footer>
    </div>`;
    root.querySelectorAll<HTMLButtonElement>('[data-rps]').forEach(button=>button.onclick=()=>{if(submitted||deps.busy())return;draft=button.dataset.rps as RpsMove;render(current!);});
    const confirm=root.querySelector<HTMLButtonElement>('#rps-confirm');if(confirm)confirm.onclick=()=>{const active=current?.tribute?.selection?.duel;if(!active||!draft||deps.busy()||active.submitted.includes(current!.seat))return;deps.send({kind:'rps',move:draft,round:active.round,duelId:active.id});};
    const done=root.querySelector<HTMLButtonElement>('#rps-continue');if(done)done.onclick=()=>{acknowledged=resultKey;render(current!);};
    if(focus)root.querySelector<HTMLElement>('#'+focus)?.focus({preventScroll:true});
  }
  return {render,isOpen:()=>!root.hidden};
}
