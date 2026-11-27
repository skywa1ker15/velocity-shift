/**
 * The runner's sword, "Shift Edge": a slim single-edged blade with a forward-swept tanto point
 * and a stepped spine notch (the "shift"), a light channel running up the fuller, an
 * asymmetric hex guard with a swept quillon on the edge side, a wrapped grip and a glowing
 * pommel core. Built from code like the rest of the runner, inked and cel-shaded.
 *
 * Local frame: +Y runs from the guard up the blade, +X is the cutting edge, the grip runs down
 * -Y. Blade 0.82 m, grip 0.22 m.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { lathe, PartBuilder, xf } from '../render/ink';

export const SWORD = {
  steel: 0xa9b6c8,
  edge: 0xf6f9ff,
  dark: 0x1a1e2b,
  guard: 0x2c3346,
  lacquer: 0x171b29,
  /** Where the hand grips the hilt (sword-local y). */
  grip: -0.105,
  bladeLength: 0.82,
};

const rbox = (x: number, y: number, z: number, r: number) =>
  new RoundedBoxGeometry(x, y, z, 1, Math.min(r, x / 2, y / 2, z / 2));

function shape(pts: [number, number][]) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

function extrude(pts: [number, number][], depth: number, bevel: number) {
  const g = new THREE.ExtrudeGeometry(shape(pts), {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 1,
    curveSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** The hilt: guard, grip, wraps and pommel. */
function addHilt(b: PartBuilder, M?: THREE.Matrix4) {
  const o = SWORD;
  const T = (m: THREE.Matrix4 | null) => (M ? M.clone().multiply(m ?? new THREE.Matrix4()) : m);
  b.add(new THREE.CylinderGeometry(0.036, 0.04, 0.014, 6), T(xf(0.004, 0, 0, 0, Math.PI / 6)), o.guard)
    // swept quillon on the edge side, a short spur on the spine side
    .add(rbox(0.062, 0.012, 0.016, 0.004), T(xf(0.05, 0.016, 0, 0, 0, 0.55)), o.guard)
    .add(rbox(0.026, 0.01, 0.014, 0.003), T(xf(-0.036, -0.006, 0, 0, 0, -0.4)), o.guard)
    .add(new THREE.TorusGeometry(0.028, 0.0035, 4, 12), T(xf(0.004, 0.009, 0, Math.PI / 2)), o.guard, {
      accent: true,
      noInk: true,
    })
    // a tapered grip
    .add(
      lathe(
        [
          [0.0145, -0.205],
          [0.0172, -0.15],
          [0.0168, -0.06],
          [0.0152, -0.008],
        ],
        8,
        1,
        0.82,
      ),
      T(null),
      o.dark,
    )
    // pommel: a hex cap with a glowing core
    .add(new THREE.CylinderGeometry(0.019, 0.016, 0.028, 6), T(xf(0, -0.22, 0)), o.guard)
    .add(new THREE.OctahedronGeometry(0.011, 0), T(xf(0, -0.238, 0)), o.edge, { glow: 1.4, noInk: true });
  // diamond wraps: alternating accent and steel bands
  for (let i = 0; i < 5; i++) {
    const y = -0.03 - i * 0.036;
    b.add(
      new THREE.CylinderGeometry(0.0178, 0.0178, 0.009, 8),
      T(xf(0, y, 0, 0.18 * (i % 2 ? 1 : -1))),
      o.steel,
      {
        accent: i % 2 === 0,
        noInk: true,
      },
    );
  }
}

export function buildSword(): PartBuilder {
  const o = SWORD;
  const b = new PartBuilder();
  // blade body (spine side) and the bright cutting edge, sharing one straight seam
  b.add(
    extrude(
      [
        [-0.022, 0.0],
        [0.004, 0.0],
        [0.004, 0.7],
        [-0.012, 0.745],
        [-0.012, 0.625],
        [-0.022, 0.605],
      ],
      0.0055,
      0.0022,
    ),
    new THREE.Matrix4().makeScale(1.35, 1, 1),
    o.steel,
  ).add(
    extrude(
      [
        [0.004, 0.0],
        [0.0235, 0.0],
        [0.027, 0.64],
        [0.031, 0.705],
        [0.006, 0.82],
        [-0.012, 0.745],
        [0.004, 0.7],
      ],
      0.0035,
      0.0018,
    ),
    new THREE.Matrix4().makeScale(1.35, 1, 1),
    o.edge,
  );
  // light channel along the fuller, both faces
  for (const z of [-0.0048, 0.0048])
    b.add(rbox(0.0042, 0.5, 0.0016, 0.0008), xf(-0.011, 0.33, z), o.edge, { glow: 1.1, noInk: true });
  // the "shift" notch gets an accent tick
  b.add(rbox(0.012, 0.006, 0.0075, 0.001), xf(-0.017, 0.615, 0), o.edge, { accent: true, noInk: true });
  addHilt(b);
  return b;
}

/** The back scabbard with the hilt sticking out of it (for the third-person runner). */
export function buildSheathed(): PartBuilder {
  const o = SWORD;
  const b = new PartBuilder();
  b.add(
    extrude(
      [
        [-0.03, 0.0],
        [0.034, 0.0],
        [0.038, 0.66],
        [0.04, 0.72],
        [0.008, 0.85],
        [-0.024, 0.77],
        [-0.03, 0.62],
      ],
      0.026,
      0.004,
    ),
    xf(0, 0, 0, 0, 0, Math.PI),
    o.lacquer,
  )
    // throat collar, two clasps and a light stripe down the scabbard
    .add(rbox(0.078, 0.03, 0.036, 0.008), xf(0, -0.01, 0), o.guard)
    .add(rbox(0.082, 0.018, 0.038, 0.005), xf(0, -0.24, 0), o.guard)
    .add(rbox(0.08, 0.018, 0.038, 0.005), xf(0, -0.56, 0), o.guard)
    .add(rbox(0.008, 0.5, 0.004, 0.002), xf(0.012, -0.4, 0.016), o.edge, { accent: true, noInk: true });
  // the hilt rises out of the throat (sword-local: flip so the grip points up out of the mouth)
  addHilt(b, xf(0, 0.0, 0, 0, 0, Math.PI));
  return b;
}
