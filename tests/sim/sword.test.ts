/**
 * Sword and destructibles, through the real simulation.
 *
 * The important guarantees: attacks are fast and chain; every slash type actually cuts what its
 * blade passes through (and not what it doesn't); drawing, swinging and cutting never change the
 * player's motion; breakables are never obstacles.
 */
import { describe, expect, it } from 'vitest';
import { makeSim, MoveState } from './harness';
import { bladeDir, Slash, SLASHES, SwordPhase, windupOf, AUTO_SHEATHE } from '../../src/gameplay/Sword';
import type { BreakableKind } from '../../src/levels/types';

const floor = (b: import('../../src/levels/LevelBuilder').LevelBuilder) => b.plat(0, 0, 60, 10, 140);

async function runway(kind: BreakableKind, x: number, y: number, z: number) {
  return makeSim((b) => {
    floor(b);
    b.breakable(kind, x, y, z);
  });
}

describe('sword state machine', () => {
  it('draws, idles, auto-sheathes', async () => {
    const d = await makeSim(floor);
    d.settle();
    d.tick({ sword: true });
    expect(d.sim.sword.phase).toBe(SwordPhase.Drawing);
    d.run(0.3);
    expect(d.sim.sword.phase).toBe(SwordPhase.Ready);
    d.run(AUTO_SHEATHE + 0.5);
    expect(d.sim.sword.phase).toBe(SwordPhase.Sheathed);
  });

  it('an attack from the sheath is a quick-draw that cuts within ~0.2 s', async () => {
    const d = await makeSim(floor);
    d.settle();
    d.tick({ attack: true });
    const sw = d.sim.sword;
    expect(sw.phase).toBe(SwordPhase.Attack);
    expect(sw.pose.fromSheath).toBe(true);
    expect(windupOf(sw.pose)).toBeLessThan(0.2);
  });

  it('chains a three-hit ground combo: horizontal, diagonal, vertical', async () => {
    const d = await makeSim(floor);
    d.settle();
    d.tick({ sword: true });
    d.run(0.3);
    const kinds: Slash[] = [];
    let serial = d.sim.sword.serial;
    for (let i = 0; i < 160; i++) {
      d.tick({ attack: i % 12 === 0 });
      if (d.sim.sword.serial !== serial) {
        serial = d.sim.sword.serial;
        kinds.push(d.sim.sword.pose.kind);
      }
    }
    expect(kinds.slice(0, 3)).toEqual([Slash.Horizontal, Slash.Diagonal, Slash.Vertical]);
  });

  it('sprinting from the sheath gives the running draw-cut; airborne gives the aerial slash', async () => {
    const d = await makeSim(floor);
    d.settle();
    d.until(() => d.pl.speed > 9, { moveZ: 1, sprint: true }, 4);
    d.tick({ moveZ: 1, sprint: true, attack: true });
    expect(d.sim.sword.pose.kind).toBe(Slash.Running);
    d.run(0.8, { moveZ: 1, sprint: true });
    d.tick({ moveZ: 1, sprint: true, jump: true });
    d.run(0.15, { moveZ: 1, sprint: true });
    expect(d.pl.grounded).toBe(false);
    d.tick({ moveZ: 1, sprint: true, attack: true });
    expect(d.sim.sword.pose.kind).toBe(Slash.Aerial);
  });

  it('blade direction is continuous through every attack', () => {
    for (let k = 0; k < SLASHES.length; k++) {
      for (const fromSheath of [false, true]) {
        const pose = { kind: k as Slash, mirror: 1, low: false, fromSheath };
        const s = SLASHES[k];
        const total = windupOf(pose) + s.active + s.recover;
        let prev = bladeDir(pose, 0, [0, 0, 0]).slice();
        for (let t = 1 / 240; t <= total; t += 1 / 240) {
          const b = bladeDir(pose, t, [0, 0, 0]);
          const dot = b[0] * prev[0] + b[1] * prev[1] + b[2] * prev[2];
          // no jump larger than ~35 degrees in a 1/240 s step (the fastest real swing peaks near
          // 26 degrees: a whip, not a teleport)
          expect(dot).toBeGreaterThan(Math.cos(0.61));
          prev = b.slice();
        }
      }
    }
  });
});

