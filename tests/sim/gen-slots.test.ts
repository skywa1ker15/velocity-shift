/**
 * Generates src/evolution/slots/<level>.json from each course's reference run.
 * Run with `npm run gen:slots` after changing a course; tests/sim/evolution.test.ts fails while
 * the files are out of date.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { Bot } from '../../src/gameplay/Bot';
import { Simulation } from '../../src/gameplay/Simulation';
import { levels } from '../../src/levels/registry';
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { recordSlots } from '../../src/evolution/slots';

describe.skipIf(!process.env.GEN_SLOTS)('generate collectible slots', () => {
  test.each(levels.map((l) => [l.meta.id, l] as const))('%s', async (id, entry) => {
    await initPhysics();
    const sim = new Simulation(entry.meta, (await entry.load()).build());
    const bot = new Bot(sim);
    const slots = recordSlots(sim, () => bot.step());
    expect(slots).not.toBeNull();
    writeFileSync(`src/evolution/slots/${id}.json`, JSON.stringify(slots) + '\n');
    const by: Record<string, number> = {};
    for (const s of slots!) by[s.k] = (by[s.k] ?? 0) + 1;
    console.log(id, slots!.length, JSON.stringify(by));
  });
});
