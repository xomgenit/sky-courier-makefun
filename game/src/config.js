// Sky Courier — shared constants: the island, the runway, the aeroplane's
// numbers, and the ring course. Every other module reads from here so the
// flight model, the renderer and the mission logic always agree.

// The island is a square of terrain centred on the origin, in metres.
// X grows east, Z grows south, Y is up. Heading 0 is north (-Z), 90 east.
export const WORLD = {
  size: 4800, // metres across, edge to edge
  waterLevel: 2, // sea level; terrain below this is lake or shore
  gridStep: 60, // terrain mesh spacing the renderer draws
};

// The home airfield: a single east-west strip on the south meadow.
export const RUNWAY = {
  centreX: 0,
  centreZ: 420,
  length: 760,
  width: 46,
  headingDeg: 90, // take off and land towards the east
};

// The courier plane: a sturdy little single-engine hauler.
export const PLANE = {
  maxSpeed: 92, // m/s at full throttle, level
  idleSpeed: 24, // m/s the engine holds at idle
  stallSpeed: 30, // below this the wing stops holding her up
  rotateSpeed: 34, // speed at which she will lift off the strip
  maxPitch: 0.62, // radians, nose up or down
  maxRoll: 1.15, // radians of bank
  pitchRate: 0.85, // radians per second at full stick
  rollRate: 1.7,
  turnGain: 0.85, // how eagerly bank becomes a turn
  gravity: 9.81,
  fuelCapacity: 100,
  fuelBurnIdle: 0.08, // units per second at idle
  fuelBurnFull: 0.27, // units per second at full throttle
  safeSink: -5.5, // gentlest touchdown the gear forgives, m/s
  safeTouchSpeed: 58, // fastest touchdown the gear forgives, m/s
};

// The delivery course: eight rings to thread, in order, then land home.
// Positions are hand-placed over the island's landmarks so the route reads
// as a tour: meadow, lake, ridge, harbour, summit, valley, coast, home.
export const RINGS = [
  { x: 620, y: 162, z: 420, radius: 34 },
  { x: 1250, y: 210, z: -180, radius: 34 },
  { x: 980, y: 330, z: -980, radius: 32 },
  { x: 120, y: 475, z: -1420, radius: 32 },
  { x: -760, y: 360, z: -1080, radius: 32 },
  { x: -1320, y: 240, z: -260, radius: 34 },
  { x: -1080, y: 170, z: 640, radius: 34 },
  { x: -420, y: 168, z: 520, radius: 36 },
];

// Scoring: each ring is a delivery made; the rest rewards a quick,
// fuel-thrifty sortie and a greased landing.
export const SCORE = {
  perRing: 1000,
  timeBonusPerSecondLeft: 6,
  parTimeSeconds: 420,
  fuelBonusPerUnit: 12,
  smoothLanding: 800,
  firmLanding: 350,
};

export const STEP = 1 / 60; // fixed simulation step, seconds
export const BEST_KEY = 'sky-courier-best';
