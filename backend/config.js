const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');

function load() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function save(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getCredentials() {
  return load().credentials;
}

function setPasswordHash(hash) {
  const cfg = load();
  cfg.credentials.passwordHash = hash;
  save(cfg);
}

function getRules() {
  return load().rules || [];
}

function saveRules(rules) {
  const cfg = load();
  cfg.rules = rules;
  save(cfg);
}

function getJwtSecret() {
  return load().jwtSecret;
}

module.exports = { load, save, getCredentials, setPasswordHash, getRules, saveRules, getJwtSecret };
