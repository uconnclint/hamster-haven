// world.js — Hamster Haven bedroom diorama.
// Flat-shaded low-poly. Units = centimeters. y-up. Room floor y=0.
// Builds the bedroom + desk + hamster cage + lighting, and returns
// { group, colliders, zones, update(dt, elapsed) }.
import * as THREE from 'three';
import { ROOM, DESK, CAGE, PALETTE } from './config.js';

export function buildWorld() {
  const group = new THREE.Group();
  const colliders = [];
  const zones = [];

  const HX = ROOM.x / 2;   // 250
  const HZ = ROOM.z / 2;   // 200
  const H = ROOM.h;        // 260
  const WT = 8;            // wall thickness

  // ---- helpers -------------------------------------------------------------
  function mat(color, extra) {
    return new THREE.MeshStandardMaterial({
      color, flatShading: true, roughness: 0.95, metalness: 0.0,
      ...(extra || {}),
    });
  }
  // Add a box mesh centered at (px,py,pz). Returns the mesh.
  function box(w, h, d, color, px, py, pz, opts) {
    const o = opts || {};
    const m = o.mat || mat(color);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(px, py, pz);
    mesh.castShadow = o.cast !== undefined ? o.cast : true;
    mesh.receiveShadow = o.receive !== undefined ? o.receive : true;
    if (o.rx) mesh.rotation.x = o.rx;
    if (o.ry) mesh.rotation.y = o.ry;
    if (o.rz) mesh.rotation.z = o.rz;
    (o.parent || group).add(mesh);
    return mesh;
  }
  function cyl(rt, rb, h, color, px, py, pz, opts) {
    const o = opts || {};
    const m = o.mat || mat(color);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(rt, rb, h, o.seg || 8), m);
    mesh.position.set(px, py, pz);
    mesh.castShadow = o.cast !== undefined ? o.cast : true;
    mesh.receiveShadow = o.receive !== undefined ? o.receive : true;
    if (o.rx) mesh.rotation.x = o.rx;
    if (o.rz) mesh.rotation.z = o.rz;
    (o.parent || group).add(mesh);
    return mesh;
  }
  // Collider: solid AABB the player can stand on / bump into.
  function collide(minx, miny, minz, maxx, maxy, maxz) {
    colliders.push({
      type: 'box',
      min: { x: minx, y: miny, z: minz },
      max: { x: maxx, y: maxy, z: maxz },
    });
  }
  // Slight per-instance tint for a handcrafted feel.
  function tint(hex, sJit, lJit) {
    const c = new THREE.Color(hex);
    c.offsetHSL((Math.random() - 0.5) * 0.03,
                (Math.random() - 0.5) * (sJit || 0.08),
                (Math.random() - 0.5) * (lJit || 0.08));
    return c;
  }
  const TUBES = [PALETTE.tubeYellow, PALETTE.tubeGreen, PALETTE.tubeBlue,
                 PALETTE.tubeRed, PALETTE.tubePurple];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // =========================================================================
  // FLOOR — alternating plank tints, running in z.
  // =========================================================================
  const PLANKS = 12;
  const plankW = ROOM.x / PLANKS;
  for (let i = 0; i < PLANKS; i++) {
    const cx = -HX + plankW * (i + 0.5);
    const base = i % 2 === 0 ? PALETTE.floorWood : PALETTE.floorWoodDark;
    box(plankW - 0.7, 3, ROOM.z - 1, 0, cx, -1.5, 0,
      { mat: mat(tint(base, 0.05, 0.06)), cast: false, receive: true });
  }
  collide(-HX, -12, -HZ, HX, 0, HZ); // floor top at y=0

  // =========================================================================
  // WALLS + skirting. Back wall (-z) carries a window opening.
  // =========================================================================
  const wallMatA = mat(PALETTE.wallA);
  const wallMatB = mat(PALETTE.wallB);
  const skirt = mat(new THREE.Color(PALETTE.wallB).offsetHSL(0, 0, -0.12));

  // Front wall (+z)
  box(ROOM.x + WT * 2, H, WT, 0, 0, H / 2, HZ + WT / 2,
    { mat: wallMatB, receive: true, cast: false });
  // Left wall (-x)
  box(WT, H, ROOM.z, 0, -HX - WT / 2, H / 2, 0,
    { mat: wallMatA, receive: true, cast: false });
  // Right wall (+x)
  box(WT, H, ROOM.z, 0, HX + WT / 2, H / 2, 0,
    { mat: wallMatA, receive: true, cast: false });

  // Back wall (-z) built as a frame around a window opening.
  const winCX = 150, winCY = 150, winW = 120, winH = 90;
  const winL = winCX - winW / 2, winR = winCX + winW / 2;
  const winB = winCY - winH / 2, winT = winCY + winH / 2;
  const backZ = -HZ - WT / 2;
  // left of window
  box(winL + HX, H, WT, 0, (-HX + winL) / 2, H / 2, backZ,
    { mat: wallMatB, receive: true, cast: false });
  // right of window
  box(HX - winR, H, WT, 0, (winR + HX) / 2, H / 2, backZ,
    { mat: wallMatB, receive: true, cast: false });
  // below window
  box(winW, winB, WT, 0, winCX, winB / 2, backZ,
    { mat: wallMatB, receive: true, cast: false });
  // above window
  box(winW, H - winT, WT, 0, winCX, (winT + H) / 2, backZ,
    { mat: wallMatB, receive: true, cast: false });

  // Wall colliders (full height; window is too high to reach anyway).
  collide(-HX - WT, 0, -HZ - WT, HX + WT, H, -HZ);          // back
  collide(-HX - WT, 0, HZ, HX + WT, H, HZ + WT);            // front
  collide(-HX - WT, 0, -HZ, -HX, H, HZ);                    // left
  collide(HX, 0, -HZ, HX + WT, H, HZ);                      // right

  // Skirting
  box(ROOM.x, 6, 1.5, 0, 0, 3, HZ - 1, { mat: skirt, cast: false });
  box(1.5, 6, ROOM.z, 0, -HX + 1, 3, 0, { mat: skirt, cast: false });
  box(1.5, 6, ROOM.z, 0, HX - 1, 3, 0, { mat: skirt, cast: false });

  // Window frame + warm glass (emissive; brightens by day in update()).
  const frameMat = mat(0xf5efe0);
  box(winW + 8, 6, 4, 0, winCX, winT + 2, -HZ + 1, { mat: frameMat });
  box(winW + 8, 6, 4, 0, winCX, winB - 2, -HZ + 1, { mat: frameMat });
  box(6, winH + 12, 4, 0, winL - 2, winCY, -HZ + 1, { mat: frameMat });
  box(6, winH + 12, 4, 0, winR + 2, winCY, -HZ + 1, { mat: frameMat });
  box(6, winH, 3, 0, winCX, winCY, -HZ + 1, { mat: frameMat });   // mullion
  const glassMat = mat(0xbfe3f2, { emissive: 0xffe6b0, emissiveIntensity: 0.5 });
  box(winW, winH, 1.5, 0, winCX, winCY, -HZ + 2, { mat: glassMat, cast: false });
  // sky patch behind glass
  box(winW - 4, winH - 4, 1, 0, winCX, winCY, -HZ - 0.5,
    { mat: mat(0xd8effa, { emissive: 0xbfe3f2, emissiveIntensity: 0.4 }), cast: false });

  // Poster on the right wall.
  box(1.2, 60, 46, 0, HX - 1.2, 150, 90,
    { mat: mat(0xf4a261, { emissive: 0xef767a, emissiveIntensity: 0.08 }), cast: false });
  box(1.6, 66, 52, 0, HX - 0.6, 150, 90, { mat: frameMat, cast: false });

  // =========================================================================
  // RUG (visual only).
  // =========================================================================
  cyl(120, 120, 0.6, PALETTE.rug, -20, 0.3, 40,
    { seg: 20, cast: false, receive: true });
  cyl(86, 86, 0.7, PALETTE.rugRing, -20, 0.5, 40,
    { seg: 20, cast: false, receive: true });
  cyl(52, 52, 0.8, PALETTE.rug, -20, 0.7, 40,
    { seg: 20, cast: false, receive: true });

  // =========================================================================
  // DESK (per DESK constants). Top at y=75, four legs.
  // =========================================================================
  const dMinX = DESK.minX, dMaxX = DESK.maxX, dMinZ = DESK.minZ, dMaxZ = DESK.maxZ;
  const dW = dMaxX - dMinX, dD = dMaxZ - dMinZ;
  const dCX = (dMinX + dMaxX) / 2, dCZ = (dMinZ + dMaxZ) / 2;
  box(dW, 5, dD, PALETTE.deskWood, dCX, DESK.topY - 2.5, dCZ,
    { mat: mat(PALETTE.deskWood) });
  // apron
  box(dW - 6, 6, 3, PALETTE.deskWoodLight, dCX, DESK.topY - 8, dMaxZ - 3,
    { mat: mat(PALETTE.deskWoodLight) });
  collide(dMinX, DESK.topY - 5, dMinZ, dMaxX, DESK.topY, dMaxZ);
  // legs
  const legInset = 5, legR = DESK.topY - 5;
  const legPos = [
    [dMinX + legInset, dMinZ + legInset],
    [dMaxX - legInset, dMinZ + legInset],
    [dMinX + legInset, dMaxZ - legInset],
    [dMaxX - legInset, dMaxZ - legInset],
  ];
  for (const [lx, lz] of legPos) {
    box(6, legR, 6, PALETTE.deskWood, lx, legR / 2, lz, { mat: mat(PALETTE.deskWood) });
    collide(lx - 3, 0, lz - 3, lx + 3, legR, lz + 3);
  }

  // Desk lamp (back-left of desk) + point light.
  const lampX = dMinX + 20, lampZ = dMinZ + 14;
  cyl(7, 8, 2.5, 0xef767a, lampX, DESK.topY + 1.25, lampZ, { seg: 10 });
  cyl(1.4, 1.4, 26, 0xd9d9d9, lampX, DESK.topY + 14, lampZ, { seg: 6 });
  const shadeMat = mat(0xf6c453, { emissive: 0xffcf6a, emissiveIntensity: 0.4 });
  const shade = cyl(4, 9, 12, 0xf6c453, lampX, DESK.topY + 30, lampZ,
    { seg: 10, mat: shadeMat });
  const lampLight = new THREE.PointLight(0xffce7a, 0.6, 260, 1.8);
  lampLight.position.set(lampX, DESK.topY + 26, lampZ + 4);
  group.add(lampLight);

  // Pencil cup.
  cyl(4, 4, 12, PALETTE.tubeBlue, dMinX + 40, DESK.topY + 6, dMinZ + 12, { seg: 8 });
  for (let i = 0; i < 4; i++) {
    cyl(0.6, 0.6, 16, pick(TUBES), dMinX + 39 + i * 1.4, DESK.topY + 12,
      dMinZ + 11 + (i % 2), { seg: 5, rz: (i - 1.5) * 0.12, cast: false });
  }

  // =========================================================================
  // BOOK STAIRS — floor up to desk top near the desk front edge.
  // Each step's collider is solid 0..topY; rise <= auto-step (4.5cm).
  // =========================================================================
  const bookX = 200;              // within desk x-range, near right side
  const bookHW = 8;               // half width
  const N_STEPS = 17;
  const tread = 7.5;
  const bookColors = [...TUBES, PALETTE.deskWoodLight, PALETTE.rug];
  for (let k = 1; k <= N_STEPS; k++) {
    const topY = (DESK.topY) * (k / N_STEPS);       // 4.41 .. 75
    const zFar = dMaxZ + (N_STEPS - k) * tread;      // lower steps reach into room
    const zNear = zFar + tread;
    const cz = (zFar + zNear) / 2;
    // solid collider (top surface at topY)
    collide(bookX - bookHW, 0, zFar, bookX + bookHW, topY, zNear);
    // visual: stack of chunky book slabs filling 0..topY
    const slabs = Math.max(1, Math.round(topY / 9));
    const sh = topY / slabs;
    for (let s = 0; s < slabs; s++) {
      const jitter = (Math.random() - 0.5) * 1.6;
      box(bookHW * 2 - 1 + jitter, sh - 0.5, tread - 0.6,
        tint(bookColors[(k + s) % bookColors.length], 0.1, 0.08),
        bookX + (Math.random() - 0.5) * 1.2, sh * (s + 0.5), cz,
        { ry: (Math.random() - 0.5) * 0.08 });
    }
  }

  // =========================================================================
  // CAGE (per CAGE constants). Sits on desk top.
  //   footprint x[cx-w/2, cx+w/2], z[cz-d/2, cz+d/2]
  //   base y[baseY, floorY] solid; bars floorY..floorY+wallH
  //   box colliders on all 4 walls EXCEPT a 20cm gap centered on -z wall.
  // =========================================================================
  const cMinX = CAGE.cx - CAGE.w / 2;   // 120
  const cMaxX = CAGE.cx + CAGE.w / 2;   // 200
  const cMinZ = CAGE.cz - CAGE.d / 2;   // -180
  const cMaxZ = CAGE.cz + CAGE.d / 2;   // -130
  const wallTop = CAGE.floorY + CAGE.wallH; // 110

  // green plastic base tray
  box(CAGE.w, CAGE.floorY - CAGE.baseY, CAGE.d, PALETTE.cageBase,
    CAGE.cx, (CAGE.baseY + CAGE.floorY) / 2, CAGE.cz, { mat: mat(PALETTE.cageBase) });
  // a low base rim (visual, slightly taller lip)
  const rimMat = mat(new THREE.Color(PALETTE.cageBase).offsetHSL(0, 0, -0.06));
  box(CAGE.w, 5, 2, 0, CAGE.cx, CAGE.floorY + 1, cMaxZ - 1, { mat: rimMat, cast: false });
  box(2, 5, CAGE.d, 0, cMinX + 1, CAGE.floorY + 1, CAGE.cz, { mat: rimMat, cast: false });
  box(2, 5, CAGE.d, 0, cMaxX - 1, CAGE.floorY + 1, CAGE.cz, { mat: rimMat, cast: false });

  // cage floor collider (bedding surface at floorY)
  collide(cMinX, CAGE.baseY, cMinZ, cMaxX, CAGE.floorY, cMaxZ);

  // Bedding (noisy-tinted flat bits).
  box(CAGE.w - 4, 0.6, CAGE.d - 4, PALETTE.bedding, CAGE.cx, CAGE.floorY + 0.4, CAGE.cz,
    { mat: mat(tint(PALETTE.bedding, 0.05, 0.05)), cast: false, receive: true });
  for (let i = 0; i < 22; i++) {
    const bx = cMinX + 4 + Math.random() * (CAGE.w - 8);
    const bz = cMinZ + 4 + Math.random() * (CAGE.d - 8);
    box(2 + Math.random() * 2, 1 + Math.random(), 2 + Math.random() * 2,
      tint(PALETTE.bedding, 0.06, 0.1), bx, CAGE.floorY + 0.9, bz,
      { cast: false, ry: Math.random() * 1.5 });
  }

  // Cage wall colliders. Gap of 20cm centered on -z wall at x=CAGE.cx.
  const gapHalf = 10;
  const gapL = CAGE.cx - gapHalf; // 150
  const gapR = CAGE.cx + gapHalf; // 170
  // -z wall (two segments around the gap)
  collide(cMinX - 2, CAGE.baseY, cMinZ - 2, gapL, wallTop, cMinZ + 1);
  collide(gapR, CAGE.baseY, cMinZ - 2, cMaxX + 2, wallTop, cMinZ + 1);
  // +z wall
  collide(cMinX - 2, CAGE.baseY, cMaxZ - 1, cMaxX + 2, wallTop, cMaxZ + 2);
  // -x wall
  collide(cMinX - 2, CAGE.baseY, cMinZ, cMinX + 1, wallTop, cMaxZ);
  // +x wall
  collide(cMaxX - 1, CAGE.baseY, cMinZ, cMaxX + 2, wallTop, cMaxZ);

  // Vertical bars (thin cylinders, visual only, no shadow-cast). Skip the gap.
  const barMat = mat(PALETTE.cageBar, { metalness: 0.1, roughness: 0.6 });
  const barY = (CAGE.floorY + wallTop) / 2;
  const barH = CAGE.wallH;
  function bar(x, z) {
    cyl(0.6, 0.6, barH, PALETTE.cageBar, x, barY, z,
      { seg: 5, mat: barMat, cast: false, receive: false });
  }
  const barStep = 7;
  for (let x = cMinX; x <= cMaxX + 0.1; x += barStep) {
    bar(x, cMaxZ);                                   // +z wall
    if (x < gapL - 0.1 || x > gapR + 0.1) bar(x, cMinZ); // -z wall w/ gap
  }
  for (let z = cMinZ; z <= cMaxZ + 0.1; z += barStep) {
    bar(cMinX, z);                                   // -x wall
    bar(cMaxX, z);                                   // +x wall
  }
  // top rails (thin boxes)
  box(CAGE.w + 2, 1.4, 1.4, 0, CAGE.cx, wallTop, cMaxZ, { mat: barMat, cast: false });
  box(2, 1.4, CAGE.d, 0, cMinX, wallTop, CAGE.cz, { mat: barMat, cast: false });
  box(2, 1.4, CAGE.d, 0, cMaxX, wallTop, CAGE.cz, { mat: barMat, cast: false });
  // -z top rail in two pieces around the gap
  box(gapL - cMinX + 2, 1.4, 1.4, 0, (cMinX + gapL) / 2, wallTop, cMinZ, { mat: barMat, cast: false });
  box(cMaxX - gapR + 2, 1.4, 1.4, 0, (gapR + cMaxX) / 2, wallTop, cMinZ, { mat: barMat, cast: false });

  // Little ramp/door at the -z gap: cage floor (78) down to desk (75).
  const rampMat = mat(PALETTE.deskWoodLight);
  box(20, 1.2, 12, 0, CAGE.cx, 76.4, cMinZ - 4, { mat: rampMat, cast: false, rx: -0.14 });
  // tiny door frame posts flanking the gap
  cyl(0.7, 0.7, barH, PALETTE.cageBar, gapL, barY, cMinZ, { seg: 5, mat: barMat, cast: false });
  cyl(0.7, 0.7, barH, PALETTE.cageBar, gapR, barY, cMinZ, { seg: 5, mat: barMat, cast: false });

  // Water bottle on the OUTSIDE of the +x cage wall.
  const wbX = cMaxX + 5, wbZ = CAGE.cz;
  cyl(4, 4.5, 16, PALETTE.tubeBlue, wbX, CAGE.floorY + 20, wbZ,
    { seg: 8, mat: mat(PALETTE.tubeBlue, { transparent: true, opacity: 0.85 }) });
  cyl(4, 2.5, 4, 0xd9d9d9, wbX, CAGE.floorY + 30, wbZ, { seg: 8 }); // cap
  cyl(0.8, 0.8, 8, 0xb8b8b8, wbX - 3, CAGE.floorY + 8, wbZ, { seg: 6, rz: 0.7 }); // nozzle
  // water zone (drink)
  zones.push({
    type: 'water',
    min: { x: wbX - 6, y: CAGE.floorY, z: wbZ - 6 },
    max: { x: wbX + 6, y: CAGE.floorY + 18, z: wbZ + 6 },
  });

  // =========================================================================
  // BED (front-right corner). Mattress top is a bounce zone.
  //   Blanket steps descend to the floor as a ramp of steps.
  // =========================================================================
  const bedMinX = 130, bedMaxX = 240, bedMinZ = 108, bedMaxZ = 195;
  const bedW = bedMaxX - bedMinX, bedD = bedMaxZ - bedMinZ;
  const bedCX = (bedMinX + bedMaxX) / 2, bedCZ = (bedMinZ + bedMaxZ) / 2;
  const frameTop = 16, matTop = 30;
  // frame
  box(bedW, frameTop, bedD, PALETTE.deskWood, bedCX, frameTop / 2, bedCZ,
    { mat: mat(PALETTE.deskWood) });
  // mattress
  box(bedW - 6, matTop - frameTop, bedD - 6, 0, bedCX, (frameTop + matTop) / 2, bedCZ,
    { mat: mat(0x9ec9e6) });
  // headboard (against +z wall)
  box(bedW, 34, 5, PALETTE.deskWoodLight, bedCX, 17, bedMaxZ + 1,
    { mat: mat(PALETTE.deskWoodLight) });
  // pillow
  box(40, 8, 24, 0xfbf1dc, bedCX, matTop + 3, bedMaxZ - 18, { mat: mat(0xfbf1dc) });
  // blanket (a colored slab on the mattress)
  box(bedW - 6, 3, bedD * 0.55, PALETTE.rug, bedCX, matTop + 1, bedMinZ + bedD * 0.28,
    { mat: mat(tint(PALETTE.rug, 0.05, 0.05)), cast: false });
  // bed colliders: frame body + mattress ledge
  collide(bedMinX, 0, bedMinZ, bedMaxX, matTop, bedMaxZ);

  // Bounce zone across the mattress top (player center sits ~3cm above top).
  zones.push({
    type: 'bounce',
    min: { x: bedMinX + 3, y: matTop, z: bedMinZ + 3 },
    max: { x: bedMaxX - 3, y: matTop + 12, z: bedMaxZ - 3 },
    power: 1.0,
  });

  // Blanket steps: draped down the front (-z) side to the floor.
  const B_STEPS = 7;
  const bStepTread = 7;
  const blanketColors = [PALETTE.rug, PALETTE.rugRing];
  for (let k = 1; k <= B_STEPS; k++) {
    const topY = matTop * (k / B_STEPS);            // ~4.28 .. 30
    const zFar = bedMinZ - (B_STEPS - k) * bStepTread; // lower steps further into room
    const zNear = zFar - bStepTread;                   // (zNear < zFar, toward -z)
    const czb = (zFar + zNear) / 2;
    collide(bedMinX + 6, 0, zNear, bedMaxX - 6, topY, zFar);
    box(bedW - 14, topY, bStepTread - 0.6,
      tint(blanketColors[k % 2], 0.05, 0.06), bedCX, topY / 2, czb,
      { cast: true, receive: true });
  }

  // =========================================================================
  // BOOKSHELF against the left wall (visual furniture + collider).
  // =========================================================================
  const shX0 = -HX + WT / 2, shW = 34, shD = 96, shH = 100;
  const shCX = shX0 + shW / 2, shCZ = -30;
  box(shW, shH, shD, PALETTE.deskWood, shCX, shH / 2, shCZ, { mat: mat(PALETTE.deskWood) });
  collide(shX0 - 1, 0, shCZ - shD / 2, shX0 + shW, shH, shCZ + shD / 2);
  // shelf boards + books
  for (let s = 0; s < 3; s++) {
    const sy = 22 + s * 30;
    box(shW - 4, 2, shD - 4, PALETTE.deskWoodLight, shCX, sy, shCZ,
      { mat: mat(PALETTE.deskWoodLight), cast: false });
    let bz = shCZ - shD / 2 + 8;
    while (bz < shCZ + shD / 2 - 8) {
      const bw = 4 + Math.random() * 3;
      const bh = 14 + Math.random() * 8;
      box(shW - 12, bh, bw, tint(pick(TUBES), 0.12, 0.1),
        shCX + 2, sy + 1 + bh / 2, bz + bw / 2, { cast: false });
      bz += bw + 0.6;
    }
  }

  // =========================================================================
  // SCATTERED TOY BLOCKS (colliders — fun little ledges).
  // =========================================================================
  const blockSpots = [
    [-150, 128, 15], [-118, 150, 13], [-92, 118, 14],
    [40, 150, 13], [78, 122, 16],
  ];
  for (const [bx, bz, bs] of blockSpots) {
    box(bs, bs, bs, tint(pick(TUBES), 0.1, 0.08), bx, bs / 2, bz, { ry: Math.random() });
    collide(bx - bs / 2, 0, bz - bs / 2, bx + bs / 2, bs, bz + bs / 2);
  }

  // Toy ball (visual, low-poly icosahedron) on the rug.
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(10, 0),
    mat(PALETTE.tubeRed));
  ball.position.set(30, 10, 120);
  ball.castShadow = true; ball.receiveShadow = true;
  group.add(ball);

  // =========================================================================
  // LIGHTING
  // =========================================================================
  const hemi = new THREE.HemisphereLight(PALETTE.day, 0x8a6b4f, 0.6);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d4, 1.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -300; sc.right = 300; sc.top = 300; sc.bottom = -300;
  sc.near = 1; sc.far = 1400;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.6;
  sun.position.set(120, 400, -300);
  const sunTarget = new THREE.Object3D();
  sunTarget.position.set(120, 40, -120);
  group.add(sunTarget);
  sun.target = sunTarget;
  group.add(sun);

  // =========================================================================
  // DAY / NIGHT CYCLE (~4 minutes)
  // =========================================================================
  const nightCol = new THREE.Color(PALETTE.night);
  const dayCol = new THREE.Color(PALETTE.day);
  const sunWarm = new THREE.Color(0xffb066);
  const sunNoon = new THREE.Color(0xfff2d4);
  const groundNight = new THREE.Color(0x1a2238);
  const groundDay = new THREE.Color(0x8a6b4f);
  const skyColor = new THREE.Color(PALETTE.day);
  group.userData.skyColor = skyColor;

  const TWO_PI = Math.PI * 2;
  const CYCLE = 240; // seconds for a full day/night loop

  function update(dt, elapsed) {
    const ang = ((elapsed % CYCLE) / CYCLE) * TWO_PI;
    const sunH = Math.sin(ang);                                // -1..1
    const day = THREE.MathUtils.clamp(sunH * 0.5 + 0.5, 0, 1); // 0 night .. 1 noon

    // Sky / background tint for main.js.
    skyColor.copy(nightCol).lerp(dayCol, day);

    // Sun orbits and streams through the back (-z) window; keep it above.
    const sy = 110 + Math.max(sunH, -0.15) * 340;
    sun.position.set(Math.cos(ang) * 260, sy, -300 + Math.sin(ang) * 70);
    sun.intensity = 0.12 + day * 1.05;
    sun.color.copy(sunWarm).lerp(sunNoon, day);

    // Ambient sky fill.
    hemi.intensity = 0.22 + day * 0.55;
    hemi.color.copy(nightCol).lerp(dayCol, day);
    hemi.groundColor.copy(groundNight).lerp(groundDay, day);

    // Warm lamp brightens at night.
    lampLight.intensity = 0.2 + (1 - day) * 1.9;
    shadeMat.emissiveIntensity = 0.15 + (1 - day) * 0.95;

    // Window glass glows with daylight.
    glassMat.emissiveIntensity = 0.12 + day * 0.9;
  }

  // Prime lighting for frame 0.
  update(0, 0);

  return { group, colliders, zones, update };
}
