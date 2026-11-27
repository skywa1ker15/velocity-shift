/**
 * Level data format. A level is pure data produced by a `build` function using LevelBuilder.
 * Adding a level = adding one file in src/levels/data and one line in the registry;
 * no engine code changes. See docs/LEVEL_AUTHORING.md.
 */
import type { Vec3Tuple } from '../core/math';

export type MatId =
  | 'base' // main walkable architecture
  | 'alt' // secondary tone
  | 'dark' // heavy structural mass
  | 'accent' // emissive accent trim
  | 'glass' // translucent-looking panels (still solid)
  | 'hazard'; // lethal surfaces

export interface SolidDef {
  p: Vec3Tuple; // centre
  s: Vec3Tuple; // full size
  r?: Vec3Tuple; // euler XYZ radians
  /** Quaternion [x,y,z,w]; wins over `r` (used by ramps). */
  q?: [number, number, number, number];
  mat: MatId;
  wallrun?: boolean;
  /** Decorative only when false. */
  collide?: boolean;
  /** Glow strength 0..1 for accent materials. */
  glow?: number;
}

export type DecorShape = 'box' | 'ring' | 'shard' | 'pillar' | 'orb';
export interface DecorDef {
  shape: DecorShape;
  p: Vec3Tuple;
  s: Vec3Tuple;
  r?: Vec3Tuple;
  mat: MatId;
  glow?: number;
  /** Slow rotation (rad/s) around local axes — purely visual. */
  spin?: Vec3Tuple;
  /** Vertical bob amplitude (m) — purely visual. */
  bob?: number;
}

interface EntityBase {
  id?: string;
  /** Event that activates this entity (otherwise it is always active). */
  on?: string;
  mat?: MatId;
}

/** A solid box that travels between waypoints. Covers moving/rising platforms, moving walls and doors. */
export interface MoverDef extends EntityBase {
  type: 'mover';
  s: Vec3Tuple;
  path: Vec3Tuple[];
  speed: number;
  pause?: number;
  phase?: number; // seconds of head start
  mode?: 'pingpong' | 'loop' | 'once';
  wallrun?: boolean;
  /** Touching it is lethal (crushers, sweeping lasers). */
  lethal?: boolean;
  /** No collision, only the lethal volume (energy sweeps). */
  ghost?: boolean;
  /** Pingpong dwell at path[0] in seconds. Defaults to `pause`; when set, `pause` is the far-end dwell only. */
  rest?: number;
  /**
   * Lethal movers only: path[0] is the safe resting spot (a raised crusher). The mover glows and
   * signals a warning for TELEGRAPH_TIME before it leaves it, instead of glowing all the time.
   */
  telegraph?: boolean;
}

/** A group of boxes rotating around an axis through `p`. */
export interface RotatorDef extends EntityBase {
  type: 'rotator';
  p: Vec3Tuple;
  axis: Vec3Tuple;
  speed: number; // rad/s
  phase?: number;
  parts: { p: Vec3Tuple; s: Vec3Tuple; mat?: MatId; wallrun?: boolean; lethal?: boolean }[];
}

/** Falls away shortly after being stood on (or when its event fires). */
export interface CollapseDef extends EntityBase {
  type: 'collapse';
  p: Vec3Tuple;
  s: Vec3Tuple;
  delay?: number; // telegraph time before it drops (>= 0.75 s)
}

/** Blinks in and out on the level clock, with a telegraph before vanishing. */
export interface BlinkDef extends EntityBase {
  type: 'blink';
  p: Vec3Tuple;
  s: Vec3Tuple;
  onTime: number;
  offTime: number;
  phase?: number;
}

export interface HazardDef extends EntityBase {
  type: 'hazard';
  p: Vec3Tuple;
  s: Vec3Tuple;
  r?: Vec3Tuple;
  visible?: boolean;
}

export interface BoostDef extends EntityBase {
  type: 'boost';
  p: Vec3Tuple;
  s: Vec3Tuple;
  dir: Vec3Tuple; // horizontal direction
  add: number;
  min: number;
}

export interface JumpPadDef extends EntityBase {
  type: 'jumppad';
  p: Vec3Tuple;
  s: Vec3Tuple;
  v: Vec3Tuple; // launch velocity (x,z additive, y absolute)
  /**
   * Spring floor: the bounce grows with how hard you land on it. Upward speed becomes at least
   * `v[1]` and at least `spring` × the falling speed you arrived with.
   */
  spring?: number;
}

export interface GravityDef extends EntityBase {
  type: 'gravity';
  p: Vec3Tuple;
  s: Vec3Tuple;
  scale: number;
}

// ----- Phase G: dynamic world ---------------------------------------------------------------

/**
 * A gravity field: while the player is inside its box (world-aligned unless linked), gravity is
 * redirected. `dir`: a fixed direction (sideways, reverse, diagonal). `well`: toward `center`
 * (default `p`). `spin`: `dir` turning about `axis` at `speed` rad/s. `structure`: the linked
 * structure's own "down", so gravity follows its floor as it turns. `scale`: strength (0 =
 * weightless, 0.4 = low, 1.8 = heavy).
 */
export interface FieldDef extends EntityBase {
  type: 'field';
  p: Vec3Tuple;
  s: Vec3Tuple;
  mode: 'dir' | 'well' | 'spin' | 'structure';
  dir?: Vec3Tuple;
  scale?: number;
  center?: Vec3Tuple;
  axis?: Vec3Tuple;
  speed?: number;
  /** `structure` mode: id of the structure; `p`/`s` are then in its local frame. */
  link?: string;
  /** Overlapping fields: the highest priority wins (default 1). */
  priority?: number;
}

