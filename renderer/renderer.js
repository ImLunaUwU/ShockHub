let config;
let shockers = [];

async function init() {
  config = await window.api.loadConfig();

  document.getElementById("apiKey").value = config.apiKey;
  document.getElementById("combined").checked = config.combinedMode;

  shockers = await window.api.getShockers();
  renderShockers();
}

function renderShockers() {
  const container = document.getElementById("shockers");
  container.innerHTML = "";

  for (const s of shockers) {
    const div = document.createElement("div");
    div.className = "shocker";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = config.selectedShockers.includes(s.id);
    checkbox.onchange = () => toggleShocker(s.id);

    div.appendChild(checkbox);
    div.append(` ${s.name} (${s.isOnline ? "online" : "offline"})`);
    container.appendChild(div);
  }
}

function toggleShocker(id) {
  if (config.selectedShockers.includes(id)) {
    config.selectedShockers = config.selectedShockers.filter(x => x !== id);
  } else {
    config.selectedShockers.push(id);
  }
  window.api.saveConfig(config);
}

document.getElementById("save").onclick = () => {
  config.apiKey = document.getElementById("apiKey").value;
  config.combinedMode = document.getElementById("combined").checked;
  window.api.saveConfig(config);
  alert("Saved");
};

document.getElementById("shock").onclick = async () => {
  if (!config.selectedShockers.length) return alert("No shockers selected");

  await window.api.execute({
    shockerId: config.selectedShockers[0],
    command: {
      type: "shock",
      intensity: 30,
      durationMs: 500
    }
  });
};

init();