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
    fx.setLook({ tint: null, ink: 0x0b0d14, streak: 1, hot: 1 });
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
