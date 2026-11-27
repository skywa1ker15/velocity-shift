/**
 * Evolve mode: every ability, its levels and what each level does.
 *
 * Values grow with diminishing returns (each level adds less than the one before) and every
 * ability has a hard cap. Milestone levels unlock a new behaviour (an "evolution": Overdrive,
 * Triple Jump, Wall Surge...). Nothing here touches the simulation directly: Evolution.ts reads
 * these tables and writes the player's tuning layer each tick.
 */

export type AbilityCategory = 'movement' | 'combat' | 'survival' | 'special' | 'mythic';
export type AbilityId =
  | 'stride'
  | 'glide'
  | 'spring'
  | 'phase'
  | 'wallrunner'
  | 'flywheel'
  | 'edge'
  | 'reach'
  | 'severance'
  | 'siphon'
  | 'aegis'
  | 'reflex'
  | 'steady'
  | 'timeslip'
  | 'magnet'
  | 'overclock'
  | 'mirror'
  | 'chrono';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  category: AbilityCategory;
  /** Which collectible family grants it. */
  family: 'ground' | 'air' | 'dash' | 'wall' | 'combat' | 'survival' | 'mythic';
  max: number;
  /** One line per level (index 0 = level 1). */
  levels: string[];
  /** Levels that unlock a new behaviour, with its name. */
  evolutions: Record<number, string>;
  /** Short glyph for the HUD rail (2 letters). */
  glyph: string;
}

