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
  GravityZone,
  Hazard,
  JumpPad,
  Mover,
  Rotator,
  type Entity,
} from '../entities/Entities';
import type { Simulation } from '../gameplay/Simulation';
import type { DecorDef, LevelData, MatId } from '../levels/types';
import { GeoBuilder, type Fx } from './geometry';
import { createWorldMaterial } from './WorldMaterial';

interface Animated {
  mesh: THREE.Object3D;
  def: DecorDef;
  phase: number;
}

interface EntityVisual {
  e: Entity;
  obj: THREE.Object3D;
  warn?: { value: number };
}

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
    this.palette = {
      base: new THREE.Color(p.base),
      alt: new THREE.Color(p.alt),
      dark: new THREE.Color(p.dark),
      accent: new THREE.Color(p.accent),
      glass: new THREE.Color(p.glass),
      hazard: new THREE.Color(p.hazard),
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
      const color = this.palette[d.mat];
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
      }
      if (!b.vertexCount) continue;
      const geo = b.build();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !(e instanceof GravityZone);
      mesh.receiveShadow = true;
      const obj: THREE.Object3D = mesh;
      this.disposables.push(geo);
      obj.position.set(e.p.x, e.p.y, e.p.z);
      obj.quaternion.set(e.q.x, e.q.y, e.q.z, e.q.w);
      this.group.add(obj);
      this.visuals.push({ e, obj, warn });
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
