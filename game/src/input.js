// Pilot input: arrow keys or WASD work the stick, Shift and Ctrl work the
// throttle lever, and the mouse is a second stick — where the pointer sits
// relative to the screen centre is where the nose wants to go. The wheel
// nudges the throttle. Everything is sampled into one controls object the
// flight model reads each step.

export const ACTION_START = 'start';
export const ACTION_PAUSE = 'pause';
export const ACTION_RESTART = 'restart';
export const ACTION_CAMERA = 'camera';
export const ACTION_FLAPS = 'flaps';

const THROTTLE_RATE = 0.55; // lever travel per second while a key is held
const WHEEL_STEP = 0.06; // lever travel per wheel notch

export function createInput(canvas) {
  const keys = new Set();
  const actions = [];
  let mouseX = 0; // -1..1 from screen centre
  let mouseY = 0;
  let mouseSeen = false;
  let wheelDelta = 0;

  function onKeyDown(event) {
    const code = event.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) event.preventDefault();
    if (event.repeat) return;
    keys.add(code);
    if (code === 'Enter' || code === 'Space') actions.push(ACTION_START);
    if (code === 'KeyP' || code === 'Escape') actions.push(ACTION_PAUSE);
    if (code === 'KeyR') actions.push(ACTION_RESTART);
    if (code === 'KeyC') actions.push(ACTION_CAMERA);
    if (code === 'KeyF') actions.push(ACTION_FLAPS);
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    mouseSeen = true;
  }

  function onWheel(event) {
    event.preventDefault();
    wheelDelta += event.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  function held(...codes) {
    return codes.some((code) => keys.has(code));
  }

  /** Sample the current controls for one simulation step of `dt` seconds. */
  function sample(dt) {
    let pitch = 0;
    let roll = 0;
    if (held('ArrowUp', 'KeyW')) pitch += 1;
    if (held('ArrowDown', 'KeyS')) pitch -= 1;
    if (held('ArrowRight', 'KeyD')) roll += 1;
    if (held('ArrowLeft', 'KeyA')) roll -= 1;
    if (mouseSeen && pitch === 0 && roll === 0) {
      // The pointer is the stick: above centre climbs, right banks right.
      pitch = -mouseY;
      roll = mouseX;
    }
    let throttleDelta = wheelDelta;
    wheelDelta = 0;
    if (held('ShiftLeft', 'ShiftRight', 'KeyE')) throttleDelta += THROTTLE_RATE * dt;
    if (held('ControlLeft', 'ControlRight', 'KeyQ')) throttleDelta -= THROTTLE_RATE * dt;
    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      throttleDelta,
      brake: held('KeyB', 'Space'),
    };
  }

  /** Drain the one-shot actions pressed since the last call. */
  function takeActions() {
    return actions.splice(0, actions.length);
  }

  return { sample, takeActions };
}
