// Shadow Lantern — the world: state, rules and guard brains. One clear job:
// everything that happens in a level, with no DOM and no clock, so the same
// code runs in the browser and in the Node self-test. The world advances in
// fixed 1/60 s steps; every patrol, cone and lantern is fixed by the level.

import {
  ALERT_SHOUT_RANGE,
  ALERT_SHOUT_SUSPICION,
  BUSH_HIDE_DISTANCE,
  COLS,
  DETECT_BASE_RATE,
  DETECT_CLOSE_RATE,
  DETECT_DECAY_RATE,
  DETECT_SNEAK_FACTOR,
  EVENT_ALERT,
  EVENT_CALM,
  EVENT_CAUGHT,
  EVENT_LEVEL_CLEAR,
  EVENT_NONE,
  EVENT_PICKUP,
  EVENT_UNLOCK,
  EVENT_VICTORY,
  GHOST_BONUS,
  GUARD_CATCH_DISTANCE,
  GUARD_CHASE_SPEED,
  GUARD_HEARING_RANGE,
  GUARD_PATROL_SPEED,
  GUARD_SEARCH_SPEED,
  GUARD_VISION_HALF_ANGLE,
  GUARD_VISION_RANGE,
  GUARD_WAYPOINT_PAUSE,
  HEARING_SUSPICION_RATE,
  LANTERN_SCORE,
  LOSE_SIGHT_SECONDS,
  PLAYER_RADIUS,
  PLAYER_SNEAK_SPEED,
  PLAYER_WALK_SPEED,
  ROWS,
  SEARCH_SECONDS,
  STEP,
  TIME_BONUS_MAX,
} from './config.js';
import { exitTile, isWalkable, lanternTiles, LEVELS, playerStart, tileAt } from './levels.js';

/** The tile under a point (x, y in tiles), as a character. */
export function tileAtPoint(level, x, y) {
  return tileAt(level, Math.floor(x), Math.floor(y));
}

/** Whether a point (x, y in tiles) is inside a wall tile. */
export function isWallPoint(level, x, y) {
  return tileAtPoint(level, x, y) === '#';
}

/**
 * Line of sight between two points, sampled finely: true when no wall tile
 * lies on the segment. Sampling, not a raycast, keeps it simple and robust.
 */
export function hasLineOfSight(level, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.12));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isWallPoint(level, ax + dx * t, ay + dy * t)) return false;
  }
  return true;
}

/** Whether a guard's cone can see the player right now (ignores bushes). */
export function guardSeesPlayer(level, guard, player) {
  const dx = player.x - guard.x;
  const dy = player.y - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > GUARD_VISION_RANGE) return false;
  if (dist < 0.001) return true;
  const angle = Math.atan2(dy, dx);
  let diff = angle - guard.dir;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > GUARD_VISION_HALF_ANGLE) return false;
  return hasLineOfSight(level, guard.x, guard.y, player.x, player.y);
}

/** Whether the player is hidden in a bush from this guard. */
export function playerIsHidden(level, guard, player) {
  if (tileAtPoint(level, player.x, player.y) !== ',') return false;
  const dist = Math.hypot(player.x - guard.x, player.y - guard.y);
  return dist > BUSH_HIDE_DISTANCE;
}

