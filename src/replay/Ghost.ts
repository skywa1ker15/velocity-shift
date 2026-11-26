/**
 * Ghost of the personal-best run.
 *
 * Runs are recorded as position snapshots at 30 Hz (x, y, z, yaw) and replayed with
 * interpolation. Snapshots — rather than re-simulating inputs — mean a ghost can never drift or
 * break when movement tuning changes between versions. Stored per level in IndexedDB.
 */
import * as THREE from 'three';
import type { MovementController } from '../movement/MovementController';

const STRIDE = 4;
const SAMPLE_TICKS = 4; // 120 Hz / 4 = 30 Hz

export class GhostRecorder {
  private data: number[] = [];
  private tick = 0;

  reset() {
    this.data.length = 0;
    this.tick = 0;
  }

  /** Call once per simulation tick while the run timer is running. */
  sample(pl: MovementController) {
    if (this.tick++ % SAMPLE_TICKS === 0) this.data.push(pl.pos.x, pl.pos.y, pl.pos.z, pl.yaw);
  }

  toArray(): Float32Array {
    return new Float32Array(this.data);
  }
}

export class GhostPlayer {
  readonly group = new THREE.Group();
  private data: Float32Array | null = null;
  private mat: THREE.MeshBasicMaterial;
  private geos: THREE.BufferGeometry[] = [];

  constructor(color: number) {
    this.mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    // stylised runner silhouette: torso, head, a trailing fin
    const body = new THREE.Mesh(this.track(new THREE.CapsuleGeometry(0.22, 0.75, 3, 8)), this.mat);
    body.position.y = 0.95;
    const head = new THREE.Mesh(this.track(new THREE.OctahedronGeometry(0.17, 0)), this.mat);
    head.position.y = 1.68;
    const fin = new THREE.Mesh(this.track(new THREE.ConeGeometry(0.16, 1.1, 4)), this.mat);
    fin.position.set(0, 1.05, 0.55);
    fin.rotation.x = Math.PI / 2;
    this.group.add(body, head, fin);
    this.group.visible = false;
  }

  private track<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  setColor(color: number) {
    this.mat.color.set(color);
  }

  load(data: Float32Array | null) {
    this.data = data && data.length >= STRIDE * 2 ? data : null;
    this.group.visible = false;
  }

  get hasData() {
    return !!this.data;
  }

  /** Position the ghost for run time `t` seconds; hides it before the start and after its finish. */
  update(t: number, enabled: boolean, playerPos: THREE.Vector3) {
    const d = this.data;
    if (!d || !enabled || t <= 0) {
      this.group.visible = false;
      return;
    }
    const f = (t * 120) / SAMPLE_TICKS;
    const i = Math.floor(f);
    const n = d.length / STRIDE;
    if (i >= n - 1) {
      this.group.visible = false;
      return;
    }
    const k = f - i;
    const a = i * STRIDE,
      b = a + STRIDE;
    const x = d[a] + (d[b] - d[a]) * k,
      y = d[a + 1] + (d[b + 1] - d[a + 1]) * k,
      z = d[a + 2] + (d[b + 2] - d[a + 2]) * k;
    let dy = d[b + 3] - d[a + 3];
    if (dy > Math.PI) dy -= Math.PI * 2;
    else if (dy < -Math.PI) dy += Math.PI * 2;
    this.group.position.set(x, y, z);
    this.group.rotation.y = d[a + 3] + dy * k;
    // fade out when it would block the view
    const dist = Math.hypot(x - playerPos.x, y - playerPos.y, z - playerPos.z);
    this.mat.opacity = 0.34 * Math.min(1, Math.max(0, (dist - 1.2) / 3));
    this.group.visible = this.mat.opacity > 0.01;
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
