(function() {
  let config = {
    enabled: false,
    threshold: 12,
    interval: 250,
    minIntensity: 1,
    maxIntensity: 100,
    duration: 300,
    cooldownMs: 500,
    targetShockerIds: []
  };

  let loopTimer = null;
  let isPolling = false;
  let lastHealthPercent = null;
  let lastTriggerAt = 0;
  let debugListeners = [];

  function addDebugListener(fn) {
    debugListeners.push(fn);
  }

  function notifyDebug(payload) {
    debugListeners.forEach((fn) => {
      try {
        fn(payload);
      } catch {}
    });
  }

  function scheduleNextPoll() {
    if (!config.enabled) return;
    const interval = Math.max(80, Number(config.interval) || 250);
    loopTimer = setTimeout(pollLiveData, interval);
  }

  async function triggerShock() {
    try {
      const allShockers = await window.api.getShockers();
      if (!Array.isArray(allShockers) || allShockers.length === 0) return;

      let targets = allShockers;
      if (Array.isArray(config.targetShockerIds) && config.targetShockerIds.length > 0) {
        targets = allShockers.filter((s) => config.targetShockerIds.includes(s.id));
      }
      if (targets.length === 0) return;

      const minIntensity = Math.max(1, Math.min(100, Number(config.minIntensity) || 1));
      const maxIntensity = Math.max(minIntensity, Math.min(100, Number(config.maxIntensity) || 100));
      const range = maxIntensity - minIntensity;
      const intensity = Math.round(minIntensity + (range > 0 ? Math.random() * range : 0));
      const duration = Math.max(100, Number(config.duration) || 300);

      await window.api.control(targets.map((s) => ({
        id: s.id,
        type: 'Shock',
        intensity,
        duration,
        exclusive: true
      })));
    } catch (error) {
      notifyDebug({
        ok: false,
        status: 'hook error',
        message: error?.message || 'failed to trigger shock'
      });
    }
  }

  async function pollLiveData() {
    if (!config.enabled) return;
    if (isPolling) {
      scheduleNextPoll();
      return;
    }

    isPolling = true;
    try {
      const res = await window.api.getLeagueLiveData();
      if (!res?.ok || !res?.data?.activePlayer?.championStats) {
        lastHealthPercent = null;
        notifyDebug({
          ok: false,
          status: 'waiting',
          message: 'League game data unavailable'
        });
        return;
      }

      const activePlayer = res.data.activePlayer;
      const currentHealth = Number(activePlayer.championStats.currentHealth) || 0;
      const maxHealth = Number(activePlayer.championStats.maxHealth) || 0;
      if (maxHealth <= 0) {
        lastHealthPercent = null;
        notifyDebug({
          ok: false,
          status: 'waiting',
          message: 'Invalid health values'
        });
        return;
      }

      const healthPercent = (currentHealth / maxHealth) * 100;
      const previous = lastHealthPercent;
      const dropPercent = previous == null ? 0 : Math.max(0, previous - healthPercent);
      const threshold = Math.max(1, Number(config.threshold) || 12);
      const cooldown = Math.max(100, Number(config.cooldownMs) || 500);
      const now = Date.now();

      let triggered = false;
      if (previous != null && dropPercent >= threshold && now - lastTriggerAt >= cooldown) {
        lastTriggerAt = now;
        triggered = true;
        await triggerShock();
      }

      lastHealthPercent = healthPercent;
      notifyDebug({
        ok: true,
        status: 'connected',
        summoner: activePlayer.summonerName || 'Unknown',
        healthPercent,
        dropPercent,
        threshold,
        triggered
      });
    } finally {
      isPolling = false;
      scheduleNextPoll();
    }
  }

  function stopPolling() {
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    isPolling = false;
    lastHealthPercent = null;
    lastTriggerAt = 0;
  }

  function startPolling() {
    stopPolling();
    scheduleNextPoll();
  }

  window.leagueOfLegends = {
    init(cfg = {}) {
      config = { ...config, ...cfg };
      if (config.enabled) startPolling();
      else stopPolling();
    },
    update(cfg = {}) {
      config = { ...config, ...cfg };
      if (config.enabled) startPolling();
      else stopPolling();
    },
    start() {
      config.enabled = true;
      startPolling();
      return true;
    },
    stop() {
      config.enabled = false;
      stopPolling();
    },
    onDebug: addDebugListener
  };
})();