/** Breadth-first path over walkable tiles, from tile to tile; null when none. */
export function findPath(level, fromX, fromY, toX, toY) {
  const start = { x: fromX, y: fromY };
  const goal = { x: toX, y: toY };
  if (!isWalkable(level, goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [{ x: goal.x + 0.5, y: goal.y + 0.5 }];
  const key = (x, y) => y * COLS + x;
  const prev = new Map();
  const queue = [start];
  prev.set(key(start.x, start.y), null);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!isWalkable(level, nx, ny) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), cur);
      if (nx === goal.x && ny === goal.y) {
        const path = [];
        let node = { x: nx, y: ny };
        while (node !== null) {
          path.unshift({ x: node.x + 0.5, y: node.y + 0.5 });
          node = prev.get(key(node.x, node.y));
        }
        return path;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

/** A fresh guard from a patrol definition. */
function createGuard(def) {
  const first = def.waypoints[0];
  const second = def.waypoints[1] ?? first;
  return {
    x: first[0] + 0.5,
    y: first[1] + 0.5,
    dir: Math.atan2(second[1] - first[1], second[0] - first[0]),
    waypoints: def.waypoints,
    wpIndex: 1 % def.waypoints.length,
    pause: def.pause ?? GUARD_WAYPOINT_PAUSE,
    pauseLeft: 0,
    state: 'patrol', // patrol | chase | search | return
    suspicion: 0,
    lastSeen: null,
    loseTimer: 0,
    searchTimer: 0,
    path: null,
    pathIndex: 0,
    repathTimer: 0,
    stepPhase: 0, // distance walked since the last footstep sound
  };
}

/** A fresh world for a level index. */
export function createWorld(levelIndex) {
  const level = LEVELS[levelIndex];
  const start = playerStart(level);
  const exit = exitTile(level);
  return {
    levelIndex,
    level,
    player: {
      x: start.x,
      y: start.y,
      dir: 0,
      moving: false,
      sneaking: false,
      hidden: false,
      stepPhase: 0,
    },
    guards: level.guards.map(createGuard),
    lanterns: lanternTiles(level).map((t) => ({ x: t.x, y: t.y, taken: false })),
    exit,
    collected: 0,
    total: lanternTiles(level).length,
    exitOpen: false,
    time: 0,
    alerts: 0,
    spotted: false, // any guard reached full suspicion this level
    caught: false,
    cleared: false,
    noise: [], // expanding rings from running feet, for the renderer
    noiseTimer: 0,
  };
}

/** Move a circle (x, y, radius) by (dx, dy), sliding along walls. */
export function moveCircle(level, body, dx, dy, radius) {
  const nx = body.x + dx;
  if (!circleHitsWall(level, nx, body.y, radius)) body.x = nx;
  const ny = body.y + dy;
  if (!circleHitsWall(level, body.x, ny, radius)) body.y = ny;
}

/** Whether a circle at (x, y) overlaps any wall tile. */
export function circleHitsWall(level, x, y, radius) {
  const x0 = Math.floor(x - radius);
  const x1 = Math.floor(x + radius);
  const y0 = Math.floor(y - radius);
  const y1 = Math.floor(y + radius);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tileAt(level, tx, ty) !== '#') continue;
      const cx = Math.max(tx, Math.min(x, tx + 1));
      const cy = Math.max(ty, Math.min(y, ty + 1));
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < radius * radius) return true;
    }
  }
  return false;
}

/** Steer a guard along a path of tile centres at `speed` tiles/s. */
function followPath(world, guard, dt, speed) {
  if (!guard.path || guard.pathIndex >= guard.path.length) return true;
  const target = guard.path[guard.pathIndex];
  const dx = target.x - guard.x;
  const dy = target.y - guard.y;
  const dist = Math.hypot(dx, dy);
  const stepLen = speed * dt;
  if (dist <= Math.max(stepLen, 0.05)) {
    guard.x = target.x;
    guard.y = target.y;
    guard.pathIndex++;
    return guard.pathIndex >= guard.path.length;
  }
  guard.dir = Math.atan2(dy, dx);
  moveCircle(world.level, guard, (dx / dist) * stepLen, (dy / dist) * stepLen, 0.34);
  return false;
}

/** One guard's suspicion update for this step; returns true when it just spotted the player. */
function updateSuspicion(world, guard, dt, input) {
  const { level, player } = world;
  const hidden = playerIsHidden(level, guard, player);
  const seen = !hidden && guardSeesPlayer(level, guard, player);
  let justSpotted = false;
  if (seen) {
    const dist = Math.hypot(player.x - guard.x, player.y - guard.y);
    const closeness = 1 - dist / GUARD_VISION_RANGE;
    let rate = DETECT_BASE_RATE + DETECT_CLOSE_RATE * closeness;
    if (player.sneaking) rate *= DETECT_SNEAK_FACTOR;
    guard.suspicion = Math.min(1, guard.suspicion + rate * dt);
    guard.lastSeen = { x: player.x, y: player.y };
    guard.loseTimer = 0;
    if (guard.suspicion >= 1 && guard.state !== 'chase') justSpotted = true;
  } else {
    guard.suspicion = Math.max(0, guard.suspicion - DETECT_DECAY_RATE * dt);
    if (guard.state === 'chase') {
      guard.loseTimer += dt;
    } else if (!player.sneaking && player.moving) {
      // Running feet are heard: a nearby guard grows wary even without seeing you.
      const dist = Math.hypot(player.x - guard.x, player.y - guard.y);
      if (dist < GUARD_HEARING_RANGE && hasLineOfSight(level, guard.x, guard.y, player.x, player.y)) {
        guard.suspicion = Math.min(1, guard.suspicion + HEARING_SUSPICION_RATE * dt);
      }
    }
  }
  return justSpotted;
}

