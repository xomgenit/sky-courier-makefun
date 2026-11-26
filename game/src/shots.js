// Screenshot scenes behind ?shot=takeoff|flight|ring|win. Each one flies
// the real game forward with a simple autopilot — steer at the target,
// hold the height, mind the speed — so the frame is what a genuine sortie
// looks like, and the same seed always gives the same frame.

import { PLANE, RINGS, RUNWAY, STEP } from './config.js';
import { stepAircraft } from './aircraft.js';
import { nextRing, stepWorld } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** One step of autopilot controls toward a target point. */
function autopilot(world, target, opts = {}) {
  const plane = world.plane;
  const desiredHeading = Math.atan2(target.x - plane.x, -(target.z - plane.z));
  const headingErr = wrapAngle(desiredHeading - plane.heading);
  const roll = clamp(headingErr * 1.5, -1, 1);
  let pitch;
  if (!plane.airborne) {
    pitch = plane.speed > PLANE.rotateSpeed + 4 ? 0.55 : 0;
  } else {
    const climbWanted = clamp((target.y - plane.y) * 0.09, -7, 9);
    // Feedforward the pitch that yields the wanted climb, then trim.
    const ff = Math.asin(clamp(climbWanted / Math.max(plane.speed, 25), -0.55, 0.55)) / PLANE.maxPitch;
    pitch = clamp(ff + (climbWanted - plane.verticalSpeed) * 0.06, -1, 1);
  }
  const cruise = opts.cruise ?? 0.88;
  let throttleDelta = 0;
  // Ease off as the target nears: a slower plane turns tighter, so the
  // pursuit converges on the ring instead of orbiting it.
  const dist = Math.hypot(target.x - plane.x, target.z - plane.z);
  const nearCruise = dist > 600 ? cruise : dist > 260 ? 0.58 : 0.44;
  const wanted = plane.airborne ? nearCruise : 1;
  if (plane.throttle < wanted - 0.02) throttleDelta = 0.05;
  else if (plane.throttle > wanted + 0.02) throttleDelta = -0.05;
  return { pitch, roll, throttleDelta, brake: Boolean(opts.brake) };
}

function fly(world, seconds, controlsFor) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, controlsFor(world), STEP);
    if (world.phase === 'won' || world.phase === 'lost') break;
  }
}

