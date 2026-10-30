// Shooter-style controls: WASD — walk, mouse — look (sideways and up/down), arrows and PageUp/PageDown too, run — Ctrl or W twice (hold the second time).
// Gamepad — sticks and buttons (the pad* fields, filled in by the game from src/game/gamepad.ts).
// Space — jump; hold to jump again as soon as you touch the ground (bunny hop, as in Quake and Half-Life): on the ground speed
// is normal, in the air there is no friction, and strafing (A or D) while turning the mouse the same way builds speed — with no speed limit.
// Fast movement goes in small steps so as not to fly through a wall.
import { solidAt, type Level } from './level.ts';
import { MAX_PITCH, MIN_PITCH, type Camera } from './renderer.ts';

const RADIUS = 0.22;
const WALK = 2.6;
const RUN_FACTOR = 1.7;
/**
 * Running (client request, 2026-10-27: Shift is freed for the dash) — while Ctrl is held, or W is pressed a second time no later than
 * this many milliseconds after it was released, and held.
 */
const DOUBLE_TAP_MS = 300;
const TURN = 2.4;
const MOUSE_SENSITIVITY = 0.0028;
/** Pitch pixels per pixel of mouse movement, and pitch speed with keys. */
const MOUSE_PITCH = 0.35;
const KEY_PITCH = 160;
/** Jump: upward speed and gravity (cells per second and per second squared) — about a third of a wall high, half a second in the air. */
const JUMP_SPEED = 2.3;
const GRAVITY = 9;
/** Air acceleration, as in Quake: the key press itself gives very little speed (AIR_CAP); turning along with the strafe is what builds it. */
const AIR_ACCEL = 25;
const AIR_CAP = 0.45;
/**
 * Mouse spike: Chromium on Windows with pointer lock sometimes sends one huge movement in the middle of normal ones — about
 * half the screen width, which spins the camera almost all the way round; when bunny hopping, with fast mouse movement, it also killed the momentum
 * (client request, 2026-10-22). A spike is more than MOUSE_SPIKE points per event and four times the previous one: this catches it even
 * in the middle of a fast turn, while a real mouse never accelerates that sharply within one event.
 */
const MOUSE_SPIKE = 250;
export const isMouseSpike = (d: number, last: number): boolean => Math.abs(d) > MOUSE_SPIKE && Math.abs(d) > 4 * Math.max(Math.abs(last), 15);

/** Length of one step during fast movement (in cells): faster — more steps, so you can't slip through a wall. */
const SUBSTEP = 0.2;
/** The eyes don't rise above this (otherwise the camera would end up above walls of height 1). */
const MAX_JUMP = 0.4;

export class Player implements Camera {
  x: number;
  y: number;
  angle: number;
  pitch = 0;
  /** Mouse sensitivity multiplier (1 — as intended) and vertical look inversion: "Settings" in the pause menu. */
  sensitivity = 1;
  invertY = false;
  /** Sneaking: walks at half speed and doesn't run. */
  sneaking = false;
  /** W pressed a second time in a row and held — running (DOUBLE_TAP_MS). */
  private wRun = false;
  private wReleasedAt = -Infinity;
  /** Whether running right now (Ctrl or double W and moving, or fast bunny-hop running) — for footstep noise. */
  running = false;
  /** Height above the floor (in a jump) — the camera rises by it. */
  z = 0;
  /** Frozen (stunned by a hit): on the ground doesn't walk or jump, can still look around. */
  frozen = false;
  /** How much lower than usual the eyes are (cells): a knocked-down hero is lying down (play.ts, combat.ts → knockView). */
  eyeDrop = 0;
  /**
   * What the game allows (combat, injuries): running (Ctrl or double W), jumping and a step speed multiplier (crippled leg). In combat
   * without action points — walking only (src/game/hero.ts → RUN_AP, JUMP_AP).
   */
  canRun = true;
  canJump = true;
  speedScale = 1;
  /**
   * Gamepad (play.ts → padState): left stick — where to go (x — right, y — forward; length up to 1 — partial deflection goes
   * slower), look with the right stick — radians and pitch points per second, run (left stick click) and jump (hold — bunny hop).
   */
  padMove = { x: 0, y: 0 };
  padTurn = 0;
  padPitch = 0;
  padRun = false;
  padJump = false;
  /** How many times pushed off the ground (the game charges AP for each jump). */
  jumps = 0;

  /** In a jump: above the floor or just pushed off. */
  get airborne(): boolean {
    return this.z > 0 || this.vz > 0;
  }
  /** Speed along the floor and upward, cells per second. */
  vx = 0;
  vy = 0;
  private vz = 0;
  private readonly keys = new Set<string>();
  private mouseTurn = 0;
  private mousePitch = 0;
  /** Previous mouse movement (for filtering out spikes). */
  private lastDx = 0;
  private lastDy = 0;

  constructor(start: { x: number; y: number; angle: number }) {
    this.x = start.x;
    this.y = start.y;
    this.angle = start.angle;
  }

