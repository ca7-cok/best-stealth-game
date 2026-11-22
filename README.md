# Shadow Lantern

[![best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/ca7-cok/best-stealth-game/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/ca7-cok/best-stealth-game/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)

A top-down stealth game built for the [make.fun best stealth game bounty](https://make.fun/bounty/best-stealth-game-20261121-1759). You are Wren, the lantern thief: slip through three night gardens, gather every lantern, and reach the moon-gate unseen.

## How to play

- **WASD / arrow keys** — move
- **Shift** — sneak: slower, quieter, and harder for wardens to spot
- **ESC / P** — pause · **R** — retry the level · **M** — mute · **Space / click** — menus

Wardens patrol fixed routes with lantern-light vision cones. Step into a cone and their suspicion rises — closer and faster is worse, sneaking halves it. Bushes hide you unless a warden is right next to you, and running feet are heard. Get fully spotted and a warden gives chase: break line of sight and stay hidden until they give up and search your last seen spot. If one catches you, the level restarts.

Collect every lantern in a level to open the moon-gate, then reach it. Finishing a level without ever being spotted earns a ghost bonus; faster runs earn a time bonus.

## Run it

No build step, no network: the game is plain static files under `game/`.

```sh
# serve game/ with any static server, then open index.html
node --version   # 22.18 or later
python3 -m http.server --directory game 8080
# open http://localhost:8080 in a desktop browser
```

Or hand it in the way the bounty expects:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library. Its two runs write identical bytes.

## Layout

- `game/index.html` — the page; `game/src/` holds the game's own source, one file per job:
  - `config.js` — every tuned number (speeds, vision, detection, scoring)
  - `levels.js` — the three hand-drawn maps and patrol routes
  - `world.js` — the rules: movement, guard AI, detection, line of sight
  - `render.js` — night lighting, vision cones, characters, HUD, screens
  - `input.js` — keyboard input · `audio.js` — synthesized WebAudio sounds
  - `shots.js` — deterministic screenshot scenes (`?shot=start|play|alert|clear`)
  - `main.js` — boot, the fixed-step loop, and the screen state machine
- `screenshots/` — four real renders of the game in a desktop browser
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged
- `main.ts` — the entry program

## License

MIT — see [LICENSE](LICENSE).
