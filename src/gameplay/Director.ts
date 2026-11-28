/**
 * The Difficulty Director: the course answers the runner.
 *
 * Eight dimensions (traversal, obstacle, environment, reaction, precision, ability, density,
 * visual), each 0..1, are recomputed four times a second from what the simulation knows: how far
 * into the course the next encounter sits, upgrades (Evolve), sprint capacity, recent speed, the
 * Kinetic Chain, and recent deaths. Each moves at most RATE per second (no spikes) and is capped by
 * how far into the course you are (no early walls of difficulty).
 *
 * Courses mark encounters (sections built by src/levels/sections.ts); their variants are entities
 * and breakables tagged with the encounter's id and a tier range. When the runner comes within
 * LOOK metres of an encounter it is given a tier from the dimensions it uses, and only that tier's
 * variants exist. Rules:
 *  - tiers only ever add optional routes, things the line already clears, more to cut, or faster
 *    telegraphed cycles (never under TELEGRAPH_TIME); no tier needs an ability you may not have;
 *  - after an intense encounter the next one is held back a tier (recovery);
 *  - dying in an encounter lowers its tier on the next attempt (down to 0);
 *  - everything is a pure function of simulation state: same inputs, same course.
 *
 * Both modes run it. In Pure there are no upgrades, so it follows the course and your consistency.
 */
import type { DifficultyDim, EncounterDef } from '../levels/types';
import type { Simulation } from './Simulation';

export const DIMS: DifficultyDim[] = [
  'traversal',
  'obstacle',
  'environment',
  'reaction',
  'precision',
  'ability',
  'density',
  'visual',
];

/** Metres before an encounter's start at which its tier is chosen. */
export const LOOK = 110;
/** Fastest a dimension may change, per second. */
export const RATE = 0.12;
const STEP = 0.25;

export interface DirectorTier {
  id: string;
  tier: number;
  max: number;
}

export class Director {
  readonly dims = {} as Record<DifficultyDim, number>;
  /** Tier chosen for each encounter this attempt. */
  readonly tiers = new Map<string, number>();
  /** Tests: every encounter at this tier (clamped to its max), ignoring the dimensions. */
  forced: number | null = null;
  private enc: EncounterDef[];
  private deathsIn = new Map<string, number>();
  private deathTimes: number[] = [];
  private speedAvg = 11;
  private acc = 0;
  private lastIntense = -1;
  private current: string | null = null;

  constructor(private sim: Simulation) {
    this.enc = sim.data.encounters ?? [];
    this.reset(true);
  }

  get encounters(): readonly EncounterDef[] {
    return this.enc;
  }

  /** Full restart: fresh dimensions, every encounter undecided and at tier 0 until seen. */
  reset(full: boolean) {
    if (full) {
      this.tiers.clear();
      this.deathsIn.clear();
      this.deathTimes.length = 0;
      this.lastIntense = -1;
      this.speedAvg = 11;
      for (const d of DIMS) this.dims[d] = d === 'visual' ? 0.3 : 0.15;
      for (const e of this.enc) this.apply(e, 0);
    }
    this.current = null;
  }

  /** A death: remembered against the encounter it happened in (that encounter eases next time). */
  onDeath(time: number) {
    this.deathTimes.push(time);
    if (this.current) {
      this.deathsIn.set(this.current, (this.deathsIn.get(this.current) ?? 0) + 1);
      // re-decide it when it is next approached
      this.tiers.delete(this.current);
    }
  }

  /** Inputs read from the simulation, each 0..1. */
  inputs() {
    const sim = this.sim,
      pl = sim.player,
      evo = sim.evo;
    const L = evo?.levels;
    const move = L
      ? (L.stride + L.glide + L.spring + L.phase + L.wallrunner + L.flywheel + (L.endurance ?? 0)) / 20
      : 0;
    const sword = L ? (L.edge + L.reach + L.severance + L.siphon) / 10 : 0;
    const now = sim.time;
    const recent = this.deathTimes.filter((t) => now - t < 90).length;
    return {
      move: Math.min(1, move),
      sword: Math.min(1, sword),
      speed: Math.min(1, Math.max(0, (this.speedAvg - 9) / 8)),
      sprint: Math.min(1, (pl.cfg.staminaMax / 100) * 0.6 + (pl.stamina / pl.cfg.staminaMax) * 0.4),
      chain: evo ? Math.min(1, evo.streak / 10) : 0,
      struggle: Math.min(0.75, recent * 0.25),
    };
  }

