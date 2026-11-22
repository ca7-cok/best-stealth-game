// Shadow Lantern — the renderer. One clear job: paint the world on the
// canvas. Night lighting (a darkness layer with light cut around the player,
// the lanterns and the exit), vision cones clipped by walls with a ray fan,
// the hooded thief, the armored wardens, and every screen: title, pause,
// caught, level clear and victory. No randomness: floor variation and
// fireflies come from a fixed hash of their tile or index.

import {
  COLORS,
  COLS,
  GUARD_VISION_HALF_ANGLE,
  GUARD_VISION_RANGE,
  ROWS,
  SCREEN_CAUGHT,
  SCREEN_LEVEL_CLEAR,
  SCREEN_PAUSED,
  SCREEN_TITLE,
  SCREEN_VICTORY,
  TILE,
  VIEW_H,
  VIEW_W,
} from './config.js';
import { alarmLevel, anyChasing, levelScore } from './world.js';
import { tileAt } from './levels.js';

const CONE_RAYS = 56;

/** A fixed hash of two integers, in [0, 1): floor shade, fireflies, sparks. */
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}

/** Ray-march from (x, y) along `angle` until a wall or `maxDist`; returns the distance. */
function rayDistance(level, x, y, angle, maxDist) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const step = 0.12;
  for (let d = step; d < maxDist; d += step) {
    const px = x + dx * d;
    const py = y + dy * d;
    if (px < 0 || py < 0 || px >= COLS || py >= ROWS) return d;
    if (tileAt(level, Math.floor(px), Math.floor(py)) === '#') return Math.max(0.15, d - step);
  }
  return maxDist;
}

