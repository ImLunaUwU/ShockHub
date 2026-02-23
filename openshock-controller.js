const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function api(apiKey) {
  return axios.create({
    baseURL: 'https://api.openshock.app',
    headers: {
      'Open-Shock-Token': apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'OpenShock-Spicer/Core'
    }
  });
}

const activeHolds = new Map();

function buildAction(shocker, type, duration) {
  return {
    id: shocker.id,
    type,
    intensity: type === 'Sound' ? 0 : shocker.intensity ?? 20,
    duration,
    exclusive: true
  };
}

function getShockerById(shockerId) {
  const cfg = loadConfig();
  return Object.values(cfg.shockers || {}).find(s => s.id === shockerId);
}

async function trigger(type, shockerId, duration = 300) {
  const cfg = loadConfig();
  if (!cfg.apiKey) return;

  const shocker = getShockerById(shockerId);
  if (!shocker) return;

  await api(cfg.apiKey).post('/2/shockers/control', {
    shocks: [buildAction(shocker, type, duration)],
    customName: null
  });
}

function startHold(type, shockerId) {
  const cfg = loadConfig();
  if (!cfg.apiKey) return;

  const shocker = getShockerById(shockerId);
  if (!shocker) return;

  if (activeHolds.has(shockerId)) return;

  const client = api(cfg.apiKey);

  const fire = () => {
    client.post('/2/shockers/control', {
      shocks: [buildAction(shocker, type, 5000)],
      customName: 'Hold'
    }).catch(() => {});
  };

  fire();

  const interval = setInterval(fire, 3000);
  activeHolds.set(shockerId, interval);
}

function stopHold(shockerId) {
  const cfg = loadConfig();
  if (!cfg.apiKey) return;

  const shocker = getShockerById(shockerId);
  if (!shocker) return;

  const interval = activeHolds.get(shockerId);
  if (!interval) return;

  clearInterval(interval);
  activeHolds.delete(shockerId);

  api(cfg.apiKey).post('/2/shockers/control', {
    shocks: [{
      id: shocker.id,
      type: 'Stop',
      intensity: 0,
      duration: 300,
      exclusive: true
    }],
    customName: 'HoldStop'
  }).catch(() => {});
}

function emergencyStop() {
  const cfg = loadConfig();
  if (!cfg.apiKey) return;

  activeHolds.forEach(i => clearInterval(i));
  activeHolds.clear();

  const shocks = Object.values(cfg.shockers || {}).map(s => ({
    id: s.id,
    type: 'Stop',
    intensity: 0,
    duration: 300,
    exclusive: true
  }));

  if (!shocks.length) return;

  api(cfg.apiKey).post('/2/shockers/control', {
    shocks,
    customName: 'Emergency'
  }).catch(() => {});
}

function shockerList() {
  const cfg = loadConfig();
  return Object.values(cfg.shockers || {}).map(s => ({
    id: s.id,
    name: s.name
  }));
}

module.exports = {
  trigger,
  startHold,
  stopHold,
  emergencyStop,
  shockerList
};