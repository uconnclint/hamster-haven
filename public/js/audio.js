// audio.js — Hamster Haven procedural audio
// 100% synthesized WebAudio. No assets, no imports.
// Cozy, soft, Nintendo-ish SFX + a very quiet generative ambient loop.
//
// export const audio = { init, play(name, opts), setMusicOn(on), setMasterVolume(v) }

let ctx = null;          // AudioContext (created lazily on first user gesture)
let master = null;       // master GainNode -> destination
let musicGain = null;    // sub-mix for ambient music (fades in/out)
let sfxGain = null;      // sub-mix for one-shot SFX

let masterVolume = 0.5;  // 0..1, default ~0.5
let musicOn = false;

// Per-name throttle so rapid repeats don't machine-gun / clip.
const lastPlayed = Object.create(null);
const THROTTLE_MS = 30;

// A shared noise buffer (white noise) reused by all noisy SFX.
let noiseBuffer = null;

// --- Music scheduler state -------------------------------------------------
let schedulerTimer = null;
let nextNoteTime = 0;    // absolute ctx time of the next scheduled beat
let step = 0;            // running 16th-ish step counter
const LOOKAHEAD_MS = 25;         // how often the scheduler wakes
const SCHEDULE_AHEAD = 0.15;     // how far ahead (s) we schedule audio
const BPM = 70;
const SECONDS_PER_BEAT = 60 / BPM;
const STEP_DUR = SECONDS_PER_BEAT / 2; // eighth-note grid

// I–vi–IV–V in C major, one chord per bar (4 beats = 8 steps each).
// Frequencies chosen in a warm mid octave.
const CHORDS = [
  // C major:  C4 E4 G4
  [261.63, 329.63, 392.0],
  // A minor:  A3 C4 E4
  [220.0, 261.63, 329.63],
  // F major:  F3 A3 C4
  [174.61, 220.0, 261.63],
  // G major:  G3 B3 D4
  [196.0, 246.94, 293.66],
];
// C major pentatonic for sparse plucks (a couple octaves up, twinkly).
const PENTA = [
  523.25, 587.33, 659.25, 783.99, 880.0,      // C5 D5 E5 G5 A5
  1046.5, 1174.66, 1318.51,                    // C6 D6 E6
];

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function isReady() {
  return ctx && ctx.state !== 'closed';
}

function now() {
  return ctx ? ctx.currentTime : 0;
}

function makeNoiseBuffer() {
  const len = Math.floor((ctx.sampleRate || 44100) * 1.0);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate || 44100);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Short-lived oscillator voice with its own gain + optional lowpass.
// Returns { osc, gain } already connected to `dest`.
function tone(type, freq, dest) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(dest || sfxGain);
  return { osc, g };
}

// Filtered white-noise burst helper.
function noiseVoice(dest) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  const g = ctx.createGain();
  src.connect(filt);
  filt.connect(g);
  g.connect(dest || sfxGain);
  return { src, filt, g };
}

// Simple ADSR-ish envelope: attack to peak, exponential-ish decay to ~0.
function env(param, t0, peak, attack, decay, sustain) {
  param.cancelScheduledValues(t0);
  param.setValueAtTime(0.0001, t0);
  param.linearRampToValueAtTime(peak, t0 + attack);
  const end = t0 + attack + decay;
  param.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), end);
  return end;
}

// ---------------------------------------------------------------------------
// SFX definitions — each returns nothing; all soft & short.
// opts may carry { pitch } multiplier for a little variety.
// ---------------------------------------------------------------------------

