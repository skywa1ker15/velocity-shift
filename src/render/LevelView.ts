/**
 * LevelView: turns LevelData + live entity state into three.js objects.
 * Static solids and decoration are merged into two meshes; each dynamic entity gets one mesh
 * whose transform is interpolated from the simulation every frame.
 */
import * as THREE from 'three';
import type { EnvPreset } from '../environment/presets';
import {
  Blink,
  Boost,
  Collapse,
  GravityField,
  GravityZone,
  Hazard,
  Impulse,
  JumpPad,
  Mover,
  Rotator,
  Structure,
  type Entity,
} from '../entities/Entities';
import type { Simulation } from '../gameplay/Simulation';
import type { DecorDef, LevelData, MatId } from '../levels/types';
import { GeoBuilder, type Fx } from './geometry';
import { createWorldMaterial } from './WorldMaterial';
import { ROLE, RoleColor } from '../multiverse/uniforms';

interface Animated {
  mesh: THREE.Object3D;
  def: DecorDef;
  phase: number;
}

interface EntityVisual {
  e: Entity;
  obj: THREE.Object3D;
  warn?: { value: number };
  /** Crack lines shown while a collapsing piece telegraphs. */
  cracks?: THREE.Object3D;
}

/** Debris chunk shapes; each universe picks one (see FxLook.debris). */
export type DebrisShape = 'cube' | 'shard' | 'slab';
interface DebrisPool {
  mesh: THREE.InstancedMesh;
  pos: Float32Array;
  vel: Float32Array;
  rot: Float32Array;
  spin: Float32Array;
  size: Float32Array;
  life: Float32Array;
  next: number;
  alive: number;
}
const DEBRIS_PER_SHAPE = 96;

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class LevelView {
  readonly group = new THREE.Group();
  private material: THREE.MeshToonMaterial;
  private animated: Animated[] = [];
  private visuals: EntityVisual[] = [];
  private collectibles: THREE.Mesh[] = [];
  private disposables: { dispose(): void }[] = [];
  private palette: Record<MatId, THREE.Color>;
  /** Non-colliding architecture painted 'base' gets its own colour so it separates from floors. */
  private structure: THREE.Color;
  private shardGeo = new THREE.OctahedronGeometry(1, 0);
  private gemMat: THREE.MeshBasicMaterial;
  private inkMat = new THREE.MeshBasicMaterial({ color: 0x0b0d14, side: THREE.BackSide, fog: false });
  private gemMatDim: THREE.MeshBasicMaterial;

  constructor(
    private data: LevelData,
    env: EnvPreset,
    private sim: Simulation | null,
    owned: Set<string> = new Set(),
  ) {
    const p = env.palette;
    // colours carry their material role, so other universes can repaint the same geometry
    this.structure = new RoleColor(env.look.structure).withRole(ROLE.structure);
    this.palette = {
      base: new RoleColor(p.base).withRole(ROLE.base),
      alt: new RoleColor(p.alt).withRole(ROLE.alt),
      dark: new RoleColor(p.dark).withRole(ROLE.dark),
      accent: new RoleColor(p.accent).withRole(ROLE.accent),
      glass: new RoleColor(p.glass).withRole(ROLE.glass),
      hazard: new RoleColor(p.hazard).withRole(ROLE.hazard),
    };
    this.material = createWorldMaterial();
    this.disposables.push(this.material, this.shardGeo);
    this.gemMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(p.accent).multiplyScalar(3.2),
      fog: false,
    });
    this.gemMatDim = new THREE.MeshBasicMaterial({
      color: new THREE.Color(p.accent).multiplyScalar(0.5),
      transparent: true,
      opacity: 0.35,
      fog: false,
    });
    this.disposables.push(this.gemMat, this.gemMatDim, this.inkMat);

    this.buildStatic();
    this.buildDecor();
    if (sim) this.buildEntities(sim);
    this.buildCollectibles(owned);
  }

  private fxOf(mat: MatId, wallrun?: boolean, glow?: number): Fx {
    return [
      wallrun ? 1 : 0,
      glow ?? (mat === 'accent' ? 0.8 : mat === 'glass' ? 0.22 : 0),
      mat === 'hazard' ? 1 : 0,
    ];
  }

  private buildStatic() {
    const b = new GeoBuilder();
    for (const s of this.data.solids) {
      let q: THREE.Quaternion | null = null;
      if (s.q) q = _q.set(s.q[0], s.q[1], s.q[2], s.q[3]).clone();
      else if (s.r) q = new THREE.Quaternion().setFromEuler(_e.set(s.r[0], s.r[1], s.r[2], 'XYZ'));
      b.addBox(
        s.p[0],
        s.p[1],
        s.p[2],
        s.s[0],
        s.s[1],
        s.s[2],
        q,
        this.palette[s.mat],
        this.fxOf(s.mat, s.wallrun, s.glow),
      );
    }
    if (!b.vertexCount) return;
    const geo = b.build();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // one merged mesh spanning the level
    this.group.add(mesh);
    this.disposables.push(geo);
  }

  private decorGeometry(shape: DecorDef['shape']): THREE.BufferGeometry | null {
    switch (shape) {
      case 'pillar':
        return new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1);
      case 'shard':
        return this.shardGeo;
      case 'orb':
        return new THREE.IcosahedronGeometry(0.5, 1);
      case 'ring':
        return null; // built per instance (tube ratio varies)
      default:
        return null;
    }
  }

  private buildDecor() {
    const b = new GeoBuilder();
    for (const d of this.data.decor) {
      const color = d.mat === 'base' ? this.structure : this.palette[d.mat];
      const fx = this.fxOf(d.mat, false, d.glow);
      const rot = d.r ? new THREE.Quaternion().setFromEuler(_e.set(d.r[0], d.r[1], d.r[2], 'XYZ')) : null;
      const moving = !!d.spin || !!d.bob;
      if (!moving && d.shape === 'box') {
        b.addBox(d.p[0], d.p[1], d.p[2], d.s[0], d.s[1], d.s[2], rot, color, fx);
        continue;
      }
      // build this piece in local space
      const lb = new GeoBuilder();
      if (d.shape === 'box') lb.addBox(0, 0, 0, d.s[0], d.s[1], d.s[2], null, color, fx);
      else if (d.shape === 'ring') {
        const tg = new THREE.TorusGeometry(d.s[0], d.s[1], 8, 56);
        lb.addGeometry(tg, _m.identity(), color, fx);
        tg.dispose();
      } else {
        const g = this.decorGeometry(d.shape)!;
        lb.addGeometry(g, _m.makeScale(d.s[0], d.s[1], d.s[2]), color, fx);
        if (g !== this.shardGeo) g.dispose();
      }
      if (!moving) {
        const lg = lb.build();
        _m.compose(_p.set(d.p[0], d.p[1], d.p[2]), rot ?? _q.identity(), _s.set(1, 1, 1));
        b.addGeometry(lg, _m, color, fx);
        lg.dispose();
        continue;
      }
      const geo = lb.build();
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.position.set(d.p[0], d.p[1], d.p[2]);
      if (rot) mesh.quaternion.copy(rot);
      this.group.add(mesh);
      this.disposables.push(geo);
      this.animated.push({ mesh, def: d, phase: (d.p[0] * 0.37 + d.p[2] * 0.11) % 6.28 });
    }
    if (b.vertexCount) {
      const geo = b.build();
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.disposables.push(geo);
    }
  }

  private entityMaterial(): { mat: THREE.MeshToonMaterial; warn: { value: number } } {
    const warn = { value: 0 };
    const mat = createWorldMaterial({ warn });
    this.disposables.push(mat);
    return { mat, warn };
  }

  private buildEntities(sim: Simulation) {
    for (const e of sim.entities) {
      const { mat, warn } = this.entityMaterial();
      const b = new GeoBuilder();
      if (e instanceof Mover) {
        const d = e.def;
        const m: MatId = d.lethal ? 'hazard' : (d.mat ?? 'alt');
        b.addBox(0, 0, 0, d.s[0], d.s[1], d.s[2], null, this.palette[m], this.fxOf(m, d.wallrun));
        // glowing underside strip so moving terrain reads as "alive"
        if (!d.lethal && d.s[0] > 1 && d.s[2] > 1)
          b.addBox(
            0,
            -d.s[1] / 2 - 0.04,
            0,
            d.s[0] * 0.6,
            0.06,
            d.s[2] * 0.6,
            null,
            this.palette.accent,
            [0, 1, 0],
          );
      } else if (e instanceof Rotator) {
        for (const part of e.def.parts) {
          const m: MatId = part.lethal ? 'hazard' : (part.mat ?? 'alt');
          b.addBox(
            part.p[0],
            part.p[1],
            part.p[2],
            part.s[0],
            part.s[1],
            part.s[2],
            null,
            this.palette[m],
            this.fxOf(m, part.wallrun),
          );
        }
      } else if (e instanceof Collapse || e instanceof Blink) {
        const d = e.def;
        const m: MatId = d.mat ?? (e instanceof Blink ? 'glass' : 'base');
        b.addBox(
          0,
          0,
          0,
          d.s[0],
          d.s[1],
          d.s[2],
          null,
          this.palette[m],
          this.fxOf(m, false, e instanceof Blink ? 0.35 : undefined),
        );
      } else if (e instanceof Hazard) {
        if (e.def.visible === false) continue;
        const d = e.def;
        b.addBox(0, 0, 0, d.s[0], d.s[1], d.s[2], null, this.palette.hazard, [0, 0, 1]);
      } else if (e instanceof Boost || e instanceof JumpPad) {
        const d = e.def;
        const c = e instanceof Boost ? this.palette.accent : this.palette.glass;
        b.addBox(0, -d.s[1] / 2 + 0.04, 0, d.s[0], 0.08, d.s[2], null, c, [0, 1.4, 0]);
        if (e instanceof Boost) {
          // three chevron bars pointing along the boost direction
          const dir = e.def.dir;
          const ang = Math.atan2(dir[0], dir[2]);
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
          for (let i = -1; i <= 1; i++) {
            _p.set(0, 0, i * d.s[2] * 0.25).applyQuaternion(q);
            b.addBox(
              _p.x,
              -d.s[1] / 2 + 0.1,
              _p.z,
              d.s[0] * 0.7,
              0.05,
              0.25,
              q,
              new THREE.Color(1, 1, 1),
              [0, 2, 0],
            );
          }
        }
      } else if (e instanceof GravityZone) {
        const d = e.def;
        const hx = d.s[0] / 2,
          hy = d.s[1] / 2,
          hz = d.s[2] / 2;
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            b.addBox(sx * hx, 0, sz * hz, 0.12, d.s[1], 0.12, null, this.palette.glass, [0, 1.2, 0]);
        for (const sy of [-1, 1]) {
          b.addBox(0, sy * hy, -hz, d.s[0], 0.1, 0.1, null, this.palette.glass, [0, 1.2, 0]);
          b.addBox(0, sy * hy, hz, d.s[0], 0.1, 0.1, null, this.palette.glass, [0, 1.2, 0]);
          b.addBox(-hx, sy * hy, 0, 0.1, 0.1, d.s[2], null, this.palette.glass, [0, 1.2, 0]);
          b.addBox(hx, sy * hy, 0, 0.1, 0.1, d.s[2], null, this.palette.glass, [0, 1.2, 0]);
        }
      } else if (e instanceof Structure) {
        for (const part of e.def.parts) {
          const m: MatId = part.mat ?? 'alt';
          const pq = part.r
            ? new THREE.Quaternion().setFromEuler(_e.set(part.r[0], part.r[1], part.r[2]))
            : null;
          b.addBox(
            part.p[0],
            part.p[1],
            part.p[2],
            part.s[0],
            part.s[1],
            part.s[2],
            pq,
            this.palette[m],
            this.fxOf(m, part.wallrun),
          );
          // a glowing seam along each floor so moving architecture reads as alive
          if (part.s[0] > 2 && part.s[2] > 2 && part.s[1] < 2)
            b.addBox(
              part.p[0],
              part.p[1] - part.s[1] / 2 - 0.03,
              part.p[2],
              part.s[0] * 0.5,
              0.05,
              part.s[2] * 0.5,
              pq,
              this.palette.accent,
              [0, 1, 0],
            );
        }
      } else if (e instanceof GravityField) {
        this.fieldGeometry(b, e);
      } else if (e instanceof Impulse) {
        // an octagonal hoop facing the push direction
        const d = e.def.dir;
        const r = Math.min(e.def.s[0], e.def.s[1], e.def.s[2]) * 0.42;
        _p.set(d[0], d[1], d[2]).normalize();
        const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), _p);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const seg = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a + Math.PI / 8);
          _s.set(Math.cos(a + Math.PI / 8) * r, Math.sin(a + Math.PI / 8) * r, 0).applyQuaternion(qq);
          b.addBox(
            _s.x,
            _s.y,
            _s.z,
            0.16,
            r * 0.8,
            0.16,
            qq.clone().multiply(seg),
            this.palette.accent,
            [0, 2.2, 0],
          );
        }
      }
      if (!b.vertexCount) continue;
      const geo = b.build();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !(e instanceof GravityZone || e instanceof GravityField || e instanceof Impulse);
      mesh.receiveShadow = true;
      const obj: THREE.Object3D = mesh;
      this.disposables.push(geo);
      obj.position.set(e.p.x, e.p.y, e.p.z);
      obj.quaternion.set(e.q.x, e.q.y, e.q.z, e.q.w);
      this.group.add(obj);
      const v: EntityVisual = { e, obj, warn };
      if (e instanceof Collapse) v.cracks = this.crackLines(e.def.s, obj);
      this.visuals.push(v);
    }
    this.buildDebris();
  }

  /** Field volume: corner posts, and chevrons pointing the way gravity will pull. */
  private fieldGeometry(b: GeoBuilder, e: GravityField) {
    const d = e.def;
    const hx = d.s[0] / 2,
      hy = d.s[1] / 2,
      hz = d.s[2] / 2;
    const c = this.palette.glass;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) b.addBox(sx * hx, 0, sz * hz, 0.1, d.s[1], 0.1, null, c, [0, 1.6, 0]);
    for (const sy of [-1, 1]) {
      b.addBox(0, sy * hy, -hz, d.s[0], 0.08, 0.08, null, c, [0, 1.6, 0]);
      b.addBox(0, sy * hy, hz, d.s[0], 0.08, 0.08, null, c, [0, 1.6, 0]);
      b.addBox(-hx, sy * hy, 0, 0.08, 0.08, d.s[2], null, c, [0, 1.6, 0]);
      b.addBox(hx, sy * hy, 0, 0.08, 0.08, d.s[2], null, c, [0, 1.6, 0]);
    }
    if (d.mode === 'well') {
      // rings around the well's centre
      const cen = d.center ?? d.p;
      const ox = cen[0] - d.p[0],
        oy = cen[1] - d.p[1],
        oz = cen[2] - d.p[2];
      for (const r of [1.2, 2.4, 3.8])
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          b.addBox(
            ox + Math.cos(a) * r,
            oy + Math.sin(a) * r,
            oz,
            0.12,
            r * 0.5,
            0.12,
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a),
            this.palette.accent,
            [0, 2, 0],
          );
        }
      return;
    }
    // chevrons along the pull, in a grid across the volume (structure fields: local "down")
    const dir = d.mode === 'structure' ? [0, -1, 0] : (d.dir ?? [0, -1, 0]);
    _p.set(dir[0], dir[1], dir[2]).normalize();
    const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), _p);
    const nx = Math.max(1, Math.min(4, Math.round(d.s[0] / 6))),
      ny = Math.max(1, Math.min(4, Math.round(d.s[1] / 6))),
      nz = Math.max(1, Math.min(6, Math.round(d.s[2] / 6)));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++)
        for (let k = 0; k < nz; k++) {
          const x = ((i + 0.5) / nx - 0.5) * d.s[0],
            y = ((j + 0.5) / ny - 0.5) * d.s[1],
            z = ((k + 0.5) / nz - 0.5) * d.s[2];
          for (const side of [-1, 1]) {
            const arm = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * 0.7);
            _s.set(side * 0.28, 0.2, 0).applyQuaternion(qq);
            b.addBox(
              x + _s.x,
              y + _s.y,
              z + _s.z,
              0.12,
              0.7,
              0.12,
              qq.clone().multiply(arm),
              this.palette.accent,
              [0, 1.8, 0],
            );
          }
        }
  }

  /** Zig-zag crack lines across the top of a collapsing piece (shown while it telegraphs). */
  private crackLines(s: [number, number, number], parent: THREE.Object3D) {
    const b = new GeoBuilder();
    const ink = new THREE.Color(0x0b0d14);
    const y = s[1] / 2 + 0.012;
    for (let c = 0; c < 3; c++) {
      let x = (c - 1) * s[0] * 0.28,
        z = -s[2] / 2;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const nz = -s[2] / 2 + ((i + 1) / n) * s[2];
        const nx = x + (((c * 7 + i * 13) % 5) - 2) * s[0] * 0.07;
        const mx = (x + nx) / 2,
          mz = (z + nz) / 2;
        const len = Math.hypot(nx - x, nz - z);
        const q = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.atan2(nx - x, nz - z),
        );
        b.addBox(mx, y, mz, 0.06, 0.02, len, q, ink, [0, 0, 0]);
        x = nx;
        z = nz;
      }
    }
    const geo = b.build();
    this.disposables.push(geo);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.visible = false;
    parent.add(mesh);
    return mesh;
  }

  // ----- pooled debris: one instanced mesh per chunk shape, world material, no physics bodies
  private debris = new Map<DebrisShape, DebrisPool>();
  private seed = 7;
  private rnd() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  private buildDebris() {
    const shapes: [DebrisShape, [number, number, number]][] = [
      ['cube', [1, 1, 1]],
      ['shard', [0.5, 1.4, 0.22]],
      ['slab', [1.3, 0.35, 0.9]],
    ];
    for (const [shape, sz] of shapes) {
      const b = new GeoBuilder();
      if (shape === 'shard') {
        // two crossed tapering blades read as a broken facet
        b.addBox(0, 0, 0, sz[0], sz[1], sz[2], null, this.palette.alt, this.fxOf('alt'));
        b.addBox(0, sz[1] * 0.2, 0, sz[2], sz[1] * 0.6, sz[0], null, this.palette.base, this.fxOf('base'));
      } else b.addBox(0, 0, 0, sz[0], sz[1], sz[2], null, this.palette.alt, this.fxOf('alt'));
      const geo = b.build();
      this.disposables.push(geo);
      const mesh = new THREE.InstancedMesh(geo, this.material, DEBRIS_PER_SHAPE);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      const n = DEBRIS_PER_SHAPE;
      this.debris.set(shape, {
        mesh,
        pos: new Float32Array(n * 3),
        vel: new Float32Array(n * 3),
        rot: new Float32Array(n * 3),
        spin: new Float32Array(n * 3),
        size: new Float32Array(n),
        life: new Float32Array(n),
        next: 0,
        alive: 0,
      });
    }
  }

  /** Throw chunks off a breaking box (centre, size, rough push), in the current universe's shape. */
  spawnDebris(c: THREE.Vector3, size: [number, number, number], count: number, shape: DebrisShape, push = 3) {
    const pool = this.debris.get(shape);
    if (!pool) return;
    for (let k = 0; k < count; k++) {
      const i = pool.next;
      pool.next = (pool.next + 1) % DEBRIS_PER_SHAPE;
      const j = i * 3;
      pool.pos[j] = c.x + (this.rnd() - 0.5) * size[0];
      pool.pos[j + 1] = c.y + (this.rnd() - 0.5) * size[1];
      pool.pos[j + 2] = c.z + (this.rnd() - 0.5) * size[2];
      pool.vel[j] = (this.rnd() - 0.5) * push * 2;
      pool.vel[j + 1] = this.rnd() * push * 1.2 + 1;
      pool.vel[j + 2] = (this.rnd() - 0.5) * push * 2;
      for (let a = 0; a < 3; a++) {
        pool.rot[j + a] = this.rnd() * 6.28;
        pool.spin[j + a] = (this.rnd() - 0.5) * 9;
      }
      pool.size[i] =
        (0.25 + this.rnd() * 0.45) * Math.min(1.6, 0.4 + Math.cbrt(size[0] * size[1] * size[2]) * 0.18);
      pool.life[i] = 2.2 + this.rnd() * 1.4;
    }
    pool.alive = DEBRIS_PER_SHAPE;
    pool.mesh.visible = true;
  }

  private updateDebris(dt: number) {
    for (const pool of this.debris.values()) {
      if (!pool.alive) continue;
      let alive = 0,
        n = 0;
      for (let i = 0; i < DEBRIS_PER_SHAPE; i++) {
        if (pool.life[i] <= 0) continue;
        pool.life[i] -= dt;
        if (pool.life[i] <= 0) continue;
        alive++;
        const j = i * 3;
        pool.vel[j + 1] -= 16 * dt;
        pool.pos[j] += pool.vel[j] * dt;
        pool.pos[j + 1] += pool.vel[j + 1] * dt;
        pool.pos[j + 2] += pool.vel[j + 2] * dt;
        for (let a = 0; a < 3; a++) pool.rot[j + a] += pool.spin[j + a] * dt;
        const sc = pool.size[i] * Math.min(1, pool.life[i] * 2.5); // shrink away at the end of life
        _e.set(pool.rot[j], pool.rot[j + 1], pool.rot[j + 2]);
        _q.setFromEuler(_e);
        _p.set(pool.pos[j], pool.pos[j + 1], pool.pos[j + 2]);
        _s.set(sc, sc, sc);
        _m.compose(_p, _q, _s);
        pool.mesh.setMatrixAt(n++, _m);
      }
      pool.mesh.count = n;
      pool.mesh.instanceMatrix.needsUpdate = true;
      pool.alive = alive;
      pool.mesh.visible = alive > 0;
    }
  }

  private buildCollectibles(owned: Set<string>) {
    for (const c of this.data.collectibles) {
      const mesh = new THREE.Mesh(this.shardGeo, owned.has(c.id) ? this.gemMatDim : this.gemMat);
      mesh.position.set(c.p[0], c.p[1], c.p[2]);
      mesh.scale.set(0.28, 0.5, 0.28);
      // inked outline: a slightly larger shell drawn inside-out
      const shell = new THREE.Mesh(this.shardGeo, this.inkMat);
      shell.scale.setScalar(1.22);
      mesh.add(shell);
      this.group.add(mesh);
      this.collectibles.push(mesh);
    }
  }

  hideCollectible(index: number) {
    const m = this.collectibles[index];
    if (m) m.visible = false;
  }
  showCollectibles() {
    for (const m of this.collectibles) m.visible = true;
  }

  /** Per-frame: interpolate entity transforms, animate decoration and collectibles. */
  update(alpha: number, time: number, dt: number) {
    for (const v of this.visuals) {
      const e = v.e,
        o = v.obj;
      o.position.set(
        e.prevP.x + (e.p.x - e.prevP.x) * alpha,
        e.prevP.y + (e.p.y - e.prevP.y) * alpha - 0.5 * 14 * e.drop * e.drop,
        e.prevP.z + (e.p.z - e.prevP.z) * alpha,
      );
      _q.set(e.prevQ.x, e.prevQ.y, e.prevQ.z, e.prevQ.w);
      o.quaternion.set(e.q.x, e.q.y, e.q.z, e.q.w);
      if (alpha < 1) o.quaternion.slerpQuaternions(_q, o.quaternion, alpha);
      if (v.warn) v.warn.value = e.warn;
      let visible = e.visible;
      if (e instanceof Mover && e.def.telegraph && e.atRest && e.warn > 0) {
        // a crusher about to drop rattles in its housing as it glows
        o.position.x += Math.sin(time * 67) * 0.03 * e.warn;
        o.position.y += Math.cos(time * 59) * 0.025 * e.warn;
      }
      if (v.cracks) v.cracks.visible = e instanceof Collapse && e.phase === 1;
      if (e instanceof Structure && e.stage === 1) {
        // a structure about to move groans and shivers
        o.position.x += Math.sin(time * 47) * 0.05 * e.warn;
        o.position.y += Math.cos(time * 41) * 0.04 * e.warn;
      }
      if (e instanceof Collapse) {
        if (e.phase === 1) {
          // telegraph shake
          o.position.x += Math.sin(time * 61) * 0.035;
          o.position.z += Math.cos(time * 53) * 0.035;
        }
        if (e.phase === 2) {
          o.rotation.x += 0.4 * e.drop;
          visible = e.drop < 1.6;
        }
      }
      o.visible = visible;
    }
    this.updateDebris(dt);
    for (const a of this.animated) {
      const d = a.def;
      if (d.spin) {
        a.mesh.rotateX(d.spin[0] * dt);
        a.mesh.rotateY(d.spin[1] * dt);
        a.mesh.rotateZ(d.spin[2] * dt);
      }
      if (d.bob) a.mesh.position.y = d.p[1] + Math.sin(time * 0.7 + a.phase) * d.bob;
    }
    for (let i = 0; i < this.collectibles.length; i++) {
      const m = this.collectibles[i];
      if (!m.visible) continue;
      m.rotation.y = time * 1.6 + i;
      m.position.y = this.data.collectibles[i].p[1] + Math.sin(time * 2 + i) * 0.12;
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
    this.sim = null;
  }
}