/** The vision cone as a polygon, clipped by walls: one ray per slice of the arc. */
export function conePolygon(level, guard) {
  const pts = [{ x: guard.x, y: guard.y }];
  for (let i = 0; i <= CONE_RAYS; i++) {
    const a = guard.dir - GUARD_VISION_HALF_ANGLE + (2 * GUARD_VISION_HALF_ANGLE * i) / CONE_RAYS;
    const d = rayDistance(level, guard.x, guard.y, a, GUARD_VISION_RANGE);
    pts.push({ x: guard.x + Math.cos(a) * d, y: guard.y + Math.sin(a) * d });
  }
  return pts;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const dark = document.createElement('canvas');
  dark.width = VIEW_W;
  dark.height = VIEW_H;
  const dctx = dark.getContext('2d');

  function px(v) {
    return v * TILE;
  }

  /** A radial light hole punched out of the darkness layer. */
  function punchLight(x, y, radiusTiles, strength) {
    const g = dctx.createRadialGradient(px(x), px(y), 0, px(x), px(y), px(radiusTiles));
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.7, `rgba(0,0,0,${strength * 0.55})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g;
    dctx.beginPath();
    dctx.arc(px(x), px(y), px(radiusTiles), 0, Math.PI * 2);
    dctx.fill();
  }

  function drawFloor(world, time) {
    const level = world.level;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = tileAt(level, x, y);
        const h = hash2(x, y);
        if (t === '#') {
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(px(x), px(y), TILE, TILE);
          // A lit top edge where a wall meets open floor above it.
          if (y + 1 < ROWS && tileAt(level, x, y + 1) !== '#') {
            ctx.fillStyle = COLORS.wallTop;
            ctx.fillRect(px(x), px(y) + TILE - 5, TILE, 5);
          }
          if (y > 0 && tileAt(level, x, y - 1) !== '#') {
            ctx.fillStyle = COLORS.wallFace;
            ctx.fillRect(px(x), px(y), TILE, 4);
          }
          continue;
        }
        ctx.fillStyle = h > 0.5 ? COLORS.floorA : COLORS.floorB;
        ctx.fillRect(px(x), px(y), TILE, TILE);
        if (h > 0.82) {
          ctx.fillStyle = 'rgba(255,255,255,0.03)';
          ctx.fillRect(px(x) + 6, px(y) + 6, TILE - 12, TILE - 12);
        }
        ctx.strokeStyle = COLORS.floorEdge;
        ctx.lineWidth = 1;
        ctx.strokeRect(px(x) + 0.5, px(y) + 0.5, TILE - 1, TILE - 1);
        if (t === ',') {
          // Bush: a dark thicket with two tones of leaves.
          ctx.fillStyle = COLORS.bush;
          ctx.fillRect(px(x), px(y), TILE, TILE);
          ctx.fillStyle = COLORS.bushLeaf;
          for (let i = 0; i < 3; i++) {
            const lx = px(x) + 6 + hash2(x * 3 + i, y) * (TILE - 12);
            const ly = px(y) + 6 + hash2(x, y * 3 + i) * (TILE - 12);
            ctx.beginPath();
            ctx.arc(lx, ly, 7 + hash2(x + i, y + i) * 4, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = COLORS.bushLeaf2;
          ctx.beginPath();
          ctx.arc(px(x) + 10 + hash2(x, y) * 12, px(y) + 10 + hash2(y, x) * 12, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawExit(world, time) {
    const { exit } = world;
    const cx = px(exit.x);
    const cy = px(exit.y);
    const pulse = 0.75 + 0.25 * Math.sin(time * 2);
    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, TILE * 1.6);
    if (world.exitOpen) {
      glow.addColorStop(0, `rgba(191,227,255,${0.85 * pulse})`);
      glow.addColorStop(1, 'rgba(191,227,255,0)');
    } else {
      glow.addColorStop(0, 'rgba(120,140,190,0.25)');
      glow.addColorStop(1, 'rgba(120,140,190,0)');
    }
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 1.6, 0, Math.PI * 2);
    ctx.fill();
    // Stone arch.
    ctx.fillStyle = '#2c3552';
    ctx.fillRect(cx - 15, cy - 14, 6, 30);
    ctx.fillRect(cx + 9, cy - 14, 6, 30);
    ctx.fillRect(cx - 15, cy - 16, 30, 6);
    ctx.fillStyle = world.exitOpen ? COLORS.exitGlow : '#5a6a94';
    ctx.beginPath();
    ctx.arc(cx, cy + 2, 9, 0, Math.PI * 2);
    ctx.fill();
    if (!world.exitOpen) {
      // Bars across a locked gate.
      ctx.strokeStyle = '#8a94b5';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - 9, cy + i * 6);
        ctx.lineTo(cx + 9, cy + i * 6);
        ctx.stroke();
      }
    }
  }

  function drawLantern(world, lantern, time) {
    const cx = px(lantern.x);
    const cy = px(lantern.y);
    if (lantern.taken) {
      // A spent hook: a faint ember where the lantern hung.
      ctx.fillStyle = 'rgba(255,180,80,0.25)';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const flicker = 0.8 + 0.2 * Math.sin(time * 5 + lantern.x * 3 + lantern.y * 7);
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, TILE * 1.1);
    glow.addColorStop(0, `rgba(255,211,122,${0.8 * flicker})`);
    glow.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 1.1, 0, Math.PI * 2);
    ctx.fill();
    // The lantern itself: a little hanging lamp.
    ctx.strokeStyle = '#3a2f1c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy - 5);
    ctx.stroke();
    ctx.fillStyle = '#2b2118';
    ctx.fillRect(cx - 6, cy - 5, 12, 12);
    ctx.fillStyle = COLORS.lanternCore;
    ctx.beginPath();
    ctx.arc(cx, cy + 1, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCone(world, guard) {
    const alert = guard.state === 'chase';
    const poly = conePolygon(world.level, guard);
    ctx.beginPath();
    ctx.moveTo(px(poly[0].x), px(poly[0].y));
    for (let i = 1; i < poly.length; i++) ctx.lineTo(px(poly[i].x), px(poly[i].y));
    ctx.closePath();
    ctx.fillStyle = alert ? COLORS.coneAlert : COLORS.cone;
    ctx.fill();
    ctx.strokeStyle = alert ? COLORS.coneAlertEdge : COLORS.coneEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawGuard(world, guard, time) {
    const cx = px(guard.x);
    const cy = px(guard.y);
    const alert = guard.state === 'chase';
    // A faint red pool under the guard so it reads against the floor.
    const pool = ctx.createRadialGradient(cx, cy, 2, cx, cy, TILE * 0.9);
    pool.addColorStop(0, alert ? 'rgba(255,80,60,0.35)' : 'rgba(224,101,95,0.22)');
    pool.addColorStop(1, 'rgba(224,101,95,0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.9, 0, Math.PI * 2);
    ctx.fill();
    // Body: armored shoulders and helmet, facing the patrol direction.
    const bob = Math.sin(time * 6 + guard.x) * 0.8;
    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.rotate(guard.dir);
    ctx.fillStyle = COLORS.guardDark;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.guardArmor;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    // Spear held forward.
    ctx.strokeStyle = '#c9d2e8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.lineTo(20, 2);
    ctx.stroke();
    ctx.fillStyle = '#e8ecf8';
    ctx.beginPath();
    ctx.moveTo(20, 2);
    ctx.lineTo(15, 0);
    ctx.lineTo(15, 4);
    ctx.closePath();
    ctx.fill();
    // Helmet crest.
    ctx.fillStyle = COLORS.guardHelmet;
    ctx.beginPath();
    ctx.arc(2, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Suspicion: a rising arc, then ? then !.
    if (guard.suspicion > 0.05 && guard.state !== 'chase') {
      ctx.strokeStyle = guard.suspicion > 0.6 ? '#ffb347' : '#ffe9a8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * guard.suspicion);
      ctx.stroke();
    }
    if (guard.suspicion > 0.35 && guard.state !== 'chase') {
      ctx.fillStyle = '#ffe9a8';
      ctx.font = 'bold 17px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', cx, cy - 20);
    }
    if (alert) {
      ctx.fillStyle = '#ff5a4a';
      ctx.font = 'bold 22px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', cx, cy - 22);
    }
  }

  function drawPlayer(world, time) {
    const { player } = world;
    const cx = px(player.x);
    const cy = px(player.y);
    // The thief's own lantern light.
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, TILE * 1.4);
    glow.addColorStop(0, 'rgba(125,211,252,0.30)');
    glow.addColorStop(1, 'rgba(125,211,252,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 1.4, 0, Math.PI * 2);
    ctx.fill();
    const crouch = player.sneaking ? 0.82 : 1;
    const bob = player.moving ? Math.sin(time * 10) * 1.2 : Math.sin(time * 2) * 0.6;
    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.globalAlpha = player.hidden ? 0.55 : 1;
    ctx.rotate(player.dir);
    // Cloak: a teardrop pointing where the thief moves.
    ctx.fillStyle = '#0f2b46';
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.quadraticCurveTo(2, -11, -9, -6);
    ctx.quadraticCurveTo(-12, 0, -9, 6);
    ctx.quadraticCurveTo(2, 11, 13, 0);
    ctx.fill();
    ctx.fillStyle = COLORS.playerCloak;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5 * crouch + 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Hood and a glint of the face.
    ctx.fillStyle = COLORS.playerHood;
    ctx.beginPath();
    ctx.arc(3, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1020';
    ctx.beginPath();
    ctx.arc(5, -1.5, 1.6, 0, Math.PI * 2);
    ctx.arc(5, 1.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (player.hidden) {
      ctx.fillStyle = COLORS.safe;
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HIDDEN', cx, cy - 20);
    }
  }

  function drawNoiseRings(world) {
    for (const ring of world.noise) {
      ctx.strokeStyle = `rgba(232,236,248,${0.35 * (1 - ring.r / ring.max)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px(ring.x), px(ring.y), px(ring.r), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawFireflies(world, time) {
    for (let i = 0; i < 22; i++) {
      const fx = hash2(i, 7) * COLS;
      const fy = hash2(i, 13) * ROWS;
      const dx = Math.sin(time * 0.4 + i * 2.1) * 0.4;
      const dy = Math.cos(time * 0.3 + i * 1.7) * 0.4;
      const twinkle = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * 1.5 + i * 2.4));
      ctx.fillStyle = `rgba(255,230,150,${twinkle})`;
      ctx.beginPath();
      ctx.arc(px(fx + dx), px(fy + dy), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDarkness(world) {
    dctx.clearRect(0, 0, VIEW_W, VIEW_H);
    dctx.globalCompositeOperation = 'source-over';
    dctx.fillStyle = COLORS.darkness;
    dctx.fillRect(0, 0, VIEW_W, VIEW_H);
    dctx.globalCompositeOperation = 'destination-out';
    const { player } = world;
    punchLight(player.x, player.y, 3.4, 0.95);
    for (const lantern of world.lanterns) {
      if (!lantern.taken) punchLight(lantern.x, lantern.y, 1.7, 0.8);
    }
    punchLight(world.exit.x, world.exit.y, 2.3, 0.85);
    for (const guard of world.guards) punchLight(guard.x, guard.y, 1.5, 0.55);
    ctx.drawImage(dark, 0, 0);
  }

  function drawHud(world, ui) {
    const alarm = alarmLevel(world);
    const chasing = anyChasing(world);
    // Top bar.
    ctx.fillStyle = COLORS.hudPanel;
    ctx.fillRect(0, 0, VIEW_W, 34);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${world.levelIndex + 1} · ${world.level.name}`, 12, 22);
    // Lanterns.
    ctx.textAlign = 'center';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = COLORS.gold;
    ctx.fillText(`Lanterns ${world.collected} / ${world.total}`, VIEW_W / 2 - 70, 22);
    // Alarm meter.
    const barX = VIEW_W / 2 + 10;
    const barW = 150;
    ctx.fillStyle = '#141a2e';
    ctx.fillRect(barX, 11, barW, 12);
    ctx.fillStyle = chasing ? COLORS.danger : alarm > 0.35 ? '#ffb347' : '#5a6a94';
    ctx.fillRect(barX, 11, barW * Math.min(1, alarm), 12);
    ctx.strokeStyle = '#3a4668';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, 11.5, barW, 12);
    ctx.fillStyle = chasing ? COLORS.danger : COLORS.hudDim;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(chasing ? 'SPOTTED!' : alarm > 0.35 ? 'SUSPICIOUS…' : 'UNSEEN', barX + barW + 10, 22);
    // Time and score.
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.hudText;
    ctx.font = '14px system-ui, sans-serif';
    const mins = Math.floor(world.time / 60);
    const secs = Math.floor(world.time % 60);
    ctx.fillText(`${mins}:${String(secs).padStart(2, '0')}   ★ ${ui.totalScore + levelScore(world)}`, VIEW_W - 12, 22);
    // Bottom hint line.
    ctx.textAlign = 'left';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = COLORS.hudDim;
    const hint = world.exitOpen
      ? 'The moon-gate stands open — reach it unseen.'
      : `Collect every lantern to open the moon-gate.  WASD move · Shift sneak · M mute`;
    ctx.fillText(hint, 12, VIEW_H - 12);
    if (ui.muted) {
      ctx.textAlign = 'right';
      ctx.fillText('MUTED', VIEW_W - 12, VIEW_H - 12);
    }
  }

  function dimOverlay(alpha) {
    ctx.fillStyle = `rgba(3,5,16,${alpha})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(6,10,24,0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#3a4668';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawTitle(world, ui, time) {
    dimOverlay(0.45);
    const w = 560;
    const h = 400;
    const x = (VIEW_W - w) / 2;
    const y = 96;
    panel(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 46px Georgia, serif';
    ctx.fillText('SHADOW LANTERN', VIEW_W / 2, y + 66);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'italic 16px Georgia, serif';
    ctx.fillText('A stealth game in three night gardens', VIEW_W / 2, y + 96);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText('You are Wren, the lantern thief. The wardens patrol the grounds', VIEW_W / 2, y + 132);
    ctx.fillText('with their lantern-light cones. Gather every lantern, then slip', VIEW_W / 2, y + 154);
    ctx.fillText('through the moon-gate — unseen, unheard, uncaught.', VIEW_W / 2, y + 176);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('WASD / ARROWS — move      SHIFT — sneak (slow, quiet, hard to spot)', VIEW_W / 2, y + 214);
    ctx.fillText('Bushes hide you · Running is heard · A spotted warden gives chase', VIEW_W / 2, y + 238);
    ctx.fillText('ESC — pause      M — mute      R — retry the level', VIEW_W / 2, y + 262);
    const blink = 0.55 + 0.45 * Math.sin(time * 3);
    ctx.fillStyle = `rgba(255,217,122,${blink})`;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText('— Press SPACE or click to begin —', VIEW_W / 2, y + 312);
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('Three levels: The Garden Gate · The Lantern Court · The Moon Vault', VIEW_W / 2, y + 344);
    if (ui.best > 0) {
      ctx.fillStyle = COLORS.gold;
      ctx.fillText(`Best score: ${ui.best}`, VIEW_W / 2, y + 368);
    }
  }

  function drawPaused() {
    dimOverlay(0.6);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'bold 40px Georgia, serif';
    ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 10);
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('ESC or P to resume · R to retry the level · M to mute', VIEW_W / 2, VIEW_H / 2 + 26);
  }

  function drawCaught(world) {
    dimOverlay(0.55);
    ctx.fillStyle = 'rgba(120,10,10,0.25)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff8a7a';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.fillText('CAUGHT!', VIEW_W / 2, VIEW_H / 2 - 40);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('A warden seizes your cloak and drags you back to the gate.', VIEW_W / 2, VIEW_H / 2 + 2);
    ctx.fillText(`Level ${world.levelIndex + 1} · ${world.collected} of ${world.total} lanterns gathered`, VIEW_W / 2, VIEW_H / 2 + 28);
    const blink = 0.55 + 0.45 * Math.sin(Date.now() / 300);
    ctx.fillStyle = `rgba(255,217,122,${blink})`;
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText('— Press R or click to try the level again —', VIEW_W / 2, VIEW_H / 2 + 72);
  }

  function drawLevelClear(world, ui) {
    dimOverlay(0.55);
    const score = levelScore(world);
    const w = 460;
    const h = 300;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    panel(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 36px Georgia, serif';
    ctx.fillText('LEVEL CLEAR', VIEW_W / 2, y + 58);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(`${world.level.name} — slipped through unseen`, VIEW_W / 2, y + 92);
    ctx.textAlign = 'left';
    ctx.font = '15px system-ui, sans-serif';
    const rows = [
      [`Lanterns  ${world.collected} × 100`, world.collected * 100],
      ['Ghost bonus (never spotted)', world.spotted ? 0 : 300],
      ['Time bonus', score - world.collected * 100 - (world.spotted ? 0 : 300)],
      ['Level score', score],
    ];
    rows.forEach(([label, value], i) => {
      const ry = y + 132 + i * 28;
      ctx.fillStyle = i === 3 ? COLORS.gold : COLORS.hudText;
      ctx.font = i === 3 ? 'bold 16px system-ui, sans-serif' : '15px system-ui, sans-serif';
      ctx.fillText(label, x + 40, ry);
      ctx.textAlign = 'right';
      ctx.fillText(String(value), x + w - 40, ry);
      ctx.textAlign = 'left';
    });
    ctx.textAlign = 'center';
    const blink = 0.55 + 0.45 * Math.sin(Date.now() / 300);
    ctx.fillStyle = `rgba(255,217,122,${blink})`;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('— Press SPACE or click for the next level —', VIEW_W / 2, y + h - 26);
  }

  function drawVictory(world, ui) {
    dimOverlay(0.6);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText('THE MOON VAULT IS YOURS', VIEW_W / 2, VIEW_H / 2 - 70);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'italic 17px Georgia, serif';
    ctx.fillText('Three gardens, every lantern, and not a single warden the wiser —', VIEW_W / 2, VIEW_H / 2 - 34);
    ctx.fillText('or so the night will remember it.', VIEW_W / 2, VIEW_H / 2 - 10);
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = COLORS.gold;
    ctx.fillText(`Total score: ${ui.totalScore + levelScore(world)}`, VIEW_W / 2, VIEW_H / 2 + 34);
    if (world.spotted) {
      ctx.fillStyle = COLORS.hudDim;
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('Spotted along the way — a perfect ghost run is still out there.', VIEW_W / 2, VIEW_H / 2 + 62);
    } else {
      ctx.fillStyle = COLORS.safe;
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText('PERFECT GHOST — never spotted, not once.', VIEW_W / 2, VIEW_H / 2 + 62);
    }
    const blink = 0.55 + 0.45 * Math.sin(Date.now() / 300);
    ctx.fillStyle = `rgba(255,217,122,${blink})`;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('— Press SPACE or click to play again —', VIEW_W / 2, VIEW_H / 2 + 104);
  }

  /** Paint one frame: the world, then the screen on top of it. */
  function draw(world, screen, ui, time) {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#0a0e1d';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawFloor(world, time);
    drawFireflies(world, time);
    drawDarkness(world);
    drawExit(world, time);
    for (const lantern of world.lanterns) drawLantern(world, lantern, time);
    for (const guard of world.guards) drawCone(world, guard);
    drawNoiseRings(world);
    for (const guard of world.guards) drawGuard(world, guard, time);
    drawPlayer(world, time);
    drawHud(world, ui);
    if (screen === SCREEN_TITLE) drawTitle(world, ui, time);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_CAUGHT) drawCaught(world);
    else if (screen === SCREEN_LEVEL_CLEAR) drawLevelClear(world, ui);
    else if (screen === SCREEN_VICTORY) drawVictory(world, ui);
  }

  return { draw };
}