const SFX = {
  // Springy upward blip.
  jump(t, o) {
    const p = o.pitch || 1;
    const { osc, g } = tone('triangle', 300 * p, sfxGain);
    osc.frequency.setValueAtTime(300 * p, t);
    osc.frequency.exponentialRampToValueAtTime(620 * p, t + 0.11);
    env(g.gain, t, 0.22, 0.005, 0.14);
    osc.start(t); osc.stop(t + 0.18);
  },

  // Soft padded thud: low sine + tiny noise.
  land(t) {
    const { osc, g } = tone('sine', 180, sfxGain);
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    env(g.gain, t, 0.24, 0.004, 0.13);
    osc.start(t); osc.stop(t + 0.16);

    const n = noiseVoice(sfxGain);
    n.filt.frequency.value = 900;
    env(n.g.gain, t, 0.08, 0.002, 0.09);
    n.src.start(t); n.src.stop(t + 0.11);
  },

  // Whooshy filtered-noise sweep.
  dash(t) {
    const n = noiseVoice(sfxGain);
    n.filt.frequency.setValueAtTime(500, t);
    n.filt.frequency.exponentialRampToValueAtTime(3200, t + 0.12);
    n.filt.frequency.exponentialRampToValueAtTime(600, t + 0.24);
    n.filt.Q.value = 1.2;
    env(n.g.gain, t, 0.16, 0.02, 0.22);
    n.src.start(t); n.src.stop(t + 0.26);
  },

  // Bright two-note "ding" pickup.
  collect(t, o) {
    const p = o.pitch || 1;
    const a = tone('triangle', 880 * p, sfxGain);
    env(a.g.gain, t, 0.2, 0.004, 0.1);
    a.osc.start(t); a.osc.stop(t + 0.12);
    const b = tone('triangle', 1318.5 * p, sfxGain);
    env(b.g.gain, t + 0.07, 0.18, 0.004, 0.13);
    b.osc.start(t + 0.07); b.osc.stop(t + 0.22);
  },

  // Warm confirming triad plink (bank seeds).
  deposit(t) {
    const freqs = [392.0, 523.25, 659.25];
    freqs.forEach((f, i) => {
      const v = tone('triangle', f, sfxGain);
      const st = t + i * 0.05;
      env(v.g.gain, st, 0.16, 0.005, 0.18);
      v.osc.start(st); v.osc.stop(st + 0.24);
    });
  },

  // Soft wooden "tock" for placing a block.
  place(t) {
    const { osc, g } = tone('sine', 420, sfxGain);
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.07);
    env(g.gain, t, 0.2, 0.003, 0.08);
    osc.start(t); osc.stop(t + 0.11);
    const n = noiseVoice(sfxGain);
    n.filt.frequency.value = 1600; n.filt.Q.value = 0.8;
    env(n.g.gain, t, 0.05, 0.001, 0.05);
    n.src.start(t); n.src.stop(t + 0.06);
  },

  // Little downward "un-place" pop.
  remove(t) {
    const { osc, g } = tone('triangle', 500, sfxGain);
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    env(g.gain, t, 0.18, 0.003, 0.12);
    osc.start(t); osc.stop(t + 0.15);
  },

  // Quick clicky sweep for rotate.
  rotate(t) {
    const { osc, g } = tone('square', 440, sfxGain);
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.linearRampToValueAtTime(660, t + 0.06);
    // keep square tame with a lowpass
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1800;
    osc.disconnect(); osc.connect(lp); lp.connect(g);
    env(g.gain, t, 0.1, 0.003, 0.07);
    osc.start(t); osc.stop(t + 0.1);
  },

  // Tiny soft UI click.
  click(t) {
    const { osc, g } = tone('sine', 660, sfxGain);
    env(g.gain, t, 0.12, 0.002, 0.045);
    osc.start(t); osc.stop(t + 0.06);
  },

  // Friendly rising arpeggio when a player joins.
  join(t) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const v = tone('triangle', f, sfxGain);
      const st = t + i * 0.06;
      env(v.g.gain, st, 0.15, 0.005, 0.16);
      v.osc.start(st); v.osc.stop(st + 0.2);
    });
  },

  // Adorable pitch-bent chirp — the hamster squeak.
  squeak(t, o) {
    const p = o.pitch || (0.92 + Math.random() * 0.18);
    const { osc, g } = tone('triangle', 700 * p, sfxGain);
    // up then a quick dip = cute "eep!"
    osc.frequency.setValueAtTime(620 * p, t);
    osc.frequency.exponentialRampToValueAtTime(1500 * p, t + 0.06);
    osc.frequency.exponentialRampToValueAtTime(1050 * p, t + 0.13);
    // gentle vibrato
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 28; lfoGain.gain.value = 40 * p;
    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    // soften the top end
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3000;
    osc.disconnect(); osc.connect(lp); lp.connect(g);
    env(g.gain, t, 0.2, 0.006, 0.14);
    lfo.start(t); osc.start(t);
    lfo.stop(t + 0.18); osc.stop(t + 0.18);
  },

  // Boingy trampoline bounce.
  bounce(t, o) {
    const p = o.pitch || 1;
    const { osc, g } = tone('sine', 200 * p, sfxGain);
    osc.frequency.setValueAtTime(200 * p, t);
    osc.frequency.exponentialRampToValueAtTime(560 * p, t + 0.09);
    osc.frequency.exponentialRampToValueAtTime(360 * p, t + 0.2);
    env(g.gain, t, 0.22, 0.004, 0.2);
    osc.start(t); osc.stop(t + 0.24);
  },

  // Gentle rolling squeak of the running wheel (short blip, repeatable).
  wheel(t) {
    const { osc, g } = tone('sine', 520, sfxGain);
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.linearRampToValueAtTime(600, t + 0.05);
    osc.frequency.linearRampToValueAtTime(500, t + 0.11);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1400;
    osc.disconnect(); osc.connect(lp); lp.connect(g);
    env(g.gain, t, 0.08, 0.01, 0.12);
    osc.start(t); osc.stop(t + 0.14);
  },

  // Soft blip for incoming chat.
  chat(t) {
    const { osc, g } = tone('sine', 740, sfxGain);
    osc.frequency.setValueAtTime(560, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.08);
    env(g.gain, t, 0.12, 0.005, 0.1);
    osc.start(t); osc.stop(t + 0.13);
  },

  // Low "nope" buzz for denied actions.
  denied(t) {
    const { osc, g } = tone('sawtooth', 200, sfxGain);
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.16);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 800; lp.Q.value = 1;
    osc.disconnect(); osc.connect(lp); lp.connect(g);
    // two short pulses
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.02, t + 0.08);
    g.gain.linearRampToValueAtTime(0.16, t + 0.11);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.start(t); osc.stop(t + 0.22);
  },

  // Watery plip — noise blip + descending sine "bloop".
  splash(t) {
    const { osc, g } = tone('sine', 900, sfxGain);
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.14);
    env(g.gain, t, 0.16, 0.003, 0.14);
    osc.start(t); osc.stop(t + 0.18);
    const n = noiseVoice(sfxGain);
    n.filt.type = 'bandpass'; n.filt.frequency.value = 1200; n.filt.Q.value = 0.7;
    env(n.g.gain, t, 0.09, 0.002, 0.12);
    n.src.start(t); n.src.stop(t + 0.14);
  },
};

