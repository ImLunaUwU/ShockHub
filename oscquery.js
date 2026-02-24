const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const createBonjour = require('bonjour');
const osc = require('osc');
const fs = require('fs');
const path = require('path');
const { app: electronApp } = require('electron');

const ShockHubController = require('./shockhub-controller');

const SERVICE_NAME = 'ShockHub';
const OSC_PORT = 9001;
const OSCQUERY_PORT = 9000;
const CONFIG_PATH = path.join(electronApp.getPath('userData'), 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function boolFromOSC(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v > 0.5;
  return false;
}

let started = false;
let udpPort = null;
let app = null;
let server = null;
let wss = null;
let bonjour = null;
let bonjourService = null;

const OSC_TREE = {
  FULL_PATH: '/',
  CONTENTS: {
    avatar: {
      FULL_PATH: '/avatar',
      ACCESS: 1,
      CONTENTS: {
        parameters: {
          FULL_PATH: '/avatar/parameters',
          ACCESS: 1,
          CONTENTS: {}
        }
      }
    }
  }
};

function startOscQuery() {
  if (started) return false;

  udpPort = new osc.UDPPort({
    localAddress: '0.0.0.0',
    localPort: OSC_PORT,
    metadata: true
  });

  udpPort.on('ready', () => {
    console.log(`[OSC] Listening on UDP ${OSC_PORT}`);
  });

  udpPort.on('message', msg => {
    try {
      handleOSC(msg.address, msg.args || []);
    } catch (e) {
      console.error('[OSC ERROR]', e);
    }
  });

  udpPort.open();

  app = express();
  server = http.createServer(app);
  wss = new WebSocket.Server({ server });

  app.get('/oscquery', (_, res) => res.json(OSC_TREE));

  app.get('/oscquery/host_info', (_, res) => {
    res.json({
      NAME: SERVICE_NAME,
      OSC_PORT,
      OSC_TRANSPORT: 'UDP',
      WS_PORT: OSCQUERY_PORT,
      EXTENSIONS: {
        ACCESS: true,
        TYPE: true,
        VALUE: false
      }
    });
  });

  wss.on('connection', ws => {
    ws.send(JSON.stringify({
      COMMAND: 'PATH_ADDED',
      DATA: OSC_TREE
    }));
  });

  server.listen(OSCQUERY_PORT, () => {
    console.log(`[OSCQuery] HTTP/WebSocket listening on ${OSCQUERY_PORT}`);
  });

  bonjour = createBonjour();
  bonjourService = bonjour.publish({
    name: SERVICE_NAME,
    type: 'oscquery',
    protocol: 'tcp',
    port: OSCQUERY_PORT,
    txt: {
      osc_port: String(OSC_PORT),
      osc_transport: 'udp'
    }
  });

  console.log('[OSCQuery] mDNS service published');
  started = true;
  return true;
}

async function stopOscQuery() {
  if (!started) return false;

  if (udpPort) {
    try { udpPort.close(); } catch {}
    udpPort = null;
  }

  if (wss) {
    try { wss.clients.forEach(client => client.close()); } catch {}
    try { wss.close(); } catch {}
    wss = null;
  }

  if (server) {
    await new Promise(resolve => {
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
    });
    server = null;
  }

  app = null;

  if (bonjourService) {
    try { bonjourService.stop(); } catch {}
    bonjourService = null;
  }

  if (bonjour) {
    try { bonjour.unpublishAll(); } catch {}
    try { bonjour.destroy(); } catch {}
    bonjour = null;
  }

  console.log('[OSCQuery] stopped');
  started = false;
  return true;
}

async function syncFromConfig(cfg = null) {
  const config = cfg || loadConfig();
  const shouldRun = Boolean(config?.vrchat?.enabled);

  if (shouldRun && !started) {
    startOscQuery();
    return;
  }

  if (!shouldRun && started) {
    await stopOscQuery();
  }
}

/* =========================
   OSC HANDLING
========================= */
function handleOSC(address, args) {
  if (!address.startsWith('/avatar/parameters/')) return;

  const cfg = loadConfig();
  if (!cfg.vrchat?.enabled) return;

  const prefix = (cfg.vrchat.prefix || 'openshock').trim();
  const pathPart = address.slice('/avatar/parameters/'.length);

  if (!pathPart.startsWith(prefix + '/')) return;

  const id = pathPart.slice(prefix.length + 1);
  const active = boolFromOSC(args[0]?.value);

  if (id === 'stop') {
    if (active) ShockHubController.emergencyStop();
    return;
  }

  const shocker = Object.values(cfg.shockers || {})
    .find(s => s.vrchatId === id);

  if (!shocker) return;

  if (active) {
    ShockHubController.startHold(shocker.mode, shocker.id);
  } else {
    ShockHubController.stopHold(shocker.id);
  }
}

module.exports = {
  startOscQuery,
  stopOscQuery,
  syncFromConfig,
  isRunning: () => started
};