const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const https = require('https');

if (require('electron-squirrel-startup')) {
  app.quit();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

const ShockHubController = require('./shockhub-controller');
const { getActionLogs, clearActionLogs } = require('./action-logger');
const {
  attachMainConsoleCapture,
  captureRendererConsole,
  getDebugLogs,
  clearDebugLogs
} = require('./debug-logger');
const OscQuery = require('./oscquery');

const LEAGUE_LIVE_BASE_URL = 'https://127.0.0.1:2999/liveclientdata';
const LEAGUE_LIVE_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });
const SPLASH_MIN_DURATION_MS = 2600;

let mainWindow = null;
let splashWindow = null;

attachMainConsoleCapture();

function focusExistingWindow() {
  const candidate = mainWindow && !mainWindow.isDestroyed()
    ? mainWindow
    : (splashWindow && !splashWindow.isDestroyed() ? splashWindow : null);

  if (!candidate) return;
  if (candidate.isMinimized()) {
    candidate.restore();
  }
  candidate.show();
  candidate.focus();
}

app.on('second-instance', () => {
  focusExistingWindow();
});

function loadConfig() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
}

function api(apiKey) {
  return axios.create({
    baseURL: 'https://api.openshock.app',
    headers: {
      'Open-Shock-Token': apiKey,
      'User-Agent': 'ShockHub/0.6 (local@app)',
      'Content-Type': 'application/json'
    }
  });
}

function normalizeProvider(value) {
  return String(value || '').toLowerCase() === 'pishock' ? 'pishock' : 'openshock';
}

function hasSafetyAcknowledged(cfg) {
  return Boolean(cfg?.safety?.accepted);
}

function buildPiShockPayload(payload = {}) {
  const shareCodes = Array.isArray(payload.shareCodes)
    ? payload.shareCodes
    : String(payload.shareCodes || '').split(/[\n,;\s]+/g);

  return {
    username: String(payload.username || '').trim(),
    apiKey: String(payload.apiKey || '').trim(),
    scriptName: String(payload.scriptName || 'ShockHub').trim() || 'ShockHub',
    shareCodes: shareCodes
      .map((code) => String(code || '').trim().toUpperCase())
      .filter(Boolean)
  };
}

