// The island itself: a heightfield built from layered value noise, shaped
// into one landmass with a lake basin, a northern ridge and a flat meadow
// where the runway sits. Also owns the scatter — trees, farmhouses and
// clouds placed once from the seed — and the height lookup the flight
// model collides against.

import { RUNWAY, WORLD } from './config.js';

const NOISE_CELLS = 96; // lattice resolution for the value noise

/** Build the terrain for a seed: height grid, scatter lists, height lookup. */
export function createTerrain(random) {
  const lattice = [];
  for (let i = 0; i < (NOISE_CELLS + 1) * (NOISE_CELLS + 1); i += 1) lattice.push(random.next());

  function latticeAt(ix, iz) {
    const x = ((ix % NOISE_CELLS) + NOISE_CELLS) % NOISE_CELLS;
    const z = ((iz % NOISE_CELLS) + NOISE_CELLS) % NOISE_CELLS;
    return lattice[z * (NOISE_CELLS + 1) + x];
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function noiseAt(x, z, scale) {
    const gx = (x / WORLD.size + 0.5) * scale;
    const gz = (z / WORLD.size + 0.5) * scale;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = smooth(gx - ix);
    const fz = smooth(gz - iz);
    const a = latticeAt(ix, iz);
    const b = latticeAt(ix + 1, iz);
    const c = latticeAt(ix, iz + 1);
    const d = latticeAt(ix + 1, iz + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  // Raw island shape before the airfield is flattened into it.
  function rawHeight(x, z) {
    const nx = x / (WORLD.size / 2);
    const nz = z / (WORLD.size / 2);
    const dist = Math.sqrt(nx * nx + nz * nz);
    const falloff = Math.max(0, 1 - Math.pow(dist, 2.6));
    let h = noiseAt(x, z, 6) * 190 + noiseAt(x, z, 14) * 70 + noiseAt(x, z, 32) * 18;
    h *= falloff;
    // A ridge across the north and a summit the course flies over.
    const ridge = Math.exp(-Math.pow((z + 1150) / 420, 2)) * 150 * falloff;
    const summit = Math.exp(-((x - 120) ** 2 + (z + 1420) ** 2) / (2 * 380 ** 2)) * 210;
    // A lake basin in the east the second ring hangs over.
    const lake = Math.exp(-((x - 1250) ** 2 + (z + 180) ** 2) / (2 * 460 ** 2)) * 130;
    return h + ridge + summit - lake - 6;
  }

  const fieldHeight = rawHeight(RUNWAY.centreX, RUNWAY.centreZ);

  /** Ground height at a point, with the airfield meadow ironed flat. */
  function heightAt(x, z) {
    let h = rawHeight(x, z);
    const dx = Math.abs(x - RUNWAY.centreX);
    const dz = Math.abs(z - RUNWAY.centreZ);
    const flatX = RUNWAY.length / 2 + 260;
    const flatZ = RUNWAY.width / 2 + 190;
    if (dx < flatX && dz < flatZ) {
      const tx = 1 - Math.max(0, (dx - RUNWAY.length / 2) / 260);
      const tz = 1 - Math.max(0, (dz - RUNWAY.width / 2) / 190);
      const blend = Math.min(1, Math.min(tx, tz) * 1.6);
      h = h * (1 - blend) + fieldHeight * blend;
    }
    return h;
  }

  /** True when a point sits on the runway strip itself. */
  function onRunway(x, z) {
    return (
      Math.abs(x - RUNWAY.centreX) <= RUNWAY.length / 2 &&
      Math.abs(z - RUNWAY.centreZ) <= RUNWAY.width / 2
    );
  }

  // Scatter: pines on the slopes, farmhouses near the meadow, clouds aloft.
  const trees = [];
  for (let i = 0; i < 900 && trees.length < 340; i += 1) {
    const x = random.range(-WORLD.size / 2, WORLD.size / 2);
    const z = random.range(-WORLD.size / 2, WORLD.size / 2);
    const h = heightAt(x, z);
    if (h < WORLD.waterLevel + 4 || h > 300 || onRunway(x, z)) continue;
    if (Math.abs(z - RUNWAY.centreZ) < 120 && Math.abs(x - RUNWAY.centreX) < RUNWAY.length / 2 + 80) continue;
    trees.push({ x, z, y: h, size: random.range(7, 13) });
  }

  const houses = [];
  const houseSpots = [
    [-520, 640], [-430, 700], [480, 660], [560, 600], [-180, 760], [240, 780],
    [-980, 180], [1040, 240], [-760, -640], [860, -760], [60, -980], [-1240, 420],
  ];
  for (const [x, z] of houseSpots) {
    const h = heightAt(x, z);
    if (h > WORLD.waterLevel + 2) houses.push({ x, z, y: h, turn: random.range(0, Math.PI) });
  }

  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: random.range(-WORLD.size / 2, WORLD.size / 2),
      z: random.range(-WORLD.size / 2, WORLD.size / 2),
      y: random.range(520, 700),
      size: random.range(90, 190),
    });
  }

  return { heightAt, onRunway, fieldHeight, trees, houses, clouds };
}
