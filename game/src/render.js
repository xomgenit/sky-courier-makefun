// The renderer: a small hand-written 3D engine on Canvas 2D. It projects
// the island's heightfield as flat-shaded polygons, draws the runway, the
// delivery rings, trees, farmhouses, clouds and the courier plane herself,
// from a chase camera (or the cockpit with the C key). No library, no
// images — every pixel is geometry and gradients computed here.

import { RINGS, RUNWAY, WORLD } from './config.js';
import { drawHud, drawScreens } from './hud.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

export const CAMERA_CHASE = 'chase';
export const CAMERA_COCKPIT = 'cockpit';

const FOV = (68 * Math.PI) / 180;
const NEAR = 1.2;
const FAR = 6800;
const SUN = normalize({ x: -0.45, y: 0.62, z: -0.35 });
const SKY_TOP = '#3f7fd0';
const SKY_HORIZON = '#cfe6f7';
const HAZE = [207, 230, 247];

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Orthonormal basis for a heading/pitch/roll attitude. */
function attitudeBasis(heading, pitch, roll) {
  const cp = Math.cos(pitch);
  const forward = {
    x: Math.sin(heading) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(heading) * cp,
  };
  const rightFlat = { x: Math.cos(heading), y: 0, z: Math.sin(heading) };
  const upFlat = cross(rightFlat, forward);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const right = {
    x: rightFlat.x * cr - upFlat.x * sr,
    y: rightFlat.y * cr - upFlat.y * sr,
    z: rightFlat.z * cr - upFlat.z * sr,
  };
  const up = {
    x: upFlat.x * cr + rightFlat.x * sr,
    y: upFlat.y * cr + rightFlat.y * sr,
    z: upFlat.z * cr + rightFlat.z * sr,
  };
  return { forward, right, up };
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function css(rgb, alpha = 1) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/** Terrain colour by height, with a patchwork of fields on the lowlands. */
function terrainColor(height, gx, gz) {
  if (height < WORLD.waterLevel + 1.5) return [217, 192, 138]; // sand
  if (height < 60) {
    // Fields three quads wide, hashed so the patchwork looks farmed,
    // not chequered.
    const bx = Math.floor(gx / 3);
    const bz = Math.floor(gz / 3);
    const hash = Math.abs(Math.sin(bx * 127.1 + bz * 311.7) * 43758.5453) % 1;
    if (hash < 0.3) return [124, 184, 79];
    if (hash < 0.55) return [169, 196, 92];
    if (hash < 0.8) return [93, 162, 74];
    return [140, 178, 84];
  }
  if (height < 150) return [62, 125, 58]; // forest
  if (height < 260) return [110, 138, 84]; // high pasture
  if (height < 380) return [138, 133, 120]; // rock
  return [226, 236, 246]; // snow
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function draw(world, screen, best, cameraMode, now) {
    const plane = world.plane;
    const terrain = world.terrain;
    const focal = height / 2 / Math.tan(FOV / 2);
    const cx = width / 2;
    const cy = height / 2;

    // Camera: chase sits behind and above, rolling only part-way with her
    // so the horizon stays readable; cockpit sits in the pilot's seat.
    const camBasis = cameraMode === CAMERA_COCKPIT
      ? attitudeBasis(plane.heading, plane.pitch, plane.roll)
      : attitudeBasis(plane.heading, plane.pitch * 0.6, plane.roll * 0.42);
    const camPos = cameraMode === CAMERA_COCKPIT
      ? {
          x: plane.x + camBasis.up.x * 1.1 + camBasis.forward.x * 0.4,
          y: plane.y + camBasis.up.y * 1.1 + camBasis.forward.y * 0.4,
          z: plane.z + camBasis.up.z * 1.1 + camBasis.forward.z * 0.4,
        }
      : {
          x: plane.x - camBasis.forward.x * 23 + camBasis.up.x * 6,
          y: plane.y - camBasis.forward.y * 23 + camBasis.up.y * 6,
          z: plane.z - camBasis.forward.z * 23 + camBasis.up.z * 6,
        };

    function project(p) {
      const d = { x: p.x - camPos.x, y: p.y - camPos.y, z: p.z - camPos.z };
      const z = dot(d, camBasis.forward);
      if (z < NEAR) return null;
      return {
        x: cx + (dot(d, camBasis.right) / z) * focal,
        y: cy - (dot(d, camBasis.up) / z) * focal,
        z,
      };
    }

    // Sky and sun.
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(0.55, '#8fc3ec');
    sky.addColorStop(1, SKY_HORIZON);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    const sunPoint = project({
      x: camPos.x + SUN.x * 3000,
      y: camPos.y + SUN.y * 3000,
      z: camPos.z + SUN.z * 3000,
    });
    if (sunPoint) {
      const glow = ctx.createRadialGradient(sunPoint.x, sunPoint.y, 4, sunPoint.x, sunPoint.y, 130);
      glow.addColorStop(0, 'rgba(255,244,200,0.95)');
      glow.addColorStop(0.25, 'rgba(255,238,170,0.55)');
      glow.addColorStop(1, 'rgba(255,238,170,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sunPoint.x - 130, sunPoint.y - 130, 260, 260);
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      ctx.arc(sunPoint.x, sunPoint.y, 17, 0, Math.PI * 2);
      ctx.fill();
    }

    // Collect every polygon with its depth, then paint far to near.
    // Polygons are clipped against the near plane in view space, so the
    // ground right under the camera never leaves a hole.
    const polys = [];
    function addPoly(points, color, alpha = 1) {
      let view = points.map((p) => {
        const d = { x: p.x - camPos.x, y: p.y - camPos.y, z: p.z - camPos.z };
        return { x: dot(d, camBasis.right), y: dot(d, camBasis.up), z: dot(d, camBasis.forward) };
      });
      const clipped = [];
      for (let i = 0; i < view.length; i += 1) {
        const a = view[i];
        const b = view[(i + 1) % view.length];
        const aIn = a.z >= NEAR;
        const bIn = b.z >= NEAR;
        if (aIn) clipped.push(a);
        if (aIn !== bIn) {
          const t = (NEAR - a.z) / (b.z - a.z);
          clipped.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR });
        }
      }
      if (clipped.length < 3) return;
      view = clipped;
      let depth = 0;
      const projected = view.map((v) => {
        depth += v.z;
        return { x: cx + (v.x / v.z) * focal, y: cy - (v.y / v.z) * focal, z: v.z };
      });
      depth /= view.length;
      if (depth > FAR) return;
      polys.push({ projected, color, alpha, depth });
    }

    // Terrain mesh.
    const step = WORLD.gridStep;
    const half = WORLD.size / 2;
    for (let gz = -half; gz < half; gz += step) {
      for (let gx = -half; gx < half; gx += step) {
        const h00 = terrain.heightAt(gx, gz);
        const h10 = terrain.heightAt(gx + step, gz);
        const h11 = terrain.heightAt(gx + step, gz + step);
        const h01 = terrain.heightAt(gx, gz + step);
        const midH = (h00 + h10 + h11 + h01) / 4;
        // Slope shading from the quad's own normal.
        const edgeA = { x: step, y: h10 - h00, z: 0 };
        const edgeB = { x: 0, y: h01 - h00, z: step };
        const normal = normalize(cross(edgeB, edgeA));
        const shade = 0.62 + 0.38 * Math.max(0, dot(normal, SUN));
        let color = terrainColor(midH, gx / step, gz / step);
        color = color.map((c) => Math.min(255, Math.round(c * shade)));
        const centre = { x: gx + step / 2, y: midH, z: gz + step / 2 };
        const d = Math.hypot(centre.x - camPos.x, centre.y - camPos.y, centre.z - camPos.z);
        if (d > FAR) continue;
        const hazeT = Math.max(0, (d - 900) / 2600);
        color = mixColor(color, HAZE, Math.min(0.75, hazeT));
        addPoly(
          [
            { x: gx, y: h00, z: gz },
            { x: gx + step, y: h10, z: gz },
            { x: gx + step, y: h11, z: gz + step },
            { x: gx, y: h01, z: gz + step },
          ],
          color,
        );
      }
    }

    // Water: broad translucent quads at sea level, reaching past the
    // island's edge so the sea meets the horizon.
    const waterColor = [52, 120, 186];
    for (let gz = -6000; gz < 6000; gz += 1200) {
      for (let gx = -6000; gx < 6000; gx += 1200) {
        addPoly(
          [
            { x: gx, y: WORLD.waterLevel, z: gz },
            { x: gx + 1200, y: WORLD.waterLevel, z: gz },
            { x: gx + 1200, y: WORLD.waterLevel, z: gz + 1200 },
            { x: gx, y: WORLD.waterLevel, z: gz + 1200 },
          ],
          waterColor,
          0.82,
        );
      }
    }

    // The runway: asphalt, edge lines, centreline dashes, threshold bars.
    // Asphalt and edge lines are cut into segments so the painter's sort
    // stays local and the strip is never overdrawn by nearer meadow.
    const ry = terrain.fieldHeight + 0.35;
    const rx0 = RUNWAY.centreX - RUNWAY.length / 2;
    const rx1 = RUNWAY.centreX + RUNWAY.length / 2;
    const rz0 = RUNWAY.centreZ - RUNWAY.width / 2;
    const rz1 = RUNWAY.centreZ + RUNWAY.width / 2;
    const line = [240, 244, 248];
    const segments = 10;
    const segLen = (rx1 - rx0) / segments;
    for (let sIdx = 0; sIdx < segments; sIdx += 1) {
      const sx0 = rx0 + sIdx * segLen;
      const sx1 = sx0 + segLen;
      addPoly(
        [
          { x: sx0, y: ry, z: rz0 },
          { x: sx1, y: ry, z: rz0 },
          { x: sx1, y: ry, z: rz1 },
          { x: sx0, y: ry, z: rz1 },
        ],
        [58, 63, 70],
      );
      for (const zEdge of [rz0 + 1.2, rz1 - 2.6]) {
        addPoly(
          [
            { x: sx0, y: ry + 0.05, z: zEdge },
            { x: sx1, y: ry + 0.05, z: zEdge },
            { x: sx1, y: ry + 0.05, z: zEdge + 1.4 },
            { x: sx0, y: ry + 0.05, z: zEdge + 1.4 },
          ],
          line,
        );
      }
    }
    for (let x = rx0 + 30; x < rx1 - 30; x += 46) {
      addPoly(
        [
          { x, y: ry + 0.05, z: RUNWAY.centreZ - 1 },
          { x: x + 24, y: ry + 0.05, z: RUNWAY.centreZ - 1 },
          { x: x + 24, y: ry + 0.05, z: RUNWAY.centreZ + 1 },
          { x, y: ry + 0.05, z: RUNWAY.centreZ + 1 },
        ],
        line,
      );
    }
    for (const xEnd of [rx0 + 8, rx1 - 26]) {
      for (let i = 0; i < 4; i += 1) {
        const z = rz0 + 5 + i * 10;
        addPoly(
          [
            { x: xEnd, y: ry + 0.05, z },
            { x: xEnd + 18, y: ry + 0.05, z },
            { x: xEnd + 18, y: ry + 0.05, z: z + 5 },
            { x: xEnd, y: ry + 0.05, z: z + 5 },
          ],
          line,
        );
      }
    }

    // Farmhouses: cream walls under a rust-red roof.
    for (const house of terrain.houses) {
      const c = Math.cos(house.turn);
      const s = Math.sin(house.turn);
      const local = (lx, ly, lz) => ({
        x: house.x + lx * c - lz * s,
        y: house.y + ly,
        z: house.z + lx * s + lz * c,
      });
      const wall = [238, 228, 205];
      const roof = [168, 74, 52];
      addPoly([local(-7, 0, -5), local(7, 0, -5), local(7, 5, -5), local(-7, 5, -5)], wall);
      addPoly([local(7, 0, 5), local(-7, 0, 5), local(-7, 5, 5), local(7, 5, 5)], wall);
      addPoly([local(-8, 5, -6), local(8, 5, -6), local(0, 9, 0)], roof);
      addPoly([local(8, 5, 6), local(-8, 5, 6), local(0, 9, 0)], roof);
      addPoly([local(-8, 5, -6), local(0, 9, 0), local(-8, 5, 6)], roof);
      addPoly([local(8, 5, 6), local(0, 9, 0), local(8, 5, -6)], roof);
    }

    // Rings: the next one burns gold with a beacon; the rest wait pale.
    for (let i = 0; i < RINGS.length; i += 1) {
      const ring = RINGS[i];
      const isNext = i === world.ringIndex;
      const isDone = i < world.ringIndex;
      const from = i === 0 ? { x: RUNWAY.centreX, z: RUNWAY.centreZ } : RINGS[i - 1];
      const dirx = ring.x - from.x;
      const dirz = ring.z - from.z;
      const dirLen = Math.hypot(dirx, dirz) || 1;
      const side = { x: dirz / dirLen, z: -dirx / dirLen };
      const color = isDone ? [90, 200, 120] : isNext ? [255, 176, 32] : [210, 220, 228];
      const pulse = isNext ? 1 + Math.sin(now * 0.006) * 0.06 : 1;
      const radius = ring.radius * pulse;
      const segments = 26;
      for (let sIdx = 0; sIdx < segments; sIdx += 1) {
        const a0 = (sIdx / segments) * Math.PI * 2;
        const a1 = ((sIdx + 1) / segments) * Math.PI * 2;
        const p0 = {
          x: ring.x + Math.cos(a0) * radius * side.x,
          y: ring.y + Math.sin(a0) * radius,
          z: ring.z + Math.cos(a0) * radius * side.z,
        };
        const p1 = {
          x: ring.x + Math.cos(a1) * radius * side.x,
          y: ring.y + Math.sin(a1) * radius,
          z: ring.z + Math.cos(a1) * radius * side.z,
        };
        const thick = isNext ? 2.4 : 1.6;
        addPoly(
          [
            { x: p0.x, y: p0.y - thick / 2, z: p0.z },
            { x: p1.x, y: p1.y - thick / 2, z: p1.z },
            { x: p1.x, y: p1.y + thick / 2, z: p1.z },
            { x: p0.x, y: p0.y + thick / 2, z: p0.z },
          ],
          color,
          isDone ? 0.45 : 0.95,
        );
      }
      if (isNext) {
        // A pillar of light so the target reads from half the island away:
        // two crossed quads, visible from any heading.
        addPoly(
          [
            { x: ring.x - 3, y: ring.y - radius, z: ring.z },
            { x: ring.x + 3, y: ring.y - radius, z: ring.z },
            { x: ring.x + 3, y: ring.y + 260, z: ring.z },
            { x: ring.x - 3, y: ring.y + 260, z: ring.z },
          ],
          [255, 190, 60],
          0.16,
        );
        addPoly(
          [
            { x: ring.x, y: ring.y - radius, z: ring.z - 3 },
            { x: ring.x, y: ring.y - radius, z: ring.z + 3 },
            { x: ring.x, y: ring.y + 260, z: ring.z + 3 },
            { x: ring.x, y: ring.y + 260, z: ring.z - 3 },
          ],
          [255, 190, 60],
          0.16,
        );
      }
    }

    // Paint everything far to near.
    polys.sort((a, b) => b.depth - a.depth);
    for (const poly of polys) {
      ctx.fillStyle = css(poly.color, poly.alpha);
      ctx.beginPath();
      ctx.moveTo(poly.projected[0].x, poly.projected[0].y);
      for (let i = 1; i < poly.projected.length; i += 1) ctx.lineTo(poly.projected[i].x, poly.projected[i].y);
      ctx.closePath();
      ctx.fill();
    }

    // Pines: simple billboard cones, nearer ones bigger.
    const sortedTrees = [...terrain.trees].sort((a, b) => {
      const da = (a.x - camPos.x) ** 2 + (a.z - camPos.z) ** 2;
      const db = (b.x - camPos.x) ** 2 + (b.z - camPos.z) ** 2;
      return db - da;
    });
    for (const tree of sortedTrees) {
      const base = project({ x: tree.x, y: tree.y, z: tree.z });
      const top = project({ x: tree.x, y: tree.y + tree.size, z: tree.z });
      if (!base || !top || base.z > 1600) continue;
      const w = Math.max(1.5, (tree.size * 0.42 * focal) / base.z);
      ctx.fillStyle = '#5d4630';
      ctx.fillRect(base.x - w * 0.12, top.y + (base.y - top.y) * 0.72, w * 0.24, (base.y - top.y) * 0.28);
      ctx.fillStyle = '#2f6b34';
      ctx.beginPath();
      ctx.moveTo(base.x - w, base.y - (base.y - top.y) * 0.18);
      ctx.lineTo(base.x + w, base.y - (base.y - top.y) * 0.18);
      ctx.lineTo(top.x, top.y);
      ctx.closePath();
      ctx.fill();
    }

    // Clouds: soft billboard puffs drifting high above the course.
    for (const cloud of terrain.clouds) {
      const p = project({ x: cloud.x, y: cloud.y, z: cloud.z });
      if (!p) continue;
      const r = (cloud.size * focal) / p.z;
      if (r < 6) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      for (const [ox, oy, s] of [[0, 0, 1], [-0.55, 0.12, 0.7], [0.55, 0.1, 0.75], [0.1, -0.22, 0.6]]) {
        ctx.beginPath();
        ctx.ellipse(p.x + ox * r, p.y + oy * r * 0.4, r * s, r * s * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Her shadow on the ground, so height reads at a glance.
    const shadowY = Math.max(terrain.heightAt(plane.x, plane.z), WORLD.waterLevel) + 0.4;
    const shadow = project({ x: plane.x, y: shadowY, z: plane.z });
    if (shadow && plane.y - shadowY < 500) {
      const r = Math.max(3, (6 * focal) / shadow.z) * Math.max(0.3, 1 - (plane.y - shadowY) / 600);
      ctx.fillStyle = 'rgba(20,30,20,0.26)';
      ctx.beginPath();
      ctx.ellipse(shadow.x, shadow.y, r, r * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // The courier herself, big in frame from the chase camera.
    if (cameraMode === CAMERA_CHASE) drawAircraft(ctx, plane, project);

    // Instruments and screens.
    const view = { project, width, height, cameraMode, focal, screen };
    drawHud(ctx, world, view, now);
    drawScreens(ctx, world, screen, best, view);
  }

  return { draw, resize };
}

/** The courier plane as polygons: white fuselage, red wings, spinning prop. */
function drawAircraft(ctx, plane, project) {
  const basis = attitudeBasis(plane.heading, plane.pitch, plane.roll);
  const back = { x: -basis.forward.x, y: -basis.forward.y, z: -basis.forward.z };
  const local = (lx, ly, lz) => ({
    x: plane.x + basis.right.x * lx + basis.up.x * ly + back.x * lz,
    y: plane.y + basis.right.y * lx + basis.up.y * ly + back.y * lz,
    z: plane.z + basis.right.z * lx + basis.up.z * ly + back.z * lz,
  });

  const white = [244, 246, 248];
  const red = [210, 59, 46];
  const dark = [34, 48, 60];
  const grey = [150, 158, 166];
  const parts = [];
  function part(points, color, alpha = 1) {
    const projected = [];
    let depth = 0;
    for (const p of points) {
      const s = project(p);
      if (!s) return;
      projected.push(s);
      depth += s.z;
    }
    parts.push({ projected, color, alpha, depth: depth / points.length });
  }

  // Fuselage: a tapered box from spinner to tail.
  const nose = -4.6;
  const tail = 4.4;
  part([local(-0.75, -0.7, nose + 1.2), local(0.75, -0.7, nose + 1.2), local(0.55, -0.45, tail), local(-0.55, -0.45, tail)], grey);
  part([local(-0.75, 0.7, nose + 1.2), local(-0.55, 0.45, tail), local(0.55, 0.45, tail), local(0.75, 0.7, nose + 1.2)], white);
  part([local(0.75, -0.7, nose + 1.2), local(0.75, 0.7, nose + 1.2), local(0.55, 0.45, tail), local(0.55, -0.45, tail)], white);
  part([local(-0.75, 0.7, nose + 1.2), local(-0.75, -0.7, nose + 1.2), local(-0.55, -0.45, tail), local(-0.55, 0.45, tail)], white);
  part([local(-0.75, -0.7, nose + 1.2), local(0.75, -0.7, nose + 1.2), local(0.75, 0.7, nose + 1.2), local(-0.75, 0.7, nose + 1.2)], red);
  // Courier stripe along each flank.
  part([local(0.76, -0.05, nose + 1.3), local(0.76, 0.35, nose + 1.3), local(0.56, 0.25, tail - 0.4), local(0.56, -0.05, tail - 0.4)], red);
  part([local(-0.76, 0.35, nose + 1.3), local(-0.76, -0.05, nose + 1.3), local(-0.56, -0.05, tail - 0.4), local(-0.56, 0.25, tail - 0.4)], red);
  // Canopy.
  part([local(-0.5, 0.7, -1.6), local(0.5, 0.7, -1.6), local(0.42, 1.25, 0.4), local(-0.42, 1.25, 0.4)], dark);
  part([local(-0.42, 1.25, 0.4), local(0.42, 1.25, 0.4), local(0.5, 0.7, 1.4), local(-0.5, 0.7, 1.4)], dark);
  // Main wing, red with white tips and a touch of dihedral.
  part([local(-6.2, 0.45, -0.9), local(-1.1, 0.05, -0.9), local(-1.1, 0.05, 1.1), local(-6.2, 0.45, 1.1)], red);
  part([local(1.1, 0.05, -0.9), local(6.2, 0.45, -0.9), local(6.2, 0.45, 1.1), local(1.1, 0.05, 1.1)], red);
  part([local(-6.2, 0.45, -0.9), local(-5.2, 0.38, -0.9), local(-5.2, 0.38, 1.1), local(-6.2, 0.45, 1.1)], white);
  part([local(5.2, 0.38, -0.9), local(6.2, 0.45, -0.9), local(6.2, 0.45, 1.1), local(5.2, 0.38, 1.1)], white);
  // Tailplane and a tall fin with a white flash.
  part([local(-2.1, 0.25, 3.4), local(2.1, 0.25, 3.4), local(2.1, 0.25, 4.5), local(-2.1, 0.25, 4.5)], red);
  part([local(0, 0.4, 3.1), local(0, 0.4, 4.6), local(0, 2.3, 4.35)], red);
  part([local(0, 0.4, 3.1), local(0, 2.3, 4.35), local(0, 0.4, 4.6)], red);
  part([local(0.02, 1.5, 3.95), local(0.02, 1.5, 4.5), local(0.02, 2.28, 4.36)], white);
  part([local(-0.02, 1.5, 4.5), local(-0.02, 1.5, 3.95), local(-0.02, 2.28, 4.36)], white);
  // Fixed gear: two legs and wheels under the wing, a tail wheel behind.
  part([local(-0.95, -0.6, -0.4), local(-0.75, -0.6, -0.4), local(-0.8, -1.5, -0.2), local(-1.0, -1.5, -0.2)], grey);
  part([local(0.75, -0.6, -0.4), local(0.95, -0.6, -0.4), local(1.0, -1.5, -0.2), local(0.8, -1.5, -0.2)], grey);
  part([local(-1.15, -1.85, -0.55), local(-0.65, -1.85, -0.55), local(-0.65, -1.35, 0.15), local(-1.15, -1.35, 0.15)], dark);
  part([local(0.65, -1.85, -0.55), local(1.15, -1.85, -0.55), local(1.15, -1.35, 0.15), local(0.65, -1.35, 0.15)], dark);
  // Spinner and the blurred prop disc.
  part([local(-0.3, -0.3, nose), local(0.3, -0.3, nose), local(0, 0, nose - 0.7)], dark);
  part([local(0.3, -0.3, nose), local(0.3, 0.3, nose), local(0, 0, nose - 0.7)], dark);
  part([local(0.3, 0.3, nose), local(-0.3, 0.3, nose), local(0, 0, nose - 0.7)], dark);
  part([local(-0.3, 0.3, nose), local(-0.3, -0.3, nose), local(0, 0, nose - 0.7)], dark);
  const disc = [];
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2;
    disc.push(local(Math.cos(a) * 2.1, Math.sin(a) * 2.1, nose - 0.15));
  }
  part(disc, [40, 44, 50], 0.28);
  // Two visible blades over the blur.
  const ba = plane.propAngle;
  part(
    [
      local(Math.cos(ba) * 2.05, Math.sin(ba) * 2.05, nose - 0.2),
      local(Math.cos(ba) * 0.3, Math.sin(ba) * 0.3, nose - 0.2),
      local(-Math.cos(ba) * 0.3, -Math.sin(ba) * 0.3, nose - 0.2),
      local(-Math.cos(ba) * 2.05, -Math.sin(ba) * 2.05, nose - 0.2),
    ],
    [30, 32, 36],
    0.85,
  );

  parts.sort((a, b) => b.depth - a.depth);
  for (const p of parts) {
    ctx.fillStyle = css(p.color, p.alpha);
    ctx.beginPath();
    ctx.moveTo(p.projected[0].x, p.projected[0].y);
    for (let i = 1; i < p.projected.length; i += 1) ctx.lineTo(p.projected[i].x, p.projected[i].y);
    ctx.closePath();
    ctx.fill();
  }
}
