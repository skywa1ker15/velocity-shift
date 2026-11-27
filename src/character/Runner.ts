/**
 * The runner seen from outside: a full-body illustrated figure in the same outfit as the
 * first-person arms (navy jacket, bone guards, accent trim, a scarf that streams with speed).
 * Used for the personal-best ghost and for the runner in the menu backdrop.
 *
 * Posed procedurally from how it is moving: stride and lean scale with speed, a rising body
 * drives a knee and both arms up, a falling one spreads its arms and trails its legs.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, damp } from '../core/math';
import { createCharacterMaterial, PartBuilder, xf, type CharacterMaterial } from '../render/ink';
import { outfit as o } from './Body';

const rbox = (x: number, y: number, z: number, r: number) =>
  new RoundedBoxGeometry(x, y, z, 2, Math.min(r, x / 2, y / 2, z / 2));
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 3, 8);

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
  side: 1 | -1;
}

export class Runner {
  readonly group = new THREE.Group();
  readonly mat: CharacterMaterial;
  private geos: THREE.BufferGeometry[] = [];
  private hips = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();
  private scarf: THREE.Group[] = [];
  private arms: Limb[] = [];
  private legs: Limb[] = [];
  private phase = 0;
  private air = 0;
  private lean = 0;
  private t = 0;

  constructor(ghost: boolean) {
    this.mat = createCharacterMaterial({ ghost });
    const ink = 0.012;
    const mesh = (b: PartBuilder) => {
      const g = b.build(ink);
      this.geos.push(g);
      const m = new THREE.Mesh(g, this.mat);
      m.castShadow = !ghost;
      return m;
    };
    // forward is -Z, like the player
    this.hips.position.y = 0.95;
    this.hips.add(
      mesh(
        new PartBuilder()
          .add(rbox(0.32, 0.2, 0.2, 0.06), null, o.trouser)
          .add(rbox(0.335, 0.05, 0.215, 0.012), xf(0, 0.09, 0), o.strap)
          .add(rbox(0.07, 0.035, 0.012, 0.004), xf(0, 0.09, -0.11), o.guard, { glow: 1 }),
      ),
    );
    this.chest.position.y = 0.12;
    this.chest.add(
      mesh(
        new PartBuilder()
          // a jacket that widens to the shoulders, with a raised collar and a chest stripe
          .add(rbox(0.36, 0.3, 0.22, 0.07), xf(0, 0.17, 0), o.jacket)
          .add(rbox(0.44, 0.2, 0.24, 0.08), xf(0, 0.37, 0), o.jacket)
          .add(rbox(0.2, 0.09, 0.2, 0.04), xf(0, 0.5, 0.01), o.cuff)
          .add(rbox(0.445, 0.03, 0.245, 0.01), xf(0, 0.33, 0), o.jacket, { accent: true })
          .add(rbox(0.14, 0.2, 0.06, 0.02), xf(0, 0.3, 0.13), o.guard), // back pack plate
      ),
    );
    this.head.position.y = 0.6;
    this.head.add(
      mesh(
        new PartBuilder()
          // hooded head with a visor band
          .add(new THREE.SphereGeometry(0.125, 12, 9), xf(0, 0.08, 0, 0, 0, 0, 1, 1.08, 1.05), o.jacket)
          .add(rbox(0.2, 0.06, 0.12, 0.025), xf(0, 0.09, -0.075), o.guard, { glow: 1.2 })
          .add(rbox(0.17, 0.1, 0.1, 0.03), xf(0, 0.0, -0.05), o.cuff),
      ),
    );
    this.chest.add(this.head);
    // scarf: three flat segments streaming from the neck
    let parent: THREE.Object3D = this.chest;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group();
      seg.position.set(i === 0 ? 0.06 : 0, i === 0 ? 0.5 : 0, i === 0 ? 0.11 : 0.2);
      seg.add(
        mesh(
          new PartBuilder().add(rbox(0.1 - i * 0.02, 0.022, 0.21, 0.008), xf(0, 0, 0.1), o.guard, {
            accent: true,
          }),
        ),
      );
      parent.add(seg);
      parent = seg;
      this.scarf.push(seg);
    }
    this.hips.add(this.chest);
    for (const side of [1, -1] as const) {
      // arm: sleeve, then gauntlet and glove with accent fingertips
      const upper = new THREE.Group();
      upper.position.set(side * 0.235, 0.42, 0);
      upper.add(mesh(new PartBuilder().add(capsule(0.055, 0.2), xf(0, -0.14, 0), o.jacket)));
      const lower = new THREE.Group();
      lower.position.y = -0.29;
      lower.add(
        mesh(
          new PartBuilder()
            .add(capsule(0.045, 0.17), xf(0, -0.12, 0), o.glove)
            .add(rbox(0.06, 0.12, 0.03, 0.01), xf(side * 0.04, -0.11, 0, 0, 0, 0), o.guard)
            .add(rbox(0.075, 0.09, 0.05, 0.02), xf(0, -0.29, 0), o.glove)
            .add(rbox(0.07, 0.04, 0.045, 0.015), xf(0, -0.345, 0), o.glove, { accent: true }),
        ),
      );
      upper.add(lower);
      this.chest.add(upper);
      this.arms.push({ upper, lower, side });

      const thigh = new THREE.Group();
      thigh.position.set(side * 0.1, -0.04, 0);
      thigh.add(
        mesh(
          new PartBuilder()
            .add(capsule(0.08, 0.3), xf(0, -0.23, 0), o.trouser)
            .add(rbox(0.012, 0.3, 0.05, 0.004), xf(side * 0.08, -0.23, 0), o.trouser, { accent: true }),
        ),
      );
      const shin = new THREE.Group();
      shin.position.y = -0.46;
      shin.add(
        mesh(
          new PartBuilder()
            .add(new THREE.CylinderGeometry(0.07, 0.05, 0.42, 10, 1), xf(0, -0.21, 0), o.trouser)
            .add(rbox(0.1, 0.11, 0.04, 0.015), xf(0, -0.03, -0.055), o.guard)
            .add(rbox(0.07, 0.2, 0.026, 0.01), xf(0, -0.22, -0.056), o.guard)
            .add(rbox(0.11, 0.05, 0.29, 0.02), xf(0, -0.445, -0.06), o.guard)
            .add(rbox(0.1, 0.07, 0.19, 0.03), xf(0, -0.4, -0.02), o.glove)
            .add(rbox(0.114, 0.022, 0.292, 0.008), xf(0, -0.475, -0.06), o.sole),
        ),
      );
      thigh.add(shin);
      this.hips.add(thigh);
      this.legs.push({ upper: thigh, lower: shin, side });
    }
    this.group.add(this.hips);
  }

  setAccent(hex: number) {
    this.mat.userData.accent.value.set(hex);
  }

  private slide = 0;
  private wall = 0;

  /**
   * speed: horizontal m/s, vy: vertical m/s (drives the airborne pose).
   * pose: 'slide' drops the figure onto one hip, 'wallL' / 'wallR' tilts it off a wall.
   */
  update(dt: number, speed: number, vy: number, pose: 'run' | 'slide' | 'wallL' | 'wallR' = 'run') {
    this.slide = damp(this.slide, pose === 'slide' ? 1 : 0, 12, dt);
    this.wall = damp(this.wall, pose === 'wallL' ? -1 : pose === 'wallR' ? 1 : 0, 9, dt);
    this.t += dt;
    const sp = clamp(speed / 11, 0, 1.5);
    this.phase += dt * (4.2 + speed * 0.62);
    const airTarget = Math.abs(vy) > 2.2 ? 1 : 0;
    this.air = damp(this.air, airTarget, 10, dt);
    const rise = clamp(vy / 8, 0, 1) * this.air;
    const fall = clamp(-vy / 12, 0, 1) * this.air;
    const ground = 1 - this.air;
    this.lean = damp(this.lean, 0.1 + sp * 0.3 - fall * 0.25, 6, dt);

    const bounce = Math.abs(Math.sin(this.phase)) * 0.05 * sp * ground;
    const sl = this.slide;
    this.hips.position.y = 0.95 - 0.06 * sp * ground + bounce - sl * 0.6;
    this.hips.rotation.set(
      -this.lean * 0.6 * (1 - sl) + sl * 0.75,
      Math.sin(this.phase) * 0.14 * ground * (1 - sl),
      this.wall * 0.38,
    );
    this.chest.rotation.set(
      -this.lean * 0.7 * (1 - sl) + sl * 0.2,
      -Math.sin(this.phase) * 0.22 * ground * (1 - sl),
      0,
    );
    this.head.rotation.x = this.lean * 0.9; // eyes stay on the route

    for (const l of this.legs) {
      const ph = this.phase + (l.side > 0 ? 0 : Math.PI);
      const sw = Math.sin(ph);
      // rotation.x > 0 swings the limb forward (toward -Z)
      const run = sw * (0.45 + sp * 0.55);
      const lead = l.side > 0 ? 1 : 0;
      const airThigh = rise * (lead ? 1.25 : -0.35) + fall * (lead ? 0.35 : -0.5);
      l.upper.rotation.x = (run * ground + airThigh) * (1 - sl) + sl * (lead ? 1.5 : 0.9);
      const knee =
        (0.25 + Math.max(0, -Math.cos(ph)) * (0.9 + sp * 0.9)) * ground +
        (rise * (lead ? 1.5 : 0.8) + fall * 0.5);
      l.lower.rotation.x = -knee * (1 - sl) - sl * (lead ? 0.15 : 1.2);
    }
    for (const a of this.arms) {
      const ph = this.phase + (a.side > 0 ? Math.PI : 0);
      const sw = Math.sin(ph);
      const run = sw * (0.5 + sp * 0.6);
      a.upper.rotation.x =
        (run * ground + rise * 2.1 + fall * 2.4) * (1 - sl) - sl * (a.side > 0 ? 0.9 : -0.6);
      a.upper.rotation.z = a.side * (0.12 + fall * 0.9 + rise * 0.25);
      a.lower.rotation.x = (0.9 + sp * 0.5 + Math.max(0, sw) * 0.5) * ground + rise * 0.5 + fall * 0.3;
    }
    // scarf streams back with speed and whips on the stride
    for (let i = 0; i < this.scarf.length; i++) {
      const s = this.scarf[i];
      const wave = Math.sin(this.t * 9 - i * 1.1) * (0.08 + sp * 0.16);
      s.rotation.set(
        (i === 0 ? -0.9 + sp * 0.75 + this.lean * 0.6 : -0.12 + sp * 0.08) + wave * 0.6 - fall * 0.5,
        wave,
        0,
      );
    }
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
