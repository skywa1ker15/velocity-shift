/**
 * Evolve mode collectibles: the kinds, how each is caught, and the seeded spawner that places a
 * run's set into the course's slots (see slots.ts).
 *
 * The spawner is random but controlled: a fixed budget per 100 m, rarity weights, minimum spacing,
 * and every piece sits in a slot the reference line passes through doing the move that catches it.
 */
import type { Slot, SlotKind } from './slots';

export type CollectibleKind =
  'glint' | 'undertow' | 'skyknot' | 'rift' | 'glyph' | 'vein' | 'echo' | 'paradox';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';

export interface CollectibleKindDef {
  name: string;
  rarity: Rarity;
  /** How it is caught, in a few words (HUD / docs). */
  how: string;
  /** What it gives. */
  gives: string;
  /** Pickup radius from the body centre (m). */
  radius: number;
}

export const KINDS: Record<CollectibleKind, CollectibleKindDef> = {
  glint: { name: 'Glint', rarity: 'common', how: 'run through it', gives: 'Flux', radius: 1.3 },
  undertow: {
    name: 'Undertow',
    rarity: 'uncommon',
    how: 'slide under it',
    gives: 'a ground ability',
    radius: 1.2,
  },
  skyknot: {
    name: 'Skyknot',
    rarity: 'uncommon',
    how: 'touch it in the air',
    gives: 'an air ability',
    radius: 1.3,
  },
  rift: {
    name: 'Rift Mote',
    rarity: 'uncommon',
    how: 'dash through it',
    gives: 'a dash ability',
    radius: 1.4,
  },
  glyph: {
    name: 'Fracture Glyph',
    rarity: 'uncommon',
    how: 'cut it with the sword',
    gives: 'a combat ability',
    radius: 0,
  },
  vein: {
    name: 'Wall Vein',
    rarity: 'uncommon',
    how: 'touch it while wall-running',
    gives: 'a wall ability',
    radius: 1.4,
  },
  echo: {
    name: 'Echo Chain',
    rarity: 'rare',
    how: 'catch all four nodes in turn',
    gives: 'a rare ability',
    radius: 1.3,
  },
  paradox: {
    name: 'Paradox Core',
    rarity: 'mythic',
    how: 'touch it at Flow tier 3 or higher',
    gives: 'a mythic ability',
    radius: 1.4,
  },
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#7ff3ff',
  uncommon: '#9dff7a',
  rare: '#ffb547',
  mythic: '#ff5cf0',
};

export interface Placed {
  kind: CollectibleKind;
  p: [number, number, number];
  u: [number, number, number];
  /** Distance along the line. */
  d: number;
  /** Echo chain: its group and position in the chain (0..3). */
  group?: number;
  order?: number;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uncommon kinds and the slot kinds each may use (first choice first). */
const UNCOMMON: [CollectibleKind, SlotKind[], number][] = [
  ['undertow', ['slide', 'ground'], 1],
  ['skyknot', ['air'], 1],
  ['rift', ['ground', 'air'], 1],
  ['glyph', ['cut'], 1],
  ['vein', ['wall'], 1.2],
];

export interface SpawnBudget {
  /** One string of glints per this many metres. */
  glintEvery: number;
  uncommonEvery: number;
  /** Chance of one Echo Chain, and of one Paradox Core. */
  echoChance: number;
  paradoxChance: number;
}
export const DEFAULT_BUDGET: SpawnBudget = {
  glintEvery: 30,
  uncommonEvery: 36,
  echoChance: 0.85,
  paradoxChance: 0.5,
};

/**
 * Place one run's collectibles. Same slots + same seed → the same layout (tests rely on it).
 */
export function placeCollectibles(
  slots: readonly Slot[],
  seed: number,
  budget = DEFAULT_BUDGET,
  /** Points already used by the slashable world: no collectible within 2.5 m of one. */
  occupied: readonly (readonly [number, number, number])[] = [],
): Placed[] {
  const r = rng(seed);
  const out: Placed[] = [];
  if (!slots.length) return out;
  const L = slots[slots.length - 1].d;
  const used: number[] = []; // distances already taken (any kind)
  const free = (d: number, gap: number) => used.every((u) => Math.abs(u - d) >= gap);
  const clear = (s: Slot) =>
    !occupied.some((o) => Math.hypot(o[0] - s.p[0], o[1] + 1 - s.p[1], o[2] - s.p[2]) < 2.5);
  const of = (k: SlotKind) => slots.filter((s) => s.k === k && clear(s));
  const take = (s: Slot, kind: CollectibleKind, extra?: Partial<Placed>) => {
    used.push(s.d);
    out.push({ kind, p: [...s.p], u: [...s.u], d: s.d, ...extra });
  };
  const body = slots.filter((s) => s.k !== 'cut' && clear(s));

  // rare: an Echo Chain on a stretch of four slots 6..10 m apart
  if (r() < budget.echoChance) {
    const starts = body.filter((s) => s.d > L * 0.15 && s.d < L * 0.85);
    for (let tries = 0; tries < 12 && starts.length; tries++) {
      const s0 = starts[Math.floor(r() * starts.length)];
      const chain = [s0];
      for (const s of body) {
        const last = chain[chain.length - 1];
        if (chain.length < 4 && s.d - last.d >= 6 && s.d - last.d <= 10) chain.push(s);
      }
      if (chain.length === 4 && chain.every((s) => free(s.d, 8))) {
        chain.forEach((s, i) => take(s, 'echo', { group: 0, order: i }));
        break;
      }
    }
  }
  // mythic: a Paradox Core somewhere in the back half
  if (r() < budget.paradoxChance) {
    const cand = body.filter((s) => s.d > L * 0.4 && s.d < L * 0.92 && free(s.d, 14));
    if (cand.length) take(cand[Math.floor(r() * cand.length)], 'paradox');
  }
  // uncommon: a fixed count, weighted by kind, spread out
  const nU = Math.max(3, Math.round(L / budget.uncommonEvery));
  for (let n = 0, guard = 0; n < nU && guard < nU * 20; guard++) {
    const avail = UNCOMMON.filter(([, ks]) => ks.some((k) => of(k).length));
    if (!avail.length) break;
    let w = r() * avail.reduce((a, x) => a + x[2], 0);
    let pick = avail[0];
    for (const a of avail)
      if ((w -= a[2]) <= 0) {
        pick = a;
        break;
      }
    const [kind, ks] = pick;
    const pool = ks.flatMap((k) => of(k)).filter((s) => free(s.d, 12));
    if (!pool.length) continue;
    take(pool[Math.floor(r() * pool.length)], kind);
    n++;
  }
  // common: strings of 3..5 glints along the line, one string per stretch
  const nG = Math.max(4, Math.round(L / budget.glintEvery));
  for (let i = 0; i < nG; i++) {
    const target = ((i + 0.3 + r() * 0.4) / nG) * L;
    const start = body.findIndex((s) => s.d >= target && free(s.d, 6));
    if (start < 0) continue;
    const len = 3 + Math.floor(r() * 3);
    let prev = body[start];
    let count = 0;
    for (let j = start; j < body.length && count < len; j++) {
      const s = body[j];
      if (count > 0 && (s.d - prev.d > 6 || !free(s.d, 3))) break;
      if (count > 0 && s.d - prev.d < 2.5) continue;
      take(s, 'glint');
      prev = s;
      count++;
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}
