(() => {
  const canvas = document.getElementById('field');
  const ctx = canvas.getContext('2d');
  const bootLog = document.getElementById('bootLog');
  const progressBar = document.getElementById('progressBar');
  const brandWrap = document.getElementById('brandWrap');

  const lines = [
    'render init',
    'provider sync',
    'runtime load',
    'ready'
  ];

  let width = 0;
  let height = 0;
  let particles = [];
  let sparks = [];
  let lightning = [];

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedParticles() {
    particles = Array.from({ length: 80 }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      r: Math.random() * 1.8 + 0.4,
      a: Math.random() * 0.45 + 0.2
    }));
  }

  function spawnSparkAt(x, y, spread = 28, count = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 2.2;
      sparks.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread * 0.65,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 16 + Math.random() * 24
      });
    }
  }

  function spawnAmbientSpark() {
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    spawnSparkAt(
      centerX + (Math.random() - 0.5) * 160,
      centerY + (Math.random() - 0.5) * 90,
      10,
      1
    );
  }

  function midpointDisplace(start, end, detail = 5, displacement = 52) {
    let points = [start, end];
    let roughness = displacement;

    for (let pass = 0; pass < detail; pass++) {
      const next = [points[0]];
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / len;
        const ny = dx / len;

        const mid = {
          x: (a.x + b.x) * 0.5 + nx * (Math.random() - 0.5) * roughness,
          y: (a.y + b.y) * 0.5 + ny * (Math.random() - 0.5) * roughness
        };

        next.push(mid, b);
      }

      points = next;
      roughness *= 0.58;
    }

    return points;
  }

  function drawBoltPath(points, alpha, widthPx, color) {
    if (!points || points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      ctx.lineTo(p.x + (Math.random() - 0.5) * 1.4, p.y + (Math.random() - 0.5) * 1.4);
    }
    ctx.lineWidth = widthPx;
    ctx.strokeStyle = color.replace('{a}', String(alpha));
    ctx.stroke();
  }

  function spawnLightning() {
    const target = {
      x: width * 0.5 + (Math.random() - 0.5) * 180,
      y: height * 0.48 + (Math.random() - 0.5) * 60
    };

    const source = {
      x: target.x + (Math.random() - 0.5) * 260,
      y: 40 + Math.random() * Math.max(60, height * 0.18)
    };

    const main = midpointDisplace(source, target, 5, 62 + Math.random() * 16);
    const branches = [];
    const branchCount = 1 + Math.floor(Math.random() * 3);

    for (let i = 0; i < branchCount; i++) {
      const idx = Math.floor(main.length * (0.25 + Math.random() * 0.55));
      const branchStart = main[idx];
      const branchEnd = {
        x: branchStart.x + (Math.random() - 0.5) * 180,
        y: branchStart.y + 30 + Math.random() * 140
      };
      branches.push(midpointDisplace(branchStart, branchEnd, 3, 30 + Math.random() * 10));
    }

    lightning.push({
      main,
      branches,
      life: 7 + Math.floor(Math.random() * 4),
      maxLife: 10,
      flash: 0.28 + Math.random() * 0.16
    });

    spawnSparkAt(target.x, target.y, 42, 6 + Math.floor(Math.random() * 5));
  }

  function drawField() {
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.45, 20, width * 0.5, height * 0.45, Math.max(width, height));
    gradient.addColorStop(0, 'rgba(42, 96, 191, 0.20)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -20) p.x = width + 20;
      if (p.x > width + 20) p.x = -20;
      if (p.y < -20) p.y = height + 20;
      if (p.y > height + 20) p.y = -20;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(117, 175, 255, ${p.a})`;
      ctx.fill();
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vx *= 0.982;
      s.vy *= 0.982;
      s.vy += 0.008;
      s.life -= 1;

      const alpha = Math.max(0, s.life / 40);
      ctx.fillStyle = `rgba(255, 224, 135, ${alpha})`;
      ctx.fillRect(s.x, s.y, 2, 2);

      if (s.life <= 0) sparks.splice(i, 1);
    }

    let flashStrength = 0;
    ctx.globalCompositeOperation = 'lighter';

    for (let i = lightning.length - 1; i >= 0; i--) {
      const bolt = lightning[i];
      bolt.life -= 1;

      const intensity = Math.max(0, bolt.life / bolt.maxLife) * (0.72 + Math.random() * 0.28);
      flashStrength = Math.max(flashStrength, bolt.flash * intensity);

      ctx.shadowColor = 'rgba(135, 190, 255, 0.9)';
      ctx.shadowBlur = 16;
      drawBoltPath(bolt.main, intensity * 0.45, 5.2, 'rgba(125,180,255,{a})');

      ctx.shadowBlur = 8;
      drawBoltPath(bolt.main, intensity * 0.8, 2.1, 'rgba(180,220,255,{a})');

      ctx.shadowBlur = 3;
      drawBoltPath(bolt.main, intensity, 1.0, 'rgba(255,255,255,{a})');

      for (const branch of bolt.branches) {
        ctx.shadowBlur = 7;
        drawBoltPath(branch, intensity * 0.38, 1.6, 'rgba(150,205,255,{a})');
        ctx.shadowBlur = 2;
        drawBoltPath(branch, intensity * 0.75, 0.8, 'rgba(245,252,255,{a})');
      }

      if (bolt.life <= 0) lightning.splice(i, 1);
    }

    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';

    if (flashStrength > 0) {
      ctx.fillStyle = `rgba(140, 196, 255, ${Math.min(0.18, flashStrength * 0.35)})`;
      ctx.fillRect(0, 0, width, height);
    }

    requestAnimationFrame(drawField);
  }

  function typeLine(text, done) {
    const row = document.createElement('div');
    row.className = 'boot-line';
    bootLog.appendChild(row);

    let i = 0;
    const tick = () => {
      row.textContent = text.slice(0, i++);
      if (i <= text.length) {
        setTimeout(tick, 12 + Math.random() * 10);
      } else {
        done?.();
      }
    };
    tick();
  }

  function runBoot(index = 0) {
    if (index >= lines.length) {
      progressBar.style.width = '100%';
      return;
    }

    typeLine(lines[index], () => {
      progressBar.style.width = `${Math.round(((index + 1) / lines.length) * 100)}%`;
      setTimeout(() => runBoot(index + 1), 200);
    });
  }

  function pulseGlitch() {
    brandWrap.classList.add('glitch');
    setTimeout(() => brandWrap.classList.remove('glitch'), 150);
  }

  resize();
  seedParticles();
  drawField();

  window.addEventListener('resize', () => {
    resize();
    seedParticles();
  });

  setTimeout(() => {
    progressBar.style.width = '7%';
    runBoot();
  }, 160);

  const glitchTimer = setInterval(pulseGlitch, 900);
  setTimeout(() => clearInterval(glitchTimer), 3000);

  const sparkTimer = setInterval(() => {
    for (let i = 0; i < 2; i++) spawnAmbientSpark();
  }, 65);

  const lightningTimer = setInterval(() => {
    if (Math.random() < 0.72) spawnLightning();
  }, 180);

  setTimeout(() => {
    clearInterval(sparkTimer);
    clearInterval(lightningTimer);
  }, 2800);
})();
