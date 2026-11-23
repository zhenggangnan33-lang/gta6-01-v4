// The story for VERDE BAY: eight missions for Dante Vega, wheelman for
// Carmen "La Rosa" Ibarra. Each mission is a list of steps; a step is a
// small goal (reach a place, get in a car, press E, survive a timer, ram the
// truck). The engine only reads the game state and advances steps — it never
// draws anything and never touches the network.

import { placeById } from './world.js';
import { makeCar, spawnTruck } from './vehicles.js';
import { addFloat } from './fx.js';

export const MISSIONS = [
  {
    id: 'm1', title: 'First Wheels',
    brief: 'La Rosa needs wheels. Boost the sedan by Vega Motors and bring it to Palma Plaza.',
    payout: 700, respect: 8, stars: 1,
    steps: [
      { type: 'enterCar', text: 'Get in the sedan by the garage (E)' },
      { type: 'deliver', place: 'plaza', r: 60, text: 'Drive the sedan to Palma Plaza' },
    ],
  },
  {
    id: 'm2', title: 'Night Courier',
    brief: 'A package waits at Café Luna. Pick it up and run it to Hotel Miramar — no questions.',
    payout: 1400, respect: 18, stars: 2, night: true,
    steps: [
      { type: 'interact', place: 'cafe', r: 44, text: 'Pick up the package at Café Luna (E)' },
      { type: 'deliver', place: 'hotel', r: 60, text: 'Deliver the package to Hotel Miramar' },
    ],
  },
  {
    id: 'm3', title: 'Hot Pursuit',
    brief: 'Two stars and every unit in Verde Bay is on you. Stay free for 30 seconds, then get back to the garage.',
    payout: 2300, respect: 30, stars: 2,
    steps: [
      { type: 'survive', seconds: 30, text: 'Outrun the pursuit — stay free' },
      { type: 'goto', place: 'garage', r: 70, text: 'Get back to Vega Motors' },
    ],
  },
  {
    id: 'm4', title: 'The Vault Job',
    brief: 'Three bags: the bank, the plaza, the docks. Grab them all and bring them home.',
    payout: 3950, respect: 45, stars: 2,
    steps: [
      { type: 'grab', place: 'bank', r: 44, text: 'Grab the bag at Meridian Bank (E)' },
      { type: 'grab', place: 'plaza', r: 44, text: 'Grab the bag at Palma Plaza (E)' },
      { type: 'grab', place: 'docks', r: 44, text: 'Grab the bag at The Docks (E)' },
      { type: 'deliver', place: 'garage', r: 70, text: 'Bring the bags back to Vega Motors' },
    ],
  },
  {
    id: 'm5', title: 'Cometa GT',
    brief: 'A Cometa GT is sitting in the dealership lot. Take it — gently — and bring it to the garage.',
    payout: 5355, respect: 63, stars: 2,
    steps: [
      { type: 'enterCar', car: 'sports', text: 'Get in the Cometa GT at the dealership (E)' },
      { type: 'deliver', place: 'garage', r: 70, text: 'Drive the Cometa GT to Vega Motors' },
    ],
  },
  {
    id: 'm6', title: 'Casa Diamante',
    brief: 'Smash the jewellers’ window, grab the loot, and vanish before the third star shows up.',
    payout: 6104, respect: 83, stars: 3,
    steps: [
      { type: 'interact', place: 'jewellers', r: 44, text: 'Smash the window and grab the loot (E)' },
      { type: 'deliver', place: 'garage', r: 70, text: 'Lose them and get to Vega Motors' },
    ],
  },
  {
    id: 'm7', title: 'Convoy Intercept',
    brief: 'An armored truck is running the ring road. Ram it to a stop, take the cargo, and run for the docks.',
    payout: 8629, respect: 108, stars: 3,
    steps: [
      { type: 'ram', hits: 3, text: 'Ram the convoy truck 3 times to stop it' },
      { type: 'interact', truck: true, r: 80, text: 'Grab the cargo from the truck (E)' },
      { type: 'deliver', place: 'docks', r: 70, text: 'Take the cargo to The Docks' },
    ],
  },
  {
    id: 'm8', title: 'King of Verde Bay',
    brief: 'Five stars. The whole city is after you. Survive 45 seconds, then reach the yacht — and you are king.',
    payout: 11112, respect: 148, stars: 5,
    steps: [
      { type: 'survive', seconds: 45, text: 'Survive five stars for 45 seconds' },
      { type: 'goto', place: 'yacht', r: 70, text: 'Reach the Yacht La Rosa' },
    ],
  },
];

export function createStory() {
  return {
    mission: 0,
    step: 0,
    data: {},
    won: false,
    attempts: 0,
  };
}

function missionDef(G) {
  return MISSIONS[G.story.mission];
}

function stepDef(G) {
  return missionDef(G).steps[G.story.step];
}

// Where the current step wants the player to be (for the HUD arrow and the
// autopilot). Returns { x, y, text } or null.
export function currentObjective(G) {
  const m = missionDef(G);
  if (!m) return null;
  const s = stepDef(G);
  if (!s) return null;
  if (s.place) {
    const p = placeById(G.city, s.place);
    return { x: p.x, y: p.y, text: s.text };
  }
  if (s.truck && G.truck) {
    return { x: G.truck.x, y: G.truck.y, text: s.text };
  }
  if (s.type === 'enterCar' && s.car === 'sports' && G.missionCar) {
    return { x: G.missionCar.x, y: G.missionCar.y, text: s.text };
  }
  if (s.type === 'enterCar' && G.missionCar) {
    return { x: G.missionCar.x, y: G.missionCar.y, text: s.text };
  }
  if (s.type === 'survive') {
    return { x: G.player.x, y: G.player.y, text: s.text };
  }
  if (s.type === 'ram' && G.truck) {
    return { x: G.truck.x, y: G.truck.y, text: s.text };
  }
  return { x: G.player.x, y: G.player.y, text: s.text };
}

