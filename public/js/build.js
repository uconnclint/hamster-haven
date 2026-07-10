// Build mode: aim with the camera, ghost preview on the grid, place/rotate/delete.
import * as THREE from 'three';
import { GRID, VSTEP, ROOM } from './config.js';
import { PART_TYPES, CATALOG, buildPartMesh } from './parts.js';

export class BuildMode {
  constructor(scene, camera, physics) {
    this.scene = scene;
    this.camera = camera;
    this.physics = physics;
    this.active = false;
    this.sel = 0;
    this.rot = 0;
    this.ghost = null;
    this.ghostKey = '';
    this.target = null;        // {gx, gy, gz, valid}
    this.deleteHover = null;   // partId under crosshair when holding delete intent
  }

  get selectedType() { return CATALOG[this.sel].type; }

  setSelected(i) {
    this.sel = ((i % CATALOG.length) + CATALOG.length) % CATALOG.length;
    this._refreshGhost(true);
  }

  cycle(dir) { this.setSelected(this.sel + dir); }

  rotate() {
    this.rot = (this.rot + 1) & 3;
    this._refreshGhost(true);
  }

  enter() { this.active = true; }

  exit() {
    this.active = false;
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; this.ghostKey = ''; }
  }

  // Aim ray through the mouse cursor (or camera center as fallback); snap hit
  // point to grid. partMeshes: Map id->mesh for delete picking.
  update(partMeshes, ndc) {
    if (!this.active) return;
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    if (ndc) {
      this._ray = this._ray || new THREE.Raycaster();
      this._ray.setFromCamera(ndc, this.camera);
      origin.copy(this._ray.ray.origin);
      dir.copy(this._ray.ray.direction);
    } else {
      origin.copy(this.camera.position);
      this.camera.getWorldDirection(dir);
    }
    this._aimOrigin = origin;
    this._aimDir = dir;
    const hit = this.physics.raycast(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: dir.x, y: dir.y, z: dir.z },
      300
    );

    if (!hit) {
      this.target = null;
      if (this.ghost) this.ghost.visible = false;
      return;
    }

    // Nudge along normal so we land in the empty cell adjacent to the hit face,
    // then snap to grid.
    const def = PART_TYPES[this.selectedType];
    const [sx, sz] = def.size;
    const fx = (this.rot % 2 === 1 ? sz : sx) * GRID;
    const fz = (this.rot % 2 === 1 ? sx : sz) * GRID;
    const px = hit.point.x + hit.normal.x * 0.5 - fx / 2;
    const py = hit.point.y + hit.normal.y * 0.5;
    const pz = hit.point.z + hit.normal.z * 0.5 - fz / 2;
    const gx = Math.round(px / GRID);
    const gz = Math.round(pz / GRID);
    const gy = Math.max(0, Math.round(py / VSTEP));

    const valid =
      gx * GRID >= -ROOM.x / 2 && gx * GRID + fx <= ROOM.x / 2 &&
      gz * GRID >= -ROOM.z / 2 && gz * GRID + fz <= ROOM.z / 2 &&
      gy * VSTEP + 30 <= ROOM.h;

    this.target = { gx, gy, gz, valid };
    this._refreshGhost(false);
    if (this.ghost) {
      const part = { id: 'ghost', type: this.selectedType, gx, gy, gz, rot: this.rot };
      const origin = this._ghostOrigin(part, def);
      this.ghost.position.copy(origin);
      this.ghost.rotation.y = -this.rot * Math.PI / 2;
      this.ghost.visible = true;
      this.ghost.traverse((m) => {
        if (m.isMesh) {
          m.material.opacity = valid ? 0.55 : 0.25;
          m.material.color.set(valid ? 0xffffff : 0xff5555);
        }
      });
    }

    // Delete hover: nearest part mesh under the ray
    this.deleteHover = null;
    let bestD = 200;
    const ray = new THREE.Raycaster(this._aimOrigin, this._aimDir, 1, 200);
    for (const [id, mesh] of partMeshes) {
      const hits = ray.intersectObject(mesh, true);
      if (hits.length && hits[0].distance < bestD) {
        bestD = hits[0].distance;
        this.deleteHover = id;
      }
    }
  }

  _ghostOrigin(part, def) {
    const [sx, sz] = def.size;
    const fx = (part.rot % 2 === 1 ? sz : sx) * GRID;
    const fz = (part.rot % 2 === 1 ? sx : sz) * GRID;
    return new THREE.Vector3(part.gx * GRID + fx / 2, part.gy * VSTEP, part.gz * GRID + fz / 2);
  }

  _refreshGhost(force) {
    const key = this.selectedType + ':' + this.rot;
    if (!force && key === this.ghostKey && this.ghost) return;
    if (this.ghost) this.scene.remove(this.ghost);
    const part = { id: 'ghost', type: this.selectedType, gx: 0, gy: 0, gz: 0, rot: this.rot };
    this.ghost = buildPartMesh(part);
    this.ghost.traverse((m) => {
      if (m.isMesh) {
        m.material = m.material.clone();
        m.material.transparent = true;
        m.material.opacity = 0.55;
        m.material.depthWrite = false;
        m.castShadow = false;
        m.receiveShadow = false;
      }
    });
    this.ghostKey = key;
    this.scene.add(this.ghost);
  }

  // Returns a part spec to send to the server, or null.
  placeSpec() {
    if (!this.target?.valid) return null;
    return { type: this.selectedType, gx: this.target.gx, gy: this.target.gy, gz: this.target.gz, rot: this.rot };
  }
}

export { CATALOG };
