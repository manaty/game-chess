import { randomInt } from 'node:crypto';

// Board: array of 64 in FEN reading order (index 0 = a8, 63 = h1).
// White pieces are uppercase, black lowercase, empty squares ''.
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
const ROOK = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const BISHOP = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
const QUEEN = ROOK.concat(BISHOP);
const FILE = 'abcdefgh';
const square = index => FILE[index & 7] + (8 - (index >> 3));
const at = name => (8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97);
const on = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
const isWhite = piece => piece >= 'A' && piece <= 'Z';

export function parseFen(fen) {
  const [placement, turn, castling, ep, halfmove = '0', fullmove = '1'] = fen.split(' ');
  const board = new Array(64).fill('');
  let index = 0;
  for (const char of placement) {
    if (char === '/') continue;
    if (char >= '1' && char <= '8') index += Number(char);
    else board[index++] = char;
  }
  return {
    board, turn,
    castling: { K: castling.includes('K'), Q: castling.includes('Q'), k: castling.includes('k'), q: castling.includes('q') },
    ep: ep && ep !== '-' ? at(ep) : -1, halfmove: Number(halfmove), fullmove: Number(fullmove),
  };
}

export function attacked(board, target, byWhite) {
  const tf = target & 7, tr = target >> 3;
  const pawnRow = byWhite ? tr + 1 : tr - 1;
  if (pawnRow >= 0 && pawnRow < 8) {
    if (tf > 0 && board[pawnRow * 8 + tf - 1] === (byWhite ? 'P' : 'p')) return true;
    if (tf < 7 && board[pawnRow * 8 + tf + 1] === (byWhite ? 'P' : 'p')) return true;
  }
  for (const [df, dr] of KNIGHT) { const f = tf + df, r = tr + dr; if (on(f, r) && board[r * 8 + f] === (byWhite ? 'N' : 'n')) return true; }
  for (const [df, dr] of KING) { const f = tf + df, r = tr + dr; if (on(f, r) && board[r * 8 + f] === (byWhite ? 'K' : 'k')) return true; }
  for (const [df, dr] of ROOK) {
    let f = tf + df, r = tr + dr;
    while (on(f, r)) {
      const piece = board[r * 8 + f];
      if (piece) { if (piece === (byWhite ? 'R' : 'r') || piece === (byWhite ? 'Q' : 'q')) return true; break; }
      f += df; r += dr;
    }
  }
  for (const [df, dr] of BISHOP) {
    let f = tf + df, r = tr + dr;
    while (on(f, r)) {
      const piece = board[r * 8 + f];
      if (piece) { if (piece === (byWhite ? 'B' : 'b') || piece === (byWhite ? 'Q' : 'q')) return true; break; }
      f += df; r += dr;
    }
  }
  return false;
}

function pushPawn(moves, from, to, piece, white, lastRow, capture) {
  if ((to >> 3) === lastRow) for (const promotion of ['q', 'r', 'b', 'n']) moves.push({ from, to, piece, capture, promotion });
  else moves.push({ from, to, piece, capture });
}

