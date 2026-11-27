import { describe, expect, it } from 'vitest';
import { Gait } from '../../src/character/Gait';
import { MoveState } from '../../src/movement/types';

const pl = (o: Partial<{ grounded: boolean; speed: number; state: MoveState }>) =>
  ({ grounded: true, speed: 8, state: MoveState.Run, ...o }) as never;

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
