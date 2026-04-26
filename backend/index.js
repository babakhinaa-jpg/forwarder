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
  if (to > 65535) return 'Port out of range (max 65535)';
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
  const { name, listenPort, portRangeEnd, targetHost, targetPort, enabled, protocol, rangeTarget, mode } = req.body || {};
  if (!listenPort || !targetHost || !targetPort) {
    return res.status(400).json({ error: 'listenPort, targetHost, targetPort are required' });
  }
  const proto = ['TCP', 'UDP', 'BOTH'].includes((protocol || '').toUpperCase())
    ? protocol.toUpperCase() : 'TCP';
  const fwdMode = ['socket', 'iptables'].includes(mode) ? mode : 'socket';

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
    mode: fwdMode,
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

  const { name, listenPort, portRangeEnd, targetHost, targetPort, enabled, protocol, rangeTarget, mode } = req.body;
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
  if (mode !== undefined && ['socket', 'iptables'].includes(mode)) {
    updated.mode = mode;
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

// ── System / iptables check ───────────────────────────────────────────────────
app.get('/api/system/iptables-check', requireAuth, (req, res) => {
  try {
    const { execFileSync: execSync } = require('child_process');
    execSync('iptables', ['-L', '-n'], {
      env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', HOME: '/tmp' },
      timeout: 10000,
    });
    res.json({ available: true });
  } catch (e) {
    res.json({ available: false, error: e.message });
  }
});

// ── System / ip_forward check ────────────────────────────────────────────────
app.get('/api/system/ipforward', requireAuth, (req, res) => {
  try {
    const val = fs.readFileSync('/proc/sys/net/ipv4/ip_forward', 'utf8').trim();
    res.json({ enabled: val === '1' });
  } catch (e) {
    res.json({ enabled: false, error: e.message });
  }
});

// ── System / enable ip_forward ───────────────────────────────────────────────
app.post('/api/system/enable-ipforward', requireAuth, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });

  const creds = config.getCredentials();
  const ok = await bcrypt.compare(password, creds.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Wrong password' });

  try {
    // CAP_NET_ADMIN allows writing directly to /proc/sys/net/ without sudo
    fs.writeFileSync('/proc/sys/net/ipv4/ip_forward', '1\n');
    // Also persist via sysctl.d (best-effort — works if service has write access or on next install)
    try {
      fs.writeFileSync('/etc/sysctl.d/99-port-forwarder.conf', 'net.ipv4.ip_forward = 1\n');
    } catch {}
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── System / Update ───────────────────────────────────────────────────────────
const { spawn } = require('child_process');
const https = require('https');
const SOURCE_FILE   = '/opt/port-forwarder/.source_path';
const BUILD_INFO    = '/opt/port-forwarder/.build-info';  // written by install.sh / update.sh
const GITHUB_REPO   = 'babakhinaa-jpg/forwarder';
const GITHUB_BRANCH = 'main';

// Read version info from file written at install/update time (no subprocess needed)
function readBuildInfo() {
  if (fs.existsSync(BUILD_INFO)) {
    try { return JSON.parse(fs.readFileSync(BUILD_INFO, 'utf8')); } catch {}
  }
  return null;
}

// Fallback: dev mode reads .build-info from the repo root
function readDevBuildInfo() {
  const devFile = path.join(__dirname, '..', '.build-info');
  if (fs.existsSync(devFile)) {
    try { return JSON.parse(fs.readFileSync(devFile, 'utf8')); } catch {}
  }
  return null;
}

app.get('/api/system/info', requireAuth, (req, res) => {
  const installed = fs.existsSync(SOURCE_FILE);
  const info = { installed, commit: null, commitDate: null, branch: null };
  const bi = readBuildInfo() || readDevBuildInfo();
  if (bi) {
    info.commit     = bi.commit || null;
    info.branch     = bi.branch || null;
    info.commitDate = bi.date   || null;
  }
  res.json(info);
});

// check-update uses GitHub API — no subprocess, works in restricted envs
app.get('/api/system/check-update', requireAuth, (req, res) => {
  const bi = readBuildInfo() || readDevBuildInfo();
  const localCommit = bi?.commit || null;

  if (!localCommit) {
    return res.json({ available: false, error: 'Local version unknown — reinstall via install.sh' });
  }

  const options = {
    hostname: 'api.github.com',
    path: `/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`,
    headers: { 'User-Agent': 'port-forwarder/1.0', Accept: 'application/vnd.github.v3+json' },
    timeout: 10000,
  };

  const apiReq = https.get(options, (apiRes) => {
    let body = '';
    apiRes.on('data', d => body += d);
    apiRes.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.sha) {
          return res.json({ available: false, error: `GitHub: ${data.message || 'unknown error'}` });
        }
        const remoteCommit = data.sha.slice(0, 7);
        res.json({
          available: localCommit.slice(0, 7) !== remoteCommit,
          local: localCommit.slice(0, 7),
          remote: remoteCommit,
        });
      } catch (e) {
        res.json({ available: false, error: 'Invalid GitHub API response' });
      }
    });
  });
  apiReq.on('error', (e) => res.json({ available: false, error: e.message }));
  apiReq.on('timeout', () => { apiReq.destroy(); res.json({ available: false, error: 'GitHub API timeout' }); });
});

app.post('/api/system/update', requireAuth, (req, res) => {
  const installed = fs.existsSync(SOURCE_FILE);
  if (!installed) return res.status(400).json({ error: 'Not installed via install.sh' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {} };

  const updateScript = '/opt/port-forwarder/update.sh';
  const spawnEnv = {
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    HOME: '/tmp',
    LANG: 'C',
    npm_config_cache: '/tmp/.npm',
  };

  const proc = spawn('sudo', [updateScript], { env: spawnEnv });
  let hasOutput = false;
  const onData = (c) => { hasOutput = true; send({ type: 'log', text: c.toString() }); };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('error', (e) => {
    send({ type: 'log', text: `spawn error: ${e.message}\n` });
    send({ type: 'done', code: 1, success: false });
    res.end();
  });
  proc.on('close', (code) => {
    if (code !== 0 && !hasOutput) {
      send({ type: 'log', text: `[no output] exit code ${code}\nRun on server: journalctl -u port-forwarder -n 20\nThen re-run: sudo ./install.sh\n` });
    }
    send({ type: 'done', code, success: code === 0 });
    res.end();
  });
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
