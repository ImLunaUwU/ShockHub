const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const ACTIONS_LOG_PATH = path.join(app.getPath('userData'), 'actions.log');
const MAX_ACTIONS = 100;

function ensureLogFile() {
  if (!fs.existsSync(ACTIONS_LOG_PATH)) {
    fs.writeFileSync(ACTIONS_LOG_PATH, '', 'utf8');
  }
}

function sanitizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function inferProvider(action) {
  const direct = String(action?.provider || '').toLowerCase();
  if (direct === 'pishock' || direct === 'openshock') return direct;

  const source = String(action?.source || '').toLowerCase();
  if (source.startsWith('pishock')) return 'pishock';
  if (source.startsWith('openshock')) return 'openshock';

  return null;
}

function normalizeEntry(raw) {
  return {
    timestamp: String(raw?.timestamp || new Date().toISOString()),
    type: String(raw?.type || 'Unknown'),
    shockerId: raw?.shockerId ?? null,
    shockerName: raw?.shockerName ?? null,
    intensity: sanitizeNumber(raw?.intensity),
    duration: sanitizeNumber(raw?.duration),
    provider: inferProvider(raw),
    source: String(raw?.source || 'app')
  };
}

function readActions() {
  ensureLogFile();

  const raw = fs.readFileSync(ACTIONS_LOG_PATH, 'utf8');
  if (!raw.trim()) return [];

  const parsed = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .map(normalizeEntry);

  return parsed.slice(-MAX_ACTIONS);
}

function writeActions(actions) {
  const trimmed = actions.slice(-MAX_ACTIONS).map(normalizeEntry);
  const output = trimmed.map(entry => JSON.stringify(entry)).join('\n');
  fs.writeFileSync(ACTIONS_LOG_PATH, output ? `${output}\n` : '', 'utf8');
}

function logAction(action) {
  const entry = normalizeEntry({
    ...action,
    timestamp: new Date().toISOString()
  });

  const actions = readActions();
  actions.push(entry);
  writeActions(actions);

  return entry;
}

function getActionLogs() {
  return readActions().slice().reverse();
}

function clearActionLogs() {
  ensureLogFile();
  fs.writeFileSync(ACTIONS_LOG_PATH, '', 'utf8');
  return true;
}

module.exports = {
  logAction,
  getActionLogs,
  clearActionLogs,
  ACTIONS_LOG_PATH
};
