/**
 * Level regression tests.
 *
 * 1. Reference run: the autopilot bot plays every level's main line through the real simulation
 *    with ordinary inputs. If it finishes without dying, the route physically works. Because the
 *    simulation is deterministic, the run is exactly reproducible — any level or movement change
 *    that breaks a route fails here.
 * 2. Integrity: structural rules every level must satisfy (fairness, content, data sanity).
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { TELEGRAPH_TIME } from '../../src/entities/Entities';
import { envPresets } from '../../src/environment/presets';
import { levels } from '../../src/levels/registry';
import { homeOf } from '../../src/multiverse/universes';
import type { LevelData } from '../../src/levels/types';
import { medalFor } from '../../src/progression/Progression';
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { botRun } from './botdebug';

const built = new Map<string, LevelData>();
beforeAll(async () => {
  await initPhysics();
  for (const l of levels) built.set(l.meta.id, (await l.load()).build());
});

describe.each(levels.map((l) => [l.meta.id, l] as const))('level %s', (id, entry) => {
  const m = entry.meta;

  test('reference run: the bot completes the main line without dying', async () => {
    const r = await botRun(id, 240);
    if (!r.finished || r.deaths) console.log(r.log.join('\n'));
    expect(r.finished).toBe(true);
    expect(r.deaths).toBe(0);
    // a clean main-line run earns gold but not the hidden top tier: medal times stay calibrated
    expect(medalFor(r.time, m.medals)).toBe(3);
  });

  test('the reference run is deterministic', async () => {
    const a = await botRun(id, 240);
    const b = await botRun(id, 240);
    expect(b.time).toBe(a.time);
    expect([b.sim.player.pos.x, b.sim.player.pos.y, b.sim.player.pos.z]).toEqual([
      a.sim.player.pos.x,
      a.sim.player.pos.y,
      a.sim.player.pos.z,
    ]);
  });

  test('medal times are ordered', () => {
    expect(m.medals.platinum).toBeLessThan(m.medals.gold);
    expect(m.medals.gold).toBeLessThan(m.medals.silver);
    expect(m.medals.silver).toBeLessThan(m.medals.bronze);
  });

  test('content: three collectibles, checkpoints, finish and a hidden route', () => {
    const d = built.get(id)!;
    expect(d.collectibles).toHaveLength(3);
    expect(new Set(d.collectibles.map((c) => c.id)).size).toBe(3);
    expect(d.checkpoints.length).toBeGreaterThanOrEqual(6);
    expect(d.finish.p[1]).toBeGreaterThan(-9999);
    if (!m.training) {
      expect(d.shortcuts.some((s) => s.hidden)).toBe(true);
      expect(m.objectives.some((o) => o.kind === 'hiddenRoute')).toBe(true);
    }
    expect(m.objectives.length).toBeGreaterThanOrEqual(2);
  });

  test('checkpoints follow the route in order and are spaced for quick retries', () => {
    const d = built.get(id)!;
    const z = d.checkpoints.map((c) => c.p[2]);
    for (let i = 1; i < z.length; i++) {
      expect(z[i]).toBeGreaterThan(z[i - 1]);
      expect(z[i] - z[i - 1]).toBeLessThan(85);
    }
    expect(d.finish.p[2] - z[z.length - 1]).toBeLessThan(85);
  });

  test('fairness: anything that drops the player telegraphs for at least 0.75 s', () => {
    const d = built.get(id)!;
    for (const e of d.entities) {
      if (e.type === 'collapse') expect(e.delay ?? 0.9).toBeGreaterThanOrEqual(TELEGRAPH_TIME);
      if (e.type === 'blink') expect(e.onTime).toBeGreaterThan(TELEGRAPH_TIME + 0.3);
    }
  });

  test('every solid has a positive size and finite position', () => {
    const d = built.get(id)!;
    for (const s of d.solids) {
      for (const v of [...s.p, ...s.s]) expect(Number.isFinite(v)).toBe(true);
      for (const v of s.s) expect(v).toBeGreaterThan(0);
    }
    expect(d.solids.length).toBeGreaterThan(10);
  });
});

test('there are eight courses plus training, each with its own look and home universe', () => {
  expect(levels.filter((l) => !l.meta.training)).toHaveLength(8);
  expect(levels.filter((l) => l.meta.training)).toHaveLength(1);
  expect(new Set(levels.map((l) => l.meta.env)).size).toBe(levels.length);
  for (const l of levels) expect(envPresets[l.meta.env], l.meta.id).toBeDefined();
  expect(new Set(levels.map((l) => homeOf(l.meta.id))).size).toBe(levels.length);
  // indices are the unlock order
  levels.forEach((l, i) => expect(l.meta.index).toBe(i));
});
