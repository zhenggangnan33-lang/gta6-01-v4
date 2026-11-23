// People for VERDE BAY: Dante on foot, and the pedestrians who share the
// sidewalks and run from speeding cars. On-foot movement is simple and
// direct; the driving lives in vehicles.js.

import { WORLD_W, WORLD_H } from './world.js';

// Try to move the walker by (dx, dy), sliding along building walls.
export function walkMove(G, person, dx, dy) {
  const r = 12;
  let nx = person.x + dx;
  let ny = person.y + dy;
  for (const s of G.city.solids) {
    if (nx + r > s.x && nx - r < s.x + s.w && ny + r > s.y && ny - r < s.y + s.h) {
      // Push out along the smaller penetration axis.
      const pushL = nx + r - s.x;
      const pushR = s.x + s.w - (nx - r);
      const pushT = ny + r - s.y;
      const pushB = s.y + s.h - (ny - r);
      const m = Math.min(pushL, pushR, pushT, pushB);
      if (m === pushL) nx = s.x - r;
      else if (m === pushR) nx = s.x + s.w + r;
      else if (m === pushT) ny = s.y - r;
      else ny = s.y + s.h + r;
    }
  }
  person.x = Math.max(12, Math.min(WORLD_W - 12, nx));
  person.y = Math.max(12, Math.min(WORLD_H - 12, ny));
}

export function spawnPeds(G) {
  const rng = G.rng;
  const colors = ['#e86a4e', '#4ea8de', '#f2c14e', '#8a6ac2', '#5ac28a', '#e8e8e8'];
  for (let i = 0; i < 26; i++) {
    const x = rng.range(120, WORLD_W - 120);
    const y = rng.range(120, WORLD_H - 120);
    G.peds.push({
      x, y,
      tx: x, ty: y, // current stroll target
      wait: rng.range(0, 3),
      speed: rng.range(28, 55),
      color: colors[i % colors.length],
      fleeing: false,
    });
  }
}

export function updatePeds(G, dt) {
  const player = G.player;
  for (const ped of G.peds) {
    // Flee from a fast car nearby (the player's or traffic's).
    let threat = null;
    let threatD = 130;
    const cars = G.player.inCar && G.player.car ? [G.player.car, ...G.traffic] : G.traffic;
    for (const car of cars) {
      if (Math.abs(car.v) < 90) continue;
      const d = Math.hypot(car.x - ped.x, car.y - ped.y);
      if (d < threatD) {
        threatD = d;
        threat = car;
      }
    }
    if (threat) {
      ped.fleeing = true;
      const dx = ped.x - threat.x;
      const dy = ped.y - threat.y;
      const len = Math.hypot(dx, dy) || 1;
      walkMove(G, ped, (dx / len) * 90 * dt, (dy / len) * 90 * dt);
      continue;
    }
    ped.fleeing = false;
    const dx = ped.tx - ped.x;
    const dy = ped.ty - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12 || ped.wait > 0) {
      ped.wait -= dt;
      if (ped.wait <= 0) {
        ped.tx = Math.max(60, Math.min(WORLD_W - 60, ped.x + G.rng.range(-260, 260)));
        ped.ty = Math.max(60, Math.min(WORLD_H - 60, ped.y + G.rng.range(-260, 260)));
        ped.wait = G.rng.range(1, 5);
      }
      continue;
    }
    walkMove(G, ped, (dx / dist) * ped.speed * dt, (dy / dist) * ped.speed * dt);
  }
}

// The player on foot: WASD/arrows move, Shift sprints, F punches.
export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  const k = G.keys;
  let mx = 0;
  let my = 0;
  if (k['KeyA'] || k['ArrowLeft']) mx -= 1;
  if (k['KeyD'] || k['ArrowRight']) mx += 1;
  if (k['KeyW'] || k['ArrowUp']) my -= 1;
  if (k['KeyS'] || k['ArrowDown']) my += 1;
  if (mx === 0 && my === 0) return;
  const len = Math.hypot(mx, my);
  const speed = (k['ShiftLeft'] || k['ShiftRight']) ? 260 : 150;
  walkMove(G, p, (mx / len) * speed * dt, (my / len) * speed * dt);
  p.face = Math.atan2(my, mx);
}

// Punch: the nearest pedestrian within range gets knocked down and the
// player earns a wanted star. Returns true when a punch landed.
export function playerPunch(G) {
  const p = G.player;
  let best = null;
  let bestD = 46;
  for (const ped of G.peds) {
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = ped;
    }
  }
  if (!best) return false;
  const dx = best.x - p.x;
  const dy = best.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  best.x += (dx / len) * 90;
  best.y += (dy / len) * 90;
  best.wait = 2.5;
  G.addHeat(1);
  if (G.sound) G.sound.thud();
  return true;
}
