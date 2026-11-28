/**
 * Phase 3 section library: building blocks that extend a course from where it used to finish.
 *
 * A `Course` is a cursor heading +Z along a lane (centre x, floor height y, position z). Each
 * section builds its geometry, its own autopilot line, a checkpoint on its first floor, and its
 * Difficulty Director encounter: variants tagged with the encounter id and a tier range (see
 * gameplay/Director.ts). The rules every section keeps:
 *  - tier 0 is the plain section; higher tiers add hazards only inside moves the line already
 *    makes (a laser inside a jump's arc, a beam inside a slide), narrower or crumbling footing on a
 *    line that crosses it at full pace, shorter collapse delays (never under TELEGRAPH_TIME), more
 *    to cut, and optional routes — never a move the runner may not have;
 *  - every floor a section ends on is at least 10 m long, so the next one starts on solid ground;
 *  - no gap needs the stamina sprint (gaps are sized for full pace, 11 m/s).
 *
 * Sections are composed per course, in its own theme and pacing, following the progression:
 * levels 1-2 fundamentals only, level 3 adds the rotating world, level 6 on adds left/right turns
 * and level 7 on up/down turns, combined later.
 */
import { arc, faceAt, floorAt, type Lane } from './profile';
import type { LevelBuilder } from './LevelBuilder';
import { tube } from './tubes';
import type { Vec3Tuple } from '../core/math';
import type { BotPoint, DifficultyDim, MatId } from './types';

type P = [number, number, number, string?, number?];

export interface Theme {
  /** Prefix for ids (unique per course). */
  id: string;
  /** Course number (1..9): gates the rotating-world sections. */
  level: number;
  base?: MatId;
  alt?: MatId;
}

export class Course {
  readonly bot: (BotPoint | P)[] = [];
  x: number;
  y: number;
  z: number;
  private n = 0;
  private gate = 100;
  private lastCp = -1e9;

  constructor(
    private b: LevelBuilder,
    start: Vec3Tuple,
    private theme: Theme,
  ) {
    [this.x, this.y, this.z] = start;
    b.data.encounters ??= [];
  }

  private get base(): MatId {
    return this.theme.base ?? 'base';
  }
  private get alt(): MatId {
    return this.theme.alt ?? 'alt';
  }
  private uid(kind: string) {
    return `${this.theme.id}-${kind}-${this.n++}`;
  }
  private pt(dx: number, dy: number, z: number, act?: string, r?: number) {
    this.bot.push([this.x + dx, this.y + dy, z, act, r]);
  }
  /** A checkpoint on the floor at z (spaced so no two are closer than 20 m or further than 85). */
  private cp(z: number, y = this.y) {
    if (z - this.lastCp < 20) return;
    this.b.checkpoint(this.x, y, z);
    this.lastCp = z;
  }
  private encounter(kind: string, dims: DifficultyDim[], max: number, intense = false) {
    const id = this.uid(kind);
    this.b.data.encounters!.push({ id, p: [this.x, this.y + 1, this.z], max, dims, intense, kind });
    return id;
  }
  /** A static box that exists only in some tiers (a mover that never moves). */
  private variantBox(enc: string, tiers: [number, number], p: Vec3Tuple, s: Vec3Tuple, mat: MatId) {
    this.b.entity({ type: 'mover', enc, tiers, s, path: [p], speed: 1, mat });
  }
  private laser(enc: string, tiers: [number, number], p: Vec3Tuple, s: Vec3Tuple) {
    this.b.entity({ type: 'hazard', enc, tiers, p, s });
  }

