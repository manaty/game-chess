import test from 'node:test';import assert from 'node:assert/strict';import {Chess} from '../server/chess.js';
const players=[{id:'a',chessElo:700},{id:'b',chessElo:700}];
test('either player can resign, even off turn; only opponents win and finished games reject actions',()=>{
 const game=new Chess(players);const loser=game.players.find(p=>p.color!==game.turn);game.action(loser.id,'resign');
 assert.notEqual(game.winner,loser.id);assert.equal(game.reason,'resignation');
 assert.equal(game.ratings().find(r=>r.id===game.winner).after,716);assert.equal(game.ratings().find(r=>r.id===loser.id).after,684);
 assert.throws(()=>game.action(loser.id,'resign'),/gameOver/);assert.throws(()=>new Chess(players).action('spectator','resign'),/spectator/);
 assert.deepEqual(new Chess(players,game.save()).ratings(),game.ratings());
});
test('Elo uses K=32, scores draws equally, rewards upsets and excludes organiser time limits',()=>{
 const game=new Chess([{id:'a',chessElo:700},{id:'b',chessElo:1100}]);game.reason='stalemate';
 assert.equal(game.ratings()[0].after,713);assert.equal(game.ratings()[1].after,1087);
 game.reason='checkmate';game.winner='a';assert.equal(game.ratings()[0].after,729);assert.equal(game.ratings()[1].after,1071);
 game.reason='timeUp';assert.deepEqual(game.ratings(),[]);
 const defaults=new Chess([{id:'a'},{id:'b'}]);defaults.reason='material';assert.deepEqual(defaults.ratings().map(r=>r.after),[700,700]);
});
