# 🐹 Hamster Haven

**Play it now: https://hamster-haven.csmcleod.workers.dev** — create a world, share the
5-letter code, and your friends can join from anywhere.

A cozy, flat-shaded low-poly **3D multiplayer hamster world**. You wake up as a hamster in a
cage on a kid's desk. Collect sunflower seeds, stuff your cheeks, build tubes and wheels and
houses, escape the cage, and explore the whole bedroom — with friends, via a shareable
5-letter room code.

## Play locally

```bash
npm install
npm start
```

Open **http://localhost:3210**, pick a name and fur color, and **Create World**.
Your room gets a 5-letter code (click it to copy). Friends open the same address and
**Join** with the code. Up to 8 hamsters per room.

## Deploy to Cloudflare

The game also runs on Cloudflare Workers: static assets + one Durable Object per room
([worker/index.js](worker/index.js), same wire protocol as the Node server — and built
parts persist in DO storage, so cloud rooms survive restarts).

```bash
npx wrangler deploy
```

## Controls

| Input | Action |
|---|---|
| Mouse (click to lock) | Look around |
| `W A S D` | Scurry |
| `Space` | Jump (hold inside a climb tube to climb) |
| `Shift` | Dash |
| `B` | Toggle build mode |
| `1–9` / `Q`/`E` (build) | Select part |
| Click (build) | Place part |
| `R` (build) | Rotate part |
| `X` / right-click (build) | Delete aimed part |
| `1–4` (play) | Emotes |
| `Enter` | Chat |
| Scroll wheel | Camera zoom |

## The game

- **Seeds** spawn around the cage, desk, and bedroom floor. Walk over them to stuff your
  cheek pouches (watch them inflate — max 10).
- Build a **House** and walk inside to bank your seeds. The leaderboard tracks everyone's stash.
- **Build parts**: tubes, corner tubes, climbable vertical tubes, ramps, platforms, a running
  wheel (it really spins), a seed-bank house, bouncy hay piles, and fences.
- **Escape the cage** through the gap in the front bars, cross the desk, and take the
  book-staircase down to the bedroom floor. The bed is bouncy. The room has a
  day/night cycle; the desk lamp glows at night.
- Everything you build is shared live with everyone in the room and persists while the
  room is alive (rooms are reaped ~5 minutes after the last hamster leaves).

## Tech

- **Client**: Three.js (vendored), vanilla ES modules — no build step. Custom AABB physics
  with substepping, step-up walking, climb/bounce/bank/wheel volumes, third-person camera
  with occlusion, procedural hamsters, procedural WebAudio sound + generative music.
- **Server**: Node + `ws`. Rooms with unambiguous 5-letter codes, 15 Hz state relay with
  client-side interpolation, server-authoritative seed economy, part/chat/emote relay.

```
server.js            HTTP static + WebSocket rooms
public/js/config.js  shared constants (units are centimeters)
public/js/world.js   the bedroom diorama + colliders + day/night
public/js/parts.js   buildable part catalog (mesh + colliders + zones)
public/js/physics.js AABB collision, raycast, zones
public/js/player.js  controller + camera
public/js/hamster.js procedural hamster + animation
public/js/build.js   build mode (ghost, snapping, delete)
public/js/net.js     client networking
public/js/ui.js      menus/HUD/chat  ·  audio.js  procedural sound
public/js/main.js    orchestration + game loop
```