export function pseudoMoves(state) {
  const { board, turn } = state, white = turn === 'w', moves = [];
  for (let index = 0; index < 64; index++) {
    const piece = board[index];
    if (!piece || isWhite(piece) !== white) continue;
    const f = index & 7, r = index >> 3, kind = piece.toUpperCase();
    if (kind === 'P') {
      const dir = white ? -1 : 1, startRow = white ? 6 : 1, lastRow = white ? 0 : 7;
      const one = (r + dir) * 8 + f;
      if (!board[one]) {
        pushPawn(moves, index, one, piece, white, lastRow, null);
        const two = (r + 2 * dir) * 8 + f;
        if (r === startRow && !board[two]) moves.push({ from: index, to: two, piece, ep: one });
      }
      for (const df of [-1, 1]) {
        const nf = f + df, nr = r + dir;
        if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
        const target = nr * 8 + nf, occupant = board[target];
        if (occupant && isWhite(occupant) !== white) pushPawn(moves, index, target, piece, white, lastRow, occupant);
        else if (!occupant && target === state.ep) moves.push({ from: index, to: target, piece, epCapture: true });
      }
    } else if (kind === 'N' || kind === 'K') {
      for (const [df, dr] of (kind === 'N' ? KNIGHT : KING)) {
        const nf = f + df, nr = r + dr;
        if (!on(nf, nr)) continue;
        const occupant = board[nr * 8 + nf];
        if (!occupant || isWhite(occupant) !== white) moves.push({ from: index, to: nr * 8 + nf, piece, capture: occupant || null });
      }
    } else {
      const dirs = kind === 'R' ? ROOK : kind === 'B' ? BISHOP : QUEEN;
      for (const [df, dr] of dirs) {
        let nf = f + df, nr = r + dr;
        while (on(nf, nr)) {
          const occupant = board[nr * 8 + nf];
          if (!occupant) moves.push({ from: index, to: nr * 8 + nf, piece, capture: null });
          else { if (isWhite(occupant) !== white) moves.push({ from: index, to: nr * 8 + nf, piece, capture: occupant }); break; }
          nf += df; nr += dr;
        }
      }
    }
  }
  const homeRow = white ? 7 : 0, kingAt = homeRow * 8 + 4;
  if (board[kingAt] === (white ? 'K' : 'k') && !attacked(board, kingAt, !white)) {
    const rights = white ? state.castling.K : state.castling.k, lefts = white ? state.castling.Q : state.castling.q;
    if (rights && !board[homeRow * 8 + 5] && !board[homeRow * 8 + 6] && board[homeRow * 8 + 7] === (white ? 'R' : 'r') &&
      !attacked(board, homeRow * 8 + 5, !white) && !attacked(board, homeRow * 8 + 6, !white))
      moves.push({ from: kingAt, to: homeRow * 8 + 6, piece: board[kingAt], castle: 'K' });
    if (lefts && !board[homeRow * 8 + 1] && !board[homeRow * 8 + 2] && !board[homeRow * 8 + 3] && board[homeRow * 8] === (white ? 'R' : 'r') &&
      !attacked(board, homeRow * 8 + 3, !white) && !attacked(board, homeRow * 8 + 2, !white))
      moves.push({ from: kingAt, to: homeRow * 8 + 2, piece: board[kingAt], castle: 'Q' });
  }
  return moves;
}

export function applyMove(state, move) {
  const board = state.board.slice(), castling = { ...state.castling };
  const piece = board[move.from], white = isWhite(piece);
  board[move.from] = '';
  board[move.to] = move.promotion ? (white ? move.promotion.toUpperCase() : move.promotion) : piece;
  if (move.epCapture) board[move.to + (white ? 8 : -8)] = '';
  if (move.castle) {
    const homeRow = move.to >> 3;
    if (move.castle === 'K') { board[homeRow * 8 + 5] = board[homeRow * 8 + 7]; board[homeRow * 8 + 7] = ''; }
    else { board[homeRow * 8 + 3] = board[homeRow * 8]; board[homeRow * 8] = ''; }
  }
  for (const spot of [move.from, move.to]) {
    if (spot === 60) { castling.K = castling.Q = false; }
    else if (spot === 4) { castling.k = castling.q = false; }
    else if (spot === 63) castling.K = false;
    else if (spot === 56) castling.Q = false;
    else if (spot === 7) castling.k = false;
    else if (spot === 0) castling.q = false;
  }
  const ep = move.ep !== undefined && Math.abs(move.to - move.from) === 16 ? move.ep : -1;
  const halfmove = piece.toUpperCase() === 'P' || move.capture || move.epCapture ? 0 : state.halfmove + 1;
  return { board, turn: white ? 'b' : 'w', castling, ep, halfmove, fullmove: state.fullmove + (white ? 0 : 1) };
}

