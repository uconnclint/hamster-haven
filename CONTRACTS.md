# Hamster Haven — Module Contracts

All modules are ES modules under `public/js/`. Three.js is imported as `import * as THREE from 'three'`
(an import map resolves it). Units are **centimeters**; read shared constants from `./config.js`.
Art direction: flat-shaded low-poly, warm pastel palette (see `PALETTE` in config.js). Every material
must use `flatShading: true` (MeshLambertMaterial or MeshStandardMaterial with flatShading). No textures
except canvas-generated ones. Geometry should be genuinely low-poly (icosahedrons, boxes, low-segment
cylinders/cones).

Coordinate frame: y-up. Room floor is y=0, room interior spans x ∈ [-250, 250], z ∈ [-200, 200],
ceiling at y=260. A desk sits in the corner (see DESK in config.js) with its top at y=75; the hamster
cage sits on it (see CAGE). The player starts inside the cage.

Collider format used everywhere:
```js
{ type: 'box', min: {x,y,z}, max: {x,y,z} }
```
Zone format:
```js
{ type: 'bounce'|'climb'|'bank'|'wheel'|'water', min: {x,y,z}, max: {x,y,z}, ...extra }
```

---

## world.js  (buildWorld)

```js
export function buildWorld() {
  return {
    group,      // THREE.Group containing the entire bedroom + desk + cage + lighting
    colliders,  // Collider[] — floor, walls, desk top & legs, cage base/walls, furniture the player can climb/stand on
    zones,      // Zone[] — e.g. the bed mattress as a {type:'bounce'} zone
    update(dt, elapsed), // called every frame: day/night cycle (~4 min full cycle), lamp glows at night, sun/window light moves
  };
}
```

Must include, all low-poly flat-shaded:
- Room: wood-plank floor (alternating plank tints), 3 walls + skirting (leave the -z or +z side visually open/short so the camera can see in is NOT needed — camera is inside; make all 4 walls but keep them simple), a window on one wall with warm light coming through.
- Desk (per DESK constants) with legs, a low-poly lamp on it, pencil cup, books **stacked like stairs from the floor up to the desk top near the desk edge** so a hamster can climb down/up (each book gets a collider, steps ≤ 8cm rise).
- Cage (per CAGE constants): green plastic base (3cm tall walls of base solid), vertical bars (thin cylinders, visual only, but the cage wall itself needs box colliders on all 4 sides from floorY up to floorY+wallH **EXCEPT leave a 20cm-wide gap in the middle of the -z side wall with a little ramp/door** so players can escape once they can reach it), bedding floor inside (flat noisy-tinted plane is fine), water-bottle on the outside of one wall.
- Bedroom furniture: bed with mattress+pillow (mattress top is a bounce zone, colliders so you can climb via a blanket draped to the floor as a ramp of steps), rug (visual), bookshelf with a couple of books, scattered toy blocks (colliders — stairs to nowhere are fun), a toy ball, poster on wall.
- Lighting: hemisphere light + one directional "sun" with shadows enabled (castShadow, shadow camera sized to cover the room, mapSize 2048), lamp point light. update() lerps sky/sun color & intensity through a gentle 4-minute day/night cycle; expose current sky color by setting `group.userData.skyColor` (THREE.Color) each update so main.js can tint the scene background/fog.
- Everything that the player could plausibly stand on ≥ 4cm tall needs a collider. Keep total colliders < 120.
- Meshes that cast/receive shadows should set castShadow/receiveShadow (bars can skip casting).

No imports besides `three` and `./config.js`. No async. Deterministic (no Date.now/random seeds needed — Math.random is fine for tints).

## audio.js  (procedural WebAudio, no assets)

```js
export const audio = {
  init(),            // create AudioContext lazily on first user gesture; safe to call many times
  play(name, opts),  // one-shot SFX; must never throw if ctx missing
  setMusicOn(on),    // gentle generative ambient loop (soft pad + occasional plucks), default off until called
  setMasterVolume(v) // 0..1
};
```
SFX names to implement (all synthesized: oscillators, noise buffers, envelopes):
`jump, land, dash, collect, deposit, place, remove, rotate, click, join, squeak, bounce, wheel, chat, denied, splash`.
Keep them soft/cute (short envelopes, low volume ~0.2). `squeak` should be an adorable pitch-bent chirp.
Music: slow chord pad (sine/triangle detuned) cycling I–vi–IV–V with sparse pentatonic plucks, ~70bpm feel, very quiet.

## ui.js + style.css  (all 2D UI; creates its own DOM inside `#ui-root`)

```js
export const ui = {
  init(cb),        // cb = { onPlay({mode:'create'|'join', code, name, colorIndex}), onEmote(i), onChat(text), onSelectPart(index), onToggleMusic(on) }
  showMenu(err),   // main menu: title art (CSS/emoji ok), name input (persist to localStorage), hamster color picker (6 swatches from HAMSTER_COLORS), "Create World" button, room-code input + "Join" button; optional err message
  showConnecting(),
  showHUD(roomCode),   // HUD: room code chip (click = copy to clipboard + toast), seed counters, player list, controls hint
  setSeeds(carrying, banked, maxCarry),
  setPlayers(list),    // [{id,name,colorIndex,banked,you}] — little leaderboard sorted by banked
  toast(msg),
  showBuildBar(items, sel), // items = [{name, icon}] ; highlight sel; clicking an item calls cb.onSelectPart(i); also show build-mode help line
  hideBuildBar(),
  setBuildSelected(i),
  addChat(name, text, you), // chat log (fades old lines); Enter key opens input — ui owns the input, calls cb.onChat, and must stopPropagation so game keys don't fire while typing; expose ui.isChatOpen()
  isChatOpen(),
  showEmoteHint(),     // small hint row for emote keys 1-4 (only when not in build mode)
  hint(text),          // persistent bottom-center hint line (e.g. "Press B to build")
};
```
- style.css: chunky rounded cozy game UI. Warm cream/amber palette matching PALETTE, big friendly rounded font (system rounded stack: `ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, sans-serif`), soft shadows, subtle pop animations. Title screen has a gradient sky backdrop with floating CSS sunflower-seed/paw decorations. Must not block pointer events except on actual widgets (`pointer-events:none` on containers, `auto` on interactive bits). HUD must never overlap the bottom-center build bar. Mobile not required.
- Room code display: big, spaced letters.
- No frameworks; vanilla DOM only. Import EMOTES/HAMSTER_COLORS from `./config.js`.

## Integration notes
- main.js (already being written) imports these exactly as specified — do not rename exports.
- Do not attach global key handlers for game keys in ui.js except: Enter (chat), Escape (close chat), and clicks. Everything else is main.js's job.
