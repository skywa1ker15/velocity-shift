/** Shared helpers for headless simulation tests: build a tiny world, feed scripted input. */
import { LevelBuilder } from '../../src/levels/LevelBuilder';
import type { LevelMeta } from '../../src/levels/types';
import { Simulation } from '../../src/gameplay/Simulation';
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { emptyInput, MoveState, type InputFrame } from '../../src/movement/types';

export const FWD = Math.PI; // yaw that looks toward +Z

export const testMeta = (over: Partial<LevelMeta> = {}): LevelMeta => ({
  id: 'test',
  index: 0,
  name: 'Test',
  subtitle: '',
  description: '',
  env: 'training',
  music: 'none',
  spawn: { p: [0, 0, 0], yaw: FWD },
  killY: -30,
  medals: { bronze: 4, silver: 3, gold: 2, platinum: 1 },
  objectives: [],
  seed: 1,
  ...over,
});

export async function makeSim(build: (b: LevelBuilder) => void, spawn: [number, number, number] = [0, 0, 0]) {
  await initPhysics();
  const b = new LevelBuilder();
  b.spawnCheckpoint(spawn[0], spawn[1], spawn[2], FWD);
  build(b);
  const sim = new Simulation(testMeta({ spawn: { p: spawn, yaw: FWD } }), b.data);
  return new Driver(sim);
}

export type Keys = Partial<
  Pick<InputFrame, 'moveX' | 'moveZ' | 'sprint' | 'jumpHeld' | 'slideHeld' | 'yaw' | 'pitch'>
> & {
  jump?: boolean; // press this tick
  dash?: boolean;
  slide?: boolean; // press + hold
};

export class Driver {
  inp: InputFrame = emptyInput();
  states: MoveState[] = [];
  constructor(public sim: Simulation) {
    this.inp.yaw = FWD;
  }
  get pl() {
    return this.sim.player;
  }
  /** Advance `seconds` with the given keys; one-shot presses fire on the first tick only. */
  run(seconds: number, keys: Keys = {}) {
    const n = Math.max(1, Math.round(seconds * 120));
    for (let i = 0; i < n; i++)
      this.tick(i === 0 ? keys : { ...keys, jump: false, dash: false, slide: undefined });
    return this;
  }
  tick(keys: Keys = {}) {
    const i = this.inp;
    if (keys.moveX !== undefined) i.moveX = keys.moveX;
    if (keys.moveZ !== undefined) i.moveZ = keys.moveZ;
    if (keys.sprint !== undefined) i.sprint = keys.sprint;
    if (keys.jumpHeld !== undefined) i.jumpHeld = keys.jumpHeld;
    if (keys.slideHeld !== undefined) i.slideHeld = keys.slideHeld;
    if (keys.yaw !== undefined) i.yaw = keys.yaw;
    if (keys.pitch !== undefined) i.pitch = keys.pitch;
    i.jumpPressed = !!keys.jump;
    if (keys.jump) i.jumpHeld = true;
    i.dashPressed = !!keys.dash;
    i.slidePressed = !!keys.slide;
    if (keys.slide) i.slideHeld = true;
    this.sim.tick(i);
    const s = this.pl.state;
    if (this.states[this.states.length - 1] !== s) this.states.push(s);
  }
  /** Tick until predicate is true (returns seconds taken, or -1 on timeout). */
  until(pred: () => boolean, keys: Keys = {}, max = 10): number {
    const n = Math.round(max * 120);
    for (let i = 0; i < n; i++) {
      this.tick(i === 0 ? keys : { ...keys, jump: false, dash: false, slide: undefined });
      if (pred()) return (i + 1) / 120;
    }
    return -1;
  }
  settle() {
    this.until(() => this.pl.grounded, {}, 3);
    this.states = [];
    return this;
  }
  sawSequence(...seq: MoveState[]): boolean {
    let k = 0;
    for (const s of this.states) if (s === seq[k]) k++;
    return k >= seq.length;
  }
}

export { MoveState };
