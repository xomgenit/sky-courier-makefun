// The sortie: take off from the meadow strip, thread eight delivery rings
// in order around the island, then bring her home and land before the
// tank runs dry. This module owns the mission state and the score; the
// flight model lives in aircraft.js and the island in terrain.js.

import { PLANE, RINGS, SCORE } from './config.js';
import {
  TOUCH_CRASHED,
  TOUCH_DITCHED,
  TOUCH_LANDED,
  createAircraft,
  stepAircraft,
} from './aircraft.js';

export const PHASE_READY = 'ready'; // on the strip, engine idling
export const PHASE_FLYING = 'flying';
export const PHASE_WON = 'won';
export const PHASE_LOST = 'lost';

export const EVENT_RING = 1;
export const EVENT_COURSE_DONE = 2;
export const EVENT_WON = 4;
export const EVENT_LOST = 8;

/** A fresh sortie: plane on the strip, all rings waiting, clock at zero. */
export function createWorld(terrain) {
  return {
    terrain,
    plane: createAircraft(terrain),
    phase: PHASE_READY,
    ringIndex: 0, // the next ring to thread
    ringsDone: 0,
    score: 0,
    time: 0,
    landedOnce: false,
    landingQuality: '',
    failReason: '',
    message: '',
    messageTime: 0,
  };
}

/** The ring the pilot should be aiming at, or null when the course is done. */
export function nextRing(world) {
  return world.ringIndex < RINGS.length ? RINGS[world.ringIndex] : null;
}

function setMessage(world, text) {
  world.message = text;
  world.messageTime = 3.2;
}

/**
 * Advance the sortie one fixed step under `controls`.
 * Returns a bitmask of EVENT_* flags for the shell to react to.
 */
export function stepWorld(world, controls, dt) {
  let events = 0;
  const plane = world.plane;
  if (world.phase === PHASE_WON || world.phase === PHASE_LOST) return events;

  if (world.messageTime > 0) world.messageTime -= dt;
  if (plane.airborne) world.time += dt;
  if (world.phase === PHASE_READY && plane.airborne) world.phase = PHASE_FLYING;

  const touch = stepAircraft(plane, controls, world.terrain, dt);

  // Ring threading: passing within the ring's radius of its centre counts,
  // which reads fairly at speed and forgives a wingtip's width of error.
  const ring = nextRing(world);
  if (ring && plane.airborne) {
    const dx = plane.x - ring.x;
    const dy = plane.y - ring.y;
    const dz = plane.z - ring.z;
    if (dx * dx + dy * dy + dz * dz < ring.radius * ring.radius) {
      world.ringsDone += 1;
      world.ringIndex += 1;
      world.score += SCORE.perRing;
      events |= EVENT_RING;
      if (world.ringIndex >= RINGS.length) {
        events |= EVENT_COURSE_DONE;
        setMessage(world, 'ALL DELIVERIES MADE — LAND AT HOME STRIP');
      } else {
        setMessage(world, `DELIVERY ${world.ringsDone} OF ${RINGS.length} — NEXT RING LIT`);
      }
    }
  }

  if (touch === TOUCH_LANDED) {
    world.landedOnce = true;
    const sink = plane.touchdownSink;
    if (world.ringIndex >= RINGS.length) {
      // Home with every parcel delivered: settle the score and finish.
      const smooth = sink >= -2.2;
      world.landingQuality = smooth ? 'GREASED IT' : 'FIRM ARRIVAL';
      world.score += smooth ? SCORE.smoothLanding : SCORE.firmLanding;
      world.score += Math.max(0, Math.round((SCORE.parTimeSeconds - world.time) * SCORE.timeBonusPerSecondLeft));
      world.score += Math.round(plane.fuel * SCORE.fuelBonusPerUnit);
      world.phase = PHASE_WON;
      events |= EVENT_WON;
    } else if (plane.speed < 2) {
      // Touched down early with deliveries outstanding: she can roll again.
      setMessage(world, 'DOWN EARLY — DELIVERIES REMAIN, TAKE OFF AGAIN');
    }
  } else if (touch === TOUCH_CRASHED) {
    world.phase = PHASE_LOST;
    world.failReason = plane.touchdownSink < PLANE.safeSink
      ? 'Came down too hard — the gear folded.'
      : plane.touchdownSpeed > PLANE.safeTouchSpeed
        ? 'Touched down far too fast and ran out of strip.'
        : 'Met the hillside. The island always wins that argument.';
    events |= EVENT_LOST;
  } else if (touch === TOUCH_DITCHED) {
    world.phase = PHASE_LOST;
    world.failReason = 'Ditched in the lake. The parcels are soggy.';
    events |= EVENT_LOST;
  }

  return events;
}

/** A letter grade for a finished sortie, S for the courier legends. */
export function gradeForScore(score) {
  if (score >= 11500) return 'S';
  if (score >= 10000) return 'A';
  if (score >= 8500) return 'B';
  if (score >= 7000) return 'C';
  return 'D';
}
