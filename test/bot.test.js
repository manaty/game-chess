import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess,parseFen} from '../server/chess.js';
import {chooseChessAction} from '../server/bot.js';

test('each difficulty plays legal moves without mutating the position or acting for its opponent',()=>{
 for(const difficulty of ['easy','medium','hard']){
  const game=new Chess([{id:'human'},{id:'bot',bot:true}]);
  for(let i=0;i<35&&!game.reason;i++){
   const id=game.toMove.id,before=game.save(),legal=game.snapshot().legal;
   assert.equal(chooseChessAction(game,game.players.find(p=>p.id!==id).id,difficulty),null);
   const choice=chooseChessAction(game,id,difficulty);
   assert.deepEqual(game.save(),before);
   assert.ok(legal.includes(choice.value.from+choice.value.to+(choice.value.promotion||'')));
   game.action(id,choice.action,choice.value);
  }
 }
});
test('hard finds a forced mate and all levels handle promotion',()=>{
 const game=new Chess([{id:'a'},{id:'b'}]);
 Object.assign(game,parseFen('7k/8/5KQ1/8/8/8/8/8 w - - 0 1'));
 game.players=[{id:'a',color:'w'},{id:'b',color:'b',bot:true}];game.positions=[game.positionKey()];
 const choice=chooseChessAction(game,'a','hard',()=>0);game.action('a',choice.action,choice.value);
 assert.equal(game.reason,'checkmate');assert.equal(game.winner,'a');assert.deepEqual(game.ratings(),[]);
 for(const difficulty of ['easy','medium','hard']){
  const promotion=new Chess([{id:'a'},{id:'b'}]);Object.assign(promotion,parseFen('7k/P7/8/8/8/8/8/7K w - - 0 1'));
  promotion.players=[{id:'a',color:'w'},{id:'b',color:'b'}];
  const action=chooseChessAction(promotion,'a',difficulty,()=>0);
  assert.doesNotThrow(()=>promotion.action('a',action.action,action.value));
 }
});
