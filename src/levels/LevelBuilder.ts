/**
 * LevelBuilder: a small authoring kit that turns readable calls into LevelData.
 *
 * Conventions (see docs/LEVEL_AUTHORING.md):
 *  - Units are metres. Y is up. Courses are laid out heading +Z (spawn yaw = Math.PI).
 *  - `plat` and friends take the height of the WALKABLE TOP, not the box centre.
 *  - Kit pieces add both collision solids and matching decoration.
 */
import { quatFromAxisAngle, quatMul, quatRotate, type Vec3Tuple } from '../core/math';
import type {
  BotPoint,
  BreakableDef,
  BreakableKind,
  CheckpointDef,
  DecorDef,
  DecorShape,
  EntityDef,
  LevelData,
  MatId,
  SolidDef,
} from './types';

export interface PlatOpts {
  h?: number; // thickness
  mat?: MatId;
  wallrun?: boolean;
  /** Add underside structure + glowing rim so it reads as architecture, not a slab. */
  dress?: boolean;
  glow?: number;
}

export class LevelBuilder {
  readonly data: LevelData = {
    solids: [],
    decor: [],
    entities: [],
    checkpoints: [],
    triggers: [],
    prompts: [],
    collectibles: [],
    shortcuts: [],
    finish: { p: [0, -99999, 0], s: [1, 1, 1] },
    bot: [],
    breakables: [],
  };

  // ----- primitives ---------------------------------------------------------------------
  solid(def: SolidDef) {
    this.data.solids.push(def);
    return def;
  }

  decor(shape: DecorShape, p: Vec3Tuple, s: Vec3Tuple, mat: MatId = 'dark', extra: Partial<DecorDef> = {}) {
    this.data.decor.push({ shape, p, s, mat, ...extra });
  }

  entity(def: EntityDef) {
    this.data.entities.push(def);
    return def;
  }

  /** Walkable slab whose top surface is at height `y`, centred on (x, z). */
  plat(x: number, y: number, z: number, w: number, d: number, o: PlatOpts = {}) {
    const h = o.h ?? 1;
    this.solid({
      p: [x, y - h / 2, z],
      s: [w, h, d],
      mat: o.mat ?? 'base',
      wallrun: o.wallrun ?? false,
      glow: o.glow,
    });
    if (o.dress !== false) this.dressPlat(x, y, z, w, d, h);
  }

  /** Decoration for a platform: glowing rim lines and a stepped keel hanging underneath. */
  private dressPlat(x: number, y: number, z: number, w: number, d: number, h: number) {
    const t = 0.08;
    if (w >= 2 && d >= 2) {
      this.decor('box', [x - w / 2 + t, y + 0.005, z], [t * 2, 0.02, d - 0.6], 'accent', { glow: 0.9 });
      this.decor('box', [x + w / 2 - t, y + 0.005, z], [t * 2, 0.02, d - 0.6], 'accent', { glow: 0.9 });
    }
    if (w >= 3 && d >= 3 && h <= 2) {
      const k1 = Math.min(w, d) * 0.7;
      this.decor('box', [x, y - h - 0.6, z], [w * 0.72, 1.2, d * 0.72], 'dark');
      this.decor('box', [x, y - h - 1.9, z], [k1 * 0.6, 1.6, k1 * 0.6], 'dark');
      this.decor('box', [x, y - h - 3.6, z], [k1 * 0.22, 2.2, k1 * 0.22], 'alt');
    }
  }

  /** Vertical wall-runnable slab. (x, z) is the centre, `y` the bottom edge. */
  wall(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    o: { mat?: MatId; wallrun?: boolean } = {},
  ) {
    this.solid({ p: [x, y + h / 2, z], s: [w, h, d], mat: o.mat ?? 'alt', wallrun: o.wallrun ?? true });
  }

