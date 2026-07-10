// Minimal, sturdy box-vs-box physics for a small hamster in a big world.
// The player is an AABB (half-extents hx, hy, hz around its center).
// Colliders: { type:'box', min:{x,y,z}, max:{x,y,z} }.
// Zones:     { type:'bounce'|'climb'|'bank'|'wheel'|'water', min, max, ... }.
import { PLAYER, ROOM } from './config.js';

const STEP_HEIGHT = 4.5;   // auto-step onto ledges this tall
const EPS = 0.001;

export class Physics {
  constructor() {
    this.staticColliders = [];   // world
    this.partColliders = new Map(); // partId -> Collider[]
    this.zones = [];             // world zones
    this.partZones = new Map();  // partId -> Zone[]
    this._all = [];
    this._dirty = true;
  }

  setWorld(colliders, zones) {
    this.staticColliders = colliders || [];
    this.zones = zones || [];
    this._dirty = true;
  }

  addPart(id, colliders, zones) {
    if (colliders?.length) this.partColliders.set(id, colliders);
    if (zones?.length) this.partZones.set(id, zones);
    this._dirty = true;
  }

  removePart(id) {
    this.partColliders.delete(id);
    this.partZones.delete(id);
    this._dirty = true;
  }

  colliders() {
    if (this._dirty) {
      this._all = [...this.staticColliders];
      for (const list of this.partColliders.values()) this._all.push(...list);
      this._dirty = false;
    }
    return this._all;
  }

  allZones() {
    const out = [...this.zones];
    for (const list of this.partZones.values()) out.push(...list);
    return out;
  }

  zonesAt(p) {
    const out = [];
    for (const z of this.allZones()) {
      if (p.x >= z.min.x && p.x <= z.max.x &&
          p.y >= z.min.y && p.y <= z.max.y &&
          p.z >= z.min.z && p.z <= z.max.z) out.push(z);
    }
    return out;
  }

  // Move body { pos (center), vel, hx, hy, hz } by vel*dt with collision + step-up.
  // Substeps so fast falls can't tunnel through thin slabs. Returns { grounded, hitWall }.
  move(body, dt) {
    const maxDisp = Math.max(Math.abs(body.vel.x), Math.abs(body.vel.y), Math.abs(body.vel.z)) * dt;
    const n = Math.min(10, Math.max(1, Math.ceil(maxDisp / 2.5)));
    let grounded = false, hitWall = false;
    for (let i = 0; i < n; i++) {
      const r = this._step(body, dt / n);
      grounded = r.grounded || grounded;
      hitWall = r.hitWall || hitWall;
    }
    return { grounded, hitWall };
  }

  _step(body, dt) {
    const cols = this.colliders();
    let grounded = false, hitWall = false;

    // --- Y axis
    body.pos.y += body.vel.y * dt;
    for (const c of cols) {
      if (!overlap(body, c)) continue;
      if (body.vel.y <= 0 && body.pos.y - body.vel.y * dt - body.hy >= c.max.y - 1.5) {
        body.pos.y = c.max.y + body.hy + EPS;
        body.vel.y = 0;
        grounded = true;
      } else if (body.vel.y > 0) {
        body.pos.y = c.min.y - body.hy - EPS;
        body.vel.y = 0;
      }
    }
    if (body.pos.y - body.hy <= 0) { // room floor
      body.pos.y = body.hy;
      if (body.vel.y < 0) body.vel.y = 0;
      grounded = true;
    }

    // --- X then Z, with step-up attempts
    hitWall = this._axis(body, body.vel.x * dt, 'x', grounded) || hitWall;
    hitWall = this._axis(body, body.vel.z * dt, 'z', grounded) || hitWall;

    // Room bounds
    const bx = ROOM.x / 2 - body.hx, bz = ROOM.z / 2 - body.hz;
    body.pos.x = Math.max(-bx, Math.min(bx, body.pos.x));
    body.pos.z = Math.max(-bz, Math.min(bz, body.pos.z));

    return { grounded, hitWall };
  }

  _axis(body, delta, axis, grounded) {
    if (delta === 0) return false;
    body.pos[axis] += delta;
    let hit = false;
    for (const c of this.colliders()) {
      if (!overlap(body, c)) continue;
      // Try stepping up small ledges while moving on ground.
      const rise = c.max.y - (body.pos.y - body.hy);
      if (grounded && rise > 0 && rise <= STEP_HEIGHT && this._fits(body, body.pos.x, c.max.y + body.hy + EPS, body.pos.z)) {
        body.pos.y = c.max.y + body.hy + EPS;
        continue;
      }
      hit = true;
      if (delta > 0) body.pos[axis] = c.min[axis] - (axis === 'x' ? body.hx : body.hz) - EPS;
      else body.pos[axis] = c.max[axis] + (axis === 'x' ? body.hx : body.hz) + EPS;
    }
    return hit;
  }

  _fits(body, x, y, z) {
    const probe = { pos: { x, y, z }, hx: body.hx, hy: body.hy, hz: body.hz };
    for (const c of this.colliders()) if (overlap(probe, c)) return false;
    return true;
  }

  // Ray vs all colliders (for build-mode aiming). Returns { point, normal, dist } or null.
  raycast(origin, dir, maxDist = 400) {
    let best = null;
    for (const c of this.colliders()) {
      const hit = rayBox(origin, dir, c.min, c.max, maxDist);
      if (hit && (!best || hit.dist < best.dist)) best = hit;
    }
    // floor plane y=0
    if (dir.y < -1e-6) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < maxDist && (!best || t < best.dist)) {
        best = {
          dist: t,
          point: { x: origin.x + dir.x * t, y: 0, z: origin.z + dir.z * t },
          normal: { x: 0, y: 1, z: 0 },
        };
      }
    }
    return best;
  }
}

function overlap(body, c) {
  return body.pos.x + body.hx > c.min.x && body.pos.x - body.hx < c.max.x &&
         body.pos.y + body.hy > c.min.y && body.pos.y - body.hy < c.max.y &&
         body.pos.z + body.hz > c.min.z && body.pos.z - body.hz < c.max.z;
}

function rayBox(o, d, min, max, maxDist) {
  let tmin = 0, tmax = maxDist, nAxis = 'x', nSign = 1;
  for (const a of ['x', 'y', 'z']) {
    const inv = 1 / (d[a] || 1e-10);
    let t0 = (min[a] - o[a]) * inv;
    let t1 = (max[a] - o[a]) * inv;
    let sign = -Math.sign(inv);
    if (t0 > t1) { [t0, t1] = [t1, t0]; }
    if (t0 > tmin) { tmin = t0; nAxis = a; nSign = sign; }
    tmax = Math.min(tmax, t1);
    if (tmin > tmax) return null;
  }
  if (tmin <= 0 || tmin >= maxDist) return null;
  const point = { x: o.x + d.x * tmin, y: o.y + d.y * tmin, z: o.z + d.z * tmin };
  const normal = { x: 0, y: 0, z: 0 };
  normal[nAxis] = nSign;
  return { dist: tmin, point, normal };
}

export function makeBody(x, y, z) {
  return {
    pos: { x, y, z },
    vel: { x: 0, y: 0, z: 0 },
    hx: PLAYER.radius, hy: PLAYER.height / 2, hz: PLAYER.radius,
  };
}
