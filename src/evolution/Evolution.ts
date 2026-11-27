/**
 * Evolve mode: the run-long progression layered over the simulation.
 *
 * One instance per Simulation, created only in Evolve. With no instance the simulation runs the
 * original code path untouched (Pure), which is what medals, ghosts and reference runs use.
 *
 * Everything here is deterministic: the run's collectibles come from a seed, and all effects are
 * applied through the player's own tuning layer (`player.cfg`), the sword's modifiers, launches /
 * boosts the movement controller already supports, and the world clock scale (Timeslip / Reflex).
 */
import { Emitter } from '../core/events';
import { quatRotate, v3 } from '../core/math';
import type { Simulation } from '../gameplay/Simulation';
import type { SwordTarget } from '../gameplay/Sword';
import { movementConfig, type MovementConfig } from '../movement/movementConfig';
import { MoveState, type InputFrame } from '../movement/types';
import {
  ABILITIES,
  ABILITY_IDS,
  at,
  FAMILY_POOL,
  FLOW_GRACE,
  FLOW_MAX,
  FLOW_TIERS,
  stageOf,
  SYNERGIES,
  T,
  type AbilityDef,
  type AbilityId,
  type SynergyId,
} from './abilities';
import { KINDS, placeCollectibles, rng, type CollectibleKind, type Placed } from './collectibles';
import type { Slot } from './slots';

export interface EvoEvents {
  pickup: { index: number; kind: CollectibleKind };
  upgrade: { id: AbilityId; level: number; evolution?: string };
  synergy: { id: SynergyId; name: string };
  flowTier: { tier: number; up: boolean };
  flux: { amount: number; total: number };
  surge: { on: boolean };
  aegis: { kind: 'absorb' | 'void' | 'ready' };
  reflex: Record<string, never>;
  phased: { index: number };
  chain: { node: number; failed: boolean };
  shockwave: { x: number; y: number; z: number; r: number; kind: 'land' | 'finisher' | 'crescent' | 'slam' };
  boost: { kind: 'slingshot' | 'surge' | 'dashcut' | 'overdrive' | 'steady' | 'updraft' };
  overflow: Record<string, never>;
}

export interface CollectibleState extends Placed {
  taken: boolean;
  /** Echo nodes: visible only when it is their turn. */
  live: boolean;
}

const FLUX_MAX = 100;
const OVERFLOW_STEP = 60;
const ECHO_WINDOW = 4; // seconds to reach the next node
const _u = v3(),
  _c = v3();
const UP = v3(0, 1, 0);
const KILL_ABSORB = new Set(['hazard', 'lethal']);

export class Evolution {
  readonly events = new Emitter<EvoEvents>();
  readonly levels = {} as Record<AbilityId, number>;
  readonly synergies = new Set<SynergyId>();
  items: CollectibleState[] = [];
  flux = 0;
  flow = 0;
  flowTier = 0;
  /** World clock multiplier this tick (Timeslip / Reflex slow the world, never the runner). */
  worldScale = 1;
  surgeLeft = 0;
  reflexLeft = 0;
  reflexCd = 0;
  aegisReady = false;
  aegisCd = 0;
  voidReady = false;
  invuln = 0;
  /** Runs since the level was opened (each restart reseeds). */
  run = 0;
  seed: number;
  /** Totals for the results screen and tests. */
  stats = { pickups: 0, byKind: {} as Partial<Record<CollectibleKind, number>>, fluxGained: 0, peakTier: 0 };
  hoverLeft = 0;

  private cfg: MovementConfig;
  private lastActionAt = -99;
  private recent: string[] = [];
  private now = 0;
  private sprintFor = 0;
  private slideFor = 0;
  private lastDashEnd = -99;
  private dashCutUsed = -1;
  private landBoostLeft = 0;
  private slamming = false;
  private echoNext = 0;
  private echoDeadline = 0;
  private phasedAt = new Map<number, number>();
  private safe: { x: number; y: number; z: number; t: number }[] = [];
  private glyphIdx: number[] = []; // item index for each glyph target
  private airPeak = 0;

