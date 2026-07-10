// Hamster Haven — main orchestrator.
import * as THREE from 'three';
import { GRID, PLAYER, NET, EMOTES, PALETTE } from './config.js';
import { buildWorld } from './world.js';
import { Physics } from './physics.js';
import { PlayerController } from './player.js';
import { createHamster } from './hamster.js';
import { buildPartMesh, partColliders, partZones, CATALOG } from './parts.js';
import { BuildMode } from './build.js';
import { Net } from './net.js';
import { ui } from './ui.js';
import { audio } from './audio.js';

// ------------------------------------------------------------ renderer/scene

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.day);
scene.fog = new THREE.Fog(PALETTE.day, 350, 1000);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 2000);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------ world & systems

const world = buildWorld();
scene.add(world.group);

const physics = new Physics();
physics.setWorld(world.colliders, world.zones);

const player = new PlayerController(camera, canvas);
const build = new BuildMode(scene, camera, physics);
const net = new Net();

let myHamster = null;
let joined = false;
let carrying = 0, banked = 0;
const players = new Map();     // remote id -> { name, colorIndex, carrying, banked, mesh, buf }
const partMeshes = new Map();  // partId -> mesh
const seedMeshes = new Map();  // seedId -> mesh
let lastDepositAt = 0;
let lastWheelSfx = 0;

// mouse position in normalized device coords, for build-mode cursor aiming
const mouseNdc = new THREE.Vector2(0, 0);
addEventListener('mousemove', (e) => {
  mouseNdc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});

// ------------------------------------------------------------ particles

const particles = (() => {
  const MAX = 300;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xfff2b0, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.95 });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const pool = Array.from({ length: MAX }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  let cursor = 0;
  return {
    burst(x, y, z, n, spread, up) {
      for (let i = 0; i < n; i++) {
        const p = pool[cursor = (cursor + 1) % MAX];
        p.life = 0.5 + Math.random() * 0.4;
        p.x = x; p.y = y; p.z = z;
        const a = Math.random() * Math.PI * 2;
        const s = Math.random() * spread;
        p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s;
        p.vy = up * (0.5 + Math.random());
      }
    },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        const p = pool[i];
        if (p.life > 0) {
          p.life -= dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.vy -= 160 * dt;
          pos.set([p.x, p.y, p.z], i * 3);
        } else {
          pos.set([0, -1000, 0], i * 3);
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
})();

// ------------------------------------------------------------ seeds

function seedMesh(seed) {
  const g = new THREE.Group();
  const s = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.4, 0),
    new THREE.MeshLambertMaterial({ color: PALETTE.seed, flatShading: true })
  );
  s.scale.set(0.7, 1.2, 0.7);
  s.castShadow = true;
  const stripe = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9, 0),
    new THREE.MeshLambertMaterial({ color: PALETTE.seedStripe, flatShading: true })
  );
  stripe.scale.set(0.65, 1.1, 0.65);
  stripe.position.y = 0.4;
  g.add(s, stripe);
  g.position.set(seed.x, seed.y + 1.6, seed.z);
  g.userData.baseY = seed.y + 1.6;
  g.userData.phase = Math.random() * 6;
  return g;
}

function addSeed(seed) {
  const m = seedMesh(seed);
  seedMeshes.set(seed.id, m);
  scene.add(m);
}

function removeSeed(id, sparkle) {
  const m = seedMeshes.get(id);
  if (!m) return;
  if (sparkle) particles.burst(m.position.x, m.position.y, m.position.z, 8, 22, 30);
  scene.remove(m);
  seedMeshes.delete(id);
}

// ------------------------------------------------------------ parts

function addPart(part) {
  if (partMeshes.has(part.id)) return;
  const mesh = buildPartMesh(part);
  if (!mesh) return;
  partMeshes.set(part.id, mesh);
  scene.add(mesh);
  physics.addPart(part.id, partColliders(part), partZones(part));
}

function removePart(id) {
  const mesh = partMeshes.get(id);
  if (mesh) {
    particles.burst(mesh.position.x, mesh.position.y + 5, mesh.position.z, 10, 30, 40);
    scene.remove(mesh);
    partMeshes.delete(id);
  }
  physics.removePart(id);
}

