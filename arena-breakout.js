// all arena breakout vision logic lives in this single file
// coordinates are based on 1080p full-screen capture of the game
// when damage is detected at one of the limb points the matching shockers
// will fire via the existing window.api.control API.

(function() {
  const limbCenters = {
    head: { x: 70, y: 820 },
    thorax: { x: 70, y: 850 },
    stomach: { x: 70, y: 885 },
    leftArm: { x: 40, y: 865 },
    rightArm: { x: 100, y: 865 },
    leftLeg: { x: 55, y: 935 },
    rightLeg: { x: 85, y: 935 }
  };

  // running configuration, will be merged with cfg coming from the UI
  let config = {
    enabled: false,
    threshold: 50,    // sensitivity (0-255): higher = detects smaller hits
    interval: 100,    // ms between samples
    minIntensity: 1,  // min shock strength
    maxIntensity: 100, // max shock strength
    duration: 300,     // default shock duration
    focusArea: { x: 0, y: 0, width: 1920, height: 1080 }
  };

  // debug listeners receive (sampleMap, canvas) when a frame is analyzed
  let debugListeners = [];
  function addDebugListener(fn) { debugListeners.push(fn); }

  let videoEl = null;
  let canvas = null;
  let ctx = null;
  let previousSamples = {};
  let lastTriggerAt = {};
  let loopTimer = null;

  function rgbToHsv(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
      if (max === rn) h = ((gn - bn) / delta) % 6;
      else if (max === gn) h = (bn - rn) / delta + 2;
      else h = (rn - gn) / delta + 4;
      h *= 60;
      if (h < 0) h += 360;
    }

    const s = max === 0 ? 0 : (delta / max) * 100;
    const v = max * 100;
    return { h, s, v };
  }

  function inRange(value, min, max) {
    return value >= min && value <= max;
  }

  function sensitivityScale() {
    const raw = Math.max(0, Math.min(255, Number(config.threshold) || 0));
    return raw / 255;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isRed(hsv, rgb, sensitivity) {
    const huePad = 2 + (16 * sensitivity);
    const satPad = 5 + (30 * sensitivity);
    const valPad = 5 + (25 * sensitivity);

    const hueOk = inRange(hsv.h, 0, 10 + huePad) || inRange(hsv.h, 360 - (10 + huePad), 360);
    const hsvOk =
      hueOk &&
      inRange(hsv.s, clamp(70 - satPad, 30, 100), 100) &&
      inRange(hsv.v, clamp(60 - valPad, 30, 100), 100);

    const rgbOk =
      inRange(rgb.r, clamp(180 - (55 * sensitivity), 100, 255), 255) &&
      inRange(rgb.g, 0, clamp(80 + (90 * sensitivity), 80, 220)) &&
      inRange(rgb.b, 0, clamp(80 + (90 * sensitivity), 80, 220));

    return hsvOk || rgbOk;
  }

  function isOrange(hsv, rgb, sensitivity) {
    const huePad = 2 + (14 * sensitivity);
    const satPad = 5 + (30 * sensitivity);
    const valPad = 5 + (20 * sensitivity);

    const hsvOk =
      inRange(hsv.h, clamp(15 - huePad, 0, 360), clamp(35 + huePad, 0, 360)) &&
      inRange(hsv.s, clamp(60 - satPad, 20, 100), 100) &&
      inRange(hsv.v, clamp(70 - valPad, 35, 100), 100);

    const rgbOk =
      inRange(rgb.r, clamp(180 - (60 * sensitivity), 90, 255), 255) &&
      inRange(rgb.g, clamp(90 - (60 * sensitivity), 20, 255), clamp(160 + (70 * sensitivity), 160, 255)) &&
      inRange(rgb.b, 0, clamp(60 + (70 * sensitivity), 60, 200));

    return hsvOk || rgbOk;
  }

  function isGreen(hsv, rgb, sensitivity) {
    const huePad = 2 + (10 * sensitivity);
    const satPad = 5 + (20 * sensitivity);
    const valPad = 5 + (15 * sensitivity);

    const hsvOk =
      inRange(hsv.h, clamp(85 - huePad, 0, 360), clamp(140 + huePad, 0, 360)) &&
      inRange(hsv.s, clamp(40 - satPad, 10, 100), 100) &&
      inRange(hsv.v, clamp(60 - valPad, 25, 100), 100);

    const rgbOk =
      inRange(rgb.r, 0, clamp(120 + (50 * sensitivity), 120, 200)) &&
      inRange(rgb.g, clamp(160 - (40 * sensitivity), 100, 255), 255) &&
      inRange(rgb.b, 0, clamp(120 + (50 * sensitivity), 120, 200));

    return hsvOk || rgbOk;
  }

  function classifySample(rgb, hsv) {
    const sensitivity = sensitivityScale();
    if (isGreen(hsv, rgb, sensitivity)) return 'healing';
    if (isRed(hsv, rgb, sensitivity) || isOrange(hsv, rgb, sensitivity)) return 'damage';
    return 'neutral';
  }

  // helper to obtain a stream via Electron APIs when getDisplayMedia fails
  function getElectronStream() {
    return new Promise((resolve, reject) => {
      const tryGeneric = async () => {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            const s = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  minWidth: 1920,
                  minHeight: 1080
                }
              }
            });
            return resolve(s);
          } catch (e) {
            // fall through to next option
          }
        }
        reject(new Error('no fallback capture available'));
      };

      if (!window.require) {
        // no electron APIs, try generic and then fail
        return tryGeneric();
      }

      try {
        const { desktopCapturer } = window.require('electron');
        desktopCapturer.getSources({ types: ['screen', 'window'] })
          .then(async sources => {
            if (!sources || !sources.length) {
              return tryGeneric();
            }
            const source = sources[0];
            console.log('arena-breakout: using desktopCapturer source', source.id, source.name);
            try {
              const s = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: source.id,
                    minWidth: 1920,
                    minHeight: 1080
                  }
                }
              });
              resolve(s);
            } catch (e) {
              // try generic after failure
              tryGeneric();
            }
          })
          .catch(() => tryGeneric());
      } catch (err) {
        // require or electron not available
        tryGeneric();
      }
    });
  }

  async function startCapture() {
    if (videoEl) return; // already running
    console.log('arena-breakout: starting capture');

    try {
      let stream;
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        } catch (e) {
          console.warn('getDisplayMedia failed, trying Electron fallback', e);
          stream = await getElectronStream();
        }
      } else {
        stream = await getElectronStream();
      }
      if (!stream) {
        throw new Error('no stream obtained');
      }

      videoEl = document.createElement('video');
      videoEl.srcObject = stream;
      videoEl.muted = true;
      videoEl.play();

      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d');

      // return a promise that resolves once the video is playing
      const ready = new Promise((resolve) => {
        videoEl.onloadedmetadata = () => {
          canvas.width = videoEl.videoWidth || 1920;
          canvas.height = videoEl.videoHeight || 1080;
          if (!config.focusArea || !config.focusArea.width || !config.focusArea.height) {
            config.focusArea = { x: 0, y: 0, width: canvas.width, height: canvas.height };
          }
          captureLoop();
          resolve();
        };
      });

      // stop tracks when user disables
      stream.getTracks().forEach(t => t.onended = stopCapture);

      return ready;
    } catch (err) {
      console.error('arena-breakout capture failed', err);
      throw err;
    }
  }

  function stopCapture() {
    console.log('arena-breakout: stopping capture');
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }

    if (videoEl && videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach(t => t.stop());
    }
    videoEl = null;
    canvas = null;
    ctx = null;
    previousSamples = {};
    lastTriggerAt = {};
  }

  function captureLoop() {
    if (!videoEl || videoEl.paused || videoEl.ended) {
      return;
    }

    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    analyzeFrame();

    loopTimer = setTimeout(captureLoop, config.interval);
  }

  function analyzeFrame() {
    const sampleMap = {};
    const changedLimbs = [];
    const damageCandidates = [];

    const focus = config.focusArea || { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const focusX = Math.max(0, Math.min(canvas.width - 1, Number(focus.x) || 0));
    const focusY = Math.max(0, Math.min(canvas.height - 1, Number(focus.y) || 0));
    const focusW = Math.max(1, Math.min(canvas.width - focusX, Number(focus.width) || canvas.width));
    const focusH = Math.max(1, Math.min(canvas.height - focusY, Number(focus.height) || canvas.height));

    Object.entries(limbCenters).forEach(([limb, defaultPos]) => {
      // allow overrides from config
      const cfg = config.limbConfigs?.[limb];
      const relX = cfg?.x ?? defaultPos.x;
      const relY = cfg?.y ?? defaultPos.y;
      const size = Math.max(1, cfg?.size ?? 1);
      const x = Math.max(0, Math.min(canvas.width - 1, Math.round(focusX + relX)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(focusY + relY)));

      // sample a region (size x size) and average
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const sx = Math.min(canvas.width - 1, x + dx);
          const sy = Math.min(canvas.height - 1, y + dy);
          if (sx < focusX || sy < focusY || sx > focusX + focusW - 1 || sy > focusY + focusH - 1) {
            continue;
          }
          const data = ctx.getImageData(sx, sy, 1, 1).data;
          r += data[0];
          g += data[1];
          b += data[2];
          count++;
        }
      }
      const rgb = {
        r: count > 0 ? Math.round(r / count) : 0,
        g: count > 0 ? Math.round(g / count) : 0,
        b: count > 0 ? Math.round(b / count) : 0
      };
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      const state = classifySample(rgb, hsv);

      const prev = previousSamples[limb];
      const changed = !!prev && prev.state !== state;
      if (changed) changedLimbs.push(limb);

      sampleMap[limb] = {
        ...rgb,
        h: hsv.h,
        s: hsv.s,
        v: hsv.v,
        state
      };

      if (state === 'damage' && (!prev || prev.state !== 'damage')) {
        damageCandidates.push(limb);
      }

      previousSamples[limb] = { state, ...rgb };
    });

    const allChangedTogether = changedLimbs.length >= Object.keys(limbCenters).length;
    if (!allChangedTogether) {
      damageCandidates.forEach(limb => {
        const now = Date.now();
        const last = lastTriggerAt[limb] || 0;
        if (now - last >= Math.max(120, config.duration || 300)) {
          lastTriggerAt[limb] = now;
          handleDamage(limb);
        }
      });
    }

    // notify debug listeners
    debugListeners.forEach(fn => {
      try { fn(sampleMap, canvas); } catch (e) { console.error(e); }
    });
  }

  function handleDamage(limb) {
    console.log('damage detected on', limb);
    triggerShock(limb);
  }

  async function triggerShock(limb) {
    try {
      const shockers = await window.api.getShockers();
      if (!shockers || !shockers.length) return;

      // determine which shockers should fire based on limb map
      let targets = shockers;
      if (
        config.limbMap &&
        Array.isArray(config.limbMap[limb]) &&
        config.limbMap[limb].length > 0
      ) {
        targets = shockers.filter(s =>
          config.limbMap[limb].includes(s.id)
        );
      }

      // compute random intensity between min and max
      const range = config.maxIntensity - config.minIntensity;
      const intensity = range > 0
        ? config.minIntensity + Math.random() * range
        : config.minIntensity;

      const shocks = targets.map(s => ({
        id: s.id,
        type: 'Shock',
        intensity: Math.round(intensity),
        duration: config.duration,
        exclusive: true
      }));

      await window.api.control(shocks);
    } catch (err) {
      console.error('failed to send shock', err);
    }
  }

  // public API
  window.arenaBreakout = {
    init(cfg = {}) {
      config = { ...config, ...cfg };
      if (config.enabled) {
        startCapture();
      } else {
        stopCapture();
      }
    },
    update(cfg = {}) {
      config = { ...config, ...cfg };
      if (config.enabled) {
        startCapture();
      } else {
        stopCapture();
      }
    },
    async start() {
      config.enabled = true;
      try {
        await startCapture();
        return true;
      } catch (e) {
        console.error('arena-breakout start error', e);
        throw e;
      }
    },
    stop() {
      config.enabled = false;
      stopCapture();
    },
    snapshot() {
      if (canvas) {
        const data = canvas.toDataURL();
        window.open(data);
      } else {
        throw new Error('no capture available');
      }
    },
    onDebug: addDebugListener
  };
})();