  constructor(
    private sim: Simulation,
    private slots: readonly Slot[],
    seed: number,
  ) {
    this.seed = seed;
    this.cfg = Object.create(movementConfig) as MovementConfig;
    sim.player.cfg = this.cfg;
    this.wire();
  }

  // ----- lifecycle --------------------------------------------------------------------------
  /** A fresh run: no abilities, a new seeded layout. */
  newRun() {
    for (const id of ABILITY_IDS) this.levels[id] = 0;
    this.synergies.clear();
    this.flux = 0;
    this.flow = 0;
    this.flowTier = 0;
    this.aegisReady = this.voidReady = false;
    this.aegisCd = 0;
    this.stats = { pickups: 0, byKind: {}, fluxGained: 0, peakTier: 0 };
    const fixed = this.sim.data.evoItems;
    const placed: Placed[] = fixed
      ? fixed.map((f) => ({
          kind: f.kind as CollectibleKind,
          p: [...f.p],
          u: [0, 1, 0],
          d: f.p[2],
          group: f.group,
          order: f.order,
        }))
      : placeCollectibles(this.slots, (this.seed + this.run * 7919) >>> 0);
    this.place(placed);
    this.overflow = 0;
    this.run++;
    this.respawn();
    this.apply();
  }

  /** Replace the run's collectibles (fixed layouts, tests). */
  place(placed: Placed[]) {
    this.items = placed.map((p) => ({
      ...p,
      p: [...p.p],
      taken: false,
      live: p.kind !== 'echo' || p.order === 0,
    }));
    this.glyphIdx = [];
    this.items.forEach((it, i) => it.kind === 'glyph' && this.glyphIdx.push(i));
    this.echoNext = 0;
    // the simulation's sword targets follow the glyphs
    this.sim.resetGlyphTargets(this.glyphTargets());
  }

  /** Back to a checkpoint: abilities and Flux are kept; Flow and timers are not. */
  respawn() {
    this.flow = 0;
    this.setTier(0, true);
    this.surgeLeft = this.reflexLeft = 0;
    this.worldScale = 1;
    this.invuln = 0;
    this.sprintFor = this.slideFor = 0;
    this.landBoostLeft = 0;
    this.slamming = false;
    this.hoverLeft = T.hoverTime;
    this.safe.length = 0;
    // an Echo Chain in progress starts over
    if (this.echoNext > 0 && this.echoNext < 4) this.resetChain(false);
  }

  /** Sword targets for the glyphs (appended after the breakables). */
  glyphTargets(): (SwordTarget | null)[] {
    return this.glyphIdx.map((i) => {
      const it = this.items[i];
      return it.taken ? null : { x: it.p[0], y: it.p[1], z: it.p[2], r: 0.55 };
    });
  }

  // ----- abilities --------------------------------------------------------------------------
  level(id: AbilityId) {
    return this.levels[id];
  }
  get totalLevels() {
    let n = 0;
    for (const id of ABILITY_IDS) n += this.levels[id];
    return n;
  }
  get stage() {
    return stageOf(this.totalLevels);
  }

  /** Raise an ability one level (tests and pickups). */
  grant(id: AbilityId) {
    const def = ABILITIES[id];
    if (this.levels[id] >= def.max) return false;
    const lv = ++this.levels[id];
    if (id === 'aegis') {
      this.aegisReady = true;
      this.aegisCd = 0;
      if (lv >= 3) this.voidReady = true;
    }
    this.events.emit('upgrade', { id, level: lv, evolution: def.evolutions[lv] });
    for (const s of SYNERGIES) {
      if (this.synergies.has(s.id)) continue;
      if (s.needs.every(([a, l]) => this.levels[a] >= l)) {
        this.synergies.add(s.id);
        this.events.emit('synergy', { id: s.id, name: s.name });
      }
    }
    this.apply();
    return true;
  }

