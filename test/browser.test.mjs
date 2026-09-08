import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';import {GameRuntime} from '@manaty/retro-museum-sdk/runtime';
test('responsive packaged view, motion preference and stable rendering',{timeout:90000},async()=>{
 const pack=JSON.parse(await readFile(new URL('../dist/game.rmg.json',import.meta.url)));
 const id=pack.manifest.id;const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 try{for(const count of [...new Set([pack.manifest.players.min,pack.manifest.players.max])]){
  const players=Array.from({length:count},(_,i)=>({id:'p'+i,name:'Player '+i+' Long name',number:i+1,connected:true}));
  const runtime=new GameRuntime(pack,players);if(id==='sketch')runtime.action('p0','choose',0);
  try{for(const role of ['display','controller']){
   const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><iframe sandbox="allow-scripts" style="border:0;width:100vw;height:100vh"></iframe></body>'}));await page.goto('https://test.invalid/');
   await page.evaluate(html=>new Promise(resolve=>{const frame=document.querySelector('iframe');frame.onload=()=>resolve();frame.srcdoc=html;}),pack.view);
   await page.waitForTimeout(100);const frame=page.frames().find(f=>f.parentFrame());
   const send=async(phase='playing')=>page.evaluate(m=>document.querySelector('iframe').contentWindow.postMessage(m,'*'),{retroMuseum:1,type:'state',role,online:true,state:{language:'en',phase,remainingMs:90000,party:{id:'test',players,you:role==='controller'?'p0':null,community:{...runtime.snapshot(role==='controller'?'p0':null),...(phase==='solved'?{winner:'p0',...(id==='chess'?{reason:'checkmate'}:{phase:'ended'})}:{})}}}});
   await send();await frame.locator('canvas').waitFor();
   for(const [width,height]of role==='display'?[[1280,720],[1920,1080],[960,540]]:[[390,844],[320,568],[844,390]]){
    await page.setViewportSize({width,height});await send();await page.waitForTimeout(100);
    const geometry=await frame.locator('canvas').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,body:document.body.scrollWidth,view:innerWidth};});
    assert.ok(geometry.body<=width+1,JSON.stringify({id,role,count,width,height,geometry}));
    assert.ok(geometry.y>=0&&geometry.y+geometry.height<=height+1,JSON.stringify({id,role,count,width,height,geometry}));
    const border=await frame.locator('canvas').evaluate(e=>parseFloat(getComputedStyle(e).borderLeftWidth)*2);
    assert.ok(Math.abs((geometry.width-border)/(geometry.height-border)-(id==='chess'?1:1.5))<.04,'canvas must preserve its aspect ratio: '+JSON.stringify({id,role,width,height,geometry}));
   }
   await page.emulateMedia({reducedMotion:'reduce'});await send('solved');await page.waitForTimeout(100);
   const animations=await frame.locator('body').evaluate(()=>[...document.querySelectorAll('.victory-mark,.celebration i')].map(e=>getComputedStyle(e).animationName));assert.equal(animations.length,21);assert.ok(animations.every(a=>a==='none'));
   await page.emulateMedia({reducedMotion:'no-preference'});await send();await page.waitForTimeout(350);
   await frame.evaluate(()=>{window.paints=0;const orig=CanvasRenderingContext2D.prototype.fillRect;CanvasRenderingContext2D.prototype.fillRect=function(...a){window.paints++;return orig.apply(this,a);};});
   for(let n=0;n<12;n++)await send();await page.waitForTimeout(100);assert.equal(await frame.evaluate(()=>window.paints),0,'unchanged state must not repaint the board');
   assert.deepEqual(errors,[]);await page.close();
  }}finally{runtime.dispose();}
 }}finally{await browser.close();}
});
