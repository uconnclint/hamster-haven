// Hamster Haven on Cloudflare: Workers static assets + one Durable Object per room.
// Same wire protocol as the Node server (server.js); parts/scores also persist
// to DO storage so a room survives restarts.
import { DurableObject } from 'cloudflare:workers';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const MAX_PLAYERS = 8;
const MAX_PARTS = 600;
const MAX_SEEDS = 30;
const SEED_INTERVAL = 4500;

const SEED_AREAS = [
  [125, 195, 79, -176, -136, 4],   // cage bedding
  [95, 225, 76, -190, -120, 2],    // desk top
  [-230, 230, 1, -180, 180, 3],    // room floor
  [-160, -40, 1, -60, 60, 2],      // rug area
];

function makeCode() {
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return c;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const mode = url.searchParams.get('mode');
      let code = (url.searchParams.get('code') || '').toUpperCase().trim();
      if (mode === 'create') code = makeCode();
      if (!/^[A-Z]{5}$/.test(code)) return new Response('bad code', { status: 400 });
      url.searchParams.set('code', code);
      return env.ROOM.getByName(code).fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};

export class RoomDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.code = null;
    this.created = false;
    this.parts = new Map();
    this.seeds = new Map();
    this.nextId = 1;
    this.lastSeedAt = 0;
    this.tickTimer = null;
    this.players = new Map(); // ws -> player (rebuilt from attachments after eviction)
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get(['meta', 'parts']);
      const meta = saved.get('meta');
      if (meta) {
        this.created = true;
        this.code = meta.code;
        this.nextId = meta.nextId || 1;
      }
      for (const p of saved.get('parts') || []) this.parts.set(p.id, p);
      for (const ws of ctx.getWebSockets()) this._restore(ws);
      if (this.players.size) this._startTick();
    });
  }

  _restore(ws) {
    const att = ws.deserializeAttachment?.();
    if (att) this.players.set(ws, att);
  }

  _persist() {
    this.ctx.storage.put('meta', { code: this.code, nextId: this.nextId });
    this.ctx.storage.put('parts', [...this.parts.values()]);
  }

  _save(ws, player) {
    this.players.set(ws, player);
    ws.serializeAttachment(player);
  }

  _broadcast(msg, exceptWs = null) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exceptWs && ws.readyState === 1) {
        try { ws.send(data); } catch {}
      }
    }
  }

  _playerList() {
    return [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, colorIndex: p.colorIndex, carrying: p.carrying, banked: p.banked,
    }));
  }

  _spawnSeed() {
    const total = SEED_AREAS.reduce((s, a) => s + a[5], 0);
    let r = Math.random() * total;
    let area = SEED_AREAS[0];
    for (const a of SEED_AREAS) { r -= a[5]; if (r <= 0) { area = a; break; } }
    const [minX, maxX, y, minZ, maxZ] = area;
    const seed = {
      id: 's' + this.nextId++,
      x: minX + Math.random() * (maxX - minX),
      y,
      z: minZ + Math.random() * (maxZ - minZ),
    };
    this.seeds.set(seed.id, seed);
    return seed;
  }

  _startTick() {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this._tick(), 1000 / 15);
  }

  _tick() {
    if (this.players.size === 0) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
      return;
    }
    const now = Date.now();
    if (this.seeds.size < MAX_SEEDS && now - this.lastSeedAt > SEED_INTERVAL) {
      this.lastSeedAt = now;
      this._broadcast({ t: 'seed', seed: this._spawnSeed() });
    }
    const states = [];
    for (const p of this.players.values()) if (p.state) states.push({ id: p.id, ...p.state });
    if (states.length) this._broadcast({ t: 'states', states, now });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(null);
    // stash the routing intent on the socket until the first protocol message
    this._pending = this._pending || new WeakMap();
    this._pending.set(pair[1], { mode: url.searchParams.get('mode'), code });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (typeof msg !== 'object' || !msg) return;

    let me = this.players.get(ws);
    if (!me && !this.players.has(ws)) this._restore(ws), me = this.players.get(ws);

    if (msg.t === 'create' || msg.t === 'join') {
      if (me) return;
      const pending = this._pending?.get(ws);
      const code = pending?.code || this.code;
      if (msg.t === 'join' && !this.created) {
        ws.send(JSON.stringify({ t: 'error', reason: 'no_room' }));
        ws.close(1000, 'no room');
        return;
      }
      if (this.players.size >= MAX_PLAYERS) {
        ws.send(JSON.stringify({ t: 'error', reason: 'full' }));
        ws.close(1000, 'full');
        return;
      }
      if (!this.created) {
        this.created = true;
        this.code = code;
        for (let i = 0; i < 8; i++) this._spawnSeed();
        this._persist();
      }
      const player = {
        id: 'p' + this.nextId++,
        name: String(msg.name || 'Hamster').slice(0, 16),
        colorIndex: Math.max(0, Math.min(5, msg.colorIndex | 0)),
        carrying: 0, banked: 0, state: null,
      };
      this._save(ws, player);
      if (this.seeds.size < 8) for (let i = this.seeds.size; i < 8; i++) this._spawnSeed();
      ws.send(JSON.stringify({
        t: 'joined', id: player.id, code: this.code,
        parts: [...this.parts.values()],
        seeds: [...this.seeds.values()],
        players: this._playerList(),
      }));
      this._broadcast({ t: 'player_joined', player: { id: player.id, name: player.name, colorIndex: player.colorIndex, carrying: 0, banked: 0 } }, ws);
      this._startTick();
      return;
    }

    if (!me) return;

    switch (msg.t) {
      case 'state':
        me.state = { p: msg.p, yaw: msg.yaw, anim: msg.anim };
        break;
      case 'place': {
        if (this.parts.size >= MAX_PARTS) { ws.send(JSON.stringify({ t: 'error', reason: 'part_limit' })); return; }
        const q = msg.part || {};
        const part = {
          id: 'b' + this.nextId++,
          type: String(q.type || '').slice(0, 24),
          gx: q.gx | 0, gy: q.gy | 0, gz: q.gz | 0, rot: (q.rot | 0) & 3,
          owner: me.id,
        };
        this.parts.set(part.id, part);
        this._persist();
        this._broadcast({ t: 'placed', part });
        break;
      }
      case 'remove':
        if (this.parts.delete(msg.id)) {
          this._persist();
          this._broadcast({ t: 'removed', id: msg.id });
        }
        break;
      case 'collect': {
        const seed = this.seeds.get(msg.id);
        if (!seed) return;
        if (me.carrying >= (msg.max | 0 || 10)) return;
        this.seeds.delete(msg.id);
        me.carrying++;
        this._save(ws, me);
        this._broadcast({ t: 'seed_gone', id: msg.id, by: me.id, carrying: me.carrying });
        break;
      }
      case 'deposit': {
        if (me.carrying <= 0) return;
        const n = me.carrying;
        me.banked += n;
        me.carrying = 0;
        this._save(ws, me);
        this._broadcast({ t: 'deposited', id: me.id, n, banked: me.banked });
        break;
      }
      case 'emote':
        this._broadcast({ t: 'emote', id: me.id, e: msg.e | 0 });
        break;
    }
  }

  webSocketClose(ws) {
    const me = this.players.get(ws);
    this.players.delete(ws);
    if (me) this._broadcast({ t: 'player_left', id: me.id });
  }

  webSocketError(ws) {
    this.webSocketClose(ws);
  }
}