const A = (d: AbilityDef) => d;

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  stride: A({
    id: 'stride',
    name: 'Stride',
    category: 'movement',
    family: 'ground',
    max: 5,
    glyph: 'St',
    levels: [
      'Sprint +0.6 m/s, faster to top speed',
      'Sprint +1.1 m/s',
      'Overdrive: after 1.5 s of sprinting, another +1.2 m/s',
      'Sprint +1.8 m/s',
      'Sprint +2.0 m/s (cap)',
    ],
    evolutions: { 3: 'Overdrive' },
  }),
  glide: A({
    id: 'glide',
    name: 'Glide',
    category: 'movement',
    family: 'ground',
    max: 5,
    glyph: 'Gl',
    levels: [
      'Slides keep more speed, slide boost +0.4 m/s',
      'Slides keep more speed, slide boost +0.7 m/s',
      'Charged Slide: slide for 0.5 s, then jump — the Slingshot',
      'Slides keep even more speed',
      'Longest slides, slide boost +1.15 m/s (cap)',
    ],
    evolutions: { 3: 'Charged Slide' },
  }),
  spring: A({
    id: 'spring',
    name: 'Spring',
    category: 'movement',
    family: 'air',
    max: 5,
    glyph: 'Sp',
    levels: [
      'Jumps a little higher',
      'Triple Jump: a third jump in the air',
      'Jumps higher still',
      'Double and triple jumps stronger',
      'Hover: hold jump while falling to glide down',
    ],
    evolutions: { 2: 'Triple Jump', 5: 'Hover' },
  }),
  phase: A({
    id: 'phase',
    name: 'Phase Dash',
    category: 'movement',
    family: 'dash',
    max: 5,
    glyph: 'Ph',
    levels: [
      'Dash faster, recharge faster',
      'A third dash charge',
      'Dash faster, recharge faster',
      'Phase: dashes pass through lethal beams',
      'Fastest dash (cap)',
    ],
    evolutions: { 2: 'Third Charge', 4: 'Phase' },
  }),
  wallrunner: A({
    id: 'wallrunner',
    name: 'Wallrunner',
    category: 'movement',
    family: 'wall',
    max: 4,
    glyph: 'Wr',
    levels: [
      'Longer wall-runs, stronger wall jumps',
      'Longer wall-runs, stronger wall jumps',
      'Wall Surge: wall jumps throw you forward',
      'Longest wall-runs, strongest wall jumps (cap)',
    ],
    evolutions: { 3: 'Wall Surge' },
  }),
  flywheel: A({
    id: 'flywheel',
    name: 'Flywheel',
    category: 'movement',
    family: 'dash',
    max: 4,
    glyph: 'Fw',
    levels: [
      'Extra speed fades more slowly; speed ceiling +1.5 m/s',
      'Slower still; ceiling +2.6 m/s',
      'Slower still; ceiling +3.4 m/s',
      'Slowest fade; ceiling +4 m/s (cap)',
    ],
    evolutions: {},
  }),
  edge: A({
    id: 'edge',
    name: 'Edge',
    category: 'combat',
    family: 'combat',
    max: 4,
    glyph: 'Ed',
    levels: [
      'Swings 10% faster',
      'Swings 18% faster',
      'Crescent: every slash throws a cutting wave ahead; swings 24% faster',
      'Swings 28% faster (cap)',
    ],
    evolutions: { 3: 'Crescent' },
  }),
  reach: A({
    id: 'reach',
    name: 'Reach',
    category: 'combat',
    family: 'combat',
    max: 3,
    glyph: 'Re',
    levels: ['Blade reach +0.4 m', 'Blade reach +0.7 m', 'Blade reach +0.9 m (cap)'],
    evolutions: {},
  }),
  severance: A({
    id: 'severance',
    name: 'Severance',
    category: 'combat',
    family: 'combat',
    max: 3,
    glyph: 'Sv',
    levels: [
      'Combo finisher reaches 0.6 m further',
      'Combo finisher reaches 1.0 m further',
      'Shockwave: the finisher cuts everything around you (+1.2 m reach)',
    ],
    evolutions: { 3: 'Shockwave' },
  }),
  siphon: A({
    id: 'siphon',
    name: 'Siphon',
    category: 'combat',
    family: 'combat',
    max: 3,
    glyph: 'Si',
    levels: ['+4 Flux per cut', '+7 Flux per cut', '+9 Flux per cut (cap)'],
    evolutions: {},
  }),
  aegis: A({
    id: 'aegis',
    name: 'Aegis',
    category: 'survival',
    family: 'survival',
    max: 3,
    glyph: 'Ae',
    levels: [
      'A shield that absorbs one lethal hit (recharges in 20 s)',
      'Recharges in 14 s',
      'Recharges in 11 s, and also catches one fall into the void',
    ],
    evolutions: { 3: 'Void Catch' },
  }),
  reflex: A({
    id: 'reflex',
    name: 'Reflex',
    category: 'survival',
    family: 'survival',
    max: 3,
    glyph: 'Rf',
    levels: [
      'Time slows just before a hazard would hit (every 12 s)',
      'Every 9 s',
      'Every 7 s, and slows further',
    ],
    evolutions: {},
  }),
  steady: A({
    id: 'steady',
    name: 'Steady',
    category: 'survival',
    family: 'survival',
    max: 3,
    glyph: 'Sd',
    levels: [
      'Landings give 0.8 m/s back',
      'Shockwave Landing: big landings break everything nearby; 1.3 m/s back',
      'Landings give 1.6 m/s back (cap)',
    ],
    evolutions: { 2: 'Shockwave Landing' },
  }),
  timeslip: A({
    id: 'timeslip',
    name: 'Timeslip',
    category: 'special',
    family: 'survival',
    max: 3,
    glyph: 'Ts',
    levels: [
      'Surge: spend 30 Flux to slow the world to half speed for 2.5 s',
      'Slower world, 3 s',
      'Slowest world, 3.4 s (cap)',
    ],
    evolutions: {},
  }),
  magnet: A({
    id: 'magnet',
    name: 'Magnet',
    category: 'special',
    family: 'ground',
    max: 3,
    glyph: 'Mg',
    levels: ['Glints are pulled in from 3 m', 'From 4.5 m', 'From 5.5 m (cap)'],
    evolutions: {},
  }),
  overclock: A({
    id: 'overclock',
    name: 'Overclock',
    category: 'mythic',
    family: 'mythic',
    max: 1,
    glyph: 'Oc',
    levels: ['Flow never falls below tier 2, and every speed limit rises 10%'],
    evolutions: { 1: 'Overclock' },
  }),
  mirror: A({
    id: 'mirror',
    name: 'Mirror Edge',
    category: 'mythic',
    family: 'mythic',
    max: 1,
    glyph: 'Me',
    levels: ['Every slash is echoed by a mirror blade: double reach, +5 Flux per cut'],
    evolutions: { 1: 'Mirror Edge' },
  }),
  chrono: A({
    id: 'chrono',
    name: 'Chrono Heart',
    category: 'mythic',
    family: 'mythic',
    max: 1,
    glyph: 'Ch',
    levels: ['Surge costs no Flux at Flow tier 3+, and lasts 50% longer'],
    evolutions: { 1: 'Chrono Heart' },
  }),
};

export const ABILITY_IDS = Object.keys(ABILITIES) as AbilityId[];

/** Abilities each collectible family can grant. */
export const FAMILY_POOL: Record<AbilityDef['family'], AbilityId[]> = {
  ground: ['stride', 'glide', 'magnet'],
  air: ['spring'],
  dash: ['phase', 'flywheel'],
  wall: ['wallrunner'],
  combat: ['edge', 'reach', 'severance', 'siphon'],
  survival: ['aegis', 'reflex', 'steady', 'timeslip'],
  mythic: ['overclock', 'mirror', 'chrono'],
};

/** Value of a per-level table at a level (level 0 = the first entry, usually 0). */
export const at = (table: readonly number[], level: number) =>
  table[Math.max(0, Math.min(table.length - 1, level))];

/**
 * The numbers. Index = ability level (0 = not owned). Each step adds less than the last
 * (diminishing returns); the last entry is the cap.
 */
