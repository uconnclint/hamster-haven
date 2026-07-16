// ui.js — all 2D UI for Hamster Haven. Builds its own DOM inside #ui-root.
// Vanilla DOM only, no frameworks.
import { EMOTES, HAMSTER_COLORS } from './config.js';

const LS_NAME = 'hh_name';
const LS_COLOR = 'hh_color';

// ---- small DOM helpers -----------------------------------------------------
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'style') n.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') {
      n.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v != null) n.setAttribute(k, v);
  }
  const arr = Array.isArray(kids) ? kids : [kids];
  for (const c of arr) {
    if (c == null) continue;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// ---- art assets ------------------------------------------------------------
const A = 'assets/';
function img(src, cls, alt = '') {
  // src may be a bare asset name ("icon-seed.png") or a full path ("assets/x.png")
  const url = src.includes('/') ? src : A + src;
  return el('img', { class: cls, src: url, alt, draggable: 'false' });
}
// True when a value is an image path rather than an emoji glyph.
const isPath = (s) => typeof s === 'string' && (s.endsWith('.png') || s.includes('/'));

// ---- module state ----------------------------------------------------------
const S = {
  cb: {},
  root: null,
  // screens
  menu: null,
  connecting: null,
  hud: null,
  // menu widgets
  nameInput: null,
  codeInput: null,
  swatches: [],
  colorName: null,
  menuError: null,
  // hud widgets
  codeChip: null,
  seedEl: null,
  playerList: null,
  hintEl: null,
  emoteHint: null,
  toastWrap: null,
  buildBar: null,
  buildItems: [],
  buildHelp: null,
  musicBtn: null,
  codeBtn: null,
  // values
  name: 'Hamster',
  colorIndex: 0,
  inGame: false,
  musicOn: false,
};

// ---------------------------------------------------------------------------
export const ui = {
  init(cb) {
    S.cb = cb || {};
    S.root = document.getElementById('ui-root');
    if (!S.root) {
      S.root = el('div', { id: 'ui-root' });
      document.body.appendChild(S.root);
    }
    // load persisted prefs
    try {
      const n = localStorage.getItem(LS_NAME);
      if (n) S.name = n;
      const c = parseInt(localStorage.getItem(LS_COLOR), 10);
      if (!isNaN(c) && c >= 0 && c < HAMSTER_COLORS.length) S.colorIndex = c;
    } catch (e) { /* ignore */ }

    buildHud();
    buildMenu();
    buildConnecting();
    this.showMenu();
  },

  showMenu(err) {
    S.inGame = false;
    hide(S.hud);
    hide(S.connecting);
    show(S.menu);
    // sync fields to state
    S.nameInput.value = S.name;
    setColor(S.colorIndex);
    if (err) {
      S.menuError.textContent = err;
      S.menuError.classList.add('show');
    } else {
      S.menuError.textContent = '';
      S.menuError.classList.remove('show');
    }
  },

  showConnecting() {
    S.inGame = false;
    hide(S.menu);
    hide(S.hud);
    show(S.connecting);
  },

  showHUD(roomCode) {
    S.inGame = true;
    hide(S.menu);
    hide(S.connecting);
    show(S.hud);
    const code = String(roomCode || '').toUpperCase();
    S.codeChip.querySelector('.hh-code-value').textContent = code;
    S.codeChip.dataset.code = code;
  },

  setSeeds(carrying, banked, maxCarry) {
    const cur = S.seedEl.querySelector('.hh-seed-carry');
    const bank = S.seedEl.querySelector('.hh-seed-bank');
    cur.textContent = maxCarry != null ? `${carrying}/${maxCarry}` : `${carrying}`;
    bank.textContent = `${banked}`;
    // pop animation
    S.seedEl.classList.remove('pop');
    void S.seedEl.offsetWidth;
    S.seedEl.classList.add('pop');
  },

  setPlayers(list) {
    const arr = (list || []).slice().sort((a, b) => (b.banked || 0) - (a.banked || 0));
    S.playerList.innerHTML = '';
    S.playerList.appendChild(el('div', { class: 'hh-pl-title' }, [
      img('icon-trophy.png', 'hh-pl-trophy'),
      el('span', { text: 'Havenmates' }),
    ]));
    for (const p of arr) {
      const col = HAMSTER_COLORS[(p.colorIndex || 0) % HAMSTER_COLORS.length];
      const row = el('div', { class: 'hh-pl-row' + (p.you ? ' you' : '') }, [
        el('span', { class: 'hh-pl-dot', style: `background:${hex(col.body)}` }),
        el('span', { class: 'hh-pl-name', text: p.name || 'Hamster' }),
        el('span', { class: 'hh-pl-score' }, [
          img('icon-seed.png', 'hh-pl-seed'),
          el('span', { text: `${p.banked || 0}` }),
        ]),
      ]);
      S.playerList.appendChild(row);
    }
  },

  toast(msg) {
    const t = el('div', { class: 'hh-toast', text: msg });
    S.toastWrap.appendChild(t);
    // trigger enter
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => {
      t.classList.remove('in');
      t.classList.add('out');
      setTimeout(() => t.remove(), 350);
    }, 2500);
  },

  showBuildBar(items, sel) {
    S.buildItems = [];
    const slots = S.buildBar.querySelector('.hh-build-slots');
    slots.innerHTML = '';
    (items || []).forEach((it, i) => {
      const slot = el('button', {
        class: 'hh-build-slot',
        type: 'button',
        title: it.name || '',
        onclick: () => {
          setBuildSel(i);
          if (S.cb.onSelectPart) S.cb.onSelectPart(i);
        },
      }, [
        isPath(it.icon)
          ? img(it.icon, 'hh-build-icon hh-build-img')
          : el('span', { class: 'hh-build-icon', text: it.icon || '📦' }),
        el('span', { class: 'hh-build-key', text: String(i + 1) }),
        el('span', { class: 'hh-build-name', text: it.name || '' }),
      ]);
      slots.appendChild(slot);
      S.buildItems.push(slot);
    });
    setBuildSel(sel || 0);
    show(S.buildBar);
    // hide emote hint while building
    hide(S.emoteHint);
  },

  hideBuildBar() {
    hide(S.buildBar);
  },

  setBuildSelected(i) {
    setBuildSel(i);
  },

  showEmoteHint() {
    S.emoteHint.innerHTML = '';
    EMOTES.forEach((e, i) => {
      S.emoteHint.appendChild(el('button', {
        class: 'hh-emote', type: 'button', title: 'Emote',
        onclick: () => { if (S.cb.onEmote) S.cb.onEmote(i); },
      }, [
        el('span', { class: 'hh-emote-key', text: String(i + 1) }),
        isPath(e)
          ? img(e, 'hh-emote-face hh-emote-img')
          : el('span', { class: 'hh-emote-face', text: e }),
      ]));
    });
    // only when not building
    if (S.buildBar.classList.contains('hh-hidden')) show(S.emoteHint);
  },

  hint(text) {
    if (!text) { hide(S.hintEl); return; }
    S.hintEl.innerHTML = '';
    S.hintEl.appendChild(el('span', { class: 'hh-hint-text', text }));
    show(S.hintEl);
  },
};

