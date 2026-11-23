// Vehicles for VERDE BAY: arcade car physics, traffic that routes on the
// road graph, police that chase the player, a searchlight helicopter, and
// the armored convoy truck. All movement is fixed-step and deterministic.

import { findRoute, nearestNode, WORLD_W, WORLD_H } from './world.js';
import { spawnSparks, spawnSmoke, spawnExhaust, addSkid } from './fx.js';

const CAR_SPECS = {
  sedan: { w: 40, h: 20, top: 300, accel: 250, color: '#c25a4e' },
  taxi: { w: 40, h: 20, top: 300, accel: 250, color: '#f2c14e' },
  van: { w: 46, h: 22, top: 250, accel: 200, color: '#7a8a99' },
  sports: { w: 42, h: 20, top: 400, accel: 330, color: '#d84a7a' },
  police: { w: 40, h: 20, top: 335, accel: 300, color: '#2a4a8a' },
  truck: { w: 64, h: 26, top: 170, accel: 140, color: '#5a6a5a' },
};

export function makeCar(kind, x, y, angle) {
  const spec = CAR_SPECS[kind];
  return {
    kind, x, y, a: angle || 0, v: 0,
    w: spec.w, h: spec.h, top: spec.top, accel: spec.accel,
    color: spec.color,
    health: 100, maxHealth: 100,
    mission: false, // mission cars can never be sold or despawned
    route: [], routeIdx: 0, stuckT: 0, repathT: 0,
    ramHits: 0, // convoy truck: how many times the player rammed it
    exhaustT: 0,
  };
}

// One physics step for a car under driver input.
// input: { gas: 0..1, brake: 0..1, steer: -1..1, hand: bool }
export function stepCar(car, input, dt, G) {
  const turbo = G.upgrades.turbo ? 1.15 : 1;
  if (input.gas > 0) {
    car.v += car.accel * turbo * input.gas * dt;
  } else if (input.brake > 0) {
    if (car.v > 12) car.v -= 420 * input.brake * dt;
    else car.v -= 150 * input.brake * dt; // reverse
  } else {
    car.v -= car.v * 0.5 * dt; // rolling drag
  }
  const top = car.top * turbo;
  if (car.v > top) car.v = top;
  if (car.v < -130) car.v = -130;

  const dir = car.v >= 0 ? 1 : -1;
  const grip = G.upgrades.tires ? 1.25 : 1;
  let turn = 2.5 * Math.min(Math.abs(car.v) / 150, 1) * dir * grip;
  if (input.hand) turn *= 1.7;
  car.a += (input.steer || 0) * turn * dt;
  if (input.hand && Math.abs(car.v) > 120) {
    car.v -= car.v * 0.6 * dt;
    if (G.fx && Math.random() < 0.4) addSkid(G.fx, car.x, car.y, car.a);
  }

  car.x += Math.cos(car.a) * car.v * dt;
  car.y += Math.sin(car.a) * car.v * dt;
  collideSolids(car, G);
  car.x = Math.max(14, Math.min(WORLD_W - 14, car.x));
  car.y = Math.max(14, Math.min(WORLD_H - 14, car.y));
}

function collideSolids(car, G) {
  const r = Math.max(car.w, car.h) / 2 - 4;
  for (const s of G.city.solids) {
    const cx = Math.max(s.x, Math.min(car.x, s.x + s.w));
    const cy = Math.max(s.y, Math.min(car.y, s.y + s.h));
    const dx = car.x - cx;
    const dy = car.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = r - d;
      const impact = Math.abs(car.v);
      car.x += (dx / d) * push;
      car.y += (dy / d) * push;
      car.v *= 0.45;
      if (impact > 180 && G.fx) {
        spawnSparks(G.fx, cx, cy, 6);
        if (G.sound) G.sound.thud();
      }
    }
  }
}

