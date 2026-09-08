import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Chess, parseFen } from '../server/chess.js';
import { GameRuntime } from '@manaty/retro-museum-sdk/runtime';
const players = [{id:'a'},{id:'b'}];

test('FEN counters and legally possible en passant distinguish repetitions',()=>{
 const game=new Chess(players);
 Object.assign(game,parseFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 99 42'));
 assert.equal(game.halfmove,99);assert.equal(game.fullmove,42);
 const capturable=game.positionKey();game.ep=-1;assert.notEqual(game.positionKey(),capturable);
 Object.assign(game,parseFen('4r1k1/8/8/3pP3/8/8/8/4K3 w - d6 0 1'));
 const pinned=game.positionKey();game.ep=-1;assert.equal(game.positionKey(),pinned);
});

test('uncapturable initial en passant does not delay threefold draw',()=>{
 const game=new Chess(players);
 const move=(from,to)=>game.move(game.toMove.id,{from,to});
 move('e2','e4');
 for(let i=0;i<2;i++)for(const [from,to] of [['g8','f6'],['g1','f3'],['f6','g8'],['f3','g1']])move(from,to);
 assert.equal(game.reason,'repetition');
});

test('a bare king cannot win on time',()=>{
 const game=new Chess(players);
 Object.assign(game,parseFen('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1'));
 game.clocks.w=1;game.advance(.1);
 assert.equal(game.winner,null);assert.equal(game.reason,'material');
});

test('packaged QuickJS draw ends host lifecycle and can restart',async()=>{
 const pack=JSON.parse(await readFile(new URL('../dist/game.rmg.json',import.meta.url)));
 const runtime=new GameRuntime(pack,players);
 try {
  for(let i=0;i<2;i++)for(const [from,to] of [['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']]){
   const s=runtime.snapshot();runtime.action(s.players.find(p=>p.color===s.turn).id,'move',{from,to});
  }
  assert.equal(runtime.metadata.ended,true);assert.equal(runtime.winner,null);assert.deepEqual(runtime.metadata.requiredPlayers,[]);
  const restored=new GameRuntime(pack,players,runtime.save());
  try{assert.equal(restored.metadata.ended,true);}finally{restored.dispose();}
  const replay=new GameRuntime(pack,players);
  try{assert.equal(replay.metadata.ended,false);assert.equal(replay.snapshot().legal.length,20);}finally{replay.dispose();}
 }finally{runtime.dispose();}
});

import {RoomParty} from '@manaty/retro-museum-sdk/room-party';
test('host recognizes no-winner completion and replays with connected late players',async()=>{
 const pack=JSON.parse(await readFile(new URL('../dist/game.rmg.json',import.meta.url)));
 const party=new RoomParty({definition:{pack}});
 try{
  party.join('a');party.join('b');assert.equal(party.phase,'intro');party.join('late');
  party.engine.action(null,'hostTimeUp');party.finish();
  assert.equal(party.phase,'ended');assert.equal(party.engine.winner,null);
  party.leave('a');party.admin('playAgain');party.admin('start');
  assert.equal(party.players.find(p=>p.id==='late').spectator,false);
  assert.equal(party.engine.metadata.ended,false);
 }finally{party.dispose();}
});
