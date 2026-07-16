/* ============================================================================
 * CTRL+CREATE — core.js
 * The shared spine every module hangs off of.
 *  - global `CtrlCreate` namespace
 *  - event bus (achievements/levels listen here)
 *  - block instance data model + factory
 *  - tiny helpers (uid, clamp, dom)
 * No module may redefine these; they only read/extend `CtrlCreate.api`.
 * ==========================================================================*/
(function () {
  "use strict";

  // ---- rename migration ----------------------------------------------------
  // The product was renamed from "Scratchy" to "Ctrl+Create". Copy any saved
  // data under the old localStorage prefix to the new one, once, so existing
  // projects / progress / settings carry over. Runs before any module reads
  // its keys (core.js loads first). Idempotent and failure-safe.
  (function migrateStorage() {
    try {
      var oldPrefix = "scratchy.";
      var newPrefix = "ctrlcreate.";
      var stale = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.lastIndexOf(oldPrefix, 0) === 0) stale.push(k);
      }
      stale.forEach(function (k) {
        var nk = newPrefix + k.slice(oldPrefix.length);
        if (localStorage.getItem(nk) === null) localStorage.setItem(nk, localStorage.getItem(k));
        localStorage.removeItem(k);
      });
    } catch (e) { /* private mode / disabled storage — nothing to migrate */ }
  })();

  // ---- deterministic-ish id generator (no Date.now/Math.random dependency) --
  let _counter = 0;
  function uid(prefix) {
    _counter += 1;
    return (prefix || "b") + "_" + _counter.toString(36) + "_" + (_counter * 2654435761 % 0xffffff).toString(36);
  }

  // ---- event bus -----------------------------------------------------------
  const bus = new EventTarget();
  function emit(name, detail) {
    bus.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }
  function on(name, fn) {
    bus.addEventListener(name, fn);
    return () => bus.removeEventListener(name, fn);
  }

  // ---- dom helper ----------------------------------------------------------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") node.className = attrs[k];
        else if (k === "style" && typeof attrs[k] === "object") {
          for (const p in attrs[k]) {
            if (p.startsWith("--")) node.style.setProperty(p, attrs[k][p]);
            else node.style[p] = attrs[k][p];
          }
        }
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function") node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---- frame scheduler ------------------------------------------------------
  // rAF when the browser grants it, setTimeout fallback when rAF is throttled
  // (background tabs, embedded webviews). Guarantees ~25fps minimum.
  function nextTick(cb) {
    let done = false;
    const fire = () => { if (!done) { done = true; cb(); } };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(fire);
    setTimeout(fire, 40);
  }

  // ---- block instance model ------------------------------------------------
  // A *definition* (from blockDefs.js) is the template.
  // A *block* is a live instance placed in a script.
  //
  //   {
  //     id, opcode, category, shape,
  //     inputs: { NAME: { kind:'literal'|'block', value, block } },
  //     fields: { NAME: value },                 // dropdown / static choices
  //     next: blockId|null,                       // stack block below
  //     substack: blockId|null,                   // inside a C-block
  //     substack2: blockId|null,                  // if/else second mouth
  //     parent: blockId|null,
  //     x, y                                       // only meaningful for top blocks
  //   }
  function makeBlock(def) {
    const b = {
      id: uid(def.opcode.split("_")[0]),
      opcode: def.opcode,
      category: def.category,
      shape: def.shape,
      inputs: {},
      fields: {},
      next: null,
      substack: null,
      substack2: null,
      parent: null,
      x: 0,
      y: 0,
    };
    (def.tokens || CtrlCreate.tokenize(def.text)).forEach((t) => {
      if (t.type === "input") {
        const a = (def.args && def.args[t.name]) || { type: "number", default: "" };
        if (a.type === "dropdown") {
          b.fields[t.name] = a.default != null ? a.default
            : (Array.isArray(a.options) && a.options[0] ? a.options[0][1] : "");
        } else if (a.type === "boolean" || a.type === "reporter") {
          b.inputs[t.name] = { kind: "block", block: null }; // empty slot
        } else {
          b.inputs[t.name] = { kind: "literal", value: a.default != null ? a.default : "" };
        }
      }
    });
    return b;
  }

  // Parse "move %STEPS steps" -> [{type:'label',text:'move'},{type:'input',name:'STEPS'},...]
  function tokenize(text) {
    const out = [];
    text.split(/(\s+)/).forEach((chunk) => {
      if (/^\s+$/.test(chunk) || chunk === "") return;
      const m = chunk.match(/^%([A-Z0-9_]+)$/);
      if (m) out.push({ type: "input", name: m[1] });
      else out.push({ type: "label", text: chunk });
    });
    return out;
  }

  // ---- project registry -----------------------------------------------------
  // User-created names that dropdowns resolve at render time. projectIO
  // persists this per project; blockRender adds "➕ new…" entries that append.
  const registry = {
    variables: ["score", "lives"],
    messages: ["message1", "start", "win", "lose"],
  };

  // ---- papercut text prompt --------------------------------------------------
  // window.prompt is blocked in embedded webviews, so we ship our own.
  // Resolves with the trimmed string, or null on cancel/escape.
  function textPrompt(title, initial) {
    return new Promise((resolve) => {
      const wrap = el("div", { style: {
        position: "fixed", inset: "0", zIndex: "600", display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "rgba(58,50,38,.45)",
      }});
      const inp = el("input", { type: "text", value: initial || "", maxlength: "24", style: {
        width: "100%", boxSizing: "border-box", marginTop: "10px", padding: "9px 10px",
        border: "1.5px solid #cbbfa5", borderRadius: "10px", font: "700 14px sans-serif",
        color: "#3a3226", outline: "none", background: "#fffdf7",
      }});
      const mkBtn = (label, bg, fn) => el("button", { text: label, onClick: fn, style: {
        flex: "1", padding: "9px 0", border: "none", borderRadius: "10px", cursor: "pointer",
        font: "800 13px sans-serif", color: "#fff", background: bg,
        boxShadow: "2px 3px 0 rgba(58,50,38,.3)",
      }});
      const done = (val) => { wrap.remove(); resolve(val); };
      const ok = () => {
        const v = inp.value.trim().slice(0, 24);
        v ? done(v) : inp.focus();
      };
      const card = el("div", { style: {
        background: "#fbf6ea", border: "2px solid #cbbfa5", borderRadius: "14px",
        padding: "16px 18px", width: "min(320px, 86vw)",
        boxShadow: "5px 7px 0 rgba(58,50,38,.3)", transform: "rotate(-0.4deg)",
      }}, [
        el("div", { text: title || "Name it", style: {
          font: "800 15px sans-serif", color: "#3a3226" } }),
        inp,
        el("div", { style: { display: "flex", gap: "8px", marginTop: "12px" } }, [
          mkBtn("Cancel", "#b5a98e", () => done(null)),
          mkBtn("OK ✂", "#59c059", ok),
        ]),
      ]);
      wrap.appendChild(card);
      wrap.addEventListener("pointerdown", (e) => { if (e.target === wrap) done(null); });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") ok();
        if (e.key === "Escape") done(null);
        e.stopPropagation();
      });
      document.body.appendChild(wrap);
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
    });
  }

  window.CtrlCreate = window.CtrlCreate || {};
  Object.assign(window.CtrlCreate, {
    version: "1.0.0",
    events: bus,
    emit,
    on,
    uid,
    el,
    clamp,
    nextTick,
    registry,
    textPrompt,
    tokenize,
    makeBlock,
    // filled in by later modules:
    defs: null,          // blockDefs.js sets this (catalog by opcode)
    categories: null,    // blockDefs.js sets this (ordered category meta)
    workspace: null,     // editor/workspace.js implements the live script store
    engine: null,        // engine/interpreter.js implements run/stop
    stage: null,         // engine/stage.js implements sprite rendering
    game: null,          // game/* implements achievements/levels/badges
    api: {},             // misc cross-module handles
    booted: false,
  });

  // Convenience: emit a namespaced telemetry event AND a generic one so the
  // game layer can subscribe broadly.
  CtrlCreate.track = function (name, detail) {
    emit(name, detail);
    emit("telemetry", { name, detail: detail || {} });
  };
})();