  /** Big things beside and below the line: scale, depth and slow motion. */
  private scenery(z0: number, z1: number, k: number) {
    const b = this.b,
      y = this.y;
    const side = k % 2 ? 1 : -1;
    b.monolith(this.x + side * (34 + (k % 3) * 9), y - 70, (z0 + z1) / 2, 14, 110 + (k % 4) * 25, 14, 'dark');
    b.monolith(this.x - side * (60 + (k % 2) * 20), y - 90, z1, 22, 150, 22, 'dark');
    b.ring(
      this.x,
      y + 14 + (k % 3) * 4,
      (z0 + z1) / 2,
      26 + (k % 3) * 6,
      0.9,
      [Math.PI / 2, 0, 0],
      [0, 0, 0.05 * side],
      'alt',
      0.2,
    );
    b.strip([this.x + side * 34, y + 10, (z0 + z1) / 2], [0.3, 40, 0.3], 0.8);
  }

  // ===== sections ===========================================================================

  /** Open high-speed runway: a sprint stretch. Tiers add Spindle gates and Prisms to cut. */
  runway(len = 60) {
    const b = this.b,
      z0 = this.z,
      y = this.y;
    const enc = this.encounter('runway', ['density', 'visual'], 2);
    b.plat(this.x, y, z0 + len / 2, 14, len, { mat: this.base });
    this.cp(z0 + 6);
    for (let z = z0 + 8; z < z0 + len - 4; z += 12) {
      b.column(this.x - 7.6, y, z, 10, 0.5);
      b.column(this.x + 7.6, y, z, 10, 0.5);
    }
    const gate = this.gate++;
    [18, 26, 34].forEach((dz, i) =>
      b.breakable('spindle', this.x + (i % 2 ? -2 : 2), y, z0 + dz, { ground: y, gate, enc, tiers: [1, 2] }),
    );
    b.breakable('prism', this.x - 2.3, y, z0 + 44, { enc, tiers: [2, 2] });
    b.breakable('core', this.x + 2.4, y, z0 + 50, { enc, tiers: [2, 2] });
    // a trail of floating motes beside the line, to sweep up with the blade as you pass
    for (let i = 0; i < 5; i++)
      b.breakable('mote', this.x - 1.5, y + (i % 2 ? 0.3 : -0.1), z0 + 9 + i * 1.6, { enc, tiers: [1, 2] });
    this.scenery(z0, z0 + len, this.n);
    this.pt(0, 0, z0 + len - 2);
    this.z = z0 + len;
  }

  /**
   * Hurdles: arches to slide under and rails to jump, in rhythm. Tier 1 hangs a low laser inside
   * every jump's arc; tier 2 adds a beam inside every slide.
   */
  hurdles(n = 3) {
    const b = this.b,
      z0 = this.z,
      y = this.y;
    const enc = this.encounter('hurdles', ['obstacle', 'reaction'], 2);
    const len = n * 21 + 14;
    b.plat(this.x, y, z0 + len / 2, 9, len, { mat: this.base });
    this.cp(z0 + 4);
    // a long set gets a second checkpoint between two hurdles (after a rail, before the next arch)
    if (n >= 4) this.cp(z0 + 6 + Math.floor(n / 2) * 21 - 3);
    for (let k = 0; k < n; k++) {
      const s0 = z0 + 6 + k * 21;
      const arch = s0 + 4,
        rail = s0 + 15;
      b.solid({ p: [this.x, y + 1.05 + 0.7, arch], s: [9, 1.4, 1.6], mat: this.alt });
      b.strip([this.x, y + 1.02, arch - 0.82], [8, 0.05, 0.05], 0.9);
      b.solid({ p: [this.x, y + 0.4, rail], s: [8.4, 0.8, 0.6], mat: this.alt });
      this.laser(enc, [1, 2], [this.x, y + 0.3, rail + 2.4], [8.4, 0.25, 0.2]);
      this.laser(enc, [2, 2], [this.x, y + 1.45, arch + 2], [8.4, 0.3, 0.2]);
      this.pt(0, 0, arch - 2.6, 's');
      this.pt(0, 0, arch + 4, 'u');
      this.pt(0, 0, rail - 1.8, 'j', 0.6);
    }
    for (let z = z0 + 4; z < z0 + len; z += 8) b.column(this.x - 5.4, y, z, 7, 0.45);
    // the bypass: a clear lane on the right, sealed by a glass wall. Cut the glass and it is yours
    // (no hurdles at all); the seal comes back with the attempt.
    const open = 'open-' + enc;
    // it runs beside the main lane and rejoins it after the last rail
    b.plat(this.x + 7.25, y, z0 + (len - 6) / 2, 5.5, len - 6, { mat: this.alt });
    b.solid({ p: [this.x + 4.85, y + 1.6, z0 + 5 + (len - 14) / 2], s: [0.4, 3.2, len - 14], mat: this.alt });
    b.breakable('glass', this.x + 7.25, y, z0 + 5, { yaw: 0, ground: y, fires: open });
    b.entity({
      type: 'mover',
      on: open,
      visible: false,
      s: [5.5, 3.2, 0.3],
      path: [
        [this.x + 7.25, y + 1.6, z0 + 5.3],
        [this.x + 7.25, y - 4, z0 + 5.3],
      ],
      speed: 40,
      mode: 'once',
    });
    this.pt(0, 0, z0 + len - 2);
    this.z = z0 + len;
  }

