/**
 * The headless game simulation for one level: physics world, player, dynamic terrain,
 * checkpoints, timer, statistics, hazards and finish detection.
 *
 * No rendering, audio or DOM — the browser Game wraps this, and tests/bots drive it directly.
 * One call to tick() advances exactly 1/120 s.
 */
import { Emitter } from '../core/events';
import { SIM_DT } from '../core/loop';
import { quatFromEuler, type Vec3Tuple } from '../core/math';
import { createEntity, playerInVolume, type Entity, type EntityCtx } from '../entities/Entities';
import type { LevelData, LevelMeta } from '../levels/types';
import { MovementController } from '../movement/MovementController';
import { MoveState, type InputFrame } from '../movement/types';
import { PhysicsWorld } from '../physics/PhysicsWorld';

export interface RunStats {
  started: boolean;
  finished: boolean;
  ticks: number;
  splits: number[]; // time (s) at each checkpoint index (0 = start)
  deaths: number;
  restarts: number;
  jumps: number;
  doubleJumps: number;
  dashes: number;
  slides: number;
  slideDistance: number;
  wallRuns: number;
  wallJumps: number;
  wallTime: number;
  longestWallChain: number;
  vaults: number;
  airTime: number;
  distance: number;
  topSpeed: number;
  speedSum: number;
  collected: string[];
  shortcuts: string[];
}

export const newStats = (): RunStats => ({
  started: false,
  finished: false,
  ticks: 0,
  splits: [],
  deaths: 0,
  restarts: 0,
  jumps: 0,
  doubleJumps: 0,
  dashes: 0,
  slides: 0,
  slideDistance: 0,
  wallRuns: 0,
  wallJumps: 0,
  wallTime: 0,
  longestWallChain: 0,
  vaults: 0,
  airTime: 0,
  distance: 0,
  topSpeed: 0,
  speedSum: 0,
  collected: [],
  shortcuts: [],
});

export interface SimEvents {
  start: Record<string, never>;
  checkpoint: { index: number; time: number };
  death: { reason: string };
  respawn: { index: number };
  finish: { time: number };
  collect: { id: string; index: number };
  shortcut: { id: string; hidden: boolean };
  prompt: { index: number };
  signal: { kind: 'boost' | 'jumppad' | 'collapse' | 'telegraph'; entity: Entity };
  event: { name: string };
}

const RESPAWN_TICKS = 30; // 0.25 s

export class Simulation {
  readonly physics: PhysicsWorld;
  readonly player: MovementController;
  readonly entities: Entity[] = [];
  readonly events = new Emitter<SimEvents>();
  stats: RunStats = newStats();
  /** Level clock in seconds (drives all dynamic terrain). */
  time = 0;
  checkpoint = 0;
  dead = false;
  activePrompt = -1;
  /** Collectible ids already owned before this run (they are shown as ghosts). */
  collectedThisRun = new Set<string>();
  private deadTicks = 0;
  private fired = new Set<string>();
  private wallChain = 0;
  private ctx: EntityCtx;

  constructor(
    readonly meta: LevelMeta,
    readonly data: LevelData,
  ) {
    this.physics = new PhysicsWorld();
    this.player = new MovementController(this.physics);
    for (const s of data.solids) {
      if (s.collide === false) continue;
      const q = s.q ? { x: s.q[0], y: s.q[1], z: s.q[2], w: s.q[3] } : s.r ? quatFromEuler(s.r[0], s.r[1], s.r[2]) : undefined;
      this.physics.addBox({ x: s.p[0], y: s.p[1], z: s.p[2] }, { x: s.s[0] / 2, y: s.s[1] / 2, z: s.s[2] / 2 }, q, s.wallrun ?? false);
    }
    data.entities.forEach((def, i) => {
      const e = createEntity(def);
      e.index = i;
      this.entities.push(e);
      e.init(this.physics);
    });
    this.ctx = {
      player: this.player,
      time: 0,
      dt: SIM_DT,
      kill: (reason) => this.kill(reason),
      signal: (kind, entity) => this.events.emit('signal', { kind, entity }),
    };
    this.wireStats();
    this.physics.step();
    this.restart();
  }

  dispose() {
    this.events.clear();
    this.player.events.clear();
    this.physics.dispose();
  }

  get runTime() {
    return this.stats.ticks * SIM_DT;
  }

  private wireStats() {
    const ev = this.player.events;
    ev.on('jump', () => this.stats.jumps++);
    ev.on('doubleJump', () => this.stats.doubleJumps++);
    ev.on('dash', () => this.stats.dashes++);
    ev.on('slideStart', () => this.stats.slides++);
    ev.on('vault', () => this.stats.vaults++);
    ev.on('wallJump', () => this.stats.wallJumps++);
    ev.on('wallRunStart', () => {
      this.stats.wallRuns++;
      this.wallChain++;
      if (this.wallChain > this.stats.longestWallChain) this.stats.longestWallChain = this.wallChain;
    });
    ev.on('land', () => (this.wallChain = 0));
  }

  /** Full level restart: new run, everything back to its initial state. */
  restart() {
    this.stats = newStats();
    this.time = 0;
    this.checkpoint = 0;
    this.fired.clear();
    this.collectedThisRun.clear();
    for (const e of this.entities) e.reset(this.physics, true);
    this.placeAtCheckpoint();
  }

  /** Back to the last checkpoint; the timer keeps running. */
  restartFromCheckpoint() {
    if (this.stats.finished) return;
    this.stats.restarts++;
    for (const e of this.entities) e.reset(this.physics, false);
    this.placeAtCheckpoint();
  }