// ---------------------------------------------------------------------------
// Ambient music: warm detuned pad (I–vi–IV–V) + sparse pentatonic plucks.
// ---------------------------------------------------------------------------

function playPad(chord, t, dur) {
  // Each chord tone = two slightly detuned sine/triangle voices for warmth.
  const padGain = ctx.createGain();
  padGain.connect(musicGain);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  lp.connect(padGain);

  // slow swell in/out over the bar
  const a = dur * 0.35, r = dur * 0.4;
  padGain.gain.setValueAtTime(0.0001, t);
  padGain.gain.linearRampToValueAtTime(0.5, t + a);
  padGain.gain.setValueAtTime(0.5, t + dur - r);
  padGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  chord.forEach((f) => {
    [-1, 1].forEach((d, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      osc.detune.value = d * 6; // gentle chorus detune
      const vg = ctx.createGain();
      vg.gain.value = 0.16;
      osc.connect(vg); vg.connect(lp);
      osc.start(t); osc.stop(t + dur + 0.05);
    });
  });

  // add a soft sub-octave root for body
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = chord[0] / 2;
  const sg = ctx.createGain();
  sg.gain.value = 0.12;
  sub.connect(sg); sg.connect(lp);
  sub.start(t); sub.stop(t + dur + 0.05);
}

