/**
 * The first-person arm as ONE skinned, inked mesh per arm.
 *
 * The old arm was ~13 rigid pieces (sleeve, cuff, forearm, palm, ten finger capsules) with a ball
 * hiding every joint. This is a single continuous surface bound to a 19-bone skeleton, so elbows,
 * wrists and knuckles bend smoothly, the forearm twists along its length, and the whole arm is
 * one draw call (two draws for both arms instead of ~26).
 *
 * Rest pose ("arm space"): the arm runs straight along +Y from the shoulder (y = 0): upper arm to
 * the elbow (0.29), forearm to the wrist (0.56), palm to the knuckles (~0.65), fingers beyond.
 * +Z is the back of the arm and hand (it faces the camera when the arm points forward), -Z the
 * palm. The thumb sits at -X for the right arm (toward the body) and mirrors for the left.
 *
 * Bones (index): 0 upper, 1 fore, 2 twist (mid-forearm, carries half the hand's roll),
 * 3 hand, then four fingers x 3 phalanges (4..15) and the thumb x 3 (16..18).
 *
 * Design: a long sleeve with a bold accent band and a rolled cuff, a gauntlet bracer with a swept
 * "shift fin" along the back of the forearm, a glove with a bone-white knuckle plate and a lit
 * knuckle line, and accent-painted fingertips. Outline weight varies per part: heavy on the big
 * sleeve forms, fine on the fingers, so the figure reads like inked line art.
 */
import * as THREE from 'three';
import { lathe, PartBuilder, xf } from '../render/ink';
import { outfit as o } from './Body';

export const ARM = { upper: 0.29, fore: 0.27 } as const;
const ELBOW = ARM.upper;
const WRIST = ARM.upper + ARM.fore;
const TWIST = ELBOW + ARM.fore / 2;
const KNUCKLE = WRIST + 0.09;

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface FingerRig {
  /** proximal, middle, distal */
  bones: [THREE.Bone, THREE.Bone, THREE.Bone];
  /** Rest splay (radians): outer fingers fan out more. */
  spread: number;
}

export interface ArmRig {
  side: 1 | -1;
  group: THREE.Group;
  mesh: THREE.SkinnedMesh;
  upper: THREE.Bone;
  fore: THREE.Bone;
  twist: THREE.Bone;
  hand: THREE.Bone;
  fingers: FingerRig[];
  thumb: FingerRig;
  geometry: THREE.BufferGeometry;
  skeleton: THREE.Skeleton;
}

/** Weights along the arm: upper → fore/twist → hand, soft at the elbow and the wrist. */
function armSkin(_x: number, y: number, _z: number, out: number[]) {
  const wU = 1 - ss(ELBOW - 0.045, ELBOW + 0.045, y);
  const wH = ss(WRIST - 0.035, WRIST + 0.04, y);
  const rest = Math.max(0, 1 - wU - wH);
  const f = ss(ELBOW + 0.04, TWIST + 0.035, y);
  out[0] = 0;
  out[1] = wU;
  out[2] = 1;
  out[3] = rest * (1 - f);
  out[4] = 2;
  out[5] = rest * f;
  out[6] = 3;
  out[7] = wH;
}

/** Weights along one finger chain whose first joint sits at (y0) and whose bones start at `b0`. */
function fingerSkin(b0: number, y0: number, l1: number, l2: number) {
  return (_x: number, y: number, _z: number, out: number[]) => {
    const t = y - y0;
    const hb = 1 - ss(-0.007, 0.012, t);
    const wP = 1 - ss(l1 - 0.007, l1 + 0.007, t);
    const wD = ss(l1 + l2 - 0.007, l1 + l2 + 0.007, t);
    const wM = Math.max(0, 1 - wP - wD);
    const k = 1 - hb;
    out[0] = 3;
    out[1] = hb;
    out[2] = b0;
    out[3] = k * wP;
    out[4] = b0 + 1;
    out[5] = k * wM;
    out[6] = b0 + 2;
    out[7] = k * wD;
  };
}