/** A guard that just spotted the player shouts: nearby guards grow wary too. */
function shout(world, source) {
  for (const other of world.guards) {
    if (other === source) continue;
    const dist = Math.hypot(other.x - source.x, other.y - source.y);
    if (dist < ALERT_SHOUT_RANGE) {
      other.suspicion = Math.max(other.suspicion, ALERT_SHOUT_SUSPICION);
      if (other.lastSeen === null) other.lastSeen = { x: world.player.x, y: world.player.y };
    }
  }
}

/** One guard's movement and state for this step. */
function stepGuard(world, guard, dt) {
  const { level, player } = world;
  if (guard.state === 'chase') {
    guard.repathTimer -= dt;
    const targetTile = { x: Math.floor(player.x), y: Math.floor(player.y) };
    if (guard.repathTimer <= 0 || !guard.path) {
      guard.path = findPath(level, Math.floor(guard.x), Math.floor(guard.y), targetTile.x, targetTile.y);
      guard.pathIndex = 0;
      guard.repathTimer = 0.4;
    }
    const arrived = followPath(world, guard, dt, GUARD_CHASE_SPEED);
    if (arrived) {
      // Reached the player's tile: keep facing them; the catch check decides the rest.
      guard.dir = Math.atan2(player.y - guard.y, player.x - guard.x);
    }
    if (guard.loseTimer >= LOSE_SIGHT_SECONDS) {
      guard.state = 'search';
      guard.searchTimer = SEARCH_SECONDS;
      guard.path = guard.lastSeen
        ? findPath(level, Math.floor(guard.x), Math.floor(guard.y), Math.floor(guard.lastSeen.x), Math.floor(guard.lastSeen.y))
        : null;
      guard.pathIndex = 0;
    }
    return;
  }

  if (guard.state === 'search') {
    if (guard.path) {
      const arrived = followPath(world, guard, dt, GUARD_SEARCH_SPEED);
      if (arrived) {
        guard.path = null;
        guard.searchTimer -= dt;
        guard.dir += dt * 2.4; // look around the last seen spot
      }
    } else {
      guard.searchTimer -= dt;
      guard.dir += dt * 2.4;
    }
    if (guard.searchTimer <= 0) {
      guard.state = 'return';
      const nearest = nearestWaypointIndex(guard);
      guard.path = findPath(level, Math.floor(guard.x), Math.floor(guard.y), guard.waypoints[nearest][0], guard.waypoints[nearest][1]);
      guard.pathIndex = 0;
      guard.wpIndex = (nearest + 1) % guard.waypoints.length;
    }
    return;
  }

  if (guard.state === 'return') {
    const arrived = followPath(world, guard, dt, GUARD_SEARCH_SPEED);
    if (arrived) {
      guard.state = 'patrol';
      guard.path = null;
      guard.pauseLeft = guard.pause;
    }
    return;
  }

  // Patrol: walk the waypoint loop, pausing to look around at each stop.
  if (guard.pauseLeft > 0) {
    guard.pauseLeft -= dt;
    guard.dir += dt * 1.1; // slow scan while paused
    return;
  }
  const wp = guard.waypoints[guard.wpIndex];
  const tx = wp[0] + 0.5;
  const ty = wp[1] + 0.5;
  const dx = tx - guard.x;
  const dy = ty - guard.y;
  const dist = Math.hypot(dx, dy);
  const stepLen = GUARD_PATROL_SPEED * dt;
  if (dist <= Math.max(stepLen, 0.05)) {
    guard.x = tx;
    guard.y = ty;
    guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
    guard.pauseLeft = guard.pause;
    return;
  }
  guard.dir = Math.atan2(dy, dx);
  moveCircle(level, guard, (dx / dist) * stepLen, (dy / dist) * stepLen, 0.34);
}

