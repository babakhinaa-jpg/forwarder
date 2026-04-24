const net = require('net');
const dgram = require('dgram');
const EventEmitter = require('events');

const UDP_SESSION_TTL = 60_000; // 60s inactivity → close UDP session

class Forwarder extends EventEmitter {
  constructor() {
    super();
    // id -> { protocol, tcp?, udp? }
    this.running = new Map();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  start(rule) {
    if (this.running.has(rule.id)) return { ok: true, already: true };

    const proto = (rule.protocol || 'TCP').toUpperCase();
    const entry = { protocol: proto };

    if (proto === 'TCP' || proto === 'BOTH') {
      entry.tcp = this._startTCP(rule);
    }
    if (proto === 'UDP' || proto === 'BOTH') {
      entry.udp = this._startUDP(rule);
    }

    this.running.set(rule.id, entry);
    return { ok: true };
  }

  stop(ruleId) {
    const entry = this.running.get(ruleId);
    if (!entry) return { ok: true, already: true };

    if (entry.tcp) this._stopTCP(entry.tcp);
    if (entry.udp) this._stopUDP(entry.udp);
    this.running.delete(ruleId);
    this.emit('stopped', { ruleId });
    return { ok: true };
  }

  isRunning(ruleId) {
    return this.running.has(ruleId);
  }

  getStats(ruleId) {
    const entry = this.running.get(ruleId);
    if (!entry) return null;
    return {
      protocol: entry.protocol,
      tcp: entry.tcp ? { ...entry.tcp.stats } : null,
      udp: entry.udp ? { ...entry.udp.stats, sessions: entry.udp.sessions.size } : null,
    };
  }

  getAllStats() {
    const result = {};
    for (const [id] of this.running) {
      result[id] = this.getStats(id);
    }
    return result;
  }

  stopAll() {
    for (const id of [...this.running.keys()]) this.stop(id);
  }

  // ── TCP ────────────────────────────────────────────────────────────────────

  _startTCP(rule) {
    const stats = { bytesIn: 0, bytesOut: 0, connections: 0, activeConnections: 0, errors: 0, startedAt: Date.now() };

    const server = net.createServer((client) => {
      stats.connections++;
      stats.activeConnections++;

      const target = net.createConnection({ host: rule.targetHost, port: rule.targetPort });

      client.on('data', (chunk) => { stats.bytesIn += chunk.length; if (!target.destroyed) target.write(chunk); });
      target.on('data', (chunk) => { stats.bytesOut += chunk.length; if (!client.destroyed) client.write(chunk); });

      const cleanup = () => {
        stats.activeConnections = Math.max(0, stats.activeConnections - 1);
        if (!client.destroyed) client.destroy();
        if (!target.destroyed) target.destroy();
      };

      target.on('error', (err) => { stats.errors++; this.emit('error', { ruleId: rule.id, proto: 'TCP', message: err.message }); cleanup(); });
      client.on('error', () => cleanup());
      client.on('end', () => target.end());
      target.on('end', () => client.end());
      client.on('close', cleanup);
      target.on('close', cleanup);
    });

    server.on('error', (err) => {
      stats.errors++;
      this.emit('serverError', { ruleId: rule.id, proto: 'TCP', message: err.message });
    });

    server.listen(rule.listenPort, '0.0.0.0');
    return { server, stats };
  }

  _stopTCP(tcpEntry) {
    try { tcpEntry.server.close(); } catch {}
  }

  // ── UDP ────────────────────────────────────────────────────────────────────

  _startUDP(rule) {
    const stats = { bytesIn: 0, bytesOut: 0, packets: 0, errors: 0, startedAt: Date.now() };
    // clientKey -> { socket: dgram.Socket, timer: Timeout }
    const sessions = new Map();

    const listener = dgram.createSocket('udp4');

    listener.on('message', (msg, rinfo) => {
      const key = `${rinfo.address}:${rinfo.port}`;
      stats.packets++;
      stats.bytesIn += msg.length;

      let session = sessions.get(key);

      if (!session) {
        const targetSock = dgram.createSocket('udp4');

        targetSock.on('message', (resp) => {
          stats.bytesOut += resp.length;
          listener.send(resp, rinfo.port, rinfo.address, (err) => {
            if (err) stats.errors++;
          });
        });

        targetSock.on('error', (err) => {
          stats.errors++;
          this.emit('error', { ruleId: rule.id, proto: 'UDP', message: err.message });
          targetSock.close();
          sessions.delete(key);
        });

        session = { socket: targetSock, timer: null };
        sessions.set(key, session);
      }

      // Reset inactivity timer
      clearTimeout(session.timer);
      session.timer = setTimeout(() => {
        try { session.socket.close(); } catch {}
        sessions.delete(key);
      }, UDP_SESSION_TTL);

      session.socket.send(msg, rule.targetPort, rule.targetHost, (err) => {
        if (err) stats.errors++;
      });
    });

    listener.on('error', (err) => {
      stats.errors++;
      this.emit('serverError', { ruleId: rule.id, proto: 'UDP', message: err.message });
    });

    listener.bind(rule.listenPort, '0.0.0.0');
    return { listener, sessions, stats };
  }

  _stopUDP(udpEntry) {
    for (const [, s] of udpEntry.sessions) {
      clearTimeout(s.timer);
      try { s.socket.close(); } catch {}
    }
    udpEntry.sessions.clear();
    try { udpEntry.listener.close(); } catch {}
  }
}

module.exports = new Forwarder();
