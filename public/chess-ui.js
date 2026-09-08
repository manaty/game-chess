const VICTORY = "<svg class=\"victory-mark\" viewBox=\"0 0 80 80\" aria-hidden=\"true\"><path d=\"M24 14h32v19c0 14-8 20-16 20s-16-6-16-20z\" fill=\"currentColor\"/><path d=\"M24 20H13v10c0 10 8 14 16 14M56 20h11v10c0 10-8 14-16 14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"5\"/><path d=\"M36 51h8v12h12v6H24v-6h12z\" fill=\"currentColor\"/><path d=\"m40 22 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z\" fill=\"#825521\"/></svg><div class=\"celebration\" aria-hidden=\"true\"><i style=\"--x:0%;--delay:0s;--spin:-180deg;--color:#eacb7e\"></i><i style=\"--x:47%;--delay:0.12s;--spin:180deg;--color:#8dd9c0\"></i><i style=\"--x:94%;--delay:0.24s;--spin:-180deg;--color:#e68fab\"></i><i style=\"--x:41%;--delay:0.36s;--spin:180deg;--color:#c4bcff\"></i><i style=\"--x:88%;--delay:0.48s;--spin:-180deg;--color:#eacb7e\"></i><i style=\"--x:35%;--delay:0s;--spin:180deg;--color:#8dd9c0\"></i><i style=\"--x:82%;--delay:0.12s;--spin:-180deg;--color:#e68fab\"></i><i style=\"--x:29%;--delay:0.24s;--spin:180deg;--color:#c4bcff\"></i><i style=\"--x:76%;--delay:0.36s;--spin:-180deg;--color:#eacb7e\"></i><i style=\"--x:23%;--delay:0.48s;--spin:180deg;--color:#8dd9c0\"></i><i style=\"--x:70%;--delay:0s;--spin:-180deg;--color:#e68fab\"></i><i style=\"--x:17%;--delay:0.12s;--spin:180deg;--color:#c4bcff\"></i><i style=\"--x:64%;--delay:0.24s;--spin:-180deg;--color:#eacb7e\"></i><i style=\"--x:11%;--delay:0.36s;--spin:180deg;--color:#8dd9c0\"></i><i style=\"--x:58%;--delay:0.48s;--spin:-180deg;--color:#e68fab\"></i><i style=\"--x:5%;--delay:0s;--spin:180deg;--color:#c4bcff\"></i><i style=\"--x:52%;--delay:0.12s;--spin:-180deg;--color:#eacb7e\"></i><i style=\"--x:99%;--delay:0.24s;--spin:180deg;--color:#8dd9c0\"></i><i style=\"--x:46%;--delay:0.36s;--spin:-180deg;--color:#e68fab\"></i><i style=\"--x:93%;--delay:0.48s;--spin:180deg;--color:#c4bcff\"></i></div>";
import { drawPiece } from './pieces.js';
import { g } from './chess-i18n.js';

const SIZE = 768, CELL = SIZE / 8;
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = 'abcdefgh';
const clock = ms => { const n = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMPTY = { board: '.'.repeat(64), turn: 'w', whiteMs: 0, blackMs: 0, legal: [], history: [], players: [], events: [], check: false, winner: null, reason: null };

export function createChessView(app, role, { send, notice, preference = () => {} }) {
  let s, online = false, contentKey = null, dead = false, lastEvent = 0, rendered = '';
  let canvas, ctx, selected = null, pendingPromotion = null;
  let previousBoard = null, animation = null, animationFrame = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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
    const cacheKey = selector + ":" + property;
    if (cache.get(cacheKey) === value) return;
    const element = app.querySelector(selector);
    if (element) { element[property] = value; cache.set(cacheKey, value); }
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
      const tile=ctx.createLinearGradient(x,y,x+CELL,y+CELL);
      tile.addColorStop(0,light?'#244a4a':'#e6e2cd');tile.addColorStop(1,light?'#193b3d':'#cecbb4');
      ctx.fillStyle=tile;
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
        ctx.fillStyle = light ? '#a3c4b6' : '#426362';
        ctx.font = '11px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(String(8 - (index >> 3)), x + 4, y + 12);
        ctx.textAlign = 'center';
      }
      if (row === 7) {
        ctx.fillStyle = light ? '#a3c4b6' : '#426362';
        ctx.font = '11px system-ui';
        ctx.fillText(FILES[index & 7], x + CELL - 10, y + CELL - 10);
      }
      if (selected === square) {
        ctx.strokeStyle = '#64ddff';
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
      } else if (targets.has(square)) {
        ctx.fillStyle = 'rgba(100, 221, 255, .55)';
        ctx.beginPath();
        const capture=state.board[index]!=='.';
        ctx.arc(x + CELL / 2, y + CELL / 2, CELL * (capture ? .43 : .13), 0, 7);
        if(capture){ctx.strokeStyle='#89dbbd';ctx.lineWidth=4;ctx.stroke();}else ctx.fill();
      }
    }
    const t = animation ? Math.min(1, (performance.now()-animation.start)/260) : 1;
    const eased=1-Math.pow(1-t,3);
    const coords=index=>{const n=flip?63-index:index;return [(n&7)*CELL,(n>>3)*CELL];};
    for(let index=0;index<64;index++){
      const piece=state.board[index];if(!piece||piece==='.'||animation?.to===index)continue;
      const [x,y]=coords(index);drawPiece(ctx,piece,x+CELL*.08,y+CELL*.04,CELL*.84);
    }
    if(animation){
      const [x1,y1]=coords(animation.from),[x2,y2]=coords(animation.to);
      drawPiece(ctx,animation.piece,x1+(x2-x1)*eased+CELL*.08,y1+(y2-y1)*eased+CELL*.04-Math.sin(t*Math.PI)*CELL*.12,CELL*.84);
      if(t>=1)animation=null;
    }
  }
  function boardKey(){const state=chess();return [state.board,state.lastMove?.from,state.lastMove?.to,selected,orientation(),state.check].join('|');}
  function paint() {
    const state=chess(),key=boardKey();
    if(state.board!==previousBoard){
      if(previousBoard&&state.lastMove&&!reducedMotion.matches&&s.phase==='playing'){
        const from=squareIndex(state.lastMove.from),to=squareIndex(state.lastMove.to);
        if(previousBoard[from]!=='.'&&state.board[to]!=='.')animation={from,to,piece:state.board[to],start:performance.now()};
      }
      previousBoard=state.board;
    }
    if(key===rendered&&!animation)return;
    rendered=key;drawBoard();
    if(animation&&!animationFrame)animationFrame=requestAnimationFrame(function frame(){animationFrame=0;if(dead)return;drawBoard();if(animation)animationFrame=requestAnimationFrame(frame);});
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
      return `<div class="chess-overlay result-scene">${state.winner ? VICTORY : ''}<p class="eyebrow">${esc(tr('result'))}</p><h2>${resultText() || esc(tr(s.party.reason || 'adminEnd'))}</h2>${rematch}</div>`;
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
    if (s.party.id !== previousMatch) { lastEvent = 0; selected = null; pendingPromotion = null; previousBoard = null; animation = null; }
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

  return { update, setPreferences, dispose() { dead = true; cancelAnimationFrame(animationFrame); audio.context?.close().catch(() => {}); } };
}
