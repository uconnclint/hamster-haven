// Client networking: connects, creates/joins rooms, relays state, dispatches events.
import { NET } from './config.js';

export class Net {
  constructor() {
    this.ws = null;
    this.id = null;
    this.code = null;
    this.handlers = {};        // t -> fn(msg)
    this.connected = false;
    this._lastSend = 0;
  }

  on(t, fn) { this.handlers[t] = fn; }

  connect({ mode, code, name, colorIndex }, onError) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const q = mode === 'join' ? `mode=join&code=${encodeURIComponent(code || '')}` : 'mode=create';
    const ws = new WebSocket(`${proto}://${location.host}/ws?${q}`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this._send(mode === 'join'
        ? { t: 'join', code, name, colorIndex }
        : { t: 'create', name, colorIndex });
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'joined') { this.id = msg.id; this.code = msg.code; }
      if (msg.t === 'error' && !this.id) { onError?.(msg.reason); ws.close(); return; }
      this.handlers[msg.t]?.(msg);
    };
    ws.onclose = () => {
      this.connected = false;
      if (this.id) this.handlers.disconnected?.();
      else onError?.('unreachable');
    };
    ws.onerror = () => {};
  }

  _send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  // Throttled position/anim updates.
  sendState(p, yaw, anim) {
    const now = performance.now();
    if (now - this._lastSend < 1000 / NET.sendHz) return;
    this._lastSend = now;
    this._send({
      t: 'state',
      p: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)],
      yaw: +yaw.toFixed(2),
      anim,
    });
  }

  place(part) { this._send({ t: 'place', part }); }
  remove(id) { this._send({ t: 'remove', id }); }
  collect(id, max) { this._send({ t: 'collect', id, max }); }
  deposit() { this._send({ t: 'deposit' }); }
  emote(e) { this._send({ t: 'emote', e }); }
}
