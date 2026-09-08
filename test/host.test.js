import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createGameHost } from '@manaty/retro-museum-sdk/host';
import { digest } from '@manaty/retro-museum-sdk/manifest';

const packageFile = new URL('../dist/game.rmg.json', import.meta.url);
const built = await stat(packageFile).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false; });

test('a full duel runs through the real host', { skip: built ? false : 'run npm run build first' }, async () => {
  const bytes = await readFile(packageFile);
  const definition = { pack: JSON.parse(bytes), source: bytes.toString(), hash: digest(bytes) };
  const saved = new Map();
  const store = { list: async () => [...saved.values()], put: async room => saved.set(room.id, structuredClone(room)) };
  const host = await createGameHost({ definitions: [definition], store });
  await new Promise(resolve => host.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + host.server.address().port;
  const sockets = [];
  const post = (path, value, bearer) => fetch(origin + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
    body: JSON.stringify(value),
  });
  async function connect(room, role, token) {
    const ws = new WebSocket(origin.replace('http', 'ws') + '/socket');
    sockets.push(ws);
    const states = [];
    ws.on('message', data => {
      const message = JSON.parse(data);
      if (message.type === 'state') { states.push(message.state); ws.send(JSON.stringify({ type: 'ack', sequence: message.sequence })); }
    });
    await new Promise((resolve, reject) => {
      ws.once('open', () => ws.send(JSON.stringify({ type: 'hello', room, role, token })));
      ws.on('message', data => {
        const message = JSON.parse(data);
        if (message.type === 'welcome') resolve();
        if (message.type === 'error') reject(Error(message.message));
      });
    });
    return { ws, states };
  }
  const waitFor = (client, predicate, label) => new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const state = client.states.at(-1);
      if (state && predicate(state)) { clearInterval(timer); resolve(state); }
      else if (Date.now() - started > 20000) { clearInterval(timer); reject(Error('timeout waiting for ' + label)); }
    }, 50);
  });
  try {
    const room = await (await post('/api/rooms', { game: 'chess' })).json();
    const alice = await (await post('/api/rooms/' + room.id + '/join', { profile: { name: 'Alice' } })).json();
    const bob = await (await post('/api/rooms/' + room.id + '/join', { profile: { name: 'Bob' } })).json();
    const alicePhone = await connect(room.id, 'controller', alice.token);
    const bobPhone = await connect(room.id, 'controller', bob.token);
    const display = await connect(room.id, 'display');
    assert.equal((await post('/api/rooms/' + room.id + '/control', { action: 'start', options: { minutes: 3 } }, room.hostToken)).status, 200);

    const playing = await waitFor(alicePhone, state => state.phase === 'playing', 'playing phase');
    const matchId = playing.party.id;
    const board = state => state.party.community;
    const white = board(playing).players.find(player => player.color === 'w').id;
    const black = board(playing).players.find(player => player.color === 'b').id;
    assert.ok(white && black && white !== black, 'colours are assigned to distinct players');

    const mate = [['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']];
    for (let index = 0; index < mate.length; index++) {
      const [from, to] = mate[index];
      const mover = index % 2 === 0 ? white : black;
      const socket = mover === alice.playerId ? alicePhone.ws : bobPhone.ws;
      socket.send(JSON.stringify({ type: 'command', matchId, id: 'm' + index, action: 'move', value: { from, to } }));
      await waitFor(display, state => board(state).lastMove?.to === to, 'move ' + from + to);
    }
    const solved = await waitFor(alicePhone, state => state.phase === 'solved', 'solved phase');
    assert.equal(solved.party.community.winner, white);
    assert.equal(solved.party.community.reason, 'checkmate');
    assert.equal(solved.party.community.history.length, 7);
    // A rebel move after the mate is refused.
    let rejected = false;
    bobPhone.ws.on('message', data => { const message = JSON.parse(data); if (message.type === 'error') rejected = true; });
    bobPhone.ws.send(JSON.stringify({ type: 'command', matchId, id: 'm9', action: 'move', value: { from: 'a7', to: 'a6' } }));
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.ok(rejected, 'moving after the game is over returns an error');
  } finally {
    for (const ws of sockets) ws.terminate();
    await host.close();
  }
});
