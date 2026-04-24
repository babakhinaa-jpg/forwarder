const net = require('net');
const EventEmitter = require('events');

class Forwarder extends EventEmitter {
  constructor() {
    super();
    // id -> { server, stats: { bytesIn, bytesOut, connections, activeConnections, errors, startedAt } }
    this.running = new Map();
  }

  start(rule) {
    if (this.running.has(rule.id)) return { ok: true, already: true };

    const stats = {
      bytesIn: 0,
      bytesOut: 0,
      connections: 0,
      activeConnections: 0,
      errors: 0,
      startedAt: Date.now(),
    };

    const server = net.createServer((client) => {
      stats.connections++;
      stats.activeConnections++;

      const target = net.createConnection({ host: rule.targetHost, port: rule.targetPort });

      let targetReady = false;

      target.on('connect', () => { targetReady = true; });

      client.on('data', (chunk) => {
        stats.bytesIn += chunk.length;
        if (!target.destroyed) target.write(chunk);
      });

      target.on('data', (chunk) => {
        stats.bytesOut += chunk.length;
        if (!client.destroyed) client.write(chunk);
      });

      const cleanup = () => {
        stats.activeConnections = Math.max(0, stats.activeConnections - 1);
        if (!client.destroyed) client.destroy();
        if (!target.destroyed) target.destroy();
      };

      target.on('error', (err) => {
        stats.errors++;
        this.emit('error', { ruleId: rule.id, message: err.message });
        cleanup();
      });

      client.on('error', () => cleanup());
      client.on('end', () => target.end());
      target.on('end', () => client.end());
      client.on('close', cleanup);
      target.on('close', cleanup);
    });

    server.on('error', (err) => {
      stats.errors++;
      this.emit('serverError', { ruleId: rule.id, message: err.message });
      this.running.delete(rule.id);
    });

    server.listen(rule.listenPort, '0.0.0.0', () => {
      this.emit('started', { ruleId: rule.id, port: rule.listenPort });
    });

    this.running.set(rule.id, { server, stats });
    return { ok: true };
  }

  stop(ruleId) {
    const entry = this.running.get(ruleId);
    if (!entry) return { ok: true, already: true };

    entry.server.close();
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
    return { ...entry.stats };
  }

  getAllStats() {
    const result = {};
    for (const [id, entry] of this.running) {
      result[id] = { ...entry.stats };
    }
    return result;
  }

  stopAll() {
    for (const id of this.running.keys()) {
      this.stop(id);
    }
  }
}

module.exports = new Forwarder();