// ------------------------------------------------------------ remote players

function addRemote(p) {
  if (p.id === net.id || players.has(p.id)) return;
  const mesh = createHamster(p.colorIndex, p.name);
  scene.add(mesh);
  players.set(p.id, { ...p, mesh, buf: [] });
  refreshPlayerList();
}

function removeRemote(id) {
  const p = players.get(id);
  if (p) { scene.remove(p.mesh); players.delete(id); refreshPlayerList(); }
}

function refreshPlayerList() {
  const list = [...players.values()].map((p) => ({
    id: p.id, name: p.name, colorIndex: p.colorIndex, banked: p.banked, you: false,
  }));
  list.push({ id: net.id, name: myName, colorIndex: myColor, banked, you: true });
  list.sort((a, b) => b.banked - a.banked);
  ui.setPlayers(list);
}

// ------------------------------------------------------------ net wiring

let myName = 'Hamster', myColor = 0;

net.on('joined', (msg) => {
  joined = true;
  ui.showHUD(msg.code);
  ui.setSeeds(0, 0, PLAYER.maxCarry);
  ui.hint('WASD scurry · Space jump · Shift dash · B build · 1-4 emotes');
  for (const part of msg.parts) addPart(part);
  for (const seed of msg.seeds) addSeed(seed);
  for (const p of msg.players) if (p.id !== net.id) addRemote(p);
  myHamster = createHamster(myColor, '');
  scene.add(myHamster);
  player.enabled = true;
  player.respawn();
  refreshPlayerList();
  audio.play('join');
  audio.setMusicOn(true);
  ui.toast(`Room ${msg.code} — share the code to play together!`);
});

net.on('player_joined', (msg) => {
  addRemote(msg.player);
  ui.toast(`${msg.player.name} scurried in! 🐹`);
  audio.play('join');
});
net.on('player_left', (msg) => {
  const p = players.get(msg.id);
  if (p) ui.toast(`${p.name} left`);
  removeRemote(msg.id);
});

net.on('states', (msg) => {
  const t = performance.now();
  for (const s of msg.states) {
    if (s.id === net.id) continue;
    const p = players.get(s.id);
    if (!p) continue;
    p.buf.push({ t, p: s.p, yaw: s.yaw, anim: s.anim });
    if (p.buf.length > 20) p.buf.shift();
  }
});

net.on('placed', (msg) => { addPart(msg.part); audio.play('place'); });
net.on('removed', (msg) => { removePart(msg.id); audio.play('remove'); });
net.on('seed', (msg) => addSeed(msg.seed));

net.on('seed_gone', (msg) => {
  removeSeed(msg.id, true);
  if (msg.by === net.id) {
    carrying = msg.carrying;
    ui.setSeeds(carrying, banked, PLAYER.maxCarry);
    audio.play('collect');
    myHamster?.userData.hamster.setCarry(carrying / PLAYER.maxCarry);
  } else {
    const p = players.get(msg.by);
    if (p) { p.carrying = msg.carrying; p.mesh.userData.hamster.setCarry(msg.carrying / PLAYER.maxCarry); }
  }
});

net.on('deposited', (msg) => {
  if (msg.id === net.id) {
    banked = msg.banked;
    carrying = 0;
    ui.setSeeds(0, banked, PLAYER.maxCarry);
    ui.toast(`Banked ${msg.n} seeds! 🌻 (${banked} total)`);
    audio.play('deposit');
    myHamster?.userData.hamster.setCarry(0);
  } else {
    const p = players.get(msg.id);
    if (p) { p.banked = msg.banked; p.carrying = 0; p.mesh.userData.hamster.setCarry(0); }
  }
  refreshPlayerList();
});

net.on('emote', (msg) => {
  const p = players.get(msg.id);
  p?.mesh.userData.hamster.showEmote(EMOTES[msg.e] || '❔');
  audio.play('squeak');
});

net.on('disconnected', () => {
  ui.toast('Disconnected from room');
  location.reload();
});

// ------------------------------------------------------------ UI wiring

