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
import type { BreakableKind } from '../levels/types';
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
  boost: {
    kind:
      | 'slingshot'
      | 'surge'
      | 'dashcut'
      | 'overdrive'
      | 'steady'
      | 'updraft'
      | 'dashjump'
      | 'airburst'
      | 'conserve'
      | 'skim'
      | 'skyward'
      | 'tempest'
      | 'prism'
      | 'lantern'
      | 'gate'
      | 'streak'
      | 'slipstream'
      | 'blink';
  };
  /** A full Flux meter turned into an upgrade. */
  overflow: Record<string, never>;
  /** Kinetic Chain: consecutive cuts and pickups. `milestone` names a reward at 5 / 10 / 15... */
  streak: { n: number; milestone?: string; broken?: boolean };
  /** A temporary effect started or ended (the active-effects HUD lists them). */
  effect: { id: string; on: boolean };
  /** A Chain Spindle gate was cleared (or ran out of time). */
  gate: { gate: number; cleared: boolean; left: number };
}

export interface CollectibleState extends Placed {
  taken: boolean;
  /** Echo nodes: visible only when it is their turn. */
  live: boolean;
}

const FLUX_MAX = 100;
const STREAK_WINDOW = 2.5;
const GATE_WINDOW = 4;
const ECHO_WINDOW = 4; // seconds to reach the next node
const _u = v3(),
  _c = v3();
