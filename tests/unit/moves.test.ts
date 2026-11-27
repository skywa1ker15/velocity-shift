import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from '../../src/camera/CameraRig';
import { Body } from '../../src/character/Body';
import { Gait } from '../../src/character/Gait';
import { SlashFx } from '../../src/fx/SlashFx';
import { FX } from '../../src/multiverse/universes';
import { movementConfig as cfg } from '../../src/movement/movementConfig';
import { MoveState } from '../../src/movement/types';
import { defaultSettings, motionProfile } from '../../src/settings/settings';

const player = (o: Record<string, unknown> = {}) => ({
  state: MoveState.WallRun as MoveState,
  speed: 10,
  grounded: false,
  height: cfg.standHeight,
  pos: new THREE.Vector3(),
  prevPos: new THREE.Vector3(),
  vel: new THREE.Vector3(0, 0, -10),
  airTime: 0.2,
  wallSide: 1 as 1 | -1,
  vaultT: 0,
  ...o,
});

describe('advanced move presentation', () => {
  it('every universe defines a sword trail look', () => {
    for (const fx of Object.values(FX)) {
      expect(fx.trail.streak).toBeGreaterThanOrEqual(0);
      expect(fx.trail.hot).toBeGreaterThan(0);
      expect(fx.trail.ink).toBeGreaterThanOrEqual(0);
      expect(fx.trail.style).toBeGreaterThanOrEqual(0);
    }
  });

  it('wall, vault and dash hooks keep the pose finite and settle', () => {
    const body = new Body(new THREE.Scene(), new THREE.Scene());
    const cam = new CameraRig(new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera());
    const gait = new Gait();
    const m = motionProfile(defaultSettings);
    const pl = player();
    const hand = () => (body as unknown as { arms: { spring: { p: THREE.Vector3 } }[] }).arms[0].spring.p;
    const step = (n: number) => {
      for (let i = 0; i < n; i++) {
        gait.update(pl as never, 1 / 60, 0);
        cam.update(pl as never, 1, 1 / 60, 0, 0, 100, m, gait);
        body.update(pl as never, new THREE.Vector3(), gait, 1 / 60, 0, 0, 0);
      }
    };
    step(60);
    body.onWallStart(1);
    body.onWallEnd();
    body.onVault();
    cam.onVault();
    body.onDashEnd();
    step(30);
    expect(Number.isFinite(hand().x + hand().y + hand().z)).toBe(true);
    expect(Number.isFinite(cam.eye.y)).toBe(true);
    step(180);
    const a = hand().clone();
    step(30);
    expect(hand().distanceTo(a)).toBeLessThan(0.05);
  });

  it('a universe trail look drives the slash material and the suit accent applies without one', () => {
    const fx = new SlashFx();
    const arc = (fx as unknown as { arcs: { mat: THREE.ShaderMaterial }[] }).arcs[0];
    fx.setAccent(new THREE.Color(0x112233));
    fx.setLook({ tint: null, ink: 0x0b0d14, streak: 1, hot: 1, style: 0 });
    expect(arc.mat.uniforms.uAccent.value.getHex()).toBe(0x112233);
    fx.setLook(FX.neon.trail);
    expect(arc.mat.uniforms.uAccent.value.getHex()).toBe(FX.neon.trail.tint);
    expect(arc.mat.uniforms.uInk.value.getHex()).toBe(FX.neon.trail.ink);
    fx.setAccent(new THREE.Color(0x445566)); // the tint outranks the suit accent
    expect(arc.mat.uniforms.uAccent.value.getHex()).toBe(FX.neon.trail.tint);
    fx.setLook(FX.anime.trail);
    expect(arc.mat.uniforms.uAccent.value.getHex()).toBe(0x445566);
  });
});

describe('sword arc framing', () => {
  it('every universe family gets its own stroke style, and the arc stays inside the view', () => {
    expect(new Set(Object.values(FX).map((f) => f.trail.style)).size).toBeGreaterThanOrEqual(8);
    const fx = new SlashFx();
    const arcs = (fx as unknown as { arcs: { pos: Float32Array }[] }).arcs;
    for (let kind = 0; kind < 3; kind++) {
      fx.spawn({ kind, mirror: kind === 1 ? -1 : 1, low: false, fromSheath: false } as never, kind + 1);
      const arc = arcs[kind];
      for (let i = 0; i < arc.pos.length; i += 3) {
        expect(Math.abs(arc.pos[i])).toBeLessThan(1.3);
        expect(Math.abs(arc.pos[i + 1])).toBeLessThan(0.9);
      }
    }
  });
});

describe('viewmodel camera follows the main camera', () => {
  const run = (m: ReturnType<typeof motionProfile>, baseFov: number, setup: (c: CameraRig) => void) => {
    const main = new THREE.PerspectiveCamera();
    const view = new THREE.PerspectiveCamera(68);
    const cam = new CameraRig(main, view);
    const gait = new Gait();
    const pl = player({ state: MoveState.Run, grounded: true, speed: 16, vel: new THREE.Vector3(0, 0, -16) });
    setup(cam);
    for (let i = 0; i < 90; i++) {
      gait.update(pl as never, 1 / 60, 0);
      cam.update(pl as never, 1, 1 / 60, 0, 0, baseFov, m, gait);
    }
    return view;
  };
  it('widens with speed, carries the FOV setting, and dips with a landing', () => {
    const m = motionProfile(defaultSettings);
    const v90 = run(m, 90, () => {}).fov;
    const v110 = run(m, 110, () => {}).fov;
    expect(v90).toBeGreaterThan(68);
    expect(v110).toBeGreaterThan(v90);
    const dipped = run(m, 90, (c) => c.onLand(1, 0));
    expect(Number.isFinite(dipped.position.y)).toBe(true);
  });
  it('Reduce Motion and zero intensity flatten the view roll/dip, leaving the FOV bounded', () => {
    const off = motionProfile({ ...defaultSettings, motionIntensity: 0 });
    const v = run(off, 90, (c) => c.onLand(1, 1));
    expect(Math.abs(v.rotation.z)).toBeLessThan(1e-3);
    expect(Math.abs(v.position.y)).toBeLessThan(1e-3);
    const rm = motionProfile({ ...defaultSettings, reduceMotion: true });
    const w = run(rm, 90, (c) => c.onLand(1, 1));
    expect(w.fov).toBeLessThan(80);
  });
});
