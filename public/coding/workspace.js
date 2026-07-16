/* ============================================================================
 * CTRL+CREATE — workspace.js
 * The scripting area: block store (per sprite), drag & drop, snapping,
 * C-block nesting, reporter/boolean slotting, trash, autosave.
 *
 * Public API (CtrlCreate.workspace):
 *   blocks                 -> current sprite's {id: block}
 *   tops                   -> current sprite's top-level block ids
 *   beginPaletteDrag(def, pointerEvent)
 *   render()
 *   setSprite(spriteId)    -> swap visible script set
 *   scriptsFor(spriteId)   -> {blocks, tops} (interpreter uses this)
 *   save() / load()
 * ==========================================================================*/
(function () {
  "use strict";
  const { el, clamp } = CtrlCreate;

  const wsWrap = document.getElementById("workspace-wrap");
  const ws = document.getElementById("workspace");
  const canvas = document.getElementById("ws-canvas");
  const trash = document.getElementById("trash");

  const STACKABLE = { hat: 1, stack: 1, cap: 1, c: 1, c2: 1 };
  const VALUE = { reporter: 1, boolean: 1 };
  const SNAP = 30; // px snap radius

  /* ------------------------------------------------------- script store -- */
  // scripts per sprite: { spriteId: {blocks:{}, tops:[]} }
  const sprites = {};
  let currentSprite = "sprite1";

  function bucket(id) {
    if (!sprites[id]) sprites[id] = { blocks: {}, tops: [] };
    return sprites[id];
  }
  function cur() { return bucket(currentSprite); }

  /* ------------------------------------------------------- chain helpers -- */
  function get(id) { return id ? cur().blocks[id] : null; }

  function tailOf(id) {
    let b = get(id);
    while (b && b.next) b = get(b.next);
    return b;
  }

  function chainIds(id) {
    const out = [];
    let b = get(id);
    while (b) { out.push(b.id); b = get(b.next); }
    return out;
  }

  // every block referenced from `id` downward (next chain + mouths + plugged inputs)
  function treeIds(id) {
    const out = [];
    (function walk(bid) {
      let b = get(bid);
      while (b) {
        out.push(b.id);
        if (b.substack) walk(b.substack);
        if (b.substack2) walk(b.substack2);
        for (const k in b.inputs) {
          const slot = b.inputs[k];
          if (slot.kind === "block" && slot.block) walk(slot.block);
        }
        b = get(b.next);
      }
    })(id);
    return out;
  }

  function stackTopOf(id) {
    // walk up to the top-level ancestor
    let b = get(id);
    let guard = 0;
    while (b && guard++ < 1000) {
      const ref = findReference(b.id);
      if (!ref) return b.id;
      b = get(ref.owner);
    }
    return b ? b.id : id;
  }

  // who points at `id`? -> {type:'next'|'substack'|'substack2'|'input', owner, name?}
  function findReference(id) {
    const bs = cur().blocks;
    for (const k in bs) {
      const b = bs[k];
      if (b.next === id) return { type: "next", owner: b.id };
      if (b.substack === id) return { type: "substack", owner: b.id };
      if (b.substack2 === id) return { type: "substack2", owner: b.id };
      for (const n in b.inputs) {
        const s = b.inputs[n];
        if (s.kind === "block" && s.block === id) return { type: "input", owner: b.id, name: n };
      }
    }
    return null;
  }

  function detach(id) {
    const c = cur();
    const ref = findReference(id);
    if (ref) {
      const owner = get(ref.owner);
      if (ref.type === "next") owner.next = null;
      else if (ref.type === "substack") owner.substack = null;
      else if (ref.type === "substack2") owner.substack2 = null;
      else if (ref.type === "input") {
        // restore the literal the slot had before the plug
        const slot = owner.inputs[ref.name];
        owner.inputs[ref.name] = slot.savedLiteral
          ? { kind: "literal", value: slot.savedLiteral.value }
          : (isBoolArg(owner, ref.name) ? { kind: "block", block: null } : { kind: "literal", value: "" });
      }
    }
    const i = c.tops.indexOf(id);
    if (i >= 0) c.tops.splice(i, 1);
  }

  function isBoolArg(block, name) {
    const def = CtrlCreate.defs[block.opcode];
    const a = def && def.args && def.args[name];
    return a && (a.type === "boolean" || a.type === "reporter");
  }

  function deleteTree(id) {
    const ids = treeIds(id);
    ids.forEach((bid) => {
      const b = cur().blocks[bid];
      if (b) CtrlCreate.track("blocks:deleted", { opcode: b.opcode });
      delete cur().blocks[bid];
    });
  }

  /* -------------------------------------------------------------- undo ---- */
  // Whole-store snapshots (all sprites' scripts). Pushed BEFORE any structural
  // mutation; bounded; cleared-forward on new edits like every editor ever.
  const undoStack = [];
  const redoStack = [];
  function snapshot() { return JSON.stringify(sprites); }
  function restore(json) {
    try {
      const data = JSON.parse(json);
      for (const k in sprites) delete sprites[k];
      for (const k in data) sprites[k] = data[k];
      render();
    } catch (err) { /* corrupted snapshot — ignore */ }
  }
  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    refreshUndoButtons();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    refreshUndoButtons();
    CtrlCreate.track("edit:undo", {});
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    refreshUndoButtons();
  }

  // little paper buttons in the workspace corner
  document.head.appendChild(el("style", { text: `
    .ws-editbar{position:absolute;top:8px;right:10px;display:flex;gap:6px;z-index:20}
    .ws-editbar button{width:34px;height:30px;border:1.5px solid #cbbfa5;border-radius:9px;
      background:#fffdf7;color:#3a3226;font:800 14px sans-serif;cursor:pointer;
      box-shadow:2px 2px 0 rgba(58,50,38,.18)}
    .ws-editbar button:active{transform:translate(1px,2px);box-shadow:1px 1px 0 rgba(58,50,38,.18)}
    .ws-editbar button:disabled{opacity:.35;cursor:default}
  ` }));
  const undoBtn = el("button", { text: "↩", title: "Undo (Ctrl+Z)", onClick: undo });
  const redoBtn = el("button", { text: "↪", title: "Redo (Ctrl+Shift+Z)", onClick: redo });
  wsWrap.appendChild(el("div", { class: "ws-editbar" }, [undoBtn, redoBtn]));
  function refreshUndoButtons() {
    undoBtn.disabled = !undoStack.length;
    redoBtn.disabled = !redoStack.length;
  }
  refreshUndoButtons();

  window.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  });

  /* --------------------------------------------------------- duplicate ---- */
  // Deep-copy a block tree (chain + mouths + plugged inputs) with fresh ids.
  function duplicateTree(srcId) {
    const ids = treeIds(srcId);
    const map = {};
    ids.forEach((oid) => { map[oid] = CtrlCreate.uid("d"); });
    ids.forEach((oid) => {
      const b = JSON.parse(JSON.stringify(cur().blocks[oid]));
      b.id = map[oid];
      b.next = map[b.next] || null;
      b.substack = map[b.substack] || null;
      b.substack2 = map[b.substack2] || null;
      for (const n in b.inputs) {
        if (b.inputs[n].kind === "block" && b.inputs[n].block) {
          b.inputs[n].block = map[b.inputs[n].block] || null;
        }
      }
      cur().blocks[b.id] = b;
    });
    return map[srcId];
  }

  /* ------------------------------------------------------------ render --- */
  const indicator = el("div", { class: "snap-indicator" });
  canvas.appendChild(indicator);

  function render() {
    canvas.querySelectorAll(".stack").forEach((n) => n.remove());
    cur().tops.forEach((topId) => {
      if (!get(topId)) return;
      const stackNode = CtrlCreate.render.stackEl(topId);
      attachDragHandlers(stackNode);
      canvas.appendChild(stackNode);
    });
    ws.classList.toggle("has-blocks", cur().tops.length > 0);
    scheduleSave();
  }

  function attachDragHandlers(stackNode) {
    stackNode.addEventListener("pointerdown", (e) => {
      const blkNode = e.target.closest(".blk");
      if (!blkNode) return;
      if (e.target.closest("input,select")) return; // editing, not dragging
      e.preventDefault();
      e.stopPropagation();
      const rect = blkNode.getBoundingClientRect(); // capture before re-render
      if (e.altKey) {
        // alt-drag = drag a COPY, original stays put
        pushUndo();
        const dupId = duplicateTree(blkNode.dataset.id);
        CtrlCreate.track("blocks:added", { opcode: cur().blocks[dupId].opcode, category: cur().blocks[dupId].category });
        startDrag(dupId, e, true, rect);
      } else {
        beginWorkspaceDrag(blkNode.dataset.id, e, rect);
      }
    });
    // right-click a block -> duplicate its chain next to the original
    stackNode.addEventListener("contextmenu", (e) => {
      const blkNode = e.target.closest(".blk");
      if (!blkNode) return;
      e.preventDefault();
      pushUndo();
      const dupId = duplicateTree(blkNode.dataset.id);
      const b = cur().blocks[dupId];
      const cr = canvas.getBoundingClientRect();
      const br = blkNode.getBoundingClientRect();
      b.x = clamp(br.left - cr.left + 26, 0, 1900);
      b.y = clamp(br.top - cr.top + 26, 0, 1900);
      cur().tops.push(dupId);
      CtrlCreate.track("blocks:added", { opcode: b.opcode, category: b.category });
      render();
    });
  }

  /* ------------------------------------------------------------- drag ---- */
  let drag = null; // {headId, ghost, dx, dy, fromPalette, valueShape}

  function beginPaletteDrag(def, e, grabRect) {
    pushUndo();
    const b = CtrlCreate.makeBlock(def);
    cur().blocks[b.id] = b;
    startDrag(b.id, e, true, grabRect);
    CtrlCreate.track("blocks:added", { opcode: def.opcode, category: def.category });
  }

  // Keyboard-friendly alternative to dragging: add a block as a free stack.
  function addBlock(def) {
    if (!def) return null;
    pushUndo();
    const b = CtrlCreate.makeBlock(def);
    const n = cur().tops.length;
    b.x = 70 + (n % 4) * 34;
    b.y = 70 + (n % 8) * 46;
    cur().blocks[b.id] = b;
    cur().tops.push(b.id);
    CtrlCreate.track("blocks:added", { opcode: def.opcode, category: def.category, method: "keyboard" });
    render();
    return b.id;
  }

  function cleanUp() {
    pushUndo();
    cur().tops.forEach((id, i) => {
      const b = get(id); if (!b) return;
      b.x = 60 + (i % 3) * 260;
      b.y = 70 + Math.floor(i / 3) * 220;
    });
    render();
  }

  function analyze(spriteId) {
    const sc = bucket(spriteId || currentSprite);
    const stacks = sc.tops.map((topId) => {
      const ids = [];
      let b = sc.blocks[topId];
      while (b) { ids.push(b.id); b = b.next ? sc.blocks[b.next] : null; }
      return { topId, opcodes: ids.map((id) => sc.blocks[id].opcode), length: ids.length };
    });
    return { stacks, blockCount: Object.keys(sc.blocks).length };
  }

  function beginWorkspaceDrag(blockId, e, grabRect) {
    pushUndo();
    detach(blockId);
    render(); // re-render without the dragged chain
    startDrag(blockId, e, false, grabRect);
  }

  function startDrag(headId, e, fromPalette, grabRect) {
    // a drag is somehow still live (missed pointerup) -> park it as a free stack
    if (drag) {
      const stale = drag; drag = null;
      window.removeEventListener("pointermove", onMove);
      stale.ghost.remove();
      if (get(stale.headId)) {
        const b = get(stale.headId);
        b.x = 60; b.y = 60;
        cur().tops.push(stale.headId);
      }
    }
    const head = get(headId);
    const ghost = el("div", { class: "stack dragging" });
    ghost.style.position = "fixed";
    ghost.appendChild(CtrlCreate.render.chainEl(headId));
    document.body.appendChild(ghost);

    // grab offset = where inside the block the pointer landed, so the ghost
    // sticks to the hand and a plain click drops the block back in place
    let dx = 20, dy = 14;
    if (grabRect) {
      dx = clamp(e.clientX - grabRect.left, 0, Math.max(20, grabRect.width - 4));
      dy = clamp(e.clientY - grabRect.top, 0, Math.max(14, grabRect.height - 4));
    }

    drag = {
      headId, ghost, fromPalette,
      valueShape: !!VALUE[head.shape],
      dx, dy,
      target: null, slotNode: null,
    };
    moveGhost(e);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function moveGhost(e) {
    drag.ghost.style.left = (e.clientX - drag.dx) + "px";
    drag.ghost.style.top = (e.clientY - drag.dy) + "px";
  }

  function onMove(e) {
    if (!drag) return;
    moveGhost(e);

    // trash proximity
    const tr = trash.getBoundingClientRect();
    const overTrash = e.clientX > tr.left - 14 && e.clientX < tr.right + 14 &&
                      e.clientY > tr.top - 14 && e.clientY < tr.bottom + 14;
    trash.classList.toggle("hot", overTrash);

    clearSlotGlow();
    indicator.classList.remove("on");
    drag.target = null; drag.slotNode = null;
    if (overTrash) { drag.overTrash = true; return; }
    drag.overTrash = false;

    if (drag.valueShape) hoverValueTarget(e);
    else hoverStackTarget(e);
  }

  /* value blocks hover input slots */
  function hoverValueTarget(e) {
    const head = get(drag.headId);
    const isBool = head.shape === "boolean";
    const sel = isBool ? ".blk-in, .blk-slot" : ".blk-in";
    let best = null, bestD = 40;
    canvas.querySelectorAll(sel).forEach((node) => {
      if (node.closest(".dragging")) return;
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (d < bestD) { bestD = d; best = node; }
    });
    if (best) {
      best.classList.add(best.classList.contains("blk-slot") ? "slot-glow-hex" : "slot-glow");
      drag.slotNode = best;
    }
  }

  /* stack chains hover connection points */
  function hoverStackTarget(e) {
    const head = get(drag.headId);
    if (VALUE[head.shape]) return;
    const canvasRect = canvas.getBoundingClientRect();
    let best = null, bestD = SNAP;

    canvas.querySelectorAll(".blk").forEach((node) => {
      const id = node.dataset.id;
      const b = get(id);
      if (!b || !STACKABLE[b.shape]) return;
      if (node.closest(".slot-host")) return;
      const r = node.getBoundingClientRect();

      // connect BELOW this block (only if this block can have a next, and head isn't a hat)
      if (b.shape !== "cap" && head.shape !== "hat") {
        // for C-blocks the "below" point is the bottom of the whole element
        const d = Math.hypot(e.clientX - drag.dx - r.left, e.clientY - drag.dy - r.bottom);
        if (d < bestD) { bestD = d; best = { type: "after", id, x: r.left, y: r.bottom }; }
      }
      // connect INTO an empty-ish mouth
      if (b.shape === "c" || b.shape === "c2") {
        node.querySelectorAll(":scope > .blk-mouth").forEach((m) => {
          if (m.dataset.owner !== id) return;
          const mr = m.getBoundingClientRect();
          if (head.shape === "hat") return;
          const d = Math.hypot(e.clientX - drag.dx - (mr.left + 16), e.clientY - drag.dy - (mr.top + 4));
          if (d < bestD) { bestD = d; best = { type: m.dataset.mouth, id, x: mr.left + 16, y: mr.top + 2 }; }
        });
      }
    });

    // connect ABOVE a top-level stack (dragged tail adopts it) — not for cap tails
    cur().tops.forEach((topId) => {
      const t = get(topId);
      if (!t || t.shape === "hat") { /* can still go above? no—hats have no top notch */ }
      const node = canvas.querySelector('.blk[data-id="' + topId + '"]');
      if (!node || !t || t.shape === "hat") return;
      const tail = tailOf(drag.headId);
      if (!tail || tail.shape === "cap") return;
      const r = node.getBoundingClientRect();
      const d = Math.hypot(e.clientX - drag.dx - r.left, e.clientY - drag.dy - r.top);
      if (d < bestD) { bestD = d; best = { type: "before", id: topId, x: r.left, y: r.top }; }
    });

    if (best) {
      drag.target = best;
      indicator.style.left = (best.x - canvasRect.left) + "px";
      indicator.style.top = (best.y - canvasRect.top - 4) + "px";
      indicator.classList.add("on");
    }
  }

  function clearSlotGlow() {
    canvas.querySelectorAll(".slot-glow").forEach((n) => n.classList.remove("slot-glow"));
    canvas.querySelectorAll(".slot-glow-hex").forEach((n) => n.classList.remove("slot-glow-hex"));
  }

  function onUp(e) {
    window.removeEventListener("pointermove", onMove);
    if (!drag) return;
    const d = drag; drag = null;
    d.ghost.remove();
    trash.classList.remove("hot");
    clearSlotGlow();
    indicator.classList.remove("on");

    const c = cur();
    const head = get(d.headId);
    if (!head) return;

    // 1) trash
    if (d.overTrash) { deleteTree(d.headId); render(); return; }

    // 2) plug a value block into a slot
    if (d.valueShape && d.slotNode) {
      const ownerNode = d.slotNode.closest(".blk");
      const owner = get(ownerNode && ownerNode.dataset.id);
      const name = d.slotNode.dataset.input;
      if (owner && name) {
        const prev = owner.inputs[name];
        owner.inputs[name] = {
          kind: "block", block: d.headId,
          savedLiteral: prev && prev.kind === "literal" ? { value: prev.value } : null,
        };
        CtrlCreate.track("blocks:connected", { stackLength: chainIds(stackTopOf(owner.id)).length });
        render(); return;
      }
    }

    // 3) snap connections
    if (d.target) {
      const t = d.target;
      if (t.type === "after") {
        const anchor = get(t.id);
        const oldNext = anchor.next;
        anchor.next = d.headId;
        if (oldNext) tailOf(d.headId).next = oldNext;
      } else if (t.type === "substack" || t.type === "substack2") {
        const owner = get(t.id);
        const oldSub = owner[t.type];
        owner[t.type] = d.headId;
        if (oldSub) tailOf(d.headId).next = oldSub;
      } else if (t.type === "before") {
        const oldTop = get(t.id);
        const i = c.tops.indexOf(t.id);
        if (i >= 0) c.tops.splice(i, 1);
        tailOf(d.headId).next = t.id;
        head.x = oldTop.x; head.y = Math.max(0, oldTop.y - 40);
        c.tops.push(d.headId);
      }
      CtrlCreate.track("blocks:connected", { stackLength: chainIds(stackTopOf(d.headId)).length });
      render(); return;
    }

    // 4) free placement in the workspace
    const wr = ws.getBoundingClientRect();
    const inside = e.clientX > wr.left && e.clientX < wr.right && e.clientY > wr.top && e.clientY < wr.bottom;
    if (inside) {
      const cr = canvas.getBoundingClientRect();
      head.x = clamp(e.clientX - cr.left - d.dx, 0, 1900);
      head.y = clamp(e.clientY - cr.top - d.dy, 0, 1900);
      c.tops.push(d.headId);
      render(); return;
    }

    // 5) dropped outside (e.g. back on palette) -> discard
    deleteTree(d.headId);
    render();
  }

  /* -------------------------------------------------------- persistence -- */
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 800);
  }

  function save() {
    try {
      const payload = {};
      for (const sid in sprites) payload[sid] = sprites[sid];
      localStorage.setItem("ctrlcreate.project.v1", JSON.stringify(payload));
      const count = Object.keys(cur().blocks).length;
      CtrlCreate.track("project:saved", { blockCount: count });
    } catch (err) { /* private mode etc. */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem("ctrlcreate.project.v1");
      if (!raw) return false;
      const payload = JSON.parse(raw);
      // remap every id to a fresh uid so the core counter can never collide
      for (const sid in payload) {
        const src = payload[sid];
        const map = {};
        for (const oldId in src.blocks) map[oldId] = CtrlCreate.uid("l");
        const nb = {};
        for (const oldId in src.blocks) {
          const b = JSON.parse(JSON.stringify(src.blocks[oldId]));
          b.id = map[oldId];
          b.next = map[b.next] || null;
          b.substack = map[b.substack] || null;
          b.substack2 = map[b.substack2] || null;
          b.parent = null;
          for (const n in b.inputs) {
            if (b.inputs[n].kind === "block" && b.inputs[n].block) {
              b.inputs[n].block = map[b.inputs[n].block] || null;
            }
          }
          nb[b.id] = b;
        }
        sprites[sid] = { blocks: nb, tops: (src.tops || []).map((t) => map[t]).filter(Boolean) };
      }
      return true;
    } catch (err) { return false; }
  }

  /* ------------------------------------------------------------- sprite -- */
  function setSprite(spriteId) {
    currentSprite = spriteId;
    render();
  }

  /* ------------------------------------------------------------- expose -- */
  CtrlCreate.workspace = {
    get blocks() { return cur().blocks; },
    get tops() { return cur().tops; },
    get currentSprite() { return currentSprite; },
    scriptsFor(spriteId) { return bucket(spriteId); },
    allSpriteIds() { return Object.keys(sprites); },
    beginPaletteDrag,
    addBlock,
    cleanUp,
    analyze,
    render,
    setSprite,
    save,
    load,
    undo,
    redo,
    _sprites: sprites,
  };

  load();
})();
