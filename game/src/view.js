// The view for VERDE BAY: camera, canvas rendering, day/dusk/night light,
// neon signs, the HUD, the minimap, and the title / pause / shop / end
// screens. It only reads the game state and draws it; it never changes it.

import { WORLD_W, WORLD_H, AVENUES, STREETS, COAST_X, ROAD_HALF } from './world.js';
import { MISSIONS, currentObjective } from './story.js';

// How dark the world is at a given hour (0 = noon bright, 0.55 = midnight).
export function darknessAt(hour) {
  if (hour >= 7 && hour < 17) return 0;
  if (hour >= 17 && hour < 19) return ((hour - 17) / 2) * 0.35;
  if (hour >= 19 || hour < 5) return 0.55;
  if (hour >= 5 && hour < 7) return 0.55 * (1 - (hour - 5) / 2);
  return 0;
}

function clockText(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function drawCarShape(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.a);
  const w = car.w;
  const h = car.h;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();
  // Cabin.
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  roundRect(ctx, -w / 6, -h / 2 + 3, w / 3, h - 6, 4);
  ctx.fill();
  // Headlights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(w / 2 - 3, -h / 2 + 2, 3, 5);
  ctx.fillRect(w / 2 - 3, h / 2 - 7, 3, 5);
  // Police light bar.
  if (car.kind === 'police') {
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-4, -h / 2 + 1, 8, 4);
    ctx.fillStyle = '#3b82ff';
    ctx.fillRect(-4, h / 2 - 5, 8, 4);
  }
  // Truck cargo box.
  if (car.kind === 'truck') {
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(-w / 2 + 4, -h / 2 + 3, w / 2 - 6, h - 6);
    ctx.fillStyle = '#3a5a3a';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ARMORED', -w / 4 + 2, 3);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPed(ctx, ped, dark) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(0, -2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function render(G, ctx, W, H) {
  const p = G.player;
  // Camera follows the player, clamped to the world.
  const cam = G.camera;
  cam.x += (p.x - W / 2 - cam.x) * 0.12;
  cam.y += (p.y - H / 2 - cam.y) * 0.12;
  cam.x = Math.max(0, Math.min(WORLD_W - W, cam.x));
  cam.y = Math.max(0, Math.min(WORLD_H - H, cam.y));

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawWorld(G, ctx, cam, W, H);
  ctx.restore();

  const dark = darknessAt(G.time);
  if (dark > 0) {
    ctx.fillStyle = `rgba(8,14,44,${dark})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawHud(G, ctx, W, H);
  if (G.screen === 'title') drawTitle(G, ctx, W, H);
  if (G.screen === 'shop') drawShop(G, ctx, W, H);
  if (G.screen === 'paused') drawPaused(ctx, W, H);
  if (G.won) drawEnd(G, ctx, W, H, true);
  if (G.busted) drawEnd(G, ctx, W, H, false, 'BUSTED');
  if (G.wasted) drawEnd(G, ctx, W, H, false, 'WASTED');
}

function drawWorld(G, ctx, cam, W, H) {
  const city = G.city;
  const vx0 = cam.x - 60;
  const vy0 = cam.y - 60;
  const vx1 = cam.x + W + 60;
  const vy1 = cam.y + H + 60;
  const inView = (x, y, w, h) => x + w > vx0 && x < vx1 && y + h > vy0 && y < vy1;

  // Grass.
  ctx.fillStyle = '#6f9e57';
  ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);

  // Beach sand and water on the east edge.
  ctx.fillStyle = '#e6d49a';
  ctx.fillRect(COAST_X, 0, WORLD_W - COAST_X, WORLD_H);
  ctx.fillStyle = '#2a6a9a';
  ctx.fillRect(2480, 0, WORLD_W - 2480, WORLD_H);
  ctx.fillStyle = '#3a7ab0';
  for (let y = 40; y < WORLD_H; y += 120) {
    ctx.fillRect(2496, y, 44, 4);
  }

  // Roads.
  ctx.fillStyle = '#3a3f4a';
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_HALF, WORLD_W, ROAD_HALF * 2);
  ctx.fillRect(COAST_X - ROAD_HALF, 0, ROAD_HALF * 2, 1700);
  // Centre dashes.
  ctx.fillStyle = '#e8c84a';
  for (const ax of AVENUES) {
    for (let y = 0; y < WORLD_H; y += 64) ctx.fillRect(ax - 2, y, 4, 30);
  }
  for (const sy of STREETS) {
    for (let x = 0; x < WORLD_W; x += 64) ctx.fillRect(x, sy - 2, 30, 4);
  }

  // Parks and lots.
  for (const park of city.parks) {
    if (!inView(park.x, park.y, park.w, park.h)) continue;
    ctx.fillStyle = '#5a8a48';
    ctx.fillRect(park.x, park.y, park.w, park.h);
  }
  for (const lot of city.lots) {
    if (!inView(lot.x, lot.y, lot.w, lot.h)) continue;
    ctx.fillStyle = '#8a8f96';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let x = lot.x + 20; x < lot.x + lot.w - 10; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, lot.y + 8);
      ctx.lineTo(x, lot.y + lot.h - 8);
      ctx.stroke();
    }
  }
  // Trees.
  for (const t of city.trees) {
    if (!inView(t.x - 20, t.y - 20, 40, 40)) continue;
    ctx.fillStyle = '#3f7a3a';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Buildings (culled).
  for (const b of city.buildings) {
    if (!inView(b.x, b.y, b.w, b.h)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    if (b.tall) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(b.x + 8, b.y + 8, 10, 10);
      ctx.fillRect(b.x + b.w - 18, b.y + 8, 10, 10);
    }
  }

  // Beach props.
  for (const prop of city.beachProps) {
    if (!inView(prop.x - 20, prop.y - 20, 40, 40)) continue;
    if (prop.kind === 'umbrella') {
      ctx.fillStyle = prop.color;
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, 14, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#7a5a3a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(prop.x, prop.y);
      ctx.lineTo(prop.x, prop.y + 12);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#6a4a2a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(prop.x, prop.y + 10);
      ctx.lineTo(prop.x, prop.y - 12);
      ctx.stroke();
      ctx.fillStyle = '#3f8a4a';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y - 16, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Skid marks.
  ctx.fillStyle = 'rgba(20,20,20,0.5)';
  for (const s of G.fx.skids) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.fillRect(-9, -2, 18, 4);
    ctx.restore();
  }

  // Cash stashes.
  for (const s of city.stashes) {
    if (s.taken) continue;
    ctx.fillStyle = '#ffd94e';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a7a3a';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', s.x, s.y + 4);
  }

  // Place labels and neon signs.
  const dark = darknessAt(G.time);
  ctx.textAlign = 'center';
  for (const place of city.places) {
    if (!inView(place.x - 80, place.y - 30, 160, 60)) continue;
    const neon = dark > 0.2 && (place.kind === 'bank' || place.kind === 'cafe' || place.kind === 'casino' || place.kind === 'hotel');
    if (neon) {
      ctx.save();
      ctx.shadowColor = place.kind === 'cafe' ? '#ff6ad5' : place.kind === 'casino' ? '#ffd94e' : '#6ad5ff';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText(place.label.toUpperCase(), place.x, place.y - 22);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(20,26,36,0.75)';
      const w = ctx.measureText(place.label).width + 16;
      ctx.fillRect(place.x - w / 2, place.y - 34, w, 20);
      ctx.fillStyle = '#f0e8d0';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(place.label, place.x, place.y - 20);
    }
  }

  // Objective marker.
  const obj = currentObjective(G);
  if (obj && G.screen === 'play' && !G.story.won) {
    const pulse = 1 + Math.sin(performance.now() / 240) * 0.15;
    ctx.save();
    ctx.translate(obj.x, obj.y);
    ctx.strokeStyle = '#ffd94e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 22 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd94e';
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(-9, -18);
    ctx.lineTo(9, -18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Mission cars, traffic, police, truck.
  for (const car of G.worldCars) drawCarShape(ctx, car);
  for (const car of G.traffic) drawCarShape(ctx, car);
  for (const car of G.police) drawCarShape(ctx, car);
  if (G.truck) drawCarShape(ctx, G.truck);
  if (G.player.inCar && G.player.car) drawCarShape(ctx, G.player.car);

  // Pedestrians and the player on foot.
  for (const ped of G.peds) drawPed(ctx, ped, dark);
  if (!G.player.inCar) {
    const p = G.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(1, 3, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b13c';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(Math.cos(p.face) * 3, Math.sin(p.face) * 3 - 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Particles.
  for (const part of G.fx.parts) {
    ctx.fillStyle = `rgba(${part.color},${(part.life / part.max) * 0.7})`;
    ctx.beginPath();
    ctx.arc(part.x, part.y, part.size * (0.5 + part.life / part.max), 0, Math.PI * 2);
    ctx.fill();
  }

  // Helicopter and its searchlight.
  if (G.heli.active) {
    const h = G.heli;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.fillStyle = 'rgba(255,255,220,0.10)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-70, 130);
    ctx.lineTo(70, 130);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a3f4a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(26, 0);
    ctx.stroke();
    ctx.restore();
  }

  // Floating texts.
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px sans-serif';
  for (const f of G.fx.floats) {
    ctx.fillStyle = f.color;
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
}

function drawHud(G, ctx, W, H) {
  const p = G.player;
  if (G.screen !== 'play') return;
  ctx.textAlign = 'left';
  ctx.font = 'bold 16px sans-serif';

  // Top-left: money, respect, stashes.
  ctx.fillStyle = 'rgba(10,14,22,0.72)';
  ctx.fillRect(10, 10, 210, 64);
  ctx.fillStyle = '#7ae08a';
  ctx.fillText(`$${G.money.toLocaleString()}`, 20, 32);
  ctx.fillStyle = '#ffd94e';
  ctx.fillText(`Respect ${G.respect}`, 20, 54);
  ctx.fillStyle = '#9ad5ff';
  const got = G.city.stashes.filter((s) => s.taken).length;
  ctx.fillText(`Stashes ${got}/10`, 120, 54);

  // Top-centre: clock and station.
  ctx.fillStyle = 'rgba(10,14,22,0.72)';
  ctx.fillRect(W / 2 - 110, 10, 220, 30);
  ctx.fillStyle = '#f0e8d0';
  ctx.textAlign = 'center';
  ctx.fillText(`${clockText(G.time)}  ·  ${G.sound.stations[G.sound.station]}`, W / 2, 31);

  // Top-right: wanted stars and police count.
  ctx.fillStyle = 'rgba(10,14,22,0.72)';
  ctx.fillRect(W - 180, 10, 170, 30);
  ctx.textAlign = 'right';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < G.stars ? '★' : '☆';
  ctx.fillStyle = G.stars > 0 ? '#ff5a4e' : '#888';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(stars, W - 70, 32);
  ctx.fillStyle = '#9ad5ff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`${G.police.length} units`, W - 20, 32);

  // Bottom-left: health bars and controls.
  ctx.fillStyle = 'rgba(10,14,22,0.72)';
  ctx.fillRect(10, H - 66, 190, 56);
  ctx.fillStyle = '#f0e8d0';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Health', 20, H - 46);
  ctx.fillStyle = '#333';
  ctx.fillRect(70, H - 56, 110, 10);
  ctx.fillStyle = p.hp > 30 ? '#7ae08a' : '#ff5a4e';
  ctx.fillRect(70, H - 56, 110 * (p.hp / 100), 10);
  ctx.fillStyle = '#f0e8d0';
  ctx.fillText('Car', 20, H - 26);
  ctx.fillStyle = '#333';
  ctx.fillRect(70, H - 36, 110, 10);
  const carHp = p.inCar && p.car ? p.car.health : 0;
  ctx.fillStyle = '#7ab8e0';
  ctx.fillRect(70, H - 36, 110 * (carHp / 100), 10);
  ctx.fillStyle = '#c8c8c8';
  ctx.font = '12px sans-serif';
  ctx.fillText('WASD drive · E enter · F punch · G garage · R radio · M mute · P pause', 10, H - 8);

  // Bottom-centre: mission.
  const m = MISSIONS[G.story.mission];
  const obj = currentObjective(G);
  if (m && obj) {
    ctx.fillStyle = 'rgba(10,14,22,0.72)';
    const w = 460;
    ctx.fillRect(W / 2 - w / 2, H - 66, w, 56);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94e';
    ctx.font = 'bold 15px sans-serif';
    const timer = G.story.data.timer !== undefined ? ` — ${Math.ceil(G.story.data.timer)}s` : '';
    ctx.fillText(`Mission ${G.story.mission + 1}/8 — ${m.title}${timer}`, W / 2, H - 44);
    ctx.fillStyle = '#f0e8d0';
    ctx.font = '13px sans-serif';
    const dist = Math.round(Math.hypot(p.x - obj.x, p.y - obj.y));
    ctx.fillText(`${obj.text} — ${dist}m`, W / 2, H - 22);
  }

  drawMinimap(G, ctx, W, H);
}

function drawMinimap(G, ctx, W, H) {
  const mw = 190;
  const mh = 142;
  const mx = W - mw - 12;
  const my = H - mh - 12;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.fillStyle = 'rgba(10,14,22,0.78)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = '#5a5f6a';
  ctx.lineWidth = 2;
  for (const ax of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(mx + ax * sx, my);
    ctx.lineTo(mx + ax * sx, my + WORLD_H * sy);
    ctx.stroke();
  }
  for (const sy2 of STREETS) {
    ctx.beginPath();
    ctx.moveTo(mx, my + sy2 * sy);
    ctx.lineTo(mx + WORLD_W * sx, my + sy2 * sy);
    ctx.stroke();
  }
  // Water.
  ctx.fillStyle = '#2a6a9a';
  ctx.fillRect(mx + 2480 * sx, my, (WORLD_W - 2480) * sx, mh);
  // Stashes.
  ctx.fillStyle = '#ffd94e';
  for (const s of G.city.stashes) {
    if (s.taken) continue;
    ctx.fillRect(mx + s.x * sx - 1, my + s.y * sy - 1, 3, 3);
  }
  // Police.
  ctx.fillStyle = '#5a8aff';
  for (const car of G.police) {
    ctx.fillRect(mx + car.x * sx - 2, my + car.y * sy - 2, 4, 4);
  }
  // Objective.
  const obj = currentObjective(G);
  if (obj) {
    ctx.fillStyle = '#ffd94e';
    ctx.beginPath();
    ctx.arc(mx + obj.x * sx, my + obj.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const p = G.player;
  ctx.save();
  ctx.translate(mx + p.x * sx, my + p.y * sy);
  ctx.rotate(p.inCar ? p.car.a : p.face);
  ctx.fillStyle = '#ff5a4e';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTitle(G, ctx, W, H) {
  ctx.fillStyle = 'rgba(8,10,20,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94e';
  ctx.font = 'bold 64px sans-serif';
  ctx.shadowColor = '#ff6ad5';
  ctx.shadowBlur = 24;
  ctx.fillText('VERDE BAY', W / 2, H / 2 - 70);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f0e8d0';
  ctx.font = '20px sans-serif';
  ctx.fillText('An open-world crime story — Dante Vega works for La Rosa', W / 2, H / 2 - 30);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#7ae08a';
  ctx.fillText('Press ENTER to play', W / 2, H / 2 + 20);
  if (G.saveData) {
    ctx.fillStyle = '#c8c8c8';
    ctx.font = '16px sans-serif';
    ctx.fillText(
      `Save found — $${G.saveData.money}, ${G.saveData.respect} respect, mission ${G.saveData.mission + 1}/8, ${G.saveData.stashes}/10 stashes`,
      W / 2, H / 2 + 56,
    );
  }
  ctx.fillStyle = '#9a9a9a';
  ctx.font = '14px sans-serif';
  ctx.fillText('WASD drive · E enter · F punch · G garage shop · R radio · M mute · P pause', W / 2, H / 2 + 92);
}

function drawShop(G, ctx, W, H) {
  ctx.fillStyle = 'rgba(8,10,20,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94e';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('VEGA MOTORS — GARAGE SHOP', W / 2, H / 2 - 90);
  ctx.font = '18px sans-serif';
  const items = [
    { key: '1', name: 'Armor Plating — +50 max health', price: 500, owned: G.upgrades.armor },
    { key: '2', name: 'Turbo — +15% speed', price: 800, owned: G.upgrades.turbo },
    { key: '3', name: 'Racing Tires — sharper steering', price: 400, owned: G.upgrades.tires },
    { key: '4', name: 'Repair car — full health', price: 150, owned: false },
  ];
  let y = H / 2 - 40;
  for (const item of items) {
    ctx.fillStyle = item.owned ? '#7ae08a' : '#f0e8d0';
    ctx.fillText(`[${item.key}] ${item.name} — $${item.price}${item.owned ? ' (owned)' : ''}`, W / 2, y);
    y += 32;
  }
  ctx.fillStyle = '#9a9a9a';
  ctx.font = '15px sans-serif';
  ctx.fillText(`Cash: $${G.money} — press 1-4 to buy, G or Esc to close`, W / 2, y + 16);
}

function drawPaused(ctx, W, H) {
  ctx.fillStyle = 'rgba(8,10,20,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0e8d0';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('PAUSED', W / 2, H / 2);
  ctx.font = '16px sans-serif';
  ctx.fillText('Press P to resume', W / 2, H / 2 + 34);
}

function drawEnd(G, ctx, W, H, won, label) {
  ctx.fillStyle = 'rgba(8,10,20,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  if (won) {
    ctx.fillStyle = '#ffd94e';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText('KING OF VERDE BAY', W / 2, H / 2 - 20);
    ctx.fillStyle = '#f0e8d0';
    ctx.font = '20px sans-serif';
    ctx.fillText(`$${G.money.toLocaleString()} · ${G.respect} respect · all 8 missions done`, W / 2, H / 2 + 20);
    ctx.fillText('Press ENTER to play again', W / 2, H / 2 + 56);
  } else {
    ctx.fillStyle = '#ff5a4e';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText(label, W / 2, H / 2 - 20);
    ctx.fillStyle = '#f0e8d0';
    ctx.font = '20px sans-serif';
    ctx.fillText('Press ENTER to try the mission again', W / 2, H / 2 + 20);
  }
}
