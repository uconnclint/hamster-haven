# Hamster Haven — Coding Mode integration contract

Goal: **build your environment, then code a hamster to run it.** We reuse the Ctrl+Create
block editor (from `~/AI/scratchy`, already vendored into `public/coding/`) so the coding
UX matches that product exactly. A new interpreter drives a grid "robot" hamster through the
3D world the player built.

## What already exists (do not rebuild)

Vendored, working, **do not modify** (they set/read `window.CtrlCreate`):
- `public/coding/core.js` — namespace, event bus, block instance model (`makeBlock`,
  `tokenize`), `registry` (variables/messages), `nextTick` scheduler, `textPrompt`.
- `public/coding/blockRender.js`, `palette.js`, `workspace.js` — the full drag-drop block
  editor. Needs these DOM ids present when loaded: `cat-rail`, `palette`, `workspace-wrap`,
  `workspace`, `ws-canvas`, `trash`. Also uses optional `ws-hint`.
- `public/coding/blocks.css` — block shapes. Needs CSS vars `--ink:#3a3226` and
  `--font` defined on an ancestor.
- `public/coding/hamsterBlocks.js` — the block CATALOG (sets `CtrlCreate.categories/defs/
  defList/defsByCategory`). **This is the source of truth for every opcode.**

Load order (classic `<script>` tags, NOT modules), before the ES-module `main.js`:
`core.js → hamsterBlocks.js → blockRender.js → palette.js → workspace.js`. After these load,
`CtrlCreate.workspace` exists and `CtrlCreate.workspace.render()` draws the editor.

**The editor auto-initializes at script-load time** (`palette.js` builds the rail, `workspace.js`
calls `load()`), grabbing the DOM ids above via `getElementById`. Therefore the `#coding-panel`
DOM skeleton **must exist in index.html markup before** the vendored `<script>` tags — put the
panel in the body, scripts at the end of body (they already are).

The editor reads scripts via `CtrlCreate.workspace.scriptsFor(spriteId)` →
`{ blocks: {id->block}, tops: [id,…] }`. Block shape (from core.js):
```
{ id, opcode, category, shape, inputs:{NAME:{kind:'literal'|'block', value, block}},
  fields:{NAME:value}, next, substack, substack2, parent, x, y }
```
We use a single sprite id: **"hammy"**. Call `CtrlCreate.workspace.setSprite("hammy")` (the real
method; default is `"sprite1"`) so scripts live under the "hammy" bucket, then
`CtrlCreate.workspace.render()`. `coder.run()` should read `scriptsFor("hammy")`.

## The three build pieces

### 1. `public/js/coding.js` — the interpreter + world adapter  (ES module) [FABLE]

Exports:
```js
export function createCoder(ctx) → coder
```
`ctx` is supplied by main.js and gives the coder everything it needs about the 3D world
(see the **World Adapter** below). `coder` has:
```js
coder.run()      // green-flag: start all `event_flag` hats (and key/broadcast hats)
coder.stop()     // halt every thread, cancel motion
coder.update(dt) // called each frame from main.js render loop; advances the hamster's
                 //   position tween toward its target cell, updates animation
coder.running    // boolean
coder.reset()    // return the coding hamster to its spawn cell, clear cheeks
```
Reuse Ctrl+Create's cooperative-threading model faithfully (epoch counter, `nextTick`
frame yields, hats-across-scripts, stop-all) — port it from `~/AI/scratchy/js/engine/
interpreter.js`, but the **exec layer targets the world adapter**, not a 2D stage.

Opcode semantics (grid robot; heading ∈ {north,east,south,west}; one cell = `GRID` cm):
- `motion_forward/back N` — step N cells in facing/opposite dir, **one cell per loop
  iteration** (await a short tween each cell). Blocked by a wall → stop early + a bump.
- `motion_turnright/left` — ±90° heading.
- `motion_hop` — move forward one cell even across a 1-cell gap / up one small ledge, if
  `canHop`; else bump.
- `motion_face DIR` — set heading.
- `motion_gonest` — pathless walk toward the nest cell (simple: face+step greedily; ok if
  naive). `motion_col/row/heading` — reporters.
- `looks_grab` — if a seed is on/adjacent-ahead cell, collect it → cheeks++.
- `looks_stash` — if `atNest`, move cheeks → banked (call adapter).
- `looks_sniff/squeak/emote/say/sayfor` — animation / emote bubble / speech bubble via adapter.
- `sensing_seedahead/seedhere/wallahead/canhop/atnest` — booleans from adapter.
- `sensing_cheeks` reporter; `sensing_timer`/`resettimer`; `sensing_keypressed` (adapter.keys).
- Control / Operators / Variables / Events — identical semantics to Ctrl+Create's interpreter.
  Keep a local `vars` map; variable monitors are optional (adapter.setMonitor may be a no-op).

Every yield point must check the epoch so `stop()` interrupts loops/waits instantly. Never
throw out of the module on a bad program — bad/empty slots evaluate to 0/false like Scratch.

### World Adapter (`ctx`) — implemented by main.js, called by coding.js

