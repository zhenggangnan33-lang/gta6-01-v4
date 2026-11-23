// Seeded random numbers for VERDE BAY. Everything the city generates, every
// traffic spawn and every pedestrian, comes from this one stream, so a fixed
// seed (23) always builds the same city. Written from scratch for this entry.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A small helper object so callers read naturally: rng.range(a, b),
// rng.int(a, b), rng.pick(list), rng.chance(p).
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(lo, hi) {
      return lo + next() * (hi - lo);
    },
    int(lo, hi) {
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
  };
}
