// Shadow Lantern — boot and the one loop. One clear job: own the screens and
// the frame. Input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. The game moves between six
// screens: title, play, paused, caught, level clear and victory.
//
// ?shot=start|play|alert|clear stages that scene instead of running the loop,
// paints it twice and sets window.__shotReady for a screenshot.

import { EVENT_ALERT, EVENT_CALM, EVENT_CAUGHT, EVENT_LEVEL_CLEAR, EVENT_PICKUP, EVENT_UNLOCK, EVENT_VICTORY, SCREEN_CAUGHT, SCREEN_LEVEL_CLEAR, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY, STEP } from './config.js';
import { createWorld, levelScore, stepWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RETRY, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

/** The most bytes a dossier holds (contracts/dossier.ts DOSSIER_MAX_BYTES): 4 MiB. */
const BEST_KEY_NAME = 'shadow-lantern-best';
/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const renderer = createRenderer(canvas);
let world = createWorld(0);
let totalScore = 0;
let screen = SCREEN_TITLE;

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY_NAME) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY_NAME, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { totalScore: 0, best: scene.best, muted: false }, world.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(window);
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startLevel(index) {
    world = createWorld(index);
    totalScore = index === 0 ? 0 : totalScore;
    screen = SCREEN_PLAY;
    accumulator = 0;
    announce(`Level ${index + 1}: ${world.level.name}. Collect ${world.total} lanterns, then reach the moon-gate.`);
  }

  function startGame() {
    totalScore = 0;
    startLevel(0);
  }

  function endLevel() {
    const score = levelScore(world);
    totalScore += score;
    if (totalScore > best) {
      best = totalScore;
      saveBest(best);
    }
    screen = SCREEN_LEVEL_CLEAR;
    audio.levelClear();
    announce(`Level clear. Score ${score}. Total ${totalScore}.`);
  }

  function endVictory() {
    const score = levelScore(world);
    totalScore += score;
    if (totalScore > best) {
      best = totalScore;
      saveBest(best);
    }
    screen = SCREEN_VICTORY;
    audio.victory();
    announce(`Victory. Total score ${totalScore}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_UNLOCK) audio.unlockExit();
    if (events & EVENT_ALERT) audio.alert();
    if (events & EVENT_CALM) audio.calm();
    if (events & EVENT_CAUGHT) {
      audio.caught();
      screen = SCREEN_CAUGHT;
      announce('Caught! Press R to retry the level.');
    } else if (events & EVENT_LEVEL_CLEAR) {
      endLevel();
    } else if (events & EVENT_VICTORY) {
      endVictory();
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_RETRY && (screen === SCREEN_PLAY || screen === SCREEN_CAUGHT || screen === SCREEN_PAUSED)) {
      startLevel(world.levelIndex);
      return;
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE) startGame();
      else if (screen === SCREEN_LEVEL_CLEAR) startLevel(world.levelIndex + 1);
      else if (screen === SCREEN_VICTORY || screen === SCREEN_CAUGHT) startGame();
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // Attract mode: the wardens patrol behind the title.
      stepWorld(world, { x: 0, y: 0, sneak: false });
      return;
    }
    const events = stepWorld(world, input.direction());
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, { totalScore, best, muted: audio.isMuted() }, world.time);
  }

  canvas.addEventListener('click', () => {
    audio.unlock();
    if (screen === SCREEN_TITLE) startGame();
    else if (screen === SCREEN_LEVEL_CLEAR) startLevel(world.levelIndex + 1);
    else if (screen === SCREEN_VICTORY || screen === SCREEN_CAUGHT) startGame();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Shadow Lantern. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
