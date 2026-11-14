/** Track the visible browser area, including mobile browser chrome and keyboards. */
export function watchViewport(changed:(size:{width:number;height:number;top:number;safeBottom:number;safeLeft:number;safeRight:number})=>void){
  const root=document.documentElement,probe=document.createElement('div');
  probe.setAttribute('aria-hidden','true');
  probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;padding:var(--safe-area-inset-top,env(safe-area-inset-top,0px)) var(--safe-area-inset-right,env(safe-area-inset-right,0px)) var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) var(--safe-area-inset-left,env(safe-area-inset-left,0px))';
  document.body.append(probe);
  let size={width:innerWidth,height:innerHeight,top:0,safeBottom:0,safeLeft:0,safeRight:0},frame=0;
  function set(name:string,value:number){const text=`${Math.round(value)}px`;if(root.style.getPropertyValue(name)!==text)root.style.setProperty(name,text);}
  function measure(){
    frame=0;const visual=window.visualViewport,unzoomed=!visual||Math.abs(visual.scale-1)<.01,insets=getComputedStyle(probe);
    const next={width:innerWidth,height:Math.round(unzoomed&&visual?Math.min(innerHeight,visual.height):innerHeight),top:Math.round(unzoomed&&visual?visual.offsetTop:0),safeBottom:parseFloat(insets.paddingBottom)||0,safeLeft:parseFloat(insets.paddingLeft)||0,safeRight:parseFloat(insets.paddingRight)||0};
    const resized=next.width!==size.width||next.height!==size.height||next.safeBottom!==size.safeBottom;
    set('--viewport-height',next.height);set('--viewport-top',next.top);set('--viewport-bottom',Math.max(0,innerHeight-next.height-next.top));
    set('--safe-top',parseFloat(insets.paddingTop)||0);set('--safe-right',next.safeRight);set('--safe-bottom',next.safeBottom);set('--safe-left',next.safeLeft);
    size=next;changed(size);
    const active=document.activeElement;
    if(resized&&active instanceof HTMLInputElement&&active.closest('dialog[open],#chat'))requestAnimationFrame(()=>active.scrollIntoView({block:'nearest',inline:'nearest'}));
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);new ResizeObserver(schedule).observe(probe,{box:'border-box'});
  measure();return {get size(){return size;}};
}
