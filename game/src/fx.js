// Particles for VERDE BAY: exhaust puffs, crash sparks, damage smoke, skid
// marks left on the road, and floating cash text. A fixed-size pool so the
// frame cost stays flat no matter how wild a chase gets.

export function createFx() {
  return {
    parts: [],
    skids: [],
    floats: [],
  };
}

export function spawnExhaust(fx, x, y, angle) {
  if (fx.parts.length > 400) return;
  const bx = x - Math.cos(angle) * 18;
  const by = y - Math.sin(angle) * 18;
  fx.parts.push({
    x: bx, y: by,
    vx: -Math.cos(angle) * 30 + (Math.random() - 0.5) * 20,
    vy: -Math.sin(angle) * 30 + (Math.random() - 0.5) * 20,
    life: 0.5, max: 0.5, size: 5, color: '200,200,200', kind: 'puff',
  });
}

export function spawnSparks(fx, x, y, n) {
  for (let i = 0; i < (n || 8); i++) {
    if (fx.parts.length > 400) return;
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 160;
    fx.parts.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.4, max: 0.4, size: 2.5, color: '255,200,60', kind: 'spark',
    });
  }
}

export function spawnSmoke(fx, x, y) {
  if (fx.parts.length > 400) return;
  fx.parts.push({
    x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10,
    vx: (Math.random() - 0.5) * 12, vy: -18 - Math.random() * 14,
    life: 1.1, max: 1.1, size: 9, color: '90,90,90', kind: 'puff',
  });
}

export function addSkid(fx, x, y, angle) {
  fx.skids.push({ x, y, angle, life: 6 });
  if (fx.skids.length > 300) fx.skids.shift();
}

export function addFloat(fx, x, y, text, color) {
  fx.floats.push({ x, y, text, color: color || '#ffd94e', life: 1.4 });
  if (fx.floats.length > 24) fx.floats.shift();
}

export function updateFx(fx, dt) {
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const p = fx.parts[i];
    p.life -= dt;
    if (p.life <= 0) {
      fx.parts.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
  }
  for (let i = fx.skids.length - 1; i >= 0; i--) {
    fx.skids[i].life -= dt;
    if (fx.skids[i].life <= 0) fx.skids.splice(i, 1);
  }
  for (let i = fx.floats.length - 1; i >= 0; i--) {
    const f = fx.floats[i];
    f.life -= dt;
    f.y -= 26 * dt;
    if (f.life <= 0) fx.floats.splice(i, 1);
  }
}
