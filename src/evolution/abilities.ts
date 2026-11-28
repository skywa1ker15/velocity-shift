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
    max: 4,
    glyph: 'St',
    levels: [
      'Top sprint +1.6 m/s and a much faster run-up',
      'Overdrive: after 1 s of sprinting, another +2 m/s on top',
      'Momentum Lock: speed above your sprint does not bleed off for 1.6 s after a jump, slide, vault, dash or wall-run',
      'Slipstream: above 15 m/s you smash straight through objects, and each one pushes you faster',
    ],
    evolutions: { 2: 'Overdrive', 3: 'Momentum Lock', 4: 'Slipstream' },
  }),
  glide: A({
    id: 'glide',
    name: 'Glide',
    category: 'movement',
    family: 'ground',
    max: 4,
    glyph: 'Gl',
    levels: [
      'Slides last twice as long and start with a +2 m/s kick',
      'Slingshot: slide for 0.35 s, then jump to launch forward and up',
      'Kinetic Slide: for the first 1.3 s a held slide speeds up instead of slowing down, and charges Flux',
      'Skim: land with slide held and the slide you drop into gets a +2.5 m/s kick',
    ],
    evolutions: { 2: 'Slingshot', 3: 'Kinetic Slide', 4: 'Skim' },
  }),
  spring: A({
    id: 'spring',
    name: 'Spring',
    category: 'movement',
    family: 'air',
    max: 4,
    glyph: 'Sp',
    levels: [
      'Jumps reach half again as high',
      'Triple Jump: a third jump in the air',
      'Air Burst: air jumps throw you toward the direction you hold',
      'Hover: hold jump while falling to glide down',
    ],
    evolutions: { 2: 'Triple Jump', 3: 'Air Burst', 4: 'Hover' },
  }),
  phase: A({
    id: 'phase',
    name: 'Phase Dash',
    category: 'movement',
    family: 'dash',
    max: 4,
    glyph: 'Ph',
    levels: [
      'Dashes go a third further and recharge 30% faster',
      'Dash Jump: jump out of a dash to keep its speed; a third dash charge',
      'Phase: dashes pass straight through lethal beams',
      'Blink Chain: a dash that breaks something gives its charge back',
    ],
    evolutions: { 2: 'Dash Jump', 3: 'Phase', 4: 'Blink Chain' },
  }),
  wallrunner: A({
    id: 'wallrunner',
    name: 'Wallrunner',
    category: 'movement',
    family: 'wall',
    max: 4,
    glyph: 'Wr',
    levels: [
      'Wall-runs last almost twice as long; wall jumps lift you higher',
      'Wall Surge: wall jumps throw you forward',
      'Grip: no sagging on walls, run them flat to the end',
      'Wall Sprint: wall-runs accelerate the whole way',
    ],
    evolutions: { 2: 'Wall Surge', 3: 'Grip', 4: 'Wall Sprint' },
  }),
  flywheel: A({
    id: 'flywheel',
    name: 'Flywheel',
    category: 'movement',
    family: 'dash',
    max: 3,
    glyph: 'Fw',
    levels: [
      'Extra speed fades at half the rate; speed ceiling +4 m/s',
      'Conservation: landing from a fall turns the drop into forward speed',
      'Inertia: dashes end at 70% of dash speed instead of dropping back to a run',
    ],
    evolutions: { 2: 'Conservation', 3: 'Inertia' },
  }),
  edge: A({
    id: 'edge',
    name: 'Edge',
    category: 'combat',
    family: 'combat',
    max: 3,
    glyph: 'Ed',
    levels: [
      'Swings 25% faster',
      'Crescent: every slash throws a cutting wave ahead',
      'Skyward Cut: hitting something in the air lifts you and gives back an air jump',
    ],
    evolutions: { 2: 'Crescent', 3: 'Skyward Cut' },
  }),
  reach: A({
    id: 'reach',
    name: 'Reach',
    category: 'combat',
    family: 'combat',
    max: 3,
    glyph: 'Re',
    levels: [
      'Blade reach +0.7 m',
      'Wide Arc: each hit also cuts everything within 2.5 m of it',
      'Arc Chain: each cut leaps on to the next object ahead (up to 8 m, twice)',
    ],
    evolutions: { 2: 'Wide Arc', 3: 'Arc Chain' },
  }),
  severance: A({
    id: 'severance',
    name: 'Severance',
    category: 'combat',
    family: 'combat',
    max: 3,
    glyph: 'Sv',
    levels: [
      'Combo finisher reaches 1 m further',
      'Combo finisher reaches 1.5 m further and refills a dash',
      'Shockwave: the finisher cuts everything around you',
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
    levels: ['+6 Flux per cut', '+9 Flux per cut', '+12 Flux per cut, and chains last a second longer'],
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
      'Landings give 1.5 m/s back',
      'Shockwave Landing: big landings break everything nearby; 2 m/s back',
      'Landings give 2.5 m/s back (cap)',
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
    levels: ['Glints are pulled in from 3.5 m', 'From 5 m', 'From 6.5 m (cap)'],
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
  air: ['spring', 'steady'],
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
  strideSprint: [0, 1.6, 2.0, 2.3, 2.5],
  strideAccel: [1, 1.6, 1.8, 1.9, 2.0],
  overdriveBonus: 2.0,
  overdriveAfter: 1.0,
  lockTime: 1.6,
  slipstreamSpeed: 15,
  slipstreamPush: 1.2,
  glideFriction: [1, 0.5, 0.42, 0.36, 0.32],
  glideBoost: [0, 2, 2.4, 2.8, 3.0],
  slingshotCharge: 0.35,
  slingshotForward: 5,
  slingshotUp: 2.5,
  kineticAccel: 7,
  kineticOver: 5,
  kineticTime: 1.3,
  skimBoost: 2.5,
  springJump: [0, 2.0, 2.3, 2.6, 2.8],
  springDouble: [0, 1.4, 1.8, 2.1, 2.3],
  airBurst: 4.5,
  hoverScale: 0.25,
  hoverTime: 1.2,
  phaseSpeed: [0, 7, 8.5, 9.5, 10],
  phaseDuration: [0, 0.03, 0.04, 0.045, 0.05],
  phaseRecharge: [1, 0.7, 0.62, 0.56, 0.5],
  dashJumpWindow: 0.18,
  dashJumpBoost: 3,
  wallDuration: [0, 1.0, 1.4, 1.7, 1.9],
  wallJumpUp: [0, 0.5, 0.8, 1.0, 1.1],
  wallSurge: 4,
  wallGrip: 0.08,
  wallSprint: 5,
  flyDecay: [1, 0.5, 0.35, 0.25],
  flyCap: [0, 4, 6, 8],
  conserveScale: 0.35,
  conserveMax: 6,
  edgeSpeed: [1, 1.25, 1.33, 1.4],
  crescentReach: 6,
  skywardLift: 5.5,
  reachAdd: [0, 0.7, 1.0, 1.2],
  wideArc: 2.5,
  arcLeap: 8,
  severanceAdd: [0, 1.0, 1.5, 1.7],
  shockwaveRadius: 4.5,
  siphonFlux: [0, 6, 9, 12],
  aegisRecharge: [0, 20, 14, 11],
  reflexCooldown: [0, 12, 9, 7],
  reflexScale: [1, 0.5, 0.42, 0.36],
  reflexTime: 0.7,
  steadyGive: [0, 1.5, 2.0, 2.5],
  shockLandSpeed: 13,
  shockLandRadius: 4,
  timeslipScale: [1, 0.5, 0.42, 0.36],
  timeslipTime: [0, 2.5, 3, 3.4],
  timeslipCost: 30,
  magnetRadius: [0, 3.5, 5, 6.5],
  overclockCap: 1.1,
  mirrorReach: 1.2,
  mirrorFlux: 5,
  tempestSpeed: 13,
  tempestPush: 1.6,
  cometScale: 1.4,
} as const;

/** Synergies: two abilities at these levels together unlock something neither does alone. */
export type SynergyId =
  'phantom' | 'skybreaker' | 'railgun' | 'dynamo' | 'updraft' | 'guardian' | 'tempest' | 'comet' | 'ricochet';
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
      ['phase', 1],
      ['edge', 1],
    ],
    text: 'Dash through anything breakable and it is cut',
  },
  {
    id: 'tempest',
    name: 'Tempest',
    needs: [
      ['stride', 2],
      ['edge', 1],
    ],
    text: 'Every cut above 13 m/s pushes you forward',
  },
  {
    id: 'comet',
    name: 'Comet',
    needs: [
      ['glide', 2],
      ['spring', 1],
    ],
    text: 'Slide-jumps launch 40% further and higher',
  },
  {
    id: 'skybreaker',
    name: 'Skybreaker',
    needs: [
      ['spring', 2],
      ['phase', 1],
    ],
    text: 'Air dashes aim steeply up; slide in the air to slam down with a shockwave',
  },
  {
    id: 'railgun',
    name: 'Railgun',
    needs: [
      ['glide', 1],
      ['flywheel', 1],
    ],
    text: 'Slides above 15 m/s do not slow down at all',
  },
  {
    id: 'ricochet',
    name: 'Ricochet',
    needs: [
      ['wallrunner', 2],
      ['phase', 1],
    ],
    text: 'Every wall jump gives back a dash charge',
  },
  {
    id: 'updraft',
    name: 'Updraft',
    needs: [
      ['spring', 1],
      ['flywheel', 1],
    ],
    text: 'Jumping at high speed turns speed into height',
  },
  {
    id: 'dynamo',
    name: 'Dynamo',
    needs: [
      ['wallrunner', 1],
      ['siphon', 1],
    ],
    text: 'Wall-running charges Flux and your dash',
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
export const STAGE_AT = [0, 3, 7, 12, 18];
export const stageOf = (totalLevels: number) => {
  let s = 0;
  for (let i = 0; i < STAGE_AT.length; i++) if (totalLevels >= STAGE_AT[i]) s = i;
  return s;
};
