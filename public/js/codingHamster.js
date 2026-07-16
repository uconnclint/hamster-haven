// Procedural flat-shaded low-poly "robot pet" hamster for Coding Mode.
// Mirrors hamster.js's structure and exposes the identical
// root.userData.hamster interface (animate / showEmote / setCarry) so the
// game can drive it exactly like a player hamster. Visually distinct: a cool
// slate-blue steel-fur palette, tiny forehead goggles, and a wind-up key on
// its back that gently turns while it moves.
import * as THREE from 'three';
import { HAMSTER_COLORS } from './config.js';

// Slate-blue "steel fur" palette for the programmable robot pet.
const ROBOT_COLORS = { body: 0x8fa3c4, belly: 0xd7e0ee };

function mat(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

export function createCodingHamster(colorIndex = 0) {
  // colorIndex is accepted for interface parity with createHamster; the robot
  // pet uses its own fixed slate palette so it always reads as distinct. We
  // still reference HAMSTER_COLORS to stay consistent with the shared config.
  void (HAMSTER_COLORS[colorIndex % HAMSTER_COLORS.length]);

  const body = mat(ROBOT_COLORS.body);
  const belly = mat(ROBOT_COLORS.belly);
  const dark = mat(0x22262e);
  const pink = mat(0xf0a8a0);
  const metal = mat(0xb9c3d4);   // bright steel for the wind-up key
  const metalDark = mat(0x6d7688);
  const glass = mat(0x7fd6e6);   // cyan goggle lenses

  const root = new THREE.Group();       // positioned at body center by game
  const rig = new THREE.Group();        // everything animated hangs here
  root.add(rig);

  // Body: squished icosahedron blob, ~8cm long
  const bodyGeo = new THREE.IcosahedronGeometry(3.4, 1);
  bodyGeo.scale(1.0, 0.88, 1.25);
  const bodyMesh = new THREE.Mesh(bodyGeo, body);
  bodyMesh.castShadow = true;
  rig.add(bodyMesh);

  // Belly patch
  const bellyGeo = new THREE.IcosahedronGeometry(2.6, 1);
  bellyGeo.scale(0.95, 0.6, 1.05);
  const bellyMesh = new THREE.Mesh(bellyGeo, belly);
  bellyMesh.position.set(0, -1.3, 0.4);
  rig.add(bellyMesh);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 1.0, 3.4);
  rig.add(head);
  const headGeo = new THREE.IcosahedronGeometry(2.3, 1);
  headGeo.scale(0.95, 0.9, 1.0);
  const headMesh = new THREE.Mesh(headGeo, body);
  headMesh.castShadow = true;
  head.add(headMesh);

  // Snout + nose
  const snout = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), belly);
  snout.scale.set(1.0, 0.8, 1.0);
  snout.position.set(0, -0.5, 1.9);
  head.add(snout);
  const nose = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), pink);
  nose.position.set(0, -0.35, 2.75);
  head.add(nose);

  // Eyes
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), dark);
    eye.position.set(s * 1.05, 0.45, 1.75);
    head.add(eye);
  }

  // Goggles on the forehead: two lens rings joined by a strap, pushed up above
  // the eyes so it reads as a little maker/robot pet.
  const goggles = new THREE.Group();
  goggles.position.set(0, 1.15, 1.35);
  goggles.rotation.x = -0.25;
  head.add(goggles);
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.16, 6, 10), metalDark);
    ring.position.set(s * 0.85, 0, 0);
    goggles.add(ring);
    const lens = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), glass);
    lens.scale.set(1, 1, 0.5);
    lens.position.set(s * 0.85, 0, 0.05);
    goggles.add(lens);
  }
  // Strap bridge between the two lenses
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.18), metalDark);
  goggles.add(bridge);

  // Ears
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 1.35, 1.9, -0.2);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.3, 5), body);
    outer.rotation.x = -0.35;
    ear.add(outer);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 5), pink);
    inner.position.set(0, 0.05, 0.22);
    inner.rotation.x = -0.35;
    ear.add(inner);
    head.add(ear);
    ears.push(ear);
  }

  // Cheek pouches (scale up when carrying seeds)
  const cheeks = [];
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), belly);
    cheek.position.set(s * 1.5, -0.55, 1.0);
    head.add(cheek);
    cheeks.push(cheek);
  }

  // Wind-up key on the back: a short shaft rising out of the body plus a
  // heart/oval bow made from a torus. The whole group spins slowly in
  // animate() for charm. Tilted back a little so it sits on the upper back.
  const windup = new THREE.Group();
  windup.position.set(0, 2.4, -1.6);
  windup.rotation.x = 0.45;
  rig.add(windup);
  // Collar washer where the key meets the fur
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.25, 8), metalDark);
  windup.add(collar);
  // Shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.8, 6), metal);
  shaft.position.set(0, 1.0, 0);
  windup.add(shaft);
  // Bow: a torus ring forming the loop of the key, sitting on top of the shaft
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.2, 6, 12), metal);
  bow.position.set(0, 2.1, 0);
  bow.rotation.x = Math.PI / 2; // face the ring flat-on toward the camera side
  windup.add(bow);
  // Two little wing prongs to give the classic wind-up-key silhouette
  for (const s of [-1, 1]) {
    const prong = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.22), metal);
    prong.position.set(s * 0.55, 2.1, 0);
    windup.add(prong);
  }

  // Feet: four stubby spheres
  const feet = [];
  const footGeo = new THREE.IcosahedronGeometry(0.65, 0);
  for (const [x, z] of [[-1.6, 2.0], [1.6, 2.0], [-1.6, -2.0], [1.6, -2.0]]) {
    const foot = new THREE.Mesh(footGeo, belly);
    foot.position.set(x, -2.9, z);
    foot.castShadow = true;
    rig.add(foot);
    feet.push({ mesh: foot, baseY: -2.9, phase: (x > 0) !== (z > 0) ? 0 : Math.PI });
  }

  // Tail nub
  const tail = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), belly);
  tail.position.set(0, -0.4, -4.1);
  rig.add(tail);

  // Emote bubble sprite (hidden until show)
  let emoteSprite = null;
  let emoteUntil = 0;

  const state = { t: Math.random() * 10, runAmount: 0 };

  root.userData.hamster = {
    setCarry(frac) { // 0..1 cheek inflation
      const s = 1 + frac * 1.6;
      for (const ch of cheeks) ch.scale.setScalar(s);
    },
    showEmote(emoji) {
      if (emoteSprite) root.remove(emoteSprite);
      emoteSprite = makeEmoteSprite(emoji);
      emoteSprite.position.set(0, 9, 0);
      root.add(emoteSprite);
      emoteUntil = performance.now() + 2200;
    },
    // speed: 0..1 normalized run, grounded: bool, dt seconds
    animate(dt, speed, grounded) {
      state.t += dt * (4 + speed * 18);
      state.runAmount += ((grounded ? speed : 0) - state.runAmount) * Math.min(1, dt * 10);
      const run = state.runAmount;

      // Scurry: feet paddle, body bobs & tilts
      for (const f of feet) {
        f.mesh.position.y = f.baseY + Math.max(0, Math.sin(state.t + f.phase)) * 1.1 * run;
        f.mesh.position.z += 0; // z fixed; paddle vertically only (reads better tiny)
      }
      rig.position.y = Math.abs(Math.sin(state.t)) * 0.5 * run + (grounded ? 0 : 0.8);
      rig.rotation.z = Math.sin(state.t * 0.5) * 0.06 * run;
      rig.rotation.x = grounded ? run * 0.08 : -0.35; // lean forward running, splay in air

      // Wind-up key: idles with a slow turn, spins faster while scurrying.
      windup.rotation.y += dt * (0.8 + run * 6);

      // Idle: sniffing head bob + ear twitches
      const idle = 1 - run;
      head.rotation.x = Math.sin(state.t * 0.6) * 0.10 * idle;
      head.position.y = 1.0 + Math.sin(state.t * 0.9) * 0.12 * idle;
      const twitch = Math.max(0, Math.sin(state.t * 0.23) - 0.92) * 8;
      ears[0].rotation.z = 0.15 + twitch * idle;
      ears[1].rotation.z = -0.15 - twitch * idle * 0.5;

      if (emoteSprite && performance.now() > emoteUntil) {
        root.remove(emoteSprite);
        emoteSprite = null;
      }
    },
  };

  return root;
}

function makeEmoteSprite(emote) {
  const w = 96, h = 96;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const drawBubble = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,250,240,0.95)';
    ctx.beginPath();
    ctx.arc(48, 42, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(38, 78); ctx.lineTo(48, 94); ctx.lineTo(58, 78);
    ctx.fill();
  };
  drawBubble();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(4.5, 4.5, 1);
  sprite.renderOrder = 10;
  if (typeof emote === 'string' && (emote.endsWith('.png') || emote.includes('/'))) {
    const im = new Image();
    im.onload = () => { drawBubble(); ctx.drawImage(im, 18, 12, 60, 60); tex.needsUpdate = true; };
    im.src = emote.includes('/') ? emote : 'assets/' + emote;
  } else {
    ctx.font = '52px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emote, 48, 44);
    tex.needsUpdate = true;
  }
  return sprite;
}