// ---- visibility helpers ----------------------------------------------------
function show(n) { if (n) n.classList.remove('hh-hidden'); }
function hide(n) { if (n) n.classList.add('hh-hidden'); }

// ---- color picker ----------------------------------------------------------
function setColor(i) {
  S.colorIndex = i;
  S.swatches.forEach((sw, idx) => sw.classList.toggle('sel', idx === i));
  if (S.colorName) S.colorName.textContent = HAMSTER_COLORS[i].name;
  try { localStorage.setItem(LS_COLOR, String(i)); } catch (e) { /* ignore */ }
}

// ---- build selection -------------------------------------------------------
function setBuildSel(i) {
  S.buildItems.forEach((s, idx) => s.classList.toggle('sel', idx === i));
}

// ---- menu ------------------------------------------------------------------
function buildMenu() {
  const title = el('div', { class: 'hh-title' }, [
    el('div', { class: 'hh-title-emoji' }, [img('mascot.png', 'hh-mascot-img')]),
    wordmark('Hamster Haven'),
    el('div', { class: 'hh-subtitle', text: 'a cozy burrow to share with friends' }),
  ]);

  // name
  S.nameInput = el('input', {
    class: 'hh-input', type: 'text', maxlength: '16',
    placeholder: 'Hamster', value: S.name, spellcheck: 'false',
  });
  S.nameInput.addEventListener('input', () => {
    S.name = S.nameInput.value.trim() || 'Hamster';
  });
  const nameField = el('label', { class: 'hh-field' }, [
    el('span', { class: 'hh-label', text: 'Your name' }),
    S.nameInput,
  ]);

  // color picker
  S.swatches = [];
  const swatchRow = el('div', { class: 'hh-swatches' });
  HAMSTER_COLORS.forEach((c, i) => {
    const sw = el('button', {
      class: 'hh-swatch', type: 'button', title: c.name,
      style: `--body:${hex(c.body)};--belly:${hex(c.belly)}`,
      onclick: () => setColor(i),
    });
    S.swatches.push(sw);
    swatchRow.appendChild(sw);
  });
  S.colorName = el('span', { class: 'hh-color-name', text: HAMSTER_COLORS[S.colorIndex].name });
  const colorField = el('div', { class: 'hh-field' }, [
    el('span', { class: 'hh-label' }, [
      document.createTextNode('Pick your hamster '),
      S.colorName,
    ]),
    swatchRow,
  ]);
  // fix: colorName is inside label already appended; adjust text label
  colorField.querySelector('.hh-label').firstChild.textContent = 'Fur color — ';

  // create button
  const createBtn = el('button', {
    class: 'hh-btn hh-btn-primary', type: 'button',
    onclick: () => doPlay('create'),
  }, [el('span', { text: 'Create World' })]);

  // join
  S.codeInput = el('input', {
    class: 'hh-input hh-code-input', type: 'text', maxlength: '5',
    placeholder: 'ABCDE', spellcheck: 'false', autocapitalize: 'characters',
  });
  S.codeInput.addEventListener('input', () => {
    let v = S.codeInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
    S.codeInput.value = v;
  });
  S.codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doPlay('join'); }
  });
  const joinBtn = el('button', {
    class: 'hh-btn hh-btn-secondary', type: 'button',
    onclick: () => doPlay('join'),
  }, [el('span', { text: 'Join' })]);
  const joinRow = el('div', { class: 'hh-join-row' }, [S.codeInput, joinBtn]);
  const joinField = el('div', { class: 'hh-field' }, [
    el('span', { class: 'hh-label', text: 'Have a code? Join a burrow' }),
    joinRow,
  ]);

  S.menuError = el('div', { class: 'hh-error' });

  const card = el('div', { class: 'hh-card' }, [
    nameField,
    colorField,
    createBtn,
    el('div', { class: 'hh-or', html: '<span>or</span>' }),
    joinField,
    S.menuError,
  ]);

  const deco = el('div', { class: 'hh-deco' });
  const bits = ['deco-seed.png', 'deco-paw.png', 'deco-seed.png', 'deco-acorn.png',
                'deco-paw.png', 'deco-seed.png', 'deco-acorn.png', 'deco-paw.png'];
  bits.forEach((b, i) => {
    const f = el('span', {
      class: 'hh-float f' + (i % 4),
      style: `left:${(i * 12 + 6) % 96}%;animation-delay:${(i * 0.9).toFixed(1)}s`,
    }, [img(b, 'hh-float-img')]);
    deco.appendChild(f);
  });

  S.menu = el('div', { class: 'hh-screen hh-menu hh-hidden' }, [deco, title, card]);
  S.root.appendChild(S.menu);
}

