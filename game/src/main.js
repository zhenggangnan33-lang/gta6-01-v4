// VERDE BAY — boot, game loop, input, saving, shops and the debug hook the
// autopilot drives through. This is the wiring: the world lives in world.js,
// the driving in vehicles.js, the people in people.js, the story in
// story.js, the look in view.js and the sound in sound.js.

import { buildCity, placeById, nearestNode, WORLD_W, WORLD_H } from './world.js';
import { makeRng } from './rng.js';
import { createSound } from './sound.js';
import { createFx, updateFx, spawnExhaust, spawnSmoke, addFloat } from './fx.js';
import {
  makeCar, stepCar, separateCars, spawnTraffic, updateTraffic,
  updatePolice, updateTruck, steerToward,
} from './vehicles.js';
import { spawnPeds, updatePeds, updatePlayerOnFoot, playerPunch } from './people.js';
import { MISSIONS, createStory, startMission, failMission, updateStory, currentObjective } from './story.js';
import { render } from './view.js';
import { applyShot } from './shots.js';

const SAVE_KEY = 'verdebay-save-v5';
const SEED = 23;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const G = {
  city: buildCity(SEED),
  rng: makeRng(SEED + 7),
  sound: createSound(),
  fx: createFx(),
  player: {
    x: 1160, y: 980, a: 0, face: 0, hp: 100,
    inCar: false, car: null,
  },
  traffic: [],
  police: [],
  worldCars: [],
  truck: null,
  peds: [],
  heli: { active: false, x: 1160, y: 980 },
  stars: 0,
  money: 200,
  respect: 0,
  time: 12.0,
  story: createStory(),
  missionCar: null,
  upgrades: { armor: false, turbo: false, tires: false },
  keys: {},
  pressedE: false,
  screen: 'title',
  camera: { x: 0, y: 0 },
  bustT: 0,
  busted: false,
  wasted: false,
  won: false,
  frozen: false,
  peakStars: 0,
  saveData: null,
  speed: 1,
  heatT: 0,
  lastCrime: -999,
};

G.addHeat = function addHeat(n) {
  G.stars = Math.min(5, G.stars + n);
  G.lastCrime = G.playT;
};

G.playT = 0;

G.save = function save() {
  try {
    const taken = G.city.stashes.filter((s) => s.taken).map((s) => s.id);
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: G.money,
      respect: G.respect,
      mission: G.story.mission,
      stashes: taken,
      upgrades: G.upgrades,
    }));
  } catch {
    // Storage may be unavailable (private mode); the game plays on.
  }
};

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function restoreSave(save) {
  G.money = save.money || 200;
  G.respect = save.respect || 0;
  G.upgrades = { armor: false, turbo: false, tires: false, ...(save.upgrades || {}) };
  for (const id of save.stashes || []) {
    const s = G.city.stashes[id];
    if (s) s.taken = true;
  }
  startMission(G, Math.min(save.mission || 0, MISSIONS.length - 1));
}

function resetPlayer() {
  const p = G.player;
  p.x = 1160;
  p.y = 980;
  p.a = 0;
  p.face = 0;
  p.hp = 100;
  p.inCar = false;
  p.car = null;
}

