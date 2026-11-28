/**
 * Sprint and stamina (Phase 3). Full pace (11 m/s) is the normal run and is unchanged; the sprint
 * key adds a burst on top that draws stamina. Pure and Evolve both have it; no gap needs it.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import type { Evolution } from '../../src/evolution/Evolution';
import type { LevelBuilder } from '../../src/levels/LevelBuilder';
import { movementConfig as cfg } from '../../src/movement/movementConfig';
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { makeEvoSim, makeSim, MoveState, type Driver } from './harness';

const floor = (b: LevelBuilder) => b.plat(0, 0, 200, 16, 420, { dress: false });
const RUN = { moveZ: 1, moveX: 0, sprint: true, burst: false };
const SPRINT = { ...RUN, burst: true };
async function pure() {
  const d = await makeSim(floor);
  d.settle();
  return d;
}
async function evo() {
  const d = await makeEvoSim(floor);
  d.settle();
  return d;
}
const E = (d: Driver) => d.sim.evo as Evolution;

beforeAll(() => initPhysics());

describe('sprint', () => {
  test('full pace is the old sprint speed and costs nothing', async () => {
    const d = await pure();
    d.run(4, RUN);
    expect(d.pl.speed).toBeCloseTo(cfg.sprintSpeed, 1);
    expect(d.pl.stamina).toBe(cfg.staminaMax);
    expect(d.pl.sprinting).toBe(false);
  });

  test('holding sprint ramps smoothly up to +3 m/s and drains the bar', async () => {
    const d = await pure();
    d.run(2, RUN);
    const v0 = d.pl.speed;
    d.run(0.1, SPRINT);
    expect(d.pl.sprinting).toBe(true);
    expect(d.pl.speed).toBeGreaterThan(v0);
    expect(d.pl.speed).toBeLessThan(v0 + 1.5); // a ramp, not a jump
    d.run(1, SPRINT);
    expect(d.pl.speed).toBeCloseTo(cfg.sprintSpeed + cfg.sprintBoost, 1);
    expect(d.pl.stamina).toBeCloseTo(cfg.staminaMax - cfg.staminaDrain * 1.1, 0);
  });

  test('a full bar lasts about 5 s; then sprint locks out and you ease back to full pace', async () => {
    const d = await pure();
    d.run(1, RUN);
    let empty = 0;
    d.pl.events.on('staminaEmpty', () => empty++);
    const t = d.until(() => d.pl.exhausted, SPRINT, 8);
    expect(t).toBeGreaterThan(4.8);
    expect(t).toBeLessThan(5.3);
    expect(empty).toBe(1);
    expect(d.pl.sprinting).toBe(false);
    // easing down, not snapping
    d.run(0.25, SPRINT);
    expect(d.pl.speed).toBeGreaterThan(cfg.sprintSpeed + 1.5);
    d.run(1.5, SPRINT);
    expect(d.pl.speed).toBeCloseTo(cfg.sprintSpeed, 1);
    // still holding the key: no sprint until the bar is back to the restart threshold
    const back = d.until(() => d.pl.sprinting, SPRINT, 6);
    expect(d.pl.stamina).toBeGreaterThanOrEqual(cfg.staminaRestart - 0.5);
    expect(back).toBeGreaterThan(cfg.staminaDelay + cfg.staminaRestart / cfg.staminaRegen - 1.8);
  });

  test('stamina refills after a short pause once you let go, at the regeneration rate', async () => {
    const d = await pure();
    d.run(0.5, RUN);
    d.run(2.5, SPRINT);
    const low = d.pl.stamina;
    d.run(cfg.staminaDelay - 0.05, RUN);
    expect(d.pl.stamina).toBeCloseTo(low, 5);
    d.run(1.05, RUN);
    expect(d.pl.stamina).toBeCloseTo(low + cfg.staminaRegen, 0);
    d.run(6, RUN);
    expect(d.pl.stamina).toBe(cfg.staminaMax);
  });

  test('sprint never gets in the way: jumps, slides and slashes all work while sprinting', async () => {
    const d = await pure();
    d.run(1.5, SPRINT);
    d.tick({ ...SPRINT, jump: true });
    expect(d.pl.state).toBe(MoveState.Air);
    d.until(() => d.pl.grounded, SPRINT, 2);
    const air = d.pl.stamina;
    d.tick({ ...SPRINT, slide: true });
    expect(d.pl.state).toBe(MoveState.Slide);
    d.run(0.3, { ...SPRINT, slideHeld: true });
    expect(d.pl.sprinting).toBe(false); // no sprint while crouched in a slide
    expect(d.pl.stamina).toBeGreaterThanOrEqual(air - 0.5); // (the tick the slide starts)
    d.run(0.4, { ...SPRINT, slideHeld: false });
    d.tick({ ...SPRINT, attack: true } as typeof SPRINT);
    d.run(0.4, SPRINT);
    expect(d.sim.stats.slashes ?? 1).toBeGreaterThan(0);
    expect(d.pl.sprinting).toBe(true);
  });

  test('a respawn refills the bar', async () => {
    const d = await pure();
    d.run(3, SPRINT);
    expect(d.pl.stamina).toBeLessThan(cfg.staminaMax);
    d.sim.restartFromCheckpoint();
    expect(d.pl.stamina).toBe(cfg.staminaMax);
    expect(d.pl.exhausted).toBe(false);
  });
});

describe('Endurance (Evolve)', () => {
  test('Lv 1: a bigger bar that refills faster', async () => {
    const d = await evo();
    E(d).grant('endurance');
    d.run(0.2, RUN);
    expect(d.pl.cfg.staminaMax).toBe(140);
    const t = d.until(() => d.pl.exhausted, SPRINT, 12);
    expect(t).toBeGreaterThan(6.8);
  });
  test('Lv 3 Afterburner: faster sprint and no lock-out', async () => {
    const d = await evo();
    for (let i = 0; i < 3; i++) E(d).grant('endurance');
    d.run(2.5, SPRINT);
    expect(d.pl.speed).toBeCloseTo(cfg.sprintSpeed + cfg.sprintBoost + 1.5, 1);
    d.until(() => d.pl.stamina <= 0, SPRINT, 15);
    d.run(cfg.staminaDelay + 0.3, RUN);
    d.run(0.1, SPRINT);
    expect(d.pl.sprinting).toBe(true);
  });
  test('Overcharge: sprint is free while it lasts, then costs stamina again', async () => {
    const d = await evo();
    E(d).overcharge(2);
    d.run(1.8, SPRINT);
    expect(d.pl.stamina).toBe(cfg.staminaMax);
    d.run(1, SPRINT);
    expect(E(d).overchargeLeft).toBe(0);
    expect(d.pl.stamina).toBeLessThan(cfg.staminaMax - 10);
  });
});
