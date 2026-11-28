/**
 * Destructibles in the real levels: placed fairly, never in the way, never required — and the
 * sword is a real option on every course.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { levels } from '../../src/levels/registry';
import { Simulation } from '../../src/gameplay/Simulation';
import { Bot } from '../../src/gameplay/Bot';
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { BREAKABLE_SPECS } from '../../src/gameplay/breakables';
import type { LevelData, LevelMeta, SolidDef } from '../../src/levels/types';
import { quatFromEuler } from '../../src/core/math';
import { loadCourse } from './course';

const loaded: { meta: LevelMeta; data: LevelData }[] = [];
beforeAll(async () => {
  await initPhysics();
  for (const l of levels) loaded.push({ meta: l.meta, data: await loadCourse(l) });
});

/** Is world point p inside solid s (oriented box)? */
function inside(s: SolidDef, x: number, y: number, z: number, pad = 0.02) {
  let dx = x - s.p[0],
    dy = y - s.p[1],
    dz = z - s.p[2];
  const q = s.q
    ? { x: s.q[0], y: s.q[1], z: s.q[2], w: s.q[3] }
    : s.r
      ? quatFromEuler(s.r[0], s.r[1], s.r[2])
      : null;
  if (q) {
    // rotate by the inverse quaternion
    const qx = -q.x,
      qy = -q.y,
      qz = -q.z,
      qw = q.w;
    const tx = 2 * (qy * dz - qz * dy),
      ty = 2 * (qz * dx - qx * dz),
      tz = 2 * (qx * dy - qy * dx);
    const rx = dx + qw * tx + (qy * tz - qz * ty),
      ry = dy + qw * ty + (qz * tx - qx * tz),
      rz = dz + qw * tz + (qx * ty - qy * tx);
    dx = rx;
    dy = ry;
    dz = rz;
  }
  return (
    Math.abs(dx) < s.s[0] / 2 - pad && Math.abs(dy) < s.s[1] / 2 - pad && Math.abs(dz) < s.s[2] / 2 - pad
  );
}

describe('destructible placement', () => {
  it('every level has a set of destructibles suited to it', () => {
    const kinds: Record<string, string[]> = {
      training: ['target', 'barrier', 'crate'],
      awakening: ['column', 'relic'],
      verticality: ['panel', 'sign'],
      momentum: ['pylon', 'energy', 'crate'],
      breakpoint: ['crate', 'sign'],
      inkfalls: ['column', 'relic'],
      faceted: ['panel', 'crate'],
      blockfall: ['crate', 'energy'],
      core: ['pylon', 'energy'],
      shiftpoint: ['column', 'relic'],
    };
    for (const { meta, data } of loaded) {
      expect(data.breakables.length, meta.id).toBeGreaterThanOrEqual(8);
      for (const k of kinds[meta.id])
        expect(
          data.breakables.some((b) => b.kind === k),
          `${meta.id} ${k}`,
        ).toBe(true);
      const ids = new Set(data.breakables.map((b) => b.id));
      expect(ids.size).toBe(data.breakables.length);
    }
  });

  it('no destructible sits inside level geometry', () => {
    for (const { meta, data } of loaded) {
      for (const b of data.breakables) {
        const s = BREAKABLE_SPECS[b.kind];
        const k = b.scale ?? 1;
        const c = Math.cos(b.yaw ?? 0),
          sn = Math.sin(b.yaw ?? 0);
        for (const ix of [-1, 0, 1])
          for (const iy of [-1, 0, 1])
            for (const iz of [-1, 0, 1]) {
              const lx = ix * s.hx * k,
                lz = iz * s.hz * k;
              const x = b.p[0] + lx * c + lz * sn,
                y = b.p[1] + (s.cy + iy * s.hy * 0.95) * k,
                z = b.p[2] - lx * sn + lz * c;
              const hit = data.solids.find((so) => inside(so, x, y, z));
              expect(
                hit,
                `${meta.id} ${b.id} overlaps a solid at ${[x, y, z].map((v) => v.toFixed(2))}`,
              ).toBeUndefined();
            }
      }
    }
  });

  it('ground objects stand on a floor; nothing sits near a hazard or a checkpoint', () => {
    for (const { meta, data } of loaded) {
      const sim = new Simulation(meta, data);
      const hit = {} as import('../../src/movement/types').RayHit;
      for (const b of data.breakables) {
        if (b.ground !== undefined) {
          const ok = sim.physics.raycast(b.p[0], b.p[1] + 0.5, b.p[2], 0, -1, 0, 1.2, hit);
          expect(ok && Math.abs(0.5 - hit.dist) < 0.15, `${meta.id} ${b.id} floats`).toBe(true);
        }
        for (const e of data.entities) {
          if (!('p' in e)) continue;
          const p = (e as { p: [number, number, number] }).p;
          const lethal = e.type === 'hazard' || (e as { lethal?: boolean }).lethal;
          if (!lethal) continue;
          expect(Math.hypot(p[0] - b.p[0], p[2] - b.p[2]), `${meta.id} ${b.id} near hazard`).toBeGreaterThan(
            4,
          );
        }
        for (const cp of data.checkpoints.slice(1))
          expect(
            Math.hypot(cp.p[0] - b.p[0], cp.p[2] - b.p[2]),
            `${meta.id} ${b.id} on checkpoint`,
          ).toBeGreaterThan(2.5);
      }
      sim.dispose();
    }
  });
});

describe('the sword on the real courses', () => {
  it('slashing everything in reach never changes the route, and only braces may change the time', () => {
    for (const { meta, data } of loaded) {
      const run = (slash: boolean) => {
        const sim = new Simulation(meta, data);
        const bot = new Bot(sim);
        bot.autoSlash = slash;
        for (let i = 0; i < 260 * 120 && !sim.stats.finished; i++) sim.tick(bot.step());
        const r = {
          finished: sim.stats.finished,
          ticks: sim.stats.ticks,
          cuts: sim.stats.cuts,
          smashes: sim.stats.smashes,
          deaths: sim.stats.deaths,
          // the Director leaves out the variants of encounters above their tier: those never exist
          // and mechanisms (a bypass seal, a drawbridge chain, a gate's conduit) stand beside the
          // line on purpose: cutting them is a choice, not something the line brushes past
          present: data.breakables.filter((b, i) => sim.breakPresent[i] && !b.fires && b.kind !== 'conduit')
            .length,
        };
        sim.dispose();
        return r;
      };
      const plain = run(false),
        slash = run(true);
      expect(plain.finished, meta.id).toBe(true);
      expect(slash.finished, meta.id).toBe(true);
      // props never change the route; destructible architecture (a brace that brings a tower down)
      // is meant to be cut, and cutting it from sword range may only ever help
      // (cutting a solid prop next to the line changes the controller's contacts by a hair: on the
      // longer Phase 3 Core that costs 5 ticks, 0.04 s, so a tenth of a second is allowed)
      if (data.breakables.some((b) => b.fires))
        expect(slash.ticks, `${meta.id} time`).toBeLessThanOrEqual(plain.ticks + 12);
      else expect(slash.ticks, `${meta.id} time`).toBe(plain.ticks);
      expect(slash.deaths, meta.id).toBe(plain.deaths);
      // the line passes close enough that the blade can take most of them
      expect(slash.cuts, `${meta.id} cuts`).toBeGreaterThanOrEqual(Math.ceil(slash.present * 0.6));
      // and running the line without the sword never needs to touch them
      expect(plain.smashes, `${meta.id} smashes`).toBeLessThanOrEqual(1);
    }
  }, 600000);
});