function tryCarEnterExit() {
  const p = G.player;
  if (p.inCar && p.car) {
    if (Math.abs(p.car.v) > 15) return;
    const car = p.car;
    p.x = car.x - Math.sin(car.a) * 30;
    p.y = car.y + Math.cos(car.a) * 30;
    p.a = car.a;
    p.face = car.a;
    p.inCar = false;
    p.car = null;
    G.worldCars.push(car);
    return;
  }
  // On foot: get into the nearest car.
  let best = null;
  let bestD = 55;
  const all = [...G.worldCars, ...G.traffic];
  if (G.missionCar && !all.includes(G.missionCar)) all.push(G.missionCar);
  for (const car of all) {
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  // On an enterCar step, prefer the mission car when it is in range: the
  // car the player drove up in is usually parked right beside it, and
  // picking the nearest car would keep re-entering that one forever.
  const step = MISSIONS[G.story.mission].steps[G.story.step];
  if (step && step.type === 'enterCar' && G.missionCar) {
    const md = Math.hypot(G.missionCar.x - p.x, G.missionCar.y - p.y);
    if (md < 55) best = G.missionCar;
  }
  if (!best) return;
  const ti = G.traffic.indexOf(best);
  if (ti >= 0) G.traffic.splice(ti, 1);
  const wi = G.worldCars.indexOf(best);
  if (wi >= 0) G.worldCars.splice(wi, 1);
  p.car = best;
  p.inCar = true;
  p.x = best.x;
  p.y = best.y;
  p.a = best.a;
  if (best.maxHealth === 100 && G.upgrades.armor) best.maxHealth = 150;
  G.addHeat(1); // stealing a car is a crime
  if (G.sound) G.sound.blip(300, 0.1, 'square', 0.2);
}

function carValue(car) {
  if (car.kind === 'sports') return 1500;
  if (car.kind === 'van') return 400;
  if (car.kind === 'taxi') return 350;
  if (car.kind === 'police' || car.kind === 'truck') return 0;
  return 300;
}

function tryChopSell() {
  const p = G.player;
  if (!p.inCar || !p.car) return false;
  const chop = placeById(G.city, 'chopshop');
  const d = Math.hypot(p.x - chop.x, p.y - chop.y);
  if (d > 70 || Math.abs(p.car.v) > 60) return false;
  const car = p.car;
  if (car.mission) return false;
  const value = carValue(car);
  if (value <= 0) return false;
  G.money += value;
  addFloat(G.fx, p.x, p.y - 30, `+$${value} sold`, '#7ae08a');
  if (G.sound) G.sound.cash();
  p.inCar = false;
  p.car = null;
  return true;
}

function buyShop(index) {
  const items = [
    { key: 'armor', price: 500 },
    { key: 'turbo', price: 800 },
    { key: 'tires', price: 400 },
    { key: 'repair', price: 150 },
  ];
  const item = items[index];
  if (!item || G.money < item.price) return;
  if (item.key === 'repair') {
    if (G.player.car) G.player.car.health = G.player.car.maxHealth;
    G.money -= item.price;
    if (G.sound) G.sound.cash();
    return;
  }
  if (G.upgrades[item.key]) return;
  G.upgrades[item.key] = true;
  G.money -= item.price;
  if (G.sound) G.sound.cash();
  G.save();
}

function update(G, dt) {
  G.playT += dt;
  G.time += dt / 60; // one game hour per real minute
  if (G.time >= 24) G.time -= 24;

  const p = G.player;

  // E key: mission interact first, then chop sell, then car enter/exit.
  if (G.pressedE) {
    const obj = currentObjective(G);
    const step = MISSIONS[G.story.mission].steps[G.story.step];
    const isInteract = step && (step.type === 'interact' || step.type === 'grab');
    // The interact reach is the step's own radius (the truck is big, so
    // its cargo grab reaches further than a shop counter).
    if (isInteract && obj && Math.hypot(p.x - obj.x, p.y - obj.y) < (step.r || 60)) {
      // Leave pressedE for updateStory to consume.
    } else {
      G.pressedE = false;
      if (!tryChopSell()) tryCarEnterExit();
    }
  }

  // Player movement.
  if (p.inCar && p.car) {
    const k = G.keys;
    const input = {
      gas: (k['KeyW'] || k['ArrowUp']) ? 1 : 0,
      brake: (k['KeyS'] || k['ArrowDown']) ? 1 : 0,
      steer: ((k['KeyA'] || k['ArrowLeft']) ? -1 : 0) + ((k['KeyD'] || k['ArrowRight']) ? 1 : 0),
      hand: !!(k['Space']),
    };
    stepCar(p.car, input, dt, G);
    p.x = p.car.x;
    p.y = p.car.y;
    p.a = p.car.a;
    p.car.exhaustT -= dt;
    if (p.car.exhaustT <= 0 && Math.abs(p.car.v) > 40) {
      spawnExhaust(G.fx, p.car.x, p.car.y, p.car.a);
      p.car.exhaustT = 0.12;
    }
    if (p.car.health < 40) {
      spawnSmoke(G.fx, p.car.x, p.car.y);
    }
  } else {
    updatePlayerOnFoot(G, dt);
  }

  // Stash collection.
  for (const s of G.city.stashes) {
    if (s.taken) continue;
    if (Math.hypot(p.x - s.x, p.y - s.y) < 30) {
      s.taken = true;
      G.money += 150;
      addFloat(G.fx, s.x, s.y - 20, '+$150', '#ffd94e');
      if (G.sound) G.sound.cash();
    }
  }

  updateTraffic(G, dt);
  updatePolice(G, dt);
  updateTruck(G, dt);
  const allCars = [
    ...(p.inCar && p.car ? [p.car] : []),
    ...G.traffic, ...G.police, ...G.worldCars,
    ...(G.truck ? [G.truck] : []),
  ];
  separateCars(allCars);
  updatePeds(G, dt);
  updateStory(G, dt);
  updateFx(G.fx, dt);

  // Wanted decay: lie low for a while and the heat fades.
  if (G.stars > 0 && G.playT - G.lastCrime > 25) {
    G.heatT += dt;
    if (G.heatT > 12) {
      G.stars--;
      G.heatT = 0;
      G.lastCrime = G.playT;
    }
  } else {
    G.heatT = 0;
  }

  // Clean-getaway bonus: losing 2+ stars without being caught pays $100.
  if (G.stars === 0 && G.peakStars >= 2 && !G.story.won) {
    G.money += 100;
    addFloat(G.fx, p.x, p.y - 30, '+$100 clean getaway', '#7ae08a');
    G.peakStars = 0;
  }
  if (G.stars > (G.peakStars || 0)) G.peakStars = G.stars;

  if (p.hp <= 0 && !G.wasted) {
    p.hp = 0;
    G.wasted = true;
  }
  if (G.busted || G.wasted) {
    // Freeze the world behind the end screen.
    G.frozen = true;
  }
}

// --- Input -----------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  G.keys[e.code] = true;
  if (e.code === 'Enter') {
    G.sound.ensure();
    if (G.screen === 'title') {
      if (G.saveData) restoreSave(G.saveData);
      else startMission(G, 0);
      G.screen = 'play';
    } else if (G.busted || G.wasted) {
      failMission(G);
      G.frozen = false;
      G.screen = 'play';
    } else if (G.won) {
      window.location.reload();
    }
  }
  if (e.code === 'KeyE' && G.screen === 'play') G.pressedE = true;
  if (e.code === 'KeyF' && G.screen === 'play' && !G.player.inCar) playerPunch(G);
  if (e.code === 'KeyR' && G.screen === 'play') {
    G.sound.ensure();
    G.sound.setStation(G.sound.station + 1);
  }
  if (e.code === 'KeyM') G.sound.toggleMute();
  if (e.code === 'KeyP' && G.screen === 'play') G.screen = 'paused';
  else if (e.code === 'KeyP' && G.screen === 'paused') G.screen = 'play';
  if (e.code === 'KeyG' && G.screen === 'play') {
    const g = placeById(G.city, 'garage');
    if (Math.hypot(G.player.x - g.x, G.player.y - g.y) < 100) G.screen = 'shop';
  } else if (e.code === 'KeyG' && G.screen === 'shop') {
    G.screen = 'play';
  }
  if (e.code === 'Escape' && G.screen === 'shop') G.screen = 'play';
  if (G.screen === 'shop' && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
    buyShop(Number(e.code.slice(-1)) - 1);
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  G.keys[e.code] = false;
});
canvas.addEventListener('pointerdown', () => {
  G.sound.ensure();
  if (G.screen === 'title') {
    if (G.saveData) restoreSave(G.saveData);
    else startMission(G, 0);
    G.screen = 'play';
  }
});