function playPluck(freq, t) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3000, t);
  lp.frequency.exponentialRampToValueAtTime(900, t + 0.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.18, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  osc.connect(lp); lp.connect(g); g.connect(musicGain);
  osc.start(t); osc.stop(t + 0.75);
}

function scheduleStep(s, t) {
  const stepsPerBar = 8;             // eighth notes per 4/4 bar
  const bar = Math.floor(s / stepsPerBar) % CHORDS.length;
  const inBar = s % stepsPerBar;

  // New chord at the top of each bar.
  if (inBar === 0) {
    playPad(CHORDS[bar], t, SECONDS_PER_BEAT * 4);
  }

  // Sparse pentatonic plucks — probabilistic, avoid downbeat clutter.
  // Roughly one or two plucks per bar.
  if (inBar === 2 || inBar === 5 || inBar === 7) {
    if (Math.random() < 0.4) {
      const f = PENTA[Math.floor(Math.random() * PENTA.length)];
      playPluck(f, t);
    }
  }
}

function schedulerTick() {
  if (!isReady() || !musicOn) return;
  while (nextNoteTime < now() + SCHEDULE_AHEAD) {
    scheduleStep(step, nextNoteTime);
    nextNoteTime += STEP_DUR;
    step++;
  }
}

function startMusic() {
  if (!isReady()) return;
  if (schedulerTimer) return;
  step = 0;
  nextNoteTime = now() + 0.1;
  // fade the music bus up gently
  musicGain.gain.cancelScheduledValues(now());
  musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), now());
  musicGain.gain.linearRampToValueAtTime(1.0, now() + 2.0);
  schedulerTick();
  schedulerTimer = setInterval(schedulerTick, LOOKAHEAD_MS);
}

function stopMusic() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (musicGain && isReady()) {
    musicGain.gain.cancelScheduledValues(now());
    musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), now());
    musicGain.gain.linearRampToValueAtTime(0.0001, now() + 1.2);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const audio = {
  // Create the AudioContext lazily; resume if suspended. Idempotent.
  init() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();

        master = ctx.createGain();
        master.gain.value = masterVolume;
        master.connect(ctx.destination);

        sfxGain = ctx.createGain();
        sfxGain.gain.value = 1.0;
        sfxGain.connect(master);

        musicGain = ctx.createGain();
        // Ambient is *very* quiet relative to SFX.
        musicGain.gain.value = musicOn ? 1.0 : 0.0001;
        const musicBus = ctx.createGain();
        musicBus.gain.value = 0.12; // keep the pad in the background
        musicGain.connect(musicBus);
        musicBus.connect(master);

        noiseBuffer = makeNoiseBuffer();
      }
      if (ctx.state === 'suspended' && ctx.resume) {
        ctx.resume();
      }
      // If music was requested before the ctx existed, start it now.
      if (musicOn && !schedulerTimer) startMusic();
    } catch (e) {
      // Never let audio setup break the game.
      ctx = null;
    }
  },

  // One-shot SFX. Safe no-op if ctx missing/suspended/unknown name.
  play(name, opts) {
    if (!isReady() || ctx.state !== 'running') return;
    const fn = SFX[name];
    if (!fn) return;

    const tnow = Date.now();
    const last = lastPlayed[name] || 0;
    if (tnow - last < THROTTLE_MS) return;
    lastPlayed[name] = tnow;

    try {
      fn(now() + 0.001, opts || {});
    } catch (e) {
      // swallow — audio must never throw
    }
  },

  // Toggle the generative ambient loop.
  setMusicOn(on) {
    musicOn = !!on;
    if (!isReady()) return; // will start on init() once ctx exists
    if (musicOn) startMusic();
    else stopMusic();
  },

  // Master volume 0..1.
  setMasterVolume(v) {
    masterVolume = Math.max(0, Math.min(1, v || 0));
    if (master && isReady()) {
      master.gain.setTargetAtTime(masterVolume, now(), 0.02);
    }
  },
};