  /**
   * A laser gate powered by a conduit beside the lane. The curtain drops into the floor and rises
   * again on a telegraphed cycle (tiers shorten the open window: 1.8 / 1.5 / 1.2 s, all far longer
   * than the 0.6 s it takes to cross). Cut the conduit and the gate is dead for the attempt.
   */
  laserGate() {
    const b = this.b,
      y = this.y,
      z0 = this.z;
    const enc = this.encounter('lasergate', ['reaction', 'environment'], 2);
    const off = 'off-' + enc;
    b.plat(this.x, y, z0 + 20, 10, 40, { mat: this.base });
    this.cp(z0 + 4);
    const zg = z0 + 24;
    [1.8, 1.5, 1.2].forEach((rest, t) =>
      b.entity({
        type: 'mover',
        enc,
        tiers: [t, t],
        off,
        lethal: true,
        ghost: true,
        telegraph: true,
        s: [9.6, 4, 0.3],
        path: [
          [this.x, y - 2.6, zg],
          [this.x, y + 1.6, zg],
        ],
        speed: 9,
        rest,
        pause: 1.4,
      }),
    );
    // the emitters either side and the conduit that feeds them
    for (const sx of [-5.1, 5.1]) b.decor('box', [this.x + sx, y + 2, zg], [0.6, 4, 0.6], 'dark');
    b.strip([this.x - 4.75, y + 2, zg], [0.08, 3.6, 0.1], 1);
    b.strip([this.x + 4.75, y + 2, zg], [0.08, 3.6, 0.1], 1);
    b.breakable('conduit', this.x + 3.9, y, zg - 6, { ground: y, fires: off });
    b.strip([this.x + 4.6, y + 0.05, zg - 3], [0.1, 0.05, 6], 0.8);
    this.pt(0, 0, zg - 7, 'g');
    this.pt(0, 0, zg + 8);
    this.pt(0, 0, z0 + 38);
    this.z = z0 + 40;
  }