/** One step of a structure's motion program: rotate about its pivot and/or shift, over `t` s. */
export interface StructureStep {
  t: number;
  /** World axis and angle in degrees. */
  rot?: [number, number, number, number];
  move?: Vec3Tuple;
  ease?: 'linear' | 'smooth' | 'in' | 'out';
}

/**
 * A structure: a rigid group of boxes on one kinematic body with its pivot at `p`, driven by a
 * motion program on the level clock. Rotating buildings and corridors, tilting floors, shifting
 * and rising platforms, bridges that swing into place, towers that topple and fall away. With `on`
 * it waits for an event; it then telegraphs (`warn` s, at least 0.75 s when it falls or turns
 * under the player) before moving. `fall`: once the program ends it drops away, tumbling, and its
 * collision is removed after `fall` seconds (no invisible collision is ever left behind).
 */
export interface StructureDef extends EntityBase {
  type: 'structure';
  p: Vec3Tuple;
  r?: Vec3Tuple;
  parts: { p: Vec3Tuple; s: Vec3Tuple; mat?: MatId; wallrun?: boolean; r?: Vec3Tuple }[];
  steps: StructureStep[];
  /** Seconds between the trigger and the start (after the telegraph). */
  delay?: number;
  warn?: number;
  loop?: boolean;
  fall?: number;
}

/**
 * An impulse volume (rings, slingshot exits, launch gates): works grounded or airborne. Speed along
 * `dir` (world) becomes at least `min`, plus `add`; motion across it is kept.
 */
export interface ImpulseDef extends EntityBase {
  type: 'impulse';
  p: Vec3Tuple;
  s: Vec3Tuple;
  dir: Vec3Tuple;
  add: number;
  min: number;
}

export type EntityDef =
  | MoverDef
  | RotatorDef
  | CollapseDef
  | BlinkDef
  | HazardDef
  | BoostDef
  | JumpPadDef
  | GravityDef
  | FieldDef
  | StructureDef
  | ImpulseDef;

export interface CheckpointDef {
  p: Vec3Tuple; // respawn feet position
  yaw: number;
  s?: Vec3Tuple; // trigger size (default 6 x 5 x 3)
  name?: string;
}

export interface TriggerDef {
  p: Vec3Tuple;
  s: Vec3Tuple;
  event: string;
}

export interface PromptDef {
  p: Vec3Tuple;
  s: Vec3Tuple;
  /** Action whose current key binding is shown, plus a short label. */
  action: string;
  text: string;
}

export interface CollectibleDef {
  id: string;
  p: Vec3Tuple;
}

export interface ShortcutDef {
  id: string;
  p: Vec3Tuple;
  s: Vec3Tuple;
  /** Marks the hidden route used by the "find the hidden route" objective. */
  hidden?: boolean;
}

/** A destructible prop (see gameplay/breakables.ts). Never collides; never required. */
export type BreakableKind =
  'target' | 'barrier' | 'crate' | 'column' | 'relic' | 'panel' | 'sign' | 'energy' | 'pylon';
export interface BreakableDef {
  id: string;
  kind: BreakableKind;
  /** Placement point: the ground under it, or the centre for hanging kinds (panel, sign). */
  p: Vec3Tuple;
  /** Rotation about Y; at 0 the object faces -Z. */
  yaw?: number;
  scale?: number;
  /** Floor height debris lands on (omitted: debris falls away). */
  ground?: number;
  /** Hanging kinds: length of the cables / chains up to the anchor. */
  hang?: number;
  /**
   * Destructible architecture: breaking it (by sword or by running into it) fires this level event,
   * e.g. cutting the brace that holds up a tower. Never the only way on: pair it with a trigger.
   */
  fires?: string;
}

/** Waypoint for the automated test bot (also documents the intended main line). */
export interface BotPoint {
  p: Vec3Tuple;
  /**
   * Action performed on reaching the point:
   *  j = jump, jj = jump + double jump at apex, d = dash, s = slide (until next 'u'), u = stop sliding,
   *  wj = wall jump, w = wait until there is ground under the next point (w2: the point after that).
   *  Combine with '+', e.g. 'jj+d'.
   */
  act?: string;
  r?: number; // arrival radius
}

export type ObjectiveKind =
  'noDeath' | 'maxDashes' | 'hiddenRoute' | 'allCollectibles' | 'underTime' | 'noSlide' | 'wallTime';
export interface ObjectiveDef {
  id: string;
  kind: ObjectiveKind;
  value?: number;
  label: string;
}

export interface MedalTimes {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
}

export interface LevelData {
  solids: SolidDef[];
  decor: DecorDef[];
  entities: EntityDef[];
  checkpoints: CheckpointDef[];
  triggers: TriggerDef[];
  prompts: PromptDef[];
  collectibles: CollectibleDef[];
  shortcuts: ShortcutDef[];
  finish: { p: Vec3Tuple; s: Vec3Tuple };
  bot: BotPoint[];
  breakables: BreakableDef[];
}

export interface LevelMeta {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  description: string;
  env: string; // environment preset id
  music: string;
  spawn: { p: Vec3Tuple; yaw: number };
  killY: number;
  /** Optional world box [min, max]: leaving it is a fall (gravity can point anywhere). */
  bounds?: [Vec3Tuple, Vec3Tuple];
  /**
   * Layout version. Bump it when a course is rebuilt so that best times, medals and ghosts set on
   * the old layout are cleared (collectibles, objectives and achievements are kept).
   */
  layout?: number;
  medals: MedalTimes;
  objectives: ObjectiveDef[];
  seed: number;
  training?: boolean;
}

export interface LevelDef {
  meta: LevelMeta;
  build(): LevelData;
}
