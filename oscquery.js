const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bonjour = require('bonjour')();
const osc = require('osc');
const fs = require('fs');
const path = require('path');

const OpenShock = require('./openshock-controller');

const SERVICE_NAME = 'OpenShock-Spicer';
const OSC_PORT = 9001;
const OSCQUERY_PORT = 9000;
const CONFIG_PATH = path.join(__dirname, 'config.json');

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

/* =========================
   OSC RECEIVER
========================= */
const udpPort = new osc.UDPPort({
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

/* =========================
   OSCQUERY SERVER
========================= */
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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

bonjour.publish({
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
    if (active) OpenShock.emergencyStop();
    return;
  }

  const shocker = Object.values(cfg.shockers || {})
    .find(s => s.vrchatId === id);

  if (!shocker) return;

  if (active) {
    OpenShock.startHold(shocker.mode, shocker.id);
  } else {
    OpenShock.stopHold(shocker.id);
  }
}