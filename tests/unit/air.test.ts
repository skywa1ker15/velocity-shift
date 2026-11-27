import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from '../../src/camera/CameraRig';
import { Body } from '../../src/character/Body';
import { Gait } from '../../src/character/Gait';
import { movementConfig as cfg } from '../../src/movement/movementConfig';
import { MoveState } from '../../src/movement/types';
import { defaultSettings, motionProfile } from '../../src/settings/settings';

const player = (o: Record<string, unknown> = {}) => ({
  state: MoveState.Run as MoveState,
  speed: 8,
  grounded: true,
  height: cfg.standHeight,
  pos: new THREE.Vector3(),
  prevPos: new THREE.Vector3(),
  vel: new THREE.Vector3(0, 0, -8),
  airTime: 0,
  wallSide: 1 as 1 | -1,
  vaultT: 0,
  ...o,
});

function landing(impact: number) {
  const body = new Body(new THREE.Scene(), new THREE.Scene());
  const cam = new CameraRig(new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera());
  const gait = new Gait();
  const m = motionProfile(defaultSettings);
  // standing still, so head bob does not mask the recovery
  const pl = player({ state: MoveState.Idle, speed: 0, vel: new THREE.Vector3() });
  const hand = () => (body as unknown as { arms: { spring: { p: THREE.Vector3 } }[] }).arms[0].spring.p;
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      gait.update(pl as never, 1 / 60, 0);
      cam.update(pl as never, 1, 1 / 60, 0, 0, 100, m, gait);
      body.update(pl as never, new THREE.Vector3(), gait, 1 / 60, 0, 0, 0);
    }
  };
  step(120);
  const eyeRest = cam.eye.y;
  const handRest = hand().y;
  cam.onLand(impact, 0);
  body.onLand(impact);
  let eyeLow = Infinity,
    handLow = Infinity,
    settleFrames = 0;
  for (let i = 0; i < 240; i++) {
    step(1);
    eyeLow = Math.min(eyeLow, cam.eye.y);
    handLow = Math.min(handLow, hand().y);
    if (Math.abs(cam.eye.y - eyeRest) > 0.012) settleFrames = i;
  }
  return { eyeDip: eyeRest - eyeLow, handDip: handRest - handLow, settleFrames, body };
}

describe('landings come in sizes', () => {
  const soft = landing(4),
    medium = landing(10),
    hard = landing(22);

  it('dip the view and the hands more the harder the landing', () => {
    expect(medium.eyeDip).toBeGreaterThan(soft.eyeDip);
    expect(hard.eyeDip).toBeGreaterThan(medium.eyeDip);
    expect(hard.handDip).toBeGreaterThan(soft.handDip);
  });

  it('take longer to recover from when harder', () => {
    expect(hard.settleFrames).toBeGreaterThan(soft.settleFrames);
  });

  it('always recover fully: the view returns to where it started', () => {
    const b = landing(24);
    expect(b.settleFrames).toBeLessThan(239);
  });

  it('scale with the master motion intensity (zero removes the impact)', () => {
    const cam = new THREE.PerspectiveCamera();
    const rig = new CameraRig(cam, new THREE.PerspectiveCamera());
    const gait = new Gait();
    const m = motionProfile({ ...defaultSettings, motionIntensity: 0 });
    const pl = player();
    for (let i = 0; i < 120; i++) rig.update(pl as never, 1, 1 / 60, 0, 0, 100, m, gait);
    const rest = rig.eye.y;
    rig.onLand(24, 0);
    let low = Infinity;
    for (let i = 0; i < 60; i++) {
      rig.update(pl as never, 1, 1 / 60, 0, 0, 100, m, gait);
      low = Math.min(low, rig.eye.y);
    }
    expect(rest - low).toBeLessThan(0.005);
  });
});

describe('landing anticipation', () => {
  it('lowers the view slightly and reaches the hands down as the ground nears', () => {
    const run = (brace: number) => {
      const body = new Body(new THREE.Scene(), new THREE.Scene());
      const cam = new CameraRig(new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera());
      const gait = new Gait();
      const m = motionProfile(defaultSettings);
      const pl = player({
        state: MoveState.Air,
        grounded: false,
        vel: new THREE.Vector3(0, -14, -6),
        airTime: 0.9,
      });
      body.brace = cam.brace = brace;
      for (let i = 0; i < 90; i++) {
        gait.update(pl as never, 1 / 60, 0);
        cam.update(pl as never, 1, 1 / 60, 0, 0, 100, m, gait);
        body.update(pl as never, new THREE.Vector3(), gait, 1 / 60, 0, 0, 0);
      }
      const a = (body as unknown as { arms: { spring: { p: THREE.Vector3 } }[] }).arms[0].spring.p;
      return { eye: cam.eye.y, handY: a.y };
    };
    const far = run(0),
      near = run(1);
    expect(near.eye).toBeLessThan(far.eye);
    expect(near.handY).toBeLessThan(far.handY);
  });
});

describe('airborne poses stay finite through the whole arc', () => {
  it('rises, floats at the apex, falls and brakes without a bad value', () => {
    const body = new Body(new THREE.Scene(), new THREE.Scene());
    const gait = new Gait();
    const pl = player({ state: MoveState.Air, grounded: false });
    const hand = (body as unknown as { arms: { spring: { p: THREE.Vector3 } }[] }).arms[0].spring.p;
    for (let i = 0; i < 180; i++) {
      pl.vel.y = 9 - i * 0.2; // 9 → -27
      pl.airTime = i / 60;
      body.brace = i > 150 ? 1 : 0;
      gait.update(pl as never, 1 / 60, 0);
      body.update(pl as never, new THREE.Vector3(), gait, 1 / 60, 0, 0, 0);
      expect(Number.isFinite(hand.x + hand.y + hand.z)).toBe(true);
    }
  });
});
