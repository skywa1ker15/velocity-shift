import { describe, expect, it } from 'vitest';
import { Gait } from '../../src/character/Gait';
import { MoveState } from '../../src/movement/types';

const pl = (o: Partial<{ grounded: boolean; speed: number; state: MoveState }>) =>
  ({ grounded: true, speed: 8, state: MoveState.Run, vel: { x: 0, y: 0, z: -8 }, ...o }) as never;

describe('Gait clock', () => {
  it('advances faster at higher speed, and only while the feet are cycling', () => {
    const slow = new Gait(),
      fast = new Gait();
    slow.update(pl({ speed: 4 }), 0.1);
    fast.update(pl({ speed: 14 }), 0.1);
    expect(fast.phase).toBeGreaterThan(slow.phase);
    const air = new Gait();
    air.update(pl({ grounded: false }), 0.1);
    expect(air.phase).toBe(0);
    expect(air.moving).toBe(false);
    const slide = new Gait();
    slide.update(pl({ state: MoveState.Slide }), 0.1);
    expect(slide.moving).toBe(false);
    const still = new Gait();
    still.update(pl({ speed: 0.2 }), 0.1);
    expect(still.phase).toBe(0);
  });

  it('keeps its phase through an airborne gap (no restart at the landing)', () => {
    const g = new Gait();
    g.update(pl({}), 0.2);
    const p = g.phase;
    g.update(pl({ grounded: false }), 0.5);
    expect(g.phase).toBe(p);
  });
});

const mover = (
  o: Partial<{ grounded: boolean; speed: number; state: MoveState; vx: number; vz: number }>,
) => {
  const speed = o.speed ?? 8;
  return {
    grounded: true,
    state: MoveState.Run,
    speed,
    vel: { x: o.vx ?? 0, y: 0, z: o.vz ?? -speed },
    ...o,
  } as never;
};

describe('Gait read-out', () => {
  it('moves smoothly from jog to sprint to top speed', () => {
    const at = (v: number) => {
      const g = new Gait();
      g.update(mover({ speed: v }), 0.016);
      return g;
    };
    expect(at(4).jog).toBeGreaterThan(0.9);
    expect(at(4).sprint).toBe(0);
    expect(at(11.5).sprint).toBeGreaterThan(0.95);
    expect(at(11.5).top).toBe(0);
    expect(at(20).top).toBeGreaterThan(0.95);
    // monotonic across the range, no jumps
    let last = at(5).sprint;
    for (let v = 5; v <= 12; v += 0.25) {
      const k = at(v).sprint;
      expect(k).toBeGreaterThanOrEqual(last);
      expect(k - last).toBeLessThan(0.2);
      last = k;
    }
  });

  it('reads acceleration: positive pushing off, negative braking, zero when steady', () => {
    const g = new Gait();
    let v = 2;
    for (let i = 0; i < 30; i++) g.update(mover({ speed: (v += 0.3) }), 1 / 60);
    expect(g.accel).toBeGreaterThan(0.2);
    for (let i = 0; i < 60; i++) g.update(mover({ speed: 10 }), 1 / 60);
    expect(Math.abs(g.accel)).toBeLessThan(0.05);
    for (let i = 0; i < 30; i++) g.update(mover({ speed: (v -= 0.3) + 8 }), 1 / 60);
    expect(g.accel).toBeLessThan(-0.2);
    // never leaks out of range
    g.update(mover({ speed: 40 }), 1 / 60);
    expect(Math.abs(g.accel)).toBeLessThanOrEqual(1);
  });

  it('reads travel direction relative to the view: forward, backpedal, strafe', () => {
    const run = (vx: number, vz: number) => {
      const g = new Gait();
      for (let i = 0; i < 60; i++) g.update(mover({ speed: Math.hypot(vx, vz), vx, vz }), 1 / 60, 0);
      return g;
    };
    expect(run(0, -8).dirF).toBeGreaterThan(0.9); // yaw 0 looks toward -Z
    expect(run(0, 8).dirF).toBeLessThan(-0.9);
    expect(run(8, 0).dirR).toBeGreaterThan(0.9);
    expect(run(-8, 0).dirR).toBeLessThan(-0.9);
  });

  it('gives every step its own small variation, deterministically', () => {
    const sample = () => {
      const g = new Gait();
      const seen = new Set<number>();
      for (let i = 0; i < 400; i++) {
        g.update(mover({ speed: 10 }), 1 / 60);
        if (i % 20 === 19) seen.add(Math.round(g.vary * 100));
      }
      return [...seen];
    };
    const a = sample();
    expect(a.length).toBeGreaterThan(3);
    expect(sample()).toEqual(a);
  });
});
