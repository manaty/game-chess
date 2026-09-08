[▶ Play online — no installation](https://play.retro-museum.net/g/chess)

# Chess · Blitz duel

A two-player chess duel with blitz clocks on the shared screen. Each phone shows the board from its player's side; tap a piece, tap a square.

An independent, open-source Manaty game. English, French and Tagalog. No Retro Museum installation or account is required to run it.

## Play on your own server

```sh
npm ci
npm run build
npm start
```

Open [localhost:4311](http://localhost:4311), click **Play now**, and scan the displayed QR with each phone. On Wi-Fi, browse to the computer's reachable address (such as `http://192.168.1.10:4311`) so the QR encodes it. `PORT` and `DATA_DIR` are configurable.

Supported moves and automatic draw rules run on the server: castling, en passant, promotion, checkmate, stalemate, the fifty-move rule, threefold repetition and insufficient material. Each player gets a blitz clock that starts when play begins. Colours are drawn at random; the room organiser can start, pause and end the game, and players can rematch.

## Development

```sh
npm run build
npm test
```

The engine's move generator is verified with standard perft node counts (start position, Kiwipete and promotion/rook-edge positions). The runtime and room transport come from the [Retro Museum SDK](https://github.com/manaty/retro-museum-sdk). This repository owns its engine, interface, compiled package and tests.

## Licence

Original code and assets: Manaty, MIT. This project is an independent game implementation and is not affiliated with any commercial game publisher.

## Release quality

Version 1.0.1 fixes host completion for matches without a winner, adds persistent sound controls and refreshes labels when language changes. Tested with the packaged QuickJS engine, real host transport and a browser display plus two controllers (390 × 844 and 1280 × 720). Actual older TVs and eight simultaneous Sketch phones have not been device-tested.

![Shared screen](docs/display.png)

![Phone](docs/phone.png)

See the [game acceptance checklist](https://github.com/manaty/retro-museum-sdk/blob/main/GAME-QUALITY.md).

This is casual chess: threefold repetition and fifty moves trigger an automatic draw. Draw claims, draw offers and resignation are not implemented. Basic insufficient-material cases are detected; not every possible blocked dead position or impossible-mate timeout configuration is recognized. It is not a complete FIDE tournament implementation. Rule reference: [FIDE Laws, articles 6.9 and 9](https://handbook.fide.com/chapter/E012023).

## Visual edition 1.1.0

Emerald and ivory board, original vector pieces with shaded relief, animated moves, prominent clocks and a trophy/confetti finish. Animations respect reduced-motion preferences and finish automatically. Unchanged server snapshots do not repaint the board.

Browser checks cover 320px/390px portrait phones, landscape phones and 960px/1280px/1920px shared displays. Run `npx playwright install chromium`, then `npm run test:browser`; CI runs these checks too. Physical legacy TVs remain untested.
# Session improvements in 1.2.0

Chess starts automatically when the second distinct controller connects. The organiser can disable automatic start or choose the blitz duration before players arrive. Read-only displays and abandoned join forms do not fill a seat.

On the first visit, each player enters a starting Elo (700 by default, 0–4000). This informal rating is stored in the browser on the current site. Each completed chess match recalculates both ratings using K=32, with 1 / 0.5 / 0 for win / draw / loss; organiser cancellations and the overall activity time limit do not count. The result shows the old rating, new rating and change. Refreshing never counts a result twice; rematches use the updated ratings. Clearing browser storage, changing browser or changing host origin creates a separate local profile. These are not federation or verified online ratings.

Players can resign from their phone, even when it is the opponent's turn, with an explicit confirmation. The opponent wins and both Elo ratings are updated. A transient disconnection does not itself count as resignation.

Validation: 23 engine/package/host tests, six viewport/role layouts, and a full browser session with two isolated phone profiles covering initial Elo, automatic start, cancellation/confirmation of resignation, refreshed local storage and rematch. The SDK additionally tests duplicate controller tabs, organiser-only settings, manual mode, paused/finished games and result deduplication. EN/FR/TL, sound controls and a seven-move UI checkmate were rechecked against the exact package.
