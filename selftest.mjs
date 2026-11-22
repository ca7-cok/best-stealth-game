// Shadow Lantern — Node self-test for the game rules. Run with:
//   node selftest.mjs
// It imports the real game modules (world.js, levels.js) and checks the maps,
// the reachability, the guard patrols, line of sight, detection, pickups,
// the exit, the chase and the catch — plus determinism: two identical
// autopilot runs must end in the identical state.

import { LEVELS, exitTile, isWalkable, lanternTiles, playerStart, tileAt } from './game/src/levels.js';
import {
  alarmLevel,
  createWorld,
  findPath,
  guardSeesPlayer,
  hasLineOfSight,
  levelScore,
  playerIsHidden,
  stepWorld,
} from './game/src/world.js';
import { STEP } from './game/src/config.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL ${name} ${detail}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/** Breadth-first reachability over walkable tiles, from a tile. */
function reachableTiles(level, sx, sy) {
  const seen = new Set([`${sx},${sy}`]);
  const queue = [[sx, sy]];
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(level, nx, ny) || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

section('maps');
for (let i = 0; i < LEVELS.length; i++) {
  const level = LEVELS[i];
  check(`L${i + 1} has 20 rows`, level.map.length === 20, `got ${level.map.length}`);
  check(
    `L${i + 1} rows are 30 wide`,
    level.map.every((row) => row.length === 30),
    level.map.map((r, y) => (r.length === 30 ? null : `row ${y} is ${r.length}`)).filter(Boolean).join('; '),
  );
  check(`L${i + 1} border is all wall`, level.map.every((row, y) => y === 0 || y === 19 || (row[0] === '#' && row[29] === '#')));
  const flat = level.map.join('');
  check(`L${i + 1} has one player start`, (flat.match(/P/g) ?? []).length === 1);
  check(`L${i + 1} has one exit`, (flat.match(/E/g) ?? []).length === 1);
  check(`L${i + 1} has lanterns`, lanternTiles(level).length >= 3, `got ${lanternTiles(level).length}`);
  check(
    `L${i + 1} has no stray characters`,
    /^[#. ,PEo]+$/.test(flat) && !flat.includes(' '),
    [...new Set(flat)].filter((c) => !'#. ,PEo'.includes(c)).join(','),
  );
}

section('reachability');
for (let i = 0; i < LEVELS.length; i++) {
  const level = LEVELS[i];
  const start = playerStart(level);
  const seen = reachableTiles(level, Math.floor(start.x), Math.floor(start.y));
  const lanterns = lanternTiles(level);
  const exit = exitTile(level);
  check(
    `L${i + 1} all lanterns reachable`,
    lanterns.every((l) => seen.has(`${Math.floor(l.x)},${Math.floor(l.y)}`)),
    lanterns.filter((l) => !seen.has(`${Math.floor(l.x)},${Math.floor(l.y)}`)).map((l) => `(${l.x},${l.y})`).join(' '),
  );
  check(`L${i + 1} exit reachable`, seen.has(`${Math.floor(exit.x)},${Math.floor(exit.y)}`));
  check(
    `L${i + 1} findPath reaches every lantern`,
    lanterns.every((l) => findPath(level, Math.floor(start.x), Math.floor(start.y), Math.floor(l.x), Math.floor(l.y)) !== null),
  );
}

section('guard patrols');
for (let i = 0; i < LEVELS.length; i++) {
  const level = LEVELS[i];
  level.guards.forEach((guard, gi) => {
    const okWaypoints = guard.waypoints.every(([x, y]) => isWalkable(level, x, y));
    check(`L${i + 1} guard ${gi} waypoints walkable`, okWaypoints);
    let straight = true;
    for (let w = 0; w < guard.waypoints.length; w++) {
      const a = guard.waypoints[w];
      const b = guard.waypoints[(w + 1) % guard.waypoints.length];
      if (a[0] !== b[0] && a[1] !== b[1]) straight = false;
      const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      for (let s = 0; s <= steps; s++) {
        const x = a[0] + Math.sign(b[0] - a[0]) * s;
        const y = a[1] + Math.sign(b[1] - a[1]) * s;
        if (!isWalkable(level, x, y)) straight = false;
      }
    }
    check(`L${i + 1} guard ${gi} patrol legs are straight and clear`, straight);
  });
}

section('line of sight');
{
  const level = LEVELS[0];
  check('open floor sees across', hasLineOfSight(level, 2.5, 18.5, 25.5, 18.5));
  check('wall blocks sight', !hasLineOfSight(level, 8.5, 3.5, 20.5, 3.5));
  check('bush does not block sight', hasLineOfSight(level, 2.5, 3.5, 6.5, 3.5));
}

section('detection');
{
  const world = createWorld(0);
  const guard = world.guards[0];
  // Stand the player in the open, inside the first guard's cone, facing it.
  guard.x = 24.5;
  guard.y = 5.5;
  guard.dir = Math.PI / 2; // facing down the column
  guard.state = 'patrol';
  world.player.x = 24.5;
  world.player.y = 7.5;
  const before = guard.suspicion;
  stepWorld(world, { x: 0, y: 0, sneak: false });
  check('suspicion rises when seen in the cone', guard.suspicion > before, `before ${before} after ${guard.suspicion}`);
  // Behind a wall: no rise.
  const world2 = createWorld(0);
  const g2 = world2.guards[0];
  g2.x = 24.5;
  g2.y = 5.5;
  g2.dir = Math.PI / 2;
  world2.player.x = 8.5; // the far side of the central wall
  world2.player.y = 3.5;
  stepWorld(world2, { x: 0, y: 0, sneak: false });
  check('no suspicion through a wall', g2.suspicion === 0, `got ${g2.suspicion}`);
  // In a bush, far away: hidden even inside the cone.
  const world3 = createWorld(0);
  const g3 = world3.guards[0];
  g3.x = 24.5;
  g3.y = 5.5;
  g3.dir = -Math.PI / 2;
  world3.player.x = 4.5; // a bush tile on level one
  world3.player.y = 3.5;
  check('bush hides the player at distance', playerIsHidden(world3.level, g3, world3.player));
  // Guard vision helper agrees with the cone.
  const world4 = createWorld(0);
  const g4 = world4.guards[0];
  g4.x = 24.5;
  g4.y = 5.5;
  g4.dir = Math.PI / 2;
  world4.player.x = 24.5;
  world4.player.y = 7.5;
  check('guardSeesPlayer is true in the open cone', guardSeesPlayer(world4.level, g4, world4.player));
  world4.player.x = 20.5;
  world4.player.y = 5.5;
  check('guardSeesPlayer is false outside the cone', !guardSeesPlayer(world4.level, g4, world4.player));
}

section('chase and catch');
{
  const world = createWorld(0);
  const guard = world.guards[0];
  guard.x = 24.5;
  guard.y = 5.5;
  guard.dir = Math.PI / 2;
  world.player.x = 24.5;
  world.player.y = 7.5;
  let events = 0;
  for (let t = 0; t < 5 && guard.state !== 'chase'; t += STEP) {
    events = stepWorld(world, { x: 0, y: 0, sneak: false });
  }
  check('full suspicion starts a chase', guard.state === 'chase', `state ${guard.state}, suspicion ${guard.suspicion}`);
  check('alarm level is 1 while chasing', alarmLevel(world) === 1);
  // Stand still and let the guard close in: the catch must fire.
  let caught = false;
  for (let t = 0; t < 10 && !caught; t += STEP) {
    stepWorld(world, { x: 0, y: 0, sneak: false });
    caught = world.caught;
  }
  check('a chasing guard that reaches the player catches them', caught);
}

section('patrol movement');
{
  const world = createWorld(0);
  const guard = world.guards[1];
  const startX = guard.x;
  for (let t = 0; t < 4; t += STEP) stepWorld(world, { x: 0, y: 0, sneak: false });
  check('a patrolling guard moves along its route', Math.abs(guard.x - startX) > 0.5, `moved ${Math.abs(guard.x - startX).toFixed(2)}`);
}

section('pickups, exit and scoring');
{
  const world = createWorld(0);
  // Walk the player onto every lantern by teleporting between them (the
  // pickup radius is what this checks, not the pathfinding).
  for (const lantern of world.lanterns) {
    world.player.x = lantern.x;
    world.player.y = lantern.y;
    stepWorld(world, { x: 0, y: 0, sneak: false });
  }
  check('all lanterns collected', world.collected === world.total, `${world.collected}/${world.total}`);
  check('exit opens after the last lantern', world.exitOpen);
  check('level score is positive', levelScore(world) > 0, `score ${levelScore(world)}`);
  // Step onto the exit: the level clears.
  world.player.x = world.exit.x;
  world.player.y = world.exit.y;
  const events = stepWorld(world, { x: 0, y: 0, sneak: false });
  check('reaching an open exit clears the level', world.cleared && events !== 0);
  // A locked exit does nothing.
  const world2 = createWorld(0);
  world2.player.x = world2.exit.x;
  world2.player.y = world2.exit.y;
  stepWorld(world2, { x: 0, y: 0, sneak: false });
  check('a locked exit does not clear the level', !world2.cleared);
}

section('determinism');
{
  function autopilotRun() {
    const world = createWorld(1);
    for (let t = 0; t < 20; t += STEP) {
      // A fixed input script: walk right, then down, sneaking throughout.
      const input = t < 10 ? { x: 1, y: 0, sneak: true } : { x: 0, y: 1, sneak: true };
      stepWorld(world, input);
      if (world.caught || world.cleared) break;
    }
    return JSON.stringify({
      p: [world.player.x.toFixed(6), world.player.y.toFixed(6)],
      g: world.guards.map((g) => [g.x.toFixed(6), g.y.toFixed(6), g.suspicion.toFixed(6), g.state]),
      c: world.collected,
      t: world.time.toFixed(6),
    });
  }
  check('two identical runs end in the identical state', autopilotRun() === autopilotRun());
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failures: ${failures.join(', ')}`);
  process.exit(1);
}
