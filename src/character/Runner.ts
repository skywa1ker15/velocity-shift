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
import { createCharacterMaterial, lathe, PartBuilder, xf, type CharacterMaterial } from '../render/ink';
import { outfit as o } from './Body';
import { buildSheathed, buildSword, SWORD } from './SwordModel';

const rbox = (x: number, y: number, z: number, r: number) =>
  new RoundedBoxGeometry(x, y, z, 1, Math.min(r, x / 2, y / 2, z / 2));

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
  /** Sword carried in the hand (menu showcase) vs stowed on the back. */
  private backSword: THREE.Mesh | null = null;
  private heldSword: THREE.Group | null = null;
  private carry = 0;
  private swordPhase = 0;
  private swing = -1;
  private swingKind = 0;

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
          // hips: a rounded pelvis with a belt and a buckle light
          .add(
            lathe(
              [
                [0.14, -0.1],
                [0.17, -0.03],
                [0.165, 0.06],
                [0.14, 0.1],
                [0, 0.1],
              ],
              10,
              1.1,
              0.78,
            ),
            null,
            o.trouser,
          )
          .add(
            lathe(
              [
                [0.168, 0.07],
                [0.172, 0.11],
              ],
              10,
              1.1,
              0.78,
            ),
            null,
            o.strap,
            { noInk: true },
          )
          .add(rbox(0.07, 0.035, 0.012, 0.004), xf(0, 0.09, -0.125), o.guard, { glow: 1, noInk: true }),
      ),
    );
    this.chest.position.y = 0.12;
    this.chest.add(
      mesh(
        new PartBuilder()
          // a jacket: narrow at the waist, broad across the shoulders, with a raised collar
          .add(
            lathe(
              [
                [0.15, 0],
                [0.165, 0.12],
                [0.19, 0.27],
                [0.225, 0.36],
                [0.2, 0.44],
                [0.1, 0.5],
                [0, 0.51],
              ],
              12,
              1.12,
              0.62,
            ),
            null,
            o.jacket,
            { tone: 'sleeve' },
          )
          .add(
            lathe(
              [
                [0.17, 0.0],
                [0.175, 0.03],
              ],
              12,
              1.12,
              0.62,
            ),
            null,
            o.guard,
            { accent: true, noInk: true },
          )
          .add(
            lathe(
              [
                [0.09, 0.46],
                [0.115, 0.5],
                [0.1, 0.56],
                [0.08, 0.57],
              ],
              10,
              1,
              0.9,
            ),
            null,
            o.cuff,
            {
              tone: 'trim',
            },
          )
          .add(rbox(0.16, 0.22, 0.07, 0.02), xf(0, 0.28, 0.12), o.guard, { tone: 'trim' }), // back pack plate
      ),
    );
    this.head.position.y = 0.6;
    this.head.add(
      mesh(
        new PartBuilder()
          // hooded head: a taller hood with a peak, a visor band and a dark face opening
          .add(new THREE.SphereGeometry(0.125, 10, 8), xf(0, 0.09, 0.01, 0, 0, 0, 1, 1.12, 1.08), o.jacket, {
            tone: 'sleeve',
          })
          .add(new THREE.ConeGeometry(0.07, 0.14, 8), xf(0, 0.2, 0.1, -1.15), o.jacket, { tone: 'sleeve' })
          .add(rbox(0.2, 0.06, 0.12, 0.025), xf(0, 0.1, -0.08), o.guard, { glow: 1.2 })
          .add(rbox(0.16, 0.09, 0.08, 0.03), xf(0, 0.0, -0.06), o.cuff, { tone: 'trim' }),
      ),
    );
    this.chest.add(this.head);
    // scarf: four flat segments that widen toward the tail, streaming from the neck
    let parent: THREE.Object3D = this.chest;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      seg.position.set(i === 0 ? 0.06 : 0, i === 0 ? 0.5 : 0, i === 0 ? 0.11 : 0.19);
      seg.add(
        mesh(
          new PartBuilder().add(rbox(0.085 + i * 0.022, 0.02, 0.2, 0.008), xf(0, 0, 0.1), o.guard, {
            accent: true,
          }),
        ),
      );
      parent.add(seg);
      parent = seg;
      this.scarf.push(seg);
    }
    // the sword rides on the back in its scabbard: hilt over the right shoulder, tip at the left
    // hip, so it is always within reach of the right hand
    {
      const g = buildSheathed().build(0.005);
      this.geos.push(g);
      const sheath = new THREE.Mesh(g, this.mat);
      sheath.castShadow = !ghost;
      sheath.position.set(0.13, 0.5, 0.18);
      sheath.rotation.set(0.12, 0, -0.6);
      this.chest.add(sheath);
      this.backSword = sheath;
    }
    this.hips.add(this.chest);
    for (const side of [1, -1] as const) {
      // arm: tapered sleeve, rolled cuff, slim gauntlet with a bracer, mitt hand
      const upper = new THREE.Group();
      upper.position.set(side * 0.235, 0.42, 0);
      upper.add(
        mesh(
          new PartBuilder().add(
            lathe(
              [
                [0.046, -0.31],
                [0.05, -0.2],
                [0.059, -0.06],
                [0.056, 0.03],
                [0, 0.04],
              ],
              9,
              1,
              0.92,
            ),
            null,
            o.jacket,
            {
              tone: 'sleeve',
            },
          ),
        ),
      );
      const lower = new THREE.Group();
      lower.position.y = -0.29;
      lower.add(
        mesh(
          new PartBuilder()
            .add(
              lathe(
                [
                  [0.043, -0.17],
                  [0.048, -0.1],
                  [0.046, -0.02],
                  [0.046, 0.0],
                ],
                9,
                1,
                0.92,
              ),
              null,
              o.jacket,
              {
                tone: 'sleeve',
              },
            )
            .add(
              lathe(
                [
                  [0.038, -0.176],
                  [0.05, -0.168],
                  [0.052, -0.158],
                  [0.04, -0.15],
                ],
                9,
                1,
                0.92,
              ),
              null,
              o.cuff,
              {
                tone: 'sleeve',
              },
            )
            .add(
              lathe(
                [
                  [0, -0.335],
                  [0.026, -0.325],
                  [0.03, -0.28],
                  [0.036, -0.21],
                  [0.04, -0.17],
                ],
                9,
                1,
                0.92,
              ),
              null,
              o.glove,
              { tone: 'glove' },
            )
            .add(
              lathe(
                [
                  [0.034, -0.3],
                  [0.0345, -0.26],
                  [0.039, -0.24],
                ],
                9,
                1,
                0.92,
              ),
              null,
              o.guard,
              { tone: 'trim' },
            )
            .add(new THREE.SphereGeometry(0.05, 8, 6), xf(0, -0.375, 0, 0, 0, 0, 1, 1.12, 0.8), o.glove, {
              tone: 'glove',
            })
            .add(
              new THREE.CapsuleGeometry(0.016, 0.04, 2, 5),
              xf(side * -0.04, -0.36, -0.02, 0, 0, side * 0.5),
              o.glove,
              {
                tone: 'glove',
              },
            ),
        ),
      );
      if (side === 1 && !ghost) {
        // the blade in the right hand: grip at the fist, blade running on past it
        const g = buildSword().build(0.005);
        this.geos.push(g);
        const blade = new THREE.Mesh(g, this.mat);
        blade.castShadow = true;
        blade.position.y = -SWORD.grip;
        const hold = new THREE.Group();
        hold.position.set(0, -0.375, 0);
        hold.rotation.set(-1.25, 0, 0);
        hold.add(blade);
        hold.visible = false;
        lower.add(hold);
        this.heldSword = hold;
      }
      upper.add(lower);
      this.chest.add(upper);
      this.arms.push({ upper, lower, side });

      const thigh = new THREE.Group();
      thigh.position.set(side * 0.1, -0.04, 0);
      thigh.add(
        mesh(
          new PartBuilder()
            .add(
              lathe(
                [
                  [0.058, -0.46],
                  [0.072, -0.32],
                  [0.088, -0.12],
                  [0.087, 0.02],
                  [0, 0.03],
                ],
                9,
                1,
                0.95,
              ),
              null,
              o.trouser,
            )
            .add(rbox(0.012, 0.3, 0.05, 0.004), xf(side * 0.085, -0.23, 0), o.trouser, {
              accent: true,
              noInk: true,
            }),
        ),
      );
      const shin = new THREE.Group();
      shin.position.y = -0.46;
      shin.add(
        mesh(
          new PartBuilder()
            .add(
              lathe(
                [
                  [0.04, -0.44],
                  [0.046, -0.36],
                  [0.058, -0.16],
                  [0.062, 0.0],
                ],
                9,
                1,
                0.95,
              ),
              null,
              o.trouser,
            )
            .add(rbox(0.1, 0.11, 0.04, 0.015), xf(0, -0.03, -0.058), o.guard, { tone: 'trim' })
            .add(rbox(0.11, 0.05, 0.29, 0.02), xf(0, -0.445, -0.06), o.guard)
            .add(rbox(0.1, 0.07, 0.19, 0.03), xf(0, -0.4, -0.02), o.glove, { tone: 'glove' })
            .add(rbox(0.114, 0.022, 0.292, 0.008), xf(0, -0.475, -0.06), o.sole, { noInk: true }),
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
  setPalette(h: { sleeve: number; glove: number; trim: number }) {
    this.mat.userData.sleeve.value.set(h.sleeve);
    this.mat.userData.glove.value.set(h.glove);
    this.mat.userData.trim.value.set(h.trim);
  }

  private slide = 0;
  private wall = 0;

  /**
   * speed: horizontal m/s, vy: vertical m/s (drives the airborne pose).
   * pose: 'slide' drops the figure onto one hip, 'wallL' / 'wallR' tilts it off a wall.
   */
  /**
   * Mirror the simulation's sword state on the figure (menu showcase): phase 0 stowed, 1 drawing,
   * 2 ready, 3 attacking, 4 sheathing; `swing` is the attack's progress 0..1 (or -1), `kind` the slash.
   */
  setSword(phase: number, swing: number, kind: number) {
    this.swordPhase = phase;
    this.swing = swing;
    this.swingKind = kind;
  }

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
    this.poseSword(dt, sl);
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

  /** Right arm override while the blade is out: draw over the shoulder, carry, swing, sheathe. */
  private poseSword(dt: number, sl: number) {
    const held = this.heldSword;
    const arm = this.arms[0];
    if (!held || !arm) return;
    const on = this.swordPhase >= 1 && this.swordPhase <= 3 ? 1 : 0;
    this.carry = damp(this.carry, on, on ? 18 : 10, dt);
    const w = this.carry * (1 - sl);
    held.visible = this.carry > 0.35;
    if (this.backSword) this.backSword.visible = this.carry < 0.35;
    if (w < 0.01) return;
    // carry pose: forearm up and forward, blade raised
    let ux = 0.95,
      uz = 0.32,
      lx = 1.3;
    if (this.swordPhase === 1) {
      // drawing: hand comes up from behind the shoulder
      ux = 2.9;
      uz = 0.5;
      lx = 0.6;
    } else if (this.swing >= 0) {
      const p = this.swing;
      const k = this.swingKind;
      // cocked → follow-through poses per slash: [upper.x, upper.z, lower.x]
      const C: [number, number, number][] = [
        [1.1, 1.0, 1.0], // horizontal: out wide to the right…
        [2.9, 0.3, 0.5], // vertical: overhead…
        [2.5, 0.9, 0.7], // diagonal: high right…
        [-0.5, 0.5, 0.9], // running: back…
        [2.5, 0.9, 0.7], // aerial
      ];
      const F: [number, number, number][] = [
        [1.1, -0.9, 1.0], // …across the body
        [0.2, 0.2, 0.9], // …chopping down
        [0.5, -0.6, 1.1], // …cutting low across
        [1.6, -0.2, 0.7], // …forward
        [0.5, -0.6, 1.1],
      ];
      const a = C[k] ?? C[0],
        b = F[k] ?? F[0];
      // wind-up 0–0.3 holds the cocked pose, the cut 0.3–0.6 sweeps, then it eases home
      const cut = clamp((p - 0.3) / 0.3, 0, 1);
      const e = cut * cut * (3 - 2 * cut);
      const home = clamp((p - 0.6) / 0.4, 0, 1);
      const eh = home * home * (3 - 2 * home);
      const m = (i: 0 | 1 | 2, base: number) => (a[i] + (b[i] - a[i]) * e) * (1 - eh) + base * eh;
      ux = m(0, ux);
      uz = m(1, uz);
      lx = m(2, lx);
    }
    arm.upper.rotation.x += (ux - arm.upper.rotation.x) * w;
    arm.upper.rotation.z += (uz - arm.upper.rotation.z) * w;
    arm.lower.rotation.x += (lx - arm.lower.rotation.x) * w;
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