function wordmark(txt) {
  const w = el('div', { class: 'hh-wordmark' });
  [...txt].forEach((ch, i) => {
    if (ch === ' ') { w.appendChild(el('span', { class: 'hh-space', text: ' ' })); return; }
    w.appendChild(el('span', {
      class: 'hh-letter',
      style: `animation-delay:${(i * 0.06).toFixed(2)}s`,
      text: ch,
    }));
  });
  return w;
}

function doPlay(mode) {
  const name = (S.nameInput.value || '').trim() || 'Hamster';
  S.name = name;
  try { localStorage.setItem(LS_NAME, name); } catch (e) { /* ignore */ }
  try { localStorage.setItem(LS_COLOR, String(S.colorIndex)); } catch (e) { /* ignore */ }
  if (mode === 'join') {
    const code = (S.codeInput.value || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 5) {
      S.menuError.textContent = 'Enter a 5-letter room code';
      S.menuError.classList.add('show');
      S.codeInput.classList.remove('shake'); void S.codeInput.offsetWidth;
      S.codeInput.classList.add('shake');
      return;
    }
    if (S.cb.onPlay) S.cb.onPlay({ mode: 'join', code, name, colorIndex: S.colorIndex });
  } else {
    if (S.cb.onPlay) S.cb.onPlay({ mode: 'create', code: null, name, colorIndex: S.colorIndex });
  }
}

