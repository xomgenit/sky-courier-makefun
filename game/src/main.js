// Boot and the one loop: input is sampled every frame, the sortie advances
// in fixed 1/60 s steps, and the renderer paints what is there. Screens:
// title, play, paused, and the sortie's end (won or lost).
//
// ?seed=N fixes the island scatter. ?shot=takeoff|flight|ring|win stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createTerrain } from './terrain.js';
import { PHASE_LOST, PHASE_WON, createWorld, stepWorld } from './world.js';
import {
  ACTION_CAMERA,
  ACTION_FLAPS,
  ACTION_PAUSE,
  ACTION_RESTART,
  ACTION_START,
  createInput,
} from './input.js';
import {
  CAMERA_CHASE,
  CAMERA_COCKPIT,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25; // longest stall the loop catches up on

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261126;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const terrain = createTerrain(createRandom(seed));
let world = createWorld(terrain);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off; the best score then lasts this visit only.
  }
}

function announce(text) {
  if (status) status.textContent = text;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, scene.best, CAMERA_CHASE, performance.now());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let cameraMode = CAMERA_CHASE;
  let accumulator = 0;
  let last = performance.now();

  function restart() {
    world = createWorld(terrain);
    screen = SCREEN_PLAY;
    announce('New sortie. Throttle up with Shift to take off.');
  }

  function frame(now) {
    const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;

    for (const action of input.takeActions()) {
      if (action === ACTION_START && screen === SCREEN_TITLE) {
        screen = SCREEN_PLAY;
        announce('Airborne soon. Shift for throttle, steer with the mouse or arrow keys.');
      } else if (action === ACTION_PAUSE && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) {
        screen = screen === SCREEN_PLAY ? SCREEN_PAUSED : SCREEN_PLAY;
      } else if (action === ACTION_RESTART && screen !== SCREEN_TITLE) {
        restart();
      } else if (action === ACTION_CAMERA) {
        cameraMode = cameraMode === CAMERA_CHASE ? CAMERA_COCKPIT : CAMERA_CHASE;
      } else if (action === ACTION_FLAPS && screen === SCREEN_PLAY) {
        world.plane.flaps = !world.plane.flaps;
      }
    }

    if (screen === SCREEN_PLAY) {
      accumulator += elapsed;
      while (accumulator >= STEP) {
        stepWorld(world, input.sample(STEP), STEP);
        accumulator -= STEP;
        if (world.phase === PHASE_WON || world.phase === PHASE_LOST) {
          screen = SCREEN_OVER;
          if (world.phase === PHASE_WON && world.score > best) {
            best = world.score;
            saveBest(best);
          }
          announce(world.phase === PHASE_WON ? 'All deliveries made. Sortie complete.' : 'Sortie lost. Press R to fly again.');
          break;
        }
      }
    }

    renderer.draw(world, screen, best, cameraMode, now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
