/**
 * Geometry batching. Level solids and decoration are merged into a handful of big buffers
 * (one draw call each) carrying the custom attributes WorldMaterial needs.
 */
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();

// face table: normal, u axis, v axis (side faces keep v vertical so wall rails stay horizontal)
const FACES: [number[], number[], number[]][] = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];

export type Fx = [wallrun: number, glow: number, hazard: number];

export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private face: number[] = [];
  private fx: number[] = [];
  private idx: number[] = [];
  private count = 0;

  get vertexCount() {
    return this.count;
  }

  addBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, quat: THREE.Quaternion | null, color: THREE.Color, fx: Fx) {
    const half = [sx / 2, sy / 2, sz / 2];
    for (const [n, u, v] of FACES) {
      const fw = Math.abs(u[0]) * sx + Math.abs(u[1]) * sy + Math.abs(u[2]) * sz;
      const fh = Math.abs(v[0]) * sx + Math.abs(v[1]) * sy + Math.abs(v[2]) * sz;
      const base = this.count;
      for (let k = 0; k < 4; k++) {
        const su = k === 0 || k === 3 ? -1 : 1;
        const sv = k < 2 ? -1 : 1;
        _v.set(
          (n[0] + u[0] * su + v[0] * sv) * half[0],
          (n[1] + u[1] * su + v[1] * sv) * half[1],
          (n[2] + u[2] * su + v[2] * sv) * half[2],
        );
        _n.set(n[0], n[1], n[2]);
        if (quat) {
          _v.applyQuaternion(quat);
          _n.applyQuaternion(quat);
        }
        this.pos.push(_v.x + cx, _v.y + cy, _v.z + cz);
        this.nor.push(_n.x, _n.y, _n.z);
        this.col.push(color.r, color.g, color.b);
        this.face.push(su > 0 ? fw : 0, sv > 0 ? fh : 0, fw, fh);
        this.fx.push(fx[0], fx[1], fx[2]);
        this.count++;
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  /** Append any three.js geometry (transformed), without box-face detailing. */
  addGeometry(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color, fx: Fx) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const base = this.count;
    matrix.decompose(_v, _q, _n);
    const rot = _q.clone();
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      _n.fromBufferAttribute(nrm, i).applyQuaternion(rot).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(color.r, color.g, color.b);
      this.face.push(50, 50, 100, 100); // far from any edge: no rim, no seams
      this.fx.push(fx[0], fx[1], fx[2]);
      this.idx.push(base + i);
      this.count++;
    }
    if (g !== geo) g.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aFace', new THREE.Float32BufferAttribute(this.face, 4));
    g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.fx, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** One-off box geometry with world-material attributes (dynamic entities). */
export function boxGeometry(sx: number, sy: number, sz: number, color: THREE.Color, fx: Fx): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.addBox(0, 0, 0, sx, sy, sz, null, color, fx);
  return b.build();
}
