import { T, VIEW, createWorld, step, botInput } from './world.js';

// Every picture in the game is a character from the Wingdings font.
const G = { player: 'J', hurt: 'L', coin: 'l', skull: 'N', flag: 'O', tile: 'n', moon: 'Z', star: '«', twinkle: 'ª', plane: 'Q', tick: 'ü' };
const SCALE = 1.5;

rw.onReady(async () => {
  const canvas = document.querySelector('#stage'), ctx = canvas.getContext('2d');
  try { await document.fonts.load('40px Wingdings'); } catch {}
  let world = createWorld(), manual = false, held = new Set(), pressed = false, last = performance.now(), acc = 0;

  const keys = { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], jump: ['Space', 'ArrowUp', 'KeyW'] };
  const any = list => list.some(k => held.has(k));
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if ([...keys.left, ...keys.right, ...keys.jump].includes(e.code)) {
      e.preventDefault(); manual = true; held.add(e.code);
      if (keys.jump.includes(e.code)) pressed = true;
    }
  });
  window.addEventListener('keyup', e => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());

  const glyph = (ch, x, y, size, color, opts = {}) => {
    ctx.save();
    ctx.translate(x, y);
    if (opts.flip) ctx.scale(-1, 1);
    if (opts.sx || opts.sy) ctx.scale(opts.sx || 1, opts.sy || 1);
    if (opts.rot) ctx.rotate(opts.rot);
    ctx.font = `${size}px Wingdings`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = opts.alpha ?? 1;
    if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = opts.blur ?? 18; }
    ctx.fillStyle = color;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  };

  // A fixed scatter of stars so the sky looks the same every run.
  const stars = Array.from({ length: 46 }, (_, i) => ({ x: (i * 211) % 1800, y: 20 + ((i * 97) % 300), s: 10 + (i % 4) * 4, depth: 0.04 + (i % 3) * 0.04, phase: i * 1.7 }));

  function sky(cam, t) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.h);
    g.addColorStop(0, '#120d30'); g.addColorStop(0.55, '#3a1f6a'); g.addColorStop(1, '#d0587a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    for (const s of stars) {
      const x = ((s.x - cam * s.depth) % 1000 + 1000) % 1000 - 20;
      glyph(s.s > 18 ? G.twinkle : G.star, x, s.y, s.s, '#fff4d8', { alpha: 0.35 + 0.5 * Math.abs(Math.sin(t * 1.4 + s.phase)) });
    }
    glyph(G.moon, 780 - cam * 0.03, 96, 96, '#fff3d6', { glow: 'rgba(255,230,180,.7)', blur: 40 });
    glyph(G.plane, ((t * 26 - cam * 0.08) % 1300 + 1300) % 1300 - 150, 170, 26, 'rgba(255,255,255,.55)', { rot: -0.1 });
  }

  function draw() {
    const w = world, cam = Math.round(w.cam), t = w.time;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    sky(cam, t);

    for (const s of w.solids) {
      if (s.x + s.w < cam - T || s.x > cam + VIEW.w + T) continue;
      for (let c = 0; c < s.w / T; c++) {
        const x = s.x + c * T + T / 2 - cam;
        if (x < -T || x > VIEW.w + T) continue;
        for (let r = s.top; r < 11; r++) {
          const depth = r - s.top, y = r * T + T / 2;
          const color = depth === 0 ? '#7ef0c0' : depth === 1 ? '#4a5fb0' : '#2a2f6b';
          glyph(G.tile, x, y, 64, color, depth === 0 ? { glow: 'rgba(126,240,192,.55)', blur: 14 } : {});
        }
      }
    }

    for (const c of w.coins) {
      if (c.taken || c.x - cam < -30 || c.x - cam > VIEW.w + 30) continue;
      const spin = Math.cos(t * 4 + c.x * 0.05), bob = Math.sin(t * 3 + c.x * 0.03) * 3;
      glyph(G.coin, c.x - cam, c.y + bob, 34, '#ffd45e', { sx: Math.max(0.25, Math.abs(spin)), glow: 'rgba(255,200,80,.9)', blur: 16 });
    }
    for (const h of w.hazards) glyph(G.skull, h.x + h.w / 2 - cam, h.y + h.h / 2 + Math.sin(t * 5 + h.x) * 1.5, 44, '#ff5d6c', { glow: 'rgba(255,60,90,.7)', blur: 14 });
    glyph(G.flag, w.flag.x + T / 2 - cam, w.flag.y + T / 2 - 4, 62, '#ffffff', { glow: 'rgba(255,255,255,.8)', blur: 22 + Math.sin(t * 4) * 6 });

    for (const s of w.sparks) glyph(G.twinkle, s.x - cam, s.y, 14, '#ffe08a', { alpha: 1 - s.age / s.life });

    const p = w.p, px = p.x + p.w / 2 - cam, py = p.y + p.h / 2;
    if (p.hurt > 0) glyph(G.hurt, px, py, 48, '#ff6a7a', { alpha: 0.5 + 0.5 * Math.sin(t * 40), glow: 'rgba(255,60,90,.9)' });
    else {
      const stretch = Math.max(-0.18, Math.min(0.18, -p.vy / 5200));
      glyph(G.player, px, py, 48, '#ffffff', { flip: p.face < 0, sx: 1 - stretch * 0.6, sy: 1 + stretch, glow: 'rgba(160,170,255,.95)', blur: 22 });
    }

    hud(w);
  }

  function hud(w) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,34,.55)';
    ctx.beginPath(); ctx.roundRect(18, 16, 176, 44, 22); ctx.fill();
    glyph(G.coin, 44, 38, 26, '#ffd45e');
    ctx.fillStyle = '#fff'; ctx.font = '600 20px Inter, "Segoe UI", system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(`${w.score} / ${w.coins.length}`, 66, 39);

    ctx.fillStyle = 'rgba(10,8,34,.55)';
    const label = manual ? 'Arrows or WASD to move  ·  Space to jump' : 'Demo  ·  press any key to play';
    ctx.font = '500 15px Inter, "Segoe UI", system-ui, sans-serif';
    const wide = ctx.measureText(label).width + 36;
    ctx.beginPath(); ctx.roundRect(VIEW.w - wide - 18, 20, wide, 36, 18); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.textAlign = 'center';
    ctx.fillText(label, VIEW.w - wide / 2 - 18, 38);

    if (w.won) {
      const k = Math.min(1, w.won * 3);
      ctx.fillStyle = `rgba(10,8,34,${0.5 * k})`; ctx.fillRect(0, 0, VIEW.w, VIEW.h);
      glyph(G.tick, VIEW.w / 2, VIEW.h / 2 - 44, 72 * k, '#7ef0c0', { glow: 'rgba(126,240,192,.8)', blur: 30 });
      ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.font = '650 34px Inter, "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Level clear', VIEW.w / 2, VIEW.h / 2 + 18);
      ctx.font = '500 17px Inter, "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = `rgba(255,255,255,${0.75 * k})`;
      ctx.fillText(`${w.score} of ${w.coins.length} coins`, VIEW.w / 2, VIEW.h / 2 + 52);
    }
    ctx.restore();
  }

  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    const dt = 1 / 120;
    while (acc >= dt) {
      const input = manual ? { left: any(keys.left), right: any(keys.right), jump: any(keys.jump), jumpPressed: pressed } : botInput(world);
      pressed = false;
      step(world, input, dt);
      acc -= dt;
    }
    if (world.won > 2.6) world = createWorld();
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
