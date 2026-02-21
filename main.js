import { app, BrowserWindow, ipcMain } from "electron";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
const API_BASE = "https://api.openshock.app/v1";

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({
      apiKey: "",
      selectedShockers: [],
      combinedMode: false
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function apiRequest(apiKey, endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }

  return res.json();
}

ipcMain.handle("config:load", () => loadConfig());
ipcMain.handle("config:save", (_, config) => saveConfig(config));

ipcMain.handle("openshock:getShockers", async () => {
  const { apiKey } = loadConfig();
  return apiRequest(apiKey, "/shockers");
});

ipcMain.handle("openshock:execute", async (_, payload) => {
  const { apiKey, selectedShockers, combinedMode } = loadConfig();

  const targets = combinedMode
    ? selectedShockers
    : [payload.shockerId];

  for (const id of targets) {
    await apiRequest(apiKey, `/shockers/${id}/execute`, {
      method: "POST",
      body: JSON.stringify(payload.command)
    });
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(process.cwd(), "preload.js")
    }
  });

  win.loadFile("renderer/index.html");
}

app.whenReady().then(createWindow);