// --- Debug hook (autopilot + screenshots) ------------------------------------

window.__VB = {
  state() {
    const p = G.player;
    const obj = currentObjective(G);
    const step = MISSIONS[G.story.mission].steps[G.story.step];
    return {
      x: Math.round(p.x), y: Math.round(p.y),
      angle: p.a, speed: p.inCar && p.car ? Math.round(p.car.v) : 0,
      inCar: p.inCar, hp: Math.round(p.hp),
      carHealth: p.inCar && p.car ? Math.round(p.car.health) : 0,
      money: G.money, respect: G.respect, stars: G.stars,
      mission: G.story.mission, step: G.story.step,
      missionTitle: MISSIONS[G.story.mission].title,
      objX: obj ? Math.round(obj.x) : 0,
      objY: obj ? Math.round(obj.y) : 0,
      objText: obj ? obj.text : '',
      objR: step && step.r ? step.r : 0,
      timer: G.story.data.timer !== undefined ? Math.ceil(G.story.data.timer) : -1,
      truckHits: G.truck ? G.truck.ramHits : 0,
      truckX: G.truck ? Math.round(G.truck.x) : 0,
      truckY: G.truck ? Math.round(G.truck.y) : 0,
      busted: G.busted, wasted: G.wasted, won: G.won,
      screen: G.screen, time: +G.time.toFixed(2),
      stashes: G.city.stashes.filter((s) => s.taken).length,
      police: G.police.length,
      nearCar: (() => {
        let best = null;
        let bestD = 100;
        const all = [...G.worldCars, ...G.traffic];
        if (G.missionCar && !all.includes(G.missionCar)) all.push(G.missionCar);
        for (const car of all) {
          const d = Math.hypot(car.x - p.x, car.y - p.y);
          if (d < bestD) {
            bestD = d;
            best = car;
          }
        }
        return best ? { x: Math.round(best.x), y: Math.round(best.y), d: Math.round(bestD) } : null;
      })(),
    };
  },
  nodes: G.city.nodes,
  edges: G.city.edges,
  setSpeed(n) {
    G.speed = Math.max(0.5, Math.min(6, n));
  },
};

// --- Boot --------------------------------------------------------------------

G.saveData = loadSave();
spawnTraffic(G);
spawnPeds(G);
startMission(G, 0);
resetPlayer();

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const speedParam = Number(params.get('speed'));
if (speedParam > 0) G.speed = Math.min(6, speedParam);
if (shot) {
  applyShot(G, shot);
  // Shots run straight into the scene.
  if (G.screen === 'title' && shot !== 'city') G.screen = 'play';
}

let last = performance.now();
let acc = 0;
function frame(now) {
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (G.screen === 'play' && !G.frozen) {
    acc += realDt * G.speed;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 8) {
      update(G, 1 / 60);
      acc -= 1 / 60;
      steps++;
    }
    if (steps === 8) acc = 0;
  } else if (G.screen === 'title') {
    // A living backdrop: time drifts slowly behind the title.
    G.time += realDt / 240;
    if (G.time >= 24) G.time -= 24;
  }
  render(G, ctx, canvas.width, canvas.height);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
