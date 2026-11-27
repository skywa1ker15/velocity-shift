/** Procedural sky dome: gradient, sun, drifting cloud bands, stars and aurora ribbons. */
import * as THREE from 'three';
import type { EnvPreset } from '../environment/presets';

export class Sky {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uBottom: { value: new THREE.Color() },
        uSun: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunGlow: { value: 1 },
        uClouds: { value: 0.5 },
        uCloudColor: { value: new THREE.Color() },
        uStars: { value: 0 },
        uAurora: { value: 0 },
        uAuroraColor: { value: new THREE.Color() },
        uTime: { value: 0 },
        uSkyFar: { value: new THREE.Color() },
        uSkyNear: { value: new THREE.Color() },
        uSkyH: { value: 0.08 },
        uSpires: { value: 0 },
        uWindows: { value: 0 },
        uAccentSky: { value: new THREE.Color() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 uTop, uHorizon, uBottom, uSun, uCloudColor, uAuroraColor, uSunDir;
        uniform float uSunGlow, uClouds, uStars, uAurora, uTime;
        uniform vec3 uSkyFar, uSkyNear, uAccentSky;
        uniform float uSkyH, uSpires, uWindows;
        float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
        // one silhouette layer of distant towers around the horizon: returns coverage, writes
        // the tower's top (for rim light) and a window mask
        float skyline(float az, float h, float n, float hmax, float seed, out float rim, out float win) {
          float x = az * n;
          float cell = floor(x);
          float f = fract(x);
          float r = hash(vec2(cell, seed));
          float r2 = hash(vec2(cell, seed + 9.1));
          float gap = step(0.78, r2);                       // some cells are empty sky
          float wdt = 0.55 + r * 0.4;
          float inside = step(abs(f - 0.5), wdt * 0.5) * (1.0 - gap);
          float top = -0.02 + hmax * (0.25 + 0.75 * r * r);
          // spires: the top narrows to a point
          float sp = uSpires * step(0.45, r2) * (1.0 - abs(f - 0.5) / (wdt * 0.5));
          float peak = top + sp * hmax * 0.6 * r2;
          float cov = inside * step(h, mix(top, peak, uSpires * step(0.45, r2)));
          rim = inside * (1.0 - smoothstep(0.0, 0.004, abs(h - top))) * (1.0 - uSpires * step(0.45, r2));
          vec2 wg = vec2(f * 14.0, h * 900.0);
          win = cov * step(0.72, hash(floor(wg) + cell)) * step(0.25, fract(wg.x)) * step(0.35, fract(wg.y)) * step(h, top - 0.004);
          return cov;
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          // a painted sky: the gradient steps through soft-edged bands instead of blending smoothly
          float q = pow(clamp(h, 0.0, 1.0), 0.55) * 7.0;
          q = (floor(q) + smoothstep(0.35, 0.65, fract(q))) / 7.0;
          vec3 col = mix(uHorizon, uTop, q);
          col = mix(col, uBottom, smoothstep(0.0, -0.4, h));
          // horizon haze band
          col = mix(col, uHorizon * 1.08, exp(-abs(h) * 9.0) * 0.5);

          // stars
          if (uStars > 0.01 && h > -0.05) {
            vec2 sp = d.xz / (abs(d.y) + 0.35) * 46.0;
            vec2 cell = floor(sp);
            float r = hash(cell);
            vec2 off = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
            float dist = length(fract(sp) - 0.5 - off * 0.6);
            float tw = 0.6 + 0.4 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
            col += vec3(0.9, 0.95, 1.0) * step(0.86, r) * smoothstep(0.09, 0.0, dist) * tw * uStars * smoothstep(-0.05, 0.25, h);
          }
          // aurora ribbons
          if (uAurora > 0.01) {
            float a = 0.0;
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              float wave = fbm(vec2(d.x * 2.2 + fi * 3.7 + uTime * 0.025, d.z * 2.2 - uTime * 0.018));
              float band = 0.22 + fi * 0.13 + wave * 0.22;
              a += smoothstep(0.1, 0.0, abs(h - band)) * (0.5 + 0.5 * noise(vec2(d.x * 30.0 + uTime * 0.2, fi)));
            }
            col += uAuroraColor * a * uAurora * 0.38;
          }
          // clouds: stretched fbm, denser toward the horizon
          if (uClouds > 0.01) {
            vec2 cp = d.xz / (abs(h) + 0.22);
            float c = fbm(cp * 1.4 + vec2(uTime * 0.012, uTime * 0.004));
            float c2 = fbm(cp * 3.1 - vec2(uTime * 0.02, 0.0));
            // cel clouds: a flat body with a hard-edged lighter core, like cut paper
            float dens = c * 0.75 + c2 * 0.35 + exp(-abs(h) * 5.0) * 0.28;
            float thr = 1.0 - uClouds * 0.72;
            float body = smoothstep(thr + 0.1, thr + 0.115, dens);
            float core = smoothstep(thr + 0.27, thr + 0.285, dens);
            float lit = 0.8 + 0.4 * pow(max(dot(d, uSunDir), 0.0), 3.0);
            col = mix(col, mix(uCloudColor * 0.8, uCloudColor * 1.12, core) * lit, body * smoothstep(-0.12, 0.08, h) * 0.8);
          }
          // distant skyline, two layers: far towers sink into the horizon haze, near ones are
          // a darker cut-out with a rim of light and (at night) lit windows
          if (uSkyH > 0.001 && h > -0.06 && h < uSkyH * 1.8) {
            float az = atan(d.x, d.z);
            float rimF, winF, rimN, winN;
            float far = skyline(az, h, 64.0, uSkyH * 0.7, 3.0, rimF, winF);
            float near = skyline(az + 0.37, h, 38.0, uSkyH, 17.0, rimN, winN);
            vec3 farC = mix(uSkyFar, uHorizon, 0.25);
            col = mix(col, farC, far * 0.9);
            col += uHorizon * rimF * 0.25 * far;
            col += uAccentSky * winF * uWindows * 0.5;
            col = mix(col, uSkyNear, near);
            col += mix(uHorizon, uSun, 0.5) * rimN * 0.55;
            col += uAccentSky * winN * uWindows * 0.9;
            // haze sits over the base of both layers
            col = mix(col, uHorizon, smoothstep(0.02, -0.05, h) * 0.6 * max(far, near));
          }
          // sun disc + bloom halo
          float sd = max(dot(d, uSunDir), 0.0);
          // a graphic sun: flat disc, one drawn halo ring, restrained glow
          float ring = 1.0 - smoothstep(0.00012, 0.00028, abs(sd - 0.9972));
          col += uSun * (smoothstep(0.9990, 0.9992, sd) * 4.0 + ring * 0.9 + pow(sd, 60.0) * 0.3 * uSunGlow + pow(sd, 7.0) * 0.14 * uSunGlow);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), this.mat);
    this.mesh.scale.setScalar(1500);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  apply(env: EnvPreset) {
    const u = this.mat.uniforms,
      s = env.sky;
    u.uTop.value.set(s.top);
    u.uHorizon.value.set(s.horizon);
    u.uBottom.value.set(s.bottom);
    u.uSun.value.set(s.sun);
    u.uSunDir.value.set(...s.sunDir).normalize();
    u.uSunGlow.value = s.sunGlow;
    u.uClouds.value = s.clouds;
    u.uCloudColor.value.set(s.cloudColor);
    u.uStars.value = s.stars;
    u.uAurora.value = s.aurora;
    u.uAuroraColor.value.set(s.auroraColor);
    const k = env.look.skyline;
    u.uSkyFar.value.set(k.far);
    u.uSkyNear.value.set(k.near);
    u.uSkyH.value = k.height;
    u.uSpires.value = k.spires;
    u.uWindows.value = k.windows;
    u.uAccentSky.value.set(env.palette.accent);
  }

  update(time: number, camera: THREE.Camera) {
    this.mat.uniforms.uTime.value = time;
    this.mesh.position.copy(camera.position);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
