/**
 * Multiverse director: owns which universe is on screen, runs the transition front and feeds
 * every shader through the shared `mv` uniforms.
 *
 * It is purely visual. It reads the player's position and listens for checkpoints, but nothing
 * in the simulation reads it back, so shifts cannot change physics, timing, replays or medals.
 *
 * State machine: idle in universe A  →  shiftTo(B) starts a front at a point in the world; its
 * radius grows until the whole level (and the sky) is inside  →  B becomes the new A. While the
 * front travels both universes are drawn, split along the front.
 */
import * as THREE from 'three';
import type { EnvPreset } from '../environment/presets';
import { planRun, type RunPlan } from './plan';
import { mv, ROLE_COUNT } from './uniforms';
import {
  getUniverse,
  homeOf,
  UNIVERSE_IDS,
  type ScreenLook,
  type UniverseDef,
  type UniverseId,
} from './universes';

/** Radius of the front (metres) t seconds after a shift begins: slow to open, then it races away. */
export const frontRadius = (t: number) => 10 * t + 22 * t * t;
/** Past this radius everything, including the sky shell, is inside: the shift is complete. */
export const FRONT_DONE = 1300;

export interface Ambient {
  light: EnvPreset['light'];
  post: EnvPreset['post'];
}

const _c = new THREE.Color();
const _d = new THREE.Color();
const lerpHex = (a: number, b: number, k: number) => _c.set(a).lerp(_d.set(b), k).getHex();
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function mixAmbient(a: EnvPreset, b: EnvPreset, k: number): Ambient {
  if (k <= 0) return { light: a.light, post: a.post };
  if (k >= 1) return { light: b.light, post: b.post };
  const la = a.light,
    lb = b.light,
    pa = a.post,
    pb = b.post;
  return {
    light: {
      sun: lerpHex(la.sun, lb.sun, k),
      sunIntensity: lerp(la.sunIntensity, lb.sunIntensity, k),
      skyAmbient: lerpHex(la.skyAmbient, lb.skyAmbient, k),
      groundAmbient: lerpHex(la.groundAmbient, lb.groundAmbient, k),
      ambient: lerp(la.ambient, lb.ambient, k),
    },
    post: {
      exposure: lerp(pa.exposure, pb.exposure, k),
      bloom: lerp(pa.bloom, pb.bloom, k),
      bloomThreshold: lerp(pa.bloomThreshold, pb.bloomThreshold, k),
      vignette: lerp(pa.vignette, pb.vignette, k),
      saturation: lerp(pa.saturation, pb.saturation, k),
      contrast: lerp(pa.contrast, pb.contrast, k),
    },
  };
}

export interface DirectorHooks {
  /** Lights and grading changed (called only while they are actually changing). */
  ambient(a: Ambient): void;
  /** Screen treatment: both universes' looks and how far the camera is into B. */
  screen(a: ScreenLook, b: ScreenLook, k: number): void;
  /** The camera has just crossed into a universe: swap hands, particles, HUD theme, audio. */
  arrive(def: UniverseDef, env: EnvPreset, announce: boolean): void;
}

export class Director {
  plan: RunPlan | null = null;
  /** Universe at the camera right now. */
  here: UniverseDef = getUniverse('anime');
  /** false = stay in the home universe (setting / tests). */
  enabled = true;

  private level: EnvPreset | null = null;
  private levelId = '';
  private a: UniverseDef = getUniverse('anime');
  private b: UniverseDef = getUniverse('anime');
  private envA!: EnvPreset;
  private envB!: EnvPreset;
  private active = false;
  private t = 0;
  private inB = 0;
  private lastK = -1;
  private pending: { at: number; to: UniverseId; back: number; transition: number }[] = [];
  private clock = 0;
  private returnTo: { at: number; to: UniverseId; transition: number } | null = null;

  constructor(private hooks: DirectorHooks) {}

  get shifting() {
    return this.active;
  }
  get from() {
    return this.a;
  }
  get to() {
    return this.b;
  }
  /** 0..1 how far the camera is inside the arriving universe. */
  get blend() {
    return this.inB;
  }

  /** Begin a run: plan it from the seed and show the home universe everywhere. */
  begin(levelId: string, level: EnvPreset, seed: number, checkpoints: number, home?: UniverseId) {
    this.level = level;
    this.levelId = levelId;
    const h = home ?? homeOf(levelId);
    this.plan = this.enabled ? planRun(levelId, h, seed, checkpoints, UNIVERSE_IDS) : null;
    mv.uFrontP.value.w = (seed % 9973) / 9973;
    this.pending.length = 0;
    this.returnTo = null;
    this.clock = 0;
    this.snap(h);
  }

  /** Show one universe everywhere, immediately (level load, tests). */
  snap(id: UniverseId) {
    if (!this.level) return;
    this.a = this.b = getUniverse(id);
    this.envA = this.envB = this.a.env(this.level);
    this.active = false;
    this.t = 0;
    this.inB = 0;
    this.lastK = -1;
    this.write(this.a, this.envA, 'A');
    this.write(this.a, this.envA, 'B');
    mv.uUniOn.value = 0;
    mv.uInB.value = 0;
    mv.uFront.value.w = 0;
    this.here = this.a;
    this.hooks.arrive(this.a, this.envA, false);
    this.pushAmbient(true);
  }

  /** The simulation reached a checkpoint: fire whatever the plan holds for it. */
  checkpoint(index: number, pos: THREE.Vector3, forward: THREE.Vector3) {
    if (!this.plan || !this.enabled) return;
    for (const s of this.plan.shifts) {
      if (s.checkpoint === index) this.shiftAhead(s.to, pos, forward, s.transition);
    }
    for (const an of this.plan.anomalies) {
      if (an.checkpoint === index)
        this.pending.push({
          at: this.clock + an.delay,
          to: an.to,
          back: an.duration,
          transition: an.transition,
        });
    }
  }

