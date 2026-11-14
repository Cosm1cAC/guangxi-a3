import {test,expect,type Page,type Browser} from '@playwright/test';
import {createGame,createNextGame,view,canReturnTribute,type Game} from '../../src/core/game';
import {DEFAULT_AVATAR} from '../../src/core/avatar';

const sizes=[{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:568,height:320},{width:667,height:375},{width:844,height:390},{width:896,height:414}];
const user={id:1,username:'layout',name:'很长的手机牌友昵称',email:'layout@example.com',avatar:DEFAULT_AVATAR,games:0,wins:0,score:0};
async function setup(browser:Browser,game?:Game,webgl=false){
 const context=await browser.newContext({viewport:sizes[0],hasTouch:true,isMobile:true,deviceScaleFactor:1});
 let current=game;
 await context.addInitScript(({user,webgl,playing})=>{if(playing){localStorage.setItem('a3-session',JSON.stringify({token:'fixture',user}));localStorage.setItem('a3-room','1234567890');}if(!webgl){const original=HTMLCanvasElement.prototype.getContext;Object.defineProperty(HTMLCanvasElement.prototype,'getContext',{value:function(type:string,...args:unknown[]){return type.startsWith('webgl')?null:Reflect.apply(original,this,[type,...args]);}});}},{user,webgl,playing:!!game});
 await context.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;const data=path.endsWith('/me')?{user,activeRoom:null}:path.endsWith('/config')?{emailCode:false}:path.endsWith('/presence')?{online:4,capacity:20}:path.endsWith('/messages')?{messages:[]}:current?{...view(current,0),room:'1234567890',roomStatus:'playing',members:[{name:user.name,avatar:DEFAULT_AVATAR,bot:false},...[1,2,3].map(i=>({name:'很长的机器人昵称'+i,bot:true,avatar:DEFAULT_AVATAR}))]}:{};await route.fulfill({json:data});});
 const page=await context.newPage();return {context,page,setGame:(g:Game)=>{current=g;}};
}
const bounds=async(page:Page,selector:string)=>{const b=(await page.locator(selector).boundingBox())!;expect(b,selector).not.toBeNull();const size=page.viewportSize()!;expect(b.x,selector+' left').toBeGreaterThanOrEqual(-1);expect(b.y,selector+' top').toBeGreaterThanOrEqual(-1);expect(b.x+b.width,selector+' right').toBeLessThanOrEqual(size.width+1);expect(b.y+b.height,selector+' bottom').toBeLessThanOrEqual(size.height+1);return b;};
function overlap(a:{x:number;y:number;width:number;height:number},b:typeof a){return Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1;}
async function settle(page:Page){await page.waitForTimeout(120);}

test('手机大厅和登录：横竖屏完整显示，按钮不挤字，矮屏弹窗可滚动',async({browser})=>{
 const {page,context}=await setup(browser);await page.goto('/');await expect(page.locator('body')).toHaveClass(/flat/);
 for(const size of sizes){await page.setViewportSize(size);await settle(page);await bounds(page,'.intro-card');await bounds(page,'.hud-top nav');for(const button of ['#practice','#online','#dress'])await bounds(page,button);expect(await page.locator('.intro-actions .btn>span').evaluateAll(nodes=>nodes.every(el=>el.scrollWidth<=el.clientWidth+1))).toBe(true);await page.screenshot({path:`artifacts/mobile-fixed-lobby-${size.width}.png`});}
 await page.setViewportSize(sizes[0]);await page.locator('#account').click();await page.locator('#au-email').waitFor();await bounds(page,'dialog');await page.locator('#au-switch').click();await page.locator('#au-name').scrollIntoViewIfNeeded();await expect(page.locator('#au-name')).toBeInViewport();await bounds(page,'dialog');
 await page.locator('#dialog-body').evaluate(el=>{el.scrollTop=0;});await page.setViewportSize({width:390,height:320});await bounds(page,'dialog');await page.locator('#au-pass').fill('keyboard-password');await expect(page.locator('#au-pass')).toBeInViewport();await page.locator('#au-submit').scrollIntoViewIfNeeded();await expect(page.locator('#au-submit')).toBeInViewport();await context.close();
});