export const T = {
  strideSprint: [0, 0.6, 1.1, 1.5, 1.8, 2.0],
  strideAccel: [1, 1.15, 1.25, 1.32, 1.37, 1.4],
  overdriveBonus: 1.2,
  overdriveAfter: 1.5,
  glideFriction: [1, 0.85, 0.79, 0.75, 0.72, 0.7],
  glideBoost: [0, 0.4, 0.7, 0.9, 1.05, 1.15],
  slingshotCharge: 0.5,
  slingshotForward: 3.5,
  slingshotUp: 1.5,
  springJump: [0, 0.4, 0.7, 0.95, 1.15, 1.3],
  springDouble: [0, 0.35, 0.6, 0.8, 0.95, 1.05],
  hoverScale: 0.3,
  hoverTime: 0.9,
  phaseSpeed: [0, 1.4, 2.4, 3.1, 3.6, 3.9],
  phaseRecharge: [1, 0.88, 0.8, 0.75, 0.72, 0.7],
  wallDuration: [0, 0.3, 0.5, 0.65, 0.75],
  wallJumpOut: [0, 0.3, 0.55, 0.75, 0.9],
  wallJumpUp: [0, 0.25, 0.45, 0.6, 0.7],
  wallSurge: 2.5,
  flyDecay: [1, 0.7, 0.5, 0.38, 0.3],
  flyCap: [0, 1.5, 2.6, 3.4, 4],
  edgeSpeed: [1, 1.1, 1.18, 1.24, 1.28],
  crescentReach: 6,
  reachAdd: [0, 0.4, 0.7, 0.9],
  severanceAdd: [0, 0.6, 1.0, 1.2],
  shockwaveRadius: 4.5,
  siphonFlux: [0, 4, 7, 9],
  aegisRecharge: [0, 20, 14, 11],
  reflexCooldown: [0, 12, 9, 7],
  reflexScale: [1, 0.5, 0.42, 0.36],
  reflexTime: 0.7,
  steadyGive: [0, 0.8, 1.3, 1.6],
  shockLandSpeed: 13,
  shockLandRadius: 4,
  timeslipScale: [1, 0.5, 0.42, 0.36],
  timeslipTime: [0, 2.5, 3, 3.4],
  timeslipCost: 30,
  magnetRadius: [0, 3, 4.5, 5.5],
  overclockCap: 1.1,
  mirrorReach: 1.2,
  mirrorFlux: 5,
} as const;

/** Synergies: two abilities at these levels together unlock something neither does alone. */
export type SynergyId = 'phantom' | 'skybreaker' | 'railgun' | 'dynamo' | 'updraft' | 'guardian';
export interface SynergyDef {
  id: SynergyId;
  name: string;
  needs: [AbilityId, number][];
  text: string;
}
export const SYNERGIES: SynergyDef[] = [
  {
    id: 'phantom',
    name: 'Phantom Cut',
    needs: [
      ['phase', 2],
      ['edge', 2],
    ],
    text: 'Dashing through anything breakable cuts it',
  },
  {
    id: 'skybreaker',
    name: 'Skybreaker',
    needs: [
      ['spring', 2],
      ['phase', 2],
    ],
    text: 'Air dashes can aim steeply up; slide in the air to slam down',
  },
  {
    id: 'railgun',
    name: 'Railgun',
    needs: [
      ['glide', 2],
      ['flywheel', 2],
    ],
    text: 'Slides above 15 m/s barely slow down',
  },
  {
    id: 'dynamo',
    name: 'Dynamo',
    needs: [
      ['wallrunner', 2],
      ['siphon', 1],
    ],
    text: 'Wall-running charges Flux and your dash',
  },
  {
    id: 'updraft',
    name: 'Updraft',
    needs: [
      ['spring', 2],
      ['flywheel', 2],
    ],
    text: 'Jumping at high speed turns speed into height',
  },
  {
    id: 'guardian',
    name: 'Guardian Tempo',
    needs: [
      ['aegis', 1],
      ['reflex', 1],
    ],
    text: 'When the shield breaks, time slows for free and the shield recharges faster',
  },
];

/** Flow: tiers from the Flow meter (0..FLOW_MAX). */
export const FLOW_TIERS = [0, 20, 45, 75, 100];
export const FLOW_MAX = 120;
export const FLOW_NAMES = ['', 'Flow', 'Rush', 'Surge', 'Transcend'];
/** Flow lasts this long after the last action before it starts to drain. */
export const FLOW_GRACE = 1.6;

/** Evolution stage 0..4 from the sum of ability levels (drives the runner's look). */
export const STAGE_AT = [0, 2, 5, 9, 14];
export const stageOf = (totalLevels: number) => {
  let s = 0;
  for (let i = 0; i < STAGE_AT.length; i++) if (totalLevels >= STAGE_AT[i]) s = i;
  return s;
};