/** Fly the whole course, then line up west of the strip and land east. */
function flyFullSortie(world) {
  const maxSteps = Math.round(560 / STEP);
  const approach = { x: RUNWAY.centreX - RUNWAY.length / 2 - 900, y: world.terrain.fieldHeight + 135, z: RUNWAY.centreZ };
  const threshold = { x: RUNWAY.centreX - RUNWAY.length / 2 + 120, y: world.terrain.fieldHeight + 1, z: RUNWAY.centreZ };
  let stage = 'course';
  let courseWp = 0; // 0 = approach gate, 1 = exit gate past the ring
  let courseRing = -1; // ring the waypoint state belongs to
  for (let i = 0; i < maxSteps; i += 1) {
    const plane = world.plane;
    let controls;
    if (stage === 'course') {
      const ring = nextRing(world);
      if (ring) {
        if (courseRing !== world.ringIndex) {
          courseRing = world.ringIndex;
          courseWp = 0;
        }
        // Fly gate -> ring -> exit gate on one straight line, so the
        // pursuit passes through the ring instead of orbiting it.
        const prev = world.ringIndex === 0
          ? { x: RUNWAY.centreX, z: RUNWAY.centreZ }
          : RINGS[world.ringIndex - 1];
        const dx = ring.x - prev.x;
        const dz = ring.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len;
        const uz = dz / len;
        const gate = { x: ring.x - ux * 280, y: ring.y, z: ring.z - uz * 280 };
        const exit = { x: ring.x + ux * 280, y: ring.y, z: ring.z + uz * 280 };
        const wp = courseWp === 0 ? gate : exit;
        const toWpX = wp.x - plane.x;
        const toWpZ = wp.z - plane.z;
        const distWp = Math.hypot(toWpX, toWpZ);
        const passedWp = toWpX * ux + toWpZ * uz < 0;
        if (distWp < 85 || passedWp) {
          // Past the exit without threading the ring: go round again.
          courseWp = courseWp === 0 ? 1 : 0;
        }
        controls = autopilot(world, courseWp === 0 ? gate : exit);
      } else {
        stage = 'approach';
        controls = autopilot(world, approach);
      }
    } else if (stage === 'approach') {
      const d = Math.hypot(plane.x - approach.x, plane.z - approach.z);
      if (d < 220) stage = 'final';
      controls = autopilot(world, approach);
    } else if (stage === 'final') {
      plane.flaps = true;
      // Follow a 3.5-degree glide slope down to the threshold: the target
      // height falls with distance to run, and the sink rate matches it.
      const distToThreshold = Math.max(0, threshold.x - plane.x);
      const glideY = threshold.y + distToThreshold * 0.062;
      const sinkWanted = clamp(-plane.speed * 0.062 + (glideY - plane.y) * 0.12, -3.4, 1.5);
      const ff = Math.asin(clamp(sinkWanted / Math.max(plane.speed, 25), -0.55, 0.55)) / PLANE.maxPitch;
      const pitch = clamp(ff + (sinkWanted - plane.verticalSpeed) * 0.08, -1, 1);
      const headingErr = wrapAngle(Math.PI / 2 - plane.heading);
      const roll = clamp(headingErr * 1.5 + (RUNWAY.centreZ - plane.z) * 0.01, -1, 1);
      let throttleDelta = 0;
      if (plane.speed > 46) throttleDelta = -0.04;
      else if (plane.speed < 40) throttleDelta = 0.04;
      controls = { pitch, roll, throttleDelta, brake: false };
      if (!plane.airborne) stage = 'rollout';
      // Floated past the far end still flying: go around and try again.
      else if (plane.x > RUNWAY.centreX + RUNWAY.length / 2 - 60) stage = 'approach';
    } else {
      controls = { pitch: 0, roll: 0, throttleDelta: -0.05, brake: true };
      if (plane.speed < 0.5) break;
    }
    stepWorld(world, controls, STEP);
    if (world.phase === 'won' || world.phase === 'lost') break;
  }
}

/** Put the plane in the air at a chosen spot, already at flying speed. */
function placeAirborne(world, x, y, z, heading, speed = 58) {
  const plane = world.plane;
  plane.x = x;
  plane.y = y;
  plane.z = z;
  plane.heading = heading;
  plane.pitch = 0;
  plane.roll = 0;
  plane.speed = speed;
  plane.throttle = 0.72;
  plane.airborne = true;
  world.phase = 'flying';
}

/**
 * Stage the named scene in `world` and return the screen to draw.
 * flight = the cover: mid-course over the lake, ring ahead, HUD lit.
 */
export function stageShot(name, world) {
  if (name === 'title') {
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'takeoff') {
    fly(world, 5.6, (w) => autopilot(w, RINGS[0]));
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'ring') {
    // Banking onto the summit ring, close enough that it fills the view.
    world.ringIndex = 3;
    world.ringsDone = 3;
    world.score = 3000;
    placeAirborne(world, 420, 498, -1080, Math.atan2(120 - 420, -(-1420 + 1080)));
    fly(world, 5.2, (w) => autopilot(w, RINGS[3]));
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'win') {
    flyFullSortie(world);
    // Let her roll out and stop on the strip for the portrait. The sortie
    // is already won, so step the airframe directly (stepWorld is done).
    if (world.phase === 'won') {
      for (let i = 0; i < 60 * 14 && world.plane.speed > 0.4; i += 1) {
        stepAircraft(world.plane, { pitch: 0, roll: 0, throttleDelta: -0.05, brake: true }, world.terrain, STEP);
      }
    }
    return { screen: SCREEN_OVER, best: 0 };
  }
  // flight (the cover): eastbound over the lake toward the second ring,
  // caught mid-bank as she turns onto it.
  world.ringIndex = 1;
  world.ringsDone = 1;
  world.score = 1000;
  placeAirborne(world, 700, 212, 260, Math.atan2(1250 - 700, -(-180 - 260)) + 0.5);
  fly(world, 7.6, (w) => autopilot(w, RINGS[1]));
  return { screen: SCREEN_PLAY, best: 0 };
}
