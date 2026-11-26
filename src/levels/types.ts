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
}

export interface GravityDef extends EntityBase {
  type: 'gravity';
  p: Vec3Tuple;
  s: Vec3Tuple;
  scale: number;
}

export type EntityDef = MoverDef | RotatorDef | CollapseDef | BlinkDef | HazardDef | BoostDef | JumpPadDef | GravityDef;

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

/** Waypoint for the automated test bot (also documents the intended main line). */
export interface BotPoint {
  p: Vec3Tuple;
  /**
   * Action performed on reaching the point:
   *  j = jump, jj = jump + double jump at apex, d = dash, s = slide (until next 'u'), u = stop sliding,
   *  wj = wall jump, w = wait until there is ground under the next point. Combine with '+', e.g. 'jj+d'.
   */
  act?: string;
  r?: number; // arrival radius
}

export type ObjectiveKind = 'noDeath' | 'maxDashes' | 'hiddenRoute' | 'allCollectibles' | 'underTime' | 'noSlide' | 'wallTime';
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
  medals: MedalTimes;
  objectives: ObjectiveDef[];
  seed: number;
  training?: boolean;
}

export interface LevelDef {
  meta: LevelMeta;
  build(): LevelData;
}
