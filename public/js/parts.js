// Build catalog: every placeable part = flat-shaded mesh + physics colliders + zones.
// Parts live on a GRID-cm grid: part = { id, type, gx, gy, gz, rot } with rot in 90° steps.
import * as THREE from 'three';
import { GRID, VSTEP, PALETTE } from './config.js';

const G = GRID;
const TUBE_COLORS = [PALETTE.tubeYellow, PALETTE.tubeGreen, PALETTE.tubeBlue, PALETTE.tubeRed, PALETTE.tubePurple];

function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
}

function tubeColor(part) {
  return TUBE_COLORS[Math.abs(part.gx * 7 + part.gy * 13 + part.gz * 5) % TUBE_COLORS.length];
}

// ---- transforms: local space has origin at footprint min-corner, y=0 at part base.

function originOf(part, sx, sz) {
  // world min-corner; footprint swaps on odd rotations
  const [fx, fz] = (part.rot % 2 === 1) ? [sz, sx] : [sx, sz];
  return { x: part.gx * G, y: part.gy * VSTEP, z: part.gz * G, fx: fx * G, fz: fz * G };
}

// rotate local point around footprint center by rot*90° then translate to world
function toWorld(part, sx, sz, p) {
  const cx = sx * G / 2, cz = sz * G / 2;
  let dx = p.x - cx, dz = p.z - cz;
  for (let i = 0; i < part.rot; i++) [dx, dz] = [dz, -dx];
  const o = originOf(part, sx, sz);
  return { x: o.x + o.fx / 2 + dx, y: o.y + p.y, z: o.z + o.fz / 2 + dz };
}

function box(part, sx, sz, min, max, extra) {
  const a = toWorld(part, sx, sz, min);
  const b = toWorld(part, sx, sz, max);
  return {
    type: 'box',
    min: { x: Math.min(a.x, b.x), y: a.y, z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: b.y, z: Math.max(a.z, b.z) },
    ...extra,
  };
}

function placeGroup(part, sx, sz, group) {
  const o = originOf(part, sx, sz);
  group.position.set(o.x + o.fx / 2, o.y, o.z + o.fz / 2);
  group.rotation.y = -part.rot * Math.PI / 2;
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return group;
}

// Open-ended low-poly tube along local Z, centered at (0, radius, 0).
function tubeMesh(color, length, radius = 6) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(radius, radius, length, 8, 1, true);
  geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat(color, { side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  m.position.y = radius;
  g.add(m);
  for (const s of [-1, 1]) { // rims
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.7, 4, 8), mat(0xffffff));
    rim.position.set(0, radius, s * length / 2);
    g.add(rim);
  }
  return g;
}

function tubeShellColliders(part, sx, sz, len, alongZ = true) {
  // floor + two side walls + top, open ends (local z = axis)
  const r = 5;
  const c = G / 2;
  const zi = alongZ ? { a: c - len / 2, b: c + len / 2 } : null;
  const out = [];
  out.push(box(part, sx, sz, { x: c - r, y: 0, z: zi.a }, { x: c + r, y: 1.6, z: zi.b }));          // floor
  out.push(box(part, sx, sz, { x: c - r - 1.5, y: 0, z: zi.a }, { x: c - r, y: 12, z: zi.b }));     // wall -x
  out.push(box(part, sx, sz, { x: c + r, y: 0, z: zi.a }, { x: c + r + 1.5, y: 12, z: zi.b }));     // wall +x
  out.push(box(part, sx, sz, { x: c - r, y: 10.4, z: zi.a }, { x: c + r, y: 12, z: zi.b }));        // top
  return out;
}

// ------------------------------------------------------------------ catalog

