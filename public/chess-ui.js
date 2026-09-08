import { g } from './chess-i18n.js';

const SIZE = 512, CELL = SIZE / 8;
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = 'abcdefgh';
const clock = ms => { const n = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMPTY = { board: '.'.repeat(64), turn: 'w', whiteMs: 0, blackMs: 0, legal: [], history: [], players: [], events: [], check: false, winner: null, reason: null };

export function createChessView(app, role, { send, notice, preference = () => {} }) {
  let s, online = false, contentKey = null, dead = false, lastEvent = 0, rendered = '';
  let canvas, ctx, selected = null, pendingPromotion = null;
  const cache = new Map();
  const soundKey = 'museum-sound-muted-' + role;
  let muted = false;
  function setPreferences(value) { if (soundKey in value) muted = value[soundKey] === '1'; }
  app.addEventListener('click', event => {
    if (!event.target.closest('[data-sound]')) return;
    muted = !muted; preference(soundKey, muted ? '1' : '0'); update(s, online);
  });

  const tr = (key, vars) => g(s.language, key, vars);
  const chess = () => s.party.chess || EMPTY;
  const name = id => { const p = s.party.players.find(p => p.id === id); return p ? (p.name || tr('player', { n: p.number })) : '…'; };
  const myColor = () => chess().players.find(p => p.id === s.party.you)?.color ?? null;
  const orientation = () => (role === 'controller' ? (myColor() || 'w') : 'w');
  const canControl = () => online && role === 'controller' && s.phase === 'playing' && Boolean(s.party.you);
  const myTurn = () => canControl() && chess().turn === myColor() && !chess().winner && !chess().reason;
  const doSend = (action, value) => send(action, value).catch(error => notice(tr(error.code || error.message)));

  const audio = {
    context: null,
    ensure() {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      if (!this.context) this.context = new Ctor();
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    },
    beep(frequency, duration = .1, delay = 0) {
      try {
        if (muted || !this.context || this.context.state !== 'running') return;
        const at = this.context.currentTime + delay;
        const osc = this.context.createOscillator(), amp = this.context.createGain();
        osc.type = 'sine'; osc.frequency.value = frequency;
        amp.gain.setValueAtTime(.06, at);
        amp.gain.exponentialRampToValueAtTime(.0001, at + duration);
        osc.connect(amp); amp.connect(this.context.destination);
        osc.start(at); osc.stop(at + duration);
      } catch { /* sounds are decorative */ }
    },
    play(kind) {
      if (kind === 'move') this.beep(480, .07);
      else if (kind === 'check') { this.beep(700, .09); this.beep(880, .09, .1); }
      else if (kind === 'end') { this.beep(440, .14); this.beep(550, .14, .14); this.beep(660, .2, .28); }
      else if (kind === 'flag') { this.beep(300, .2); this.beep(240, .3, .2); }
    },
  };

  function write(selector, property, value) {
    if (cache.get(selector) === value) return;
    const element = app.querySelector(selector);
    if (element) { element[property] = value; cache.set(selector, value); }
  }

  function mount() {
    app.innerHTML = `
      <div class="chess-shell ${role}">
        <header class="chess-header">
          <div><div class="brand">RETRO_MUSEUM · MULTI</div><h1>${esc(g(s.language, 'title'))}</h1></div>
          <button class="button" data-sound></button><button class="button" data-fullscreen>${esc(tr('fullscreen'))}</button>
        </header>
        <div class="chess-status" role="status"></div>
        <main class="chess-stage">
          <canvas class="chess-canvas" width="${SIZE}" height="${SIZE}" aria-label="Chess board"></canvas>
          <aside class="chess-side">
            <div class="chess-player" data-side="w"></div>
            <div class="chess-player" data-side="b"></div>
            <div class="chess-history"></div>
          </aside>
          <div class="chess-overlay-slot"></div>
        </main>
        <footer class="chess-footer"><span></span><span></span></footer>
      </div>`;
    canvas = app.querySelector('.chess-canvas');
    ctx = canvas.getContext('2d');
  }

  function squareName(index) { return FILES[index & 7] + (8 - (index >> 3)); }
  function squareIndex(name) { return (8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97); }

  function drawBoard() {
    if (!canvas || !ctx) return;
    const state = chess(), flip = orientation() === 'b';
    const targets = new Set((selected ? state.legal.filter(entry => entry.slice(0, 2) === selected) : []).map(entry => entry.slice(2, 4)));
    const last = state.lastMove || {};
    let checkIndex = -1;
    if (state.check) {
      const kingGlyph = state.turn === 'w' ? 'K' : 'k';
      for (let n = 0; n < 64; n++) if (state.board[n] === kingGlyph) { checkIndex = n; break; }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let display = 0; display < 64; display++) {
      const index = flip ? 63 - display : display;
      const column = display & 7, row = display >> 3;
      const x = column * CELL, y = row * CELL;
      const light = ((index >> 3) + (index & 7)) % 2 === 1;
      ctx.fillStyle = light ? '#ecd9b0' : '#8a5a3b';
      ctx.fillRect(x, y, CELL, CELL);
      const square = squareName(index);
      if (last.from === square || last.to === square) {
        ctx.fillStyle = 'rgba(255, 209, 102, .32)';
        ctx.fillRect(x, y, CELL, CELL);
      }
      if (index === checkIndex) {
        ctx.fillStyle = 'rgba(255, 114, 134, .38)';
        ctx.fillRect(x, y, CELL, CELL);
      }
      if (column === 0) {
        ctx.fillStyle = light ? '#8a5a3b' : '#ecd9b0';
        ctx.font = '11px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(String(8 - (index >> 3)), x + 4, y + 12);
        ctx.textAlign = 'center';
      }
      if (row === 7) {
        ctx.fillStyle = light ? '#8a5a3b' : '#ecd9b0';
        ctx.font = '11px system-ui';
        ctx.fillText(FILES[index & 7], x + CELL - 10, y + CELL - 10);
      }
      const piece = state.board[index];
      if (piece && piece !== '.') {
        const white = piece < 'a';
        const glyph = GLYPH[piece.toLowerCase()];
        ctx.font = `${Math.floor(CELL * .74)}px serif`;
        ctx.lineWidth = CELL * .06;
        ctx.strokeStyle = white ? '#3a2c15' : '#c9b896';
        ctx.fillStyle = white ? '#f5ead0' : '#1c1310';
        ctx.strokeText(glyph, x + CELL / 2, y + CELL / 2 + CELL * .04);
        ctx.fillText(glyph, x + CELL / 2, y + CELL / 2 + CELL * .04);
      }
      if (selected === square) {
        ctx.strokeStyle = '#64ddff';
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
      } else if (targets.has(square)) {
        ctx.fillStyle = 'rgba(100, 221, 255, .55)';
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, CELL * .13, 0, 7);
        ctx.fill();
      }
    }
    rendered = [state.board, state.lastMove?.from, state.lastMove?.to, selected, flip, state.check].join('|');
  }
  function paint() {
    const state = chess();
    const key = [state.board, state.lastMove?.from, state.lastMove?.to, selected, orientation(), state.check].join('|');
    if (key !== rendered) drawBoard();
  }

  function playerHtml(color) {
    const state = chess();
    const player = state.players.find(entry => entry.color === color);
    const profile = player ? s.party.players.find(p => p.id === player.id) : null;
    const isTurn = state.turn === color && s.phase === 'playing' && !state.winner && !state.reason;
    const ms = color === 'w' ? state.whiteMs : state.blackMs;
    const running = state.clockRunning && isTurn;
    const avatar = profile?.avatar
      ? `<img class="player-avatar" src="${esc(profile.avatar)}" alt="">`
      : '';
    return `
      ${avatar || `<span class="badge ${color}">${color === 'w' ? '♔' : '♚'}</span>`}
      <span class="who"><strong>${esc(player ? name(player.id) : '—')}</strong>
        <small>${color === 'w' ? esc(tr('white')) : esc(tr('black'))}${player && s.party.you === player.id ? ' · ' + esc(tr('you')) : ''}</small></span>
      <span class="clock ${running ? '' : 'off'} ${running && ms < 10500 ? 'urgent' : ''}">${clock(ms)}</span>`.trim();
  }

  function resultText() {
    const state = chess();
    if (state.reason === 'checkmate') return esc(tr('checkmate', { player: name(state.winner) }));
    if (state.reason === 'timeout') return esc(tr('timeout', { player: name(state.winner) }));
    if (state.reason === 'stalemate') return esc(tr('stalemate'));
    if (state.reason === 'fiftyMoves') return esc(tr('fiftyMoves'));
    if (state.reason === 'repetition') return esc(tr('repetition'));
    if (state.reason === 'material') return esc(tr('material'));
    if (state.reason === 'timeUp') return esc(tr('timeUp'));
    return '';
  }

  function overlayHtml() {
    const state = chess();
    if (pendingPromotion)
      return `<div class="chess-overlay"><p class="eyebrow">${esc(tr('choosePromotion'))}</p>
        <div class="chess-promotion">
          ${['q', 'r', 'b', 'n'].map(piece => `<button class="button primary" data-promotion="${piece}">${GLYPH[piece]}</button>`).join('')}
        </div></div>`;
    if (s.phase === 'ready')
      return `<div class="chess-overlay"><p class="eyebrow">${esc(tr('players', { n: s.party.players.length }))}</p><h2>${esc(tr('lobby'))}</h2><p class="rules">${esc(tr('rules'))}</p><p>${esc(tr('waiting'))}</p></div>`;
    if (s.phase === 'intro')
      return `<div class="chess-overlay"><div class="chess-countdown">${Math.max(1, Math.ceil((s.introRemainingMs || 0) / 1000))}</div>
        <p>${esc(tr('playsWhite', { player: name(state.players.find(p => p.color === 'w')?.id) }))}<br>${esc(tr('playsBlack', { player: name(state.players.find(p => p.color === 'b')?.id) }))}</p></div>`;
    if (s.phase === 'paused' || (s.phase === 'ended' && !state.reason))
      return `<div class="chess-overlay"><h2>${esc(tr(s.party.reason || 'adminPause'))}</h2></div>`;
    if (s.phase === 'solved' || s.phase === 'ended' || state.winner || state.reason) {
      const connected = s.party.players.filter(p => p.connected).length;
      const rematch = role === 'controller'
        ? `<div class="chess-replay"><button class="button primary" data-action="playAgain" ${connected < 2 ? 'disabled' : ''}>${esc(tr('playAgain'))}</button>${connected < 2 ? `<small>${esc(tr('needPlayers'))}</small>` : ''}</div>` : '';
      return `<div class="chess-overlay"><p class="eyebrow">${esc(tr('result'))}</p><h2>${resultText() || esc(tr(s.party.reason || 'adminEnd'))}</h2>${rematch}</div>`;
    }
    if (!online) return `<div class="chess-overlay"><h2>${esc(tr('disconnected'))}</h2></div>`;
    return '';
  }

  function statusHtml() {
    const state = chess();
    if (!online) return esc(tr('disconnected'));
    if (s.phase === 'ready') return '';
    if (s.phase === 'intro') return esc(tr('players', { n: s.party.players.length }));
    if (s.phase !== 'playing') return '';
    if (state.winner || state.reason) return '';
    const mover = state.players.find(p => p.color === state.turn);
    if (role === 'controller' && !myColor()) return esc(tr('watching'));
    if (role === 'controller' && state.turn === myColor())
      return `<span class="announce">${esc(tr('yourTurn'))}</span>${state.check ? ` <span class="alert">${esc(tr('check'))}</span>` : ''}`;
    return `${esc(tr('turnOf', { player: mover ? name(mover.id) : '…' }))} <small>${esc(tr('thinking'))}</small>${state.check ? ` <span class="alert">${esc(tr('check'))}</span>` : ''}`;
  }

  // Tap a square: select a piece, move to a target, or reselect.
  function tapSquare(square) {
    if (!myTurn()) { selected = null; paint(); return; }
    const state = chess();
    if (selected) {
      const options = state.legal.filter(entry => entry.slice(0, 2) === selected && entry.slice(2, 4) === square);
      if (options.length) {
        selected = null;
        if (options.some(entry => entry.length === 5)) { pendingPromotion = { from: options[0].slice(0, 2), to: square }; write('.chess-overlay-slot', 'innerHTML', overlayHtml()); }
        else doSend('move', { from: options[0].slice(0, 2), to: square });
        paint();
        return;
      }
    }
    const piece = state.board[squareIndex(square)];
    const mine = piece && piece !== '.' && (piece < 'a') === (myColor() === 'w');
    selected = mine ? square : null;
    paint();
  }
  app.addEventListener('pointerdown', event => {
    audio.ensure();
    const board = event.target.closest('.chess-canvas');
    if (!board || role !== 'controller') return;
    const rect = board.getBoundingClientRect();
    const column = Math.floor((event.clientX - rect.left) / rect.width * 8);
    const row = Math.floor((event.clientY - rect.top) / rect.height * 8);
    if (column < 0 || column > 7 || row < 0 || row > 7) return;
    const display = row * 8 + column;
    event.preventDefault();
    tapSquare(squareName(orientation() === 'b' ? 63 - display : display));
  });
  app.addEventListener('click', event => {
    const promotion = event.target.closest('[data-promotion]');
    if (promotion && pendingPromotion) {
      const pending = pendingPromotion;
      pendingPromotion = null;
      write('.chess-overlay-slot', 'innerHTML', '');
      doSend('move', { from: pending.from, to: pending.to, promotion: promotion.dataset.promotion });
      return;
    }
  });

  function update(state, connected) {
    if (dead) return;
    const previousMatch = s?.party?.id;
    s = state; online = connected;
    if (!app.querySelector('.chess-shell')) mount();
    write('h1', 'textContent', tr('title'));
    write('[data-fullscreen]', 'textContent', tr('fullscreen'));
    write('[data-sound]', 'textContent', tr(muted ? 'soundOff' : 'soundOn'));
    write('[data-sound]', 'ariaPressed', String(!muted));
    if (s.party.id !== previousMatch) { lastEvent = 0; selected = null; pendingPromotion = null; }
    const view = chess();
    const key = [role, s.phase, view.winner, view.reason, view.players.map(p => p.id + p.color).join(','), s.party.you, online].join(':');
    if (key !== contentKey) { contentKey = key; cache.clear(); rendered = ''; selected = null; }
    write('[data-side="w"]', 'innerHTML', playerHtml('w'));
    write('[data-side="b"]', 'innerHTML', playerHtml('b'));
    app.querySelector('[data-side="w"]')?.classList.toggle('is-turn', view.turn === 'w' && s.phase === 'playing');
    app.querySelector('[data-side="b"]')?.classList.toggle('is-turn', view.turn === 'b' && s.phase === 'playing');
    app.querySelector('[data-side="w"]')?.classList.toggle('is-winner', view.winner === view.players.find(p => p.color === 'w')?.id);
    app.querySelector('[data-side="b"]')?.classList.toggle('is-winner', view.winner === view.players.find(p => p.color === 'b')?.id);
    const moves = view.history.map(entry => entry.m).reduce((rows, uci, index) => {
      if (index % 2 === 0) rows.push([Math.floor(index / 2) + 1, uci]); else rows[rows.length - 1].push(uci);
      return rows;
    }, []).map(row => `<div><b>${row[0]}.</b> ${esc(row[1])} ${row[2] ? esc(row[2]) : ''}</div>`).join('');
    write('.chess-history', 'innerHTML', moves);
    write('.chess-status', 'innerHTML', statusHtml());
    if (!pendingPromotion) write('.chess-overlay-slot', 'innerHTML', overlayHtml());
    for (const event of view.events) {
      if (event.id <= lastEvent) continue;
      lastEvent = event.id;
      audio.play(event.type === 'move' ? 'move' : event.type === 'check' ? 'check' : event.type === 'end' ? 'end' : event.type === 'flag' ? 'flag' : null);
    }
    paint();
  }

  return { update, setPreferences, dispose() { dead = true; } };
}
