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

// ── helpers ───────────────────────────────────────────────────────────────────
function validatePorts(from, to, existingRules, excludeId) {
  from = Number(from); to = to ? Number(to) : from;
  if (from < 1 || from > 65535 || to < 1 || to > 65535) return 'Port out of range (1-65535)';
  if (to < from) return 'Range end must be >= range start';
  if (to - from >= 500) return 'Range too large (max 500 ports)';
  for (let p = from; p <= to; p++) {
    const conflict = existingRules.find((r) => {
      if (r.id === excludeId) return false;
      const rEnd = r.portRangeEnd || r.listenPort;
      return p >= r.listenPort && p <= rEnd;
    });
    if (conflict) return `Port ${p} already used by rule "${conflict.name}"`;
  }
  return null;
}

app.post('/api/rules', requireAuth, (req, res) => {
  const { name, listenPort, portRangeEnd, targetHost, targetPort, enabled, protocol, rangeTarget } = req.body || {};
  if (!listenPort || !targetHost || !targetPort) {
    return res.status(400).json({ error: 'listenPort, targetHost, targetPort are required' });
  }
  const proto = ['TCP', 'UDP', 'BOTH'].includes((protocol || '').toUpperCase())
    ? protocol.toUpperCase() : 'TCP';

  const rules = config.getRules();
  const portErr = validatePorts(listenPort, portRangeEnd, rules, null);
  if (portErr) return res.status(400).json({ error: portErr });

  const lp = Number(listenPort);
  const re = portRangeEnd ? Number(portRangeEnd) : null;
  const isRange = re && re > lp;
  const rt = rangeTarget === 'single' ? 'single' : 'expand';

  const rule = {
    id: uuidv4(),
    name: name || (isRange
      ? `Range ${lp}-${re}→${targetHost}:${targetPort}`
      : `Rule ${lp}→${targetHost}:${targetPort}`),
    listenPort: lp,
    ...(isRange && { portRangeEnd: re, rangeTarget: rt }),
    targetHost,
    targetPort: Number(targetPort),
    protocol: proto,
    enabled: enabled !== false,
    createdAt: new Date().toISOString(),
  };

  rules.push(rule);
  config.saveRules(rules);
  if (rule.enabled) { try { forwarder.start(rule); } catch {} }
  res.status(201).json({ ...rule, running: forwarder.isRunning(rule.id) });
});

app.put('/api/rules/:id', requireAuth, (req, res) => {
  const rules = config.getRules();
  const idx = rules.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Rule not found' });

  const { name, listenPort, portRangeEnd, targetHost, targetPort, enabled, protocol, rangeTarget } = req.body;
  const updated = { ...rules[idx] };

  if (name !== undefined) updated.name = name;
  if (listenPort !== undefined || portRangeEnd !== undefined) {
    const lp = listenPort !== undefined ? Number(listenPort) : updated.listenPort;
    const re = portRangeEnd !== undefined ? (portRangeEnd || null) : updated.portRangeEnd;
    const portErr = validatePorts(lp, re, rules, req.params.id);
    if (portErr) return res.status(400).json({ error: portErr });
    updated.listenPort = lp;
    if (re && re > lp) updated.portRangeEnd = Number(re);
    else { delete updated.portRangeEnd; delete updated.rangeTarget; }
  }
  if (targetHost !== undefined) updated.targetHost = targetHost;
  if (targetPort !== undefined) updated.targetPort = Number(targetPort);
  if (enabled !== undefined) updated.enabled = enabled;
  if (protocol !== undefined && ['TCP', 'UDP', 'BOTH'].includes(protocol.toUpperCase())) {
    updated.protocol = protocol.toUpperCase();
  }
  if (rangeTarget !== undefined && updated.portRangeEnd) {
    updated.rangeTarget = rangeTarget === 'single' ? 'single' : 'expand';
  }

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

// ── System / Update ───────────────────────────────────────────────────────────
const { execFileSync, spawn } = require('child_process');
const SOURCE_FILE = '/opt/port-forwarder/.source_path';

// Safe env for running git/shell commands as the service user
// HOME=/tmp prevents git from failing when the service user has no home dir
const GIT_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: '/tmp',
  LANG: 'C',
};

function runGit(args, cwd, timeout = 5000) {
  return execFileSync('git', args, { cwd, timeout, env: GIT_ENV }).toString().trim();
}

function getSourcePath() {
  if (fs.existsSync(SOURCE_FILE)) return fs.readFileSync(SOURCE_FILE, 'utf8').trim();
  // dev fallback: parent of backend dir
  const dev = path.join(__dirname, '..');
  if (fs.existsSync(path.join(dev, '.git'))) return dev;
  return null;
}

app.get('/api/system/info', requireAuth, (req, res) => {
  const src = getSourcePath();
  const info = { installed: fs.existsSync(SOURCE_FILE), commit: null, commitDate: null, branch: null };
  if (src) {
    try { info.commit     = runGit(['rev-parse', '--short', 'HEAD'], src); } catch {}
    try { info.commitDate = runGit(['log', '-1', '--format=%cd', '--date=format:%Y-%m-%d %H:%M'], src); } catch {}
    try { info.branch     = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], src); } catch {}
  }
  res.json(info);
});

app.get('/api/system/check-update', requireAuth, (req, res) => {
  const src = getSourcePath();
  if (!src) return res.json({ available: false, error: 'no_source' });
  try {
    runGit(['fetch', '--quiet'], src, 15000);
    const local  = runGit(['rev-parse', 'HEAD'], src);
    const remote = runGit(['rev-parse', '@{u}'], src);
    res.json({ available: local !== remote, local: local.slice(0,7), remote: remote.slice(0,7) });
  } catch (e) {
    res.json({ available: false, error: e.message.slice(0, 200) });
  }
});

app.post('/api/system/update', requireAuth, (req, res) => {
  const src = getSourcePath();
  if (!src) return res.status(400).json({ error: 'Source path not found. Install via install.sh.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {} };

  const updateScript = '/opt/port-forwarder/update.sh';
  const spawnEnv = { ...GIT_ENV, npm_config_cache: '/tmp/.npm' };
  let proc;

  if (fs.existsSync(updateScript)) {
    proc = spawn('bash', [updateScript], { env: spawnEnv });
  } else {
    // dev mode: pull + rebuild frontend
    const cmd = `cd "${src}" && git pull && cd frontend && npm ci --silent && npm run build && echo "=== Done — restart server to apply ==="`;
    proc = spawn('bash', ['-c', cmd], { env: spawnEnv });
  }

  proc.stdout.on('data', (c) => send({ type: 'log', text: c.toString() }));
  proc.stderr.on('data', (c) => send({ type: 'log', text: c.toString() }));
  proc.on('close', (code) => { send({ type: 'done', code, success: code === 0 }); res.end(); });
  req.on('close', () => { if (!proc.killed) proc.kill(); });
});

app.post('/api/system/restart', requireAuth, (req, res) => {
  if (!fs.existsSync(SOURCE_FILE)) return res.status(400).json({ error: 'Not installed via install.sh' });
  res.json({ ok: true });
  setTimeout(() => {
    spawn('sudo', ['systemctl', 'restart', 'port-forwarder'], { detached: true, stdio: 'ignore' }).unref();
  }, 500);
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
