const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { app } = require('electron');
const { logAction } = require('./action-logger');

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

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
      'User-Agent': 'ShockHub/Core'
    }
  });
}

function pishockApi() {
  return axios.create({
    baseURL: 'https://do.pishock.com/api',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'ShockHub/Core'
    }
  });
}

function normalizeProvider(value) {
  return String(value || '').toLowerCase() === 'pishock' ? 'pishock' : 'openshock';
}

function parsePiShockShareCodes(input) {
  const items = Array.isArray(input)
    ? input
    : String(input || '').split(/[\n,;\s]+/g);

  return items
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);
}

function getPiShockConfig(cfg) {
  const pishock = cfg.pishock || {};
  return {
    username: String(pishock.username || '').trim(),
    apiKey: String(pishock.apiKey || '').trim(),
    scriptName: String(pishock.scriptName || 'ShockHub').trim() || 'ShockHub',
    shareCodes: parsePiShockShareCodes(pishock.shareCodes)
  };
}

function resolveIntensity(shocker, type) {
  return type === 'Sound' ? 0 : Number(shocker?.intensity ?? 20);
}

function mapPiShockOp(type) {
  if (type === 'Shock') return 0;
  if (type === 'Vibrate') return 1;
  if (type === 'Sound') return 2;
  return null;
}

async function sendPiShockOperation(cfg, shocker, type, durationMs) {
  const op = mapPiShockOp(type);
  if (op == null) {
    return;
  }

  const piCfg = getPiShockConfig(cfg);
  const shareCode = String(shocker?.id || '').trim();
  if (!shareCode || !piCfg.username || !piCfg.apiKey) return;

  const durationSeconds = Math.max(1, Math.min(15, Math.ceil((Number(durationMs) || 300) / 1000)));
  const payload = {
    Username: piCfg.username,
    Name: piCfg.scriptName,
    Code: shareCode,
    Apikey: piCfg.apiKey,
    Op: op,
    Duration: durationSeconds
  };

  if (op !== 2) {
    payload.Intensity = Math.max(1, Math.min(100, resolveIntensity(shocker, type)));
  }

  const result = await pishockApi().post('/apioperate', payload, { timeout: 5000 });
  if (typeof result?.data === 'string') {
    const ok = /succeeded|operation attempted/i.test(result.data);
    if (!ok) {
      throw new Error(result.data);
    }
  }
}

const activeHolds = new Map();

