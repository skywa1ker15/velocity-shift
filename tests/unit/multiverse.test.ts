import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getEnv } from '../../src/environment/presets';
import { Director, FRONT_DONE, frontRadius } from '../../src/multiverse/Director';
import { planRun } from '../../src/multiverse/plan';
import { mv } from '../../src/multiverse/uniforms';
import { getUniverse, UNIVERSE_IDS, type UniverseId } from '../../src/multiverse/universes';

const LIB: UniverseId[] = [
  'anime',
  'neon',
  'comic',
  'lowpoly',
  'psyche',
  'voxel',
  'ink',
  'painted',
  'synth',
  'corrupt',
];

describe('run planner', () => {
  it('is deterministic: same level + seed gives the same plan', () => {
    for (const seed of [1, 2, 77, 123456]) {
      expect(planRun('awakening', 'anime', seed, 8, LIB, 4)).toEqual(
        planRun('awakening', 'anime', seed, 8, LIB, 4),
      );
    }
  });

  it('varies between seeds and between levels', () => {
    const plans = new Set<string>();
    for (let seed = 1; seed <= 40; seed++)
      plans.add(JSON.stringify(planRun('awakening', 'anime', seed, 8, LIB, 4).shifts));
    expect(plans.size).toBeGreaterThan(25);
    expect(planRun('awakening', 'anime', 5, 8, LIB, 4).shifts).not.toEqual(
      planRun('momentum', 'anime', 5, 8, LIB, 4).shifts,
    );
  });

  it('every run shifts at least once, never to the universe it is already in, only at real checkpoints', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const cps of [1, 3, 8, 9]) {
        const p = planRun('verticality', 'neon', seed, cps, LIB, 4);
        expect(p.shifts.length).toBeGreaterThan(0);
        let cur: UniverseId = 'neon';
        let last = 0;
        for (const s of p.shifts) {
          expect(s.to).not.toBe(cur);
          expect(s.checkpoint).toBeGreaterThanOrEqual(1);
          expect(s.checkpoint).toBeLessThanOrEqual(cps);
          expect(s.checkpoint).toBeGreaterThan(last);
          expect(LIB).toContain(s.to);
          expect(s.transition).toBeGreaterThanOrEqual(0);
          expect(s.transition).toBeLessThan(4);
          cur = s.to;
          last = s.checkpoint;
        }
        for (const a of p.anomalies) {
          expect(a.checkpoint).toBeGreaterThanOrEqual(0);
          expect(a.checkpoint).toBeLessThanOrEqual(cps);
          expect(a.duration).toBeGreaterThan(1.5);
        }
      }
    }
  });

  it('the home universe stays dominant across many runs', () => {
    let home = 0,
      total = 0;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const p = planRun('awakening', 'painted', seed, 8, LIB, 4);
      let cur: UniverseId = 'painted';
      let at = 0;
      for (const s of [...p.shifts, { checkpoint: 9, to: cur, transition: 0 }]) {
        const span = s.checkpoint - at;
        if (cur === 'painted') home += span;
        total += span;
        seen.add(cur);
        cur = s.to;
        at = s.checkpoint;
      }
    }
    const share = home / total;
    expect(share).toBeGreaterThan(0.4); // more time at home than in any other single universe
    expect(share).toBeLessThan(0.8); // but the run really does travel
    expect(seen.size).toBe(LIB.length); // and every universe turns up
  });

  it('with only the home universe available there is nothing to plan', () => {
    const p = planRun('training', 'anime', 3, 9, ['anime'], 1);
    expect(p.shifts).toEqual([]);
    expect(p.anomalies).toEqual([]);
  });
});