async function testPiShockConfig(payload = {}) {
  const cfg = buildPiShockPayload(payload);
  if (!cfg.username || !cfg.apiKey) return { ok: false, reason: 'missing' };
  if (!cfg.shareCodes.length) return { ok: false, reason: 'missing-share-codes' };

  try {
    const res = await axios.post('https://do.pishock.com/api/GetShockerInfo', {
      Username: cfg.username,
      Apikey: cfg.apiKey,
      Code: cfg.shareCodes[0],
      Name: cfg.scriptName
    }, {
      timeout: 3000
    });

    const data = res?.data;
    if (typeof data === 'string' && /not authorized|doesn.?t exist|not found/i.test(data)) {
      return { ok: false, reason: 'invalid' };
    }

    return { ok: true, shockerCount: cfg.shareCodes.length };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

app.whenReady().then(() => {
  const initialConfig = loadConfig();
  console.info('[main] App ready');
  console.debug('[main] Initial config loaded', {
    provider: normalizeProvider(initialConfig?.provider),
    vrchatEnabled: Boolean(initialConfig?.vrchat?.enabled)
  });
  OscQuery.syncFromConfig(initialConfig);

  Menu.setApplicationMenu(null);

  const splash = new BrowserWindow({
    width: 760,
    height: 430,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    movable: true,
    fullscreenable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#070b14',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  splash.setMenuBarVisibility(false);
  splash.removeMenu();
  splash.once('ready-to-show', () => splash.show());
  splash.loadFile('splash.html');
  splashWindow = splash;

  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    title: `ShockHub v${app.getVersion()}`,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0e0e11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.setMenuBarVisibility(false);
  win.removeMenu();
  mainWindow = win;

  win.webContents.on('did-create-window', (childWindow) => {
    childWindow.setMenuBarVisibility(false);
    childWindow.removeMenu();
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    captureRendererConsole(level, message, sourceId, line);
  });

  win.webContents.once('did-finish-load', () => {
    win.setTitle(`ShockHub v${app.getVersion()}`);
  });

  let mainReady = false;
  let splashElapsed = false;
  let mainShown = false;

  const revealMainWindow = () => {
    if (mainShown || !mainReady || !splashElapsed) return;
    mainShown = true;

    if (!splash.isDestroyed()) {
      splash.close();
    }

    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  };

  win.once('ready-to-show', () => {
    mainReady = true;
    console.debug('[main] Main window ready');
    revealMainWindow();
  });

  setTimeout(() => {
    splashElapsed = true;
    console.debug('[main] Splash minimum duration reached');
    revealMainWindow();
  }, SPLASH_MIN_DURATION_MS);

  splash.on('closed', () => {
    splashWindow = null;
    splashElapsed = true;
    revealMainWindow();
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  win.loadFile('index.html');
});

/* ===== IPC ===== */
ipcMain.handle('config:get', () => loadConfig());

ipcMain.handle('config:set', (_, cfg) => {
  console.debug('[ipc] config:set', {
    provider: normalizeProvider(cfg?.provider),
    vrchatEnabled: Boolean(cfg?.vrchat?.enabled)
  });
  saveConfig(cfg);
  OscQuery.syncFromConfig(cfg);
  return true;
});

ipcMain.handle('config:export', async () => {
  const cfg = loadConfig();
  const result = await dialog.showSaveDialog({
    title: 'Export Config',
    defaultPath: 'shockhub-config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePath) return { ok: false, canceled: true };

  fs.writeFileSync(result.filePath, JSON.stringify(cfg, null, 2), 'utf8');
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle('config:import', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Import Config',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePaths?.length) return { ok: false, canceled: true };

  const filePath = result.filePaths[0];
  const raw = fs.readFileSync(filePath, 'utf8');
  const cfg = JSON.parse(raw);
  console.info('[ipc] config:import', { filePath });
  saveConfig(cfg);
  OscQuery.syncFromConfig(cfg);
  return { ok: true, filePath, config: cfg };
});

ipcMain.handle('config:reset', () => {
  saveConfig({});
  OscQuery.syncFromConfig({});
  return true;
});

ipcMain.handle('config:testApiKey', async (_, payload) => {
  if (typeof payload === 'string') {
    const key = payload.trim();
    if (!key) return { ok: false, reason: 'missing' };

    try {
      const res = await api(key).get('/1/shockers/own');
      const count = (res.data?.data || []).flatMap(g => g.shockers || []).length;
      return { ok: true, shockerCount: count };
    } catch {
      return { ok: false, reason: 'invalid' };
    }
  }

  const provider = normalizeProvider(payload?.provider);
  console.debug('[ipc] config:testApiKey', { provider });
  if (provider === 'pishock') {
    return testPiShockConfig(payload);
  }

  const key = String(payload?.apiKey || '').trim();
  if (!key) return { ok: false, reason: 'missing' };

  try {
    const res = await api(key).get('/1/shockers/own');
    const count = (res.data?.data || []).flatMap(g => g.shockers || []).length;
    return { ok: true, shockerCount: count };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
});

ipcMain.handle('logs:getActions', () => {
  return getActionLogs();
});

ipcMain.handle('logs:clearActions', () => {
  console.warn('[ipc] logs:clearActions');
  return clearActionLogs();
});

ipcMain.handle('logs:exportActions', async (_, payload) => {
  const content = String(payload?.content || '');
  const defaultName = String(payload?.defaultName || 'actions.log');

  const result = await dialog.showSaveDialog({
    title: 'Export Action Logs',
    defaultPath: defaultName,
    filters: [
      { name: 'Log', extensions: ['log', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) return { ok: false, canceled: true };

  fs.writeFileSync(result.filePath, content, 'utf8');
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle('debug:getLogs', () => {
  return getDebugLogs();
});

ipcMain.handle('debug:clearLogs', () => {
  console.warn('[ipc] debug:clearLogs');
  return clearDebugLogs();
});

ipcMain.handle('league:getLiveData', async () => {
  try {
    const response = await axios.get(`${LEAGUE_LIVE_BASE_URL}/allgamedata`, {
      timeout: 1500,
      httpsAgent: LEAGUE_LIVE_HTTPS_AGENT
    });
    return { ok: true, data: response.data };
  } catch (error) {
    console.debug('[ipc] league:getLiveData unavailable', { error: error?.message || 'unavailable' });
    return {
      ok: false,
      error: error?.message || 'unavailable'
    };
  }
});

/* ===== Shocker Discovery ===== */
ipcMain.handle('shockhub:getShockers', async () => {
  const shockers = await ShockHubController.fetchShockers();
  console.debug('[ipc] shockhub:getShockers', { count: Array.isArray(shockers) ? shockers.length : 0 });
  return shockers;
});

/* ===== Manual Control (UI buttons etc.) ===== */
ipcMain.handle('shockhub:control', async (_, shocks) => {
  const cfg = loadConfig();
  if (!hasSafetyAcknowledged(cfg)) {
    throw new Error('Safety acknowledgment required before control actions.');
  }

  console.debug('[ipc] shockhub:control', { count: Array.isArray(shocks) ? shocks.length : 0 });
  for (const s of shocks) {
    await ShockHubController.trigger(
      s.type,
      s.id,
      s.duration ?? 300
    );
  }
  return true;
});

/* ===== Emergency Stop ===== */
ipcMain.handle('shockhub:emergencyStop', async () => {
  console.warn('[ipc] shockhub:emergencyStop');
  ShockHubController.emergencyStop();
  return true;
});

ipcMain.handle('shockhub:list', () => {
  return ShockHubController.shockerList();
});

ipcMain.handle('osc:status', () => {
  const cfg = loadConfig();
  return {
    running: OscQuery.isRunning(),
    enabled: Boolean(cfg?.vrchat?.enabled)
  };
});

app.on('before-quit', () => {
  console.info('[main] before-quit');
  OscQuery.stopOscQuery();
});