  /** Grant from a family: weighted toward abilities with more levels left (diminishing). */
  private grantFrom(family: AbilityDef['family'], r: number) {
    const pool = FAMILY_POOL[family].filter((id) => this.levels[id] < ABILITIES[id].max);
    if (!pool.length) {
      this.addFlux(15);
      return null;
    }
    const w = pool.map((id) => ABILITIES[id].max - this.levels[id] + (this.levels[id] === 0 ? 1 : 0));
    let x = r * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) if ((x -= w[i]) <= 0) return this.grant(pool[i]) ? pool[i] : null;
    return this.grant(pool[pool.length - 1]) ? pool[pool.length - 1] : null;
  }

  has(s: SynergyId) {
    return this.synergies.has(s);
  }

  /** Write the tuning layer from the current levels and temporary state. */
  private apply() {
    const c = this.cfg,
      base = movementConfig,
      L = this.levels;
    const oc = L.overclock > 0 ? T.overclockCap : 1;
    const overdrive = L.stride >= 3 && this.sprintFor >= T.overdriveAfter ? T.overdriveBonus : 0;
    c.sprintSpeed = base.sprintSpeed + at(T.strideSprint, L.stride) + overdrive + this.flowTier * 0.3;
    c.sprintAccel = base.sprintAccel * at(T.strideAccel, L.stride);
    let fr = base.slideFriction * at(T.glideFriction, L.glide);
    if (this.has('railgun') && this.sim.player.speed > 15) fr = 0.6;
    c.slideFriction = fr;
    c.slideBoost = base.slideBoost + at(T.glideBoost, L.glide);
    c.jumpVelocity = base.jumpVelocity + at(T.springJump, L.spring);
    c.doubleJumpVelocity = base.doubleJumpVelocity + at(T.springDouble, L.spring);
    this.sim.player.extraAirJumps = L.spring >= 2 ? 1 : 0;
    c.dashSpeed = base.dashSpeed + at(T.phaseSpeed, L.phase);
    c.dashRecharge = base.dashRecharge * at(T.phaseRecharge, L.phase);
    c.dashCharges = base.dashCharges + (L.phase >= 2 ? 1 : 0);
    c.dashMaxPitchDeg = this.has('skybreaker') ? 60 : base.dashMaxPitchDeg;
    c.wallDurationBase = base.wallDurationBase + at(T.wallDuration, L.wallrunner);
    c.wallDurationMax = base.wallDurationMax + at(T.wallDuration, L.wallrunner);
    c.wallJumpOut = base.wallJumpOut + at(T.wallJumpOut, L.wallrunner);
    c.wallJumpUp = base.wallJumpUp + at(T.wallJumpUp, L.wallrunner);
    c.overspeedDecay = base.overspeedDecay * at(T.flyDecay, L.flywheel) * (this.landBoostLeft > 0 ? 0.3 : 1);
    c.softSpeedCap = (base.softSpeedCap + at(T.flyCap, L.flywheel)) * oc;
    const sw = this.sim.sword;
    sw.attackSpeed = at(T.edgeSpeed, L.edge);
    sw.reachAdd =
      at(T.reachAdd, L.reach) +
      (sw.combo >= 2 ? at(T.severanceAdd, L.severance) : 0) +
      (L.mirror > 0 ? T.mirrorReach : 0);
  }

  // ----- Flux and Flow --------------------------------------------------------------------------
  addFlux(n: number) {
    const gain = n * (1 + this.flowTier * 0.15);
    const before = this.flux;
    this.flux = Math.min(FLUX_MAX, this.flux + gain);
    this.stats.fluxGained += gain;
    if (this.flux !== before) this.events.emit('flux', { amount: this.flux - before, total: this.flux });
    // a full meter overflows: every OVERFLOW_STEP more Flux becomes a movement upgrade
    const spill = before + gain - this.flux;
    if (spill > 0) {
      this.overflow += spill;
      while (this.overflow >= OVERFLOW_STEP) {
        this.overflow -= OVERFLOW_STEP;
        const fams = ['ground', 'air', 'dash', 'wall'] as const;
        const r = rng((this.seed ^ 0x9e3779b9) + this.stats.pickups * 31 + this.run);
        const pick = fams[Math.floor(r() * fams.length)];
        this.events.emit('overflow', {});
        if (!this.grantFrom(pick, r())) break;
      }
    }
  }
  /** Flux gathered past a full meter, toward the next overflow upgrade. */
  overflow = 0;

  /** A movement action: builds Flow, more for variety than for repetition. */
  action(kind: string, points: number) {
    const repeat = this.recent.includes(kind);
    this.flow = Math.min(FLOW_MAX, this.flow + points * (repeat ? 0.4 : 1));
    this.recent.push(kind);
    if (this.recent.length > 2) this.recent.shift();
    this.lastActionAt = this.now;
    this.updateTier();
  }

  private updateTier() {
    let t = 0;
    for (let i = 0; i < FLOW_TIERS.length; i++) if (this.flow >= FLOW_TIERS[i]) t = i;
    if (t !== this.flowTier) this.setTier(t);
  }
  private setTier(t: number, quiet = false) {
    const up = t > this.flowTier;
    this.flowTier = t;
    if (t > this.stats.peakTier) this.stats.peakTier = t;
    if (!quiet) this.events.emit('flowTier', { tier: t, up });
  }

  private wire() {
    const ev = this.sim.player.events;
    ev.on('jump', ({ fromSlide }) => {
      this.action('jump', 6);
      const pl = this.sim.player;
      if (fromSlide) {
        // jumping out of a slide launches harder; a charged slide becomes the Slingshot
        const charged = this.levels.glide >= 3 && this.slideFor >= T.slingshotCharge;
        this.forward(charged ? T.slingshotForward : 1);
        if (charged) {
          this.lift(T.slingshotUp);
          this.events.emit('boost', { kind: 'slingshot' });
        }
      }
      if (this.has('updraft') && pl.speed > 14) {
        this.lift(Math.min((pl.speed - 14) * 0.18, 1.6));
        this.events.emit('boost', { kind: 'updraft' });
      }
    });
    ev.on('doubleJump', () => this.action('double', 8));
    ev.on('dash', () => this.action('dash', 9));
    ev.on('dashEnd', () => (this.lastDashEnd = this.now));
    ev.on('slideStart', () => {
      this.action('slide', 7);
      this.slideFor = 0;
    });
    ev.on('wallRunStart', () => this.action('wall', 10));
    ev.on('wallJump', () => {
      this.action('walljump', 10);
      if (this.levels.wallrunner >= 3) {
        this.forward(T.wallSurge);
        this.events.emit('boost', { kind: 'surge' });
      } else if (this.flowTier >= 2) this.forward(0.6);
    });
    ev.on('vault', () => this.action('vault', 8));
    ev.on('land', ({ speed }) => {
      const pl = this.sim.player;
      const fell = this.airPeak;
      this.airPeak = 0;
      if (pl.speed > movementConfig.sprintSpeed + 1) this.landBoostLeft = 0.5;
      if (this.levels.steady > 0 && fell > 0.4 && pl.state !== MoveState.Slide) {
        this.forward(at(T.steadyGive, this.levels.steady));
        this.events.emit('boost', { kind: 'steady' });
      }
      if (this.slamming || (this.levels.steady >= 2 && speed >= T.shockLandSpeed)) {
        this.shockwave(T.shockLandRadius, this.slamming ? 'slam' : 'land');
        this.addFlux(6);
      }
      this.slamming = false;
    });
    const se = this.sim.events;
    se.on('break', ({ by }) => {
      if (by !== 'sword') return;
      this.action('cut', 7);
      const n = at(T.siphonFlux, this.levels.siphon) + (this.levels.mirror > 0 ? T.mirrorFlux : 0);
      if (n) this.addFlux(n);
    });
    se.on('sword', ({ action, combo }) => {
      if (action !== 'slash') return;
      // a slash straight out of a dash extends it
      if (this.now - this.lastDashEnd < 0.2 && this.dashCutUsed !== this.sim.stats.dashes) {
        this.dashCutUsed = this.sim.stats.dashes;
        this.forward(2);
        this.events.emit('boost', { kind: 'dashcut' });
      }
      if (this.levels.edge >= 3) this.crescent();
      if (this.levels.severance >= 3 && (combo ?? 0) >= 2) this.shockwave(T.shockwaveRadius, 'finisher');
    });
  }

  /** Speed along the current travel (or look) direction. */
  private forward(add: number) {
    const pl = this.sim.player;
    const v = pl.vel;
    let dx = v.x,
      dz = v.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.5) {
      dx = -Math.sin(pl.yaw);
      dz = -Math.cos(pl.yaw);
    } else {
      dx /= l;
      dz /= l;
    }
    if (pl.framed) {
      // horizontal in the local frame: boost along the frame-projected velocity instead
      const n = Math.hypot(v.x, v.y, v.z) || 1;
      pl.impulse(v.x / n, v.y / n, v.z / n, add, 0);
      return;
    }
    pl.boost(dx, dz, add, 0);
  }
  private lift(add: number) {
    const pl = this.sim.player;
    const up = quatRotate(pl.frame, UP, _u);
    pl.impulse(up.x, up.y, up.z, add, 0);
  }

  // ----- area cuts ------------------------------------------------------------------------------
  private centre() {
    const pl = this.sim.player;
    const up = quatRotate(pl.frame, UP, _u);
    _c.x = pl.pos.x + up.x * pl.height * 0.5;
    _c.y = pl.pos.y + up.y * pl.height * 0.5;
    _c.z = pl.pos.z + up.z * pl.height * 0.5;
    return _c;
  }

  /** Every target the area reaches, filtered by `ok(dx,dy,dz,dist)`. */
  private cutWhere(ok: (dx: number, dy: number, dz: number, d: number) => boolean) {
    const sim = this.sim,
      c = this.centre();
    const bs = sim.data.breakables;
    let n = 0;
    for (let i = 0; i < bs.length; i++) {
      if (sim.broken[i]) continue;
      const t = sim.targetOf(i);
      if (!t) continue;
      const dx = t.x - c.x,
        dy = t.y - c.y,
        dz = t.z - c.z;
      if (ok(dx, dy, dz, Math.hypot(dx, dy, dz) - t.r)) {
        sim.cutObject(i, 'sword');
        n++;
      }
    }
    for (const gi of this.glyphIdx) {
      const it = this.items[gi];
      if (it.taken) continue;
      const dx = it.p[0] - c.x,
        dy = it.p[1] - c.y,
        dz = it.p[2] - c.z;
      if (ok(dx, dy, dz, Math.hypot(dx, dy, dz) - 0.5)) {
        this.collect(gi);
        n++;
      }
    }
    return n;
  }

  private shockwave(r: number, kind: EvoEvents['shockwave']['kind']) {
    const c = this.centre();
    this.events.emit('shockwave', { x: c.x, y: c.y, z: c.z, r, kind });
    this.cutWhere((_x, _y, _z, d) => d < r);
  }

  private crescent() {
    const pl = this.sim.player;
    const cp = Math.cos(pl.pitch);
    const fx = -Math.sin(pl.yaw) * cp,
      fy = Math.sin(pl.pitch),
      fz = -Math.cos(pl.yaw) * cp;
    const c = this.centre();
    this.events.emit('shockwave', {
      x: c.x + fx * 3,
      y: c.y + fy * 3,
      z: c.z + fz * 3,
      r: T.crescentReach,
      kind: 'crescent',
    });
    this.cutWhere((dx, dy, dz, d) => {
      if (d > T.crescentReach) return false;
      const l = Math.hypot(dx, dy, dz) || 1;
      return (dx * fx + dy * fy + dz * fz) / l > 0.72;
    });
  }

  // ----- collectibles -----------------------------------------------------------------------
  /** A glyph was struck by the blade (index into glyphTargets). */
  onGlyphCut(j: number) {
    const i = this.glyphIdx[j];
    if (i !== undefined && !this.items[i].taken) this.collect(i);
  }

  private collect(i: number) {
    const it = this.items[i];
    it.taken = true;
    it.live = false;
    const j = this.glyphIdx.indexOf(i);
    if (j >= 0) this.sim.setGlyphTarget(j, null);
    this.stats.pickups++;
    this.stats.byKind[it.kind] = (this.stats.byKind[it.kind] ?? 0) + 1;
    this.events.emit('pickup', { index: i, kind: it.kind });
    const r = rng((this.seed ^ (i * 2654435761)) + this.run)();
    switch (it.kind) {
      case 'glint':
        this.addFlux(4);
        break;
      case 'undertow':
        this.grantFrom('ground', r);
        break;
      case 'skyknot':
        this.grantFrom('air', r);
        break;
      case 'rift':
        this.grantFrom('dash', r);
        break;
      case 'glyph':
        this.grantFrom('combat', r);
        break;
      case 'vein':
        this.grantFrom('wall', r);
        break;
      case 'echo': {
        this.echoNext = (it.order ?? 0) + 1;
        this.events.emit('chain', { node: this.echoNext, failed: false });
        if (this.echoNext >= 4) {
          this.grantFrom('survival', r);
          this.addFlux(20);
        } else {
          const nx = this.items.find((x) => x.kind === 'echo' && x.order === this.echoNext);
          if (nx) nx.live = true;
          this.echoDeadline = this.now + ECHO_WINDOW;
        }
        break;
      }
      case 'paradox':
        this.grantFrom('mythic', r);
        this.addFlux(30);
        break;
    }
    if (it.kind !== 'glint') this.action('pickup:' + it.kind, 5);
  }

  private resetChain(failed: boolean) {
    for (const x of this.items)
      if (x.kind === 'echo') {
        x.taken = false;
        x.live = x.order === 0;
      }
    this.echoNext = 0;
    this.events.emit('chain', { node: 0, failed });
  }

  // ----- survival -------------------------------------------------------------------------------
  /** The simulation is about to kill the player: return true to cancel it. */
  absorb(reason: string): boolean {
    const pl = this.sim.player;
    if (KILL_ABSORB.has(reason)) {
      if (this.invuln > 0) return true;
      if (this.levels.phase >= 4 && pl.state === MoveState.Dash) return true;
      if (this.aegisReady) {
        this.aegisReady = false;
        this.aegisCd = at(T.aegisRecharge, this.levels.aegis) * (this.has('guardian') ? 0.7 : 1);
        this.invuln = 1;
        this.events.emit('aegis', { kind: 'absorb' });
        if (this.has('guardian')) this.startReflex();
        return true;
      }
      return false;
    }
    if (reason === 'void' && this.voidReady && !pl.framed) {
      // the newest safe footing at least 0.8 s old (so not the edge you just ran off)
      let back = this.safe[0];
      for (let i = this.safe.length - 1; i >= 0; i--)
        if (this.now - this.safe[i].t >= 0.8) {
          back = this.safe[i];
          break;
        }
      if (!back) return false;
      this.voidReady = false;
      pl.reset(back.x, back.y + 0.05, back.z, pl.yaw);
      this.sim.gravity.reset(pl);
      this.invuln = 1;
      this.events.emit('aegis', { kind: 'void' });
      return true;
    }
    return false;
  }

  private startReflex() {
    this.reflexLeft = T.reflexTime;
    this.reflexCd = at(T.reflexCooldown, Math.max(1, this.levels.reflex));
    this.events.emit('reflex', {});
  }

  /** Is a lethal hazard about to meet the runner (where they will be in 0.3 s)? */
  private dangerAhead() {
    const pl = this.sim.player;
    const px = pl.pos.x + pl.vel.x * 0.3,
      py = pl.pos.y + pl.vel.y * 0.3 + 0.9,
      pz = pl.pos.z + pl.vel.z * 0.3;
    for (const e of this.sim.entities as unknown as {
      p: { x: number; y: number; z: number };
      h?: { x: number; y: number; z: number };
      def: { lethal?: boolean; type?: string };
      active?: boolean;
    }[]) {
      if (!e.h || !(e.def.lethal || e.def.type === 'hazard')) continue;
      const dx = Math.max(Math.abs(px - e.p.x) - e.h.x, 0),
        dy = Math.max(Math.abs(py - e.p.y) - e.h.y - 0.45, 0),
        dz = Math.max(Math.abs(pz - e.p.z) - e.h.z, 0);
      if (Math.hypot(dx, dy, dz) < 0.5) return true;
    }
    return false;
  }

  // ----- ticks ------------------------------------------------------------------------------------
  /** Before the runner moves: Surge, hover, slam, temporary tuning. */
  preTick(inp: InputFrame, dt: number) {
    this.now += dt;
    const pl = this.sim.player,
      L = this.levels;
    // Surge (Timeslip)
    if (inp.surgePressed && L.timeslip > 0 && this.surgeLeft <= 0) {
      const free = L.chrono > 0 && this.flowTier >= 3;
      if (free || this.flux >= T.timeslipCost) {
        if (!free) this.flux -= T.timeslipCost;
        this.surgeLeft = at(T.timeslipTime, L.timeslip) * (L.chrono > 0 ? 1.5 : 1);
        this.events.emit('surge', { on: true });
      }
    }
    // Skybreaker: slide in the air slams down
    if (
      this.has('skybreaker') &&
      !pl.grounded &&
      pl.state === MoveState.Air &&
      inp.slidePressed &&
      !this.slamming
    ) {
      const up = quatRotate(pl.frame, UP, _u);
      pl.impulse(-up.x, -up.y, -up.z, 0, 30);
      this.slamming = true;
    }
    // Hover (Spring 5): hold jump while falling
    if (L.spring >= 5 && pl.state === MoveState.Air && inp.jumpHeld && pl.upSpeed < 0 && this.hoverLeft > 0) {
      pl.gravityScale *= T.hoverScale;
      this.hoverLeft -= dt;
    }
    if (pl.grounded) this.hoverLeft = T.hoverTime;
    this.apply();
  }

  /** After the runner moved: collect, Flow, timers, cooldowns. */
  postTick(dt: number) {
    const pl = this.sim.player,
      L = this.levels;
    const st = pl.state;
    // timers
    this.sprintFor = st === MoveState.Sprint ? this.sprintFor + dt : 0;
    if (st === MoveState.Slide) this.slideFor += dt;
    if (!pl.grounded) this.airPeak += dt;
    this.landBoostLeft = Math.max(0, this.landBoostLeft - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (L.aegis > 0 && !this.aegisReady) {
      this.aegisCd -= dt;
      if (this.aegisCd <= 0) {
        this.aegisReady = true;
        this.events.emit('aegis', { kind: 'ready' });
      }
    }
    if (this.surgeLeft > 0) {
      this.surgeLeft -= dt;
      if (this.surgeLeft <= 0) this.events.emit('surge', { on: false });
    }
    this.reflexCd -= dt;
    if (this.reflexLeft > 0) this.reflexLeft -= dt;
    else if (L.reflex > 0 && this.reflexCd <= 0 && pl.speed > 4 && this.dangerAhead()) this.startReflex();
    let ws = 1;
    if (this.surgeLeft > 0) ws = Math.min(ws, at(T.timeslipScale, L.timeslip));
    if (this.reflexLeft > 0) ws = Math.min(ws, at(T.reflexScale, Math.max(1, L.reflex)));
    this.worldScale = ws;
    // safe ground for the void catch (static, upright)
    if (pl.grounded && !pl.framed && pl.groundId !== -1) {
      const m = this.sim.physics.metaOf(pl.groundId);
      if (
        (!m || m.entity < 0) &&
        (!this.safe.length || this.now - this.safe[this.safe.length - 1].t > 0.25)
      ) {
        this.safe.push({ x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, t: this.now });
        if (this.safe.length > 12) this.safe.shift();
      }
    }
    // Flow: drains once you stop acting; Overclock keeps a floor
    if (this.now - this.lastActionAt > FLOW_GRACE || pl.speed < 3) {
      this.flow = Math.max(0, this.flow - (pl.speed < 3 ? 50 : 26) * dt);
      if (L.overclock > 0) this.flow = Math.max(this.flow, FLOW_TIERS[2]);
      this.updateTier();
    }
    // fast slides and Dynamo feed Flux
    if (st === MoveState.Slide && pl.speed > 13) this.addFlux(3 * dt);
    if (this.has('dynamo') && st === MoveState.WallRun) {
      this.addFlux(6 * dt);
      pl.dashEnergy = Math.min(this.cfg.dashCharges, pl.dashEnergy + dt * 0.8);
    }
    // Echo Chain timeout
    if (this.echoNext > 0 && this.echoNext < 4 && this.now > this.echoDeadline) this.resetChain(true);
    this.touch(dt);
  }

  private touch(dt: number) {
    const pl = this.sim.player,
      L = this.levels;
    const c = this.centre();
    const st = pl.state;
    const mag = at(T.magnetRadius, L.magnet);
    const dashing = st === MoveState.Dash || pl.sinceDash < 0.12;
    const phantom = this.has('phantom') && st === MoveState.Dash;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.taken || !it.live) continue;
      let dx = it.p[0] - c.x,
        dy = it.p[1] - c.y,
        dz = it.p[2] - c.z;
      let d = Math.hypot(dx, dy, dz);
      if (it.kind === 'glint' && mag > 0 && d < mag && d > 0.01) {
        // Magnet: glints drift toward you
        const k = Math.min(d, 18 * dt) / d;
        it.p[0] -= dx * k;
        it.p[1] -= dy * k;
        it.p[2] -= dz * k;
        dx = it.p[0] - c.x;
        dy = it.p[1] - c.y;
        dz = it.p[2] - c.z;
        d = Math.hypot(dx, dy, dz);
      }
      if (it.kind === 'glyph') {
        if (phantom && d < 1.8) this.collect(i);
        continue;
      }
      if (d > KINDS[it.kind].radius) continue;
      let ok = true;
      switch (it.kind) {
        case 'undertow':
          ok = st === MoveState.Slide;
          break;
        case 'skyknot':
          ok = !pl.grounded;
          break;
        case 'rift':
          ok = dashing;
          break;
        case 'vein':
          ok = st === MoveState.WallRun;
          break;
        case 'paradox':
          ok = this.flowTier >= 3;
          if (!ok) {
            const last = this.phasedAt.get(i) ?? -9;
            if (this.now - last > 1) {
              this.phasedAt.set(i, this.now);
              this.events.emit('phased', { index: i });
            }
          }
          break;
      }
      if (ok) this.collect(i);
    }
    if (phantom) {
      const sim = this.sim;
      const bs = sim.data.breakables;
      for (let i = 0; i < bs.length; i++) {
        if (sim.broken[i]) continue;
        const t = sim.targetOf(i);
        if (t && Math.hypot(t.x - c.x, t.y - c.y, t.z - c.z) - t.r < 1.8) sim.cutObject(i, 'sword');
      }
    }
  }

  /** Snapshot for the HUD (cheap; read once per frame). */
  hud() {
    return {
      flux: this.flux,
      flow: this.flow,
      tier: this.flowTier,
      stage: this.stage,
      surge: this.surgeLeft,
      surgeMax: at(T.timeslipTime, this.levels.timeslip) * (this.levels.chrono > 0 ? 1.5 : 1),
      reflex: this.reflexLeft,
      aegis:
        this.levels.aegis > 0
          ? this.aegisReady
            ? 1
            : 1 - this.aegisCd / at(T.aegisRecharge, this.levels.aegis)
          : -1,
      chain: this.echoNext,
      chainLeft: this.echoNext > 0 && this.echoNext < 4 ? Math.max(0, this.echoDeadline - this.now) : 0,
      abilities: ABILITY_IDS.filter((id) => this.levels[id] > 0).map((id) => ({
        id,
        glyph: ABILITIES[id].glyph,
        name: ABILITIES[id].name,
        level: this.levels[id],
        max: ABILITIES[id].max,
        category: ABILITIES[id].category,
      })),
      synergies: [...this.synergies],
    };
  }
}
