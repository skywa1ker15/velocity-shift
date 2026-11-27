/**
 * Ghost of the personal-best run.
 *
 * Runs are recorded as position snapshots at 30 Hz (x, y, z, yaw) and replayed with
 * interpolation. Snapshots — rather than re-simulating inputs — mean a ghost can never drift or
 * break when movement tuning changes between versions. Stored per level in IndexedDB.
 */
import * as THREE from 'three';
import { Runner } from '../character/Runner';
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
  readonly group: THREE.Group;
  private data: Float32Array | null = null;
  private runner = new Runner(true);
  private speed = 0;
  private vy = 0;

  constructor(color: number) {
    // the ghost is the runner seen from outside: a translucent echo outlined in the suit colour
    this.group = this.runner.group;
    this.runner.setAccent(color);
    this.group.visible = false;
  }

  setColor(color: number) {
    this.runner.setAccent(color);
  }

  load(data: Float32Array | null) {
    this.data = data && data.length >= STRIDE * 2 ? data : null;
    this.group.visible = false;
  }

  get hasData() {
    return !!this.data;
  }

  /** Position the ghost for run time `t` seconds; hides it before the start and after its finish. */
  update(t: number, enabled: boolean, playerPos: THREE.Vector3, dt = 0) {
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
    // pose from the recorded motion itself: speed drives the stride, vertical speed the air pose
    const step = SAMPLE_TICKS / 120;
    this.speed = Math.hypot(d[b] - d[a], d[b + 2] - d[a + 2]) / step;
    this.vy = (d[b + 1] - d[a + 1]) / step;
    if (dt > 0) this.runner.update(dt, this.speed, this.vy);
    // fade out when it would block the view
    const dist = Math.hypot(x - playerPos.x, y - playerPos.y, z - playerPos.z);
    const fade = Math.min(1, Math.max(0, (dist - 1.5) / 3.5));
    this.runner.mat.userData.fade.value = fade;
    this.group.visible = fade > 0.02;
  }

  dispose() {
    this.runner.dispose();
  }
}
