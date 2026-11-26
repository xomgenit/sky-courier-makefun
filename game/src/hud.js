// The instrument panel: everything a pilot reads at a glance, drawn as lit
// glass over the 3D view — compass ribbon, airspeed and altitude with big
// digital readouts, an artificial horizon, throttle and fuel gauges, the
// delivery tally, and a guidance marker that always points at the next
// ring. Also owns the title, pause, win and crash screens.

import { PLANE, RINGS, RUNWAY } from './config.js';
import { headingDegrees } from './aircraft.js';
import { PHASE_LOST, PHASE_WON, gradeForScore, nextRing } from './world.js';

const PANEL = 'rgba(10, 18, 24, 0.72)';
const PANEL_EDGE = 'rgba(120, 220, 170, 0.55)';
const LIT = '#8dffb0';
const AMBER = '#ffc65c';
const WHITE = '#f2f7fa';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL;
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function text(ctx, value, x, y, size, color, align = 'left', weight = '700') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
}

/** Compass ribbon across the top: ticks, cardinals, current heading boxed. */
function drawCompass(ctx, plane, width) {
  const hdg = headingDegrees(plane);
  const w = Math.min(460, width * 0.46);
  const x = width / 2 - w / 2;
  panel(ctx, x, 12, w, 40);
  const pxPerDeg = w / 90;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 4, 14, w - 8, 36);
  ctx.clip();
  for (let deg = -60; deg <= 60; deg += 5) {
    const value = (((Math.round(hdg / 5) * 5 + deg) % 360) + 360) % 360;
    let offset = value - hdg;
    if (offset > 180) offset -= 360;
    if (offset < -180) offset += 360;
    const tx = width / 2 + offset * pxPerDeg;
    if (tx < x || tx > x + w) continue;
    const major = value % 30 === 0;
    ctx.strokeStyle = major ? WHITE : 'rgba(242,247,250,0.5)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(tx, 40);
    ctx.lineTo(tx, major ? 28 : 34);
    ctx.stroke();
    if (major) {
      const label = value === 0 ? 'N' : value === 90 ? 'E' : value === 180 ? 'S' : value === 270 ? 'W' : String(value / 10).padStart(2, '0');
      text(ctx, label, tx, 21, 12, value % 90 === 0 ? AMBER : WHITE, 'center');
    }
  }
  ctx.restore();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 7, 12);
  ctx.lineTo(width / 2 + 7, 12);
  ctx.lineTo(width / 2, 22);
  ctx.closePath();
  ctx.fill();
  text(ctx, `HDG ${String(Math.round(hdg)).padStart(3, '0')}°`, width / 2, 64, 15, LIT, 'center');
}

/** Airspeed on the left, altitude on the right — tapes with big digits. */
function drawSpeedAndAltitude(ctx, plane, width, height) {
  const knots = plane.speed * 1.944;
  const feet = Math.max(0, plane.y) * 3.281;
  const midY = height / 2;

  panel(ctx, 14, midY - 86, 104, 172);
  text(ctx, 'SPD KT', 66, midY - 68, 12, AMBER, 'center');
  text(ctx, String(Math.round(knots)), 66, midY - 38, 34, LIT, 'center');
  for (let v = Math.floor((knots - 40) / 10) * 10; v <= knots + 40; v += 10) {
    if (v < 0) continue;
    const ty = midY + 12 + (knots - v) * 1.1;
    if (ty < midY - 14 || ty > midY + 76) continue;
    ctx.strokeStyle = 'rgba(242,247,250,0.6)';
    ctx.beginPath();
    ctx.moveTo(26, ty);
    ctx.lineTo(40, ty);
    ctx.stroke();
    text(ctx, String(v), 46, ty, 10, WHITE, 'left', '400');
  }
  if (knots < PLANE.stallSpeed * 1.944 * 1.25 && plane.airborne) {
    text(ctx, 'STALL', 66, midY + 62, 14, '#ff7a6b', 'center');
  }

  panel(ctx, width - 118, midY - 86, 104, 172);
  text(ctx, 'ALT FT', width - 66, midY - 68, 12, AMBER, 'center');
  text(ctx, String(Math.round(feet)), width - 66, midY - 38, 30, LIT, 'center');
  for (let v = Math.floor((feet - 400) / 100) * 100; v <= feet + 400; v += 100) {
    if (v < 0) continue;
    const ty = midY + 12 + (feet - v) * 0.11;
    if (ty < midY - 14 || ty > midY + 76) continue;
    ctx.strokeStyle = 'rgba(242,247,250,0.6)';
    ctx.beginPath();
    ctx.moveTo(width - 40, ty);
    ctx.lineTo(width - 26, ty);
    ctx.stroke();
    text(ctx, String(v), width - 46, ty, 10, WHITE, 'right', '400');
  }
  const vs = plane.verticalSpeed;
  text(ctx, `${vs >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(vs * 196.85))}`, width - 66, midY + 62, 12, vs >= 0 ? LIT : '#ff9d8a', 'center');
}