  /** Target value of each dimension for an encounter at course progress `p` (0..1). */
  targets(p: number): Record<DifficultyDim, number> {
    const i = this.inputs();
    const base = 0.12 + 0.6 * p;
    // early in a course the ceiling is low: difficulty grows with the journey, not ahead of it
    const cap = 0.45 + 0.55 * p;
    const t = {
      traversal: base + 0.35 * i.move + 0.1 * i.speed,
      obstacle: base + 0.2 * i.move + 0.1 * i.chain,
      environment: base + 0.15 * p,
      reaction: base + 0.15 * i.speed + 0.1 * i.sprint,
      precision: base + 0.2 * i.move,
      ability: base * 0.8 + 0.45 * i.move,
      density: base + 0.3 * i.sword + 0.15 * i.chain,
      visual: 0.3 + 0.7 * p,
    } as Record<DifficultyDim, number>;
    for (const d of DIMS) {
      const v = d === 'visual' ? t[d] : t[d] - i.struggle;
      t[d] = Math.max(0, Math.min(cap, v, 1));
    }
    return t;
  }

  /** Once per tick. */
  tick(dt: number) {
    const sim = this.sim,
      pl = sim.player;
    this.speedAvg += (pl.speed - this.speedAvg) * Math.min(1, dt / 6);
    this.acc += dt;
    if (this.acc < STEP) return;
    this.acc = 0;
    const next = this.nextEncounter();
    const p = this.enc.length ? (next < 0 ? 1 : next / Math.max(1, this.enc.length - 1)) : 0;
    const t = this.targets(p);
    for (const d of DIMS) {
      const delta = t[d] - this.dims[d];
      const lim = RATE * STEP;
      this.dims[d] += Math.max(-lim, Math.min(lim, delta));
    }
    // decide encounters coming into sight; remember which one the runner is in
    const pp = pl.pos;
    this.current = null;
    for (let k = 0; k < this.enc.length; k++) {
      const e = this.enc[k];
      const dz = e.p[2] - pp.z,
        d = Math.hypot(e.p[0] - pp.x, e.p[1] - pp.y, dz);
      if (d < LOOK && !this.tiers.has(e.id)) this.decide(e, k);
      // inside: from its start until the next encounter's start
      const after = this.enc[k + 1];
      const pastStart = Math.hypot(e.p[0] - pp.x, e.p[2] - pp.z) < 4 || pp.z > e.p[2];
      const beforeNext = !after || pp.z < after.p[2];
      if (pastStart && beforeNext) this.current = e.id;
    }
  }

  /** Index of the first encounter whose start is still ahead (-1 = past them all). */
  private nextEncounter() {
    const z = this.sim.player.pos.z;
    for (let k = 0; k < this.enc.length; k++) if (this.enc[k].p[2] > z) return k;
    return -1;
  }

  /** Choose and apply an encounter's tier. */
  decide(e: EncounterDef, k = this.enc.indexOf(e)) {
    let tier: number;
    if (this.forced !== null) tier = Math.min(e.max, Math.max(0, this.forced));
    else {
      let v = 0;
      for (const d of e.dims) v += this.dims[d];
      v /= Math.max(1, e.dims.length);
      tier = Math.min(e.max, Math.floor(v * (e.max + 1)));
      // recovery after a set piece, and easing after deaths here
      if (this.lastIntense >= 0 && k === this.lastIntense + 1) tier = Math.min(tier, Math.max(0, e.max - 1));
      tier = Math.max(0, tier - (this.deathsIn.get(e.id) ?? 0));
    }
    if (e.intense) this.lastIntense = k;
    this.tiers.set(e.id, tier);
    this.apply(e, tier);
    return tier;
  }

  /** Make exactly the variants of `tier` exist. */
  private apply(e: EncounterDef, tier: number) {
    const sim = this.sim;
    const ok = (t?: [number, number]) => !t || (tier >= t[0] && tier <= t[1]);
    for (const ent of sim.entities) if (ent.def.enc === e.id) sim.setPresent(ent.index, ok(ent.def.tiers));
    sim.data.breakables.forEach((b, i) => {
      if (b.enc === e.id) sim.setBreakablePresent(i, ok(b.tiers));
    });
  }

  /** Does an entity or breakable with these tags exist at its encounter's current tier? */
  allows(def: { enc?: string; tiers?: [number, number] }) {
    if (!def.enc || !def.tiers) return true;
    const t = this.tiers.get(def.enc) ?? 0;
    return t >= def.tiers[0] && t <= def.tiers[1];
  }

  /** Snapshot for the HUD debug view and tests. */
  state(): { dims: Record<DifficultyDim, number>; tiers: DirectorTier[] } {
    return {
      dims: { ...this.dims },
      tiers: this.enc.map((e) => ({ id: e.id, tier: this.tiers.get(e.id) ?? -1, max: e.max })),
    };
  }
}
