import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess, parseFen, perft } from '../server/chess.js';

const players = () => [{ id: 'p0', number: 1 }, { id: 'p1', number: 2 }];
const load = (game, fen) => {
  const state = parseFen(fen);
  game.board = state.board; game.turn = state.turn;
  game.castling = state.castling; game.ep = state.ep;
  game.halfmove = state.halfmove; game.positions = [];
};

test('perft: initial position', () => {
  const state = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(perft(state, 1), 20);
  assert.equal(perft(state, 2), 400);
  assert.equal(perft(state, 3), 8902);
  assert.equal(perft(state, 4), 197281);
});

test('perft: Kiwipete (castling, pins, checks)', () => {
  const state = parseFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.equal(perft(state, 1), 48);
  assert.equal(perft(state, 2), 2039);
  assert.equal(perft(state, 3), 97862);
});

test('perft: position 3 (en passant edge cases)', () => {
  const state = parseFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.equal(perft(state, 1), 14);
  assert.equal(perft(state, 2), 191);
  assert.equal(perft(state, 3), 2812);
  assert.equal(perft(state, 4), 43238);
});

test('perft: position 4 (promotions, underpromotions, rook rights)', () => {
  const state = parseFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
  assert.equal(perft(state, 1), 6);
  assert.equal(perft(state, 2), 264);
  assert.equal(perft(state, 3), 9467);
});

test('perft: position 6 (symmetric middlegame)', () => {
  const state = parseFen('r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10');
  assert.equal(perft(state, 1), 46);
  assert.equal(perft(state, 2), 2079);
  assert.equal(perft(state, 3), 89890);
});

test('scholar\'s mate ends the game', () => {
  const game = new Chess(players(), null, { minutes: 5 });
  const white = game.players.find(player => player.color === 'w').id;
  const black = game.players.find(player => player.color === 'b').id;
  for (const [id, from, to] of [[white, 'e2', 'e4'], [black, 'e7', 'e5'], [white, 'Bf1' in {} ? 'f1' : 'f1', 'c4'], [black, 'b8', 'c6'], [white, 'd1', 'h5'], [black, 'g8', 'f6'], [white, 'h5', 'f7']])
    game.move(id, { from, to });
  assert.equal(game.winner, white);
  assert.equal(game.reason, 'checkmate');
  assert.equal(game.history.length, 7);
  assert.throws(() => game.move(black, { from: 'a7', to: 'a6' }), /gameOver/);
});

test('stalemate is a draw', () => {
  const game = new Chess(players(), null, { minutes: 3 });
  const white = game.players.find(player => player.color === 'w').id;
  load(game, '7k/8/5Q2/6K1/8/8/8/8 w - - 0 1');
  game.move(white, { from: 'f6', to: 'f7' });
  assert.equal(game.winner, null);
  assert.equal(game.reason, 'stalemate');
});

