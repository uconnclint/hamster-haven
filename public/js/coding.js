// Hamster Haven — coding.js
// The Coding-Mode block interpreter: a cooperative multi-threaded runtime
// (ported faithfully from Ctrl+Create's interpreter.js) whose exec layer
// drives a grid "robot" hamster through the 3D world via a World Adapter.
//
// Threading model (identical to Ctrl+Create):
//  - each hat script runs as an async "thread"
//  - loops yield one frame per iteration; straight-line code runs instantly
//  - stop-all works via an epoch counter that EVERY yield point checks, so
//    coder.stop() interrupts any loop/wait/tween instantly
//
// Grid model:
//  - the coder owns { col, row, heading } plus a tween t∈[0,1] between the
//    previous and current cell; coder.update(dt) advances the tween and the
//    mesh (positioned by main.js from coder.worldPos) just follows.
//  - AXIS MAPPING (y-up, cm):  cellToWorld(col,row) = { x: col*GRID, z: row*GRID }
//      north = -z (row-1) · east = +x (col+1) · south = +z (row+1) · west = -x (col-1)
//    yaw (mesh forward is +z, like hamster.js):
//      north=π · east=π/2 · south=0 · west=-π/2
//
// Robustness: a bad/empty program must never throw out of this module —
// empty slots evaluate to 0/false, unknown opcodes are no-ops, and every
// adapter call is wrapped so a broken ctx can't kill a thread.

const STOP_ALL = Symbol('stopAll');
const STOP_THIS = Symbol('stopThis');

const HEADINGS = ['north', 'east', 'south', 'west']; // +1 = clockwise = turn right
const DELTA = {
  north: { c: 0, r: -1 },
  east:  { c: 1, r: 0 },
  south: { c: 0, r: 1 },
  west:  { c: -1, r: 0 },
};
const YAW = { north: Math.PI, east: Math.PI / 2, south: 0, west: -Math.PI / 2 };
const HAT_OPCODES = { event_flag: 1, event_key: 1, event_whenbroadcast: 1 };

const WALK_SECS = 0.18;   // one cell per ~0.18s tween
const HOP_SECS = 0.30;

function cc() { return (typeof window !== 'undefined' && window.CtrlCreate) || null; }

// rAF with a setTimeout floor, matching CtrlCreate.nextTick (background tabs).
function fallbackTick(cb) {
  let done = false;
  const fire = () => { if (!done) { done = true; cb(); } };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fire);
  setTimeout(fire, 40);
}
function nextTick(cb) {
  const c = cc();
  if (c && typeof c.nextTick === 'function') c.nextTick(cb);
  else fallbackTick(cb);
}

function toNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function scratchKey(e) {
  if (e.key === ' ') return 'space';
  if (e.key === 'ArrowUp') return 'up arrow';
  if (e.key === 'ArrowDown') return 'down arrow';
  if (e.key === 'ArrowLeft') return 'left arrow';
  if (e.key === 'ArrowRight') return 'right arrow';
  return e.key && e.key.length === 1 ? e.key.toLowerCase() : null;
}
function isFormTarget(e) {
  const t = e.target;
  return !!(t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable));
}

