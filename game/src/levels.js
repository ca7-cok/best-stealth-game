// Shadow Lantern — the three levels. One clear job: the maps, the patrols and
// the names. Every map is 30 columns by 20 rows, fixed and hand-drawn:
//   # wall   . floor   , bush (cover: you are hidden inside unless a guard is close)
//   P player start   E moon-gate exit   o lantern (collect them all to open the exit)
// Guards walk their waypoint loop in order and back to the start; a waypoint
// line is always a straight, wall-free run along one row or one column.

export const LEVELS = [
  {
    name: 'The Garden Gate',
    sub: 'Learn the dark — slip past two wardens.',
    par: 75,
    map: [
      '##############################',
      '#..........#......o..........#',
      '#..,,,,....#.................#',
      '#..,,,,.P..#....####.........#',
      '#..,,,,....#....#..#....o....#',
      '#..........#....#..#.........#',
      '#...####...#....#..#.........#',
      '#...#......#....####.........#',
      '#..o#......#.................#',
      '#...#......#.....,,,,........#',
      '#...#......#.....,,,,........#',
      '#...####...#.....,,,,....E...#',
      '#..........#.................#',
      '#..........#....######.......#',
      '#..####....#....#....#.......#',
      '#..#..o....#....#....#.......#',
      '#..#.......#....######.......#',
      '#..####....#.................#',
      '#............................#',
      '##############################',
    ],
    guards: [
      { waypoints: [[24, 2], [24, 7]], pause: 0.9 },
      { waypoints: [[4, 18], [25, 18]], pause: 0.9 },
    ],
  },
  {
    name: 'The Lantern Court',
    sub: 'Three wardens, four lanterns — mind the gaps in the walls.',
    par: 110,
    map: [
      '##############################',
      '#..o......#........#.........#',
      '#.........#........#....o....#',
      '#..,,,,...#...##...#....,,,,.#',
      '#..,,,,.P.#...##...#....,,,,.#',
      '#..,,,,...#...##...#....,,,,.#',
      '#.........#.............##...#',
      '#...####..#...##...#....##...#',
      '#...#.........##...#.........#',
      '#...#..o..#...##...#....o....#',
      '#...#.....#...##...#....##...#',
      '#...####..#........#....##...#',
      '#.........#...##...#.........#',
      '#.....,,,,#........#....,,,,.#',
      '#.....,,,,#........#....,,,,.#',
      '#.....,,,,#........#....,,,,.#',
      '#.........#........#.........#',
      '#..######.#...##...#..####...#',
      '#.........#........#......E..#',
      '##############################',
    ],
    guards: [
      { waypoints: [[12, 2], [12, 11]], pause: 0.9 },
      { waypoints: [[21, 2], [21, 12]], pause: 0.9 },
      { waypoints: [[2, 18], [9, 18]], pause: 0.9 },
    ],
  },
  {
    name: 'The Moon Vault',
    sub: 'Four wardens guard the vault. Ghost it, if you dare.',
    par: 150,
    map: [
      '##############################',
      '#..o....#........#....o......#',
      '#.......#........#...........#',
      '#..,,,...#...##...#...,,,....#',
      '#..,,,...#...##...#...,,,....#',
      '#..,,,.P.#...##...#...,,,....#',
      '#.......#........#...........#',
      '#..###..#...##...#..###......#',
      '#..#....#........#..#........#',
      '#..#.o..#...##...#..#...o....#',
      '#..#........##...#..#........#',
      '#..###..#........#..###......#',
      '#.......#...##...#...........#',
      '#..,,,,.#........#....,,,,...#',
      '#..,,,,.#...##...#....,,,,...#',
      '#..,,,,.#...##...#....,,,,...#',
      '#.......#...........#........#',
      '#...o...#...##...#.....E.....#',
      '#.......#........#...........#',
      '##############################',
    ],
    guards: [
      { waypoints: [[2, 2], [2, 16]], pause: 0.9 },
      { waypoints: [[15, 2], [15, 16]], pause: 0.9 },
      { waypoints: [[25, 2], [25, 16]], pause: 0.9 },
      { waypoints: [[10, 18], [16, 18]], pause: 0.9 },
    ],
  },
];

/** The tile character at column x, row y of a level's map. */
export function tileAt(level, x, y) {
  if (x < 0 || y < 0 || x >= 30 || y >= 20) return '#';
  return level.map[y][x];
}

/** Whether a tile can be stood on: floor, bush, lantern, exit or player start. */
export function isWalkable(level, x, y) {
  const t = tileAt(level, x, y);
  return t !== '#';
}

/** The player start tile, as {x, y} in tile centres. */
export function playerStart(level) {
  for (let y = 0; y < level.map.length; y++) {
    const x = level.map[y].indexOf('P');
    if (x >= 0) return { x: x + 0.5, y: y + 0.5 };
  }
  return { x: 1.5, y: 1.5 };
}

/** The exit tile, as {x, y} in tile centres. */
export function exitTile(level) {
  for (let y = 0; y < level.map.length; y++) {
    const x = level.map[y].indexOf('E');
    if (x >= 0) return { x: x + 0.5, y: y + 0.5 };
  }
  return { x: 28.5, y: 18.5 };
}

/** Every lantern tile, as {x, y} in tile centres. */
export function lanternTiles(level) {
  const out = [];
  for (let y = 0; y < level.map.length; y++) {
    for (let x = 0; x < level.map[y].length; x++) {
      if (level.map[y][x] === 'o') out.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  return out;
}