  /**
   * Islands over a drop. Tier 0: 7 m wide; tier 1: 4 m wide; tier 2: the middle islands crumble
   * (0.9 s after you land, crossed at full pace in about 0.6 s).
   */
  gaps(n = 4, gap = 3.5) {
    const b = this.b,
      y = this.y;
    const enc = this.encounter('gaps', ['traversal', 'precision'], 2);
    // run-up
    b.plat(this.x, y, this.z + 7, 10, 14, { mat: this.base });
    this.cp(this.z + 4);
    let z = this.z + 14;
    this.pt(0, 0, z - 1.4, 'j', 0.6);
    for (let i = 0; i < n; i++) {
      const zs = z + gap,
        zc = zs + 3.5;
      const last = i === n - 1;
      if (last) {
        b.plat(this.x, y, zs + 7, 10, 14, { mat: this.base });
        z = zs + 14;
        break;
      }
      // the 4 m core is always there; tier 0 widens it, tier 2 swaps the middle ones for crumbling tiles
      const crumbles = i > 0;
      this.variantBox(enc, crumbles ? [0, 1] : [0, 2], [this.x, y - 0.5, zc], [4, 1, 7], this.base);
      this.variantBox(enc, [0, 0], [this.x - 2.75, y - 0.5, zc], [1.5, 1, 7], this.base);
      this.variantBox(enc, [0, 0], [this.x + 2.75, y - 0.5, zc], [1.5, 1, 7], this.base);
      if (crumbles)
        b.entity({
          type: 'collapse',
          enc,
          tiers: [2, 2],
          p: [this.x, y - 0.5, zc],
          s: [4, 1, 7],
          delay: 0.9,
          mat: this.alt,
        });
      b.breakable('lantern', this.x + 1.3, y + 2.6, zs - gap / 2, { enc, tiers: [1, 2] });
      this.pt(0, 0, zs + 7 - 1.4, 'j', 0.6);
      z = zs + 7;
    }
    this.pt(0, 0, z - 2);
    this.z = z;
  }

  /** A failing bridge: tiles drop after you pass. Tiers shorten the delay (1.2 / 0.95 / 0.8 s). */
  collapseRun(n = 5) {
    const b = this.b,
      y = this.y,
      z0 = this.z;
    const enc = this.encounter('collapse', ['environment', 'reaction'], 2);
    b.plat(this.x, y, z0 + 5, 10, 10, { mat: this.base });
    this.cp(z0 + 4);
    [1.2, 0.95, 0.8].forEach((delay, t) => {
      for (let i = 0; i < n; i++)
        b.entity({
          type: 'collapse',
          enc,
          tiers: [t, t],
          p: [this.x, y - 0.3, z0 + 13 + i * 6],
          s: [6, 0.6, 5.8],
          delay,
          mat: this.alt,
        });
    });
    const end = z0 + 10 + n * 6;
    b.plat(this.x, y, end + 7, 10, 14, { mat: this.base });
    this.pt(0, 0, end + 12);
    this.z = end + 14;
  }

  /** Three walls in a row, left / right / left, kicking from one to the next. */
  wallChain() {
    const b = this.b,
      y = this.y,
      E = this.z + 12;
    b.plat(this.x, y, this.z + 6, 10, 12, { mat: this.base });
    this.cp(this.z + 3);
    b.wall(this.x + 3, y - 2, E + 4, 0.8, 9, 16);
    b.wall(this.x - 3, y - 2, E + 18, 0.8, 9, 16);
    b.wall(this.x + 3, y - 2, E + 32, 0.8, 9, 16);
    b.plat(this.x, y, E + 52, 10, 24, { mat: this.base });
    this.pt(1.7, 0, E - 4);
    this.pt(1.7, 0, E - 1.1, 'j', 0.8);
    this.pt(2.2, 1, E + 3);
    this.pt(2.2, 1, E + 9, 'wj');
    this.pt(-2.2, 1, E + 17);
    this.pt(-2.2, 1, E + 23, 'wj');
    this.pt(2.2, 1, E + 31);
    this.pt(2.2, 1, E + 37, 'wj');
    this.pt(0, 0, E + 54);
    this.z = E + 64;
  }

  /** Ten metres of nothing: jump, then jump again in mid-air. */
  doubleGap() {
    const b = this.b,
      y = this.y,
      z0 = this.z;
    b.plat(this.x, y, z0 + 7, 10, 14, { mat: this.base });
    this.cp(z0 + 4);
    b.plat(this.x, y, z0 + 24 + 8, 10, 16, { mat: this.base });
    this.pt(0, 0, z0 + 13.4, 'jj', 0.8);
    this.pt(0, 0, z0 + 38);
    this.z = z0 + 40;
  }