export function createCoder(ctx) {
  ctx = ctx || {};
  const GRID = ctx.GRID || 10;
  const spawn = {
    col: (ctx.spawn && ctx.spawn.col) | 0,
    row: (ctx.spawn && ctx.spawn.row) | 0,
    heading: (ctx.spawn && HEADINGS.includes(ctx.spawn.heading)) ? ctx.spawn.heading : 'south',
  };

  /* ------------------------------------------------------------- state --- */
  let epoch = 0;
  let liveThreads = 0;
  let timerBase = performance.now();
  const vars = { score: 0, lives: 3 };

  const pos = { col: spawn.col, row: spawn.row, heading: spawn.heading };
  let cheeks = 0;
  let tween = null; // { ax,az,bx,bz, t, dur, kind:'walk'|'hop' }
  let hatsEnabled = true;

  /* ----------------------------------------------------- adapter safety -- */
  // Adapter calls must never blow up a thread; presentation hooks are optional.
  function safe(fn) { try { return fn(); } catch (err) { return undefined; } }
  function anim(name) { safe(() => ctx.onAnim && ctx.onAnim(name)); }

  function cellToWorld(col, row) {
    const w = safe(() => ctx.cellToWorld && ctx.cellToWorld(col, row));
    return w || { x: col * GRID, z: row * GRID };
  }
  function floorY() { return typeof ctx.floorY === 'number' ? ctx.floorY : 0; }
  function blocked(c, r) {
    const v = safe(() => ctx.isBlocked && ctx.isBlocked(c, r));
    return v === undefined ? false : !!v;
  }
  function gapAt(c, r) { return !!safe(() => ctx.isGap && ctx.isGap(c, r)); }
  function canWalk(c, r) { return !blocked(c, r) && !gapAt(c, r); }
  function seedAt(c, r) {
    const v = safe(() => ctx.seedAt && ctx.seedAt(c, r));
    return v == null ? null : v;
  }
  function atNest() {
    if (typeof ctx.atNest === 'function') return !!safe(() => ctx.atNest(pos.col, pos.row));
    const n = safe(() => ctx.nestCell && ctx.nestCell());
    return !!(n && n.col === pos.col && n.row === pos.row);
  }
  function keySet() { return (ctx.keys instanceof Set) ? ctx.keys : keysDown; }

  function aheadCell(sign) {
    const d = DELTA[pos.heading];
    const s = sign || 1;
    return { col: pos.col + d.c * s, row: pos.row + d.r * s };
  }
  function computeCanHop() {
    const a = aheadCell(1), b = aheadCell(2);
    if (blocked(a.col, a.row)) return false;
    if (!gapAt(a.col, a.row)) return true;                       // plain hop onto solid cell
    return !blocked(b.col, b.row) && !gapAt(b.col, b.row);       // clear a 1-cell gap
  }

  /* ---------------------------------------------------------- keyboard --- */
  // Internal key tracking mirrors interpreter.js; sensing prefers ctx.keys
  // when main.js supplies one. Fresh presses fire "when key pressed" hats.
  const keysDown = new Set();
  function onKeyDown(e) {
    if (isFormTarget(e)) return;
    const k = scratchKey(e);
    if (!k) return;
    const fresh = !keysDown.has(k);
    keysDown.add(k);
    if (fresh && (hatsEnabled || liveThreads > 0)) startKeyHats(k);
  }
  function onKeyUp(e) { const k = scratchKey(e); if (k) keysDown.delete(k); }
  function onBlur() { keysDown.clear(); }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  /* ------------------------------------------------------------ frames --- */
  function frame(myEpoch) {
    return new Promise((resolve, reject) => {
      nextTick(() => (myEpoch === epoch ? resolve() : reject(STOP_ALL)));
    });
  }
  function sleep(ms, myEpoch) {
    const end = performance.now() + ms;
    return (async function loop() {
      while (performance.now() < end) await frame(myEpoch);
    })();
  }
  // race a promise against stop, so stop-all interrupts broadcast waits
  function race(p, myEpoch) {
    return new Promise((resolve, reject) => {
      let settled = false;
      Promise.resolve(p).then(
        (v) => { if (!settled) { settled = true; resolve(v); } },
        () => { if (!settled) { settled = true; resolve(undefined); } }
      );
      (function check() {
        if (settled) return;
        if (myEpoch !== epoch) { settled = true; reject(STOP_ALL); return; }
        nextTick(check);
      })();
    });
  }

  /* ---------------------------------------------------------- movement --- */
  function startTween(toCol, toRow, kind) {
    const a = cellToWorld(pos.col, pos.row);
    const b = cellToWorld(toCol, toRow);
    tween = { ax: a.x, az: a.z, bx: b.x, bz: b.z, t: 0, dur: kind === 'hop' ? HOP_SECS : WALK_SECS, kind };
    pos.col = toCol; pos.row = toRow;
    safe(() => ctx.onMove && ctx.onMove(pos.col, pos.row, pos.heading));
    anim(kind === 'hop' ? 'hop' : 'walk');
  }
  async function awaitTween(myEpoch) {
    while (tween) await frame(myEpoch); // update(dt) clears it; epoch guards it
  }
  async function bump(myEpoch) {
    anim('bump');
    await sleep(160, myEpoch);
  }
  // One forward/back step. Returns false if blocked (caller stops early).
  async function step(myEpoch, sign) {
    const a = aheadCell(sign);
    if (!canWalk(a.col, a.row)) { await bump(myEpoch); return false; }
    startTween(a.col, a.row, 'walk');
    await awaitTween(myEpoch);
    return true;
  }

  /* ------------------------------------------------------------ blocks --- */
  function scripts() {
    const c = cc();
    const sc = c && c.workspace && safe(() => c.workspace.scriptsFor('hammy'));
    return sc || { blocks: {}, tops: [] };
  }
  function blockIn(id) { return scripts().blocks[id]; }
  function isHat(b) {
    if (!b) return false;
    const c = cc();
    const def = c && c.defs && c.defs[b.opcode];
    return def ? def.shape === 'hat' : !!HAT_OPCODES[b.opcode];
  }

  /* -------------------------------------------------------------- eval --- */
  async function evalInput(th, block, name) {
    const slot = block.inputs[name];
    if (slot && slot.kind === 'block' && slot.block) {
      const rb = blockIn(slot.block);
      if (rb) return evalReporter(th, rb);
      return 0;
    }
    if (slot && slot.kind === 'literal') return slot.value;
    if (name in block.fields) return block.fields[name];
    return 0;
  }
  async function evalNum(th, block, name) { return toNum(await evalInput(th, block, name)); }
  async function evalBool(th, block, name) {
    const slot = block.inputs[name];
    if (slot && slot.kind === 'block' && slot.block) {
      const rb = blockIn(slot.block);
      if (rb) return !!(await evalReporter(th, rb));
    }
    return false; // empty condition slot = false
  }

  async function evalReporter(th, b) {
    switch (b.opcode) {
      /* motion */
      case 'motion_col': return pos.col;
      case 'motion_row': return pos.row;
      case 'motion_heading': return pos.heading;

      /* sensing */
      case 'sensing_seedahead': { const a = aheadCell(1); return seedAt(a.col, a.row) != null; }
      case 'sensing_seedhere': return seedAt(pos.col, pos.row) != null;
      case 'sensing_wallahead': { const a = aheadCell(1); return blocked(a.col, a.row); }
      case 'sensing_canhop': return computeCanHop();
      case 'sensing_atnest': return atNest();
      case 'sensing_cheeks': return cheeks;
      case 'sensing_keypressed': {
        const k = b.fields.KEY;
        const keys = keySet();
        return k === 'any' ? keys.size > 0 : keys.has(k);
      }
      case 'sensing_timer': return Math.round((performance.now() - timerBase) / 100) / 10;

      /* operators */
      case 'operator_add': return (await evalNum(th, b, 'A')) + (await evalNum(th, b, 'B'));
      case 'operator_subtract': return (await evalNum(th, b, 'A')) - (await evalNum(th, b, 'B'));
      case 'operator_multiply': return (await evalNum(th, b, 'A')) * (await evalNum(th, b, 'B'));
      case 'operator_divide': { const d = await evalNum(th, b, 'B'); return d === 0 ? 0 : (await evalNum(th, b, 'A')) / d; }
      case 'operator_random': {
        const a = await evalNum(th, b, 'A'), c = await evalNum(th, b, 'B');
        const lo = Math.min(a, c), hi = Math.max(a, c);
        return Math.floor(Math.random() * (hi - lo + 1)) + lo;
      }
      case 'operator_gt': return (await evalNum(th, b, 'A')) > (await evalNum(th, b, 'B'));
      case 'operator_lt': return (await evalNum(th, b, 'A')) < (await evalNum(th, b, 'B'));
      case 'operator_eq': {
        const a = await evalInput(th, b, 'A'), c = await evalInput(th, b, 'B');
        return String(a).toLowerCase() === String(c).toLowerCase();
      }
      case 'operator_and': return (await evalBool(th, b, 'A')) && (await evalBool(th, b, 'B'));
      case 'operator_or': return (await evalBool(th, b, 'A')) || (await evalBool(th, b, 'B'));
      case 'operator_not': return !(await evalBool(th, b, 'A'));
      case 'operator_join': return String(await evalInput(th, b, 'A')) + String(await evalInput(th, b, 'B'));
      case 'operator_mod': { const d = await evalNum(th, b, 'B'); return d === 0 ? 0 : ((await evalNum(th, b, 'A')) % d + d) % d; }
      case 'operator_round': return Math.round(await evalNum(th, b, 'A'));

      /* variables */
      case 'data_variable': return vars[b.fields.VAR] != null ? vars[b.fields.VAR] : 0;

      default: return 0;
    }
  }

  /* --------------------------------------------------------- statements -- */
  async function execBlock(th, b) {
    const my = th.epoch;

    switch (b.opcode) {
      /* ------------------------------------------------------- motion --- */
      case 'motion_forward': {
        const n = Math.round(await evalNum(th, b, 'STEPS'));
        for (let i = 0; i < n; i++) {
          if (my !== epoch) throw STOP_ALL;
          if (!(await step(my, 1))) break; // blocked → stop early
        }
        break;
      }
      case 'motion_back': {
        const n = Math.round(await evalNum(th, b, 'STEPS'));
        for (let i = 0; i < n; i++) {
          if (my !== epoch) throw STOP_ALL;
          if (!(await step(my, -1))) break;
        }
        break;
      }
      case 'motion_turnright':
        pos.heading = HEADINGS[(HEADINGS.indexOf(pos.heading) + 1) % 4];
        await frame(my); // a beat so the turn reads
        break;
      case 'motion_turnleft':
        pos.heading = HEADINGS[(HEADINGS.indexOf(pos.heading) + 3) % 4];
        await frame(my);
        break;
      case 'motion_face': {
        const d = b.fields.DIR;
        if (HEADINGS.includes(d)) pos.heading = d;
        await frame(my);
        break;
      }
      case 'motion_hop': {
        const a = aheadCell(1), c2 = aheadCell(2);
        if (!blocked(a.col, a.row) && !gapAt(a.col, a.row)) {
          startTween(a.col, a.row, 'hop');
          await awaitTween(my);
        } else if (!blocked(a.col, a.row) && gapAt(a.col, a.row) &&
                   !blocked(c2.col, c2.row) && !gapAt(c2.col, c2.row)) {
          startTween(c2.col, c2.row, 'hop'); // clear the 1-cell gap
          await awaitTween(my);
        } else {
          await bump(my);
        }
        break;
      }
      case 'motion_gonest': {
        const nest = safe(() => ctx.nestCell && ctx.nestCell());
        if (!nest) { safe(() => ctx.toast && ctx.toast('Build a House first — that\'s the nest!')); break; }
        let guard = 0;
        while ((pos.col !== nest.col || pos.row !== nest.row) && guard++ < 240) {
          if (my !== epoch) throw STOP_ALL;
          const dc = nest.col - pos.col, dr = nest.row - pos.row;
          // greedy: prefer the axis with the bigger remaining distance
          const prefs = [];
          const h = dc > 0 ? 'east' : 'west';
          const v = dr > 0 ? 'south' : 'north';
          if (Math.abs(dc) >= Math.abs(dr)) { if (dc) prefs.push(h); if (dr) prefs.push(v); }
          else { if (dr) prefs.push(v); if (dc) prefs.push(h); }
          let moved = false;
          for (const dir of prefs) {
            const d = DELTA[dir];
            if (canWalk(pos.col + d.c, pos.row + d.r)) {
              pos.heading = dir;
              startTween(pos.col + d.c, pos.row + d.r, 'walk');
              await awaitTween(my);
              moved = true;
              break;
            }
          }
          if (!moved) { await bump(my); break; } // naive: give up when cornered
        }
        break;
      }

      /* ---------------------------------------------------------- act --- */
      case 'looks_grab': {
        let id = seedAt(pos.col, pos.row);
        if (id == null) { const a = aheadCell(1); id = seedAt(a.col, a.row); }
        if (id != null) {
          safe(() => ctx.collectSeed && ctx.collectSeed(id));
          cheeks++;
          anim('sniff');
        }
        await frame(my);
        break;
      }
      case 'looks_stash': {
        if (atNest() && cheeks > 0) {
          const n = cheeks;
          cheeks = 0;
          safe(() => ctx.bankSeeds && ctx.bankSeeds(n));
        }
        await frame(my);
        break;
      }
      case 'looks_sniff': anim('sniff'); await sleep(600, my); break;
      case 'looks_squeak': safe(() => ctx.squeak && ctx.squeak()); await sleep(250, my); break;
      case 'looks_emote': safe(() => ctx.emote && ctx.emote(b.fields.EMOTE)); break;
      case 'looks_say': {
        const msg = String(await evalInput(th, b, 'MSG'));
        safe(() => ctx.say && ctx.say(msg, 0));
        break;
      }
      case 'looks_sayfor': {
        const msg = String(await evalInput(th, b, 'MSG'));
        const secs = Math.max(0, await evalNum(th, b, 'SECS'));
        safe(() => ctx.say && ctx.say(msg, secs));
        await sleep(secs * 1000, my);
        safe(() => ctx.say && ctx.say('', 0));
        break;
      }

      /* ------------------------------------------------------- events --- */
      case 'event_broadcast': broadcast(b.fields.MSG); break;
      case 'event_broadcastwait': await race(Promise.all(broadcast(b.fields.MSG)), my); break;

      /* ------------------------------------------------------ control --- */
      case 'control_wait': await sleep((await evalNum(th, b, 'SECS')) * 1000, my); break;
      case 'control_repeat': {
        const n = Math.round(await evalNum(th, b, 'N'));
        for (let i = 0; i < n; i++) {
          if (b.substack) await execChain(th, b.substack);
          await frame(my);
        }
        break;
      }
      case 'control_forever':
        for (;;) {
          if (b.substack) await execChain(th, b.substack);
          await frame(my);
        }
      case 'control_if':
        if (await evalBool(th, b, 'COND')) { if (b.substack) await execChain(th, b.substack); }
        break;
      case 'control_ifelse':
        if (await evalBool(th, b, 'COND')) { if (b.substack) await execChain(th, b.substack); }
        else if (b.substack2) await execChain(th, b.substack2);
        break;
      case 'control_waituntil': while (!(await evalBool(th, b, 'COND'))) await frame(my); break;
      case 'control_repeatuntil':
        while (!(await evalBool(th, b, 'COND'))) {
          if (b.substack) await execChain(th, b.substack);
          await frame(my);
        }
        break;
      case 'control_stop':
        if (b.fields.WHAT === 'all') { stopAll(); throw STOP_ALL; }
        throw STOP_THIS;

      /* ------------------------------------------------------ sensing --- */
      case 'sensing_resettimer': timerBase = performance.now(); break;

      /* ---------------------------------------------------- variables --- */
      case 'data_setvar': {
        const v = await evalInput(th, b, 'VAL');
        const n = parseFloat(v);
        vars[b.fields.VAR] = (!isNaN(n) && String(n) === String(v).trim()) ? n : v;
        safe(() => ctx.setMonitor && ctx.setMonitor(b.fields.VAR, vars[b.fields.VAR]));
        break;
      }
      case 'data_changevar':
        vars[b.fields.VAR] = toNum(vars[b.fields.VAR]) + (await evalNum(th, b, 'VAL'));
        safe(() => ctx.setMonitor && ctx.setMonitor(b.fields.VAR, vars[b.fields.VAR]));
        break;
      case 'data_showvar':
        safe(() => ctx.setMonitor && ctx.setMonitor(b.fields.VAR, vars[b.fields.VAR] != null ? vars[b.fields.VAR] : 0, true));
        break;
      case 'data_hidevar':
        safe(() => ctx.setMonitor && ctx.setMonitor(b.fields.VAR, vars[b.fields.VAR] != null ? vars[b.fields.VAR] : 0, false));
        break;

      default: break; // hats and unknowns are no-ops mid-chain
    }
  }

  /* ------------------------------------------------------------ threads -- */
  async function execChain(th, blockId) {
    let b = blockIn(blockId);
    while (b) {
      if (th.epoch !== epoch) throw STOP_ALL;
      await execBlock(th, b);
      b = b.next ? blockIn(b.next) : null;
    }
  }

  function startThread(topId) {
    const th = { topId, epoch };
    liveThreads++;
    const top = blockIn(topId);
    const startId = top && isHat(top) ? top.next : topId;
    return (async () => {
      try { if (startId) await execChain(th, startId); }
      catch (err) {
        if (err !== STOP_ALL && err !== STOP_THIS) console.error('Coder thread error:', err);
      }
      finally { liveThreads = Math.max(0, liveThreads - 1); }
    })();
  }

  function hatsMatching(match) {
    const sc = scripts();
    const out = [];
    sc.tops.forEach((topId) => {
      const b = sc.blocks[topId];
      if (b && match(b)) out.push(topId);
    });
    return out;
  }

  function startKeyHats(key) {
    hatsMatching((b) => b.opcode === 'event_key' && (b.fields.KEY === key || b.fields.KEY === 'any'))
      .forEach((topId) => startThread(topId));
  }

  function broadcast(msg) {
    return hatsMatching((b) => b.opcode === 'event_whenbroadcast' && b.fields.MSG === msg)
      .map((topId) => startThread(topId));
  }

  function stopAll() {
    epoch++;               // every awaited frame/sleep/race rejects on next tick
    liveThreads = 0;
    tween = null;          // cancel motion (position is already the target cell)
    safe(() => ctx.say && ctx.say('', 0));
    anim('idle');
  }

  /* -------------------------------------------------------------- coder -- */
  const coder = {
    run() {
      try {
        stopAll();
        epoch++; // fresh epoch for the new run (mirrors greenFlag)
        timerBase = performance.now();
        const hats = hatsMatching((b) => b.opcode === 'event_flag');
        if (!hats.length) {
          safe(() => ctx.toast && ctx.toast('Add a "when ⚑ clicked" block to start!'));
          return;
        }
        hats.forEach((topId) => startThread(topId));
      } catch (err) { console.error('Coder run error:', err); }
    },

    stop() { stopAll(); },

    reset() {
      stopAll();
      pos.col = spawn.col;
      pos.row = spawn.row;
      pos.heading = spawn.heading;
      cheeks = 0;
      tween = null;
      safe(() => ctx.onMove && ctx.onMove(pos.col, pos.row, pos.heading));
    },

    // Advance the movement tween. Called once per frame by main.js.
    update(dt) {
      if (tween) {
        tween.t += dt / tween.dur;
        if (tween.t >= 1) tween = null;
      }
    },

    get running() { return liveThreads > 0; },
    get col() { return pos.col; },
    get row() { return pos.row; },
    get heading() { return pos.heading; },
    get cheeks() { return cheeks; },
    get yaw() { return YAW[pos.heading]; },
    get speedNorm() { return tween ? (tween.kind === 'hop' ? 0.95 : 0.8) : 0; },
    get vars() { return vars; },

    // Tweened world position (y = floor, plus a little arc while hopping).
    get worldPos() {
      const y = floorY();
      if (!tween) {
        const w = cellToWorld(pos.col, pos.row);
        return { x: w.x, y, z: w.z };
      }
      const t = Math.min(1, tween.t);
      const e = t * t * (3 - 2 * t); // smoothstep
      return {
        x: tween.ax + (tween.bx - tween.ax) * e,
        y: y + (tween.kind === 'hop' ? Math.sin(Math.PI * t) * 3.5 : 0),
        z: tween.az + (tween.bz - tween.az) * e,
      };
    },

    // main.js sets this false when the coding panel is closed so key hats
    // don't hijack normal play; a running program keeps responding to keys.
    get hatsEnabled() { return hatsEnabled; },
    set hatsEnabled(v) { hatsEnabled = !!v; },

    // teardown (not used in-game; handy for tests)
    dispose() {
      stopAll();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };

  return coder;
}
