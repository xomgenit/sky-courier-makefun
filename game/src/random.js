// A tiny seeded random generator (mulberry32) so the island, the trees and
// the clouds come out the same on every load — and so screenshot scenes are
// reproducible frame for frame.

export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range(low, high) {
      return low + next() * (high - low);
    },
    pick(list) {
      return list[Math.floor(next() * list.length) % list.length];
    },
  };
}