  /** Terraces up (or down) in steps of 0.6 m. */
  stairs(steps = 4, dy = 0.6) {
    const b = this.b,
      z0 = this.z;
    b.plat(this.x, this.y, z0 + 5, 10, 10, { mat: this.base });
    this.cp(z0 + 3);
    let z = z0 + 10;
    for (let i = 0; i < steps; i++) {
      if (dy > 0) this.pt(0, 0, z - 0.6, 'j', 0.8);
      this.y += dy;
      b.plat(this.x, this.y, z + 5, 10, 10, { mat: i % 2 ? this.alt : this.base });
      z += 10;
    }
    b.plat(this.x, this.y, z + 5, 10, 10, { mat: this.base });
    this.pt(0, 0, z + 8);
    this.z = z + 10;
  }

  /**
   * A slide chute: a ramp down with low beams across it, slide the whole way (gravity keeps the
   * slide fed). Tier 1 adds two more beams.
   */
  chute(drop = 6, len = 26) {
    const b = this.b,
      z0 = this.z,
      y0 = this.y;
    const enc = this.encounter('chute', ['reaction'], 1);
    b.plat(this.x, y0, z0 + 5, 9, 10, { mat: this.base });
    this.cp(z0 + 3);
    const y1 = y0 - drop;
    b.ramp([this.x, y0, z0 + 10], [this.x, y1, z0 + 10 + len], 8);
    const at = (z: number) => y0 + ((y1 - y0) * (z - z0 - 10)) / len;
    for (const [f, tiers] of [
      [0.3, undefined],
      [0.45, [1, 1]],
      [0.6, undefined],
      [0.75, [1, 1]],
    ] as const) {
      const z = z0 + 10 + len * f;
      if (tiers)
        this.variantBox(
          enc,
          tiers as [number, number],
          [this.x, at(z) + 1.05 + 0.6, z],
          [8.6, 1.2, 0.8],
          this.alt,
        );
      else b.solid({ p: [this.x, at(z) + 1.05 + 0.6, z], s: [8.6, 1.2, 0.8], mat: this.alt });
    }
    this.y = y1;
    b.plat(this.x, y1, z0 + 10 + len + 8, 9, 16, { mat: this.base });
    this.pt(0, 0, z0 + 8, 's');
    this.pt(0, 0, z0 + 10 + len + 5, 'u');
    this.pt(0, 0, z0 + 10 + len + 14);
    this.z = z0 + 10 + len + 16;
  }

  /**
   * A drawbridge (an environmental event): it stands up as you arrive; crossing the plate in front
   * of it lowers it, telegraphed, with a light cue. The line waits for it.
   */
  drawbridge(span = 18) {
    const b = this.b,
      z0 = this.z,
      y = this.y;
    const id = this.uid('bridge');
    b.plat(this.x, y, z0 + 13, 12, 26, { mat: this.base });
    this.cp(z0 + 4);
    b.trigger([this.x, y + 2, z0 + 6], [12, 4, 3], 'ev-' + id);
    b.entity({
      type: 'structure',
      id,
      on: 'ev-' + id,
      p: [this.x, y, z0 + 26],
      r: [-Math.PI / 2, 0, 0],
      warn: 0.8,
      steps: [{ t: 1.4, rot: [1, 0, 0, 90], ease: 'out' }],
      parts: [
        { p: [0, -0.5, span / 2], s: [6, 1, span], mat: this.alt },
        { p: [0, 0.03, span / 2], s: [0.3, 0.06, span - 1], mat: 'accent' },
      ],
    });
    // the towers that hold the chains
    for (const sx of [-4, 4]) b.decor('box', [this.x + sx, y + 6, z0 + 25.5], [1.2, 12, 1.2], 'dark');
    b.decor('box', [this.x, y + 12.4, z0 + 25.5], [9.2, 0.8, 1.2], 'dark');
    b.strip([this.x, y + 11.9, z0 + 25.5], [7, 0.08, 0.2], 1);
    // the chains that hold it up: cut one and the bridge drops now
    for (const sx of [-2.6, 2.6])
      b.breakable('chain', this.x + sx, y + 4.2, z0 + 24.6, { fires: 'ev-' + id });
    b.plat(this.x, y, z0 + 26 + span + 8, 12, 16, { mat: this.base });
    this.pt(0, 0, z0 + 22, 'w');
    this.pt(0, 0, z0 + 26 + span / 2);
    this.pt(0, 0, z0 + 26 + span + 12);
    this.z = z0 + 26 + span + 16;
  }