const UP = v3(0, 1, 0);
const KILL_ABSORB = new Set(['hazard', 'lethal']);
const breakAt = (d: { p: [number, number, number] }) => ({ x: d.p[0], y: d.p[1] + 1, z: d.p[2], r: 0.5 });
type Family = 'ground' | 'air' | 'dash' | 'wall' | 'combat';

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
  /** Kinetic Chain length and the time left before it breaks. */
  streak = 0;
  streakLeft = 0;
  peakStreak = 0;
  /** Momentum Lock time left (Stride 3). */
  lockLeft = 0;
  /** The length of the current Momentum Lock (for its countdown). */
  lockMax = 0;
  /** Overcharge time left (from an Energy Core): free sprint, Flux x1.5. */
  overchargeLeft = 0;

  private cfg: MovementConfig;
  /** What the runner has been doing lately, per family: a full Flux meter evolves that. */
  private usage: Record<Family, number> = {
    ground: 0,
    air: 0,
    dash: 0,
    wall: 0,
    combat: 0,
  };
  private lastInp: InputFrame | null = null;
  private skimming = false;
  private skywardUsed = false;
  private blinkUsed = -1;
  private tempestAt = -9;
  private finisherDash = -1;
  private areaDepth = 0;
  private inCrescent = false;
  private gates = new Map<number, { left: number; total: number; deadline: number }>();
  private fluxGrants = 0;
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
    this.peakStreak = 0;
    this.fluxGrants = 0;
    for (const k of Object.keys(this.usage) as Family[]) this.usage[k] = 0;
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
      : placeCollectibles(this.slots, (this.seed + this.run * 7919) >>> 0, undefined, this.occupied());
    this.place(placed);
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

  /** Where the slashable world already stands (collectibles keep clear of it). */
  private occupied(): [number, number, number][] {
    return this.sim.data.breakables.map((b) => b.p);
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
    this.streak = this.streakLeft = 0;
    this.lockLeft = 0;
    this.overchargeLeft = 0;
    this.skimming = false;
    this.gates.clear();
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
  /** Overdrive is running (Stride 2+, sprinting long enough): the view shows it. */
  get overdriveOn() {
    return this.levels.stride >= 2 && this.sprintFor >= T.overdriveAfter;
  }

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
    // a bigger bar arrives full
    if (id === 'endurance') this.sim.player.stamina = this.cfg.staminaMax;
    return true;
  }

  /** Grant from a family: weighted toward abilities with more levels left (diminishing). */
  private grantFrom(family: AbilityDef['family'], r: number) {
    const pool = FAMILY_POOL[family].filter((id) => this.levels[id] < ABILITIES[id].max);
    if (!pool.length) {
      this.addFlux(25);
      return null;
    }
    // stacking matters: an ability you already have is three times as likely as a new one, so
    // runs reach evolutions instead of spreading thin
    const w = pool.map((id) => (this.levels[id] > 0 ? 3 : 1));
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
      L = this.levels,
      pl = this.sim.player;
    const oc = L.overclock > 0 ? T.overclockCap : 1;
    const overdrive = L.stride >= 2 && this.sprintFor >= T.overdriveAfter ? T.overdriveBonus : 0;
    c.sprintSpeed = (base.sprintSpeed + at(T.strideSprint, L.stride) + overdrive + this.flowTier * 0.3) * oc;
    c.runSpeed = base.runSpeed * oc;
    c.sprintAccel = base.sprintAccel * at(T.strideAccel, L.stride);
    // slides: friction, then Kinetic Slide turns friction into thrust up to a ceiling
    let fr = base.slideFriction * at(T.glideFriction, L.glide);
    if (L.glide >= 3 && pl.state === MoveState.Slide && this.slideFor < T.kineticTime) {
      const ceiling = c.sprintSpeed + c.slideBoost + T.kineticOver;
      fr = pl.speed < ceiling ? -T.kineticAccel : 0;
    }
    if (this.has('railgun') && pl.speed > 15) fr = Math.min(fr, 0);
    c.slideFriction = fr;
    c.slideBoost = base.slideBoost + at(T.glideBoost, L.glide);
    c.jumpVelocity = base.jumpVelocity + at(T.springJump, L.spring);
    c.doubleJumpVelocity = base.doubleJumpVelocity + at(T.springDouble, L.spring);
    pl.extraAirJumps = L.spring >= 2 ? 1 : 0;
    c.dashSpeed = base.dashSpeed + at(T.phaseSpeed, L.phase);
    c.dashDuration = base.dashDuration + at(T.phaseDuration, L.phase);
    c.dashRecharge = base.dashRecharge * at(T.phaseRecharge, L.phase);
    c.dashCharges = base.dashCharges + (L.phase >= 2 ? 1 : 0);
    c.dashMaxPitchDeg = this.has('skybreaker') ? 60 : base.dashMaxPitchDeg;
    c.dashExitSpeed = L.flywheel >= 3 ? c.dashSpeed * 0.7 : base.dashExitSpeed;
    // sprint and stamina (Endurance)
    c.staminaMax = base.staminaMax + at(T.staminaAdd, L.endurance);
    c.staminaRegen = base.staminaRegen * at(T.staminaRegen, L.endurance);
    c.staminaDrain = base.staminaDrain * at(T.staminaDrain, L.endurance);
    c.sprintBoost = base.sprintBoost + (L.endurance >= 3 ? T.afterburner : 0);
    c.staminaRestart = L.endurance >= 3 ? 0 : base.staminaRestart;
    pl.freeSprint = this.overchargeLeft > 0;
    c.wallDurationBase = base.wallDurationBase + at(T.wallDuration, L.wallrunner);
    c.wallDurationMax = base.wallDurationMax + at(T.wallDuration, L.wallrunner);
    c.wallJumpUp = base.wallJumpUp + at(T.wallJumpUp, L.wallrunner);
    c.wallGravityScale = L.wallrunner >= 3 ? T.wallGrip : base.wallGravityScale;
    c.wallRunGain = L.wallrunner >= 4 ? T.wallSprint : base.wallRunGain;
    // momentum: Flywheel slows the bleed-off; Momentum Lock and a fast landing stop it for a while
    let decay = base.overspeedDecay * at(T.flyDecay, L.flywheel);
    if (this.landBoostLeft > 0) decay *= 0.3;
    if (this.lockLeft > 0) decay = 0;
    c.overspeedDecay = decay;
    c.softSpeedCap = (base.softSpeedCap + at(T.flyCap, L.flywheel)) * oc;
    const sw = this.sim.sword;
    // and swings quicken with speed, so a cut at 30 m/s lands where you aimed it
    sw.attackSpeed = at(T.edgeSpeed, L.edge) * Math.min(1.8, 1 + Math.max(0, pl.speed - 12) * 0.03);
    // at speed the cut leads: the blade reaches further the faster you go
    sw.reachAdd =
      Math.max(0, pl.speed - 12) * 0.06 +
      at(T.reachAdd, L.reach) +
      (sw.combo >= 2 ? at(T.severanceAdd, L.severance) : 0) +
      (L.mirror > 0 ? T.mirrorReach : 0);
  }

  // ----- Flux and Flow --------------------------------------------------------------------------
  addFlux(n: number) {
    const gain = n * (1 + this.flowTier * 0.15) * this.streakMult() * (this.overchargeLeft > 0 ? 1.5 : 1);
    const before = this.flux;
    this.flux += gain;
    this.stats.fluxGained += gain;
    // a full meter evolves whatever you have been doing lately, then starts again
    while (this.flux >= FLUX_MAX) {
      this.flux -= FLUX_MAX;
      this.fluxGrants++;
      this.events.emit('overflow', {});
      if (!this.evolveFromUsage()) {
        this.flux = FLUX_MAX - 0.001;
        break;
      }
    }
    if (this.flux !== before) this.events.emit('flux', { amount: this.flux - before, total: this.flux });
  }

  /** Flux multiplier from the Kinetic Chain: x1 rising to x3 at a chain of 10. */
  streakMult() {
    return 1 + 0.2 * Math.min(this.streak, 10);
  }

  /** Pick a family weighted by recent use, then an ability in it (owned ones first). */
  private evolveFromUsage(): boolean {
    const fams = ['ground', 'air', 'dash', 'wall', 'combat'] as const;
    const r = rng((this.seed ^ 0x9e3779b9) + this.fluxGrants * 977 + this.run * 31);
    const open = fams.filter((f) => FAMILY_POOL[f].some((id) => this.levels[id] < ABILITIES[id].max));
    if (!open.length) return false;
    const w = open.map((f) => this.usage[f] + 2);
    let x = r() * w.reduce((a, b) => a + b, 0);
    let pick = open[open.length - 1];
    for (let i = 0; i < open.length; i++)
      if ((x -= w[i]) <= 0) {
        pick = open[i];
        break;
      }
    return this.grantFrom(pick, r()) !== null;
  }

  private use(f: Family, n = 1) {
    this.usage[f] += n;
  }

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
    const L = this.levels;
    const lock = () => {
      if (L.stride >= 3) this.lock(T.lockTime);
    };
    ev.on('jump', ({ fromSlide }) => {
      this.action('jump', 6);
      this.use('air');
      lock();
      const pl = this.sim.player;
      if (fromSlide && (this.committed() || (L.glide >= 2 && this.slideFor >= T.slingshotCharge))) {
        // jumping out of a slide launches harder; a charged slide becomes the Slingshot
        const charged = L.glide >= 2 && this.slideFor >= T.slingshotCharge;
        const k = this.has('comet') ? T.cometScale : 1;
        this.forward((charged ? T.slingshotForward : 1) * k);
        if (charged) {
          this.lift(T.slingshotUp * k);
          this.events.emit('boost', { kind: 'slingshot' });
        }
      }
      // Dash Jump: a jump straight out of a dash keeps (and adds to) its speed
      if (L.phase >= 2 && pl.sinceDash < T.dashJumpWindow) {
        this.forward(T.dashJumpBoost);
        this.lock(1);
        this.events.emit('boost', { kind: 'dashjump' });
      }
      if (this.has('updraft') && pl.speed > 14 && this.committed()) {
        this.lift(Math.min((pl.speed - 14) * 0.22, 2.2));
        this.events.emit('boost', { kind: 'updraft' });
      }
    });
    ev.on('doubleJump', () => {
      this.action('double', 8);
      this.use('air');
      // Air Burst: air jumps throw you toward the direction you hold
      if (L.spring >= 3 && this.towardWish(T.airBurst)) this.events.emit('boost', { kind: 'airburst' });
    });
    ev.on('dash', () => {
      this.action('dash', 9);
      this.use('dash');
    });
    ev.on('dashEnd', () => {
      this.lastDashEnd = this.now;
      lock();
    });
    ev.on('slideStart', () => {
      this.action('slide', 7);
      this.use('ground');
      this.slideFor = 0;
      if (this.skimming) {
        this.skimming = false;
        this.forward(T.skimBoost);
        this.events.emit('boost', { kind: 'skim' });
      }
      lock();
    });
    ev.on('wallRunStart', () => {
      this.action('wall', 10);
      this.use('wall');
    });
    ev.on('wallRunEnd', lock);
    ev.on('wallJump', () => {
      this.action('walljump', 10);
      this.use('wall');
      lock();
      if (L.wallrunner >= 2 && this.committed()) {
        this.forward(T.wallSurge);
        this.events.emit('boost', { kind: 'surge' });
      } else if (this.flowTier >= 2 && this.committed()) this.forward(0.6);
      if (this.has('ricochet')) {
        const pl = this.sim.player;
        pl.dashEnergy = Math.min(this.cfg.dashCharges, pl.dashEnergy + 1);
      }
    });
    ev.on('vault', () => {
      this.action('vault', 8);
      this.use('ground');
      lock();
    });
    ev.on('land', ({ speed, slide }) => {
      const pl = this.sim.player;
      const fell = this.airPeak;
      this.airPeak = 0;
      this.skywardUsed = false;
      if (pl.speed > movementConfig.sprintSpeed + 1) this.landBoostLeft = 0.5;
      if (L.steady > 0 && fell > 0.4 && pl.state !== MoveState.Slide && this.committed()) {
        this.forward(at(T.steadyGive, L.steady));
        this.events.emit('boost', { kind: 'steady' });
      }
      // Conservation: the drop becomes forward speed
      if (L.flywheel >= 2 && speed > 8 && this.committed()) {
        this.forward(Math.min(speed * T.conserveScale, T.conserveMax));
        this.events.emit('boost', { kind: 'conserve' });
      }
      if (this.slamming || (L.steady >= 2 && speed >= T.shockLandSpeed)) {
        this.shockwave(T.shockLandRadius, this.slamming ? 'slam' : 'land');
        this.addFlux(6);
      }
      this.slamming = false;
      // Skim: touching down into a slide (slide held) gives it a kick
      if (L.glide >= 4 && slide) this.skimming = true;
    });
    const se = this.sim.events;
    se.on('break', ({ index, by }) => this.onBreak(index, by));
    se.on('sword', ({ action, combo }) => {
      if (action !== 'slash') return;
      this.use('combat', 0.5);
      // a slash straight out of a dash extends it
      if (this.now - this.lastDashEnd < 0.2 && this.dashCutUsed !== this.sim.stats.dashes) {
        this.dashCutUsed = this.sim.stats.dashes;
        this.forward(2);
        this.events.emit('boost', { kind: 'dashcut' });
      }
      if (L.edge >= 2) this.crescent();
      const finisher = (combo ?? 0) >= 2;
      if (L.severance >= 2 && finisher && this.finisherDash !== this.sim.sword.serial) {
        this.finisherDash = this.sim.sword.serial;
        const pl = this.sim.player;
        pl.dashEnergy = Math.min(this.cfg.dashCharges, pl.dashEnergy + 1);
      }
      if (L.severance >= 3 && finisher) this.shockwave(T.shockwaveRadius, 'finisher');
    });
  }

  /** Anything broke: rewards by kind, the Kinetic Chain, and the cut-linked abilities. */
  private onBreak(i: number, by: 'sword' | 'body') {
    const pl = this.sim.player,
      L = this.levels;
    const def = this.sim.data.breakables[i];
    const kind: BreakableKind = def.kind;
    const dashing = pl.state === MoveState.Dash || pl.sinceDash < 0.12;
    // Blink Chain: a dash that breaks something gives its charge back (once per dash)
    if (L.phase >= 4 && dashing && this.blinkUsed !== this.sim.stats.dashes) {
      this.blinkUsed = this.sim.stats.dashes;
      pl.dashEnergy = Math.min(this.cfg.dashCharges, pl.dashEnergy + 1);
      this.events.emit('boost', { kind: 'blink' });
    }
    if (by === 'body') {
      // Slipstream: at speed, smashing through is as good as a cut
      if (L.stride >= 4 && pl.speed >= T.slipstreamSpeed && this.committed()) {
        this.forward(T.slipstreamPush);
        this.events.emit('boost', { kind: 'slipstream' });
      } else if (!dashing) return;
    }
    this.action('cut', 7);
    this.use('combat');
    const siphon = at(T.siphonFlux, L.siphon) + (L.mirror > 0 ? T.mirrorFlux : 0);
    let flux = 5 + siphon;
    switch (kind) {
      case 'prism':
        // Kinetic Prism: the crystal's stored motion is yours
        this.forward(pl.speed > 15 ? 4.5 : 3);
        this.events.emit('boost', { kind: 'prism' });
        flux += 3;
        break;
      case 'lantern':
        if (!pl.grounded) {
          // Drift Lantern: a lift in the air and an air jump back
          const up = quatRotate(pl.frame, UP, _u);
          pl.impulse(up.x, up.y, up.z, 0, 8.5);
          pl.refundAirJump();
          this.events.emit('boost', { kind: 'lantern' });
        }
        flux += 3;
        break;
      case 'bloom':
        flux += 15;
        break;
      case 'sentinel':
        flux += 1;
        this.bumpStreak(); // satisfying: counts twice
        break;
      case 'seal':
        flux += 4;
        if (this.areaDepth === 0) this.wave(def.p[0], def.p[1] + 1.2, def.p[2], 7);
        break;
      case 'spindle':
        if (def.gate !== undefined) this.spindle(def.gate);
        break;
      case 'core':
        // Energy Core: it bursts, and its charge is yours for a while
        flux += 5;
        this.overcharge();
        if (this.areaDepth === 0) this.wave(def.p[0], def.p[1] + 1.35, def.p[2], 5);
        break;
      case 'glass':
        flux += 1;
        break;
      case 'conduit':
      case 'chain':
        flux += 3;
        break;
      case 'mote':
        flux -= 2;
        break;
    }
    this.addFlux(flux);
    this.bumpStreak();
    // cut-linked abilities: blade cuts and the Crescent's wave count, other area cuts do not
    if (this.areaDepth > 0 && !this.inCrescent) return;
    if (by === 'sword') {
      if (L.edge >= 3 && !pl.grounded && !this.skywardUsed) {
        this.skywardUsed = true;
        const up = quatRotate(pl.frame, UP, _u);
        pl.impulse(up.x, up.y, up.z, 0, T.skywardLift);
        pl.refundAirJump();
        this.events.emit('boost', { kind: 'skyward' });
      }
      if (this.has('tempest') && pl.speed > T.tempestSpeed && this.now - this.tempestAt > 0.25) {
        this.tempestAt = this.now;
        this.forward(T.tempestPush);
        this.events.emit('boost', { kind: 'tempest' });
      }
      if (this.areaDepth > 0) return; // no Reach chains off the Crescent's wave
      const t = this.sim.targetOf(i) ?? breakAt(def);
      this.areaDepth++;
      if (L.reach >= 2) this.cutNear(t.x, t.y, t.z, T.wideArc);
      if (L.reach >= 3) this.arcChain(t.x, t.y, t.z, 2);
      this.areaDepth--;
    }
  }

  /** Kinetic Chain: +1, with rewards at every fifth link. */
  private bumpStreak() {
    this.streak++;
    this.streakLeft = STREAK_WINDOW + (this.levels.siphon >= 3 ? 1 : 0);
    if (this.streak > this.peakStreak) this.peakStreak = this.streak;
    let milestone: string | undefined;
    if (this.streak % 5 === 0) {
      const pl = this.sim.player;
      const step = (this.streak / 5) % 3;
      if (step === 1) {
        milestone = 'Kinetic Burst';
        this.forward(2.5);
        this.lock(1);
      } else if (step === 2) {
        milestone = 'Recharge';
        pl.dashEnergy = this.cfg.dashCharges;
        pl.refundAirJump();
      } else {
        milestone = 'Overcharge';
        this.addFlux(20);
      }
      this.events.emit('boost', { kind: 'streak' });
      this.secondWind();
    }
    this.events.emit('streak', { n: this.streak, milestone });
  }

  private spindle(gate: number) {
    let g = this.gates.get(gate);
    if (!g) {
      const total = this.sim.data.breakables.filter((b) => b.kind === 'spindle' && b.gate === gate).length;
      g = { left: total, total, deadline: this.now + GATE_WINDOW };
      this.gates.set(gate, g);
    }
    if (g.left <= 0) return;
    g.left--;
    const cleared = g.left === 0 && this.now <= g.deadline;
    this.events.emit('gate', { gate, cleared, left: g.left });
    if (cleared) {
      const pl = this.sim.player;
      this.forward(2.5);
      this.secondWind();
      pl.dashEnergy = this.cfg.dashCharges;
      this.lock(1.2);
      this.addFlux(20);
      this.events.emit('boost', { kind: 'gate' });
    }
  }

  /** Start (or extend) Momentum Lock. */
  private lock(seconds: number) {
    if (seconds >= this.lockLeft) {
      this.lockLeft = seconds;
      this.lockMax = seconds;
    }
  }

  /**
   * Every temporary effect running now, with its real time left (the active-effects HUD). Permanent
   * abilities are not here; Overdrive has no clock (it lasts while you keep sprinting).
   */
  effects(): { id: string; name: string; desc: string; left: number; max: number }[] {
    const out: { id: string; name: string; desc: string; left: number; max: number }[] = [];
    const L = this.levels,
      pl = this.sim.player;
    if (this.surgeLeft > 0)
      out.push({
        id: 'surge',
        name: 'Surge',
        desc: 'The world runs slow; you do not',
        left: this.surgeLeft,
        max: at(T.timeslipTime, L.timeslip) * (L.chrono > 0 ? 1.5 : 1),
      });
    if (this.reflexLeft > 0)
      out.push({
        id: 'reflex',
        name: 'Reflex',
        desc: 'Time slows as a hazard comes up',
        left: this.reflexLeft,
        max: T.reflexTime,
      });
    if (this.overchargeLeft > 0)
      out.push({
        id: 'overcharge',
        name: 'Overcharge',
        desc: 'Sprint costs no stamina · Flux ×1.5',
        left: this.overchargeLeft,
        max: T.overchargeTime,
      });
    if (this.lockLeft > 0)
      out.push({
        id: 'lock',
        name: 'Momentum Lock',
        desc: 'Speed above your sprint is held',
        left: this.lockLeft,
        max: Math.max(this.lockLeft, this.lockMax),
      });
    if (this.invuln > 0)
      out.push({
        id: 'shield',
        name: 'Shielded',
        desc: 'Hazards pass through you (falls still count)',
        left: this.invuln,
        max: 1,
      });
    if (L.spring >= 4 && this.hoverLeft < T.hoverTime && !pl.grounded && this.hoverLeft > 0)
      out.push({
        id: 'hover',
        name: 'Hover',
        desc: 'Hold jump to slow your fall',
        left: this.hoverLeft,
        max: T.hoverTime,
      });
    if (this.overdriveOn && pl.state === MoveState.Sprint)
      out.push({
        id: 'overdrive',
        name: 'Overdrive',
        desc: '+2 m/s while you keep sprinting',
        left: -1,
        max: -1,
      });
    return out;
  }

  /** Endurance 2: a full stamina bar. */
  private secondWind() {
    if (this.levels.endurance < 2) return;
    const pl = this.sim.player;
    pl.stamina = this.cfg.staminaMax;
    pl.exhausted = false;
  }

  /** Start (or extend) Overcharge. */
  overcharge(seconds: number = T.overchargeTime) {
    this.overchargeLeft = Math.max(this.overchargeLeft, seconds);
    this.events.emit('effect', { id: 'overcharge', on: true });
  }

  /** Air Burst: a push toward the held direction (the look direction when nothing is held). */
  private towardWish(add: number): boolean {
    const pl = this.sim.player;
    const inp = this.lastInp;
    // nothing held: a plain air jump (the burst is yours to aim, or to leave out)
    if (!inp || (Math.abs(inp.moveX) < 0.1 && Math.abs(inp.moveZ) < 0.1)) return false;
    if (pl.framed) {
      this.forward(add);
      return true;
    }
    const fx = -Math.sin(pl.yaw),
      fz = -Math.cos(pl.yaw),
      rx = Math.cos(pl.yaw),
      rz = -Math.sin(pl.yaw);
    let dx = fx * inp.moveZ + rx * inp.moveX,
      dz = fz * inp.moveZ + rz * inp.moveX;
    const l = Math.hypot(dx, dz);
    if (l < 0.1) {
      dx = fx;
      dz = fz;
    } else {
      dx /= l;
      dz /= l;
    }
    pl.boost(dx, dz, add, 0);
    return true;
  }

  /**
   * Is the runner committing to speed (sprint held, moving forward)? The automatic pushes
   * (Wall Surge, Steady, Conservation, Updraft, Slipstream, slide-jump kicks) only fire then: let
   * go of sprint and every move is the plain one again, so no upgrade can carry you past a
   * landing you meant to make.
   */
  private committed() {
    const i = this.lastInp;
    return !!i && i.sprint && i.moveZ > 0;
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
    this.areaDepth++;
    this.cutWhere((_x, _y, _z, d) => d < r);
    this.areaDepth--;
  }

  /** Everything breakable within `r` of a point (Wide Arc, Rift Seal waves). */
  private cutNear(x: number, y: number, z: number, r: number) {
    const sim = this.sim;
    const bs = sim.data.breakables;
    for (let i = 0; i < bs.length; i++) {
      if (sim.broken[i]) continue;
      const t = sim.targetOf(i);
      if (t && Math.hypot(t.x - x, t.y - y, t.z - z) - t.r < r) sim.cutObject(i, 'sword');
    }
  }

  /** Rift Seal: an energy wave that cuts everything around it. */
  private wave(x: number, y: number, z: number, r: number) {
    this.events.emit('shockwave', { x, y, z, r, kind: 'finisher' });
    this.areaDepth++;
    this.cutNear(x, y, z, r);
    this.areaDepth--;
  }

  /** Arc Chain: from a cut, leap to the nearest intact object ahead, `hops` times. */
  private arcChain(x: number, y: number, z: number, hops: number) {
    const sim = this.sim,
      pl = sim.player;
    const v = pl.vel;
    const vl = Math.hypot(v.x, v.y, v.z);
    const fx = vl > 1 ? v.x / vl : -Math.sin(pl.yaw),
      fy = vl > 1 ? v.y / vl : 0,
      fz = vl > 1 ? v.z / vl : -Math.cos(pl.yaw);
    for (let h = 0; h < hops; h++) {
      let best = -1,
        bd: number = T.arcLeap;
      const bs = sim.data.breakables;
      for (let i = 0; i < bs.length; i++) {
        if (sim.broken[i]) continue;
        const t = sim.targetOf(i);
        if (!t) continue;
        const dx = t.x - x,
          dy = t.y - y,
          dz = t.z - z;
        const d = Math.hypot(dx, dy, dz);
        if (d < bd && dx * fx + dy * fy + dz * fz > -0.25 * d) {
          bd = d;
          best = i;
        }
      }
      if (best < 0) return;
      const t = sim.targetOf(best)!;
      this.events.emit('shockwave', { x: t.x, y: t.y, z: t.z, r: 1.2, kind: 'crescent' });
      sim.cutObject(best, 'sword');
      x = t.x;
      y = t.y;
      z = t.z;
    }
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
    this.areaDepth++;
    this.inCrescent = true;
    this.cutWhere((dx, dy, dz, d) => {
      if (d > T.crescentReach) return false;
      const l = Math.hypot(dx, dy, dz) || 1;
      return (dx * fx + dy * fy + dz * fz) / l > 0.72;
    });
    this.inCrescent = false;
    this.areaDepth--;
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
        this.addFlux(8);
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
    if (it.kind !== 'glint') {
      this.action('pickup:' + it.kind, 5);
      this.bumpStreak();
    } else if (this.streak > 0) this.streakLeft = Math.max(this.streakLeft, 1.2); // glints keep a chain alive
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
      if (this.levels.phase >= 3 && pl.state === MoveState.Dash) return true;
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
    this.lastInp = inp;
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
      this.use('air');
    }
    // Hover (Spring 4): hold jump while falling
    if (L.spring >= 4 && pl.state === MoveState.Air && inp.jumpHeld && pl.upSpeed < 0 && this.hoverLeft > 0) {
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
    this.lockLeft = Math.max(0, this.lockLeft - dt);
    if (this.overchargeLeft > 0) {
      this.overchargeLeft -= dt;
      if (this.overchargeLeft <= 0) {
        this.overchargeLeft = 0;
        this.events.emit('effect', { id: 'overcharge', on: false });
      }
    }
    if (pl.sprinting) this.use('ground', dt * 0.6);
    // Redline: sprinting in Overdrive keeps the Kinetic Chain from breaking
    if (this.streak > 0 && this.has('redline') && pl.sprinting && this.overdriveOn)
      this.streakLeft = Math.max(this.streakLeft, 0.6);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.streak > 0) {
      this.streakLeft -= dt;
      if (this.streakLeft <= 0) {
        this.events.emit('streak', { n: this.streak, broken: true });
        this.streak = 0;
        this.streakLeft = 0;
      }
    }
    for (const [gate, g] of this.gates)
      if (g.left > 0 && this.now > g.deadline) {
        this.events.emit('gate', { gate, cleared: false, left: g.left });
        g.left = 0;
      }
    // usage fades over ~20 s so a full meter evolves what you do now
    const fade = Math.exp(-dt / 20);
    for (const k of Object.keys(this.usage) as Family[]) this.usage[k] *= fade;
    if (st === MoveState.Sprint) this.use('ground', dt * 0.4);
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
    if (st === MoveState.Slide && (pl.speed > 13 || L.glide >= 3)) this.addFlux((L.glide >= 3 ? 6 : 3) * dt);
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
      streak: this.streak,
      streakLeft: this.streak > 0 ? this.streakLeft / (STREAK_WINDOW + (this.levels.siphon >= 3 ? 1 : 0)) : 0,
      mult: this.streakMult(),
      lock: this.lockLeft,
      effects: this.effects(),
      chainLeft: this.echoNext > 0 && this.echoNext < 4 ? Math.max(0, this.echoDeadline - this.now) : 0,
      abilities: ABILITY_IDS.filter((id) => this.levels[id] > 0).map((id) => ({
        id,
        glyph: ABILITIES[id].glyph,
        name: ABILITIES[id].name,
        level: this.levels[id],
        max: ABILITIES[id].max,
        category: ABILITIES[id].category,
        evoAt: Object.keys(ABILITIES[id].evolutions).map(Number),
        stageName:
          Object.entries(ABILITIES[id].evolutions)
            .filter(([lv]) => Number(lv) <= this.levels[id])
            .map(([, n]) => n)
            .pop() ?? '',
      })),
      synergies: [...this.synergies],
    };
  }
}
