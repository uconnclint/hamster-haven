// Local player: input, movement, jumping, climbing, dashing, plus the follow camera.
import * as THREE from 'three';
import { PLAYER, CAGE } from './config.js';
import { makeBody } from './physics.js';

export class PlayerController {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.body = makeBody(CAGE.cx, CAGE.floorY + PLAYER.height / 2 + 2, CAGE.cz + 8);
    this.yaw = Math.PI;            // facing -z (toward cage door)
    this.camYaw = Math.PI;
    this.camPitch = 0.42;
    this.camDist = 42;
    this.grounded = false;
    this.climbing = false;
    this.dashUntil = 0;
    this.dashCooldownUntil = 0;
    this.keys = new Set();
    this.enabled = false;          // gates game keys (menu / chat open)
    this.speedNorm = 0;            // 0..1 for animation
    this.events = [];              // 'jump'|'land'|'dash'|'bounce' since last poll

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas) {
        this.camYaw -= e.movementX * 0.0032;
        this.camPitch = Math.max(-0.3, Math.min(1.25, this.camPitch + e.movementY * 0.0032));
      }
    });
    document.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.camDist = Math.max(18, Math.min(120, this.camDist + e.deltaY * 0.05));
    }, { passive: true });
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  respawn() {
    this.body.pos = { x: CAGE.cx, y: CAGE.floorY + PLAYER.height / 2 + 2, z: CAGE.cz + 8 };
    this.body.vel = { x: 0, y: 0, z: 0 };
  }

  update(dt, physics) {
    const b = this.body;
    const k = this.keys;
    const now = performance.now();
    const active = this.enabled;

    // Zones at player center
    const zones = physics.zonesAt(b.pos);
    const inClimb = zones.some((z) => z.type === 'climb');
    const bounceZone = zones.find((z) => z.type === 'bounce');
    this.zones = zones;

    // Input direction relative to camera yaw
    let ix = 0, iz = 0;
    if (active) {
      if (k.has('KeyW') || k.has('ArrowUp')) iz -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) iz += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
    }
    const moving = ix !== 0 || iz !== 0;
    let wx = 0, wz = 0;
    if (moving) {
      const len = Math.hypot(ix, iz);
      const s = Math.sin(this.camYaw), c = Math.cos(this.camYaw);
      wx = (ix * c + iz * s) / len;
      wz = (-ix * s + iz * c) / len; // camera looks along -z at yaw 0
      this.yaw = Math.atan2(wx, wz);
    }

    // Dash
    const dashing = now < this.dashUntil;
    if (active && (k.has('ShiftLeft') || k.has('ShiftRight')) && moving && now > this.dashCooldownUntil) {
      this.dashUntil = now + 260;
      this.dashCooldownUntil = now + 900;
      this.events.push('dash');
    }
    const targetSpeed = dashing ? PLAYER.dashSpeed : PLAYER.speed;

    // Horizontal accel
    const ax = wx * targetSpeed - b.vel.x;
    const az = wz * targetSpeed - b.vel.z;
    const blend = Math.min(1, dt * (this.grounded || inClimb ? 9 : 4));
    b.vel.x += ax * blend;
    b.vel.z += az * blend;

    // Vertical: climb / jump / gravity / bounce
    this.climbing = inClimb;
    if (inClimb) {
      let cy = 0;
      if (active && (k.has('Space') || k.has('KeyW') || k.has('ArrowUp'))) cy = 1;
      else if (active && (k.has('KeyS') || k.has('ArrowDown'))) cy = -0.8;
      b.vel.y += (cy * PLAYER.climbSpeed - b.vel.y) * Math.min(1, dt * 10);
      // damp horizontal drift inside the tube so you stay centered-ish
      b.vel.x *= 1 - Math.min(1, dt * 2);
      b.vel.z *= 1 - Math.min(1, dt * 2);
    } else {
      b.vel.y -= PLAYER.gravity * dt;
      if (active && k.has('Space') && this.grounded) {
        b.vel.y = PLAYER.jumpVel;
        this.grounded = false;
        this.events.push('jump');
      }
      if (bounceZone && b.vel.y <= 0) {
        b.vel.y = bounceZone.power || 240;
        this.events.push('bounce');
      }
    }
    b.vel.y = Math.max(-380, b.vel.y);

    // Hamster wheel: gentle spring toward the wheel center so running feels
    // like running *in* the wheel instead of escaping it.
    const wheelZone = zones.find((z) => z.type === 'wheel');
    if (wheelZone && this.grounded) {
      const cx = (wheelZone.min.x + wheelZone.max.x) / 2;
      const cz = (wheelZone.min.z + wheelZone.max.z) / 2;
      b.vel.x += (cx - b.pos.x) * dt * 60;
      b.vel.z += (cz - b.pos.z) * dt * 60;
    }

    // Integrate + collide
    const wasGrounded = this.grounded;
    const res = physics.move(b, dt);
    this.grounded = res.grounded;
    if (this.grounded && !wasGrounded && !inClimb) this.events.push('land');

    this.speedNorm = Math.min(1, Math.hypot(b.vel.x, b.vel.z) / PLAYER.speed);

    // Camera follow with collision-free simple pullback
    const target = new THREE.Vector3(b.pos.x, b.pos.y + 6, b.pos.z);
    const off = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch)
    ).multiplyScalar(this.camDist);
    // pull the camera in front of walls/furniture between it and the hamster
    const dirN = off.clone().normalize();
    const hit = physics.raycast(
      { x: target.x, y: target.y, z: target.z },
      { x: dirN.x, y: dirN.y, z: dirN.z },
      this.camDist + 2
    );
    const dist = hit ? Math.max(8, hit.dist - 2.5) : this.camDist;
    const desired = target.clone().add(dirN.multiplyScalar(dist));
    // keep camera above floor
    desired.y = Math.max(desired.y, 4);
    this.camera.position.lerp(desired, Math.min(1, dt * (hit ? 20 : 8)));
    this.camera.lookAt(target);
  }

  takeEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}
