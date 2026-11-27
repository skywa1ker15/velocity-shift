import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Body } from '../../src/character/Body';
import { Gait } from '../../src/character/Gait';
import { MoveState } from '../../src/movement/types';

/** A stand-in for the movement controller with just what the body reads. */
const stub = () => ({
  state: MoveState.Run as MoveState,
  speed: 0,
  grounded: true,
  vel: { x: 0, y: 0, z: 0 },
  airTime: 0,
  wallSide: 1 as 1 | -1,
  vaultT: 0,
});

function rig() {
  const body = new Body(new THREE.Scene(), new THREE.Scene());
  const gait = new Gait();
  const pl = stub();
  const feet = new THREE.Vector3();
  const hand = () => (body as unknown as { arms: { spring: { p: THREE.Vector3 } }[] }).arms[0].spring.p;
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      pl.vel.z = -pl.speed;
      gait.update(pl as never, 1 / 60, 0);
      body.update(pl as never, feet, gait, 1 / 60, 0, 0, 0);
    }
  };
  return { body, pl, step, hand };
}

describe('body animation', () => {
  it('swings the hands further and harder at a sprint than at a jog', () => {
    const range = (speed: number) => {
      const r = rig();
      r.pl.speed = speed;
      r.step(60);
      let lo = Infinity,
        hi = -Infinity;
      for (let i = 0; i < 120; i++) {
        r.step(1);
        lo = Math.min(lo, r.hand().z);
        hi = Math.max(hi, r.hand().z);
      }
      return hi - lo;
    };
    expect(range(12)).toBeGreaterThan(range(5) * 1.3);
  });

  it('cross-fades into a slide instead of snapping: no frame jumps far, and the hand arrives', () => {
    const r = rig();
    r.pl.speed = 11;
    r.step(90);
    const before = r.hand().clone();
    r.pl.state = MoveState.Slide;
    let maxJump = 0;
    let prev = r.hand().clone();
    for (let i = 0; i < 90; i++) {
      r.step(1);
      maxJump = Math.max(maxJump, r.hand().distanceTo(prev));
      prev = r.hand().clone();
    }
    expect(maxJump).toBeLessThan(0.06); // metres per frame
    // the right hand ends up trailing at the slide pose (x ~ 0.37)
    expect(r.hand().x).toBeGreaterThan(0.3);
    expect(r.hand().distanceTo(before)).toBeGreaterThan(0.1);
  });

  it('stays finite through every state, including a mid-air state flip', () => {
    const r = rig();
    const states = [
      MoveState.Idle,
      MoveState.Run,
      MoveState.Sprint,
      MoveState.Slide,
      MoveState.Air,
      MoveState.Dash,
      MoveState.WallRun,
      MoveState.Vault,
      MoveState.Dead,
    ];
    r.pl.speed = 13;
    for (let k = 0; k < 3; k++)
      for (const st of states) {
        r.pl.state = st;
        r.pl.grounded = st !== MoveState.Air && st !== MoveState.Dash;
        r.step(7);
        const h = r.hand();
        expect(Number.isFinite(h.x + h.y + h.z)).toBe(true);
      }
  });

  it('listens to the arm sway setting: no sway means the arms ignore look movement', () => {
    const run = (armSway: number) => {
      const r = rig();
      r.body.setMotion({
        headBob: 1,
        roll: 1,
        shake: 1,
        speedFov: 1,
        speedLines: 1,
        screenFx: true,
        armSway,
        landing: 1,
        intensity: 1,
      });
      r.pl.state = MoveState.Idle;
      r.step(60);
      const rest = r.hand().clone();
      // a fast turn
      let yaw = 0;
      let worst = 0;
      for (let i = 0; i < 20; i++) {
        yaw += 0.12;
        r.body.update(r.pl as never, new THREE.Vector3(), new Gait(), 1 / 60, yaw, 0, 0);
        worst = Math.max(worst, r.hand().distanceTo(rest));
      }
      return worst;
    };
    expect(run(1)).toBeGreaterThan(run(0) + 0.005);
  });
});