/** Artificial horizon: a little ball that stays honest in a bank. */
function drawHorizon(ctx, plane, height) {
  const cx = 86;
  const cy = height - 86;
  const r = 58;
  panel(ctx, cx - r - 10, cy - r - 10, (r + 10) * 2, (r + 10) * 2);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll);
  const pitchPx = plane.pitch * r * 1.1;
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-r * 1.6, -r * 1.6 + pitchPx, r * 3.2, r * 1.6);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(-r * 1.6, pitchPx, r * 3.2, r * 1.6);
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 1.6, pitchPx);
  ctx.lineTo(r * 1.6, pitchPx);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy);
  ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy);
  ctx.lineTo(cx + 26, cy);
  ctx.stroke();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** Throttle lever and fuel gauge, bottom right. */
function drawEngineGauges(ctx, plane, width, height) {
  const x = width - 196;
  const y = height - 96;
  panel(ctx, x, y, 182, 82);
  text(ctx, 'THR', x + 14, y + 20, 12, AMBER, 'left');
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x + 52, y + 13, 116, 14);
  ctx.fillStyle = LIT;
  ctx.fillRect(x + 52, y + 13, 116 * plane.throttle, 14);
  text(ctx, `${Math.round(plane.throttle * 100)}%`, x + 110, y + 20, 12, WHITE, 'center');
  text(ctx, 'FUEL', x + 14, y + 50, 12, AMBER, 'left');
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x + 52, y + 43, 116, 14);
  const fuelT = plane.fuel / PLANE.fuelCapacity;
  ctx.fillStyle = fuelT < 0.18 ? '#ff7a6b' : fuelT < 0.4 ? AMBER : LIT;
  ctx.fillRect(x + 52, y + 43, 116 * fuelT, 14);
  text(ctx, plane.flaps ? 'FLAPS DOWN' : '', x + 91, y + 70, 11, AMBER, 'center');
}

/** Delivery tally, score and clock, top left. */
function drawMissionTally(ctx, world) {
  panel(ctx, 14, 12, 196, 84);
  text(ctx, `RINGS ${world.ringsDone}/${RINGS.length}`, 26, 32, 17, LIT, 'left');
  text(ctx, `SCORE ${world.score}`, 26, 56, 15, WHITE, 'left');
  const mins = Math.floor(world.time / 60);
  const secs = Math.floor(world.time % 60);
  text(ctx, `TIME ${mins}:${String(secs).padStart(2, '0')}`, 26, 78, 13, AMBER, 'left');
}

/** A marker on the next ring, or an edge arrow when it is off-screen. */
function drawRingGuidance(ctx, world, view) {
  if (world.phase === PHASE_WON || world.phase === PHASE_LOST) return;
  if (view.screen === 'title' || view.screen === 'over') return;
  const ring = nextRing(world);
  const target = ring ?? { x: RUNWAY.centreX, y: world.terrain.fieldHeight + 40, z: RUNWAY.centreZ };
  const p = view.project(target);
  const plane = world.plane;
  const dist = Math.round(Math.hypot(plane.x - target.x, plane.y - target.y, plane.z - target.z));
  const label = ring ? `RING ${world.ringIndex + 1} · ${dist}m` : `HOME STRIP · ${dist}m`;
  if (p && p.x > -40 && p.x < view.width + 40 && p.y > -40 && p.y < view.height + 40) {
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.stroke();
    text(ctx, label, p.x, p.y - 28, 13, AMBER, 'center');
    return;
  }
  // Off-screen: clamp an arrow to the edge pointing the way.
  const bearing = Math.atan2(target.x - plane.x, -(target.z - plane.z));
  let rel = bearing - plane.heading;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  const edgeX = view.width / 2 + Math.sin(rel) * (view.width / 2 - 60);
  const edgeY = 110;
  ctx.fillStyle = AMBER;
  ctx.save();
  ctx.translate(edgeX, edgeY);
  ctx.rotate(rel);
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(10, 8);
  ctx.lineTo(-10, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  text(ctx, label, edgeX, edgeY + 26, 12, AMBER, 'center');
}

/** Warnings and the mission banner. */
function drawWarnings(ctx, world, view, now) {
  const plane = world.plane;
  const blink = Math.floor(now / 420) % 2 === 0;
  const warnings = [];
  if (plane.engineOut) warnings.push('ENGINE OUT — GLIDE HOME');
  else if (plane.fuel < 18) warnings.push('LOW FUEL');
  if (plane.airborne && plane.speed < PLANE.stallSpeed * (plane.flaps ? 0.82 : 1)) warnings.push('STALL');
  if (warnings.length && blink) {
    text(ctx, warnings.join('   '), view.width / 2, 96, 17, '#ff7a6b', 'center');
  }
  if (world.messageTime > 0 && world.message) {
    const w = Math.min(640, view.width * 0.7);
    panel(ctx, view.width / 2 - w / 2, view.height - 150, w, 38);
    text(ctx, world.message, view.width / 2, view.height - 131, 15, LIT, 'center');
  }
}

/** The cockpit view's dashboard brow, so the seat reads as a seat. */
function drawCockpitFrame(ctx, view) {
  const { width, height } = view;
  ctx.fillStyle = '#141a20';
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, height - 120);
  ctx.quadraticCurveTo(width / 2, height - 196, width, height - 120);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#232d36';
  ctx.beginPath();
  ctx.moveTo(width * 0.16, height);
  ctx.lineTo(width * 0.2, height - 108);
  ctx.quadraticCurveTo(width / 2, height - 158, width * 0.8, height - 108);
  ctx.lineTo(width * 0.84, height);
  ctx.closePath();
  ctx.fill();
  text(ctx, 'SKY COURIER', width / 2, height - 46, 13, 'rgba(242,247,250,0.5)', 'center');
}