function buildAction(shocker, type, duration) {
  return {
    id: shocker.id,
    type,
    intensity: resolveIntensity(shocker, type),
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
  const provider = normalizeProvider(cfg.provider);
  const shocker = getShockerById(shockerId);
  console.debug('[controller] trigger', { provider, type, shockerId, duration });

  logAction({
    type,
    shockerId,
    shockerName: shocker?.name || null,
    intensity: type === 'Sound' || type === 'Stop' ? 0 : shocker?.intensity,
    duration,
    provider,
    source: `${provider}-controller.trigger`
  });

  if (!shocker) return;

  if (provider === 'pishock') {
    await sendPiShockOperation(cfg, shocker, type, duration);
    return;
  }

  if (!cfg.apiKey) {
    console.warn('[controller] OpenShock API key missing for trigger');
    return;
  }

  await api(cfg.apiKey).post('/2/shockers/control', {
    shocks: [buildAction(shocker, type, duration)],
    customName: null
  });
}

function startHold(type, shockerId) {
  const cfg = loadConfig();
  const provider = normalizeProvider(cfg.provider);
  const shocker = getShockerById(shockerId);
  console.debug('[controller] startHold', { provider, type, shockerId });
  if (!shocker) return;

  if (provider === 'openshock' && !cfg.apiKey) return;
  if (provider === 'pishock') {
    const piCfg = getPiShockConfig(cfg);
    if (!piCfg.username || !piCfg.apiKey) return;
  }

  if (activeHolds.has(shockerId)) return;

  const client = api(cfg.apiKey);

  const fire = () => {
    logAction({
      type,
      shockerId,
      shockerName: shocker.name,
      intensity: type === 'Sound' ? 0 : shocker.intensity,
      duration: 5000,
      provider,
      source: `${provider}-controller.startHold`
    });

    if (provider === 'pishock') {
      sendPiShockOperation(cfg, shocker, type, 3000).catch((error) => {
        console.error('[controller] PiShock hold send failed', error);
      });
      return;
    }

    client.post('/2/shockers/control', {
      shocks: [buildAction(shocker, type, 5000)],
      customName: 'Hold'
    }).catch((error) => {
      console.error('[controller] OpenShock hold send failed', error);
    });
  };

  fire();

  const interval = setInterval(fire, provider === 'pishock' ? 2000 : 3000);
  activeHolds.set(shockerId, interval);
}

function stopHold(shockerId) {
  const cfg = loadConfig();
  const provider = normalizeProvider(cfg.provider);
  const shocker = getShockerById(shockerId);
  console.debug('[controller] stopHold', { provider, shockerId });
  if (!shocker) return;

  const interval = activeHolds.get(shockerId);
  if (!interval) return;

  clearInterval(interval);
  activeHolds.delete(shockerId);

  logAction({
    type: 'Stop',
    shockerId,
    shockerName: shocker.name,
    intensity: 0,
    duration: 300,
    provider,
    source: `${provider}-controller.stopHold`
  });

  if (provider === 'pishock') return;
  if (!cfg.apiKey) return;

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
  const provider = normalizeProvider(cfg.provider);
  console.warn('[controller] emergencyStop', { provider });
  activeHolds.forEach(i => clearInterval(i));
  activeHolds.clear();

  const shocks = Object.values(cfg.shockers || {}).map(s => ({
    id: s.id,
    type: 'Stop',
    intensity: 0,
    duration: 300,
    exclusive: true
  }));

  if (shocks.length) {
    shocks.forEach(s => {
      const shocker = getShockerById(s.id);
      logAction({
        type: 'Stop',
        shockerId: s.id,
        shockerName: shocker?.name || null,
        intensity: 0,
        duration: s.duration,
        provider,
        source: `${provider}-controller.emergencyStop`
      });
    });
  } else {
    logAction({
      type: 'Stop',
      shockerId: null,
      shockerName: 'all',
      intensity: 0,
      duration: 300,
      provider,
      source: `${provider}-controller.emergencyStop`
    });
  }

  if (provider === 'pishock') return;
  if (!cfg.apiKey) return;

  if (!shocks.length) return;

  api(cfg.apiKey).post('/2/shockers/control', {
    shocks,
    customName: 'Emergency'
  }).catch(() => {});
}

function shockerList() {
  const cfg = loadConfig();
  const activeProvider = normalizeProvider(cfg.provider);
  return Object.values(cfg.shockers || {})
    .filter((s) => normalizeProvider(s.provider || 'openshock') === activeProvider)
    .map(s => ({
    id: s.id,
    name: s.name
  }));
}

async function fetchShockers() {
  const cfg = loadConfig();
  const provider = normalizeProvider(cfg.provider);
  console.debug('[controller] fetchShockers', { provider });

  if (provider === 'pishock') {
    const piCfg = getPiShockConfig(cfg);
    if (!piCfg.username || !piCfg.apiKey || !piCfg.shareCodes.length) return [];

    const client = pishockApi();
    const results = await Promise.all(piCfg.shareCodes.map(async (code) => {
      try {
        const res = await client.post('/GetShockerInfo', {
          Username: piCfg.username,
          Apikey: piCfg.apiKey,
          Code: code,
          Name: piCfg.scriptName
        }, { timeout: 5000 });

        const info = res?.data && typeof res.data === 'object' ? res.data : {};
        const name = String(
          info.name || info.Name || info.shockerName || info.ShockerName || `PiShock ${code.slice(-4)}`
        ).trim();

        return { id: code, name: name || `PiShock ${code.slice(-4)}` };
      } catch {
        console.warn('[controller] PiShock share code unavailable', { code });
        return { id: code, name: `PiShock ${code.slice(-4)} (unavailable)` };
      }
    }));

    return results;
  }

  if (!cfg.apiKey) {
    console.warn('[controller] OpenShock API key missing for shocker fetch');
    return [];
  }
  const res = await api(cfg.apiKey).get('/1/shockers/own');
  return (res.data?.data || []).flatMap(g => g.shockers || []);
}

module.exports = {
  trigger,
  startHold,
  stopHold,
  emergencyStop,
  shockerList,
  fetchShockers
};