  /** Sloped slab from top-centre point `a` to top-centre point `b`. */
  ramp(a: Vec3Tuple, b: Vec3Tuple, width: number, o: { h?: number; mat?: MatId } = {}) {
    const h = o.h ?? 0.6;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2];
    const horiz = Math.hypot(dx, dz);
    const len = Math.hypot(horiz, dy);
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, horiz);
    const q = quatMul(quatFromAxisAngle(0, 1, 0, yaw), quatFromAxisAngle(1, 0, 0, pitch));
    const up = quatRotate(q, { x: 0, y: 1, z: 0 });
    this.solid({
      p: [
        (a[0] + b[0]) / 2 - (up.x * h) / 2,
        (a[1] + b[1]) / 2 - (up.y * h) / 2,
        (a[2] + b[2]) / 2 - (up.z * h) / 2,
      ],
      s: [width, h, len],
      q: [q.x, q.y, q.z, q.w],
      mat: o.mat ?? 'base',
    });
  }

  // ----- architecture kit ---------------------------------------------------------------
  /** Decorative column rising from `y` with a base and a capital. */
  column(x: number, y: number, z: number, h: number, r = 0.6, mat: MatId = 'base') {
    this.decor('pillar', [x, y + h / 2, z], [r * 2, h, r * 2], mat);
    this.decor('box', [x, y + 0.2, z], [r * 3, 0.4, r * 3], mat);
    this.decor('box', [x, y + h - 0.25, z], [r * 3.2, 0.5, r * 3.2], mat);
  }

  /** Gate/arch over the path (decorative): two columns and a lintel with a glowing seam. */
  gate(x: number, y: number, z: number, w: number, h: number, mat: MatId = 'base') {
    this.column(x - w / 2, y, z, h, 0.55, mat);
    this.column(x + w / 2, y, z, h, 0.55, mat);
    this.decor('box', [x, y + h + 0.45, z], [w + 2.4, 0.9, 1.5], mat);
    this.decor('box', [x, y + h - 0.02, z], [w - 1.2, 0.06, 0.2], 'accent', { glow: 1 });
  }

  /** Distant megastructure block (no collision). */
  monolith(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: MatId = 'dark',
    r?: Vec3Tuple,
  ) {
    this.decor('box', [x, y + h / 2, z], [w, h, d], mat, { r });
  }

  ring(
    x: number,
    y: number,
    z: number,
    radius: number,
    tube: number,
    r: Vec3Tuple,
    spin: Vec3Tuple,
    mat: MatId = 'alt',
    glow = 0,
  ) {
    this.decor('ring', [x, y, z], [radius, tube, radius], mat, { r, spin, glow });
  }

  shard(x: number, y: number, z: number, s: number, mat: MatId = 'alt', bob = 0.6) {
    this.decor('shard', [x, y, z], [s * 0.5, s, s * 0.5], mat, { bob, spin: [0, 0.15, 0] });
  }

  /** Emissive strip (route hints, signage). */
  strip(p: Vec3Tuple, s: Vec3Tuple, glow = 1) {
    this.decor('box', p, s, 'accent', { glow });
  }

  // ----- gameplay markers ---------------------------------------------------------------
  spawnCheckpoint(x: number, y: number, z: number, yaw = Math.PI) {
    this.data.checkpoints.push({ p: [x, y, z], yaw, s: [0.1, 0.1, 0.1], name: 'start' });
  }

  checkpoint(x: number, y: number, z: number, yaw = Math.PI, size: Vec3Tuple = [7, 6, 3]): CheckpointDef {
    const c: CheckpointDef = { p: [x, y, z], yaw, s: size };
    this.data.checkpoints.push(c);
    // beacon: two slim posts and a floating glyph bar, readable from distance
    this.decor('box', [x - size[0] / 2 + 0.3, y + 1.6, z], [0.18, 3.2, 0.18], 'accent', { glow: 1 });
    this.decor('box', [x + size[0] / 2 - 0.3, y + 1.6, z], [0.18, 3.2, 0.18], 'accent', { glow: 1 });
    this.decor('shard', [x, y + 4.2, z], [0.35, 0.9, 0.35], 'accent', {
      glow: 1,
      bob: 0.25,
      spin: [0, 1.2, 0],
    });
    return c;
  }

  finish(x: number, y: number, z: number, w = 8, d = 3) {
    this.data.finish = { p: [x, y + 3, z], s: [w, 6, d] };
    this.decor('ring', [x, y + 3.2, z], [3.4, 0.16, 3.4], 'accent', { glow: 1, spin: [0, 0, 0.6] });
    this.decor('ring', [x, y + 3.2, z], [2.5, 0.08, 2.5], 'accent', { glow: 1, spin: [0, 0, -0.9] });
    this.decor('box', [x - w / 2, y + 3.5, z], [0.3, 7, 0.3], 'accent', { glow: 1 });
    this.decor('box', [x + w / 2, y + 3.5, z], [0.3, 7, 0.3], 'accent', { glow: 1 });
  }

  trigger(p: Vec3Tuple, s: Vec3Tuple, event: string) {
    this.data.triggers.push({ p, s, event });
  }

  prompt(p: Vec3Tuple, s: Vec3Tuple, action: string, text: string) {
    this.data.prompts.push({ p, s, action, text });
  }

  collectible(id: string, x: number, y: number, z: number) {
    this.data.collectibles.push({ id, p: [x, y, z] });
  }

  shortcut(id: string, p: Vec3Tuple, s: Vec3Tuple, hidden = false) {
    this.data.shortcuts.push({ id, p, s, hidden });
  }

  /** A destructible prop. Ground kinds take the floor height; hanging kinds their centre. */
  breakable(kind: BreakableKind, x: number, y: number, z: number, o: Partial<BreakableDef> = {}) {
    const id = o.id ?? `${kind}-${this.data.breakables.length}`;
    const ground = kind === 'panel' || kind === 'sign' ? o.ground : (o.ground ?? y);
    this.data.breakables.push({ ...o, id, kind, p: [x, y, z], ground });
  }

  /** Append waypoints for the test bot (the intended main line). */
  bot(...pts: (BotPoint | [number, number, number, string?, number?])[]) {
    for (const pt of pts) {
      if (Array.isArray(pt)) this.data.bot.push({ p: [pt[0], pt[1], pt[2]], act: pt[3], r: pt[4] });
      else this.data.bot.push(pt);
    }
  }
}