ui.init({
  onPlay({ mode, code, name, colorIndex }) {
    myName = name; myColor = colorIndex;
    audio.init();
    ui.showConnecting();
    net.connect({ mode, code, name, colorIndex }, (reason) => {
      const msgs = { no_room: 'No room with that code!', full: 'That room is full!', unreachable: "Couldn't reach the server." };
      ui.showMenu(msgs[reason] || 'Something went wrong.');
      audio.play('denied');
    });
  },
  onEmote(i) { if (joined) { net.emote(i); myHamster?.userData.hamster.showEmote(EMOTES[i]); audio.play('squeak'); } },
  onSelectPart(i) { build.setSelected(i); ui.setBuildSelected(build.sel); audio.play('click'); },
  onToggleMusic(on) { audio.setMusicOn(on); },
});
ui.showMenu();

// ------------------------------------------------------------ input (game keys)

function toggleBuild() {
  if (build.active) {
    build.exit();
    player.buildMode = false;
    ui.hideBuildBar();
    ui.showEmoteHint();
    ui.hint('WASD scurry · Space jump · Shift dash · B build · 1-4 emotes');
  } else {
    build.enter();
    player.buildMode = true;
    document.exitPointerLock?.();     // aim with the visible cursor
    ui.showBuildBar(CATALOG, build.sel);
    ui.hint('');                      // the build bar has its own help line
  }
  audio.play('click');
}

