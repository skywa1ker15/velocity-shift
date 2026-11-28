/** Load a course the way the game does: its geometry plus the seeded slashable world. */
import { readFileSync } from 'node:fs';
import { withSlashables } from '../../src/gameplay/slashables';
import type { LevelEntry } from '../../src/levels/registry';
import type { Slot } from '../../src/evolution/slots';
import type { LevelData } from '../../src/levels/types';

export function slotsFor(id: string): Slot[] {
  try {
    return JSON.parse(readFileSync(`src/evolution/slots/${id}.json`, 'utf8')) as Slot[];
  } catch {
    return [];
  }
}

export async function loadCourse(entry: LevelEntry): Promise<LevelData> {
  const raw = (await entry.load()).build();
  return withSlashables(raw, slotsFor(entry.meta.id), entry.meta.seed);
}
