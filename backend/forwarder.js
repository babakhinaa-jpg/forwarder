const net = require('net');
const dgram = require('dgram');
const EventEmitter = require('events');

const UDP_SESSION_TTL = 60_000;
const MAX_RANGE = 500;

class Forwarder extends EventEmitter {
  constructor() {
    super();
    // ruleId -> { isRange, protocol, single?: {tcp?,udp?}, ports?: Map<port,{tcp?,udp?}> }
    this.running = new Map();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  start(rule) {
    if (this.running.has(rule.id)) return { ok: true, already: true };
    const proto = (rule.protocol || 'TCP').toUpperCase();
    const isRange = rule.portRangeEnd && Number(rule.portRangeEnd) > Number(rule.listenPort);

    if (isRange) {
      const from = Number(rule.listenPort);
      const to   = Math.min(Number(rule.portRangeEnd), from + MAX_RANGE - 1);
      const ports = new Map();

      for (let p = from; p <= to; p++) {
        const offset = p - from;
        const sub = { ...rule, listenPort: p, targetPort: Number(rule.targetPort) + offset };
        const entry = {};
        if (proto === 'TCP' || proto === 'BOTH') entry.tcp = this._startTCP(sub);
        if (proto === 'UDP' || proto === 'BOTH') entry.udp = this._startUDP(sub);
        ports.set(p, entry);
      }

      this.running.set(rule.id, { isRange: true, protocol: proto, ports });
    } else {
      const entry = { isRange: false, protocol: proto };
      if (proto === 'TCP' || proto === 'BOTH') entry.tcp = this._startTCP(rule);
      if (proto === 'UDP' || proto === 'BOTH') entry.udp = this._startUDP(rule);
      this.running.set(rule.id, entry);
    }

    return { ok: true };
  }

  stop(ruleId) {
    const entry = this.running.get(ruleId);
    if (!entry) return { ok: true, already: true };

    if (entry.isRange) {
      for (const e of entry.ports.values()) {
        if (e.tcp) this._stopTCP(e.tcp);
        if (e.udp) this._stopUDP(e.udp);
      }
    } else {
      if (entry.tcp) this._stopTCP(entry.tcp);
      if (entry.udp) this._stopUDP(entry.udp);
    }

    this.running.delete(ruleId);
    this.emit('stopped', { ruleId });
    return { ok: true };
  }

  isRunning(ruleId) { return this.running.has(ruleId); }

  getStats(ruleId) {
    const entry = this.running.get(ruleId);
    if (!entry) return null;

    if (entry.isRange) {
      const agg = { protocol: entry.protocol, portCount: entry.ports.size, tcp: null, udp: null };
      for (const e of entry.ports.values()) {
        if (e.tcp) {
          if (!agg.tcp) agg.tcp = { bytesIn:0,bytesOut:0,connections:0,activeConnections:0,errors:0 };
          const s = e.tcp.stats;
          agg.tcp.bytesIn          += s.bytesIn;
          agg.tcp.bytesOut         += s.bytesOut;
          agg.tcp.connections      += s.connections;
          agg.tcp.activeConnections+= s.activeConnections;
          agg.tcp.errors           += s.errors;
        }
        if (e.udp) {
          if (!agg.udp) agg.udp = { bytesIn:0,bytesOut:0,packets:0,sessions:0,errors:0 };
          const s = e.udp.stats;
          agg.udp.bytesIn  += s.bytesIn;
          agg.udp.bytesOut += s.bytesOut;
          agg.udp.packets  += s.packets;
          agg.udp.sessions += e.udp.sessions.size;
          agg.udp.errors   += s.errors;
        }
      }
      return agg;
    }

    return {
      protocol: entry.protocol,
      tcp: entry.tcp ? { ...entry.tcp.stats } : null,
      udp: entry.udp ? { ...entry.udp.stats, sessions: entry.udp.sessions.size } : null,
    };
  }

  getAllStats() {
    const result = {};
    for (const [id] of this.running) result[id] = this.getStats(id);
    return result;
  }

  stopAll() { for (const id of [...this.running.keys()]) this.stop(id); }

  // ── TCP ────────────────────────────────────────────────────────────────────

  _startTCP(rule) {
    const stats = { bytesIn:0,bytesOut:0,connections:0,activeConnections:0,errors:0,startedAt:Date.now() };

    const server = net.createServer((client) => {
      stats.connections++;
      stats.activeConnections++;
      const target = net.createConnection({ host: rule.targetHost, port: rule.targetPort });

      client.on('data', (c) => { stats.bytesIn += c.length; if (!target.destroyed) target.write(c); });
      target.on('data', (c) => { stats.bytesOut += c.length; if (!client.destroyed) client.write(c); });

      const cleanup = () => {
        stats.activeConnections = Math.max(0, stats.activeConnections - 1);
        if (!client.destroyed) client.destroy();
        if (!target.destroyed) target.destroy();
      };
      target.on('error', (e) => { stats.errors++; this.emit('error',{ruleId:rule.id,proto:'TCP',message:e.message}); cleanup(); });
      client.on('error', cleanup);
      client.on('end', () => target.end());
      target.on('end', () => client.end());
      client.on('close', cleanup);
      target.on('close', cleanup);
    });

    server.on('error', (e) => { stats.errors++; this.emit('serverError',{ruleId:rule.id,proto:'TCP',message:e.message}); });
    server.listen(rule.listenPort, '0.0.0.0');
    return { server, stats };
  }

  _stopTCP(e) { try { e.server.close(); } catch {} }

  // ── UDP ────────────────────────────────────────────────────────────────────

  _startUDP(rule) {
    const stats = { bytesIn:0,bytesOut:0,packets:0,errors:0,startedAt:Date.now() };
    const sessions = new Map();
    const listener = dgram.createSocket('udp4');

    listener.on('message', (msg, rinfo) => {
      const key = `${rinfo.address}:${rinfo.port}`;
      stats.packets++; stats.bytesIn += msg.length;

      let session = sessions.get(key);
      if (!session) {
        const sock = dgram.createSocket('udp4');
        sock.on('message', (resp) => {
          stats.bytesOut += resp.length;
          listener.send(resp, rinfo.port, rinfo.address, (e) => { if (e) stats.errors++; });
        });
        sock.on('error', (e) => { stats.errors++; sock.close(); sessions.delete(key); });
        session = { socket: sock, timer: null };
        sessions.set(key, session);
      }

      clearTimeout(session.timer);
      session.timer = setTimeout(() => {
        try { session.socket.close(); } catch {}
        sessions.delete(key);
      }, UDP_SESSION_TTL);

      session.socket.send(msg, rule.targetPort, rule.targetHost, (e) => { if (e) stats.errors++; });
    });

    listener.on('error', (e) => { stats.errors++; this.emit('serverError',{ruleId:rule.id,proto:'UDP',message:e.message}); });
    listener.bind(rule.listenPort, '0.0.0.0');
    return { listener, sessions, stats };
  }

  _stopUDP(e) {
    for (const [, s] of e.sessions) { clearTimeout(s.timer); try { s.socket.close(); } catch {} }
    e.sessions.clear();
    try { e.listener.close(); } catch {}
  }
}

module.exports = new Forwarder();
