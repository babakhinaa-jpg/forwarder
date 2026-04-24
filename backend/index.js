const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const forwarder = require('./forwarder');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// ── Serve built frontend ──────────────────────────────────────────────────────
const DIST = path.join(__dirname, '..', 'frontend', 'dist');
const fs = require('fs');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    req.user = jwt.verify(token, config.getJwtSecret());
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const creds = config.getCredentials();
  if (username !== creds.username) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, creds.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ username }, config.getJwtSecret(), { expiresIn: '24h' });
  res.json({ token, username });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing fields' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password too short (min 6)' });

  const creds = config.getCredentials();
  const ok = await bcrypt.compare(currentPassword, creds.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Current password is wrong' });

  const hash = await bcrypt.hash(newPassword, 10);
  config.setPasswordHash(hash);
  res.json({ ok: true });
});

// ── Rules CRUD ────────────────────────────────────────────────────────────────
app.get('/api/rules', requireAuth, (req, res) => {
  const rules = config.getRules();
  const stats = forwarder.getAllStats();
  const result = rules.map((r) => ({
    ...r,
    running: forwarder.isRunning(r.id),
    stats: stats[r.id] || null,
  }));
  res.json(result);
});

app.post('/api/rules', requireAuth, (req, res) => {
  const { name, listenPort, targetHost, targetPort, enabled } = req.body || {};
  if (!listenPort || !targetHost || !targetPort) {
    return res.status(400).json({ error: 'listenPort, targetHost, targetPort are required' });
  }
  if (listenPort < 1 || listenPort > 65535 || targetPort < 1 || targetPort > 65535) {
    return res.status(400).json({ error: 'Port out of range (1-65535)' });
  }

  const rules = config.getRules();
  const conflict = rules.find((r) => r.listenPort === Number(listenPort) && r.id !== req.body.id);
  if (conflict) return res.status(400).json({ error: `Port ${listenPort} already in use by rule "${conflict.name || conflict.id}"` });

  const rule = {
    id: uuidv4(),
    name: name || `Rule ${listenPort}→${targetHost}:${targetPort}`,
    listenPort: Number(listenPort),
    targetHost,
    targetPort: Number(targetPort),
    enabled: enabled !== false,
    createdAt: new Date().toISOString(),
  };

  rules.push(rule);
  config.saveRules(rules);

  if (rule.enabled) {
    try { forwarder.start(rule); } catch (e) { /* port may be busy, rule saved anyway */ }
  }

  res.status(201).json({ ...rule, running: forwarder.isRunning(rule.id) });
});

app.put('/api/rules/:id', requireAuth, (req, res) => {
  const rules = config.getRules();
  const idx = rules.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Rule not found' });

  const { name, listenPort, targetHost, targetPort, enabled } = req.body;
  const updated = { ...rules[idx] };

  if (name !== undefined) updated.name = name;
  if (listenPort !== undefined) {
    const conflict = rules.find((r) => r.listenPort === Number(listenPort) && r.id !== req.params.id);
    if (conflict) return res.status(400).json({ error: `Port ${listenPort} already in use` });
    updated.listenPort = Number(listenPort);
  }
  if (targetHost !== undefined) updated.targetHost = targetHost;
  if (targetPort !== undefined) updated.targetPort = Number(targetPort);
  if (enabled !== undefined) updated.enabled = enabled;

  // Restart forwarder if anything changed
  forwarder.stop(updated.id);
  if (updated.enabled) {
    try { forwarder.start(updated); } catch {}
  }

  rules[idx] = updated;
  config.saveRules(rules);
  res.json({ ...updated, running: forwarder.isRunning(updated.id) });
});

app.delete('/api/rules/:id', requireAuth, (req, res) => {
  const rules = config.getRules();
  const idx = rules.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Rule not found' });

  forwarder.stop(req.params.id);
  rules.splice(idx, 1);
  config.saveRules(rules);
  res.json({ ok: true });
});

// Toggle enabled/disabled
app.post('/api/rules/:id/toggle', requireAuth, (req, res) => {
  const rules = config.getRules();
  const idx = rules.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Rule not found' });

  const rule = rules[idx];
  rule.enabled = !rule.enabled;

  if (rule.enabled) {
    try { forwarder.start(rule); } catch {}
  } else {
    forwarder.stop(rule.id);
  }

  config.saveRules(rules);
  res.json({ ...rule, running: forwarder.isRunning(rule.id) });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', requireAuth, (req, res) => {
  const rules = config.getRules();
  const stats = forwarder.getAllStats();
  res.json({
    totalRules: rules.length,
    activeRules: Object.keys(stats).length,
    stats,
  });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
if (fs.existsSync(DIST)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

// ── Bootstrap: start enabled rules ───────────────────────────────────────────
function bootstrap() {
  const rules = config.getRules();
  let started = 0;
  for (const rule of rules) {
    if (rule.enabled) {
      try {
        forwarder.start(rule);
        started++;
      } catch (e) {
        console.error(`[boot] Failed to start rule ${rule.name}: ${e.message}`);
      }
    }
  }
  console.log(`[boot] Started ${started}/${rules.length} rules`);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Port Forwarder API listening on :${PORT}`);
  bootstrap();
});

// Graceful shutdown
process.on('SIGTERM', () => { forwarder.stopAll(); process.exit(0); });
process.on('SIGINT', () => { forwarder.stopAll(); process.exit(0); });
