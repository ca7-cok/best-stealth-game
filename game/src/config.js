// Shadow Lantern — shared constants. One clear job: every number the game
// balances on, in one place, so the world, the renderer and the screenshots
// all agree. No DOM, no randomness, no clock: everything here is fixed.

export const TILE = 32;
export const COLS = 30;
export const ROWS = 20;
export const VIEW_W = COLS * TILE; // 960
export const VIEW_H = ROWS * TILE; // 640
export const STEP = 1 / 60;

// Player movement, in tiles per second.
export const PLAYER_WALK_SPEED = 3.4;
export const PLAYER_SNEAK_SPEED = 1.8;
export const PLAYER_RADIUS = 0.32;

// Guard movement and senses.
export const GUARD_PATROL_SPEED = 1.55;
export const GUARD_CHASE_SPEED = 3.45;
export const GUARD_SEARCH_SPEED = 2.2;
export const GUARD_RADIUS = 0.34;
export const GUARD_VISION_RANGE = 5.6; // tiles
export const GUARD_VISION_HALF_ANGLE = 0.66; // radians, ~38 degrees each side
export const GUARD_WAYPOINT_PAUSE = 0.9; // seconds looking around at a waypoint
export const GUARD_HEARING_RANGE = 3.4; // tiles: running feet are heard inside this
export const GUARD_CATCH_DISTANCE = 0.62; // tiles: closer than this and you are caught
export const BUSH_HIDE_DISTANCE = 1.6; // tiles: a guard closer than this still sees you in a bush

// Detection: suspicion 0..1. Fills while the player is seen, drains while hidden.
export const DETECT_BASE_RATE = 0.55; // per second at the far edge of the cone
export const DETECT_CLOSE_RATE = 1.9; // extra per second at point blank
export const DETECT_SNEAK_FACTOR = 0.5; // sneaking is harder to spot
export const DETECT_DECAY_RATE = 0.45; // per second while unseen
export const HEARING_SUSPICION_RATE = 0.35; // per second while running is heard
export const ALERT_SHOUT_RANGE = 7; // tiles: a guard that spots you shouts, nearby guards grow wary
export const ALERT_SHOUT_SUSPICION = 0.6;
export const LOSE_SIGHT_SECONDS = 2.5; // unseen this long while chased: the guard gives up
export const SEARCH_SECONDS = 2.0; // seconds a guard looks around the last seen spot

// Scoring.
export const LANTERN_SCORE = 100;
export const GHOST_BONUS = 300; // finish a level without ever being spotted
export const TIME_BONUS_MAX = 500; // decays with the seconds the level took

// Screens.
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_LEVEL_CLEAR = 'levelclear';
export const SCREEN_VICTORY = 'victory';

// Event flags a world step returns, for sound and announcements.
export const EVENT_NONE = 0;
export const EVENT_PICKUP = 1;
export const EVENT_ALERT = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_LEVEL_CLEAR = 8;
export const EVENT_VICTORY = 16;
export const EVENT_UNLOCK = 32; // the exit just opened (last lantern taken)
export const EVENT_CALM = 64; // the last chasing guard gave up

// Palette: a night garden in deep blue, amber lantern light, red alarm.
export const COLORS = {
  floorA: '#20283d',
  floorB: '#1c2336',
  floorEdge: '#2a3350',
  wall: '#12172a',
  wallTop: '#3a4668',
  wallFace: '#1a2140',
  bush: '#12291f',
  bushLeaf: '#1d4a32',
  bushLeaf2: '#2a6b45',
  exitGlow: '#bfe3ff',
  exitArch: '#8fb8e8',
  lanternCore: '#ffd97a',
  lanternGlow: '#ffb347',
  playerCloak: '#7dd3fc',
  playerHood: '#e0f2fe',
  guardArmor: '#e0655f',
  guardHelmet: '#f2a49e',
  guardDark: '#7f2d2d',
  cone: 'rgba(255, 196, 90, 0.20)',
  coneEdge: 'rgba(255, 196, 90, 0.45)',
  coneAlert: 'rgba(255, 72, 60, 0.30)',
  coneAlertEdge: 'rgba(255, 72, 60, 0.60)',
  darkness: 'rgba(3, 5, 16, 0.62)',
  hudPanel: 'rgba(6, 10, 24, 0.72)',
  hudText: '#e8ecf8',
  hudDim: '#9aa5c4',
  danger: '#ff6b5e',
  safe: '#7ee2a0',
  gold: '#ffd97a',
};