/** The waypoint nearest a guard, for its return trip. */
function nearestWaypointIndex(guard) {
  let best = 0;
  let bestDist = Infinity;
  guard.waypoints.forEach((wp, i) => {
    const d = (wp[0] + 0.5 - guard.x) ** 2 + (wp[1] + 0.5 - guard.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/**
 * Advance the world one fixed step. `input` is {x, y, sneak} with x/y in -1..1.
 * Returns an event bitmask for sounds and announcements.
 */
export function stepWorld(world, input, dt = STEP) {
  if (world.caught || world.cleared) return EVENT_NONE;
  const { level, player } = world;
  world.time += dt;
  let events = EVENT_NONE;

  // --- player movement
  const speed = input.sneak ? PLAYER_SNEAK_SPEED : PLAYER_WALK_SPEED;
  let mx = input.x;
  let my = input.y;
  const mag = Math.hypot(mx, my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }
  player.moving = mag > 0.05;
  player.sneaking = input.sneak && player.moving;
  if (player.moving) {
    player.dir = Math.atan2(my, mx);
    moveCircle(level, player, mx * speed * dt, my * speed * dt, PLAYER_RADIUS);
    player.stepPhase += speed * dt;
    if (!player.sneaking) {
      world.noiseTimer -= dt;
      if (world.noiseTimer <= 0) {
        world.noise.push({ x: player.x, y: player.y, r: 0.2, max: 1.1 });
        world.noiseTimer = 0.45;
      }
    }
  }
  for (const ring of world.noise) ring.r += dt * 2.2;
  world.noise = world.noise.filter((ring) => ring.r < ring.max);
  player.hidden = world.guards.some((g) => playerIsHidden(level, g, player));

  // --- lanterns
  for (const lantern of world.lanterns) {
    if (lantern.taken) continue;
    if (Math.hypot(player.x - lantern.x, player.y - lantern.y) < 0.55) {
      lantern.taken = true;
      world.collected++;
      events |= EVENT_PICKUP;
      if (world.collected >= world.total) {
        world.exitOpen = true;
        events |= EVENT_UNLOCK;
      }
    }
  }

  // --- guards: suspicion, then movement
  const wasChasing = world.guards.some((g) => g.state === 'chase');
  for (const guard of world.guards) {
    if (updateSuspicion(world, guard, dt, input)) {
      guard.state = 'chase';
      guard.path = null;
      guard.repathTimer = 0;
      guard.loseTimer = 0;
      world.alerts++;
      world.spotted = true;
      events |= EVENT_ALERT;
      shout(world, guard);
    }
  }
  for (const guard of world.guards) stepGuard(world, guard, dt);
  const isChasing = world.guards.some((g) => g.state === 'chase');
  if (wasChasing && !isChasing) events |= EVENT_CALM;

  // --- caught?
  for (const guard of world.guards) {
    if (Math.hypot(player.x - guard.x, player.y - guard.y) < GUARD_CATCH_DISTANCE) {
      world.caught = true;
      events |= EVENT_CAUGHT;
      return events;
    }
  }

  // --- exit
  if (world.exitOpen && Math.hypot(player.x - world.exit.x, player.y - world.exit.y) < 0.6) {
    world.cleared = true;
    events |= world.levelIndex >= LEVELS.length - 1 ? EVENT_VICTORY : EVENT_LEVEL_CLEAR;
  }
  return events;
}

/** The level score: lanterns, a ghost bonus, and a time bonus against par. */
export function levelScore(world) {
  const lanterns = world.collected * LANTERN_SCORE;
  const ghost = world.spotted ? 0 : GHOST_BONUS;
  const timeBonus = Math.max(0, Math.round(TIME_BONUS_MAX * (1 - world.time / (LEVELS[world.levelIndex].par * 2))));
  return lanterns + ghost + timeBonus;
}

/** The highest suspicion among the guards, for the HUD alarm meter. */
export function alarmLevel(world) {
  let max = 0;
  for (const guard of world.guards) max = Math.max(max, guard.suspicion, guard.state === 'chase' ? 1 : 0);
  return max;
}

/** Whether any guard is chasing right now. */
export function anyChasing(world) {
  return world.guards.some((g) => g.state === 'chase');
}
