const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('./oscquery');

const CONFIG_PATH = path.join(__dirname, 'config.json');

/* ===== Config ===== */
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

/* ===== API ===== */
function api(apiKey) {
  return axios.create({
    baseURL: 'https://api.openshock.app',
    headers: {
      'Open-Shock-Token': apiKey,
      'User-Agent': 'OpenShock-Spicer/0.6 (local@app)',
      'Content-Type': 'application/json'
    }
  });
}

function stopPayload(id) {
  return {
    id,
    type: 'Stop',
    intensity: 0,
    duration: 300,
    exclusive: true
  };
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('index.html');
});

/* ===== IPC ===== */
ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:set', (_, cfg) => {
  saveConfig(cfg);
});

ipcMain.handle('openshock:getShockers', async () => {
  const cfg = loadConfig();
  if (!cfg.apiKey) return [];

  const res = await api(cfg.apiKey).get('/1/shockers/own');
  return res.data.data.flatMap(g => g.shockers);
});

ipcMain.handle('openshock:control', async (_, shocks) => {
  const cfg = loadConfig();
  if (!cfg.apiKey) throw new Error('API key missing');

  const res = await api(cfg.apiKey).post('/2/shockers/control', {
    shocks,
    customName: null
  });

  // ✅ Return ONLY serializable data
  return res.data ?? null;
});

ipcMain.handle('openshock:emergencyStop', async () => {
  const cfg = loadConfig();
  if (!cfg.apiKey) return;

  const shocks = Object.values(cfg.shockers || {})
    .map(s => stopPayload(s.id));

  if (shocks.length) {
    await api(cfg.apiKey).post('/2/shockers/control', {
      shocks,
      customName: null
    });
  }
});