export const PART_TYPES = {

  tube: {
    name: 'Tube', icon: 'assets/part-tube.png', size: [1, 1],
    build(part) {
      return placeGroup(part, 1, 1, tubeMesh(tubeColor(part), G + 0.4));
    },
    colliders(part) { return tubeShellColliders(part, 1, 1, G); },
    zones() { return []; },
  },

  tube_corner: {
    name: 'Corner', icon: 'assets/part-corner.png', size: [1, 1],
    build(part) {
      const g = new THREE.Group();
      const color = tubeColor(part);
      // elbow: quarter torus connecting the -z face to the +x face
      const geo = new THREE.TorusGeometry(G / 2, 6, 6, 5, Math.PI / 2);
      geo.rotateX(Math.PI / 2);
      geo.rotateY(-Math.PI / 2);
      const torus = new THREE.Mesh(geo, mat(color, { side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
      torus.position.set(G / 2, 6, -G / 2); // arc center at the +x/-z corner
      g.add(torus);
      for (const [x, z, ry] of [[0, -G / 2, 0], [G / 2, 0, Math.PI / 2]]) { // rims at both openings
        const rim = new THREE.Mesh(new THREE.TorusGeometry(6, 0.7, 4, 8), mat(0xffffff));
        rim.position.set(x, 6, z);
        rim.rotation.y = ry;
        g.add(rim);
      }
      return placeGroup(part, 1, 1, g);
    },
    colliders(part) {
      // approximate: floor across cell + outer corner walls; connects -z and +x sides
      const r = 5, c = G / 2;
      return [
        box(part, 1, 1, { x: c - r, y: 0, z: c - r - (G / 2 - r) }, { x: c + r + (G / 2 - r), y: 1.6, z: c + r }),
        box(part, 1, 1, { x: c - r - 1.5, y: 0, z: 0 }, { x: c - r, y: 12, z: G }),        // wall far from +x opening
        box(part, 1, 1, { x: c - r, y: 0, z: c + r }, { x: G, y: 12, z: c + r + 1.5 }),    // wall far from -z opening
        box(part, 1, 1, { x: c - r, y: 10.4, z: 0 }, { x: G, y: 12, z: c + r }),           // top
      ];
    },
    zones() { return []; },
  },

  tube_up: {
    name: 'Climb Tube', icon: 'assets/part-climb.png', size: [1, 1],
    height: 2, // cells tall
    build(part) {
      const g = new THREE.Group();
      const color = tubeColor(part);
      const geo = new THREE.CylinderGeometry(6, 6, 2 * G, 8, 1, true);
      const m = new THREE.Mesh(geo, mat(color, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
      m.position.y = G;
      g.add(m);
      for (const y of [0.5, G, 2 * G - 0.5]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(6, 0.7, 4, 8), mat(0xffffff));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = y;
        g.add(rim);
      }
      return placeGroup(part, 1, 1, g);
    },
    colliders(part) {
      const r = 5, c = G / 2, h = 2 * G;
      return [
        box(part, 1, 1, { x: c - r - 1.5, y: 0, z: c - r - 1.5 }, { x: c + r + 1.5, y: h, z: c - r }),
        box(part, 1, 1, { x: c - r - 1.5, y: 0, z: c + r }, { x: c + r + 1.5, y: h, z: c + r + 1.5 }),
        box(part, 1, 1, { x: c - r - 1.5, y: 0, z: c - r }, { x: c - r, y: h, z: c + r }),
        box(part, 1, 1, { x: c + r, y: 0, z: c - r }, { x: c + r + 1.5, y: h, z: c + r }),
      ];
    },
    zones(part) {
      return [box(part, 1, 1, { x: 1, y: -2, z: 1 }, { x: G - 1, y: 2 * G + 4, z: G - 1 }, { type: 'climb' })];
    },
  },

  ramp: {
    name: 'Ramp', icon: 'assets/part-ramp.png', size: [1, 2],
    build(part) {
      const g = new THREE.Group();
      const color = 0xd9a066;
      // sloped wedge rising +z: low at -z end, high (G) at +z end
      const shape = new THREE.BufferGeometry();
      const w = G / 2 - 0.5, L = G, y0 = 0.4, y1 = G;
      const v = [
        -w, 0, -L,  w, 0, -L,  w, y0, -L,  -w, y0, -L,     // low face corners
        -w, 0, L,   w, 0, L,   w, y1, L,   -w, y1, L,      // high face corners
      ];
      const idx = [0,1,2, 0,2,3,  4,6,5, 4,7,6,  3,2,6, 3,6,7,  0,4,5, 0,5,1,  0,3,7, 0,7,4,  1,5,6, 1,6,2];
      shape.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      shape.setIndex(idx);
      shape.computeVertexNormals();
      const m = new THREE.Mesh(shape, mat(color, {}));
      m.position.y = 0;
      g.add(m);
      // side rails
      for (const s of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1, 2.5, 2 * G), mat(0xf6c453));
        rail.position.set(s * (G / 2 - 0.5), G / 2 + 0.5, 0);
        rail.rotation.x = -Math.atan2(y1 - y0, 2 * L);
        g.add(rail);
      }
      return placeGroup(part, 1, 2, g);
    },
    colliders(part) {
      // staircase of 8 shallow steps rising from z=0 to z=2G, 0 -> G tall
      const out = [];
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const z0 = (i / steps) * 2 * G, z1 = ((i + 1) / steps) * 2 * G;
        const top = 0.4 + ((i + 0.5) / steps) * (G - 0.4);
        out.push(box(part, 1, 2, { x: 0.5, y: 0, z: z0 }, { x: G - 0.5, y: top, z: z1 }));
      }
      return out;
    },
    zones() { return []; },
  },

  platform: {
    name: 'Platform', icon: 'assets/part-platform.png', size: [2, 2],
    build(part) {
      const g = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(2 * G - 1, 2.2, 2 * G - 1), mat(0x8fbf6b));
      slab.position.y = 1.1;
      g.add(slab);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(2 * G - 0.2, 0.8, 2 * G - 0.2), mat(0x7fb069));
      trim.position.y = 2.4;
      g.add(trim);
      if (part.gy > 0) { // little legs when floating
        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3, 5), mat(0x7fb069));
          leg.position.set(x * (G - 2), -1.5, z * (G - 2));
          g.add(leg);
        }
      }
      return placeGroup(part, 2, 2, g);
    },
    colliders(part) {
      return [box(part, 2, 2, { x: 0, y: 0, z: 0 }, { x: 2 * G, y: 2.8, z: 2 * G })];
    },
    zones() { return []; },
  },

  wheel: {
    name: 'Wheel', icon: 'assets/part-wheel.png', size: [2, 2],
    build(part) {
      const g = new THREE.Group();
      const R = 11;
      const wheel = new THREE.Group();
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(R, R, 8, 10, 1, true),
        mat(0xef767a, { side: THREE.DoubleSide })
      );
      drum.rotation.z = Math.PI / 2;
      wheel.add(drum);
      const back = new THREE.Mesh(new THREE.CircleGeometry(R, 10), mat(0xd95d62, { side: THREE.DoubleSide }));
      back.rotation.y = Math.PI / 2;
      back.position.x = -4;
      wheel.add(back);
      for (let i = 0; i < 10; i++) { // rungs
        const a = (i / 10) * Math.PI * 2;
        const rung = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 1.6), mat(0xffffff));
        rung.position.set(0.5, Math.sin(a) * (R - 0.8), Math.cos(a) * (R - 0.8));
        rung.rotation.x = a;
        wheel.add(rung);
      }
      wheel.position.y = R + 2;
      g.add(wheel);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(3, R + 2, 3), mat(0x9aa0a8));
      stand.position.set(-6, (R + 2) / 2, 0);
      g.add(stand);
      const base = new THREE.Mesh(new THREE.BoxGeometry(14, 1.5, 12), mat(0x9aa0a8));
      base.position.set(-3, 0.75, 0);
      g.add(base);
      g.userData.spinMesh = wheel;
      return placeGroup(part, 2, 2, g);
    },
    colliders(part) {
      // A bucket you run INSIDE: running floor + closed back end (-x) + two side
      // walls sized to the drum interior, open at the +x face so you can step in
      // and out. Running forward is caught by the walls and spins the drum.
      return [
        box(part, 2, 2, { x: 6, y: 0, z: 5 }, { x: 14, y: 3, z: 15 }),    // running floor
        box(part, 2, 2, { x: 5, y: 0, z: 4 }, { x: 6.5, y: 13, z: 16 }),  // closed back end (-x)
        box(part, 2, 2, { x: 6, y: 0, z: 4 }, { x: 15, y: 13, z: 5 }),    // side wall (low z)
        box(part, 2, 2, { x: 6, y: 0, z: 15 }, { x: 15, y: 13, z: 16 }),  // side wall (high z)
      ];
    },
    zones(part) {
      return [box(part, 2, 2, { x: 6, y: 0, z: 5 }, { x: 14, y: 15, z: 15 }, { type: 'wheel', partId: part.id })];
    },
  },

  house: {
    name: 'House', icon: 'assets/part-house.png', size: [2, 2],
    build(part) {
      const g = new THREE.Group();
      const wallM = mat(0xf4a261);
      const W = 2 * G - 2, H = 13;
      // walls with doorway on -z
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(W, H, 1.5), wallM);
      backWall.position.set(0, H / 2, W / 2 - 0.75);
      g.add(backWall);
      for (const s of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(1.5, H, W), wallM);
        side.position.set(s * (W / 2 - 0.75), H / 2, 0);
        g.add(side);
      }
      for (const s of [-1, 1]) { // front wall halves leaving 8cm door
        const seg = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 4, H, 1.5), wallM);
        seg.position.set(s * (W / 4 + 2), H / 2, -(W / 2 - 0.75));
        g.add(seg);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(8, 3.5, 1.5), wallM);
      lintel.position.set(0, H - 1.75, -(W / 2 - 0.75));
      g.add(lintel);
      // roof
      const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.78, 8, 4), mat(0xef767a));
      roof.position.y = H + 4;
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(2.5, 5, 2.5), mat(0xd95d62));
      chimney.position.set(4, H + 5, 4);
      g.add(chimney);
      return placeGroup(part, 2, 2, g);
    },
    colliders(part) {
      const W = 2 * G - 2, H = 13, off = 1;
      return [
        box(part, 2, 2, { x: off, y: 0, z: 2 * G - off - 1.5 }, { x: 2 * G - off, y: H, z: 2 * G - off }),
        box(part, 2, 2, { x: off, y: 0, z: off }, { x: off + 1.5, y: H, z: 2 * G - off }),
        box(part, 2, 2, { x: 2 * G - off - 1.5, y: 0, z: off }, { x: 2 * G - off, y: H, z: 2 * G - off }),
        box(part, 2, 2, { x: off, y: 0, z: off }, { x: G - 4, y: H, z: off + 1.5 }),
        box(part, 2, 2, { x: G + 4, y: 0, z: off }, { x: 2 * G - off, y: H, z: off + 1.5 }),
        box(part, 2, 2, { x: G - 4, y: H - 3.5, z: off }, { x: G + 4, y: H, z: off + 1.5 }),
        box(part, 2, 2, { x: off, y: H, z: off }, { x: 2 * G - off, y: H + 1.5, z: 2 * G - off }),
      ];
    },
    zones(part) {
      return [box(part, 2, 2, { x: 4, y: 0, z: 4 }, { x: 2 * G - 4, y: 12, z: 2 * G - 4 }, { type: 'bank' })];
    },
  },

  hay: {
    name: 'Hay Pile', icon: 'assets/part-hay.png', size: [2, 2],
    build(part) {
      const g = new THREE.Group();
      const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 1), mat(0xe9d38a));
      mound.scale.set(1.1, 0.55, 1.1);
      mound.position.y = 2.5;
      g.add(mound);
      for (let i = 0; i < 7; i++) { // straws
        const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 3), mat(0xd4b96a));
        straw.position.set((Math.sin(i * 2.4) * 6), 5, (Math.cos(i * 1.7) * 6));
        straw.rotation.set(Math.sin(i) * 0.9, i, Math.cos(i * 3) * 0.9);
        g.add(straw);
      }
      return placeGroup(part, 2, 2, g);
    },
    colliders() { return []; }, // soft! walk through, bounce zone does the work
    zones(part) {
      return [box(part, 2, 2, { x: 2, y: 0, z: 2 }, { x: 2 * G - 2, y: 7, z: 2 * G - 2 }, { type: 'bounce', power: 260 })];
    },
  },

  fence: {
    name: 'Fence', icon: 'assets/part-fence.png', size: [1, 1],
    build(part) {
      const g = new THREE.Group();
      const m = mat(0xc9905a);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9, 1.4), m);
        post.position.set(s * (G / 2 - 1), 4.5, 0);
        g.add(post);
      }
      for (const y of [3, 6.5]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(G, 1.4, 1), m);
        rail.position.y = y;
        g.add(rail);
      }
      return placeGroup(part, 1, 1, g);
    },
    colliders(part) {
      return [box(part, 1, 1, { x: 0, y: 0, z: G / 2 - 0.8 }, { x: G, y: 8, z: G / 2 + 0.8 })];
    },
    zones() { return []; },
  },
};

export const CATALOG = Object.entries(PART_TYPES).map(([type, def]) => ({ type, name: def.name, icon: def.icon }));

export function buildPartMesh(part) {
  const def = PART_TYPES[part.type];
  if (!def) return null;
  const mesh = def.build(part);
  mesh.userData.partId = part.id;
  return mesh;
}

export function partColliders(part) {
  return PART_TYPES[part.type]?.colliders(part) ?? [];
}

export function partZones(part) {
  return PART_TYPES[part.type]?.zones(part) ?? [];
}