test('castling moves king and rook, and is forbidden through attacked squares', () => {
  const game = new Chess(players(), null, { minutes: 3 });
  const white = game.players.find(player => player.color === 'w').id;
  const black = game.players.find(player => player.color === 'b').id;
  load(game, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const uci = game.legal().map(move => String.fromCharCode(97 + (move.from & 7)) + (8 - (move.from >> 3)) + String.fromCharCode(97 + (move.to & 7)) + (8 - (move.to >> 3)));
  assert.ok(uci.includes('e1g1'), 'kingside castling available');
  assert.ok(uci.includes('e1c1'), 'queenside castling available');
  game.move(white, { from: 'e1', to: 'g1' });
  assert.equal(game.board[62], 'K', 'king on g1');
  assert.equal(game.board[61], 'R', 'rook on f1');
  load(game, 'r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1');
  const blocked = game.legal().filter(move => (move.from & 7) === 4);
  assert.ok(!blocked.some(move => move.to === 62), 'no castling through an attacked square');
});

test('en passant captures the skipped pawn', () => {
  const game = new Chess(players(), null, { minutes: 3 });
  const white = game.players.find(player => player.color === 'w').id;
  const black = game.players.find(player => player.color === 'b').id;
  game.move(white, { from: 'e2', to: 'e4' });
  game.move(black, { from: 'a7', to: 'a6' });
  game.move(white, { from: 'e4', to: 'e5' });
  game.move(black, { from: 'd7', to: 'd5' });
  const ep = game.legal().find(move => move.epCapture);
  assert.ok(ep, 'en passant is generated');
  game.move(white, { from: 'e5', to: 'd6' });
  assert.equal(game.board[at('d6')], 'P');
  assert.equal(game.board[at('d5')], '', 'the captured pawn is gone');
});

test('promotion defaults to a queen and can be chosen', () => {
  const game = new Chess(players(), null, { minutes: 3 });
  const white = game.players.find(player => player.color === 'w').id;
  const black = game.players.find(player => player.color === 'b').id;
  load(game, '8/P7/8/8/8/8/7k/K7 w - - 0 1');
  game.move(white, { from: 'a7', to: 'a8' });
  assert.equal(game.board[0], 'Q', 'default promotion is a queen');
  load(game, '8/6P1/8/8/8/8/7k/K7 w - - 0 1');
  game.move(white, { from: 'g7', to: 'g8', promotion: 'n' });
  assert.equal(game.board[6], 'N', 'knight promotion');
  void black;
});

test('threefold repetition draws', () => {
  const game = new Chess(players(), null, { minutes: 10 });
  const white = game.players.find(player => player.color === 'w').id;
  const black = game.players.find(player => player.color === 'b').id;
  const cycle = [[white, 'g1', 'f3'], [black, 'g8', 'f6'], [white, 'f3', 'g1'], [black, 'f6', 'g8']];
  for (let round = 0; round < 2; round++) for (const [id, from, to] of cycle) game.move(id, { from, to });
  assert.equal(game.reason, 'repetition');
  assert.equal(game.winner, null);
});

test('blitz clocks run from the start and flag falls', () => {
  const game = new Chess(players(), null, { minutes: 5 });
  const white = game.players.find(player => player.color === 'w').id;
  const black = game.players.find(player => player.color === 'b').id;
  game.advance(2);
  assert.equal(game.clocks.w, 5 * 60000 - 2000, 'white cannot stall before the first move');
  game.move(white, { from: 'e2', to: 'e4' });
  game.advance(1);
  assert.equal(game.clocks.b, 5 * 60000 - 1000, 'black presses after white\'s first move');
  assert.equal(game.clocks.w, 5 * 60000 - 2000);
  game.clocks.b = 100;
  game.advance(1);
  assert.equal(game.winner, white);
  assert.equal(game.reason, 'timeout');
  game.advance(5);
  assert.equal(game.clocks.b, 0);
  void black;
});

test('engine preserves the match on restore', () => {
  const game = new Chess(players(), null, { minutes: 5 });
  const white = game.players.find(player => player.color === 'w').id;
  const black = game.players.find(player => player.color === 'b').id;
  game.move(white, { from: 'd2', to: 'd4' });
  game.move(black, { from: 'd7', to: 'd5' });
  game.advance(3);
  const before = game.snapshot();
  const restored = new Chess(players(), game.save(), {});
  assert.deepEqual(restored.snapshot(), before);
  const view = restored.snapshot(white);
  assert.ok(view.legal.includes('c2c4'));
  assert.ok(!view.legal.includes('d4d5'), 'a pawn cannot capture straight ahead');
  restored.advance(2);
  assert.ok(restored.snapshot().whiteMs < before.whiteMs, 'the pressed clock survives the restore');
});

test('invalid and rebel moves are rejected with message keys', () => {
  const game = new Chess(players(), null, { minutes: 5 });
  const white = game.players.find(player => player.color === 'w').id;
  const black = game.players.find(player => player.color === 'b').id;
  assert.throws(() => game.move(black, { from: 'e7', to: 'e5' }), /notYourTurn/);
  assert.throws(() => game.move(white, { from: 'e2', to: 'e5' }), /illegalMove/);
  assert.throws(() => game.move(white, { from: 'z9', to: 'e4' }), /illegalMove/);
  assert.throws(() => game.move(white, { from: 'e2' }), /illegalMove/);
  assert.throws(() => game.move('ghost', { from: 'e2', to: 'e4' }), /notYourTurn/);
  assert.throws(() => game.action(white, 'teleport', {}), /invalidGameAction/);
});

test('finishTime ends an unfinished duel without a winner', () => {
  const game = new Chess(players(), null, { minutes: 5 });
  game.finishTime();
  assert.equal(game.reason, 'timeUp');
  assert.equal(game.winner, null);
});

function at(name) { return (8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97); }