  /** Over the block (level 7 on): the floor curls up a 6 m face, over the top and down again. */
  climbOver() {
    const b = this.b,
      z0 = this.z,
      S = this.y,
      U = S + 16;
    const lane: Lane = [this.x - 3, this.x + 3];
    b.plat(this.x, S, z0 + 6, 10, 12, { mat: this.base });
    this.cp(z0 + 3);
    const z = z0 + 12;
    floorAt(b, lane, S, z, z + 10);
    arc(b, lane, S + 5, z + 10, 5, 0, 90, 'inside');
    faceAt(b, lane, z + 15, S + 5, S + 11, -1);
    arc(b, lane, S + 11, z + 20, 5, -90, -180, 'outside');
    b.plat(this.x, U, z + 30, 6, 20, { h: U - S + 2, mat: this.base });
    this.cp(z + 28, U);
    arc(b, lane, U - 5, z + 40, 5, 180, 90, 'outside');
    faceAt(b, lane, z + 45, S + 5, U - 5, 1);
    arc(b, lane, S + 5, z + 50, 5, -90, 0, 'inside');
    floorAt(b, lane, S, z + 50, z + 62);
    b.plat(this.x, S, z + 68, 10, 12, { mat: this.base });
    this.pt(0, 0, z + 2);
    this.pt(0, 1.5, z + 13.5, undefined, 2.5);
    this.pt(0, 8, z + 15, undefined, 2.5);
    this.pt(0, 14.5, z + 16.5, undefined, 2.5);
    this.pt(0, 16, z + 26, undefined, 2.5);
    this.pt(0, 16, z + 37);
    this.pt(0, 14.5, z + 43.5, undefined, 2.5);
    this.pt(0, 8, z + 45, undefined, 2.5);
    this.pt(0, 0.5, z + 46.5, undefined, 2.5);
    this.pt(0, 0, z + 60, undefined, 2.5);
    this.z = z + 74;
  }

  /**
   * The world turns (level 3 on): a square tube rolls a quarter turn left (or right) round you as you
   * run, then the next one rolls you back upright. Whatever is under you stays the floor.
   */
  roll(dir: 1 | -1 = 1, deg = 90) {
    const b = this.b,
      z0 = this.z,
      y = this.y,
      L = 30;
    b.plat(this.x, y, z0 + 6, 10, 12, { mat: this.base });
    this.cp(z0 + 3);
    const a = this.uid('roll'),
      c = this.uid('unroll');
    const z = z0 + 12;
    tube(b, y, a, z, z + L, { x: this.x, steps: [{ t: 1.6, rot: [0, 0, 1, dir * deg] }] });
    b.trigger([this.x, y + 2, z + 1.5], [4, 4, 2], a);
    tube(b, y, c, z + L, z + 2 * L, {
      x: this.x,
      r0: dir * deg,
      steps: [{ t: 1.6, rot: [0, 0, 1, -dir * deg] }],
    });
    b.trigger([this.x, y + 2, z + L + 1.5], [4, 4, 2], c);
    b.plat(this.x, y, z + 2 * L + 4, 10, 8, { mat: this.base });
    this.pt(0, 0, z - 1);
    this.pt(0, 2, z + 12, undefined, 2.5);
    this.pt(0, 2, z + L - 2, undefined, 2.5);
    this.pt(0, 2, z + L + 14, undefined, 2.5);
    this.pt(0, 2, z + 2 * L - 2, undefined, 2.5);
    this.pt(0, 0, z + 2 * L + 6, undefined, 2);
    this.z = z + 2 * L + 8;
  }

