const list = document.getElementById('shockers');

// new arena breakout controls
const arenaEnabled = document.getElementById('arenaEnabled');
const arenaSensitivity = document.getElementById('arenaSensitivity');
const arenaMinIntensity = document.getElementById('arenaMinIntensity');
const arenaMaxIntensity = document.getElementById('arenaMaxIntensity');
const arenaDuration = document.getElementById('arenaDuration');
const arenaFocusX = document.getElementById('arenaFocusX');
const arenaFocusY = document.getElementById('arenaFocusY');
const arenaFocusW = document.getElementById('arenaFocusW');
const arenaFocusH = document.getElementById('arenaFocusH');
const arenaPickFocus = document.getElementById('arenaPickFocus');
const arenaFullFocus = document.getElementById('arenaFullFocus');
const arenaStart = document.getElementById('arenaStart');
const leagueEnabled = document.getElementById('leagueEnabled');
const leagueSensitivity = document.getElementById('leagueSensitivity');
const leagueMinIntensity = document.getElementById('leagueMinIntensity');
const leagueMaxIntensity = document.getElementById('leagueMaxIntensity');
const leagueDuration = document.getElementById('leagueDuration');
const leagueMapping = document.getElementById('leagueMapping');
const leagueStart = document.getElementById('leagueStart');
const leagueStatus = document.getElementById('leagueStatus');
const leagueDebug = document.getElementById('leagueDebug');
const leagueSensitivityLabel = document.getElementById('leagueSensitivityLabel');
const leagueMinIntensityLabel = document.getElementById('leagueMinIntensityLabel');
const leagueMaxIntensityLabel = document.getElementById('leagueMaxIntensityLabel');
const intensity = document.getElementById('intensity');
const duration = document.getElementById('duration');
const intensityValue = document.getElementById('intensityValue');
const durationValue = document.getElementById('durationValue');
const provider = document.getElementById('provider');
const openshockConfig = document.getElementById('openshockConfig');
const pishockConfig = document.getElementById('pishockConfig');
const apiKeyInput = document.getElementById('apiKey');
const pishockUsernameInput = document.getElementById('pishockUsername');
const pishockApiKeyInput = document.getElementById('pishockApiKey');
const pishockScriptNameInput = document.getElementById('pishockScriptName');
const pishockShareCodesInput = document.getElementById('pishockShareCodes');

const ARENA_LIMBS = ['head','thorax','stomach','leftArm','rightArm','leftLeg','rightLeg'];
const DEFAULT_LIMB_CONFIGS = {
  head: { x: 70, y: 820, size: 1 },
  thorax: { x: 70, y: 850, size: 1 },
  stomach: { x: 70, y: 885, size: 1 },
  leftArm: { x: 40, y: 865, size: 1 },
  rightArm: { x: 100, y: 865, size: 1 },
  leftLeg: { x: 55, y: 935, size: 1 },
  rightLeg: { x: 85, y: 935, size: 1 }
};

const DEFAULT_LEAGUE_CONFIG = {
  enabled: false,
  threshold: 12,
  interval: 250,
  minIntensity: 1,
  maxIntensity: 100,
  duration: 300,
  cooldownMs: 500,
  targetShockerIds: []
};

const DEFAULT_PISHOCK_CONFIG = {
  username: '',
  apiKey: '',
  scriptName: 'ShockHub',
  shareCodes: []
};

const previewState = {
  captureWidth: 1920,
  captureHeight: 1080,
  selecting: false,
  dragStart: null,
  dragRect: null
};

const latestFrameCanvas = document.createElement('canvas');
const latestFrameCtx = latestFrameCanvas.getContext('2d');

const pickerState = {
  popup: null,
  timer: null,
  mode: 'focus',
  limb: null,
  dragStart: null,
  dragRect: null,
  sourceRect: null,
  displayWidth: 0,
  displayHeight: 0
};

let shockers = [];
let selected = new Set();
let allActionLogs = [];
let visibleActionLogs = [];
let lastLogSignature = '';
let allDebugConsoleLogs = [];
let lastDebugConsoleSignature = '';
let controlActionInFlight = false;
let controlInputsBound = false;
let unsavedWatchersBound = false;
let statusTimer = null;
let configAutoSaveTimer = null;
let vrAutoSaveTimer = null;

const CONTROL_PRESETS = {
  light: { intensity: 15, duration: 0.3 },
  medium: { intensity: 35, duration: 0.8 },
  heavy: { intensity: 60, duration: 1.5 }
};

const logsUiState = {
  query: '',
  type: 'All'
};

function setStatus(message, isError = false, durationMs = 2800) {
  const el = document.getElementById('qolStatus');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('error', Boolean(isError));
  el.classList.toggle('visible', Boolean(message));

  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }

  if (message && durationMs > 0) {
    statusTimer = setTimeout(() => {
      el.textContent = '';
      el.classList.remove('error');
      el.classList.remove('visible');
      statusTimer = null;
    }, durationMs);
  }
}

function logDebug(message, data) {
  if (data === undefined) {
    console.debug(`[debug] ${message}`);
    return;
  }
  let payload = '';
  try {
    payload = JSON.stringify(data);
  } catch {
    payload = String(data);
  }
  console.debug(`[debug] ${message} ${payload}`);
}

function scheduleConfigAutoSave() {
  if (configAutoSaveTimer) clearTimeout(configAutoSaveTimer);
  configAutoSaveTimer = setTimeout(() => {
    saveConfig(true);
    configAutoSaveTimer = null;
  }, 350);
}

function scheduleVRAutoSave() {
  if (vrAutoSaveTimer) clearTimeout(vrAutoSaveTimer);
  vrAutoSaveTimer = setTimeout(() => {
    saveVR(true);
    vrAutoSaveTimer = null;
  }, 350);
}

function updateSelectedCount() {
  const el = document.getElementById('selectedCount');
  if (!el) return;
  const count = selected.size;
  el.textContent = `${count} selected`;
}

function setControlButtonsDisabled(disabled) {
  document.querySelectorAll('[data-control-action]').forEach((button) => {
    button.disabled = disabled;
  });
}

function extractErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  return 'Unknown error';
}

async function runControlAction(task) {
  if (controlActionInFlight) {
    setStatus('Action already in progress…', true);
    logDebug('Control action blocked: already in flight');
    return false;
  }

  controlActionInFlight = true;
  setControlButtonsDisabled(true);
  try {
    await task();
    logDebug('Control action executed');
    return true;
  } catch (error) {
    console.error('[debug] Control action failed', error);
    setStatus(`Action failed: ${extractErrorMessage(error)}`, true, 4500);
    return false;
  } finally {
    controlActionInFlight = false;
    setControlButtonsDisabled(false);
  }
}

function persistSelectedShockers() {
  appConfig.ui ??= {};
  appConfig.ui.selectedShockerIds = [...selected];
  return window.api.setConfig(appConfig);
}

function clampValue(value, min, max, fallback, decimals = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.max(min, Math.min(max, parsed));
  if (decimals <= 0) return Math.round(clamped);
  return Number(clamped.toFixed(decimals));
}

function syncControlInputsFromSliders() {
  if (intensityValue) intensityValue.value = intensity.value;
  if (durationValue) durationValue.value = Number(duration.value).toFixed(1);
}

function syncControlSlidersFromInputs() {
  const nextIntensity = clampValue(intensityValue?.value, 1, 100, Number(intensity.value) || 20);
  const nextDuration = clampValue(durationValue?.value, 0.1, 60, Number(duration.value) || 0.3, 1);
  intensity.value = String(nextIntensity);
  duration.value = String(nextDuration);
  syncControlInputsFromSliders();
}

function applyControlPreset(name) {
  const preset = CONTROL_PRESETS[name];
  if (!preset) return;
  intensity.value = String(preset.intensity);
  duration.value = String(Number(preset.duration).toFixed(1));
  syncControlInputsFromSliders();
  setStatus(`Applied ${name} preset.`);
}

function formatDurationDisplay(rawDurationMs) {
  const durationMs = Number(rawDurationMs);
  if (!Number.isFinite(durationMs)) return '-';
  if (durationMs >= 1000) {
    const seconds = durationMs / 1000;
    return `${Number(seconds.toFixed(1))}s`;
  }
  return `${Math.round(durationMs)}ms`;
}

