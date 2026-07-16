/* ============================================================================
 * CTRL+CREATE — blockRender.js
 * Turns block instances (core.js model) into papercut DOM.
 *
 * Exports on CtrlCreate.render:
 *   blockEl(block)        -> element for one block (recursive: inputs + mouths)
 *   chainEl(blockId)      -> element containing a block and its `next` chain
 *   stackEl(blockId)      -> positioned .stack wrapper for a TOP-LEVEL chain
 *   templateEl(def)       -> palette preview (inert inputs)
 *   refresh(blockId)      -> re-render the stack containing this block
 *
 * The workspace (workspace.js) owns the block store: CtrlCreate.workspace.blocks
 * ==========================================================================*/
(function () {
  "use strict";
  const { el } = CtrlCreate;

  const STACKABLE = { hat: 1, stack: 1, cap: 1, c: 1, c2: 1 };
  const VALUE = { reporter: 1, boolean: 1 };

  function store() { return CtrlCreate.workspace ? CtrlCreate.workspace.blocks : {}; }
  function get(id) { return id ? store()[id] : null; }

  /* ------------------------------------------- dynamic dropdown sources ---- */
  // Live option lists, resolved every render so new sprites/vars/messages
  // appear everywhere immediately.
  function spriteNames(excludeCurrent) {
    const st = CtrlCreate.stage;
    if (!st) return [];
    const curId = CtrlCreate.workspace ? CtrlCreate.workspace.currentSprite : null;
    const out = [];
    st.sprites.forEach((s) => {
      if (s.isClone) return;
      if (excludeCurrent && s.id === curId) return;
      if (out.indexOf(s.name) < 0) out.push(s.name);
    });
    return out;
  }
  function optionsFor(token) {
    const R = CtrlCreate.registry || { variables: [], messages: [] };
    switch (token) {
      case "VARS":
        return R.variables.map((v) => [v, v]).concat([["➕ new variable…", "__new__"]]);
      case "MESSAGES":
        return R.messages.map((m) => [m, m]).concat([["➕ new message…", "__new__"]]);
      case "TOUCH_TARGETS":
        return [["edge", "_edge_"], ["mouse-pointer", "_mouse_"]]
          .concat(spriteNames(true).map((n) => [n, n]));
      case "POINT_TARGETS":
        return [["mouse-pointer", "_mouse_"]]
          .concat(spriteNames(true).map((n) => [n, n]));
      case "BACKDROPS":
        return (CtrlCreate.stage && CtrlCreate.stage.backdropNames || ["meadow"]).map((b) => [b, b]);
      case "CLONE_TARGETS":
        return [["myself", "_myself_"]].concat(spriteNames(false).map((n) => [n, n]));
      default:
        return [];
    }
  }

  /* ---------------------------------------------------- input widgets ---- */
  function inputWidget(block, name, def, inert) {
    const arg = (def.args && def.args[name]) || { type: "number" };
    const slotState = block.inputs[name];

    // A value block is plugged into this slot -> render it nested
    if (slotState && slotState.kind === "block" && slotState.block && get(slotState.block)) {
      const host = el("span", { class: "slot-host", "data-input": name });
      host.appendChild(blockEl(get(slotState.block), inert));
      return host;
    }

    if (arg.type === "boolean" || arg.type === "reporter") {
      // empty hexagon slot awaiting a boolean/reporter
      return el("span", { class: "blk-slot", "data-input": name, "data-slot": "bool" });
    }

    if (arg.type === "dropdown") {
      const sel = el("select", { class: "blk-dd", "data-field": name });
      const dynamic = typeof arg.options === "string";
      const opts = dynamic ? optionsFor(arg.options) : (arg.options || []);
      const current = block.fields[name] != null ? block.fields[name] : arg.default;
      let seen = false;
      opts.forEach(([label, val]) => {
        if (val === current) seen = true;
        sel.appendChild(el("option", { value: val, text: label }));
      });
      // keep a stale value visible (e.g. a deleted sprite) instead of lying
      if (current != null && !seen) sel.appendChild(el("option", { value: current, text: String(current) }));
      sel.value = current;
      if (inert) { sel.tabIndex = -1; sel.style.pointerEvents = "none"; }
      else {
        sel.addEventListener("change", () => {
          if (sel.value === "__new__") {
            const kind = arg.options === "VARS" ? "variable" : "message";
            sel.value = current; // revert until the prompt settles
            CtrlCreate.textPrompt("Name your new " + kind, "").then((v) => {
              if (!v) return;
              const list = arg.options === "VARS" ? CtrlCreate.registry.variables : CtrlCreate.registry.messages;
              if (list.indexOf(v) < 0) list.push(v);
              block.fields[name] = v;
              CtrlCreate.emit("registry:changed", {});
              CtrlCreate.workspace.render();
              if (CtrlCreate.palette) CtrlCreate.palette.rebuild();
            });
            return;
          }
          block.fields[name] = sel.value;
          CtrlCreate.track("blocks:edited", { opcode: block.opcode });
        });
        sel.addEventListener("pointerdown", (e) => e.stopPropagation());
      }
      return sel;
    }

    if (arg.type === "color") {
      const inp = el("input", { class: "blk-in", type: "color", "data-input": name });
      inp.value = (slotState && slotState.value) || arg.default || "#ff2b2b";
      if (inert) { inp.tabIndex = -1; inp.style.pointerEvents = "none"; }
      else {
        inp.addEventListener("input", () => { block.inputs[name].value = inp.value; });
        inp.addEventListener("pointerdown", (e) => e.stopPropagation());
      }
      return inp;
    }

    // number / text / angle -> oval text input (can also accept dropped reporters)
    const isText = arg.type === "text";
    const inp = el("input", {
      class: "blk-in", type: "text", "data-input": name, "data-kind": isText ? "text" : "num",
      spellcheck: "false", autocomplete: "off",
    });
    inp.value = slotState && slotState.value != null ? slotState.value : (arg.default != null ? arg.default : "");
    sizeInput(inp);
    if (inert) { inp.readOnly = true; inp.tabIndex = -1; inp.style.pointerEvents = "none"; }
    else {
      inp.addEventListener("input", () => {
        block.inputs[name].value = inp.value;
        sizeInput(inp);
      });
      inp.addEventListener("change", () => CtrlCreate.track("blocks:edited", { opcode: block.opcode }));
      inp.addEventListener("pointerdown", (e) => e.stopPropagation());
    }
    return inp;
  }

  function sizeInput(inp) {
    const len = String(inp.value || "").length;
    inp.style.width = Math.max(34, Math.min(120, 20 + len * 8)) + "px";
  }

  /* ------------------------------------------------------- block body ---- */
  function rowEl(block, def, inert) {
    const row = el("div", { class: "blk-row" });
    def.tokens.forEach((t) => {
      if (t.type === "label") row.appendChild(el("span", { class: "blk-label", text: t.text }));
      else row.appendChild(inputWidget(block, t.name, def, inert));
    });
    return row;
  }

  function blockEl(block, inert) {
    const def = CtrlCreate.defs[block.opcode];
    if (!def) return el("div", { class: "blk", text: "?" + block.opcode });

    const node = el("div", {
      class: "blk shape-" + block.shape + " cat-" + block.category,
      "data-id": block.id,
      style: { "--blk": def.color, "--blk-edge": def.edge },
    });

    node.appendChild(rowEl(block, def, inert));

    if (block.shape === "c" || block.shape === "c2") {
      node.appendChild(mouthEl(block, "substack", inert));
      if (block.shape === "c2") {
        node.appendChild(el("div", { class: "blk-mid", text: "else" }));
        node.appendChild(mouthEl(block, "substack2", inert));
      }
      const foot = el("div", { class: "blk-foot" });
      if (block.shape !== "cap") foot.appendChild(el("i", { class: "blk-tab" }));
      node.appendChild(foot);
    } else if (STACKABLE[block.shape] && block.shape !== "cap") {
      node.appendChild(el("i", { class: "blk-tab" }));
    }
    return node;
  }

  function mouthEl(block, sub, inert) {
    const mouth = el("div", {
      class: "blk-mouth", "data-mouth": sub, "data-owner": block.id,
      style: { "--blk": CtrlCreate.defs[block.opcode].color, "--blk-edge": CtrlCreate.defs[block.opcode].edge },
    });
    const inner = el("div", { class: "chain stack-inner" });
    let cur = get(block[sub]);
    while (cur) { inner.appendChild(blockEl(cur, inert)); cur = get(cur.next); }
    mouth.appendChild(inner);
    return mouth;
  }

  /* ------------------------------------------------- chains and stacks --- */
  function chainEl(blockId, inert) {
    const wrap = el("div", { class: "chain" });
    let cur = get(blockId);
    while (cur) { wrap.appendChild(blockEl(cur, inert)); cur = get(cur.next); }
    return wrap;
  }

  function stackEl(blockId) {
    const b = get(blockId);
    const wrap = el("div", { class: "stack", "data-top": blockId });
    wrap.style.left = (b ? b.x : 0) + "px";
    wrap.style.top = (b ? b.y : 0) + "px";
    if (b && VALUE[b.shape]) wrap.classList.add("stack-value");
    wrap.appendChild(chainEl(blockId));
    return wrap;
  }

  /* --------------------------------------------------- palette preview --- */
  function templateEl(def) {
    // ephemeral instance just for display
    const tmp = CtrlCreate.makeBlock(def);
    const holder = el("div", { class: "palette-block", "data-opcode": def.opcode, title: def.help || "" });
    // template blocks render inert (inputs display-only)
    const saveWs = CtrlCreate.workspace;
    holder.appendChild(blockElInert(tmp, def));
    return holder;

    function blockElInert(b) { return blockEl(b, true); }
  }

  CtrlCreate.render = { blockEl, chainEl, stackEl, templateEl };
})();
