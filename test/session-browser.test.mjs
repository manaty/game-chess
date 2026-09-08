import test from 'node:test';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {createGameHost,loadGame} from '@manaty/retro-museum-sdk/host';
test('two real browser players initialise Elo, auto-start, cancel/confirm resignation and replay with persistent ratings',{timeout:60000},async()=>{
 const definition=await loadGame(new URL('../dist/game.rmg.json',import.meta.url));
 const host=await createGameHost({definitions:[definition]});await new Promise(r=>host.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+host.server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});const errors=[];
 try{
  const room=await(await fetch(base+'/api/rooms',{method:'POST',body:JSON.stringify({game:'chess'})})).json();
  const display=await browser.newPage({viewport:{width:1280,height:800}});await display.goto(base+'/r/'+room.id+'#'+room.hostToken);
  await display.locator('[data-auto-start]').waitFor();assert.equal(await display.locator('[data-auto-start]').isChecked(),true);
  const configured=display.waitForResponse(r=>r.url().endsWith('/control')&&r.status()===200);await display.locator('[data-option="minutes"]').selectOption('3');await configured;
  const pages=[];
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/j/'+room.id);await page.locator('#elo-form').waitFor();assert.equal(await page.locator('[name=elo]').inputValue(),'700');
   if(i===1)assert.equal(host.rooms.get(room.id).party.phase,'ready','the unsubmitted rating form does not fill a seat');
   if(i===0)await page.locator('[name=elo]').fill('900');await page.locator('#elo-form button').click();
  }
  const party=host.rooms.get(room.id).party;const first=pages[0].frameLocator('.stage iframe'),second=pages[1].frameLocator('.stage iframe');
  await first.locator('[data-resign]').waitFor();assert.equal(party.phase,'playing');assert.equal(party.options.minutes,3);
  await first.locator('[data-resign]').click();await first.locator('[data-cancel-resign]').click();assert.equal(party.phase,'playing');
  await first.locator('[data-resign]').click();await first.locator('[data-confirm-resign]').click();
  await second.locator('.rating-result').first().waitFor();assert.equal(party.phase,'solved');assert.equal(party.engine.metadata.ratings.length,2);
  const rating=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('museum-chess-rating-v1')).elo);
  assert.equal(await rating(pages[0]),876);assert.equal(await rating(pages[1]),724);
  await pages[0].reload();await pages[0].frameLocator('.stage iframe').locator('.rating-result').first().waitFor();assert.equal(await pages[0].locator('#elo-form').count(),0);assert.equal(await rating(pages[0]),876);
  await pages[1].frameLocator('.stage iframe').locator('[data-action=playAgain]').click();await pages[0].frameLocator('.stage iframe').locator('[data-resign]').waitFor();
  assert.deepEqual(party.engine.snapshot().players.map(p=>p.elo),[876,724]);assert.equal(await rating(pages[1]),724);assert.deepEqual(errors,[]);
 }finally{await browser.close();await host.close();}
});
