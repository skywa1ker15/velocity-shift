/**
 * Destructible props: their illustrated look and how they come apart.
 *
 * Each kind is a few convex parts (render/convex.ts). A sword cut splits every part along the
 * blade's actual sweep plane into two pieces whose fresh faces glow hot and cool down; running
 * into an object instead breaks it crudely into four chunks. Behaviour differs by kind:
 *
 *   target / barrier / crate / panel / sign / pylon  halves fly apart along the cut
 *   column  the top slides off along the cut plane and topples, the base stays standing
 *   relic   the halves drift apart weightlessly, blazing, then crumble to dust
 *   energy  the membrane bursts into light (no solid pieces)
 *
 * Pieces are simple kinematic bodies (no physics engine): velocity, spin, gravity and one ground
 * bounce. At most MAX_PIECES are alive; the oldest are retired first.
 */
import * as THREE from 'three';
import type { BreakableDef, BreakableKind } from '../levels/types';
import { BREAKABLE_SPECS, breakableCentre } from '../gameplay/breakables';
import type { SwordHit } from '../gameplay/Sword';
import type { Simulation } from '../gameplay/Simulation';
import { createCharacterMaterial, PartBuilder, type CharacterMaterial } from './ink';
import {
  boxPart,
  clipPart,
  partCentroid,
  partGeometry,
  prismPart,
  transformPart,
  type ConvexPart,
  type P3,
} from './convex';

const MAX_PIECES = 28;
const PI = Math.PI;

const m4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );

interface KindArt {
  cut: ConvexPart[];
  remain: ConvexPart[];
}

const WOOD = 0xc98b52,
  WOOD_D = 0x8a5630,
  WOOD_IN = 0xf0c690,
  INKY = 0x1b1d28;