function stepPoint(G, s) {
  if (s.place) return placeById(G.city, s.place);
  if (s.truck && G.truck) return G.truck;
  return null;
}

// Set up a mission: spawn its cars, set the time and the wanted level.
export function startMission(G, idx) {
  const m = MISSIONS[idx];
  G.story.mission = idx;
  G.story.step = 0;
  G.story.data = {};
  G.missionCar = null;
  if (m.night) G.time = 21.5;
  if (m.id === 'm1') {
    const g = placeById(G.city, 'garage');
    const sedan = makeCar('sedan', g.x + 40, g.y + 30, Math.PI / 2);
    sedan.mission = true;
    G.missionCar = sedan;
    G.worldCars.push(sedan);
  }
  if (m.id === 'm5') {
    const d = placeById(G.city, 'dealership');
    const sports = makeCar('sports', d.x + 36, d.y + 26, Math.PI);
    sports.mission = true;
    G.missionCar = sports;
    G.worldCars.push(sports);
  }
  if (m.id === 'm7') {
    spawnTruck(G);
  }
  G.stars = 0;
}

// The player failed (busted or wasted): retry the same mission from its
// start, keep the money, lose $200.
export function failMission(G) {
  const m = missionDef(G);
  G.story.attempts++;
  G.money = Math.max(0, G.money - 200);
  G.stars = 0;
  G.busted = false;
  G.wasted = false;
  G.bustT = 0;
  G.player.hp = 100;
  G.player.x = 1160;
  G.player.y = 980;
  G.player.a = 0;
  G.player.v = 0;
  if (G.player.car) {
    G.player.car = null;
    G.player.inCar = false;
  }
  // Drop the old mission cars and truck, then set the mission up again.
  G.worldCars.length = 0;
  G.truck = null;
  startMission(G, G.story.mission);
  if (G.save) G.save();
  return m;
}

function completeStep(G) {
  G.story.step++;
  const m = missionDef(G);
  if (G.story.step >= m.steps.length) {
    completeMission(G);
  }
}

function completeMission(G) {
  const m = missionDef(G);
  G.money += m.payout;
  G.respect += m.respect;
  G.stars = 0;
  if (G.fx) {
    addFloat(G.fx, G.player.x, G.player.y - 30, `+$${m.payout}`, '#ffd94e');
  }
  if (G.sound) G.sound.cash();
  if (G.story.mission >= MISSIONS.length - 1) {
    G.story.won = true;
    G.won = true;
    if (G.save) G.save();
    return;
  }
  startMission(G, G.story.mission + 1);
  if (G.save) G.save();
}

export function updateStory(G, dt) {
  if (G.story.won) return;
  const m = missionDef(G);
  const s = stepDef(G);
  if (!s) return;
  const p = G.player;

  // Mission 5's sports car: if it is wrecked or gone, a fresh one spawns.
  // (Not while the player is driving it — entering it takes it out of
  // worldCars, and respawning then would replace the car under them and
  // make the enterCar step uncompletable.)
  if (m.id === 'm5' && G.missionCar && G.player.car !== G.missionCar && (G.missionCar.health <= 0 || !G.worldCars.includes(G.missionCar))) {
    const d = placeById(G.city, 'dealership');
    const sports = makeCar('sports', d.x + 36, d.y + 26, Math.PI);
    sports.mission = true;
    G.missionCar = sports;
    G.worldCars.push(sports);
  }

  if (s.type === 'enterCar') {
    if (p.inCar && p.car) {
      if (!s.car || p.car === G.missionCar) completeStep(G);
    }
    return;
  }
  if (s.type === 'goto' || s.type === 'deliver') {
    const pt = stepPoint(G, s);
    if (!pt) return;
    const d = Math.hypot(p.x - pt.x, p.y - pt.y);
    // A delivery only counts in a car; a goto counts on foot too.
    if (d < (s.r || 60) && (s.type === 'goto' || p.inCar)) completeStep(G);
    return;
  }
  if (s.type === 'interact' || s.type === 'grab') {
    const pt = stepPoint(G, s);
    if (!pt) return;
    const d = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (d < (s.r || 44) && G.pressedE) {
      G.pressedE = false;
      if (s.type === 'grab') {
        // The bag count grows the wanted level as the job heats up.
        const done = G.story.data.bags || 0;
        G.story.data.bags = done + 1;
        G.stars = Math.min(5, 2 + done);
      }
      if (s.type === 'interact' && m.id === 'm6') G.stars = 3;
      if (s.type === 'interact' && m.id === 'm2') G.stars = 2;
      completeStep(G);
    }
    return;
  }
  if (s.type === 'survive') {
    if (G.story.data.timer === undefined) {
      G.story.data.timer = s.seconds;
      G.stars = m.stars;
    }
    G.story.data.timer -= dt;
    if (G.story.data.timer <= 0) completeStep(G);
    return;
  }
  if (s.type === 'ram') {
    if (G.truck && G.truck.ramHits >= s.hits) {
      G.stars = 5;
      completeStep(G);
    }
    return;
  }
}