/** All instruments for one frame. */
export function drawHud(ctx, world, view, now) {
  const plane = world.plane;
  drawCompass(ctx, plane, view.width);
  drawSpeedAndAltitude(ctx, plane, view.width, view.height);
  drawHorizon(ctx, plane, view.height);
  drawEngineGauges(ctx, plane, view.width, view.height);
  drawMissionTally(ctx, world);
  drawRingGuidance(ctx, world, view);
  drawWarnings(ctx, world, view, now);
  if (view.cameraMode === 'cockpit') drawCockpitFrame(ctx, view);
}

function dimScreen(ctx, view, alpha) {
  ctx.fillStyle = `rgba(8, 14, 20, ${alpha})`;
  ctx.fillRect(0, 0, view.width, view.height);
}

function centreText(ctx, value, x, y, size, color, weight = '700') {
  text(ctx, value, x, y, size, color, 'center', weight);
}

/** Title, pause, win and crash overlays. */
export function drawScreens(ctx, world, screen, best, view) {
  const cx = view.width / 2;
  if (screen === 'title') {
    dimScreen(ctx, view, 0.24);
    centreText(ctx, 'SKY COURIER', cx, view.height * 0.24, 64, WHITE, '900');
    centreText(ctx, 'Eight parcels. One island. One tank of fuel.', cx, view.height * 0.24 + 48, 19, AMBER, '400');
    centreText(ctx, 'Take off, thread every glowing ring in order, then land back on the home strip.', cx, view.height * 0.24 + 82, 16, WHITE, '400');
    const lines = [
      'W / S or ↑ / ↓ — pitch        A / D or ← / → — bank & turn',
      'Shift / Ctrl (or mouse wheel) — throttle        Mouse — steer',
      'F — flaps        B — brake        C — camera        P — pause',
    ];
    lines.forEach((line, i) => centreText(ctx, line, cx, view.height * 0.52 + i * 26, 15, LIT, '400'));
    centreText(ctx, 'PRESS ENTER TO FLY', cx, view.height * 0.72, 24, AMBER);
    if (best > 0) centreText(ctx, `BEST SORTIE ${best}`, cx, view.height * 0.72 + 34, 14, WHITE, '400');
    return;
  }
  if (screen === 'paused') {
    dimScreen(ctx, view, 0.45);
    centreText(ctx, 'PAUSED', cx, view.height / 2 - 16, 42, WHITE, '900');
    centreText(ctx, 'P to resume · R to restart the sortie', cx, view.height / 2 + 26, 16, LIT, '400');
    return;
  }
  if (screen !== 'over') return;
  dimScreen(ctx, view, 0.24);
  if (world.phase === PHASE_WON) {
    centreText(ctx, 'ALL DELIVERIES MADE', cx, view.height * 0.26, 46, LIT, '900');
    centreText(ctx, `Landing: ${world.landingQuality} · Fuel left: ${Math.round(world.plane.fuel)} · Time: ${Math.floor(world.time / 60)}:${String(Math.floor(world.time % 60)).padStart(2, '0')}`, cx, view.height * 0.26 + 42, 16, WHITE, '400');
    centreText(ctx, `SCORE ${world.score}`, cx, view.height * 0.44, 40, AMBER);
    centreText(ctx, `GRADE ${gradeForScore(world.score)}`, cx, view.height * 0.44 + 44, 22, WHITE);
    if (world.score >= best && best > 0) centreText(ctx, 'NEW BEST SORTIE', cx, view.height * 0.44 + 78, 15, LIT);
  } else if (world.phase === PHASE_LOST) {
    centreText(ctx, 'SORTIE LOST', cx, view.height * 0.26, 46, '#ff7a6b', '900');
    centreText(ctx, world.failReason, cx, view.height * 0.26 + 42, 16, WHITE, '400');
    centreText(ctx, `Deliveries made: ${world.ringsDone} of ${RINGS.length} · Score ${world.score}`, cx, view.height * 0.44, 18, AMBER);
  }
  centreText(ctx, 'PRESS R TO FLY AGAIN', cx, view.height * 0.66, 20, WHITE);
}
