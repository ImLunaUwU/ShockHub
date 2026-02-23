const list = document.getElementById('shockers');

let shockers = [];
let selected = new Set();

/* ===== Load ===== */
let appConfig = {};

async function load() {
  await loadAppConfig();

  // ---- Global config ----
  apiKey.value = appConfig.apiKey || '';
  vrEnabled.checked = appConfig.vrchat?.enabled || false;
  vrPrefix.value = appConfig.vrchat?.prefix || 'openshock';

  // ---- Shockers ----
  shockers = await window.api.getShockers();
  ensureConfigShockers(appConfig);
  await window.api.setConfig(appConfig);

  render();
  renderVRShockers();
  restoreGameCollapse();
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
  appConfig.ui ??= {};
  appConfig.ui.collapsed ??= {};
  appConfig.vrchat ??= { enabled: false, prefix: 'openshock' };
  appConfig.shockers ??= {};
}

async function saveCollapseState(id, collapsed) {
  appConfig.ui.collapsed[id] = collapsed;
  await window.api.setConfig(appConfig);
}

/* ===== Ensure Config ===== */
function ensureConfigShockers(cfg) {
  cfg.shockers ||= {};
  shockers.forEach(s => {
    if (!cfg.shockers[s.id]) {
      cfg.shockers[s.id] = {
        id: s.id,
        name: s.name,
        vrchatId: '',
        mode: 'Shock',
        intensity: 20,
        duration: 300
      };
    }
  });
}

/* ===== Render Shockers ===== */
function render() {
  list.innerHTML = '';

  shockers.forEach(s => {
    const row = document.createElement('div');
    row.className = 'shocker';

    row.innerHTML = `
      <input type="checkbox" onchange="toggleSelect('${s.id}', this.checked)">
      <strong>${s.name}</strong>
      <div class="controls">
        <button onclick="sendSingle('${s.id}','Shock')">Shock</button>
        <button onclick="sendSingle('${s.id}','Vibrate')" class="secondary">Vib</button>
        <button onclick="sendSingle('${s.id}','Sound')" class="secondary">Sound</button>
        <button onclick="sendSingle('${s.id}','Stop')" class="stop">Stop</button>
      </div>
    `;
    list.appendChild(row);
  });
}

function toggleSelect(id, on) {
  on ? selected.add(id) : selected.delete(id);
}

/* ===== Control ===== */
function buildShock(id, type) {
  return {
    id,
    type,
    intensity: type !== 'Sound' ? +intensity.value : 0,
    duration: +duration.value,
    exclusive: true
  };
}

async function sendCombined(type) {
  await window.api.control([...selected].map(id => buildShock(id, type)));
}

async function sendSingle(id, type) {
  await window.api.control([buildShock(id, type)]);
}

async function emergencyStop() {
  await window.api.emergencyStop();
}

/* ===== Config ===== */
async function saveConfig() {
  appConfig.apiKey = apiKey.value.trim();
  await window.api.setConfig(appConfig);
}

async function saveVR() {
  appConfig.vrchat.enabled = vrEnabled.checked;
  appConfig.vrchat.prefix = vrPrefix.value.trim() || 'openshock';

  await window.api.setConfig(appConfig);
  renderVRShockers(); // prefix refresh happens here
}

/* ===== VR Shocker Config ===== */
function renderVRShockers() {
  const el = document.getElementById('vr-shockers');
  el.innerHTML = '';

  const prefix = appConfig.vrchat.prefix || 'openshock';

  Object.values(appConfig.shockers).forEach(s => {
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

async function updateVR(id, key, value) {
  appConfig.shockers[id][key] =
    key === 'intensity' ? Number(value) : value;

  await window.api.setConfig(appConfig);
}

/* ===== Tabs ===== */
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = async () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

    if (tab.dataset.tab === 'games') renderVRShockers();
  };
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