/** A tapered finger tube along +Y from its root: knuckle swell, slim middle, rounded tip. */
function fingerProfile(len: number, r: number, l: [number, number, number]): [number, number][] {
  const [l1, l2, l3] = l.map((v) => v * len) as [number, number, number];
  return [
    [r * 0.9, -0.006],
    [r * 1.02, 0.01],
    [r, l1 - 0.004],
    [r * 0.97, l1 + 0.003],
    [r * 0.93, l1 + l2 - 0.003],
    [r * 0.92, l1 + l2 + 0.004],
    [r * 0.78, l1 + l2 + l3 * 0.8],
    [r * 0.38, l1 + l2 + l3 + 0.003],
    [0, l1 + l2 + l3 + 0.006],
  ];
}

export function buildArm(side: 1 | -1, mat: THREE.Material): ArmRig {
  const group = new THREE.Group();
  const upper = new THREE.Bone();
  const fore = new THREE.Bone();
  const twist = new THREE.Bone();
  const hand = new THREE.Bone();
  fore.position.y = ELBOW;
  twist.position.y = TWIST;
  hand.position.y = WRIST;
  group.add(upper, fore, twist, hand);
  const bones: THREE.Bone[] = [upper, fore, twist, hand];

  const b = new PartBuilder();
  const SKIN = { skin: armSkin } as const;

  // ---- sleeve: long, slightly flared toward the shoulder, with a bold accent band and a cuff
  b.add(
    lathe(
      [
        [0.05, -0.02],
        [0.062, 0.04],
        [0.058, 0.12],
        [0.051, 0.22],
        [0.054, ELBOW],
        [0.051, 0.34],
        [0.0465, 0.4],
        [0.0445, 0.452],
      ],
      12,
      1,
      0.9,
    ),
    null,
    o.jacket,
    { tone: 'sleeve', inkW: 1.25, ...SKIN },
  )
    // accent band: a stitched stripe around the forearm
    .add(
      lathe(
        [
          [0.0496, 0.376],
          [0.0489, 0.386],
          [0.0481, 0.396],
        ],
        12,
        1,
        0.9,
      ),
      null,
      o.guard,
      { accent: true, noInk: true, ...SKIN },
    )
    // rolled cuff
    .add(
      lathe(
        [
          [0.0445, 0.444],
          [0.0495, 0.45],
          [0.052, 0.465],
          [0.0495, 0.48],
          [0.041, 0.487],
        ],
        12,
        1,
        0.9,
      ),
      null,
      o.cuff,
      { tone: 'trim', inkW: 1.1, ...SKIN },
    )
    // gauntlet: narrows from the cuff to the wrist, then runs on into the glove
    .add(
      lathe(
        [
          [0.0385, 0.47],
          [0.0385, 0.486],
          [0.0345, 0.515],
          [0.03, 0.54],
          [0.0275, WRIST],
          [0.0285, WRIST + 0.02],
        ],
        12,
        1,
        0.9,
      ),
      null,
      o.glove,
      { tone: 'glove', inkW: 0.9, ...SKIN },
    )
    // bracer plate on the back of the forearm + accent ring at its lower edge
    .add(
      lathe(
        [
          [0.0395, 0.496],
          [0.0365, 0.522],
          [0.033, 0.55],
        ],
        8,
        1,
        0.9,
        -1.15,
        2.3,
      ),
      null,
      o.guard,
      { tone: 'trim', inkW: 0.9, ...SKIN },
    )
    .add(
      lathe(
        [
          [0.0412, 0.491],
          [0.0412, 0.4965],
        ],
        12,
        1,
        0.9,
      ),
      null,
      o.guard,
      { accent: true, noInk: true, ...SKIN },
    );
  // the "shift fin": a swept blade along the back of the forearm, the arm's signature silhouette
  {
    const s = new THREE.Shape();
    s.moveTo(0.034, 0.47);
    s.lineTo(0.0625, 0.506);
    s.lineTo(0.058, 0.512);
    s.lineTo(0.037, 0.552);
    s.lineTo(0.03, 0.552);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.007, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -0.0035);
    b.add(g, xf(0, 0, 0, 0, -Math.PI / 2, 0), o.guard, { accent: true, inkW: 0.7, ...SKIN });
  }

  // ---- hand: tapered flat palm, knuckle plate on the back, lit knuckle line, thumb mound
  b.add(
    lathe(
      [
        [0.0285, WRIST - 0.004],
        [0.034, WRIST + 0.02],
        [0.0405, WRIST + 0.05],
        [0.0445, WRIST + 0.078],
        [0.043, WRIST + 0.094],
        [0.03, WRIST + 0.1],
        [0, WRIST + 0.102],
      ],
      14,
      1,
      0.44,
    ),
    null,
    o.glove,
    { tone: 'glove', inkW: 0.85, ...SKIN },
  )
    .add(
      lathe(
        [
          [0.0425, WRIST + 0.05],
          [0.0485, WRIST + 0.066],
          [0.0505, WRIST + 0.08],
          [0.0475, WRIST + 0.094],
        ],
        8,
        1,
        0.5,
        -0.95,
        1.9,
      ),
      null,
      o.guard,
      { tone: 'trim', inkW: 0.8, ...SKIN },
    )
    .add(
      lathe(
        [
          [0.0455, WRIST + 0.072],
          [0.047, WRIST + 0.078],
        ],
        4,
        1,
        0.5,
        -0.55,
        1.1,
      ),
      null,
      o.guard,
      { glow: 1, noInk: true, ...SKIN },
    )
    .add(
      new THREE.SphereGeometry(0.022, 10, 6),
      xf(side * -0.034, WRIST + 0.032, -0.008, 0, 0, 0, 1.3, 0.8, 1),
      o.glove,
      { tone: 'glove', inkW: 0.8, ...SKIN },
    );

  // ---- fingers: one tapered tube each (so the knuckles bend smoothly) + an accent-painted tip
  const fingers: FingerRig[] = [];
  const lens = [0.9, 1, 0.95, 0.78];
  const seg: [number, number, number] = [0.036, 0.026, 0.021];
  const makeFinger = (x0: number, y0: number, z0: number, len: number, r: number, spread: number) => {
    const b0 = bones.length;
    const l1 = seg[0] * len,
      l2 = seg[1] * len;
    const prox = new THREE.Bone();
    const mid = new THREE.Bone();
    const dist = new THREE.Bone();
    prox.position.set(x0, y0 - WRIST, z0);
    mid.position.y = l1;
    dist.position.y = l2;
    prox.add(mid);
    mid.add(dist);
    hand.add(prox);
    bones.push(prox, mid, dist);
    const skin = fingerSkin(b0, y0, l1, l2);
    const prof = fingerProfile(len, r, seg);
    const cut = l1 + l2 + 0.004;
    const body = prof.filter(([, t]) => t <= cut);
    const tip = [[r * 0.93, cut - 0.002], ...prof.filter(([, t]) => t > cut)] as [number, number][];
    b.add(lathe(body, 6, 1, 0.92), xf(x0, y0, z0), o.glove, { tone: 'glove', inkW: 0.6, skin }).add(
      lathe(tip, 6, 1, 0.92),
      xf(x0, y0, z0),
      o.guard,
      { accent: true, inkW: 0.6, skin },
    );
    fingers.push({ bones: [prox, mid, dist], spread });
    return fingers[fingers.length - 1];
  };
  for (let i = 0; i < 4; i++)
    makeFinger(side * (i - 1.5) * 0.0214, KNUCKLE, 0.001, lens[i], 0.0105, -side * (i - 1.5) * 0.16);
  const thumb = makeFinger(side * -0.05, WRIST + 0.034, 0.012, 1.05, 0.0122, side * 0.75);
  fingers.pop(); // the thumb is kept separately

  group.updateMatrixWorld(true);
  const geometry = b.build(0.0036);
  const skeleton = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(geometry, mat);
  mesh.frustumCulled = false;
  group.add(mesh);
  mesh.bind(skeleton, mesh.matrixWorld);
  return { side, group, mesh, upper, fore, twist, hand, fingers, thumb, geometry, skeleton };
}