// Push two overlapping cars apart (cheap circle test).
export function separateCars(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = 44;
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

// --- Traffic ---------------------------------------------------------------

export function spawnTraffic(G) {
  const rng = G.rng;
  const kinds = ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'sedan', 'taxi', 'sedan', 'van', 'sedan', 'sedan', 'taxi', 'sedan', 'sedan'];
  for (let i = 0; i < 14; i++) {
    const node = Math.floor(rng.next() * G.city.nodes.length);
    const n = G.city.nodes[node];
    const car = makeCar(kinds[i % kinds.length], n.x + rng.range(-8, 8), n.y + rng.range(-8, 8), rng.next() * Math.PI * 2);
    car.color = car.kind === 'sedan' ? ['#c25a4e', '#5a8ac2', '#8a9a5a', '#b0b0b0'][i % 4] : car.color;
    planRoute(G, car);
    G.traffic.push(car);
  }
}

function planRoute(G, car) {
  const from = nearestNode(G.city, car.x, car.y);
  let to = Math.floor(G.rng.next() * G.city.nodes.length);
  if (to === from) to = (to + 7) % G.city.nodes.length;
  const route = findRoute(G.city, from, to);
  car.route = route || [from, to];
  car.routeIdx = 0;
  car.stuckT = 0;
}

// Steer a car toward a point: returns { gas, brake, steer }.
export function steerToward(car, tx, ty, wantSpeed) {
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  let diff = want - car.a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.6));
  const gas = car.v < wantSpeed ? 1 : 0;
  const brake = Math.abs(diff) > 1.2 && car.v > 60 ? 1 : 0;
  return { gas, brake, steer, hand: false, dist };
}

export function updateTraffic(G, dt) {
  for (const car of G.traffic) {
    if (!car.route.length) planRoute(G, car);
    const target = G.city.nodes[car.route[car.routeIdx]];
    // Right-hand lane: offset the target point to the right of travel.
    const dx = target.x - car.x;
    const dy = target.y - car.y;
    const len = Math.hypot(dx, dy) || 1;
    const rx = target.x + (dy / len) * 10;
    const ry = target.y - (dx / len) * 10;
    const input = steerToward(car, rx, ry, 120);
    stepCar(car, input, dt, G);
    if (input.dist < 34) {
      car.routeIdx++;
      if (car.routeIdx >= car.route.length) planRoute(G, car);
    }
    if (Math.abs(car.v) < 6) {
      car.stuckT += dt;
      if (car.stuckT > 4) planRoute(G, car);
    } else {
      car.stuckT = 0;
    }
    car.exhaustT -= dt;
    if (car.exhaustT <= 0 && Math.abs(car.v) > 40) {
      spawnExhaust(G.fx, car.x, car.y, car.a);
      car.exhaustT = 0.12;
    }
  }
}

// --- Police ----------------------------------------------------------------

export function wantedPoliceCount(stars) {
  return Math.min(stars, 4);
}

export function spawnPolice(G) {
  const want = wantedPoliceCount(G.stars);
  while (G.police.length < want) {
    // Spawn at a road node far from the player.
    let node = Math.floor(G.rng.next() * G.city.nodes.length);
    let tries = 0;
    while (tries++ < 12) {
      const n = G.city.nodes[node];
      if (Math.hypot(n.x - G.player.x, n.y - G.player.y) > 700) break;
      node = Math.floor(G.rng.next() * G.city.nodes.length);
    }
    const n = G.city.nodes[node];
    const car = makeCar('police', n.x, n.y, 0);
    G.police.push(car);
  }
  while (G.police.length > want) G.police.pop();
}