export function legalMoves(state) {
  const moves = [];
  for (const move of pseudoMoves(state)) {
    const next = applyMove(state, move);
    const king = next.board.indexOf(state.turn === 'w' ? 'K' : 'k');
    if (!attacked(next.board, king, state.turn !== 'w')) moves.push(move);
  }
  return moves;
}

export function perft(state, depth) {
  if (depth <= 0) return 1;
  let nodes = 0;
  for (const move of legalMoves(state)) nodes += perft(applyMove(state, move), depth - 1);
  return nodes;
}

function insufficientMaterial(board) {
  const pieces = board.filter(piece => piece && piece.toUpperCase() !== 'K');
  if (!pieces.length) return true;
  if (pieces.length === 1) { const kind = pieces[0].toUpperCase(); return kind === 'B' || kind === 'N'; }
  if (pieces.every(piece => piece.toUpperCase() === 'B')) {
    const colors = [];
    board.forEach((piece, index) => { if (piece && piece.toUpperCase() === 'B') colors.push(((index >> 3) + (index & 7)) & 1); });
    return colors.every(color => color === colors[0]);
  }
  return false;
}

const START = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

export class Chess {
  constructor(players, saved, options = {}) {
    this.players = players.map(player => ({ id: player.id, bot:player.bot===true, color: 'w', elo: Number.isInteger(player.chessElo)&&player.chessElo>=0&&player.chessElo<=4000?player.chessElo:700 }));
    this.minutes = [3, 5, 10].includes(options.minutes) ? options.minutes : 5;
    this.events = []; this.eventId = 0;
    this.winner = null; this.reason = null;
    this.history = []; this.positions = [];
    if (saved) { Object.assign(this, structuredClone(saved)); return; }
    const colors = randomInt(2) ? ['b', 'w'] : ['w', 'b'];
    this.players.forEach((player, index) => { player.color = colors[index]; });
    this.board = START.board.slice(); this.turn = 'w';
    this.castling = { ...START.castling }; this.ep = -1;
    this.halfmove = 0; this.fullmove = 1; this.ply = 0;
    this.clocks = { w: this.minutes * 60000, b: this.minutes * 60000 };
    this.lastMove = null;
    this.positions = [this.positionKey()];
    this.record('start');
  }
  get toMove() { return this.players.find(player => player.color === this.turn); }
  record(type, extra = {}) {
    this.events.push({ id: ++this.eventId, type, ...extra });
    if (this.events.length > 24) this.events.splice(0, this.events.length - 24);
  }
  legal() { return legalMoves(this); }
  inCheck() { return attacked(this.board, this.board.indexOf(this.turn === 'w' ? 'K' : 'k'), this.turn !== 'w'); }
  positionKey() {
    return this.board.join(',') + this.turn + (this.castling.K ? 'K' : '') + (this.castling.Q ? 'Q' : '') +
      (this.castling.k ? 'k' : '') + (this.castling.q ? 'q' : '') +
      (this.ep >= 0 && this.legal().some(move => move.epCapture) ? square(this.ep) : '');
  }
  action(id, action, value) {
    if(action==='resign'){
      if(this.reason||this.winner)throw Error('gameOver');
      if(!this.players.some(p=>p.id===id))throw Error('spectator');
      this.winner=this.players.find(p=>p.id!==id).id;this.reason='resignation';this.record('end',{player:this.winner});return;
    }
    if (action !== 'move') throw new Error('invalidGameAction');
    return this.move(id, value);
  }
  move(id, value) {
    if (this.winner || this.reason) throw new Error('gameOver');
    const player = this.players.find(entry => entry.id === id);
    if (!player || player.color !== this.turn) throw new Error('notYourTurn');
    if (typeof value?.from !== 'string' || typeof value?.to !== 'string' ||
      !/^[a-h][1-8]$/.test(value.from) || !/^[a-h][1-8]$/.test(value.to)) throw new Error('illegalMove');
    const from = at(value.from), to = at(value.to);
    const candidates = this.legal().filter(move => move.from === from && move.to === to);
    if (!candidates.length) throw new Error('illegalMove');
    const promotion = ['q', 'r', 'b', 'n'].includes(value.promotion) ? value.promotion : null;
    const chosen = candidates.find(move => move.promotion === promotion) || candidates.find(move => move.promotion === 'q') || candidates[0];
    const capture = chosen.capture || (chosen.epCapture ? (this.turn === 'w' ? 'p' : 'P') : null);
    Object.assign(this, applyMove(this, chosen));
    this.ply++;
    this.lastMove = { from: value.from, to: value.to };
    this.history.push({ m: value.from + value.to + (chosen.promotion || ''), p: chosen.piece, c: capture });
    if (this.history.length > 100) this.history.shift();
    this.positions.push(this.positionKey());
    this.record('move', { player: id, uci: value.from + value.to + (chosen.promotion || '') });
    this.settle(id);
  }
  settle(mover) {
    const check = this.inCheck();
    if (check) this.record('check', { player: this.toMove.id });
    const moves = this.legal();
    if (!moves.length) {
      if (check) { this.winner = mover; this.reason = 'checkmate'; this.record('end', { player: mover }); }
      else { this.reason = 'stalemate'; this.record('end'); }
      return;
    }
    if (this.halfmove >= 100) { this.reason = 'fiftyMoves'; this.record('end'); return; }
    const key = this.positions[this.positions.length - 1];
    if (this.positions.filter(position => position === key).length >= 3) { this.reason = 'repetition'; this.record('end'); return; }
    if (insufficientMaterial(this.board)) { this.reason = 'material'; this.record('end'); }
  }
  advance(dt) {
    if (this.winner || this.reason) return;
    // The host advances only during play, never during intro or pause.
    {
      this.clocks[this.turn] -= dt * 1000;
      if (this.clocks[this.turn] <= 0) {
        this.clocks[this.turn] = 0;
        const opponent = this.players.find(player => player.color !== this.turn);
        const hasPiece = this.board.some(piece => piece && piece.toUpperCase() !== 'K' && isWhite(piece) === (opponent.color === 'w'));
        const drawn = !hasPiece || insufficientMaterial(this.board);
        this.winner = drawn ? null : opponent.id;
        this.reason = drawn ? 'material' : 'timeout';
        this.record('flag', { player: this.winner });
      }
    }
  }
  finishTime() { if (!this.winner && !this.reason) { this.reason = 'timeUp'; this.record('end'); } }
  ratings(){
    if(!this.reason||this.reason==='timeUp'||this.players.length!==2||this.players.some(p=>p.bot))return [];
    return this.players.map(player=>{const before=player.elo??700,opponent=this.players.find(p=>p.id!==player.id),expected=1/(1+10**(((opponent.elo??700)-before)/400)),score=this.winner?(this.winner===player.id?1:0):.5;
      const after=Math.max(0,Math.min(4000,Math.round(before+32*(score-expected))));return {id:player.id,before,after,delta:after-before};});
  }
  snapshot() {
    return {
      board: this.board.map(piece => piece || '.').join(''),
      turn: this.turn,
      castling: (this.castling.K ? 'K' : '') + (this.castling.Q ? 'Q' : '') + (this.castling.k ? 'k' : '') + (this.castling.q ? 'q' : '') || '-',
      whiteMs: Math.max(0, Math.ceil(this.clocks.w)),
      blackMs: Math.max(0, Math.ceil(this.clocks.b)),
      clockRunning: !this.winner && !this.reason,
      legal: this.legal().map(move => square(move.from) + square(move.to) + (move.promotion || '')),
      lastMove: this.lastMove,
      check: !this.winner && !this.reason && this.inCheck(),
      history: this.history,
      players: this.players.map(({ id, color, elo }) => ({ id, color, elo:elo??700 })), ratings:this.ratings(),
      winner: this.winner, reason: this.reason, events: this.events,
    };
  }
  save() { return structuredClone({ ...this }); }
  release() {}
}