/** Build the parts of a kind in its local frame (origin at the placement point, faces -Z). */
function art(kind: BreakableKind, hang: number, palette: { accent: number; glass: number }): KindArt {
  const cut: ConvexPart[] = [];
  const remain: ConvexPart[] = [];
  const A = palette.accent;
  switch (kind) {
    case 'target': {
      remain.push(boxPart(0.035, 0.74, 0.035, WOOD_D, m4(0, 0.74, 0.03)));
      remain.push(boxPart(0.22, 0.03, 0.22, INKY, m4(0, 0.03, 0.03)));
      const disc = (r: number, z: number, c: number, glow = 0) =>
        prismPart(18, r, 0.018, c, m4(0, 1.45, z, PI / 2), glow ? { glow, noInk: true } : undefined, WOOD_IN);
      cut.push(disc(0.47, 0, 0xe9dcc4));
      cut.push(disc(0.36, -0.021, 0xd8402f));
      cut.push(disc(0.24, -0.026, 0xf2ead8));
      cut.push(disc(0.11, -0.031, A, 0.6));
      break;
    }
    case 'barrier': {
      for (const x of [-0.92, 0.92]) {
        remain.push(boxPart(0.05, 0.62, 0.05, WOOD_D, m4(x, 0.62, 0)));
        remain.push(boxPart(0.12, 0.025, 0.2, INKY, m4(x, 0.025, 0)));
      }
      [0.46, 0.78, 1.1].forEach((y, i) =>
        cut.push(boxPart(0.9, 0.11, 0.03, i % 2 ? WOOD : 0xb5763f, m4(0, y, 0), undefined, WOOD_IN)),
      );
      // painted warning chevrons on the middle plank
      for (const x of [-0.5, 0, 0.5])
        cut.push(boxPart(0.1, 0.05, 0.004, A, m4(x, 0.78, -0.034, 0, 0, 0.6), { glow: 0.3, noInk: true }, A));
      break;
    }
    case 'crate': {
      cut.push(boxPart(0.43, 0.43, 0.43, 0xb07a44, m4(0, 0.45, 0), undefined, WOOD_IN));
      for (const [x, z] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        cut.push(boxPart(0.04, 0.45, 0.04, WOOD_D, m4(x * 0.43, 0.45, z * 0.43), undefined, WOOD_IN));
      for (const y of [0.06, 0.84])
        cut.push(boxPart(0.45, 0.04, 0.45, WOOD_D, m4(0, y, 0), undefined, WOOD_IN));
      cut.push(
        boxPart(0.16, 0.16, 0.004, A, m4(0, 0.45, -0.437, 0, 0, PI / 4), { glow: 0.25, noInk: true }, A),
      );
      break;
    }
    case 'column': {
      remain.push(boxPart(0.36, 0.08, 0.36, 0xd9ccb6, m4(0, 0.08, 0)));
      cut.push(prismPart(8, 0.26, 1.08, 0xf2e8d6, m4(0, 1.24, 0), undefined, 0xfff6e8, 0.24, PI / 8));
      cut.push(prismPart(8, 0.275, 0.025, A, m4(0, 1.62, 0), { glow: 0.5, noInk: true }, A, 0.275, PI / 8));
      cut.push(boxPart(0.32, 0.06, 0.32, 0xe4d6bf, m4(0, 2.36, 0), undefined, 0xfff6e8));
      break;
    }
    case 'relic': {
      remain.push(prismPart(6, 0.36, 0.34, 0xcbb89e, m4(0, 0.34, 0), undefined, undefined, 0.3));
      remain.push(prismPart(6, 0.31, 0.02, A, m4(0, 0.69, 0), { glow: 0.8, noInk: true }, A, 0.31));
      // a floating obelisk with a glowing rune and a gilded cap
      cut.push(prismPart(4, 0.27, 0.68, 0xf0e6d6, m4(0, 1.75, 0), undefined, 0xfff4e0, 0.13, PI / 4));
      cut.push(boxPart(0.035, 0.42, 0.006, A, m4(0, 1.72, -0.21, -0.1), { glow: 1.4, noInk: true }, A));
      cut.push(prismPart(4, 0.14, 0.07, 0xe3b44a, m4(0, 2.48, 0), undefined, 0xffd77a, 0.02, PI / 4));
      break;
    }
    case 'panel': {
      cut.push(boxPart(0.74, 0.54, 0.018, palette.glass, m4(0, 0, 0), { glow: 0.12 }, 0xffffff));
      for (const y of [-0.57, 0.57])
        cut.push(boxPart(0.8, 0.035, 0.035, 0x2a2646, m4(0, y, 0), undefined, 0x6b6796));
      for (const x of [-0.77, 0.77])
        cut.push(boxPart(0.035, 0.54, 0.035, 0x2a2646, m4(x, 0, 0), undefined, 0x6b6796));
      cut.push(boxPart(0.6, 0.018, 0.006, A, m4(0, -0.46, -0.022), { glow: 1.1, noInk: true }, A));
      for (const x of [-0.6, 0.6])
        remain.push(boxPart(0.008, hang / 2, 0.008, INKY, m4(x, 0.6 + hang / 2, 0)));
      break;
    }
    case 'sign': {
      cut.push(boxPart(0.74, 0.3, 0.06, 0x231c3e, m4(0, 0, 0), undefined, 0x5a4c8c));
      for (const [y, w] of [
        [0.12, 0.55],
        [0, 0.38],
        [-0.12, 0.5],
      ] as const)
        cut.push(boxPart(w, 0.03, 0.006, A, m4(-0.1 + w * 0.15, y, -0.066), { glow: 1.4, noInk: true }, A));
      cut.push(
        boxPart(0.06, 0.2, 0.006, palette.glass, m4(0.58, 0, -0.066), { glow: 1.2, noInk: true }, 0xffffff),
      );
      for (const x of [-0.6, 0.6])
        remain.push(boxPart(0.012, hang / 2, 0.012, INKY, m4(x, 0.3 + hang / 2, 0)));
      break;
    }
    case 'energy': {
      for (const x of [-1.24, 1.24]) {
        remain.push(prismPart(6, 0.1, 1.15, 0x24344d, m4(x, 1.15, 0), undefined, undefined, 0.08));
        remain.push(prismPart(6, 0.11, 0.05, A, m4(x, 2.32, 0), { glow: 1.4, noInk: true }, A, 0.06));
        remain.push(prismPart(6, 0.12, 0.04, A, m4(x, 0.08, 0), { glow: 0.8, noInk: true }, A));
      }
      break; // the membrane is its own shader quad
    }
    case 'pylon': {
      remain.push(prismPart(6, 0.42, 0.08, 0x1c2a40, m4(0, 0.08, 0), undefined, undefined, 0.36));
      cut.push(prismPart(6, 0.3, 0.8, palette.glass, m4(0, 0.96, 0), { glow: 0.35 }, 0xffffff, 0.17));
      cut.push(prismPart(6, 0.29, 0.025, A, m4(0, 0.62, 0), { glow: 1.2, noInk: true }, A, 0.28));
      cut.push(prismPart(6, 0.23, 0.025, A, m4(0, 1.22, 0), { glow: 1.2, noInk: true }, A, 0.22));
      break;
    }
  }
  return { cut, remain };
}

function buildMesh(
  parts: ConvexPart[],
  mat: THREE.Material,
  ink: number,
  origin?: P3,
  capGlow = 0,
): THREE.Mesh {
  const b = new PartBuilder();
  for (const p of parts) {
    b.add(partGeometry(p, 'skin', origin), null, p.color, p.opts);
    if (p.caps?.size)
      b.add(
        partGeometry(p, 'caps', origin),
        null,
        p.inner ?? p.color,
        capGlow > 0 ? { glow: capGlow } : { noInk: true },
      );
  }
  return new THREE.Mesh(b.build(ink), mat);
}

type Mode = 'fly' | 'slide' | 'float' | 'stay';
interface Piece {
  mesh: THREE.Mesh;
  mat: CharacterMaterial;
  vel: THREE.Vector3;
  axis: THREE.Vector3;
  spin: number;
  life: number;
  max: number;
  ground: number | undefined;
  mode: Mode;
  bounced: boolean;
  owner: number;
  heat: number;
}

interface Obj {
  def: BreakableDef;
  intact: THREE.Mesh | null;
  remain: THREE.Mesh | null;
  membrane: THREE.Mesh | null;
  parts: ConvexPart[];
  broken: boolean;
  baseY: number;
}

/** What broke, for the game to dress with effects and sound. */
export interface BreakInfo {
  kind: BreakableKind;
  mat: 'wood' | 'stone' | 'metal' | 'glass' | 'energy';
  centre: THREE.Vector3;
  by: 'sword' | 'body';
  /** World-space cut plane normal and blade travel (sword only). */
  normal: THREE.Vector3;
  along: THREE.Vector3;
  power: number;
  /** A clean hit through the bullseye of a training target. */
  bullseye: boolean;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();

const membraneMat = (accent: THREE.Color) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAccent: { value: accent }, uFlick: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform float uTime; uniform vec3 uAccent; uniform float uFlick;
      void main(){
        vec2 p = vUv * vec2(2.4, 2.2) * 5.0;
        vec2 r = vec2(1.0, 1.732); vec2 h = r * 0.5;
        vec2 a = mod(p, r) - h; vec2 b = mod(p - h, r) - h;
        vec2 g = dot(a,a) < dot(b,b) ? a : b;
        float hex = 0.5 - max(dot(abs(g), normalize(r)), abs(g.x));
        float line = 1.0 - smoothstep(0.02, 0.06, hex);
        float edge = 1.0 - smoothstep(0.0, 0.06, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        float scan = 0.5 + 0.5 * sin(vUv.y * 40.0 - uTime * 6.0);
        float a2 = 0.08 + line * (0.25 + 0.2 * scan) + edge * 0.6 + uFlick * 0.3;
        gl_FragColor = vec4(uAccent * a2 * 1.4, a2);
      }`,
  });

export class BreakableView {
  readonly group = new THREE.Group();
  private mat: CharacterMaterial;
  private objs: Obj[] = [];
  private pieces: Piece[] = [];
  private memMats: THREE.ShaderMaterial[] = [];
  private accent: THREE.Color;
  private t = 0;
  /** Called when a relic half crumbles (the game throws dust there). */
  onCrumble: (at: THREE.Vector3) => void = () => {};

  constructor(
    private defs: BreakableDef[],
    palette: { accent: number; glass: number },
    private sim: Simulation | null,
  ) {
    this.mat = createCharacterMaterial();
    this.accent = new THREE.Color(palette.accent);
    this.mat.userData.accent.value.copy(this.accent);
    defs.forEach((d) => {
      const { cut, remain } = art(d.kind, d.hang ?? 2.4, palette);
      const k = d.scale ?? 1;
      const M = new THREE.Matrix4().compose(
        new THREE.Vector3(...d.p),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw ?? 0),
        new THREE.Vector3(k, k, k),
      );
      for (const p of cut) transformPart(p, M);
      for (const p of remain) transformPart(p, M);
      const o: Obj = {
        def: d,
        intact: null,
        remain: null,
        membrane: null,
        parts: cut,
        broken: false,
        baseY: 0,
      };
      if (cut.length) {
        o.intact = buildMesh(cut, this.mat, 0.008 * k);
        o.intact.castShadow = true;
        this.group.add(o.intact);
      }
      if (remain.length) {
        o.remain = buildMesh(remain, this.mat, 0.007 * k);
        o.remain.castShadow = true;
        this.group.add(o.remain);
      }
      if (d.kind === 'energy') {
        const mm = membraneMat(this.accent);
        this.memMats.push(mm);
        const s = BREAKABLE_SPECS.energy;
        const g = new THREE.PlaneGeometry(s.hx * 2, s.hy * 2);
        o.membrane = new THREE.Mesh(g, mm);
        o.membrane.position.set(d.p[0], d.p[1] + s.cy * k, d.p[2]);
        o.membrane.rotation.y = d.yaw ?? 0;
        o.membrane.scale.setScalar(k);
        this.group.add(o.membrane);
      }
      this.objs.push(o);
    });
  }

  /** Break object `i`. Returns what happened so the game can add effects and sound. */
  break(
    i: number,
    by: 'sword' | 'body',
    hit: SwordHit | undefined,
    playerVel: THREE.Vector3,
    eye: THREE.Vector3,
  ): BreakInfo | null {
    const o = this.objs[i];
    if (!o || o.broken) return null;
    o.broken = true;
    const d = o.def;
    const spec = BREAKABLE_SPECS[d.kind];
    const c = breakableCentre(d);
    const centre = new THREE.Vector3(c.x, c.y, c.z);
    const info: BreakInfo = {
      kind: d.kind,
      mat: spec.mat,
      centre,
      by,
      normal: new THREE.Vector3(0, 1, 0),
      along: new THREE.Vector3(1, 0, 0),
      power: hit?.power ?? 0.6,
      bullseye: false,
    };
    if (o.intact) o.intact.visible = false;
    if (o.membrane) o.membrane.visible = false;

    if (by === 'sword' && hit) {
      _n.set(hit.nx, hit.ny, hit.nz);
      _t.set(hit.tx, hit.ty, hit.tz);
      info.normal.copy(_n);
      info.along.copy(_t);
      // the blade's plane passes through the eye; cut the object where the blade actually crossed
      // it, pulled toward the centre so both halves are worth seeing
      const offset = _v.copy(centre).sub(eye).dot(_n);
      const pc = centre.clone().addScaledVector(_n, -offset * 0.25);
      if (d.kind === 'target') info.bullseye = Math.abs(offset) < 0.14;
      if (o.parts.length) this.cut(i, o, _n, pc.dot(_n), _t, playerVel, info);
    } else if (o.parts.length) {
      // a body smash: four chunks thrown along the run
      const dir = _t.copy(playerVel).setY(0);
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
      dir.normalize();
      const n1 = _n.crossVectors(dir, _v.set(0, 1, 0)).normalize();
      info.normal.copy(n1);
      info.along.copy(dir);
      const halves: ConvexPart[][] = [[], []];
      for (const p of o.parts) {
        const [f, b] = clipPart(p, [n1.x, n1.y, n1.z], n1.dot(centre));
        if (f) halves[0].push(f);
        if (b) halves[1].push(b);
      }
      for (const h of halves) {
        const top: ConvexPart[] = [],
          bot: ConvexPart[] = [];
        for (const p of h) {
          const [f, b] = clipPart(p, [0, 1, 0], centre.y + 0.05);
          if (f) top.push(f);
          if (b) bot.push(b);
        }
        for (const grp of [top, bot]) {
          if (!grp.length) continue;
          const pc = partCentroid(grp[0]);
          const side = _v.set(pc[0], pc[1], pc[2]).sub(centre);
          const vel = new THREE.Vector3()
            .copy(playerVel)
            .multiplyScalar(0.75)
            .addScaledVector(side.normalize(), 2.4)
            .add(new THREE.Vector3(0, 2.2, 0));
          this.spawn(i, grp, vel, 'fly', 0, d.ground);
        }
      }
    }
    return info;
  }

  private cut(
    i: number,
    o: Obj,
    n: THREE.Vector3,
    dd: number,
    along: THREE.Vector3,
    playerVel: THREE.Vector3,
    info: BreakInfo,
  ) {
    const d = o.def;
    const front: ConvexPart[] = [],
      back: ConvexPart[] = [];
    const split = (dist: number) => {
      front.length = back.length = 0;
      for (const p of o.parts) {
        const [f, b] = clipPart(p, [n.x, n.y, n.z], dist);
        if (f) front.push(f);
        if (b) back.push(b);
      }
    };
    split(dd);
    if (!front.length || !back.length) {
      // the blade only grazed it: cut through the middle so it always comes apart in two
      const c = breakableCentre(d);
      split(n.x * c.x + n.y * c.y + n.z * c.z);
    }
    const kind = d.kind;
    const halves: [ConvexPart[], number][] = [
      [front, 1],
      [back, -1],
    ];
    // which half is lower (a column's base stays standing)
    const cy = (ps: ConvexPart[]) => (ps.length ? partCentroid(ps[0])[1] : 0);
    const lowFront = cy(front) < cy(back);
    for (const [ps, sgn] of halves) {
      if (!ps.length) continue;
      const vel = new THREE.Vector3();
      let mode: Mode = 'fly';
      const isLow = sgn === 1 ? lowFront : !lowFront;
      if (kind === 'column') {
        if (isLow) mode = 'stay';
        else {
          mode = 'slide';
          // slide down the cut plane, pushed along by the blade
          const g = new THREE.Vector3(0, -1, 0);
          const down = g.addScaledVector(n, -g.dot(n));
          if (down.lengthSq() < 1e-4) down.copy(along);
          vel.copy(down.normalize()).multiplyScalar(1.4).addScaledVector(along, 1.2);
        }
      } else if (kind === 'relic') {
        mode = 'float';
        vel
          .copy(n)
          .multiplyScalar(sgn * 0.9)
          .add(new THREE.Vector3(0, 0.35, 0))
          .addScaledVector(along, 0.4);
      } else {
        // the two halves part along the cut normal, the blade throws them along its path, and
        // they keep some of the runner's speed
        vel
          .copy(n)
          .multiplyScalar(sgn * (1.6 + info.power * 1.6))
          .addScaledVector(along, 2.2 + info.power * 2)
          .addScaledVector(playerVel, 0.45)
          .add(new THREE.Vector3(0, 1.6, 0));
      }
      this.spawn(i, ps, vel, mode, 1.6 + info.power, d.ground, sgn);
    }
  }

  private spawn(
    owner: number,
    parts: ConvexPart[],
    vel: THREE.Vector3,
    mode: Mode,
    heat: number,
    ground?: number,
    sgn = 1,
  ) {
    // centre the piece on its own centroid so it spins about itself
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const p of parts) {
      const c = partCentroid(p);
      cx += c[0] / parts.length;
      cy += c[1] / parts.length;
      cz += c[2] / parts.length;
    }
    const mat = createCharacterMaterial();
    mat.userData.accent.value.copy(this.accent);
    mat.userData.glowK.value = heat > 0 ? 2.2 : 1;
    const mesh = buildMesh(parts, mat, 0.007, [cx, cy, cz], heat > 0 ? 1 : 0);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = true;
    this.group.add(mesh);
    const axis = new THREE.Vector3(vel.z, 0.3 * sgn, -vel.x);
    if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
    axis.normalize();
    const p: Piece = {
      mesh,
      mat,
      vel: vel.clone(),
      axis,
      spin:
        mode === 'stay'
          ? 0
          : mode === 'float'
            ? 0.8 * sgn
            : mode === 'slide'
              ? 1.4
              : (3 + Math.random() * 3) * sgn,
      life: 0,
      max: mode === 'stay' ? Infinity : mode === 'float' ? 1.5 : 1.9,
      ground,
      mode,
      bounced: false,
      owner,
      heat,
    };
    if (this.pieces.length >= MAX_PIECES) {
      const old = this.pieces.findIndex((q) => q.mode !== 'stay');
      if (old >= 0) this.retire(old);
    }
    this.pieces.push(p);
  }

  private retire(k: number) {
    const p = this.pieces[k];
    p.mesh.removeFromParent();
    p.mesh.geometry.dispose();
    p.mat.dispose();
    this.pieces.splice(k, 1);
  }

  private restore(i: number) {
    const o = this.objs[i];
    o.broken = false;
    if (o.intact) o.intact.visible = true;
    if (o.membrane) o.membrane.visible = true;
    for (let k = this.pieces.length - 1; k >= 0; k--) if (this.pieces[k].owner === i) this.retire(k);
  }

  update(dt: number) {
    this.t += dt;
    for (const m of this.memMats) m.uniforms.uTime.value = this.t;
    // the simulation is the source of truth: a restart brings everything back
    if (this.sim) {
      const br = this.sim.broken;
      for (let i = 0; i < this.objs.length; i++) if (this.objs[i].broken && !br[i]) this.restore(i);
    }
    // relics hover
    for (const o of this.objs) {
      if (o.def.kind === 'relic' && o.intact && !o.broken)
        o.intact.position.y = Math.sin(this.t * 1.7 + o.def.p[0]) * 0.05;
    }
    for (let k = this.pieces.length - 1; k >= 0; k--) {
      const p = this.pieces[k];
      p.life += dt;
      if (p.mode === 'stay') {
        p.mat.userData.glowK.value = Math.max(0.6, 2.2 - p.life * 1.6);
        continue;
      }
      const g =
        p.mode === 'float' ? (p.life < 0.7 ? 0 : 14) : p.mode === 'slide' ? (p.life < 0.25 ? 4 : 13) : 16;
      if (p.mode === 'float' && p.life < 0.7) p.vel.multiplyScalar(Math.exp(-dt * 1.2));
      p.vel.y -= g * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      _q.setFromAxisAngle(p.axis, p.spin * dt * (p.mode === 'slide' ? Math.min(1, p.life * 2) : 1));
      p.mesh.quaternion.premultiply(_q);
      // one bounce on the floor under the object, then it skids and settles
      const r = p.mesh.geometry.boundingSphere?.radius ?? 0.2;
      if (p.ground !== undefined && p.mesh.position.y - r * 0.45 < p.ground && p.vel.y < 0) {
        p.mesh.position.y = p.ground + r * 0.45;
        p.vel.y = p.bounced ? 0 : -p.vel.y * 0.3;
        p.vel.x *= 0.55;
        p.vel.z *= 0.55;
        p.spin *= 0.5;
        p.bounced = true;
      }
      // hot cut faces cool down
      p.mat.userData.glowK.value = Math.max(0.5, (p.mode === 'float' ? 3 : 2.2) - p.life * 2.2);
      const left = p.max - p.life;
      if (p.mode === 'float' && p.life > 0.9 && p.life - dt <= 0.9) this.onCrumble(p.mesh.position);
      if (left < 0.35) p.mesh.scale.setScalar(Math.max(0.001, left / 0.35));
      if (left <= 0) this.retire(k);
    }
  }

  /** Number of loose pieces alive (for tests / profiling). */
  get pieceCount() {
    return this.pieces.length;
  }

  dispose() {
    while (this.pieces.length) this.retire(this.pieces.length - 1);
    for (const o of this.objs) for (const m of [o.intact, o.remain, o.membrane]) m?.geometry.dispose();
    for (const m of this.memMats) m.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
