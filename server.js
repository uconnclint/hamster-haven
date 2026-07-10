// Hamster Haven — game server: static files + WebSocket rooms with shareable codes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3210;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC, urlPath));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- rooms

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I/L/O — unambiguous
const rooms = new Map(); // code -> room
const MAX_PLAYERS = 8;
const MAX_PARTS = 600;
const MAX_SEEDS = 30;
const SEED_INTERVAL = 4500;

function makeCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
}

function makeRoom(code) {
  return {
    code,
    players: new Map(),   // id -> { ws, name, colorIndex, carrying, banked, state }
    parts: new Map(),     // id -> { id, type, gx, gy, gz, rot, owner }
    seeds: new Map(),     // id -> { id, x, y, z }
    nextId: 1,
    lastSeedAt: 0,
    emptySince: null,
  };
}

// Seed spawn areas: [minX, maxX, y, minZ, maxZ, weight] — cage floor, desk top, room floor.
const SEED_AREAS = [
  [125, 195, 79, -176, -136, 4],   // cage bedding
  [95, 225, 76, -190, -120, 2],    // desk top
  [-230, 230, 1, -180, 180, 3],    // room floor
  [-160, -40, 1, -60, 60, 2],      // rug area
];

function spawnSeed(room) {
  const total = SEED_AREAS.reduce((s, a) => s + a[5], 0);
  let r = Math.random() * total;
  let area = SEED_AREAS[0];
  for (const a of SEED_AREAS) { r -= a[5]; if (r <= 0) { area = a; break; } }
  const [minX, maxX, y, minZ, maxZ] = area;
  const id = 's' + room.nextId++;
  const seed = {
    id,
    x: minX + Math.random() * (maxX - minX),
    y,
    z: minZ + Math.random() * (maxZ - minZ),
  };
  room.seeds.set(id, seed);
  return seed;
}

function broadcast(room, msg, exceptId = null) {
  const data = JSON.stringify(msg);
  for (const [id, p] of room.players) {
    if (id !== exceptId && p.ws.readyState === 1) p.ws.send(data);
  }
}

function playerList(room) {
  return [...room.players.entries()].map(([id, p]) => ({
    id, name: p.name, colorIndex: p.colorIndex, carrying: p.carrying, banked: p.banked,
  }));
}

function roomSnapshot(room) {
  return {
    parts: [...room.parts.values()],
    seeds: [...room.seeds.values()],
    players: playerList(room),
  };
}

const wss = new WebSocketServer({ server });
let nextClientId = 1;

wss.on('connection', (ws) => {
  const id = 'p' + nextClientId++;
  let room = null;

  const send = (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

  function joinRoom(r, name, colorIndex) {
    room = r;
    room.emptySince = null;
    room.players.set(id, {
      ws,
      name: String(name || 'Hamster').slice(0, 16),
      colorIndex: Math.max(0, Math.min(5, colorIndex | 0)),
      carrying: 0, banked: 0,
      state: null,
    });
    send({ t: 'joined', id, code: room.code, ...roomSnapshot(room) });
    broadcast(room, { t: 'player_joined', player: playerList(room).find(p => p.id === id) }, id);
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (typeof msg !== 'object' || !msg) return;

    if (msg.t === 'create') {
      if (room) return;
      const r = makeRoom(makeCode());
      rooms.set(r.code, r);
      for (let i = 0; i < 8; i++) spawnSeed(r);
      joinRoom(r, msg.name, msg.colorIndex);
      return;
    }
    if (msg.t === 'join') {
      if (room) return;
      const r = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!r) { send({ t: 'error', reason: 'no_room' }); return; }
      if (r.players.size >= MAX_PLAYERS) { send({ t: 'error', reason: 'full' }); return; }
      joinRoom(r, msg.name, msg.colorIndex);
      return;
    }
    if (!room) return;
    const me = room.players.get(id);
    if (!me) return;

    switch (msg.t) {
      case 'state': // {p:[x,y,z], yaw, anim, carrying-visual handled server-side}
        me.state = { p: msg.p, yaw: msg.yaw, anim: msg.anim };
        break;
      case 'place': {
        if (room.parts.size >= MAX_PARTS) { send({ t: 'error', reason: 'part_limit' }); return; }
        const q = msg.part || {};
        const part = {
          id: 'b' + room.nextId++,
          type: String(q.type || '').slice(0, 24),
          gx: q.gx | 0, gy: q.gy | 0, gz: q.gz | 0, rot: (q.rot | 0) & 3,
          owner: id,
        };
        room.parts.set(part.id, part);
        broadcast(room, { t: 'placed', part });
        break;
      }
      case 'remove': {
        if (room.parts.delete(msg.id)) broadcast(room, { t: 'removed', id: msg.id });
        break;
      }
      case 'collect': {
        const seed = room.seeds.get(msg.id);
        if (!seed) return;
        if (me.carrying >= (msg.max | 0 || 10)) return;
        room.seeds.delete(msg.id);
        me.carrying++;
        broadcast(room, { t: 'seed_gone', id: msg.id, by: id, carrying: me.carrying });
        break;
      }
      case 'deposit': {
        if (me.carrying <= 0) return;
        me.banked += me.carrying;
        const n = me.carrying;
        me.carrying = 0;
        broadcast(room, { t: 'deposited', id, n, banked: me.banked });
        break;
      }
      case 'emote':
        broadcast(room, { t: 'emote', id, e: msg.e | 0 });
        break;
    }
  });

  ws.on('close', () => {
    if (!room) return;
    room.players.delete(id);
    broadcast(room, { t: 'player_left', id });
    if (room.players.size === 0) room.emptySince = Date.now();
  });
});

// Tick: relay states at 15Hz, spawn seeds, reap empty rooms.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.players.size === 0) {
      if (now - room.emptySince > 5 * 60_000) rooms.delete(code);
      continue;
    }
    if (room.seeds.size < MAX_SEEDS && now - room.lastSeedAt > SEED_INTERVAL) {
      room.lastSeedAt = now;
      broadcast(room, { t: 'seed', seed: spawnSeed(room) });
    }
    const states = [];
    for (const [pid, p] of room.players) if (p.state) states.push({ id: pid, ...p.state });
    if (states.length) broadcast(room, { t: 'states', states, now });
  }
}, 1000 / 15);

server.listen(PORT, () => console.log(`Hamster Haven running at http://localhost:${PORT}`));