  /**
   * The finale: a launch pad over a gap through a turning halo, a crumbling run, a last Spindle
   * gate and the finish plaza. An intense encounter (the next would be held back a tier).
   */
  finale() {
    const b = this.b,
      y = this.y,
      z0 = this.z;
    const enc = this.encounter('finale', ['environment', 'reaction', 'density'], 2, true);
    b.plat(this.x, y, z0 + 10, 12, 20, { mat: this.base });
    this.cp(z0 + 4);
    // launch: a pad at the edge throws you over a 5 m gap through two counter-turning halos
    b.entity({ type: 'jumppad', p: [this.x, y + 0.6, z0 + 18], s: [6, 1.2, 4], v: [0, 12, 3] });
    b.ring(this.x, y + 3.4, z0 + 24, 6.5, 0.45, [0, 0, 0], [0, 0, 0.6], 'accent', 1);
    b.ring(this.x, y + 3.4, z0 + 24, 8.2, 0.25, [0, 0, 0], [0, 0, -0.4], 'alt', 0.4);
    b.plat(this.x, y, z0 + 25 + 10, 12, 20, { mat: this.base });
    this.cp(z0 + 40);
    // the crumbling run (delays by tier)
    [1.1, 0.9, 0.8].forEach((delay, t) => {
      for (let i = 0; i < 4; i++)
        b.entity({
          type: 'collapse',
          enc,
          tiers: [t, t],
          p: [this.x, y - 0.3, z0 + 48 + i * 6],
          s: [6, 0.6, 5.8],
          delay,
          mat: this.alt,
        });
    });
    // the plaza: a last gate to cut, then the line
    const zp = z0 + 69;
    b.plat(this.x, y, zp + 20, 16, 40, { mat: this.base });
    const gate = this.gate++;
    [8, 13, 18, 23].forEach((dz, i) =>
      b.breakable('spindle', this.x + (i % 2 ? -2.2 : 2.2), y, zp + dz, {
        ground: y,
        gate,
        enc,
        tiers: [1, 2],
      }),
    );
    b.breakable('seal', this.x - 2.6, y, zp + 4, { enc, tiers: [2, 2] });
    b.breakable('core', this.x + 2.6, y, zp + 28);
    b.breakable('sentinel', this.x - 5, y, zp + 2, { ground: y, enc, tiers: [2, 2] });
    b.breakable('sentinel', this.x - 5.5, y, zp + 7, { ground: y, enc, tiers: [2, 2] });
    for (let z = zp + 2; z < zp + 40; z += 6) {
      b.column(this.x - 8.6, y, z, 11, 0.6);
      b.column(this.x + 8.6, y, z, 11, 0.6);
    }
    this.scenery(z0, zp + 40, this.n + 3);
    b.ring(this.x, y + 20, zp + 30, 40, 1.6, [Math.PI / 2, 0, 0], [0, 0, 0.08], 'accent', 0.5);
    this.pt(0, 0, z0 + 14);
    this.pt(0, 0, z0 + 40, undefined, 2.5);
    this.pt(0, 0, zp + 30);
    this.z = zp + 40;
    return { finishZ: zp + 33 };
  }

  /** Close the course: the finish plaza (already laid by finale) and its gate. */
  finish(z: number, w = 12) {
    this.b.finish(this.x, this.y, z, w);
    this.b.gate(this.x, this.y, z + 5, w - 2, 8);
  }
}
