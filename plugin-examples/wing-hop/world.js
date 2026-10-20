// Game rules for Wing Hop, kept free of the page so they can be tested on their own.
export const T = 48;
export const VIEW = { w: 960, h: 540 };
const SPEED = 300, GRAVITY = 2600, JUMP = -860, MAX_FALL = 1300;

function buildLevel() {
  const solids = [], hazards = [], coins = [];
  const ground = (from, to, top) => solids.push({ x: from * T, y: top * T, w: (to - from) * T, h: (11 - top) * T, top });
  const skull = col => hazards.push({ x: col * T + 6, y: 8 * T - 38, w: 36, h: 36 });
  const arc = (col, row, n) => { for (let i = 0; i < n; i++) coins.push({ x: (col + i) * T + T / 2, y: (row - Math.sin((i / (n - 1)) * Math.PI) * 1.4) * T, taken: false }); };
  const line = (col, row, n) => { for (let i = 0; i < n; i++) coins.push({ x: (col + i) * T + T / 2, y: row * T + T / 2, taken: false }); };

  ground(0, 14, 8); line(5, 6, 4);
  ground(17, 28, 8); arc(14, 6, 4); skull(22); arc(20, 6, 5); line(25, 7, 2);
  ground(28, 32, 7); line(28, 5, 3);
  ground(32, 36, 6); line(33, 4, 3);
  ground(36, 40, 7);
  ground(40, 44, 8); line(40, 6, 3);
  ground(46, 50, 8); arc(44, 6, 4);
  ground(52, 68, 8); arc(49, 6, 4); skull(57); arc(55, 6, 5); skull(63); arc(61, 6, 5);
  ground(71, 84, 8); arc(68, 6, 4); line(73, 6, 4); line(78, 5, 3);
  const flag = { x: 82 * T, y: 8 * T - T, w: T, h: T };
  return { solids, hazards, coins, flag, width: 84 * T };
}

export function createWorld() {
  const level = buildLevel();
  return {
    ...level,
    p: { x: 2 * T, y: 8 * T - 40, w: 30, h: 40, vx: 0, vy: 0, onGround: false, face: 1, coyote: 0, buffer: 0, hurt: 0 },
    score: 0, deaths: 0, won: 0, time: 0, cam: 0, sparks: []
  };
}

const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function spark(w, x, y, n, power) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random()) * power; w.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.6 + Math.random() * 0.4, age: 0 }); }
}

function respawn(w) {
  Object.assign(w.p, { x: 2 * T, y: 8 * T - 40, vx: 0, vy: 0, hurt: 0, onGround: false });
  w.cam = 0;
}

export function step(w, input, dt) {
  w.time += dt;
  for (const s of w.sparks) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 500 * dt; }
  w.sparks = w.sparks.filter(s => s.age < s.life);
  const p = w.p;
  if (w.won) { w.won += dt; return; }
  if (p.hurt > 0) { p.hurt -= dt; if (p.hurt <= 0) respawn(w); return; }

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) p.face = dir;
  p.vx += (dir * SPEED - p.vx) * Math.min(1, 14 * dt);
  p.coyote = p.onGround ? 0.09 : p.coyote - dt;
  p.buffer = input.jumpPressed ? 0.11 : p.buffer - dt;
  if (p.buffer > 0 && p.coyote > 0) { p.vy = JUMP; p.coyote = 0; p.buffer = 0; p.onGround = false; spark(w, p.x + p.w / 2, p.y + p.h, 6, 90); }
  if (!input.jump && p.vy < -320) p.vy *= 0.6;
  p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);

  p.x += p.vx * dt;
  for (const s of w.solids) if (hit(p, s)) { if (p.vx > 0) p.x = s.x - p.w; else if (p.vx < 0) p.x = s.x + s.w; p.vx = 0; }
  if (p.x < 0) { p.x = 0; p.vx = 0; }
  const wasAir = !p.onGround;
  p.y += p.vy * dt;
  p.onGround = false;
  for (const s of w.solids) if (hit(p, s)) {
    if (p.vy > 0) { p.y = s.y - p.h; p.onGround = true; if (wasAir && p.vy > 500) spark(w, p.x + p.w / 2, p.y + p.h, 5, 70); } else p.y = s.y + s.h;
    p.vy = 0;
  }

  for (const c of w.coins) if (!c.taken && Math.hypot(c.x - (p.x + p.w / 2), c.y - (p.y + p.h / 2)) < 30) { c.taken = true; w.score++; spark(w, c.x, c.y, 9, 140); }
  const body = { x: p.x + 5, y: p.y + 6, w: p.w - 10, h: p.h - 10 };
  if (p.y > 12 * T || w.hazards.some(h => hit(body, h))) { w.deaths++; p.hurt = 0.7; spark(w, p.x + p.w / 2, p.y + p.h / 2, 16, 200); return; }
  if (hit(p, w.flag)) { w.won = 0.001; spark(w, w.flag.x + T / 2, w.flag.y, 26, 220); }

  const target = Math.max(0, Math.min(w.width - VIEW.w, p.x - VIEW.w * 0.38));
  w.cam += (target - w.cam) * Math.min(1, 6 * dt);
}

// A small autopilot so the level plays itself until someone takes over.
export function botInput(w) {
  const p = w.p, front = p.x + p.w;
  const out = { right: true, left: false, jump: false, jumpPressed: false };
  if (!p.onGround) { out.jump = true; return out; }
  const below = x => w.solids.some(s => x >= s.x && x <= s.x + s.w && s.y >= p.y + p.h - 2);
  const gap = !below(front + 12);
  const wall = w.solids.some(s => hit({ x: front + 4, y: p.y + 4, w: 6, h: p.h - 10 }, s));
  const danger = w.hazards.some(h => h.x - front > 0 && h.x - front < 76);
  if (gap || wall || danger) { out.jump = true; out.jumpPressed = true; }
  return out;
}