// ---- connecting ------------------------------------------------------------
function buildConnecting() {
  S.connecting = el('div', { class: 'hh-screen hh-connecting hh-hidden' }, [
    el('div', { class: 'hh-deco' }),
    el('div', { class: 'hh-connect-card' }, [
      el('div', { class: 'hh-spinner' }, [img('mascot.png', 'hh-spinner-img')]),
      el('div', { class: 'hh-connect-text', text: 'Scurrying to your burrow…' }),
    ]),
  ]);
  S.root.appendChild(S.connecting);
}

// ---- HUD -------------------------------------------------------------------
function buildHud() {
  // room code chip (click to copy)
  S.codeChip = el('button', {
    class: 'hh-chip hh-code-chip', type: 'button', title: 'Click to copy room code',
    onclick: copyCode,
  }, [
    el('span', { class: 'hh-code-label', text: 'ROOM' }),
    el('span', { class: 'hh-code-value', text: '—' }),
    img('icon-copy.png', 'hh-code-copy'),
  ]);

  // seeds
  S.seedEl = el('div', { class: 'hh-chip hh-seeds' }, [
    img('icon-seed.png', 'hh-seed-icon'),
    el('span', { class: 'hh-seed-carry', text: '0' }),
    el('span', { class: 'hh-seed-sep', text: 'carrying' }),
    el('span', { class: 'hh-seed-bank', text: '0' }),
    el('span', { class: 'hh-seed-sep2', text: 'banked' }),
  ]);

  // music toggle
  S.musicBtn = el('button', {
    class: 'hh-chip hh-music', type: 'button', title: 'Toggle music',
    onclick: () => {
      S.musicOn = !S.musicOn;
      S.musicBtn.classList.toggle('on', S.musicOn);
      S.musicBtn.querySelector('.hh-music-icon').src =
        A + (S.musicOn ? 'icon-music-on.png' : 'icon-music-off.png');
      if (S.cb.onToggleMusic) S.cb.onToggleMusic(S.musicOn);
    },
  }, [img('icon-music-off.png', 'hh-music-icon')]);

  // Coding Mode toggle
  S.codeBtn = el('button', {
    class: 'hh-chip hh-code-mode', type: 'button', title: 'Teach the robot hamster (Coding Mode)',
    style: 'font-weight:800;letter-spacing:.02em;',
    onclick: () => { if (S.cb.onCode) S.cb.onCode(); },
  }, [
    el('span', { class: 'hh-code-mode-icon', text: '{ }', style: 'margin-right:5px;font-weight:900;' }),
    el('span', { text: 'Code' }),
  ]);

  const topLeft = el('div', { class: 'hh-topleft' }, [S.codeChip, S.seedEl, S.musicBtn, S.codeBtn]);

  // player list top-right
  S.playerList = el('div', { class: 'hh-players' });
  const topRight = el('div', { class: 'hh-topright' }, [S.playerList]);

  // toasts top-center
  S.toastWrap = el('div', { class: 'hh-toasts' });

  // hint line bottom-center
  S.hintEl = el('div', { class: 'hh-hint hh-hidden' });

  // emote hint bottom-center (above hint)
  S.emoteHint = el('div', { class: 'hh-emotes hh-hidden' });

  // build bar bottom-center
  S.buildHelp = el('div', { class: 'hh-build-help', text: 'Point & click to place  •  R rotate  •  1–9 / Q/E pick part  •  X delete  •  B done' });
  S.buildBar = el('div', { class: 'hh-buildbar hh-hidden' }, [
    S.buildHelp,
    el('div', { class: 'hh-build-slots' }),
  ]);

  S.hud = el('div', { class: 'hh-hud hh-hidden' }, [
    topLeft, topRight, S.toastWrap, S.emoteHint, S.hintEl, S.buildBar,
  ]);
  S.root.appendChild(S.hud);
}

function copyCode() {
  const code = S.codeChip.dataset.code || S.codeChip.querySelector('.hh-code-value').textContent;
  const done = () => { ui.toast('Room code copied!'); S.codeChip.classList.remove('copied'); void S.codeChip.offsetWidth; S.codeChip.classList.add('copied'); };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, () => fallbackCopy(code, done));
    } else fallbackCopy(code, done);
  } catch (e) { fallbackCopy(code, done); }
}
function fallbackCopy(text, done) {
  try {
    const ta = el('textarea', { style: 'position:fixed;opacity:0;pointer-events:none;' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  } catch (e) { ui.toast('Room code: ' + text); }
}