  private placeAtCheckpoint() {
    const cp = this.data.checkpoints[this.checkpoint] ?? { p: this.meta.spawn.p, yaw: this.meta.spawn.yaw };
    this.player.reset(cp.p[0], cp.p[1] + 0.05, cp.p[2], cp.yaw);
    this.dead = false;
    this.deadTicks = 0;
    this.wallChain = 0;
    this.events.emit('respawn', { index: this.checkpoint });
  }

  kill(reason: string) {
    if (this.dead || this.stats.finished) return;
    this.dead = true;
    this.deadTicks = RESPAWN_TICKS;
    this.stats.deaths++;
    this.player.kill();
    this.events.emit('death', { reason });
  }

  fire(name: string) {
    if (this.fired.has(name)) return;
    this.fired.add(name);
    for (const e of this.entities) e.onEvent(name, this.time);
    this.events.emit('event', { name });
  }

  tick(inp: InputFrame) {
    const st = this.stats;
    const pl = this.player;
    if (this.dead) {
      // the clock keeps running while dead: dying costs time
      if (st.started && !st.finished) st.ticks++;
      this.time += SIM_DT;
      this.updateEntities();
      if (--this.deadTicks <= 0) {
        for (const e of this.entities) e.reset(this.physics, false);
        this.placeAtCheckpoint();
      }
      return;
    }
    if (!st.started && (inp.moveX !== 0 || inp.moveZ !== 0 || inp.jumpPressed || inp.dashPressed)) {
      st.started = true;
      this.events.emit('start', {});
    }
    this.time += SIM_DT;
    pl.gravityScale = 1;
    this.updateEntities();
    if (this.dead) return;

    pl.tick(inp, SIM_DT);

    // standing on a dynamic entity?
    if (pl.grounded && pl.groundId !== -1) {
      const e = this.physics.metaOf(pl.groundId)?.entity ?? -1;
      if (e >= 0) this.entities[e].onStand(this.ctx);
    }

    if (st.started && !st.finished) {
      st.ticks++;
      const dx = pl.pos.x - pl.prevPos.x,
        dz = pl.pos.z - pl.prevPos.z;
      const d = Math.hypot(dx, dz, pl.pos.y - pl.prevPos.y);
      const sp = pl.speed;
      st.distance += d;
      st.speedSum += sp;
      if (sp > st.topSpeed) st.topSpeed = sp;
      const s = pl.state;
      if (s === MoveState.Slide) st.slideDistance += Math.hypot(dx, dz);
      else if (s === MoveState.WallRun) st.wallTime += SIM_DT;
      if (!pl.grounded && s !== MoveState.WallRun) st.airTime += SIM_DT;
    }

    if (pl.pos.y < this.meta.killY) {
      this.kill('void');
      return;
    }
    this.checkVolumes();
  }

  private updateEntities() {
    const c = this.ctx;
    c.time = this.time;
    for (const e of this.entities) e.update(c, this.physics);
    this.physics.step();
  }

  private checkVolumes() {
    const d = this.data,
      pl = this.player,
      st = this.stats;
    // checkpoints (may be skipped by shortcuts, so any later one counts)
    for (let i = this.checkpoint + 1; i < d.checkpoints.length; i++) {
      const c = d.checkpoints[i];
      const s = c.s ?? DEFAULT_CP;
      VOL[0] = c.p[0];
      VOL[1] = c.p[1] + s[1] / 2;
      VOL[2] = c.p[2];
      if (playerInVolume(pl, VOL, s)) {
        this.checkpoint = i;
        st.splits[i] = this.runTime;
        this.events.emit('checkpoint', { index: i, time: this.runTime });
        break;
      }
    }
    for (const t of d.triggers) {
      if (!this.fired.has(t.event) && playerInVolume(pl, t.p, t.s)) this.fire(t.event);
    }
    for (let i = 0; i < d.collectibles.length; i++) {
      const c = d.collectibles[i];
      if (this.collectedThisRun.has(c.id)) continue;
      const dx = pl.pos.x - c.p[0],
        dy = pl.pos.y + pl.height / 2 - c.p[1],
        dz = pl.pos.z - c.p[2];
      if (dx * dx + dy * dy + dz * dz < 2.2) {
        this.collectedThisRun.add(c.id);
        st.collected.push(c.id);
        this.events.emit('collect', { id: c.id, index: i });
      }
    }
    for (const sc of d.shortcuts) {
      if (!st.shortcuts.includes(sc.id) && playerInVolume(pl, sc.p, sc.s)) {
        st.shortcuts.push(sc.id);
        this.events.emit('shortcut', { id: sc.id, hidden: !!sc.hidden });
      }
    }
    let prompt = -1;
    for (let i = 0; i < d.prompts.length; i++) {
      if (playerInVolume(pl, d.prompts[i].p, d.prompts[i].s)) {
        prompt = i;
        break;
      }
    }
    if (prompt !== this.activePrompt) {
      this.activePrompt = prompt;
      this.events.emit('prompt', { index: prompt });
    }
    if (st.started && !st.finished && playerInVolume(pl, d.finish.p, d.finish.s)) {
      st.finished = true;
      this.events.emit('finish', { time: this.runTime });
    }
  }
}

const DEFAULT_CP: Vec3Tuple = [7, 6, 3];
const VOL: Vec3Tuple = [0, 0, 0];