document.addEventListener('keydown', (e) => {
  if (!joined) return;
  if (e.code === 'KeyB') { toggleBuild(); return; }
  if (build.active) {
    if (e.code === 'KeyR') { build.rotate(); audio.play('rotate'); }
    else if (e.code === 'KeyQ') { build.cycle(-1); ui.setBuildSelected(build.sel); audio.play('click'); }
    else if (e.code === 'KeyE') { build.cycle(1); ui.setBuildSelected(build.sel); audio.play('click'); }
    else if (e.code === 'KeyX') {
      if (build.deleteHover) { net.remove(build.deleteHover); }
      else audio.play('denied');
    } else if (/^Digit[1-9]$/.test(e.code)) {
      const i = +e.code.slice(5) - 1;
      if (i < CATALOG.length) { build.setSelected(i); ui.setBuildSelected(build.sel); audio.play('click'); }
    }
  } else if (/^Digit[1-4]$/.test(e.code)) {
    const i = +e.code.slice(5) - 1;
    net.emote(i);
    myHamster?.userData.hamster.showEmote(EMOTES[i]);
    audio.play('squeak');
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (!joined || !build.active) return;
  if (e.button === 0) {
    const spec = build.placeSpec();
    if (spec) net.place(spec);
    else audio.play('denied');
  } else if (e.button === 2 && build.deleteHover) {
    net.remove(build.deleteHover);
  }
});
document.addEventListener('contextmenu', (e) => { if (build.active) e.preventDefault(); });

// ------------------------------------------------------------ main loop

let elapsed = 0;
let lastFrame = performance.now();

function frame() {
  requestAnimationFrame(frame);
  tick();
}

function tick(forceDt) {
  const now = performance.now();
  const dt = forceDt ?? Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  elapsed += dt;

  world.update?.(dt, elapsed);
  const sky = world.group.userData.skyColor;
  if (sky) { scene.background.copy(sky); scene.fog.color.copy(sky); }

  if (joined && myHamster) {
    player.update(dt, physics);
    const b = player.body;

    // hamster mesh follows physics body
    myHamster.position.set(b.pos.x, b.pos.y - PLAYER.height / 2 + 3, b.pos.z);
    const targetYaw = player.yaw;
    myHamster.rotation.y += shortestAngle(myHamster.rotation.y, targetYaw) * Math.min(1, dt * 12);
    myHamster.userData.hamster.animate(dt, player.speedNorm, player.grounded);

    // player events → sfx/particles
    for (const ev of player.takeEvents()) {
      if (ev === 'jump') audio.play('jump');
      if (ev === 'land') { audio.play('land'); particles.burst(b.pos.x, b.pos.y - 3, b.pos.z, 6, 25, 15); }
      if (ev === 'dash') { audio.play('dash'); particles.burst(b.pos.x, b.pos.y - 2, b.pos.z, 10, 35, 20); }
      if (ev === 'bounce') { audio.play('bounce'); particles.burst(b.pos.x, b.pos.y - 3, b.pos.z, 12, 30, 40); }
    }
    // run dust
    if (player.grounded && player.speedNorm > 0.6 && Math.random() < dt * 12) {
      particles.burst(b.pos.x, b.pos.y - 3, b.pos.z, 1, 12, 12);
    }

    // collect nearby seeds
    if (carrying < PLAYER.maxCarry) {
      for (const [id, m] of seedMeshes) {
        const dx = m.position.x - b.pos.x, dy = m.position.y - b.pos.y, dz = m.position.z - b.pos.z;
        if (dx * dx + dy * dy + dz * dz < 42) { net.collect(id, PLAYER.maxCarry); break; }
      }
    }

    // zones: bank + wheel
    const zones = player.zones || [];
    const now = performance.now();
    if (carrying > 0 && zones.some((z) => z.type === 'bank') && now - lastDepositAt > 1200) {
      lastDepositAt = now;
      net.deposit();
    }
    net.sendState(b.pos, player.yaw, { s: +player.speedNorm.toFixed(1), g: player.grounded ? 1 : 0 });

    build.update(partMeshes, mouseNdc);
  }

  // remote interpolation
  const renderT = performance.now() - NET.interpDelay;
  for (const p of players.values()) {
    const buf = p.buf;
    if (!buf.length) continue;
    let a = buf[0], bSnap = buf[buf.length - 1];
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].t <= renderT && buf[i + 1].t >= renderT) { a = buf[i]; bSnap = buf[i + 1]; break; }
    }
    const span = Math.max(1, bSnap.t - a.t);
    const f = Math.max(0, Math.min(1, (renderT - a.t) / span));
    const x = a.p[0] + (bSnap.p[0] - a.p[0]) * f;
    const y = a.p[1] + (bSnap.p[1] - a.p[1]) * f;
    const z = a.p[2] + (bSnap.p[2] - a.p[2]) * f;
    p.mesh.position.set(x, y - PLAYER.height / 2 + 3, z);
    p.mesh.rotation.y += shortestAngle(p.mesh.rotation.y, bSnap.yaw) * Math.min(1, dt * 10);
    const anim = bSnap.anim || { s: 0, g: 1 };
    p.mesh.userData.hamster.animate(dt, anim.s, !!anim.g);
  }

  // wheels spin when anyone (local or remote) runs inside them
  if (joined) {
    for (const [partId, zones] of physics.partZones) {
      const wz = zones.find((z) => z.type === 'wheel');
      if (!wz) continue;
      const inZone = (x, y, z) =>
        x >= wz.min.x && x <= wz.max.x && y >= wz.min.y && y <= wz.max.y && z >= wz.min.z && z <= wz.max.z;
      let effort = 0;
      const b = player.body;
      if (inZone(b.pos.x, b.pos.y, b.pos.z)) effort = player.speedNorm;
      for (const p of players.values()) {
        const m = p.mesh.position;
        const s = p.buf.length ? (p.buf[p.buf.length - 1].anim?.s || 0) : 0;
        if (inZone(m.x, m.y + 3, m.z)) effort = Math.max(effort, s);
      }
      if (effort > 0.1) {
        const spin = partMeshes.get(partId)?.userData.spinMesh;
        if (spin) spin.rotation.x += effort * dt * 6;
        const now2 = performance.now();
        if (effort > 0.5 && now2 - lastWheelSfx > 700) { lastWheelSfx = now2; audio.play('wheel'); }
      }
    }
  }

  // seeds bob & spin
  for (const m of seedMeshes.values()) {
    m.rotation.y += dt * 2;
    m.position.y = m.userData.baseY + Math.sin(elapsed * 3 + m.userData.phase) * 0.5;
  }

  particles.update(dt);
  renderer.render(scene, camera);
}

function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

frame();

// Watchdog: keep simulating (and syncing to the room) when rAF is throttled in
// background tabs, at a low 10Hz rate.
setInterval(() => {
  if (performance.now() - lastFrame > 300) tick(0.1);
}, 100);

// Debug/automation handle (harmless in production).
window.__game = {
  player, camera, physics, net, build, world, scene, players, partMeshes, seedMeshes,
  step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) tick(dt); },
  get carrying() { return carrying; }, get banked() { return banked; },
};