describe('cutting', () => {
  it('a standing horizontal slash cuts a target 2 m ahead at chest height', async () => {
    const d = await runway('target', 0, 0, 2.2);
    d.settle();
    d.tick({ attack: true });
    d.run(0.4);
    expect(d.sim.broken[0]).toBe(true);
    expect(d.sim.stats.cuts).toBe(1);
  });

  it('does not cut what the blade does not reach', async () => {
    const far = await runway('crate', 0, 0, 6);
    far.settle();
    far.tick({ attack: true });
    far.run(0.5);
    expect(far.sim.broken[0]).toBe(false);
    const behind = await runway('crate', 0, 0, -2);
    behind.settle();
    behind.tick({ attack: true });
    behind.run(0.5);
    expect(behind.sim.broken[0]).toBe(false);
  });

  it('the vertical strike cuts an object straight ahead and below eye level', async () => {
    const d = await runway('crate', 0, 0, 1.8);
    d.settle();
    d.tick({ sword: true });
    d.run(0.3);
    // horizontal, diagonal, then the vertical finisher
    for (let i = 0; i < 3; i++) {
      d.tick({ attack: true });
      d.run(0.12);
    }
    expect(d.sim.broken[0]).toBe(true);
  });

  it('the cut happens during the cutting window, not on the press', async () => {
    const d = await runway('target', 0, 0, 2);
    d.settle();
    d.tick({ attack: true });
    expect(d.sim.broken[0]).toBe(false);
    const t = d.until(() => d.sim.broken[0], {}, 1);
    const pose = d.sim.sword.pose;
    expect(t).toBeGreaterThan(windupOf(pose) - 0.02);
    expect(t).toBeLessThan(windupOf(pose) + SLASHES[pose.kind].active + 0.02);
  });

  it('running into an intact object smashes it and the run carries on unchanged', async () => {
    const d = await runway('barrier', 0, 0, 14);
    const ref = await makeSim(floor);
    d.settle();
    ref.settle();
    for (let i = 0; i < 240; i++) {
      d.tick({ moveZ: 1, sprint: true });
      ref.tick({ moveZ: 1, sprint: true });
    }
    expect(d.sim.broken[0]).toBe(true);
    expect(d.sim.stats.smashes).toBe(1);
    expect(d.pl.pos.z).toBeCloseTo(ref.pl.pos.z, 6);
    expect(d.pl.speed).toBeCloseTo(ref.pl.speed, 6);
  });

  it('slashing never changes the player motion (identical trajectory with or without attacks)', async () => {
    const make = () =>
      makeSim((b) => {
        floor(b);
        for (let z = 8; z < 100; z += 9) b.breakable('crate', 1.4, 0, z);
      });
    const a = await make(),
      b = await make();
    a.settle();
    b.settle();
    for (let i = 0; i < 900; i++) {
      const jump = i % 140 === 70;
      const slide = i % 300 === 200;
      a.tick({ moveZ: 1, sprint: true, jump, slide, attack: i % 17 === 0, sword: i === 450 });
      b.tick({ moveZ: 1, sprint: true, jump, slide });
      if (i % 50 === 0) {
        expect(a.pl.pos.x).toBe(b.pl.pos.x);
        expect(a.pl.pos.y).toBe(b.pl.pos.y);
        expect(a.pl.pos.z).toBe(b.pl.pos.z);
      }
    }
    expect(a.sim.stats.cuts).toBeGreaterThan(3);
    expect(a.sawSequence(MoveState.Sprint, MoveState.Air)).toBe(true);
  });

  it('a restart puts every object back; a death sheathes the sword', async () => {
    const d = await runway('target', 0, 0, 2.2);
    d.settle();
    d.tick({ attack: true });
    d.run(0.4);
    expect(d.sim.broken[0]).toBe(true);
    d.sim.restart();
    expect(d.sim.broken[0]).toBe(false);
    expect(d.sim.sword.phase).toBe(SwordPhase.Sheathed);
  });
});
