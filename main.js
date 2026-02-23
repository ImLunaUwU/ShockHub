const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const OpenShock = require('./openshock-controller');
require('./oscquery');

const CONFIG_PATH = path.join(__dirname, 'config.json');

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
  return true;
});

/* ===== Shocker Discovery ===== */
ipcMain.handle('openshock:getShockers', async () => {
  const cfg = loadConfig();
  if (!cfg.apiKey) return [];

  const res = await api(cfg.apiKey).get('/1/shockers/own');
  return res.data.data.flatMap(g => g.shockers);
});

/* ===== Manual Control (UI buttons etc.) ===== */
ipcMain.handle('openshock:control', async (_, shocks) => {
  for (const s of shocks) {
    await OpenShock.trigger(
      s.type,
      s.id,
      s.duration ?? 300
    );
  }
  return true;
});

/* ===== Emergency Stop ===== */
ipcMain.handle('openshock:emergencyStop', async () => {
  OpenShock.emergencyStop();
  return true;
});

ipcMain.handle('openshock:list', () => {
  return OpenShock.shockerList();
});