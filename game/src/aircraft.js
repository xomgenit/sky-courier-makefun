// The flight model: one sturdy courier plane flown by stick and throttle.
// Deliberately forgiving arcade physics with honest edges — she stalls if
// you haul the nose up slow, she sinks if the engine dies, and the gear
// only forgives a gentle arrival on the strip.

import { PLANE, RUNWAY } from './config.js';

export const TOUCH_NONE = 0;
export const TOUCH_LANDED = 1; // rolled out on the runway, still whole
export const TOUCH_CRASHED = 2; // arrived in a way the airframe disliked
export const TOUCH_DITCHED = 3; // met the water

/** A fresh plane parked at the west end of the strip, nose east, engine idling. */
export function createAircraft(terrain) {
  const startX = RUNWAY.centreX - RUNWAY.length / 2 + 60;
  return {
    x: startX,
    y: terrain.heightAt(startX, RUNWAY.centreZ),
    z: RUNWAY.centreZ,
    heading: Math.PI / 2, // east
    pitch: 0,
    roll: 0,
    speed: 0,
    verticalSpeed: 0,
    throttle: 0,
    fuel: PLANE.fuelCapacity,
    flaps: false,
    airborne: false,
    engineOut: false,
    propAngle: 0,
    touchdownSink: 0,
    touchdownSpeed: 0,
  };
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * Advance the plane one step. `controls` carries pitch (-1 nose down..1 up),
 * roll (-1 left..1 right), throttleDelta, brake and a flaps toggle edge.
 * Returns a TOUCH_* code when the ground (or water) settles the argument.
 */
export function stepAircraft(plane, controls, terrain, dt) {
  const groundY = terrain.heightAt(plane.x, plane.z);
  const stallSpeed = PLANE.stallSpeed * (plane.flaps ? 0.82 : 1);

  // Throttle and fuel: the engine drinks in proportion to the lever.
  plane.throttle = clamp(plane.throttle + controls.throttleDelta, 0, 1);
  if (!plane.engineOut) {
    const burn = PLANE.fuelBurnIdle + (PLANE.fuelBurnFull - PLANE.fuelBurnIdle) * plane.throttle;
    plane.fuel = Math.max(0, plane.fuel - burn * dt);
    if (plane.fuel <= 0) plane.engineOut = true;
  }
  plane.propAngle += dt * (plane.engineOut ? 1.5 : 6 + plane.throttle * 42);

  // Stick: pitch and roll chase the pilot's hands, with a little lag.
  const pitchTarget = controls.pitch * PLANE.maxPitch;
  const rollTarget = controls.roll * PLANE.maxRoll;
  plane.pitch += clamp(pitchTarget - plane.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
  plane.roll += clamp(rollTarget - plane.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);

  // Speed: thrust pulls toward the throttle's speed, climbing bleeds it,
  // diving feeds it, flaps and brakes scrub it.
  const thrustSpeed = plane.engineOut ? 0 : PLANE.idleSpeed + plane.throttle * (PLANE.maxSpeed - PLANE.idleSpeed);
  let accel = (thrustSpeed - plane.speed) * 0.45 - Math.sin(plane.pitch) * PLANE.gravity * 0.55;
  if (plane.flaps) accel -= plane.speed * 0.012;
  if (!plane.airborne && controls.brake) accel -= 14;
  plane.speed = Math.max(0, plane.speed + accel * dt);

  // Bank becomes turn; the slower she flies, the tighter she comes round.
  if (plane.airborne && plane.speed > 8) {
    plane.heading += (Math.tan(plane.roll) * PLANE.gravity * PLANE.turnGain * dt) / plane.speed;
  }

  // Lift: the wing holds her up in proportion to speed over the stall.
  // Short of the stall the nose drops on its own and she mushes downward.
  const lift = clamp((plane.speed - stallSpeed * 0.55) / (stallSpeed * 0.45), 0, 1);
  if (plane.airborne && lift < 0.45) plane.pitch -= dt * 0.9 * (0.45 - lift);
  const climb = Math.sin(plane.pitch) * plane.speed * lift - (1 - lift) * 7;
  plane.verticalSpeed = plane.airborne ? climb : 0;

  // Move along the heading.
  plane.x += Math.sin(plane.heading) * plane.speed * dt;
  plane.z -= Math.cos(plane.heading) * plane.speed * dt;
  if (plane.airborne) plane.y += plane.verticalSpeed * dt;

  // Ground handling: rotate when fast enough and pulled, settle when slow.
  if (!plane.airborne) {
    plane.y = groundY;
    plane.roll *= 0.8;
    if (plane.speed >= PLANE.rotateSpeed && plane.pitch > 0.08) {
      plane.airborne = true;
      plane.y = groundY + 0.5;
    }
    return TOUCH_NONE;
  }

  // Airborne: has the ground come up to meet her?
  const newGroundY = terrain.heightAt(plane.x, plane.z);
  const waterY = 2;
  if (plane.y <= waterY && newGroundY < waterY) {
    plane.y = waterY;
    return TOUCH_DITCHED;
  }
  if (plane.y <= newGroundY + 0.4) {
    plane.touchdownSink = plane.verticalSpeed;
    plane.touchdownSpeed = plane.speed;
    plane.y = newGroundY;
    const gentle = plane.verticalSpeed >= PLANE.safeSink && plane.speed <= PLANE.safeTouchSpeed;
    const upright = Math.abs(plane.roll) < 0.35;
    if (terrain.onRunway(plane.x, plane.z) && gentle && upright) {
      plane.airborne = false;
      plane.pitch = 0;
      plane.roll = 0;
      plane.verticalSpeed = 0;
      return TOUCH_LANDED;
    }
    return TOUCH_CRASHED;
  }
  return TOUCH_NONE;
}

/** Heading in degrees, 0 north, 90 east, always in 0..360 for the compass. */
export function headingDegrees(plane) {
  const deg = (plane.heading * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** The unit vector the nose points along, in world space. */
export function forwardVector(plane) {
  const cp = Math.cos(plane.pitch);
  return {
    x: Math.sin(plane.heading) * cp,
    y: Math.sin(plane.pitch),
    z: -Math.cos(plane.heading) * cp,
  };
}