test('13／15／19 张手牌：长昵称不重叠，选牌不遮出牌按钮，横竖屏可切换',async({browser})=>{
 const g=createGame();g.first=false;g.turn=0;g.log.push('1号位 · 单张 ♠A');const {context,page,setGame}=await setup(browser,g);await page.goto('/');await page.locator('#hand .card').first().waitFor();
 for(const count of [13,15,19]){
   let current:Game;
   if(count===19)current=createNextGame({...g,status:'finished',teams:[1,0,0,0],order:[0,1,2,3],scores:[6,-2,-2,-2]});
   else{current=structuredClone(g);if(count===15)current.hands[0].push(...current.hands[1].splice(0,2));}
   current.log.push('1号位 · 单张 ♠A');setGame(current);await page.reload();await expect(page.locator('#hand .card')).toHaveCount(count);
   for(const size of sizes){await page.setViewportSize(size);await settle(page);const cards=await bounds(page,'#hand');const actions=await bounds(page,'.actions');expect(overlap(cards,actions),`cards/actions ${count} ${size.width}`).toBe(false);await bounds(page,'.hud-top nav');await bounds(page,'#me');const me=(await page.locator('#me').boundingBox())!,selection=(await page.locator('.selection').boundingBox())!;expect(overlap(me,selection),`me/selection ${count} ${size.width}`).toBe(false);
     const plates=await page.locator('.plate').all();const rects=[];for(const plate of plates){const b=(await plate.boundingBox())!;rects.push(b);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(size.width+1);}for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)expect(overlap(rects[i],rects[j]),`plates ${count} ${size.width}`).toBe(false);
     const banner=(await page.locator('#turn-banner').boundingBox())!;expect(overlap(banner,actions),`banner/actions ${count} ${size.width}`).toBe(false);expect(overlap(banner,me),`banner/me ${count} ${size.width}`).toBe(false);
     await page.screenshot({path:`artifacts/mobile-fixed-hand-${count}-${size.width}.png`});
   }
   await page.setViewportSize(sizes[0]);const selectable=current.hands[0].find(c=>count!==19||canReturnTribute(c))!;const card=page.locator(`[data-card="${selectable.rank}-${selectable.suit}"]`);await card.tap();await expect(card).toHaveAttribute('aria-pressed','true');const chosen=(await card.boundingBox())!,buttons=(await page.locator('.actions').boundingBox())!;expect(overlap(chosen,buttons)).toBe(false);
   if(count===19){await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-area-inset-top','24px');document.documentElement.style.setProperty('--safe-area-inset-bottom','24px');});await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--safe-bottom'))).toBe('24px');await settle(page);await bounds(page,'.actions');const notice=(await page.locator('#turn-banner').boundingBox())!,me=(await page.locator('#me').boundingBox())!;expect(overlap(notice,me)).toBe(false);await page.screenshot({path:'artifacts/mobile-fixed-19-safe-area.png'});}
 }
 await context.close();
});

test('手机 3D 手牌与底部安全区：旋转后仍能直接点选',async({browser})=>{
 const g=createGame();g.first=false;g.turn=0;const {context,page}=await setup(browser,g,true);await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.setProperty('--safe-area-inset-top','24px');document.documentElement.style.setProperty('--safe-area-inset-bottom','24px');}));await page.goto('/');await expect(page.locator('body')).toHaveClass(/webgl/);await page.waitForTimeout(2800);
 for(const size of [sizes[0],sizes[5]]){await page.setViewportSize(size);await settle(page);const actions=await bounds(page,'.actions');await bounds(page,'.hud-top nav');const banner=(await page.locator('#turn-banner').boundingBox())!;expect(overlap(actions,banner)).toBe(false);const points=await page.evaluate(()=>{const h=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hand-top'));return {h,w:innerWidth,height:innerHeight,safe:parseFloat(document.documentElement.style.getPropertyValue('--safe-bottom'))};});expect(points.safe).toBe(24);const before=await page.locator('#hand .card.selected').count();await page.touchscreen.tap(size.width/2,size.height-points.h+25);await expect.poll(()=>page.locator('#hand .card.selected').count()).not.toBe(before);await page.screenshot({path:`artifacts/mobile-fixed-3d-${size.width}.png`});}
 await context.close();
});

test('软键盘缩小可见区域时，弹窗跟随视口并保留输入内容',async({browser})=>{
 const {page,context}=await setup(browser);
 await page.addInitScript(()=>{const visible=new EventTarget();Object.assign(visible,{width:innerWidth,height:innerHeight,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:visible});(window as any).testViewport=visible;});
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('#account').click();await page.locator('#au-pass').fill('keep-this-password');
 await page.evaluate(()=>{const visible=(window as any).testViewport;Object.assign(visible,{height:300,offsetTop:80});visible.dispatchEvent(new Event('resize'));});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--viewport-height'))).toBe('300px');const box=(await page.locator('dialog').boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(80);expect(box.y+box.height).toBeLessThanOrEqual(380);await expect(page.locator('#au-pass')).toBeInViewport();
 await page.evaluate(()=>{const visible=(window as any).testViewport;Object.assign(visible,{height:844,offsetTop:0});visible.dispatchEvent(new Event('resize'));});await expect(page.locator('#au-pass')).toHaveValue('keep-this-password');await context.close();
});

test('六张贡牌和聊天面板在手机横竖屏内可操作',async({browser})=>{
 const previous={...createGame(),status:'finished' as const,teams:[0,0,0,1],order:[0,1,2,3],scores:[2,2,2,-6]};const g=createNextGame(previous);expect(g.tribute!.transfers).toHaveLength(6);
 const {page,context}=await setup(browser,g);await page.goto('/');await page.locator('#tribute-choice').waitFor();
 for(const size of [sizes[0],sizes[3],sizes[5]]){await page.setViewportSize(size);await settle(page);await bounds(page,'#tribute-choice');await expect(page.locator('#tribute-confirm')).toBeInViewport();await page.screenshot({path:`artifacts/mobile-fixed-tribute-${size.width}.png`});}
 await page.locator('[data-tribute-card="0"]').tap();await page.locator('[data-tribute-card="1"]').tap();await expect(page.locator('#tribute-confirm')).toBeEnabled();await page.locator('#chat-btn').click();await bounds(page,'#chat');await page.locator('#chat input').fill('手机聊天测试');await expect(page.locator('#chat input')).toBeInViewport();await context.close();
});
