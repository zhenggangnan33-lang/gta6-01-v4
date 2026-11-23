// Staged screenshots for VERDE BAY. Each shot sets the game up in a
// scripted, deterministic state (player, wanted level, time of day, police,
// mission) so the four screenshots show the game at its best: a chase, a
// pursuit, a mission at night, and the title over the dusk city. The game
// then runs normally from that setup, so the shot is a real render of the
// game's own code, never a composite.

import { placeById } from './world.js';
import { makeCar } from './vehicles.js';
import { startMission } from './story.js';

function putPolice(G, spots) {
  G.police.length = 0;
  for (const [x, y, a] of spots) {
    G.police.push(makeCar('police', x, y, a));
  }
}

export function applyShot(G, name) {
  const city = G.city;
  if (name === 'cover') {
    // 4-star chase at Meridian Bank, dusk, helicopter overhead.
    G.screen = 'play';
    G.time = 18.4;
    G.money = 200;
    G.respect = 0;
    G.stars = 4;
    startMission(G, 3); // The Vault Job, first bag at the bank.
    const bank = placeById(city, 'bank');
    const car = makeCar('sports', bank.x + 60, bank.y + 90, -Math.PI / 2);
    car.v = 120;
    G.player.car = car;
    G.player.inCar = true;
    G.player.x = car.x;
    G.player.y = car.y;
    G.player.a = car.a;
    G.player.hp = 100;
    putPolice(G, [
      [bank.x - 120, bank.y + 160, 0.6],
      [bank.x + 180, bank.y - 60, 2.4],
      [bank.x + 40, bank.y + 260, -1.2],
    ]);
    G.heli.active = true;
    G.heli.x = bank.x;
    G.heli.y = bank.y;
  } else if (name === 'chase') {
    // Hot pursuit by the marina, three stars, police ramming.
    G.screen = 'play';
    G.time = 15.5;
    G.money = 2300;
    G.respect = 30;
    G.stars = 3;
    startMission(G, 2); // Hot Pursuit.
    const car = makeCar('sedan', 2120, 1300, Math.PI / 2);
    car.v = 220;
    G.player.car = car;
    G.player.inCar = true;
    G.player.x = car.x;
    G.player.y = car.y;
    G.player.a = car.a;
    G.player.hp = 82;
    putPolice(G, [
      [2080, 1180, Math.PI / 2],
      [2200, 1420, -Math.PI / 2],
      [2040, 1360, 0.4],
    ]);
    G.heli.active = true;
    G.heli.x = 2120;
    G.heli.y = 1300;
  } else if (name === 'mission') {
    // Night courier at Café Luna, objective arrow to Hotel Miramar.
    G.screen = 'play';
    G.time = 21.5;
    G.money = 1400;
    G.respect = 18;
    G.stars = 0;
    startMission(G, 1); // Night Courier, package at the café.
    const cafe = placeById(city, 'cafe');
    const car = makeCar('sedan', cafe.x + 50, cafe.y + 80, 0);
    G.player.car = car;
    G.player.inCar = true;
    G.player.x = car.x;
    G.player.y = car.y;
    G.player.a = car.a;
    G.player.hp = 100;
    putPolice(G, []);
  } else if (name === 'city') {
    // Title screen over the dusk city, with a save line.
    G.screen = 'title';
    G.time = 18.1;
    G.money = 4500;
    G.respect = 115;
    G.stars = 0;
    G.saveData = { money: 4500, respect: 115, mission: 5, stashes: 4, upgrades: {} };
    G.player.x = 1160;
    G.player.y = 840;
    G.player.inCar = false;
    putPolice(G, []);
    G.heli.active = false;
  }
  // Frame the camera on the player at once (no slow pan for a still shot).
  G.camera.x = Math.max(0, Math.min(2560 - 1280, G.player.x - 640));
  G.camera.y = Math.max(0, Math.min(1920 - 720, G.player.y - 360));
}