```js
ctx = {
  GRID,                              // cm per cell (from config.js)
  spawn: { col, row, heading },      // where the coding hamster starts
  cellToWorld(col, row) → {x, z},    // grid → world cm (y is fixed to the floor)
  floorY,                            // world y the coding hamster stands on
  isBlocked(col, row) → bool,        // wall/part collider occupies that cell
  isGap(col, row) → bool,            // no floor there (hoppable gap) — optional, may return false
  seedAt(col, row) → seedId|null,    // a collectable seed on that cell
  collectSeed(seedId),               // remove it from the world (+ network if desired)
  nestCell() → {col,row}|null,       // the House/nest cell, or null if none built
  bankSeeds(n),                      // stash n seeds (updates HUD/leaderboard)
  keys,                              // Set<string> of Scratch key names currently down
  // presentation — all optional, safe no-ops if omitted:
  onMove(col,row,heading),           // hamster wants to be at this cell facing this way
  onAnim(name),                      // 'walk'|'idle'|'sniff'|'hop'|'bump'
  emote(name), say(text, secs), squeak(),
  setMonitor(name, val),             // variable watcher (optional)
  toast(msg),
}
```
The coding hamster is **grid-discrete**: `coding.js` owns `col,row,heading` and a tween
`t∈[0,1]` between the old and new cell; `coder.update(dt)` advances the tween and calls the
render side (main.js positions the mesh). Movement is authoritative in `coding.js`; the mesh
just follows.

### 2. `public/js/codingHamster.js` — the coding hamster's 3D model  (ES module) [OPUS AGENT]

```js
export function createCodingHamster(colorIndex = 0) → THREE.Group
```
Build like `public/js/hamster.js` (study it) but make it visually **distinct** as the
programmable "robot pet": e.g. a little wind-up key on its back, or a tiny hard-hat / goggles,
in a cool slate-blue palette so it reads apart from player hamsters. Same flat-shaded low-poly
style. Reuse the same `root.userData.hamster` animation interface as `hamster.js`
(`animate(dt, speed, grounded)`, `showEmote(src)`, `setCarry(frac)`) so `coding.js`/main.js can
drive it identically. Import only `three` and `./config.js`. No async, no top-level side effects.

### 3. `public/css/coding.css` — the Coding-Mode panel styling  [OPUS AGENT]

A slide-in **coding panel** that overlays the left ~55% of the screen while the 3D world stays
visible on the right, so you watch the hamster run as the program executes. Must:
- Define `--ink:#3a3226` and `--font` (cozy rounded stack) on `#coding-panel` so the vendored
  `blocks.css` renders correctly.
- Lay out the editor DOM (ids above): a `#cat-rail` (category buttons, vertical), `#palette`
  (scrollable block templates), `#workspace-wrap` containing `#workspace`>`#ws-canvas` and a
  `#trash`. Match Hamster Haven's warm cozy theme (cream cards, soft shadows, rounded) while
  keeping the Scratch block colors from the catalog.
- Style a top bar with **Go ▶** (`#coding-run`) and **Stop ■** (`#coding-stop`) buttons and a
  **Done** (`#coding-close`) button, plus a title. Panel is `display:none` until Coding Mode.
- Not break the existing HUD/build bar. Use `position:fixed; z-index` above the canvas but the
  panel itself is the only pointer-catching surface (world stays interactive on the right).
- Provide `#coding-panel.open` transform for the slide-in animation.

## 4. Wiring (main.js / ui.js / index.html) [FABLE, after 1–3 exist]

- `index.html`: add the classic `<script>` tags for the vendored editor + catalog **before**
  the module script, and `<link>` `coding.css`. Add a `#coding-panel` container with the editor
  DOM skeleton (cat-rail/palette/workspace-wrap/workspace/ws-canvas/trash + Go/Stop/Done bar).
- `ui.js`: add a **Code** button to the HUD (near the build hint) that opens Coding Mode.
- `main.js`:
  - Spawn one `createCodingHamster()` near the player; keep its grid state via `coding.js`.
  - Build the World Adapter `ctx` from the existing systems: `physics.colliders()` for
    `isBlocked` (test the cell's world AABB), `seedMeshes` for `seedAt/collectSeed`,
    `partMeshes` + parts catalog to find a House for `nestCell`, `net.deposit`-style path or a
    local counter for `bankSeeds`.
  - `createCoder(ctx)`; call `coder.update(dt)` in the frame loop; position the coding-hamster
    mesh from the coder's tweened cell each frame; drive its `.animate()`.
  - Coding Mode gates player input (like build mode): opening the panel pauses player control;
    Go runs, Stop halts, Done closes.
  - Keep everything **local/single-player** for v1 (the coded hamster is not networked). The
    built environment can still be a shared room.

## Constraints
- Units are centimeters; grid = `GRID` (10) cm; read from `./config.js`.
- The coding hamster stands on one floor plane (`floorY`); no full physics body — it's a grid
  actor. Walls come from testing colliders at cell centers.
- Everything flat-shaded low-poly, warm palette, consistent with the game.
- No new npm deps. Three.js via the existing import map.