function formatLogTimestamp(rawTimestamp) {
  const when = new Date(rawTimestamp);
  if (Number.isNaN(when.getTime())) return String(rawTimestamp || '');

  const yyyy = String(when.getFullYear());
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  const dd = String(when.getDate()).padStart(2, '0');
  const hh = String(when.getHours()).padStart(2, '0');
  const mi = String(when.getMinutes()).padStart(2, '0');
  const ss = String(when.getSeconds()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function currentProvider() {
  return (provider?.value || appConfig?.provider || 'openshock') === 'pishock' ? 'pishock' : 'openshock';
}

function parseShareCodes(value) {
  return String(value || '')
    .split(/[\n,;\s]+/g)
    .map(v => v.trim().toUpperCase())
    .filter(Boolean);
}

function updateProviderUi() {
  const isPiShock = currentProvider() === 'pishock';
  if (openshockConfig) openshockConfig.style.display = isPiShock ? 'none' : '';
  if (pishockConfig) pishockConfig.style.display = isPiShock ? '' : 'none';
}

function toggleApiKeyVisibility() {
  const isPiShock = currentProvider() === 'pishock';
  const input = isPiShock ? pishockApiKeyInput : apiKeyInput;
  const toggle = document.getElementById(isPiShock ? 'pishockApiKeyToggle' : 'apiKeyToggle');
  if (!input || !toggle) return;
  const nextType = input.type === 'password' ? 'text' : 'password';
  input.type = nextType;
  toggle.textContent = nextType === 'password' ? 'Show' : 'Hide';
}

async function copyApiKey() {
  const input = currentProvider() === 'pishock' ? pishockApiKeyInput : apiKeyInput;
  if (!input) return;
  const value = input.value?.trim();
  if (!value) {
    setStatus('No API key to copy.', true);
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    setStatus('API key copied.');
  } catch {
    setStatus('Clipboard write failed.', true);
  }
}

async function testApiKey() {
  const mode = currentProvider();
  let payload;

  if (mode === 'pishock') {
    payload = {
      provider: 'pishock',
      username: pishockUsernameInput?.value?.trim() || '',
      apiKey: pishockApiKeyInput?.value?.trim() || '',
      scriptName: pishockScriptNameInput?.value?.trim() || 'ShockHub',
      shareCodes: parseShareCodes(pishockShareCodesInput?.value || '')
    };

    if (!payload.username || !payload.apiKey || payload.shareCodes.length === 0) {
      setStatus('Enter PiShock username, API key, and at least one share code.', true);
      return;
    }
  } else {
    payload = {
      provider: 'openshock',
      apiKey: apiKeyInput?.value?.trim() || ''
    };

    if (!payload.apiKey) {
      setStatus('Enter an API key first.', true);
      return;
    }
  }

  setStatus('Testing provider connection...', false, 0);
  const result = await window.api.testApiKey(payload);
  if (result?.ok) {
    const count = Number(result.shockerCount) || 0;
    setStatus(`Connection valid (${count} ${count === 1 ? 'shocker' : 'shockers'} found).`);
  } else {
    setStatus('Connection test failed. Check credentials and try again.', true);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatActionLog(log) {
  const timestamp = formatLogTimestamp(log.timestamp);
  const target = log.shockerName || log.shockerId || 'Unknown';
  const intensity = log.intensity == null ? '-' : log.intensity;
  const duration = log.duration == null ? '-' : formatDurationDisplay(log.duration);
  const providerName = resolveLogProvider(log);

  return `
    <div><strong>${escapeHtml(log.type || 'Unknown')}</strong> • ${escapeHtml(target)}</div>
    <div class="meta">
      <span class="meta-item log-time">${escapeHtml(timestamp)}</span>
      <span class="meta-item">${escapeHtml(providerName)}</span>
      <span class="meta-item">intensity ${escapeHtml(intensity)}</span>
      <span class="meta-item">duration ${escapeHtml(duration)}</span>
    </div>
  `;
}

function resolveLogProvider(log) {
  const explicit = String(log?.provider || '').toLowerCase();
  if (explicit === 'pishock' || explicit === 'openshock') return explicit;

  const source = String(log?.source || '').toLowerCase();
  if (source.startsWith('pishock')) return 'pishock';
  if (source.startsWith('openshock')) return 'openshock';
  return 'unknown';
}

function canResendLog(log) {
  const type = String(log?.type || '');
  const hasTarget = typeof log?.shockerId === 'string' && log.shockerId.trim().length > 0;
  if (!hasTarget) return false;
  return ['Shock', 'Vibrate', 'Sound', 'Stop'].includes(type);
}

function normalizeLogForSearch(log) {
  return [
    log.type,
    log.provider,
    log.shockerName,
    log.shockerId,
    log.source,
    log.timestamp
  ].map(v => String(v || '').toLowerCase()).join(' ');
}

function getFilteredLogs() {
  const query = logsUiState.query.trim().toLowerCase();
  return allActionLogs.filter(log => {
    if (logsUiState.type !== 'All' && log.type !== logsUiState.type) return false;
    if (!query) return true;
    return normalizeLogForSearch(log).includes(query);
  });
}

function makeLogSignature(logs) {
  return logs.map(log => `${log.timestamp}|${log.type}|${log.provider}|${log.shockerId}|${log.duration}`).join('\n');
}

async function renderActionLogs(options = {}) {
  const { refresh = true, force = false } = options;
  const container = document.getElementById('logsList');
  const countEl = document.getElementById('logsCount');
  if (!container) return;

  if (refresh) {
    const logs = await window.api.getActionLogs();
    const normalized = Array.isArray(logs) ? logs : [];
    const signature = makeLogSignature(normalized);
    if (!force && signature === lastLogSignature) return;
    allActionLogs = normalized;
    lastLogSignature = signature;
  }

  const filteredLogs = getFilteredLogs();
  visibleActionLogs = filteredLogs;
  const count = allActionLogs.length;
  if (countEl) {
    const visible = filteredLogs.length;
    const entryText = `${count} ${count === 1 ? 'entry' : 'entries'}`;
    const visibleText = visible === count ? '' : ` • ${visible} visible`;
    countEl.textContent = `(${entryText}${visibleText})`;
  }

  if (!filteredLogs.length) {
    container.innerHTML = allActionLogs.length
      ? '<div class="empty">No logs match the current filters.</div>'
      : '<div class="empty">No actions logged yet.</div>';
    return;
  }

  container.innerHTML = '';
  filteredLogs.forEach((log, index) => {
    const row = document.createElement('div');
    row.className = `log ${log.type || ''}`;
    const resendDisabled = canResendLog(log) ? '' : 'disabled';
    row.innerHTML = `
      <div class="log-main">${formatActionLog(log)}</div>
      <div class="log-actions">
        <button class="secondary" onclick="copyLogEntry(${index})">Copy</button>
        <button class="secondary" onclick="resendLogEntry(${index})" ${resendDisabled}>Resend</button>
      </div>
    `;
    container.appendChild(row);
  });
}

async function copyLogEntry(index) {
  const log = visibleActionLogs[index];
  if (!log) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(log));
    setStatus('Copied log entry.');
  } catch {
    setStatus('Clipboard write failed.', true);
  }
}

async function resendLogEntry(index) {
  const log = visibleActionLogs[index];
  if (!log || !canResendLog(log)) {
    setStatus('This log entry cannot be resent.', true);
    return;
  }

  const duration = Number.isFinite(Number(log.duration)) ? Number(log.duration) : 300;
  const intensity = Number.isFinite(Number(log.intensity)) ? Number(log.intensity) : 0;

  const executed = await runControlAction(async () => {
    await window.api.control([{
      id: log.shockerId,
      type: log.type,
      intensity,
      duration,
      exclusive: true
    }]);
  });

  if (!executed) return;

  setStatus(`Resent ${log.type} to ${log.shockerName || log.shockerId}.`);
  await renderActionLogs({ refresh: true, force: true });
}

async function clearActionLogs() {
  await window.api.clearActionLogs();
  setStatus('Cleared action logs.');
  await renderActionLogs({ refresh: true, force: true });
}

async function copyVisibleLogs() {
  const rows = getFilteredLogs();
  if (!rows.length) {
    setStatus('No visible logs to copy.', true);
    return;
  }

  const text = rows.map(log => JSON.stringify(log)).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    setStatus(`Copied ${rows.length} visible ${rows.length === 1 ? 'log' : 'logs'}.`);
  } catch {
    setStatus('Clipboard write failed.', true);
  }
}

async function exportVisibleLogs() {
  const rows = getFilteredLogs();
  if (!rows.length) {
    setStatus('No visible logs to export.', true);
    return;
  }

  const content = rows.map(log => JSON.stringify(log)).join('\n') + '\n';
  const result = await window.api.exportActionLogs({
    content,
    defaultName: 'actions-export.log'
  });

  if (result?.ok) {
    setStatus(`Exported ${rows.length} log entries.`);
  }
}

function formatDebugConsoleLog(log) {
  const timestamp = formatLogTimestamp(log.timestamp);
  const level = String(log.level || 'log').toLowerCase();
  const origin = String(log.origin || 'main').toLowerCase();
  const parsed = splitDebugMessage(log.message);
  const repeat = Number(log.repeatCount) || 1;
  const repeatMarkup = repeat > 1 ? `<span class="debug-repeat">x${repeat}</span>` : '';

  return `
    <div class="debug-head">
      <span class="debug-level ${escapeHtml(level)}">${escapeHtml(level.toUpperCase())}${repeatMarkup}</span>
      <span class="debug-origin">${escapeHtml(origin)}</span>
      <span class="debug-time">${escapeHtml(timestamp)}</span>
    </div>
    <div class="debug-message">${escapeHtml(parsed.message)}</div>
    ${parsed.location ? `<div class="debug-location">${escapeHtml(parsed.location)}</div>` : ''}
  `;
}

function getCondensedDebugConsoleLogs() {
  if (!Array.isArray(allDebugConsoleLogs) || !allDebugConsoleLogs.length) return [];

  const condensed = [];
  allDebugConsoleLogs.forEach((entry) => {
    const key = `${entry.level}|${entry.origin}|${entry.message}`;
    const last = condensed[condensed.length - 1];
    if (last && last._key === key) {
      last.repeatCount += 1;
      return;
    }

    condensed.push({
      ...entry,
      repeatCount: 1,
      _key: key
    });
  });

  return condensed.map(({ _key, ...item }) => item);
}

function splitDebugMessage(rawMessage) {
  const full = String(rawMessage || '').trim();
  const match = full.match(/^(.*)\s+\(([^()]+(?::\d+)?)\)$/s);
  if (!match) return { message: full, location: '' };

  const message = String(match[1] || '').trim();
  const locationRaw = String(match[2] || '').trim();
  return {
    message,
    location: formatDebugLocation(locationRaw)
  };
}

function formatDebugLocation(locationRaw) {
  if (!locationRaw) return '';

  if (locationRaw.startsWith('file:///')) {
    const noScheme = locationRaw.replace('file:///', '');
    const decoded = decodeURIComponent(noScheme);
    const normalized = decoded.replaceAll('\\', '/');
    const parts = normalized.split('/').filter(Boolean);
    const tail = parts.slice(-2).join('/');
    return tail || normalized;
  }

  return locationRaw;
}

function makeDebugConsoleSignature(logs) {
  return logs.map((log) => `${log.timestamp}|${log.level}|${log.origin}|${log.message}`).join('\n');
}

async function renderDebugLogs(options = {}) {
  const { refreshConsole = true, force = false } = options;
  const consoleContainer = document.getElementById('debugConsoleList');
  const countsEl = document.getElementById('debugCounts');
  if (!consoleContainer) return;

  if (refreshConsole) {
    const logs = await window.api.getDebugLogs();
    const normalized = Array.isArray(logs) ? logs : [];
    const signature = makeDebugConsoleSignature(normalized);
    if (force || signature !== lastDebugConsoleSignature) {
      allDebugConsoleLogs = normalized;
      lastDebugConsoleSignature = signature;
    }
  }

  if (countsEl) {
    const condensedCount = getCondensedDebugConsoleLogs().length;
    countsEl.textContent = `(console ${condensedCount})`;
  }

  const visibleLogs = getCondensedDebugConsoleLogs();

  if (!visibleLogs.length) {
    consoleContainer.innerHTML = '<div class="empty">No console logs yet.</div>';
  } else {
    consoleContainer.innerHTML = '';
    visibleLogs.forEach((log) => {
      const row = document.createElement('div');
      row.className = 'debug-log';
      row.innerHTML = formatDebugConsoleLog(log);
      consoleContainer.appendChild(row);
    });
  }
}

async function clearDebugConsoleLogs() {
  await window.api.clearDebugLogs();
  setStatus('Cleared debug console logs.');
  await renderDebugLogs({ refreshConsole: true, force: true });
}

async function copyDebugLogs() {
  const consoleText = getCondensedDebugConsoleLogs().map((log) => JSON.stringify(log)).join('\n');
  const output = [
    '# Console Logs',
    consoleText || '(none)',
    ''
  ].join('\n');

  try {
    await navigator.clipboard.writeText(output);
    setStatus('Copied debug logs.');
  } catch {
    setStatus('Clipboard write failed.', true);
  }
}

async function exportDebugLogs() {
  const consoleText = getCondensedDebugConsoleLogs().map((log) => JSON.stringify(log)).join('\n');
  const content = [
    '# Console Logs',
    consoleText || '(none)',
    ''
  ].join('\n');

  const result = await window.api.exportActionLogs({
    content,
    defaultName: 'debug-export.log'
  });

  if (result?.ok) {
    setStatus('Exported debug logs.');
  }
}

async function exportConfigFile() {
  setStatus('Reminder: exported config includes your API key.', true, 4200);
  const result = await window.api.exportConfig();
  if (result?.ok) setStatus('Config exported.');
}

async function importConfigFile() {
  const result = await window.api.importConfig();
  if (!result?.ok) return;
  location.reload();
}

async function resetConfigFile() {
  if (!confirm('Reset config to defaults?')) return;
  await window.api.resetConfig();
  location.reload();
}

/* ===== Load ===== */
let appConfig = {};

async function load() {
  await loadAppConfig();
  logDebug('App config loaded', { provider: appConfig.provider, activeTab: appConfig?.ui?.activeTab });

  if (!controlInputsBound) {
    intensity?.addEventListener('input', syncControlInputsFromSliders);
    duration?.addEventListener('input', syncControlInputsFromSliders);
    intensityValue?.addEventListener('change', syncControlSlidersFromInputs);
    durationValue?.addEventListener('change', syncControlSlidersFromInputs);
    controlInputsBound = true;
  }

  if (!unsavedWatchersBound) {
    apiKey?.addEventListener('input', () => {
      scheduleConfigAutoSave();
    });
    provider?.addEventListener('change', async () => {
      updateProviderUi();
      await saveConfig(true);
      await refreshShockers(true);
      logDebug('Provider changed', { provider: currentProvider() });
    });
    pishockUsernameInput?.addEventListener('input', () => {
      scheduleConfigAutoSave();
    });
    pishockApiKeyInput?.addEventListener('input', () => {
      scheduleConfigAutoSave();
    });
    pishockScriptNameInput?.addEventListener('input', () => {
      scheduleConfigAutoSave();
    });
    pishockShareCodesInput?.addEventListener('input', () => {
      scheduleConfigAutoSave();
    });
    vrPrefix?.addEventListener('input', () => {
      scheduleVRAutoSave();
    });
    vrEnabled?.addEventListener('change', () => {
      saveVR(true);
    });
    unsavedWatchersBound = true;
  }

  syncControlInputsFromSliders();

  // ---- Global config ----
  provider.value = appConfig.provider || 'openshock';
  apiKey.value = appConfig.apiKey || '';
  if (apiKeyInput) apiKeyInput.type = 'password';
  const apiToggle = document.getElementById('apiKeyToggle');
  if (apiToggle) apiToggle.textContent = 'Show';
  if (pishockUsernameInput) pishockUsernameInput.value = appConfig.pishock?.username || '';
  if (pishockApiKeyInput) pishockApiKeyInput.value = appConfig.pishock?.apiKey || '';
  if (pishockScriptNameInput) pishockScriptNameInput.value = appConfig.pishock?.scriptName || 'ShockHub';
  if (pishockShareCodesInput) pishockShareCodesInput.value = (appConfig.pishock?.shareCodes || []).join('\n');
  if (pishockApiKeyInput) pishockApiKeyInput.type = 'password';
  const pishockToggle = document.getElementById('pishockApiKeyToggle');
  if (pishockToggle) pishockToggle.textContent = 'Show';
  updateProviderUi();
  vrEnabled.checked = appConfig.vrchat?.enabled || false;
  vrPrefix.value = appConfig.vrchat?.prefix || 'openshock';

  // ---- League of Legends config ----
  leagueEnabled.checked = appConfig.leagueOfLegends?.enabled || false;
  leagueSensitivity.value = appConfig.leagueOfLegends?.threshold || 12;
  leagueMinIntensity.value = appConfig.leagueOfLegends?.minIntensity || 1;
  leagueMaxIntensity.value = appConfig.leagueOfLegends?.maxIntensity || 100;
  leagueDuration.value = appConfig.leagueOfLegends?.duration || 300;
  leagueSensitivityLabel.textContent = leagueSensitivity.value;
  leagueMinIntensityLabel.textContent = leagueMinIntensity.value;
  leagueMaxIntensityLabel.textContent = leagueMaxIntensity.value;

  // ---- Arena Breakout Infinite config ----
  arenaEnabled.checked = appConfig.arenaBreakout?.enabled || false;
  arenaSensitivity.value = appConfig.arenaBreakout?.threshold || 50;
  arenaMinIntensity.value = appConfig.arenaBreakout?.minIntensity || 1;
  arenaMaxIntensity.value = appConfig.arenaBreakout?.maxIntensity || 100;
  arenaDuration.value = appConfig.arenaBreakout?.duration || 300;
  const focus = appConfig.arenaBreakout?.focusArea || { x: 0, y: 0, width: 1920, height: 1080 };
  arenaFocusX.value = focus.x;
  arenaFocusY.value = focus.y;
  arenaFocusW.value = focus.width;
  arenaFocusH.value = focus.height;
  // update the label texts if present
  arenaMinIntensity.nextElementSibling.textContent = arenaMinIntensity.value;
  arenaMaxIntensity.nextElementSibling.textContent = arenaMaxIntensity.value;

  // slider label updates
  arenaMinIntensity.oninput = () => arenaMinIntensity.nextElementSibling.textContent = arenaMinIntensity.value;
  arenaMaxIntensity.oninput = () => arenaMaxIntensity.nextElementSibling.textContent = arenaMaxIntensity.value;

  function getFocusFromInputs() {
    const raw = {
      x: Math.max(0, Number(arenaFocusX.value) || 0),
      y: Math.max(0, Number(arenaFocusY.value) || 0),
      width: Math.max(1, Number(arenaFocusW.value) || previewState.captureWidth),
      height: Math.max(1, Number(arenaFocusH.value) || previewState.captureHeight)
    };

    const maxW = Math.max(1, previewState.captureWidth);
    const maxH = Math.max(1, previewState.captureHeight);
    const x = Math.min(raw.x, maxW - 1);
    const y = Math.min(raw.y, maxH - 1);
    const width = Math.min(raw.width, maxW - x);
    const height = Math.min(raw.height, maxH - y);

    return { x, y, width: Math.max(1, width), height: Math.max(1, height) };
  }

  function setFocusInputs(rect) {
    arenaFocusX.value = Math.round(rect.x);
    arenaFocusY.value = Math.round(rect.y);
    arenaFocusW.value = Math.round(rect.width);
    arenaFocusH.value = Math.round(rect.height);
  }

  function pushFocusToRuntime() {
    appConfig.arenaBreakout.focusArea = getFocusFromInputs();
    window.arenaBreakout?.update(appConfig.arenaBreakout);
    saveArena();
  }

  function getPickerSourceRect(mode) {
    if (mode === 'limb') {
      return getFocusFromInputs();
    }
    return {
      x: 0,
      y: 0,
      width: previewState.captureWidth,
      height: previewState.captureHeight
    };
  }

  function stopPicker() {
    if (pickerState.timer) {
      clearInterval(pickerState.timer);
      pickerState.timer = null;
    }
    if (pickerState.popup && !pickerState.popup.closed) {
      pickerState.popup.close();
    }
    pickerState.popup = null;
    pickerState.dragStart = null;
    pickerState.dragRect = null;
    pickerState.sourceRect = null;
    pickerState.displayWidth = 0;
    pickerState.displayHeight = 0;
  }

  function applyPickerSelection() {
    if (!pickerState.dragRect || !pickerState.sourceRect) return;

    const rect = {
      x: Math.round(pickerState.dragRect.x),
      y: Math.round(pickerState.dragRect.y),
      width: Math.max(1, Math.round(pickerState.dragRect.width)),
      height: Math.max(1, Math.round(pickerState.dragRect.height))
    };

    if (pickerState.mode === 'focus') {
      setFocusInputs(rect);
      pushFocusToRuntime();
      return;
    }

    if (pickerState.mode === 'limb' && pickerState.limb) {
      const row = document.querySelector(`.arena-limb-row[data-limb="${pickerState.limb}"]`);
      if (!row) return;
      row.querySelector('.limb-x').value = rect.x;
      row.querySelector('.limb-y').value = rect.y;
      row.querySelector('.limb-size').value = Math.max(1, Math.round(Math.max(rect.width, rect.height)));

      appConfig.arenaBreakout.limbConfigs = gatherArenaLimbConfig();
      window.arenaBreakout?.update(appConfig.arenaBreakout);
      saveArena();
    }
  }

  function drawPickerFrame() {
    if (!pickerState.popup || pickerState.popup.closed) {
      stopPicker();
      return;
    }
    if (!latestFrameCanvas.width || !latestFrameCanvas.height) return;

    const pickerCanvas = pickerState.popup.document.getElementById('picker-canvas');
    const pickerHint = pickerState.popup.document.getElementById('picker-hint');
    if (!pickerCanvas) return;

    pickerState.sourceRect = getPickerSourceRect(pickerState.mode);

    const availableW = Math.max(200, (pickerState.popup.innerWidth || 1200) - 28);
    const availableH = Math.max(160, (pickerState.popup.innerHeight || 900) - 180);
    const scale = Math.min(
      availableW / pickerState.sourceRect.width,
      availableH / pickerState.sourceRect.height
    );
    const displayWidth = Math.max(1, Math.round(pickerState.sourceRect.width * scale));
    const displayHeight = Math.max(1, Math.round(pickerState.sourceRect.height * scale));

    if (pickerCanvas.width !== displayWidth || pickerCanvas.height !== displayHeight) {
      pickerCanvas.width = displayWidth;
      pickerCanvas.height = displayHeight;
      pickerState.displayWidth = displayWidth;
      pickerState.displayHeight = displayHeight;
    }

    const pctx = pickerCanvas.getContext('2d');
    pctx.clearRect(0, 0, pickerCanvas.width, pickerCanvas.height);
    pctx.drawImage(
      latestFrameCanvas,
      pickerState.sourceRect.x,
      pickerState.sourceRect.y,
      pickerState.sourceRect.width,
      pickerState.sourceRect.height,
      0,
      0,
      pickerCanvas.width,
      pickerCanvas.height
    );

    if (pickerState.mode === 'focus') {
      pickerHint.textContent = 'Drag a rectangle over the monitor/game area, then click Apply.';
    } else {
      pickerHint.textContent = `Drag a small box on ${pickerState.limb} to set location and size.`;
    }

    if (pickerState.dragRect) {
      pctx.strokeStyle = '#22c55e';
      pctx.lineWidth = 2;
      pctx.strokeRect(
        (pickerState.dragRect.x / pickerState.sourceRect.width) * pickerCanvas.width,
        (pickerState.dragRect.y / pickerState.sourceRect.height) * pickerCanvas.height,
        (pickerState.dragRect.width / pickerState.sourceRect.width) * pickerCanvas.width,
        (pickerState.dragRect.height / pickerState.sourceRect.height) * pickerCanvas.height
      );
    }
  }

  function openPicker(mode, limb = null) {
    if (!latestFrameCanvas.width || !latestFrameCanvas.height) {
      alert('Start capture first so a frame is available.');
      return;
    }

    stopPicker();

    pickerState.mode = mode;
    pickerState.limb = limb;
    pickerState.dragStart = null;
    pickerState.dragRect = mode === 'focus'
      ? { ...getFocusFromInputs() }
      : (() => {
          const cfg = appConfig.arenaBreakout?.limbConfigs?.[limb] || DEFAULT_LIMB_CONFIGS[limb];
          const size = Math.max(1, Number(cfg.size) || 1);
          return { x: cfg.x, y: cfg.y, width: size, height: size };
        })();

    const title = mode === 'focus' ? 'Pick Focus Area' : `Pick ${limb} Area`;
    const popup = window.open('', 'arena-picker', 'width=1280,height=920');
    if (!popup) {
      alert('Popup blocked. Please allow popups for this app window.');
      return;
    }

    popup.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
      body{margin:0;background:#111;color:#e6e6eb;font-family:system-ui;padding:14px}
      #picker-canvas{border:1px solid #444;cursor:crosshair;display:block;max-width:100%}
      .row{display:flex;gap:8px;align-items:center;margin-top:10px}
      button{background:#3b82f6;border:none;border-radius:6px;color:white;padding:7px 12px;cursor:pointer}
      button.secondary{background:#555}
      #picker-hint{opacity:.8;font-size:13px;margin-top:8px}
    </style></head><body>
      <h3 style="margin:0 0 8px 0">${title}</h3>
      <div id="picker-hint">Loading frame…</div>
      <canvas id="picker-canvas"></canvas>
      <div class="row">
        <button id="picker-apply">Apply</button>
        <button id="picker-cancel" class="secondary">Cancel</button>
      </div>
    </body></html>`);
    popup.document.close();

    pickerState.popup = popup;

    const pickerCanvas = popup.document.getElementById('picker-canvas');
    const toSource = (clientX, clientY) => {
      const rect = pickerCanvas.getBoundingClientRect();
      const px = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const py = Math.max(0, Math.min(rect.height, clientY - rect.top));
      return {
        x: (px / rect.width) * pickerState.sourceRect.width,
        y: (py / rect.height) * pickerState.sourceRect.height
      };
    };

    pickerCanvas.onmousedown = (event) => {
      const point = toSource(event.clientX, event.clientY);
      pickerState.dragStart = point;
      pickerState.dragRect = { x: point.x, y: point.y, width: 1, height: 1 };
    };
    pickerCanvas.onmousemove = (event) => {
      if (!pickerState.dragStart) return;
      const point = toSource(event.clientX, event.clientY);
      const x = Math.min(pickerState.dragStart.x, point.x);
      const y = Math.min(pickerState.dragStart.y, point.y);
      const width = Math.max(1, Math.abs(point.x - pickerState.dragStart.x));
      const height = Math.max(1, Math.abs(point.y - pickerState.dragStart.y));
      pickerState.dragRect = { x, y, width, height };
    };
    pickerCanvas.onmouseup = () => {
      pickerState.dragStart = null;
    };

    popup.document.getElementById('picker-apply').onclick = () => {
      applyPickerSelection();
      stopPicker();
    };
    popup.document.getElementById('picker-cancel').onclick = () => {
      stopPicker();
    };
    popup.onbeforeunload = () => stopPicker();

    pickerState.timer = setInterval(drawPickerFrame, 33);
    drawPickerFrame();
  }

  [arenaFocusX, arenaFocusY, arenaFocusW, arenaFocusH].forEach(el => {
    el.onchange = pushFocusToRuntime;
  });

  [arenaSensitivity, arenaMinIntensity, arenaMaxIntensity, arenaDuration].forEach(el => {
    el.onchange = () => saveArena();
  });

  arenaPickFocus.onclick = () => {
    openPicker('focus');
  };

  arenaFullFocus.onclick = () => {
    const rect = {
      x: 0,
      y: 0,
      width: previewState.captureWidth,
      height: previewState.captureHeight
    };
    setFocusInputs(rect);
    pushFocusToRuntime();
  };

  window.pickArenaLimb = (limb) => openPicker('limb', limb);

  // checkbox enable toggles capture as well
  arenaEnabled.onchange = async () => {
    if (arenaEnabled.checked) {
      try {
        await window.arenaBreakout?.start();
        arenaStart.textContent = 'Stop Capture';
        updateStatus('capturing');
        await saveArena();
      } catch (err) {
        updateStatus('capture failed');
      }
    } else {
      window.arenaBreakout?.stop();
      arenaStart.textContent = 'Start Capture';
      updateStatus('not capturing');
      await saveArena();
    }
  };

  const statusEl = document.getElementById('arena-status');
  function updateStatus(txt) { if (statusEl) statusEl.textContent = txt; }

  // wire up start button
  function setButtons(capturing) {
    arenaStart.textContent = capturing ? 'Stop Capture' : 'Start Capture';
  }

  arenaStart.onclick = async () => {
    if (arenaStart.textContent === 'Start Capture') {
      try {
        await window.arenaBreakout?.start();
        arenaEnabled.checked = true;
        updateStatus('capturing');
        setButtons(true);
        await saveArena();
      } catch (err) {
        updateStatus('capture failed: ' + err.message);
        setButtons(false);
        console.error(err);
      }
    } else {
      window.arenaBreakout?.stop();
      arenaEnabled.checked = false;
      updateStatus('not capturing');
      setButtons(false);
      await saveArena();
    }
  };
  // register debug listener
  window.arenaBreakout?.onDebug((sampleMap, canvas) => {
    const preview = document.getElementById('arena-preview');
    if (canvas) {
      latestFrameCanvas.width = canvas.width;
      latestFrameCanvas.height = canvas.height;
      latestFrameCtx.drawImage(canvas, 0, 0);
    }

    if (preview && canvas) {
      const pctx = preview.getContext('2d');
      previewState.captureWidth = canvas.width;
      previewState.captureHeight = canvas.height;
      const focusRect = getFocusFromInputs();
      const scaleX = preview.width / focusRect.width;
      const scaleY = preview.height / focusRect.height;
      pctx.clearRect(0, 0, preview.width, preview.height);
      pctx.drawImage(
        canvas,
        focusRect.x,
        focusRect.y,
        focusRect.width,
        focusRect.height,
        0,
        0,
        preview.width,
        preview.height
      );

      pctx.strokeStyle = '#22c55e';
      pctx.lineWidth = 2;
      pctx.strokeRect(1, 1, preview.width - 2, preview.height - 2);

      // draw picked limb sample areas on top of preview
      ARENA_LIMBS.forEach((limb) => {
        const cfg = appConfig.arenaBreakout?.limbConfigs?.[limb] || DEFAULT_LIMB_CONFIGS[limb];
        const size = Math.max(1, Number(cfg?.size) || 1);
        const px = (Number(cfg?.x) || 0) * scaleX;
        const py = (Number(cfg?.y) || 0) * scaleY;
        const pw = Math.max(2, size * scaleX);
        const ph = Math.max(2, size * scaleY);

        const state = sampleMap?.[limb]?.state || 'neutral';
        const color = state === 'damage' ? '#ef4444' : state === 'healing' ? '#22c55e' : '#60a5fa';

        pctx.strokeStyle = color;
        pctx.lineWidth = 1.5;
        pctx.strokeRect(px, py, pw, ph);

        pctx.fillStyle = color;
        pctx.font = '10px system-ui';
        pctx.fillText(limb.slice(0, 2).toUpperCase(), px + 2, py - 2 < 10 ? py + 10 : py - 2);
      });
    }

    const circlesContainer = document.getElementById('arena-circles');
    if (!circlesContainer) return;

    let circles = circlesContainer.querySelectorAll('.limb-chip');
    if (circles.length === 0) {
      // create circle elements once
      circlesContainer.innerHTML = '';
      Object.keys(sampleMap).forEach((limb) => {
        const chip = document.createElement('div');
        chip.className = 'limb-chip';
        chip.innerHTML = `<div class="limb"></div><div class="limb-name">${limb}</div>`;
        circlesContainer.appendChild(chip);
      });
      circles = circlesContainer.querySelectorAll('.limb-chip');
    }

    let idx = 0;
    Object.entries(sampleMap).forEach(([limb, sample]) => {
      const chip = circles[idx++];
      const div = chip.querySelector('.limb');
      const stateText = sample?.state || 'neutral';
      chip.querySelector('.limb-name').textContent = `${limb} (${stateText})`;
      const r = Math.min(255, Math.max(0, Math.round(sample?.r ?? 0)));
      const g = Math.min(255, Math.max(0, Math.round(sample?.g ?? 0)));
      const b = Math.min(255, Math.max(0, Math.round(sample?.b ?? 0)));
      div.style.background = `rgb(${r},${g},${b})`;
      div.title = `${limb}: rgb(${r}, ${g}, ${b})`;
      div.textContent = limb.slice(0, 2).toUpperCase();
      const luminance = (r * 0.299) + (g * 0.587) + (b * 0.114);
      div.style.color = luminance > 140 ? '#000' : '#fff';
    });
  });

  leagueSensitivity.oninput = () => {
    leagueSensitivityLabel.textContent = leagueSensitivity.value;
  };
  leagueMinIntensity.oninput = () => {
    leagueMinIntensityLabel.textContent = leagueMinIntensity.value;
  };
  leagueMaxIntensity.oninput = () => {
    leagueMaxIntensityLabel.textContent = leagueMaxIntensity.value;
  };

  [
    leagueSensitivity,
    leagueMinIntensity,
    leagueMaxIntensity,
    leagueDuration,
    leagueMapping
  ].forEach((el) => {
    el.onchange = () => saveLeague();
  });

  leagueEnabled.onchange = async () => {
    if (leagueEnabled.checked) {
      try {
        await window.leagueOfLegends?.start();
        leagueStart.textContent = 'Stop Hook';
        if (leagueStatus) leagueStatus.textContent = 'hooked';
        await saveLeague();
      } catch (err) {
        if (leagueStatus) leagueStatus.textContent = 'hook failed';
      }
    } else {
      window.leagueOfLegends?.stop();
      leagueStart.textContent = 'Start Hook';
      if (leagueStatus) leagueStatus.textContent = 'not hooked';
      await saveLeague();
    }
  };

  leagueStart.onclick = async () => {
    if (leagueStart.textContent === 'Start Hook') {
      try {
        await window.leagueOfLegends?.start();
        leagueEnabled.checked = true;
        leagueStart.textContent = 'Stop Hook';
        if (leagueStatus) leagueStatus.textContent = 'hooked';
        await saveLeague();
      } catch (err) {
        if (leagueStatus) leagueStatus.textContent = 'hook failed';
      }
    } else {
      window.leagueOfLegends?.stop();
      leagueEnabled.checked = false;
      leagueStart.textContent = 'Start Hook';
      if (leagueStatus) leagueStatus.textContent = 'not hooked';
      await saveLeague();
    }
  };

  window.leagueOfLegends?.onDebug((sample) => {
    if (!sample) return;

    if (leagueDebug) {
      if (!sample.ok) {
        leagueDebug.textContent = sample.message || 'waiting for game data...';
      } else {
        const ratio = Number(sample.healthPercent || 0);
        const summoner = sample.summoner || 'Unknown';
        const drop = Number(sample.dropPercent || 0);
        const marker = sample.triggered ? ' • triggered' : '';
        leagueDebug.textContent = `${summoner} • health: ${ratio.toFixed(1)}% • drop: ${drop.toFixed(1)}% (threshold ${sample.threshold}%)${marker}`;
      }
    }

    if (leagueStatus) {
      if (sample.ok) {
        leagueStatus.textContent = 'hooked';
      } else if (leagueEnabled.checked) {
        leagueStatus.textContent = 'waiting for game';
      }
    }
  });

  await refreshShockers(true);
  restoreGameCollapse();
  await refreshOscStatus();
  await renderActionLogs();
  await activateTab(appConfig.ui.activeTab || 'control', false);

  if (window.arenaBreakout) {
    try {
      window.arenaBreakout.init(appConfig.arenaBreakout || {});
    } catch (err) {
      console.error('initial capture failed', err);
      updateStatus('capture failed: ' + err.message);
    }
  }

  if (arenaEnabled.checked) {
    updateStatus('capturing');
    setButtons(true);
  } else {
    updateStatus('not capturing');
    setButtons(false);
  }

  if (leagueEnabled.checked) {
    if (leagueStatus) leagueStatus.textContent = 'hooked';
    leagueStart.textContent = 'Stop Hook';
  } else {
    if (leagueStatus) leagueStatus.textContent = 'not hooked';
    leagueStart.textContent = 'Start Hook';
    if (leagueDebug) {
      leagueDebug.textContent = 'waiting for game data...';
    }
  }

  if (window.leagueOfLegends) {
    try {
      window.leagueOfLegends.init(appConfig.leagueOfLegends || {});
    } catch (err) {
      if (leagueStatus) leagueStatus.textContent = 'hook failed';
    }
  }
}

async function refreshShockers(silent = false) {
  try {
    shockers = await window.api.getShockers();
    logDebug('Shockers refreshed', { count: shockers.length, provider: currentProvider() });
    const configChanged = ensureConfigShockers(appConfig);

    const previousSelected = Array.from(appConfig.ui.selectedShockerIds || []);
    const filteredSelected = previousSelected.filter(id => shockers.some(s => s.id === id));
    selected = new Set(filteredSelected);

    const selectedChanged =
      filteredSelected.length !== previousSelected.length ||
      filteredSelected.some((id, index) => id !== previousSelected[index]);

    if (selectedChanged) {
      appConfig.ui.selectedShockerIds = filteredSelected;
    }

    if (configChanged || selectedChanged) {
      await window.api.setConfig(appConfig);
    }

    render();
    updateSelectedCount();
    renderVRShockers();
    renderLeagueMapping();
    renderArenaMapping();
    renderArenaLimbConfig();

    if (!silent) {
      const count = shockers.length;
      setStatus(`Refreshed ${count} ${count === 1 ? 'shocker' : 'shockers'}.`);
    }
  } catch (error) {
    console.error('[debug] Failed to refresh shockers', error);
    setStatus(`Failed to refresh shockers: ${extractErrorMessage(error)}`, true, 4500);
  }
}

function restoreGameCollapse() {
  const collapsed = appConfig.ui?.collapsed || {};

  Object.entries(collapsed).forEach(([id, isCollapsed]) => {
    const content = document.getElementById(`game-${id}`);
    const chevron = document.getElementById(`chevron-${id}`);

    if (!content || !chevron) return;

    content.classList.toggle('active', !isCollapsed);
    chevron.classList.toggle('open', !isCollapsed);
  });
}

async function loadAppConfig() {
  appConfig = await window.api.getConfig();
  appConfig.provider = appConfig.provider === 'pishock' ? 'pishock' : 'openshock';
  appConfig.ui ??= {};
  appConfig.ui.collapsed ??= {};
  appConfig.ui.selectedShockerIds ??= [];
  appConfig.ui.activeTab ??= 'control';
  appConfig.vrchat ??= { enabled: false, prefix: 'openshock' };
  appConfig.leagueOfLegends ??= { ...DEFAULT_LEAGUE_CONFIG };
  appConfig.arenaBreakout ??= {
    enabled: false,
    threshold: 50,
    minIntensity: 1,
    maxIntensity: 100,
    duration: 300,
    focusArea: { x: 0, y: 0, width: 1920, height: 1080 },
    limbConfigs: {},
    limbMap: {}
  };
  delete appConfig.arenaBreakout.screenIndex;
  appConfig.arenaBreakout.focusArea ??= { x: 0, y: 0, width: 1920, height: 1080 };
  appConfig.arenaBreakout.limbConfigs = {
    ...DEFAULT_LIMB_CONFIGS,
    ...(appConfig.arenaBreakout.limbConfigs || {})
  };
  appConfig.leagueOfLegends = {
    ...DEFAULT_LEAGUE_CONFIG,
    ...(appConfig.leagueOfLegends || {})
  };
  appConfig.pishock = {
    ...DEFAULT_PISHOCK_CONFIG,
    ...(appConfig.pishock || {})
  };
  appConfig.pishock.shareCodes = Array.isArray(appConfig.pishock.shareCodes)
    ? appConfig.pishock.shareCodes.map(code => String(code || '').trim().toUpperCase()).filter(Boolean)
    : parseShareCodes(appConfig.pishock.shareCodes || '');
  appConfig.leagueOfLegends.targetShockerIds = Array.isArray(appConfig.leagueOfLegends.targetShockerIds)
    ? appConfig.leagueOfLegends.targetShockerIds
    : [];
  appConfig.shockers ??= {};
}

async function saveCollapseState(id, collapsed) {
  appConfig.ui.collapsed[id] = collapsed;
  await window.api.setConfig(appConfig);
}

/* ===== Ensure Config ===== */
function ensureConfigShockers(cfg) {
  cfg.shockers ||= {};
  let changed = false;
  const activeProvider = cfg.provider === 'pishock' ? 'pishock' : 'openshock';

  shockers.forEach(s => {
    if (!cfg.shockers[s.id]) {
      cfg.shockers[s.id] = {
        id: s.id,
        name: s.name,
        provider: activeProvider,
        vrchatId: '',
        mode: 'Shock',
        intensity: 20,
        duration: 300
      };
      changed = true;
    } else {
      if (!cfg.shockers[s.id].provider || cfg.shockers[s.id].provider !== activeProvider) {
        cfg.shockers[s.id].provider = activeProvider;
        changed = true;
      }

      if (cfg.shockers[s.id].name !== s.name) {
        cfg.shockers[s.id].name = s.name;
        changed = true;
      }
    }
  });

  return changed;
}

/* ===== Render Shockers ===== */
function render() {
  list.innerHTML = '';

  shockers.forEach(s => {
    const row = document.createElement('div');
    row.className = 'shocker';

    row.innerHTML = `
      <input type="checkbox" ${selected.has(s.id) ? 'checked' : ''} onchange="toggleSelect('${s.id}', this.checked)">
      <strong>${s.name}</strong>
      <div class="controls">
        <button data-control-action onclick="sendSingle('${s.id}','Shock')">Shock</button>
        <button data-control-action onclick="sendSingle('${s.id}','Vibrate')" class="secondary">Vib</button>
        <button data-control-action onclick="sendSingle('${s.id}','Sound')" class="secondary">Sound</button>
        <button data-control-action onclick="sendSingle('${s.id}','Stop')" class="stop">Stop</button>
      </div>
    `;
    list.appendChild(row);
  });
}

function toggleSelect(id, on) {
  on ? selected.add(id) : selected.delete(id);
  updateSelectedCount();
  persistSelectedShockers();
}

function selectAllShockers() {
  selected = new Set(shockers.map(s => s.id));
  render();
  updateSelectedCount();
  persistSelectedShockers();
}

function clearSelectedShockers() {
  selected.clear();
  render();
  updateSelectedCount();
  persistSelectedShockers();
}

function invertSelectedShockers() {
  const next = new Set();
  shockers.forEach(s => {
    if (!selected.has(s.id)) next.add(s.id);
  });
  selected = next;
  render();
  updateSelectedCount();
  persistSelectedShockers();
}

/* ===== Control ===== */
function buildShock(id, type) {
  const durationSeconds = clampValue(duration.value, 0.1, 60, 0.3, 1);
  return {
    id,
    type,
    intensity: type !== 'Sound' ? +intensity.value : 0,
    duration: Math.round(durationSeconds * 1000),
    exclusive: true
  };
}

async function sendCombined(type) {
  if (!selected.size) {
    setStatus('Select at least one shocker first.', true);
    return;
  }

  const executed = await runControlAction(async () => {
    await window.api.control([...selected].map(id => buildShock(id, type)));
  });

  if (!executed) return;

  setStatus(`${type} sent to ${selected.size} ${selected.size === 1 ? 'shocker' : 'shockers'}.`);
  await renderActionLogs({ refresh: true, force: true });
}

async function sendSingle(id, type) {
  const executed = await runControlAction(async () => {
    await window.api.control([buildShock(id, type)]);
  });

  if (!executed) return;

  setStatus(`${type} sent.`);
  await renderActionLogs({ refresh: true, force: true });
}

async function emergencyStop() {
  const executed = await runControlAction(async () => {
    await window.api.emergencyStop();
  });

  if (!executed) return;

  setStatus('Emergency stop triggered.');
  await renderActionLogs({ refresh: true, force: true });
}

/* ===== Config ===== */
async function saveConfig(silent = false) {
  appConfig.provider = currentProvider();
  appConfig.apiKey = apiKey.value.trim();
  appConfig.pishock ||= { ...DEFAULT_PISHOCK_CONFIG };
  appConfig.pishock.username = pishockUsernameInput?.value?.trim() || '';
  appConfig.pishock.apiKey = pishockApiKeyInput?.value?.trim() || '';
  appConfig.pishock.scriptName = pishockScriptNameInput?.value?.trim() || 'ShockHub';
  appConfig.pishock.shareCodes = parseShareCodes(pishockShareCodesInput?.value || '');
  await window.api.setConfig(appConfig);
  if (!silent) setStatus('Config saved.');
}

async function saveVR(silent = false) {
  appConfig.vrchat.enabled = vrEnabled.checked;
  appConfig.vrchat.prefix = vrPrefix.value.trim() || 'openshock';

  await window.api.setConfig(appConfig);
  await refreshOscStatus();
  if (!silent) setStatus('VRChat settings saved.');
  renderVRShockers(); // prefix refresh happens here
}

async function refreshOscStatus() {
  const el = document.getElementById('oscStatus');
  if (!el) return;

  try {
    const status = await window.api.getOscStatus();
    const isEnabled = Boolean(status?.enabled);
    const isRunning = Boolean(status?.running);

    if (!isEnabled) {
      el.textContent = 'OSC: Stopped (VRChat disabled)';
      return;
    }

    el.textContent = isRunning ? 'OSC: Running' : 'OSC: Starting...';
  } catch {
    el.textContent = 'OSC: Status unavailable';
  }
}

async function saveLeague() {
  appConfig.leagueOfLegends ||= {};
  appConfig.leagueOfLegends.enabled = leagueEnabled.checked;
  appConfig.leagueOfLegends.threshold = Math.max(1, Number(leagueSensitivity.value) || 12);

  let minVal = Number(leagueMinIntensity.value) || 1;
  let maxVal = Number(leagueMaxIntensity.value) || 100;
  if (minVal > maxVal) [minVal, maxVal] = [maxVal, minVal];
  appConfig.leagueOfLegends.minIntensity = minVal;
  appConfig.leagueOfLegends.maxIntensity = maxVal;
  appConfig.leagueOfLegends.duration = Math.max(100, Number(leagueDuration.value) || 300);

  appConfig.leagueOfLegends.targetShockerIds = Array.from(leagueMapping.selectedOptions).map(o => o.value);

  await window.api.setConfig(appConfig);
  window.leagueOfLegends?.update(appConfig.leagueOfLegends);
}

/* ===== Arena Breakout Config ===== */
async function saveArena() {
  appConfig.arenaBreakout ||= {};
  appConfig.arenaBreakout.enabled = arenaEnabled.checked;
  appConfig.arenaBreakout.threshold = +arenaSensitivity.value;
  let minVal = +arenaMinIntensity.value;
  let maxVal = +arenaMaxIntensity.value;
  if (minVal > maxVal) [minVal, maxVal] = [maxVal, minVal];
  appConfig.arenaBreakout.minIntensity = minVal;
  appConfig.arenaBreakout.maxIntensity = maxVal;
  appConfig.arenaBreakout.duration = +arenaDuration.value;
  delete appConfig.arenaBreakout.screenIndex;
  appConfig.arenaBreakout.focusArea = {
    x: Math.max(0, Number(arenaFocusX.value) || 0),
    y: Math.max(0, Number(arenaFocusY.value) || 0),
    width: Math.max(1, Number(arenaFocusW.value) || previewState.captureWidth),
    height: Math.max(1, Number(arenaFocusH.value) || previewState.captureHeight)
  };
  appConfig.arenaBreakout.limbConfigs = gatherArenaLimbConfig();
  appConfig.arenaBreakout.limbMap = gatherArenaMapping();

  await window.api.setConfig(appConfig);
  if (window.arenaBreakout) {
    window.arenaBreakout.update(appConfig.arenaBreakout);
  }
}

/* ===== VR Shocker Config ===== */
function renderVRShockers() {
  const el = document.getElementById('vr-shockers');
  el.innerHTML = '';

  const prefix = appConfig.vrchat.prefix || 'openshock';
  const activeProvider = currentProvider();

  Object.values(appConfig.shockers)
    .filter((s) => {
      const providerName = s.provider || 'openshock';
      return providerName === activeProvider;
    })
    .forEach(s => {
    const row = document.createElement('div');
    row.className = 'vr-row';

    row.innerHTML = `
      <div class="vr-name">${s.name}</div>

      <div class="vr-path">
        (/avatar/parameters/${prefix}/)
        <input class="vr-id"
          value="${s.vrchatId || ''}"
          placeholder="id"
          onchange="updateVR('${s.id}','vrchatId',this.value)">
      </div>

      <div class="vr-mode">
        <select onchange="updateVR('${s.id}','mode',this.value)">
          <option value="Shock" ${s.mode==='Shock'?'selected':''}>⚡ Shock</option>
          <option value="Vibrate" ${s.mode==='Vibrate'?'selected':''}>📳 Vibrate</option>
          <option value="Sound" ${s.mode==='Sound'?'selected':''}>🔊 Sound</option>
        </select>
      </div>

      <div class="vr-intensity">
        <input type="range" min="1" max="100"
          value="${s.intensity}"
          oninput="this.nextElementSibling.textContent=this.value"
          onchange="updateVR('${s.id}','intensity',this.value)">
        <span>${s.intensity}</span><span>%</span>
      </div>
    `;

    el.appendChild(row);
  });
}

function renderLeagueMapping() {
  if (!leagueMapping) return;

  const assigned = appConfig.leagueOfLegends?.targetShockerIds || [];
  leagueMapping.innerHTML = '';

  shockers.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    if (assigned.includes(s.id)) opt.selected = true;
    leagueMapping.appendChild(opt);
  });
}

/* ===== Arena mapping helpers ===== */
function renderArenaMapping() {
  const container = document.getElementById('arena-mapping');
  if (!container) return;
  container.innerHTML = '';

  ARENA_LIMBS.forEach(limb => {
    const row = document.createElement('div');
    row.className = 'arena-mapping-row';
    row.innerHTML = `
      <label for="map-${limb}">${limb}</label>
      <select id="map-${limb}" multiple size="3"></select>
    `;
    container.appendChild(row);

    const select = row.querySelector('select');
    select.onchange = () => saveArena();
    shockers.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      const assigned = appConfig.arenaBreakout?.limbMap?.[limb] || [];
      if (assigned.includes(s.id)) opt.selected = true;
      select.appendChild(opt);
    });
  });
}

/* ===== Arena Limb Config ===== */
function renderArenaLimbConfig() {
  const container = document.getElementById('arena-limb-config');
  if (!container) return;
  container.innerHTML = '';

  ARENA_LIMBS.forEach(limb => {
    const cfg = appConfig.arenaBreakout?.limbConfigs?.[limb] || DEFAULT_LIMB_CONFIGS[limb];
    const row = document.createElement('div');
    row.className = 'arena-limb-row';
    row.dataset.limb = limb;
    row.innerHTML = `
      <label>${limb}</label>
      <div class="limb-inputs">
        <input type="number" class="limb-x" value="${cfg.x}" placeholder="X" title="X position">
        <input type="number" class="limb-y" value="${cfg.y}" placeholder="Y" title="Y position">
        <input type="number" class="limb-size" value="${cfg.size}" min="1" max="20" title="Capture size (pixels)">
        <button type="button" class="secondary limb-pick" onclick="pickArenaLimb('${limb}')">Pick</button>
      </div>
    `;
    row.querySelector('.limb-x').onchange = () => saveArena();
    row.querySelector('.limb-y').onchange = () => saveArena();
    row.querySelector('.limb-size').onchange = () => saveArena();
    container.appendChild(row);
  });
}

function gatherArenaLimbConfig() {
  const configs = {};
  ARENA_LIMBS.forEach(limb => {
    const row = document.querySelector(`.arena-limb-row[data-limb="${limb}"]`);
    const def = DEFAULT_LIMB_CONFIGS[limb];
    if (!row) {
      configs[limb] = { ...def };
      return;
    }

    configs[limb] = {
      x: parseInt(row.querySelector('.limb-x')?.value, 10) || def.x,
      y: parseInt(row.querySelector('.limb-y')?.value, 10) || def.y,
      size: Math.max(1, parseInt(row.querySelector('.limb-size')?.value, 10) || def.size)
    };
  });
  return configs;
}

function gatherArenaMapping() {
  const map = {};
  ARENA_LIMBS.forEach(limb => {
    const select = document.getElementById(`map-${limb}`);
    if (select) {
      map[limb] = Array.from(select.selectedOptions).map(o => o.value);
    }
  });
  return map;
}

async function updateVR(id, key, value) {
  appConfig.shockers[id][key] =
    key === 'intensity' ? Number(value) : value;

  await window.api.setConfig(appConfig);
}

async function activateTab(tabId, persist = true) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

  const tabButton = document.querySelector(`.tab[data-tab="${tabId}"]`);
  const tabPanel = document.getElementById(`tab-${tabId}`);
  if (!tabButton || !tabPanel) return;

  tabButton.classList.add('active');
  tabPanel.classList.add('active');

  if (tabId === 'games') renderVRShockers();
  if (tabId === 'games') renderLeagueMapping();
  if (tabId === 'games') refreshOscStatus();
  if (tabId === 'logs') await renderActionLogs({ refresh: true, force: true });
  if (tabId === 'debug') await renderDebugLogs({ refreshConsole: true, force: true });
  logDebug('Tab activated', { tabId, persist });

  if (!persist) return;
  appConfig.ui.activeTab = tabId;
  await window.api.setConfig(appConfig);
}

/* ===== Tabs ===== */
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = async () => {
    await activateTab(tab.dataset.tab, true);
  };
});

document.getElementById('logsSearch')?.addEventListener('input', async (event) => {
  logsUiState.query = event.target.value || '';
  await renderActionLogs({ refresh: false, force: true });
});

document.getElementById('logsTypeFilter')?.addEventListener('change', async (event) => {
  logsUiState.type = event.target.value || 'All';
  await renderActionLogs({ refresh: false, force: true });
});

setInterval(() => {
  const logsTab = document.getElementById('tab-logs');
  if (logsTab?.classList.contains('active')) {
    renderActionLogs({ refresh: true, force: false });
  }

  const debugTab = document.getElementById('tab-debug');
  if (debugTab?.classList.contains('active')) {
    renderDebugLogs({ refreshConsole: true, force: false });
  }
}, 1000);

document.addEventListener('keydown', (event) => {
  const tag = (event.target?.tagName || '').toLowerCase();
  const isTyping = tag === 'input' || tag === 'textarea' || event.target?.isContentEditable;
  if (isTyping || !event.ctrlKey) return;

  if (event.key === '1') {
    event.preventDefault();
    sendCombined('Shock');
  } else if (event.key === '2') {
    event.preventDefault();
    sendCombined('Vibrate');
  } else if (event.key === '3') {
    event.preventDefault();
    sendCombined('Sound');
  } else if (event.key === '0') {
    event.preventDefault();
    emergencyStop();
  } else if (event.key.toLowerCase() === 'l') {
    event.preventDefault();
    activateTab('logs', true);
  }
});

load();

async function toggleGame(id) {
  const content = document.getElementById(`game-${id}`);
  const chevron = document.getElementById(`chevron-${id}`);

  const collapsed = content.classList.contains('active');

  content.classList.toggle('active', !collapsed);
  chevron.classList.toggle('open', !collapsed);

  await saveCollapseState(id, collapsed);
}
