/**
 * Waypoint-following autopilot.
 *
 * Used by the automated level tests ("can the main line still be completed?") and to calibrate
 * medal times. It plays through the real simulation with ordinary inputs — it has no special
 * powers — so if the bot can finish a level, the route physically works.
 */
import { angleDelta } from '../core/math';
import { emptyInput, MoveState, type InputFrame, type RayHit } from '../movement/types';
import { Mover } from '../entities/Entities';
import type { Simulation } from './Simulation';

export class Bot {
  index = 0;
  private inp: InputFrame = emptyInput();
  private sliding = false;
  private queue: string[] = [];
  private wait = 0;
  private waitingForGround = false;
  private deferred = '';
  private waitAhead = 0;
  /** 'g': hold here until the next telegraphing crusher ahead has just lifted (what a player would do). */
  private gating = false;
  private deaths = 0;
  private hit = {} as RayHit;
  stuckTicks = 0;

  constructor(private sim: Simulation) {
    this.inp.yaw = sim.meta.spawn.yaw;
  }

  /** Pick the waypoint to resume from after a respawn. */
  private resync() {
    const pts = this.sim.data.bot;
    const p = this.sim.player.pos;
    let best = 0,
      bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i].p[0] - p.x, pts[i].p[2] - p.z) + Math.abs(pts[i].p[1] - p.y) * 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    this.index = Math.min(pts.length - 1, best + 1);
    this.queue.length = 0;
    this.sliding = false;
    this.wait = 0;
    this.waitingForGround = false;
    this.deferred = '';
    this.gating = false;
  }

  step(): InputFrame {
    const sim = this.sim,
      pl = sim.player,
      inp = this.inp,
      pts = sim.data.bot;
    inp.jumpPressed = inp.dashPressed = inp.slidePressed = false;
    if (sim.stats.deaths !== this.deaths && !sim.dead) {
      this.deaths = sim.stats.deaths;
      this.resync();
    }
    if (sim.dead || this.index >= pts.length) {
      inp.moveZ = this.index >= pts.length ? 1 : 0;
      return inp;
    }
    const pt = pts[this.index];
    const dx = pt.p[0] - pl.pos.x,
      dz = pt.p[2] - pl.pos.z;
    const dist = Math.hypot(dx, dz);
    const targetYaw = Math.atan2(-dx, -dz);
    // turn quickly but not instantly (a human-like 12 rad/s)
    const dy = angleDelta(inp.yaw, targetYaw);
    inp.yaw += Math.max(-0.1, Math.min(0.1, dy));
    inp.pitch = 0;
    inp.moveZ = 1;
    inp.moveX = 0;
    inp.sprint = true;
    inp.jumpHeld = true;

    if (this.gating) {
      let next: Mover | undefined;
      for (const e of sim.entities)
        if (e instanceof Mover && e.def.telegraph && e.p.z > pl.pos.z && (!next || e.p.z < next.p.z))
          next = e;
      const rest = next ? (next.def.rest ?? next.def.pause ?? 0) : 0;
      if (next && !(next.atRest && next.restLeft > rest - 0.1)) {
        inp.moveZ = 0;
        return inp;
      }
      this.gating = false;
    }

    if (this.waitingForGround) {
      const n = pts[Math.min(pts.length - 1, this.index + this.waitAhead)];
      const ok = sim.physics.raycast(n.p[0], n.p[1] + 0.45, n.p[2], 0, -1, 0, 0.9, this.hit);
      if (!ok) {
        inp.moveZ = 0;
        return inp;
      }
      this.waitingForGround = false;
      const deferred = this.deferred;
      this.deferred = '';
      if (deferred) this.perform(deferred);
    }

    // queued timed actions (double jump at apex, dash after jump…)
    if (this.queue.length) {
      const a = this.queue[0];
      if (this.wait > 0) this.wait--;
      else if (a === 'J2') {
        if (pl.vel.y < 1.5 && !pl.grounded) {
          inp.jumpPressed = true;
          this.queue.shift();
          this.wait = 10;
        } else if (pl.grounded && pl.airTime === 0 && this.wait === 0) {
          // landed before the double jump was needed
          this.queue.shift();
        }
      } else if (a === 'D') {
        inp.dashPressed = true;
        this.queue.shift();
        this.wait = 6;
      } else if (a === 'DA') {
        // dash near the apex
        if (pl.vel.y < 2 || pl.state === MoveState.WallRun) {
          inp.dashPressed = true;
          this.queue.shift();
        }
      } else if (a === 'WJ') {
        if (pl.state === MoveState.WallRun) {
          inp.jumpPressed = true;
          this.queue.shift();
          this.wait = 8;
        } else if (pl.grounded) this.queue.shift();
      }
    }

    const reach = pt.r ?? 1.1;
    if (dist < reach || this.passed(this.index)) {
      const act = pt.act ?? '';
      const toks = act.split('+');
      if (toks.includes('w') || toks.includes('w2')) {
        // wait here until there is ground under the next point ('w') or the one after it ('w2'),
        // then do the rest of the tokens (e.g. 'w+j')
        this.waitingForGround = true;
        this.waitAhead = toks.includes('w2') ? 1 : 0;
        this.deferred = toks.filter((t) => t !== 'w' && t !== 'w2').join('+');
      } else this.perform(act);
      this.index++;
      this.stuckTicks = 0;
    } else {
      this.stuckTicks++;
    }
    inp.slideHeld = this.sliding;
    if (this.sliding && pl.grounded && pl.state !== MoveState.Slide && pl.speed > 5) inp.slidePressed = true;
    return inp;
  }

  private perform(act: string) {
    const inp = this.inp,
      pl = this.sim.player;
    for (const tok of act.split('+')) {
      switch (tok) {
        case 'j':
          inp.jumpPressed = true;
          break;
        case 'jj':
          inp.jumpPressed = true;
          this.queue.push('J2');
          this.wait = 8;
          break;
        case 'd':
          if (this.queue.length) this.queue.push('D');
          else if (inp.jumpPressed) {
            this.queue.push('DA');
            this.wait = 8;
          } else inp.dashPressed = true;
          break;
        case 's':
          this.sliding = true;
          inp.slidePressed = true;
          break;
        case 'u':
          this.sliding = false;
          break;
        case 'g':
          this.gating = true;
          break;
        case 'wj':
          if (pl.state === MoveState.WallRun) inp.jumpPressed = true;
          else this.queue.push('WJ');
          break;
      }
    }
  }

  /** True once the player has gone past waypoint i along the line from the previous one. */
  private passed(i: number): boolean {
    if (i === 0) return false;
    const a = this.sim.data.bot[i - 1].p,
      b = this.sim.data.bot[i].p,
      p = this.sim.player.pos;
    const sx = b[0] - a[0],
      sz = b[2] - a[2];
    const l2 = sx * sx + sz * sz;
    if (l2 < 0.01) return true;
    const t = ((p.x - a[0]) * sx + (p.z - a[2]) * sz) / l2;
    const lateral = Math.abs((p.x - a[0]) * sz - (p.z - a[2]) * sx) / Math.sqrt(l2);
    return t > 1 && lateral < 3 && Math.abs(p.y - b[1]) < 5;
  }
}

export interface BotResult {
  finished: boolean;
  time: number;
  deaths: number;
  ticks: number;
  lastIndex: number;
  pos: [number, number, number];
}

/** Run the bot through a level until it finishes or `maxSeconds` of simulated time pass. */
export function runBot(sim: Simulation, maxSeconds = 600, onTick?: (tick: number) => void): BotResult {
  const bot = new Bot(sim);
  const max = Math.round(maxSeconds * 120);
  let t = 0;
  for (; t < max && !sim.stats.finished; t++) {
    sim.tick(bot.step());
    onTick?.(t);
  }
  const p = sim.player.pos;
  return {
    finished: sim.stats.finished,
    time: sim.runTime,
    deaths: sim.stats.deaths,
    ticks: t,
    lastIndex: bot.index,
    pos: [p.x, p.y, p.z],
  };
}
