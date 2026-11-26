import { describe, expect, test } from 'vitest';
import { simulateAccumulator, SIM_DT, SIM_HZ } from '../../src/core/loop';
import {
  angleDelta,
  clamp,
  damp,
  formatTime,
  makeRng,
  moveToward,
  quatFromAxisAngle,
  quatFromEuler,
  quatMul,
  quatRotate,
  quatRotateInv,
  Spring,
  wrapAngle,
} from '../../src/core/math';

describe('fixed timestep', () => {
  test('the same wall-clock time produces the same number of ticks at any display rate', () => {
    const seconds = 10;
    const ticksAt = (fps: number) =>
      simulateAccumulator(Array.from({ length: Math.round(seconds * fps) }, () => 1 / fps));
    const expected = seconds * SIM_HZ;
    for (const fps of [30, 60, 75, 144, 165, 240, 360])
      expect(Math.abs(ticksAt(fps) - expected)).toBeLessThanOrEqual(1);
  });

  test('uneven frame times do not change the tick count', () => {
    const frames: number[] = [];
    let total = 0;
    const rnd = makeRng(5);
    while (total < 5) {
      const dt = 0.004 + rnd() * 0.03;
      frames.push(dt);
      total += dt;
    }
    expect(Math.abs(simulateAccumulator(frames) - total / SIM_DT)).toBeLessThanOrEqual(1);
  });

  test('a long hitch is clamped (no spiral of death)', () => {
    expect(simulateAccumulator([3])).toBe(Math.round(0.25 / SIM_DT));
  });
});

describe('math', () => {
  test('clamp, moveToward, damp', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(moveToward(0, 10, 3)).toBe(3);
    expect(moveToward(9, 10, 3)).toBe(10);
    const half = damp(0, 1, 10, 0.1);
    const twoSteps = damp(damp(0, 1, 10, 0.05), 1, 10, 0.05);
    expect(twoSteps).toBeCloseTo(half, 10); // frame-rate independent
  });

  test('angles wrap the short way', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 6);
    expect(angleDelta(3, -3)).toBeCloseTo(Math.PI * 2 - 6, 6);
  });

  test('quaternion rotation round-trips', () => {
    const q = quatMul(quatFromAxisAngle(0, 1, 0, 0.7), quatFromEuler(0.3, -0.2, 1.1));
    const v = { x: 1.5, y: -2, z: 0.25 };
    const back = quatRotateInv(q, quatRotate(q, v));
    expect(back.x).toBeCloseTo(v.x, 6);
    expect(back.y).toBeCloseTo(v.y, 6);
    expect(back.z).toBeCloseTo(v.z, 6);
    const r = quatRotate(quatFromAxisAngle(0, 1, 0, Math.PI / 2), { x: 0, y: 0, z: -1 });
    expect(r.x).toBeCloseTo(-1, 6);
  });

  test('springs settle and stay stable at very low frame rates', () => {
    for (const dt of [1 / 240, 1 / 60, 1 / 10, 0.25]) {
      const s = new Spring(170, 17);
      s.kick(-3);
      let peak = 0;
      for (let t = 0; t < 3; t += dt) peak = Math.max(peak, Math.abs(s.update(0, dt)));
      expect(peak).toBeLessThan(1);
      expect(Math.abs(s.x)).toBeLessThan(0.01);
    }
  });

  test('seeded rng is reproducible', () => {
    const a = makeRng(42),
      b = makeRng(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  test('formatTime', () => {
    expect(formatTime(0)).toBe('00:00.000');
    expect(formatTime(75.4321)).toBe('01:15.432');
    expect(formatTime(-1)).toBe('--:--.---');
  });
});
