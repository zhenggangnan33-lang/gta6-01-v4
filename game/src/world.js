// Verde Bay: the city itself. A seeded road grid with blocks of buildings,
// parks and parking lots, a beach and marina on the east edge, named places,
// hidden cash stashes, and the road graph every driver (traffic, police and
// the autopilot) routes on. Pure data: buildCity(seed) returns a plain
// object; nothing here touches the canvas or the game loop.

import { makeRng } from './rng.js';

export const WORLD_W = 2560;
export const WORLD_H = 1920;

// North-south avenues and east-west streets. Roads are 52px wide.
export const AVENUES = [200, 520, 840, 1160, 1480, 1800, 2120];
export const STREETS = [200, 520, 840, 1160, 1480];
export const COAST_X = 2320; // coastal road along the beach
export const COAST_TOP = 200;
export const COAST_BOTTOM = 1700; // marina end
export const ROAD_HALF = 26;

const BUILDING_COLORS = [
  '#c98f5f', '#b97a6b', '#8fa8bf', '#a8b08a', '#c2a878',
  '#9a8fc2', '#7fb0a0', '#d0a0a0', '#8fb0c2', '#b5a06a',
];
const ROOF_COLORS = ['#7a5a44', '#5f6a7a', '#6a7a5f', '#8a6a5a'];

// Named places. Each marker sits ON a road so any driver can reach it; the
// building it belongs to stands in the block beside the marker.
const PLACE_DEFS = [
  { id: 'garage', label: 'Vega Motors', x: 1160, y: 1000, kind: 'garage' },
  { id: 'bank', label: 'Meridian Bank', x: 840, y: 500, kind: 'bank' },
  { id: 'cafe', label: 'Café Luna', x: 1480, y: 500, kind: 'cafe' },
  { id: 'hotel', label: 'Hotel Miramar', x: 2120, y: 500, kind: 'hotel' },
  { id: 'dealership', label: 'Cometa Motors', x: 2120, y: 1140, kind: 'dealer' },
  { id: 'jewellers', label: 'Casa Diamante', x: 1800, y: 820, kind: 'jewels' },
  { id: 'casino', label: 'Casino Sol', x: 1800, y: 1460, kind: 'casino' },
  { id: 'plaza', label: 'Palma Plaza', x: 1160, y: 500, kind: 'plaza' },
  { id: 'chopshop', label: 'Chop Shop', x: 520, y: 820, kind: 'chop' },
  { id: 'stadium', label: 'Verde Stadium', x: 520, y: 1460, kind: 'stadium' },
  { id: 'docks', label: 'The Docks', x: 2320, y: 1480, kind: 'docks' },
  { id: 'yacht', label: 'Yacht La Rosa', x: 2340, y: 1680, kind: 'yacht' },
  { id: 'beach', label: 'Verde Beach', x: 2380, y: 900, kind: 'beach' },
];

// Ten hidden cash stashes on sidewalks, just off the roads.
const STASH_POINTS = [
  [246, 246], [566, 886], [886, 1246], [1206, 246], [1526, 886],
  [1846, 246], [2166, 886], [566, 1526], [1206, 1526], [2366, 640],
];

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const parks = [];
  const lots = [];
  const trees = [];
  const beachProps = [];

  // Blocks sit between neighbouring roads. Each block becomes buildings, a
  // park, or a parking lot, with a sidewalk margin left walkable.
  const xs = [0, ...AVENUES, WORLD_W];
  const ys = [0, ...STREETS, WORLD_H];
  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < ys.length - 1; bj++) {
      const x0 = xs[bi] + ROAD_HALF + 14;
      const x1 = xs[bi + 1] - ROAD_HALF - 14;
      const y0 = ys[bj] + ROAD_HALF + 14;
      const y1 = ys[bj + 1] - ROAD_HALF - 14;
      // The far-east strip is the beach, not blocks.
      if (x0 > 2240) continue;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      const roll = rng.next();
      if (roll < 0.16) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const n = rng.int(3, 7);
        for (let i = 0; i < n; i++) {
          trees.push({ x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20), r: rng.range(9, 16) });
        }
      } else if (roll < 0.28) {
        lots.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      } else {
        const cols = rng.int(1, 2);
        const rows = rng.int(1, 2);
        const cw = (x1 - x0) / cols;
        const ch = (y1 - y0) / rows;
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const bw = cw * rng.range(0.55, 0.8);
            const bh = ch * rng.range(0.55, 0.8);
            const bx = x0 + c * cw + (cw - bw) / 2;
            const by = y0 + r * ch + (ch - bh) / 2;
            buildings.push({
              x: bx, y: by, w: bw, h: bh,
              color: rng.pick(BUILDING_COLORS),
              roof: rng.pick(ROOF_COLORS),
              tall: rng.chance(0.3),
            });
          }
        }
      }
    }
  }

  // Beach props: umbrellas and palms along the sand.
  for (let i = 0; i < 14; i++) {
    const y = 260 + i * 100 + rng.range(-20, 20);
    beachProps.push({
      x: rng.range(2360, 2440), y,
      kind: rng.chance(0.5) ? 'umbrella' : 'palm',
      color: rng.pick(['#e86a8a', '#f2c14e', '#4ea8de', '#e86a4e']),
    });
  }

  // The road graph: a node at every intersection, edges along each road.
  const nodes = [];
  const nodeIndex = new Map();
  function addNode(x, y) {
    const key = `${x},${y}`;
    if (nodeIndex.has(key)) return nodeIndex.get(key);
    const i = nodes.length;
    nodes.push({ x, y });
    nodeIndex.set(key, i);
    return i;
  }
  const edges = [];
  function link(a, b) {
    edges.push([a, b]);
  }
  for (const ax of AVENUES) {
    let prev = -1;
    for (const sy of STREETS) {
      const n = addNode(ax, sy);
      if (prev >= 0) link(prev, n);
      prev = n;
    }
  }
  for (const sy of STREETS) {
    let prev = -1;
    for (const ax of [...AVENUES, COAST_X]) {
      const n = addNode(ax, sy);
      if (prev >= 0) link(prev, n);
      prev = n;
    }
  }
  // Coastal road runs past the last street down to the marina.
  let prev = addNode(COAST_X, STREETS[STREETS.length - 1]);
  const marina = addNode(COAST_X, COAST_BOTTOM);
  link(prev, marina);

  // Adjacency for routing.
  const adj = nodes.map(() => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }

  const places = PLACE_DEFS.map((p) => ({ ...p }));
  const stashes = STASH_POINTS.map(([x, y], i) => ({ id: i, x, y, taken: false }));

  // Collision solids: buildings only (parks, lots and beach are open).
  const solids = buildings.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));

  return {
    seed, buildings, parks, lots, trees, beachProps,
    places, stashes, solids, nodes, edges, adj,
  };
}

// Breadth-first route on the road graph between two nodes. Returns a list
// of node indices, or null when unreachable.
export function findRoute(city, from, to) {
  if (from === to) return [from];
  const prev = new Array(city.nodes.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of city.adj[cur]) {
      if (prev[nb] === -1) {
        prev[nb] = cur;
        if (nb === to) {
          const path = [to];
          let n = to;
          while (n !== from) {
            n = prev[n];
            path.push(n);
          }
          return path.reverse();
        }
        queue.push(nb);
      }
    }
  }
  return null;
}

// Nearest graph node to a world point.
export function nearestNode(city, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < city.nodes.length; i++) {
    const dx = city.nodes[i].x - x;
    const dy = city.nodes[i].y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function placeById(city, id) {
  return city.places.find((p) => p.id === id);
}
