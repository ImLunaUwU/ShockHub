const util = require('util');

const MAX_DEBUG_LOGS = 1000;
const logs = [];
let consolePatched = false;

function safeToString(value) {
  if (value instanceof Error) {
    return value.stack || value.message || String(value);
  }

  if (typeof value === 'string') return value;

  try {
    return util.inspect(value, { depth: 4, colors: false, breakLength: 120 });
  } catch {
    return String(value);
  }
}

function pushDebugLog(entry = {}) {
  const normalized = {
    timestamp: new Date().toISOString(),
    level: String(entry.level || 'log'),
    origin: String(entry.origin || 'main'),
    message: String(entry.message || '')
  };

  logs.push(normalized);
  if (logs.length > MAX_DEBUG_LOGS) {
    logs.splice(0, logs.length - MAX_DEBUG_LOGS);
  }

  return normalized;
}

function levelToName(level) {
  if (level === 1) return 'warn';
  if (level === 2) return 'error';
  if (level === 3) return 'debug';
  return 'log';
}

function attachMainConsoleCapture() {
  if (consolePatched) return;
  consolePatched = true;

  ['log', 'info', 'warn', 'error', 'debug'].forEach((method) => {
    const original = console[method]?.bind(console);
    if (!original) return;

    console[method] = (...args) => {
      try {
        pushDebugLog({
          level: method,
          origin: 'main',
          message: args.map(safeToString).join(' ')
        });
      } catch {
      }
      original(...args);
    };
  });
}

function captureRendererConsole(level, message, sourceId, line) {
  const suffix = [sourceId, line].filter(Boolean).join(':');
  pushDebugLog({
    level: levelToName(level),
    origin: 'renderer',
    message: suffix ? `${message} (${suffix})` : String(message || '')
  });
}

function getDebugLogs() {
  return logs.slice().reverse();
}

function clearDebugLogs() {
  logs.length = 0;
  return true;
}

module.exports = {
  pushDebugLog,
  attachMainConsoleCapture,
  captureRendererConsole,
  getDebugLogs,
  clearDebugLogs
};
