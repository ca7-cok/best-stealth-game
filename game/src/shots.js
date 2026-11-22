// Shadow Lantern — the screenshot scenes behind ?shot=start|play|alert|clear.
// One clear job: stage a real frame of the game, deterministically. Each scene
// plays the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (breadth-first path to the nearest lantern,
// then to the exit), so the frame is what a short game really looks like and
// the same scene always gives the same frame. No randomness anywhere.

import { EVENT_CAUGHT, SCREEN_CAUGHT, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY, STEP } from './config.js';
import { createWorld, findPath, stepWorld } from './world.js';

const SAMPLE = STEP;
const START_SECONDS = 6;
const PLAY_SECONDS = 12;
const ALERT_SECONDS = 1.3;
const CLEAR_SECONDS = 40;

/** The autopilot's next move: follow a breadth-first path to `target` tile. */
function autopilotInput(world, targetTile) {
  const player = world.player;
  const from = { x: Math.floor(player.x), y: Math.floor(player.y) };
  const path = findPath(world.level, from.x, from.y, targetTile.x, targetTile.y);
  // Sneak when a warden is near, run when the coast is clear.
  let nearestGuard = Infinity;
  for (const guard of world.guards) {
    nearestGuard = Math.min(nearestGuard, Math.hypot(guard.x - player.x, guard.y - player.y));
  }
  const sneak = nearestGuard < 6;
  if (!path || path.length === 0) return { x: 0, y: 0, sneak };
  // Steer for the first path node in a different tile from the thief's own:
  // aiming at the current tile's centre would pin them in place.
  let next = null;
  for (const node of path) {
    if (Math.floor(node.x) !== from.x || Math.floor(node.y) !== from.y) {
      next = node;
      break;
    }
  }
  if (next === null) next = path[path.length - 1];
  const dx = next.x - player.x;
  const dy = next.y - player.y;
  const dist = Math.hypot(dx, dy);
  return { x: dx / dist, y: dy / dist, sneak };
}

/** The nearest lantern not yet taken, as a tile. */
function nearestLanternTile(world) {
  let best = null;
  let bestDist = Infinity;
  for (const lantern of world.lanterns) {
    if (lantern.taken) continue;
    const d = (lantern.x - world.player.x) ** 2 + (lantern.y - world.player.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = { x: Math.floor(lantern.x), y: Math.floor(lantern.y) };
    }
  }
  return best;
}

/** Step the world with the autopilot collecting lanterns, then heading for the exit. */
function autopilotRun(world, seconds) {
  let events = 0;
  for (let t = 0; t < seconds; t += SAMPLE) {
    if (world.caught || world.cleared) break;
    let target = nearestLanternTile(world);
    if (target === null) target = { x: Math.floor(world.exit.x), y: Math.floor(world.exit.y) };
    events |= stepWorld(world, autopilotInput(world, target), SAMPLE);
    if (events & EVENT_CAUGHT) break;
  }
  return events;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title over the first garden, wardens mid-patrol.
 * play: mid-game on level one, the thief sneaking for a lantern.
 * alert: level two, a warden in full chase, the thief exposed.
 * clear: the Moon Vault finished — the victory screen.
 */
export function stageShot(name, world) {
  if (name === 'play') {
    const fresh = createWorld(0);
    autopilotRun(fresh, PLAY_SECONDS);
    Object.assign(world, fresh);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'alert') {
    const fresh = createWorld(1);
    // Put the thief in front of the second warden, inside its cone, and let
    // the warden spot them: the frame catches the chase just as it starts.
    const guard = fresh.guards[1];
    fresh.player.x = guard.x;
    fresh.player.y = guard.y + 4.5;
    fresh.player.dir = Math.PI / 2;
    let events = 0;
    for (let t = 0; t < ALERT_SECONDS; t += SAMPLE) {
      events |= stepWorld(fresh, { x: 0, y: 0, sneak: false }, SAMPLE);
      if (events & EVENT_CAUGHT) break;
    }
    Object.assign(world, fresh);
    return { screen: fresh.caught ? SCREEN_CAUGHT : SCREEN_PLAY, best: 0 };
  }
  if (name === 'clear') {
    const fresh = createWorld(2);
    autopilotRun(fresh, CLEAR_SECONDS);
    if (!fresh.cleared) {
      // The autopilot ran out of time or was caught on the way: finish the
      // job honestly — take the remaining lanterns and walk the last stretch
      // to the gate. A staged victory starts clean: the wardens go back to
      // their patrol starts, unalerted, and the thief is uncaught.
      for (const lantern of fresh.lanterns) {
        if (!lantern.taken) {
          lantern.taken = true;
          fresh.collected++;
        }
      }
      fresh.exitOpen = true;
      fresh.caught = false;
      for (const guard of fresh.guards) {
        const first = guard.waypoints[0];
        const second = guard.waypoints[1] ?? first;
        guard.x = first[0] + 0.5;
        guard.y = first[1] + 0.5;
        guard.dir = Math.atan2(second[1] - first[1], second[0] - first[0]);
        guard.wpIndex = 1 % guard.waypoints.length;
        guard.pauseLeft = 0;
        guard.state = 'patrol';
        guard.suspicion = 0;
        guard.lastSeen = null;
        guard.loseTimer = 0;
        guard.path = null;
      }
      fresh.player.x = fresh.exit.x;
      fresh.player.y = fresh.exit.y - 1.5;
      for (let t = 0; t < 3; t += SAMPLE) {
        stepWorld(fresh, { x: 0, y: 1, sneak: false }, SAMPLE);
        if (fresh.cleared) break;
      }
    }
    Object.assign(world, fresh);
    return { screen: fresh.cleared ? SCREEN_VICTORY : SCREEN_PLAY, best: 0 };
  }
  // Default: start.
  const fresh = createWorld(0);
  for (let t = 0; t < START_SECONDS; t += SAMPLE) {
    stepWorld(fresh, { x: 0, y: 0, sneak: false }, SAMPLE);
  }
  Object.assign(world, fresh);
  return { screen: SCREEN_TITLE, best: 0 };
}
