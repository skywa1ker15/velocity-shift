import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Body } from '../../src/character/Body';
import { Gait } from '../../src/character/Gait';
import { CameraRig } from '../../src/camera/CameraRig';
import { movementConfig as cfg } from '../../src/movement/movementConfig';
import { MoveState } from '../../src/movement/types';
import { motionProfile, defaultSettings } from '../../src/settings/settings';
import { FX, UNIVERSE_IDS } from '../../src/multiverse/universes';

const player = (o: Record<string, unknown> = {}) => ({
  state: MoveState.Sprint as MoveState,
  speed: 11,
  grounded: true,
  height: cfg.standHeight,
  pos: new THREE.Vector3(),
  prevPos: new THREE.Vector3(),
  vel: new THREE.Vector3(0, 0, -11),
  airTime: 0,
  wallSide: 1 as 1 | -1,
  wallNormal: new THREE.Vector3(),
  vaultT: 0,
  ...o,
});

describe('slide camera', () => {
  const run = (speed: number, boosted = false) => {
    const cam = new THREE.PerspectiveCamera(),
      view = new THREE.PerspectiveCamera();
    const rig = new CameraRig(cam, view);
    const gait = new Gait();
    const m = motionProfile(defaultSettings);
    const pl = player({ speed });
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) rig.update(pl as never, 1, 1 / 60, 0, 0, 100, m, gait);
    };
    tick(120);
    const stand = rig.eye.y;
    pl.state = MoveState.Slide;
    pl.height = cfg.slideHeight;
    rig.onSlideStart(boosted);
    let lowest = Infinity;
    for (let i = 0; i < 40; i++) {
      tick(1);
      lowest = Math.min(lowest, rig.eye.y);
    }
    tick(60);
    return { stand, lowest, settled: rig.eye.y, rig, tick, pl };
  };

  it('dives into the slide past its resting height, then settles lower than standing', () => {
    const r = run(12, true);
    expect(r.lowest).toBeLessThan(r.settled);
    expect(r.settled).toBeLessThan(r.stand - 0.6);
  });

  it('sits lower in a fast slide than a dying one', () => {
    expect(run(13).settled).toBeLessThan(run(4).settled);
  });

  it('rises past standing height when the slide ends, then settles back', () => {
    const r = run(8);
    r.pl.state = MoveState.Run;
    r.pl.height = cfg.standHeight;
    r.rig.onSlideEnd();
    let peak = -Infinity;
    for (let i = 0; i < 40; i++) {
      r.tick(1);
      peak = Math.max(peak, r.rig.eye.y);
    }
    r.tick(120);
    expect(r.rig.eye.y).toBeCloseTo(r.stand, 1);
    expect(peak).toBeGreaterThan(r.settled + 0.5);
  });

  it('scales its dive with the master motion intensity', () => {
    const dive = (k: number) => {
      const cam = new THREE.PerspectiveCamera();
      const rig = new CameraRig(cam, new THREE.PerspectiveCamera());
      const gait = new Gait();
      const m = motionProfile({ ...defaultSettings, motionIntensity: k });
      const pl = player({ state: MoveState.Slide, height: cfg.slideHeight });
      for (let i = 0; i < 200; i++) rig.update(pl as never, 1, 1 / 60, 0, 0, 100, m, gait);
      const rest = rig.eye.y;
      rig.onSlideStart(true);
      let low = Infinity;
      for (let i = 0; i < 40; i++) {
        rig.update(pl as never, 1, 1 / 60, 0, 0, 100, m, gait);
        low = Math.min(low, rig.eye.y);
      }
      return rest - low;
    };
    expect(dive(0)).toBeLessThan(0.005);
    expect(dive(1)).toBeGreaterThan(dive(0.5));
  });
});

describe('slide body', () => {
  it('throws the trailing hand back on entry and drives the hands forward on exit', () => {
    const body = new Body(new THREE.Scene(), new THREE.Scene());
    const gait = new Gait();
    const pl = player();
    const hand = () =>
      (body as unknown as { arms: { spring: { p: THREE.Vector3 } }[] }).arms[0].spring.p.clone();
    const step = (n: number) => {
      for (let i = 0; i < n; i++) {
        gait.update(pl as never, 1 / 60, 0);
        body.update(pl as never, new THREE.Vector3(), gait, 1 / 60, 0, 0, 0);
      }
    };
    step(90);
    const run = hand();
    pl.state = MoveState.Slide;
    body.onSlideStart(true);
    step(6);
    const early = hand();
    step(60);
    const full = hand();
    expect(early.z).toBeGreaterThan(run.z); // thrown back
    expect(full.y).toBeLessThan(run.y + 0.02);
    pl.state = MoveState.Run;
    body.onSlideEnd();
    step(6);
    expect(hand().z).toBeLessThan(full.z); // driving forward again
    expect(Number.isFinite(hand().x + hand().y + hand().z)).toBe(true);
  });
});

describe('universe slide effects', () => {
  it('every universe defines what a slide throws off', () => {
    for (const id of UNIVERSE_IDS) {
      const s = FX[id].slide;
      expect(s.size).toBeGreaterThan(0);
      expect(s.life).toBeGreaterThan(0);
      expect(s.rate).toBeGreaterThanOrEqual(0);
      if (s.rate > 0) expect(s.colors.length).toBeGreaterThanOrEqual(0);
    }
    // sparks are additive: ink drops them and relies on its dark dust
    expect(FX.ink.slide.rate).toBe(0);
    // slides read differently across universes
    const sigs = new Set(UNIVERSE_IDS.map((id) => JSON.stringify(FX[id].slide)));
    expect(sigs.size).toBeGreaterThanOrEqual(8);
  });
});