  /** Open a shift a short way ahead of the player, so they run into it. */
  shiftAhead(to: UniverseId, pos: THREE.Vector3, forward: THREE.Vector3, transition = 0): boolean {
    _o.copy(pos).addScaledVector(forward, 13);
    _o.y += 1.2;
    return this.shiftTo(to, _o, transition);
  }

  /** Start a transition to another universe from a point in the world. */
  shiftTo(to: UniverseId, origin: THREE.Vector3, transition = 0): boolean {
    if (!this.level) return false;
    if (this.active) this.finish(); // a shift already under way completes at once
    const def = getUniverse(to);
    if (def === this.a) return false;
    this.b = def;
    this.envB = def.env(this.level);
    this.write(def, this.envB, 'B');
    mv.uFront.value.set(origin.x, origin.y, origin.z, 0);
    mv.uFrontP.value.x = transition;
    mv.uFrontP.value.z = 0;
    mv.uUniOn.value = 1;
    this.active = true;
    this.t = 0;
    this.inB = 0;
    return true;
  }

  private finish() {
    this.a = this.b;
    this.envA = this.envB;
    this.write(this.a, this.envA, 'A');
    mv.uUniOn.value = 0;
    mv.uInB.value = 0;
    mv.uFront.value.w = 0;
    this.active = false;
    this.inB = 0;
    this.lastK = -1;
    if (this.here !== this.a) {
      this.here = this.a;
      this.hooks.arrive(this.a, this.envA, true);
    }
    this.pushAmbient(true);
  }

  update(dt: number, cam: THREE.Vector3, forward: THREE.Vector3) {
    this.clock += dt;
    // anomalies wait for a quiet moment so they never cut a planned shift short
    if (!this.active && this.enabled) {
      if (this.returnTo && this.clock >= this.returnTo.at) {
        const r = this.returnTo;
        this.returnTo = null;
        this.shiftAhead(r.to, cam, forward, r.transition);
      } else if (!this.returnTo && this.pending.length && this.clock >= this.pending[0].at) {
        const an = this.pending.shift()!;
        const back = this.a.id;
        if (this.shiftAhead(an.to, cam, forward, an.transition))
          this.returnTo = { at: this.clock + an.back, to: back, transition: an.transition };
      }
    }
    if (!this.active) return;
    this.t += dt;
    const r = frontRadius(this.t);
    mv.uFront.value.w = r;
    mv.uFrontP.value.z = this.t;
    const f = mv.uFront.value;
    const dist = Math.hypot(cam.x - f.x, cam.y - f.y, cam.z - f.z);
    // the camera crosses the front over about a metre and a half
    const target = Math.min(1, Math.max(0, (r - dist) / 1.5 + 0.5));
    this.inB += (target - this.inB) * Math.min(1, dt * 9);
    if (Math.abs(target - this.inB) < 0.002) this.inB = target;
    mv.uInB.value = this.inB;
    if (this.inB > 0.5 && this.here !== this.b) {
      this.here = this.b;
      this.hooks.arrive(this.b, this.envB, true);
    } else if (this.inB <= 0.5 && this.here !== this.a) {
      this.here = this.a;
      this.hooks.arrive(this.a, this.envA, false);
    }
    this.pushAmbient(false);
    if (r > FRONT_DONE) this.finish();
  }

  private pushAmbient(force: boolean) {
    const k = this.active ? this.inB : 0;
    if (!force && Math.abs(k - this.lastK) < 0.001) return;
    this.lastK = k;
    this.hooks.ambient(mixAmbient(this.envA, this.envB, k));
    this.hooks.screen(this.a.screen, this.b.screen, k);
  }

  /** Copy one universe's look into the A or B uniform set. */
  private write(def: UniverseDef, env: EnvPreset, side: 'A' | 'B') {
    const A = side === 'A';
    (A ? mv.uUniA : mv.uUniB).value = def.index;
    const pal = (A ? mv.uPalA : mv.uPalB).value;
    const p = env.palette;
    const roles = [p.base, p.alt, p.dark, p.accent, p.glass, p.hazard, env.look.structure];
    for (let i = 0; i < ROLE_COUNT; i++) pal[i].set(roles[i]);
    const l = env.light;
    (A ? mv.uSunA : mv.uSunB).value.set(l.sun).multiplyScalar(l.sunIntensity / 2.2);
    (A ? mv.uAmbA : mv.uAmbB).value.set(l.skyAmbient).multiplyScalar(l.ambient * 0.42);
    const fogCol = (A ? mv.uFogColA : mv.uFogColB).value.set(env.fog.color);
    (A ? mv.uFogSunA : mv.uFogSunB).value.set(env.sky.sun).lerp(fogCol, 0.35);
    (A ? mv.uFogPA : mv.uFogPB).value.set(env.fog.density, env.fog.base, env.fog.falloff);
    const sky = (A ? mv.uSkyA : mv.uSkyB).value;
    sky[0].set(env.sky.top);
    sky[1].set(env.sky.horizon);
    sky[2].set(env.sky.bottom);
    sky[3].set(env.sky.sun);
  }

  /** Debug / tests. */
  describe() {
    return {
      level: this.levelId,
      seed: this.plan?.seed ?? null,
      here: this.here.id,
      from: this.a.id,
      to: this.b.id,
      shifting: this.active,
      radius: mv.uFront.value.w,
      blend: this.inB,
      plan: this.plan,
    };
  }
}

const _o = new THREE.Vector3();
