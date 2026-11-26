/**
 * Renderer: WebGL2 renderer, two scenes (world + first-person viewmodel), lighting, and a single
 * merged post-processing pass. Quality tiers live in render/quality.ts.
 *
 * The viewmodel (arms, speed lines) is drawn after the world with its own fixed-FOV camera and a
 * cleared depth buffer, so arms never clip into walls or stretch when the world FOV widens.
 * WebGL2 is the baseline; the class is the only place that touches THREE.WebGLRenderer, so a
 * WebGPURenderer can be swapped in later.
 */
import * as THREE from 'three';
import {
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  ClearPass,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { EnvPreset } from '../environment/presets';
import { Sky } from './Sky';
import { worldUniforms } from './WorldMaterial';
import { tiers, type Tier, type TierName } from './quality';

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly viewScene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(95, 1, 0.08, 2000);
  readonly viewCamera = new THREE.PerspectiveCamera(68, 1, 0.01, 10);
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  readonly viewSun = new THREE.DirectionalLight(0xffffff, 2);
  readonly viewHemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  tier: Tier = tiers.high;
  tierName: TierName = 'high';
  env!: EnvPreset;
  /** 0..1 dash distortion driven by the game. */
  dashFx = 0;
  contextLost = false;
  onContextLost: () => void = () => {};
  onContextRestored: () => void = () => {};

  private composer!: EffectComposer;
  private bloom!: BloomEffect;
  private chroma!: ChromaticAberrationEffect;
  private vignette!: VignetteEffect;
  private tone!: ToneMappingEffect;
  private grade!: HueSaturationEffect;
  private contrast!: BrightnessContrastEffect;
  private width = 1;
  private height = 1;
  private resolutionScale = 1;
  private brightness = 1;
  private postEnabled = true;
  private shadowsEnabled = true;
  private sunDir = new THREE.Vector3(0, 1, 0);

  constructor(readonly canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping; // tone mapping happens in the post pass
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.info.autoReset = false;

    this.scene.add(this.sky.mesh, this.hemi, this.sun, this.sun.target);
    this.viewScene.add(this.viewHemi, this.viewSun);
    this.viewSun.position.set(0.4, 1, 0.6);
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.onContextLost();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.buildComposer();
      this.onContextRestored();
    });
    this.buildComposer();
  }

  static isSupported(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!c.getContext('webgl2');
    } catch {
      return false;
    }
  }

  private buildComposer() {
    this.composer?.dispose();
    const t = this.tier;
    this.composer = new EffectComposer(this.gl, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new ClearPass(false, true, false));
    const viewPass = new RenderPass(this.viewScene, this.viewCamera);
    viewPass.clear = false;
    this.composer.addPass(viewPass);

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.8,
      luminanceSmoothing: 0.25,
      intensity: 0.6,
      radius: 0.72,
      levels: t.bloomLevels,
    });
    this.chroma = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0, 0),
      radialModulation: true,
      modulationOffset: 0.2,
    });
    this.vignette = new VignetteEffect({ darkness: 0.35, offset: 0.3 });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    this.grade = new HueSaturationEffect({ saturation: 0 });
    this.contrast = new BrightnessContrastEffect({ brightness: 0, contrast: 0 });

    const effects = [];
    if (t.bloom && this.postEnabled) effects.push(this.bloom);
    if (this.postEnabled) effects.push(this.vignette);
    effects.push(this.tone, this.grade, this.contrast);
    this.composer.addPass(new EffectPass(this.camera, ...effects));
    // convolution effects need their own pass
    if (this.postEnabled && t.chroma) this.composer.addPass(new EffectPass(this.camera, this.chroma));
    if (t.smaa)
      this.composer.addPass(
        new EffectPass(
          this.camera,
          new SMAAEffect({ preset: t.smaa === 2 ? SMAAPreset.HIGH : SMAAPreset.MEDIUM }),
        ),
      );
    this.applySize();
    if (this.env) this.applyEnvPost();
  }

  // ----- configuration ------------------------------------------------------------------
  configure(
    tierName: TierName,
    opts: { resolutionScale: number; shadows: boolean; postFx: boolean; brightness: number },
  ) {
    const changed = tierName !== this.tierName || opts.postFx !== this.postEnabled;
    this.tierName = tierName;
    this.tier = tiers[tierName];
    this.resolutionScale = opts.resolutionScale;
    this.postEnabled = opts.postFx;
    this.shadowsEnabled = opts.shadows;
    this.brightness = opts.brightness;
    const shadows = this.tier.shadowSize > 0 && opts.shadows;
    this.gl.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    if (shadows && this.sun.shadow.mapSize.x !== this.tier.shadowSize) {
      this.sun.shadow.mapSize.set(this.tier.shadowSize, this.tier.shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as any;
    }
    const r = this.tier.shadowRange;
    const sc = this.sun.shadow.camera;
    sc.left = -r;
    sc.right = r;
    sc.top = r;
    sc.bottom = -r;
    sc.updateProjectionMatrix();
    if (changed) this.buildComposer();
    else {
      this.applySize();
      if (this.env) this.applyEnvPost();
    }
  }

  setResolutionScale(s: number) {
    if (s === this.resolutionScale) return;
    this.resolutionScale = s;
    this.applySize();
  }
  get currentResolutionScale() {
    return this.resolutionScale;
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.applySize();
  }

  private applySize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.maxPixelRatio) * this.resolutionScale;
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
    const aspect = this.width / this.height;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = aspect;
    this.viewCamera.updateProjectionMatrix();
  }

  applyEnv(env: EnvPreset) {
    this.env = env;
    this.sky.apply(env);
    this.sunDir.set(...env.sky.sunDir).normalize();
    const l = env.light;
    this.sun.color.set(l.sun);
    this.sun.intensity = l.sunIntensity;
    this.hemi.color.set(l.skyAmbient);
    this.hemi.groundColor.set(l.groundAmbient);
    this.hemi.intensity = l.ambient;
    this.viewSun.color.set(l.sun);
    this.viewSun.intensity = l.sunIntensity * 1.1;
    this.viewHemi.color.set(l.skyAmbient);
    this.viewHemi.groundColor.set(l.groundAmbient);
    this.viewHemi.intensity = l.ambient * 1.6;

    const u = worldUniforms;
    u.uAccent.value.set(env.palette.accent);
    u.uHazard.value.set(env.palette.hazard);
    u.uFogColor.value.set(env.fog.color);
    u.uFogSun.value.set(env.sky.sun).lerp(new THREE.Color(env.fog.color), 0.35);
    u.uFogDensity.value = env.fog.density;
    u.uFogBase.value = env.fog.base;
    u.uFogFalloff.value = env.fog.falloff;
    u.uSunDir.value.copy(this.sunDir);
    u.uSeam.value = env.surface.seam;
    u.uRim.value = env.surface.rim;
    this.applyEnvPost();
  }

  private applyEnvPost() {
    const p = this.env.post;
    this.bloom.intensity = p.bloom * this.tier.bloomScale;
    this.bloom.luminanceMaterial.threshold = p.bloomThreshold;
    this.vignette.darkness = p.vignette;
    this.gl.toneMappingExposure = 1;
    this.grade.saturation = p.saturation;
    this.contrast.contrast = p.contrast;
    this.contrast.brightness = (this.brightness - 1) * 0.5 + (p.exposure - 1) * 0.35;
  }

  setHazardAlt(on: boolean) {
    worldUniforms.uHazardAlt.value = on ? 1 : 0;
  }

  /**
   * Pre-compile every material so nothing hitches mid-run. Pooled effects are invisible until
   * used, so they are switched on for the compile and switched back afterwards.
   */
  async warm() {
    const hidden: THREE.Object3D[] = [];
    for (const scene of [this.scene, this.viewScene]) {
      scene.traverse((o) => {
        if (!o.visible) {
          hidden.push(o);
          o.visible = true;
        }
      });
    }
    try {
      await this.gl.compileAsync(this.scene, this.camera);
      await this.gl.compileAsync(this.viewScene, this.viewCamera);
    } catch {
      this.gl.compile(this.scene, this.camera);
      this.gl.compile(this.viewScene, this.viewCamera);
    } finally {
      for (const o of hidden) o.visible = false;
    }
  }

  // ----- frame --------------------------------------------------------------------------
  render(time: number, dt: number, focus: THREE.Vector3) {
    if (this.contextLost) return;
    worldUniforms.uTime.value = time;
    this.sky.update(time, this.camera);

    // shadow frustum follows the player, snapped to shadow-map texels to avoid shimmering
    if (this.sun.castShadow) {
      const texel = (this.tier.shadowRange * 2) / this.tier.shadowSize;
      const fx = Math.round(focus.x / texel) * texel,
        fy = Math.round(focus.y / texel) * texel,
        fz = Math.round(focus.z / texel) * texel;
      this.sun.target.position.set(fx, fy, fz);
      this.sun.position.set(
        fx + this.sunDir.x * 120,
        fy + Math.max(0.35, this.sunDir.y) * 120,
        fz + this.sunDir.z * 120,
      );
      this.sun.target.updateMatrixWorld();
    } else {
      this.sun.position.copy(this.sunDir).multiplyScalar(100);
    }

    if (this.postEnabled && this.tier.chroma) {
      const k = this.dashFx * 0.006;
      this.chroma.offset.set(k, k * 0.6);
    }
    this.gl.info.reset();
    this.composer.render(dt);
  }

  get stats() {
    const r = this.gl.info.render,
      m = this.gl.info.memory;
    return { calls: r.calls, triangles: r.triangles, geometries: m.geometries, textures: m.textures };
  }

  dispose() {
    this.composer.dispose();
    this.sky.dispose();
    this.gl.dispose();
  }
}
