/**
 * Evolve collectibles on screen: one instanced mesh per kind (plus its inked outline shell), so a
 * whole course of pickups costs two draw calls per kind. Shapes read at speed: the silhouette tells
 * you how to catch it (a ring to slide under, a knot in the air, a blade-thin rift to dash through,
 * a glyph to cut, a vein along the wall), the colour tells you its rarity.
 * Nothing flickers: Paradox Cores out of reach dim and turn slowly instead.
 */
import * as THREE from 'three';
import type { CollectibleState, Evolution } from '../evolution/Evolution';
import { KINDS, RARITY_COLOR, type CollectibleKind } from '../evolution/collectibles';

const ORDER: CollectibleKind[] = ['glint', 'undertow', 'skyknot', 'rift', 'glyph', 'vein', 'echo', 'paradox'];

function geometry(k: CollectibleKind): THREE.BufferGeometry {
  switch (k) {
    case 'glint':
      return new THREE.OctahedronGeometry(0.2, 0);
    case 'undertow':
      return new THREE.TorusGeometry(0.55, 0.09, 6, 18).rotateX(Math.PI / 2);
    case 'skyknot':
      return new THREE.TorusKnotGeometry(0.32, 0.09, 40, 6);
    case 'rift':
      return new THREE.OctahedronGeometry(0.5, 0).scale(0.35, 1.3, 0.35);
    case 'glyph':
      return new THREE.CylinderGeometry(0.42, 0.42, 0.12, 6).rotateX(Math.PI / 2);
    case 'vein':
      return new THREE.OctahedronGeometry(0.6, 0).scale(0.4, 1.8, 0.4);
    case 'echo':
      return new THREE.IcosahedronGeometry(0.32, 0);
    case 'paradox':
      return new THREE.IcosahedronGeometry(0.5, 1);
  }
}

interface Pool {
  kind: CollectibleKind;
  mesh: THREE.InstancedMesh;
  shell: THREE.InstancedMesh;
  items: number[]; // indices into evo.items
  base: THREE.Color;
}

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _s = new THREE.Vector3(),
  _p = new THREE.Vector3(),
  _u = new THREE.Vector3(),
  _c = new THREE.Color();
const Y = new THREE.Vector3(0, 1, 0);
const GREY = new THREE.Color(0x8a8f9c);

export class EvoView {
  readonly group = new THREE.Group();
  private pools: Pool[] = [];
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private builtFor: CollectibleState[] | null = null;
  private ink = new THREE.MeshBasicMaterial({ color: 0x0b0d14, side: THREE.BackSide, fog: false });

  constructor(private evo: Evolution) {
    this.group.name = 'evo';
    this.mats.push(this.ink);
  }

  /** (Re)build the pools whenever the run's layout changes (a restart reseeds it). */
  private build() {
    for (const p of this.pools) {
      p.mesh.removeFromParent();
      p.shell.removeFromParent();
      p.mesh.dispose();
      p.shell.dispose();
    }
    this.pools = [];
    const items = this.evo.items;
    this.builtFor = items;
    for (const kind of ORDER) {
      const idx: number[] = [];
      items.forEach((it, i) => it.kind === kind && idx.push(i));
      if (!idx.length) continue;
      const geo = geometry(kind);
      this.geos.push(geo);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
      this.mats.push(mat);
      const mesh = new THREE.InstancedMesh(geo, mat, idx.length);
      const shell = new THREE.InstancedMesh(geo, this.ink, idx.length);
      const base = new THREE.Color(RARITY_COLOR[KINDS[kind].rarity]).multiplyScalar(2.4);
      for (let j = 0; j < idx.length; j++) mesh.setColorAt(j, base);
      mesh.frustumCulled = shell.frustumCulled = false;
      mesh.name = 'evo-' + kind;
      this.group.add(shell, mesh);
      this.pools.push({ kind, mesh, shell, items: idx, base });
    }
  }

  update(time: number) {
    const evo = this.evo;
    if (this.builtFor !== evo.items) this.build();
    const tier = evo.flowTier;
    for (const pool of this.pools) {
      const base = pool.base;
      for (let j = 0; j < pool.items.length; j++) {
        const i = pool.items[j];
        const it = evo.items[i];
        let sc = it.taken ? 0 : 1;
        let spin = 1.6;
        let bob = 0.1;
        _c.copy(base);
        if (pool.kind === 'echo' && !it.taken) {
          if (it.live) sc = 1.15 + Math.sin(time * 6) * 0.12;
          else {
            sc = 0.4; // where the chain goes next: a dim hint
            _c.multiplyScalar(0.35);
          }
        } else if (pool.kind === 'paradox' && !it.taken) {
          if (tier < 3) {
            _c.lerp(GREY, 0.75).multiplyScalar(0.3); // out of reach: grey, dim and slow, never flickering
            spin = 0.4;
          } else spin = 3.2;
        } else if (pool.kind === 'glint') {
          spin = 2.6;
          bob = 0.08;
        } else if (pool.kind === 'undertow') bob = 0.03;
        else if (pool.kind === 'rift') spin = 5;
        pool.mesh.setColorAt(j, _c);
        _u.set(it.u[0], it.u[1], it.u[2]);
        _q.setFromUnitVectors(Y, _u);
        _q2.setFromAxisAngle(Y, time * spin + i);
        _q.multiply(_q2);
        const b = Math.sin(time * 2.2 + i) * bob;
        _p.set(it.p[0] + _u.x * b, it.p[1] + _u.y * b, it.p[2] + _u.z * b);
        _s.setScalar(sc);
        _m.compose(_p, _q, _s);
        pool.mesh.setMatrixAt(j, _m);
        _s.setScalar(sc * 1.18);
        _m.compose(_p, _q, _s);
        pool.shell.setMatrixAt(j, _m);
      }
      pool.mesh.instanceMatrix.needsUpdate = true;
      pool.shell.instanceMatrix.needsUpdate = true;
      if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Draw calls this view adds (for the performance report). */
  get drawCalls() {
    return this.pools.length * 2;
  }

  dispose() {
    for (const p of this.pools) {
      p.mesh.dispose();
      p.shell.dispose();
    }
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.group.removeFromParent();
  }
}
