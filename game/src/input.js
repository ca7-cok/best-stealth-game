// Shadow Lantern — keyboard input. One clear job: turn key presses into a
// movement vector and one-shot actions. WASD or arrows to move, Shift to
// sneak, Space or Enter to confirm, Esc or P to pause, M to mute, R to retry.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RETRY = 8;

const MOVE_KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function createInput(target) {
  const held = new Set();
  let sneakHeld = false;
  let actions = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    const code = event.code;
    if (MOVE_KEYS[code]) {
      held.add(code);
      event.preventDefault();
    } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
      sneakHeld = true;
    } else if (code === 'Space' || code === 'Enter') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (code === 'Escape' || code === 'KeyP') {
      actions |= ACTION_PAUSE;
    } else if (code === 'KeyM') {
      actions |= ACTION_MUTE;
    } else if (code === 'KeyR') {
      actions |= ACTION_RETRY;
    }
  }

  function onKeyUp(event) {
    held.delete(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') sneakHeld = false;
  }

  function onBlur() {
    held.clear();
    sneakHeld = false;
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  /** The current movement vector and sneak state, as {x, y, sneak}. */
  function direction() {
    let x = 0;
    let y = 0;
    for (const code of held) {
      const [dx, dy] = MOVE_KEYS[code];
      x += dx;
      y += dy;
    }
    return { x, y, sneak: sneakHeld };
  }

  /** Take and clear the one-shot actions since the last call. */
  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  return { direction, takeActions };
}