export function updatePolice(G, dt) {
  if (G.stars <= 0) {
    G.police.length = 0;
    G.heli.active = false;
    return;
  }
  spawnPolice(G);
  for (const car of G.police) {
    car.repathT -= dt;
    if (car.repathT <= 0 || !car.route.length) {
      const from = nearestNode(G.city, car.x, car.y);
      const to = nearestNode(G.city, G.player.x, G.player.y);
      const route = findRoute(G.city, from, to);
      car.route = route || [from, to];
      car.routeIdx = 0;
      car.repathT = 1.0;
    }
    const pDist = Math.hypot(G.player.x - car.x, G.player.y - car.y);
    let input;
    if (pDist < 130) {
      // Close in: ram the player directly.
      input = steerToward(car, G.player.x, G.player.y, 335);
    } else {
      const target = G.city.nodes[car.route[car.routeIdx]];
      input = steerToward(car, target.x, target.y, 300);
      if (input.dist < 40) {
        car.routeIdx++;
        if (car.routeIdx >= car.route.length) car.repathT = 0;
      }
    }
    stepCar(car, input, dt, G);
    // Ramming the player hurts.
    const overlap = Math.hypot(G.player.x - car.x, G.player.y - car.y) < 40;
    if (overlap && G.player.inCar) {
      const target = G.player.car;
      if (target && Math.abs(car.v) > 60) {
        target.health -= 15 * dt;
        if (G.fx) spawnSparks(G.fx, G.player.x, G.player.y, 3);
        if (target.health <= 0) {
          target.health = 0;
          G.player.car = null;
          G.player.inCar = false;
          G.player.hp -= 25;
        }
      }
      // Busted: slow and cornered.
      if (target && Math.abs(target.v) < 20) {
        G.bustT += dt;
        if (G.bustT > 1.5) G.busted = true;
      }
    }
    if (overlap && !G.player.inCar) {
      // Cornered on foot.
      G.bustT += dt;
      if (G.bustT > 1.0) G.busted = true;
    }
  }
  if (G.stars < 3) G.bustT = Math.max(0, G.bustT - dt);
  // Helicopter joins at 3 stars.
  G.heli.active = G.stars >= 3;
  if (G.heli.active) {
    const k = 1 - Math.pow(0.02, dt);
    G.heli.x += (G.player.x - G.heli.x) * k;
    G.heli.y += (G.player.y - G.heli.y) * k;
  }
}

// --- Convoy truck ------------------------------------------------------------

export function spawnTruck(G) {
  // A loop around the outer ring road.
  const ring = [0, 1, 2, 3, 4, 9, 14, 19, 24, 29, 34, 33, 32, 31, 30, 25, 20, 15, 10, 5];
  const truck = makeCar('truck', G.city.nodes[ring[0]].x, G.city.nodes[ring[0]].y, 0);
  truck.mission = true;
  truck.ring = ring;
  truck.ringIdx = 1;
  truck.health = 300;
  G.truck = truck;
  return truck;
}

export function updateTruck(G, dt) {
  const truck = G.truck;
  if (!truck) return;
  // Rammed 3 times, the truck is stopped dead — it stays put so the
  // player can grab the cargo from it.
  if (truck.ramHits >= 3) {
    truck.v = 0;
    if (truck.ramCooldown > 0) truck.ramCooldown -= dt;
    return;
  }
  const target = G.city.nodes[truck.ring[truck.ringIdx]];
  const input = steerToward(truck, target.x, target.y, 150);
  stepCar(truck, input, dt, G);
  if (input.dist < 40) {
    truck.ringIdx = (truck.ringIdx + 1) % truck.ring.length;
  }
  // Player ramming the truck slows it and counts toward the intercept.
  const p = G.player;
  if (p.inCar && p.car) {
    const d = Math.hypot(p.car.x - truck.x, p.car.y - truck.y);
    if (d < 46 && Math.abs(p.car.v) > 100) {
      if (!truck.ramCooldown || truck.ramCooldown <= 0) {
        truck.ramHits++;
        truck.ramCooldown = 1.2;
        truck.health -= 60;
        spawnSparks(G.fx, truck.x, truck.y, 10);
        if (G.sound) G.sound.thud();
      }
    }
  }
  if (truck.ramCooldown > 0) truck.ramCooldown -= dt;
}
