import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { boxPart, clipPart, prismPart, type ConvexPart } from '../../src/render/convex';

/** Volume of a closed convex part (divergence theorem over fan-triangulated faces). */
function volume(p: ConvexPart) {
  let v = 0;
  for (const f of p.faces)
    for (let i = 1; i + 1 < f.length; i++) {
      const a = f[0],
        b = f[i],
        c = f[i + 1];
      v +=
        (a[0] * (b[1] * c[2] - b[2] * c[1]) -
          a[1] * (b[0] * c[2] - b[2] * c[0]) +
          a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6;
    }
  return v;
}

describe('convex cutting', () => {
  it('a box cut by an oblique plane splits into two closed halves that add up', () => {
    const box = boxPart(0.5, 0.3, 0.2, 0xffffff, new THREE.Matrix4().makeRotationY(0.4));
    const n: [number, number, number] = [0.6, 0.7, 0.38];
    const l = Math.hypot(...n);
    const nn = n.map((x) => x / l) as [number, number, number];
    const [f, b] = clipPart(box, nn, 0.05);
    expect(f && b).toBeTruthy();
    expect(volume(box)).toBeCloseTo(0.24, 5);
    expect(volume(f!) + volume(b!)).toBeCloseTo(volume(box), 5);
    expect(volume(f!)).toBeGreaterThan(0);
    expect(volume(b!)).toBeGreaterThan(0);
    // each half got exactly one cap over the cut
    expect(f!.caps!.size).toBe(1);
    expect(b!.caps!.size).toBe(1);
  });

  it('a plane that misses leaves the part whole on one side', () => {
    const p = prismPart(8, 0.3, 1, 0xffffff);
    const [f, b] = clipPart(p, [0, 1, 0], 5);
    expect(f).toBeNull();
    expect(volume(b!)).toBeCloseTo(volume(p), 6);
  });

  it('prism faces wind outward (positive volume)', () => {
    expect(volume(prismPart(6, 0.3, 0.8, 0xffffff, undefined, undefined, undefined, 0.17))).toBeGreaterThan(
      0,
    );
  });
});
