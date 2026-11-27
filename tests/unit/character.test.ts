import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildArm } from '../../src/character/ArmRig';
import { PartBuilder, lathe, xf } from '../../src/render/ink';

describe('skinned arm', () => {
  const mat = new THREE.MeshBasicMaterial();
  const rigs = ([1, -1] as const).map((s) => buildArm(s, mat));

  it('is one skinned mesh with 19 bones per arm', () => {
    for (const r of rigs) {
      expect(r.mesh).toBeInstanceOf(THREE.SkinnedMesh);
      expect(r.skeleton.bones.length).toBe(19);
      expect(r.fingers.length).toBe(4);
      for (const f of [...r.fingers, r.thumb]) expect(f.bones.length).toBe(3);
    }
  });

  it('weights every vertex (outline hull included) to a total of 1, with valid bone indices', () => {
    for (const r of rigs) {
      const w = r.geometry.getAttribute('skinWeight');
      const i = r.geometry.getAttribute('skinIndex');
      expect(w.count).toBe(r.geometry.getAttribute('position').count);
      for (let v = 0; v < w.count; v++) {
        const sum = w.getX(v) + w.getY(v) + w.getZ(v) + w.getW(v);
        expect(sum).toBeGreaterThan(0.999);
        expect(sum).toBeLessThan(1.001);
        for (const c of [i.getX(v), i.getY(v), i.getZ(v), i.getW(v)]) expect(c).toBeLessThan(19);
      }
    }
  });

  it('draws as the bind pose when the bones are at rest, and moves when a joint bends', () => {
    const r = rigs[0];
    r.group.updateMatrixWorld(true);
    r.skeleton.update();
    const tip = r.fingers[1].bones[2];
    const rest = tip.getWorldPosition(new THREE.Vector3()).clone();
    r.hand.rotation.x = -0.8;
    r.group.updateMatrixWorld(true);
    expect(tip.getWorldPosition(new THREE.Vector3()).distanceTo(rest)).toBeGreaterThan(0.02);
    r.hand.rotation.x = 0;
  });

  it('mirrors for the left arm: the thumb sits on the inside of each hand', () => {
    expect(rigs[0].thumb.bones[0].position.x).toBeLessThan(0);
    expect(rigs[1].thumb.bones[0].position.x).toBeGreaterThan(0);
  });
});

describe('PartBuilder', () => {
  it('scales the outline per piece and copies skin data to the hull', () => {
    const b = new PartBuilder();
    const skin = (_x: number, _y: number, _z: number, out: number[]) => {
      out[0] = 2;
      out[1] = 1;
    };
    b.add(
      lathe(
        [
          [0.1, 0],
          [0.1, 0.2],
          [0, 0.22],
        ],
        6,
      ),
      null,
      0xffffff,
      { skin, inkW: 1 },
    );
    b.add(
      lathe(
        [
          [0.1, 0],
          [0.1, 0.2],
          [0, 0.22],
        ],
        6,
      ),
      xf(1, 0, 0),
      0xffffff,
      { skin, inkW: 3 },
    );
    const g = b.build(0.01);
    const si = g.getAttribute('skinIndex');
    expect(si.count).toBe(g.getAttribute('position').count);
    for (let v = 0; v < si.count; v++) expect(si.getX(v)).toBe(2);
    // the hull of the thick piece sits further from its surface than the thin one's
    const pos = g.getAttribute('position');
    const n = pos.count / 2;
    const push = (v: number) =>
      Math.hypot(pos.getX(v + n) - pos.getX(v), pos.getY(v + n) - pos.getY(v), pos.getZ(v + n) - pos.getZ(v));
    expect(push(n - 3)).toBeGreaterThan(push(3) * 2);
  });
});
