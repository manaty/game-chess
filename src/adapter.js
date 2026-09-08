import { Chess } from '../server/chess.js';
globalThis.RetroMuseumGame = {
  create(players, saved, options = {}) {
    const game = new Chess(players, saved, options);
    return {
      action(id, action, value) {
        if (action === 'hostTimeUp') { game.finishTime(); return; }
        return game.action(id, action, value);
      },
      advance(dt) { return game.advance(dt); },
      snapshot(id) { return game.snapshot(id); },
      save() { return game.save(); },
      release(id) { return game.release(id); },
      addPlayer() { /* The duel is full; new arrivals spectate. */ },
      status() { return { winner: game.winner, requiredPlayers: players.map(p => p.id) }; },
    };
  },
};
