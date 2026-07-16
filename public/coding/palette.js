/* ============================================================================
 * CTRL+CREATE — palette.js
 * Category rail + block palette. Selecting a category scrolls/renders its
 * templates; dragging a template hands off to workspace.beginPaletteDrag().
 * ==========================================================================*/
(function () {
  "use strict";
  const { el } = CtrlCreate;

  const rail = document.getElementById("cat-rail");
  const palette = document.getElementById("palette");
  let active = "events"; // scripts start with an event — so does the palette
  let query = "";

  function buildRail() {
    rail.innerHTML = "";
    CtrlCreate.categories.forEach((c) => {
      const btn = el("button", {
        class: "cat-btn" + (c.id === active ? " active" : ""),
        "data-cat": c.id,
        title: c.label + " blocks",
        onClick: () => select(c.id),
      }, [
        el("span", { class: "cat-dot" }, [
          el("img", { class: "cat-icon", src: "assets/icons/cat_" + c.id + ".png", alt: "", loading: "lazy",
            onError: function () { this.style.display = "none"; } }),
        ]),
        el("span", { class: "cat-name", text: c.label }),
      ]);
      btn.style.setProperty("--cat-color", c.color);
      rail.appendChild(btn);
    });
  }

  function buildPalette() {
    palette.innerHTML = "";
    const tools = el("div", { class: "palette-tools" });
    const search = el("input", {
      class: "palette-search", type: "search", placeholder: "Find a block…",
      value: query, "aria-label": "Search all blocks"
    });
    search.value = query;
    search.addEventListener("input", function () { query = search.value.trim().toLowerCase(); buildPalette(); });
    search.addEventListener("keydown", function (e) { if (e.key === "Escape") { query = ""; buildPalette(); } });
    tools.appendChild(search);
    palette.appendChild(tools);
    const defs = query
      ? CtrlCreate.defList.filter((d) => (d.text + " " + d.help + " " + d.opcode + " " + d.category).toLowerCase().includes(query))
      : CtrlCreate.defsByCategory(active);
    const cat = CtrlCreate.categories.find((c) => c.id === active);
    palette.appendChild(el("div", { class: "palette-sep", text: query ? (defs.length + " results") : cat.label }));
    defs.forEach((def) => {
      const holder = CtrlCreate.render.templateEl(def);
      holder.tabIndex = 0;
      holder.setAttribute("role", "button");
      holder.setAttribute("aria-label", (def.text || def.opcode).replace(/%[A-Z0-9_]+/g, "value") + ". Press Enter to add.");
      holder.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (CtrlCreate.workspace) {
          const blk = holder.querySelector(".blk");
          CtrlCreate.workspace.beginPaletteDrag(def, e, blk ? blk.getBoundingClientRect() : null);
        }
      });
      holder.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && CtrlCreate.workspace) {
          e.preventDefault(); CtrlCreate.workspace.addBlock(def);
        }
      });
      palette.appendChild(holder);
    });
    if (!defs.length) palette.appendChild(el("div", { class: "palette-empty", text: "No blocks match that search." }));
    if (query) { search.focus(); search.setSelectionRange(query.length, query.length); }
  }

  function select(catId) {
    if (active === catId) return;
    active = catId;
    rail.querySelectorAll(".cat-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.cat === catId));
    buildPalette();
    CtrlCreate.track("palette:category", { category: catId });
  }

  CtrlCreate.palette = { select, rebuild: buildPalette, get active() { return active; }, get query() { return query; } };

  // keep dynamic dropdowns (sprites / variables / messages) fresh
  CtrlCreate.on("registry:changed", buildPalette);
  CtrlCreate.on("sprite:selected", buildPalette);

  buildRail();
  buildPalette();
})();
