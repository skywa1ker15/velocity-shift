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
        float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
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