  attach(target: HTMLElement): () => void {
    const down = (e: KeyboardEvent) => {
      this.keys.add(e.code);
      if (e.code === 'KeyW' && !e.repeat) this.wRun = performance.now() - this.wReleasedAt <= DOUBLE_TAP_MS;
      if (e.code.startsWith('Arrow') || e.code.startsWith('Page') || e.code === 'Home' || e.code === 'End') e.preventDefault();
      // Home or End — look straight ahead.
      if (e.code === 'Home' || e.code === 'End') this.pitch = 0;
    };
    const up = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyW') {
        this.wReleasedAt = performance.now();
        this.wRun = false;
      }
    };
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement !== target) return;
      const dx = e.movementX;
      const dy = e.movementY;
      // Skip the spike; still remember it as the previous one: a fast mouse flick from rest gets through from the second event.
      const spike = isMouseSpike(dx, this.lastDx) || isMouseSpike(dy, this.lastDy);
      this.lastDx = dx;
      this.lastDy = dy;
      if (spike) return;
      this.mouseTurn += dx * MOUSE_SENSITIVITY * this.sensitivity;
      // Mouse up — look up (inverted — down).
      this.mousePitch -= dy * MOUSE_PITCH * this.sensitivity * (this.invertY ? -1 : 1);
    };
    const blur = () => {
      this.keys.clear();
      this.wRun = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mousemove', move);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('blur', blur);
    };
  }

  /** obstacles — living critters you can't walk through (enemies: so that no one ends up "underfoot"). */
  update(dt: number, level: Level, obstacles: readonly Obstacle[] = []): void {
    const k = this.keys;
    const turn = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    this.angle += turn * TURN * dt + this.mouseTurn + this.padTurn * dt;
    this.mouseTurn = 0;
    const look = (k.has('PageUp') ? 1 : 0) - (k.has('PageDown') ? 1 : 0);
    const padPitch = this.padPitch * dt * (this.invertY ? -1 : 1);
    this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch + this.mousePitch + look * KEY_PITCH * dt + padPitch));
    this.mousePitch = 0;

    // The up and down arrows don't walk: they scroll the message screen (play.ts → Hud.scrollLog).
    const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
    const forward = clamp1((k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + this.padMove.y);
    const strafe = clamp1((k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.padMove.x);
    const len = this.frozen ? 0 : Math.hypot(forward, strafe);
    // Keys — always a full step; stick not fully deflected — a slower step.
    const amount = Math.min(1, len);
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    // Where it wants to go (unit vector) and how fast it would walk on the ground.
    const wishX = len ? (forward * cos - strafe * sin) / len : 0;
    const wishY = len ? (forward * sin + strafe * cos) / len : 0;
    const runKey = k.has('ControlLeft') || k.has('ControlRight') || (this.wRun && k.has('KeyW')) || this.padRun;
    const shift = !this.sneaking && this.canRun && runKey;
    const wishSpeed = len ? amount * WALK * this.speedScale * (this.sneaking ? 0.5 : shift ? RUN_FACTOR : 1) : 0;

    // Jump: from the ground, while space is held (no jumping while sneaking). Touched the ground with space held — straight back up.
    if (this.z <= 0 && this.vz <= 0 && (k.has('Space') || this.padJump) && !this.sneaking && !this.frozen && this.canJump) {
      this.vz = JUMP_SPEED;
      this.jumps++;
    }
    const airborne = this.z > 0 || this.vz > 0;
    if (!airborne) {
      // On the ground — as before: the desired speed at once, release the keys — stand still.
      this.vx = wishX * wishSpeed;
      this.vy = wishY * wishSpeed;
    } else if (len) {
      // No friction in the air; speed is added only in the direction where it is low (as in Quake) — with no limit.
      const current = this.vx * wishX + this.vy * wishY;
      const add = Math.min(AIR_CAP, wishSpeed) - current;
      if (add > 0) {
        const accel = Math.min(AIR_ACCEL * wishSpeed * dt, add);
        this.vx += accel * wishX;
        this.vy += accel * wishY;
      }
    }
    if (airborne) {
      this.z = Math.min(MAX_JUMP, this.z + this.vz * dt);
      this.vz -= GRAVITY * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
      }
    }
    const speed = Math.hypot(this.vx, this.vy);
    this.running = speed > 0 && (shift || speed > WALK * 1.3);
    if (speed === 0) return;

    // In small steps, per axis separately — to slide along walls instead of getting stuck or flying through them.
    const free = (x: number, y: number) => !blocked(level, x, y) && !bumps(obstacles, this.x, this.y, x, y);
    const steps = Math.max(1, Math.ceil((speed * dt) / SUBSTEP));
    const sx = (this.vx * dt) / steps;
    const sy = (this.vy * dt) / steps;
    let stopX = false;
    let stopY = false;
    for (let i = 0; i < steps; i++) {
      if (!stopX && sx) {
        if (free(this.x + sx, this.y)) this.x += sx;
        else stopX = true;
      }
      if (!stopY && sy) {
        if (free(this.x, this.y + sy)) this.y += sy;
        else stopY = true;
      }
    }
    // Bumped into something — speed in that direction dies (keeps sliding along the wall).
    if (stopX) this.vx = 0;
    if (stopY) this.vy = 0;
  }

  /** Place the hero (transition, load): with no momentum and on the ground. */
  placeAt(x: number, y: number, angle: number): void {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.z = 0;
  }
}

export interface Obstacle {
  x: number;
  y: number;
  alive: boolean;
}

/** Distance closer than which the player and a critter don't come together. */
const PERSONAL_SPACE = 0.45;

/** A step is blocked by a critter if it gets closer than allowed (moving away is fine). */
function bumps(obstacles: readonly Obstacle[], x0: number, y0: number, x: number, y: number): boolean {
  return obstacles.some((o) => {
    if (!o.alive) return false;
    const after = Math.hypot(o.x - x, o.y - y);
    return after < PERSONAL_SPACE && after < Math.hypot(o.x - x0, o.y - y0);
  });
}

export function blocked(level: Level, x: number, y: number, radius = RADIUS): boolean {
  return (
    solidAt(level, x - radius, y - radius) ||
    solidAt(level, x + radius, y - radius) ||
    solidAt(level, x - radius, y + radius) ||
    solidAt(level, x + radius, y + radius)
  );
}