describe('director', () => {
  const other = UNIVERSE_IDS.find((u) => u !== 'anime')!;
  const make = () => {
    const log: string[] = [];
    const d = new Director({
      ambient: () => log.push('ambient'),
      screen: () => log.push('screen'),
      arrive: (def) => log.push('arrive:' + def.id),
    });
    return { d, log };
  };
  const fwd = new THREE.Vector3(0, 0, -1);

  it('starts everywhere in the home universe with no front', () => {
    const { d, log } = make();
    d.begin('awakening', getEnv('awakening'), 9, 8, 'anime');
    expect(d.here.id).toBe('anime');
    expect(d.shifting).toBe(false);
    expect(mv.uUniOn.value).toBe(0);
    expect(mv.uUniA.value).toBe(0);
    expect(log).toContain('arrive:anime');
  });

  it('a shift sweeps past the camera, announces arrival once, and settles with B as the new A', () => {
    const { d, log } = make();
    d.begin('awakening', getEnv('awakening'), 9, 8, 'anime');
    log.length = 0;
    const cam = new THREE.Vector3(0, 2, 0);
    expect(d.shiftAhead(other, cam, fwd)).toBe(true);
    expect(d.shifting).toBe(true);
    expect(mv.uUniOn.value).toBe(1);
    expect(mv.uUniB.value).toBe(getUniverse(other).index);
    // origin is ahead of the camera, so the camera starts outside the front
    d.update(1 / 60, cam, fwd);
    expect(d.here.id).toBe('anime');
    let steps = 0;
    while (d.shifting && steps++ < 4000) d.update(1 / 60, cam, fwd);
    expect(d.shifting).toBe(false);
    expect(d.here.id).toBe(other);
    expect(mv.uUniOn.value).toBe(0);
    expect(mv.uUniA.value).toBe(getUniverse(other).index);
    expect(log.filter((l) => l === 'arrive:' + other).length).toBe(1);
    // and it took a sensible time: the whole level is covered within ten seconds
    expect(steps / 60).toBeLessThan(10);
    expect(frontRadius((steps + 2) / 60)).toBeGreaterThan(FRONT_DONE);
  });

  it('shifting to the current universe is refused; a second shift completes the first at once', () => {
    const { d } = make();
    d.begin('awakening', getEnv('awakening'), 9, 8, 'anime');
    const cam = new THREE.Vector3();
    expect(d.shiftAhead('anime', cam, fwd)).toBe(false);
    expect(d.shiftAhead(other, cam, fwd)).toBe(true);
    d.update(0.2, cam, fwd);
    expect(d.shiftAhead('anime', cam, fwd)).toBe(true); // back again mid-shift
    expect(d.from.id).toBe(other);
    expect(d.to.id).toBe('anime');
  });

  it('planned checkpoint shifts fire from the plan, and a disabled director never shifts', () => {
    const { d } = make();
    d.begin('awakening', getEnv('awakening'), 4, 8, 'anime');
    const plan = d.plan!;
    const cam = new THREE.Vector3();
    if (UNIVERSE_IDS.length > 1) {
      const first = plan.shifts[0];
      d.checkpoint(first.checkpoint, cam, fwd);
      expect(d.shifting).toBe(true);
      expect(d.to.id).toBe(first.to);
    }
    const off = make().d;
    off.enabled = false;
    off.begin('awakening', getEnv('awakening'), 4, 8, 'anime');
    for (let i = 1; i <= 8; i++) off.checkpoint(i, cam, fwd);
    for (let i = 0; i < 600; i++) off.update(1 / 60, cam, fwd);
    expect(off.shifting).toBe(false);
    expect(off.here.id).toBe('anime');
  });

  it('writes a full palette, fog and sky for both sides', () => {
    const { d } = make();
    d.begin('momentum', getEnv('momentum'), 2, 9, 'anime');
    const env = getEnv('momentum');
    expect(mv.uPalA.value[3].getHex()).toBe(env.palette.accent);
    expect(mv.uPalA.value[5].getHex()).toBe(env.palette.hazard);
    expect(mv.uFogPA.value.x).toBeCloseTo(env.fog.density);
    expect(mv.uSkyA.value[0].getHex()).toBe(env.sky.top);
  });
});
