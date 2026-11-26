/**
 * Visual effects with a 2D graphic-design feel, all pooled and GPU-cheap:
 *  - SpeedLines: screen-space streaks in the viewmodel scene, fully animated in the vertex shader.
 *  - Bursts: flat expanding rings / shockwaves drawn in world space (double jump, landing, dash…).
 *  - Sparks: a CPU-updated point pool for dust, sparks and shards.
 *  - Motes: an endless ambient particle field that wraps around the camera (no CPU cost).
 * Colours come from the level palette so the effects belong to the world they appear in.
 */
import * as THREE from 'three';
import { worldUniforms } from '../render/WorldMaterial';

// ---------------------------------------------------------------------------------------
export class SpeedLines {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private intensity = 0;

  constructor(count: number) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      // deterministic pseudo-random layout (visual only)
      const r = (n: number) => {
        const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
        return x - Math.floor(x);
      };
      seed[i * 4] = r(1) * Math.PI * 2; // angle around the view axis
      seed[i * 4 + 1] = 0.55 + r(2) * 1.25; // radius
      seed[i * 4 + 2] = r(3); // phase
      seed[i * 4 + 3] = 0.5 + r(4) * 1.6; // length
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    geo.instanceCount = count;
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) }, uBurst: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uIntensity, uBurst;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          float ang = aSeed.x, rad = aSeed.y, len = aSeed.w * (0.7 + uIntensity * 1.6 + uBurst * 2.0);
          float z = -9.0 + mod(aSeed.z * 9.0 + uTime * (9.0 + uIntensity * 22.0 + uBurst * 30.0), 9.0);
          vec3 c = vec3(cos(ang) * rad, sin(ang) * rad, z);
          vec3 tangent = vec3(-sin(ang), cos(ang), 0.0);
          float width = 0.006 + 0.012 * aSeed.w * (0.5 + uIntensity);
          vec3 p = c + tangent * position.x * width + vec3(0.0, 0.0, -position.y * len);
          // each streak has its own threshold, so more of them appear as speed builds
          float gate = smoothstep(aSeed.z * 0.85, aSeed.z * 0.85 + 0.2, uIntensity + uBurst);
          float fade = smoothstep(-9.0, -6.5, z) * smoothstep(0.0, -1.2, z);
          vAlpha = gate * fade * (0.25 + 0.55 * uIntensity + 0.5 * uBurst);
          vUv = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          float edge = 1.0 - abs(vUv.x) * 2.0;
          float taper = sin(vUv.y * 3.14159);
          gl_FragColor = vec4(uColor * 1.6, vAlpha * edge * taper);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  setColor(hex: number) {
    this.mat.uniforms.uColor.value.set(hex);
  }

  /** speed in m/s; `burst` 0..1 for dashes; `scale` from comfort settings. */
  update(time: number, dt: number, speed: number, burst: number, scale: number) {
    const target = Math.min(1, Math.max(0, (speed - 11.5) / 14)) * scale;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 6);
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uIntensity.value = this.intensity;
    u.uBurst.value = burst * scale;
    this.mesh.visible = this.intensity > 0.01 || burst * scale > 0.01;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}

// ---------------------------------------------------------------------------------------
interface Burst {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  life: number;
  max: number;
  size: number;
}

const _n = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

/** Flat graphic shockwaves: ring, double ring or starburst, expanding and fading. */
export class Bursts {
  readonly group = new THREE.Group();
  private pool: Burst[] = [];
  private geo = new THREE.PlaneGeometry(2, 2);

  constructor(count = 24) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color() }, uT: { value: 0 }, uStyle: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uT; uniform float uStyle;
          varying vec2 vUv;
          void main() {
            float r = length(vUv);
            float a = atan(vUv.y, vUv.x);
            float w = mix(0.16, 0.035, uT);
            float ring = smoothstep(w, 0.0, abs(r - 0.82));
            float inner = smoothstep(w * 0.6, 0.0, abs(r - 0.55)) * 0.6 * step(0.5, uStyle);
            // starburst spokes (style 2): crisp graphic shards
            float spokes = step(1.5, uStyle) * smoothstep(0.75, 1.0, abs(sin(a * 6.0))) * smoothstep(0.95, 0.3, r) * smoothstep(0.15, 0.4, r);
            float alpha = (ring + inner + spokes * 0.8) * (1.0 - uT) * (1.0 - uT);
            if (alpha < 0.003) discard;
            gl_FragColor = vec4(uColor * 2.2, alpha);
          }`,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.pool.push({ mesh, mat, life: 0, max: 1, size: 1 });
    }
  }

  spawn(pos: THREE.Vector3, normal: THREE.Vector3, color: THREE.Color, size: number, life = 0.45, style = 0) {
    // reuse a free burst, or the oldest one
    let b = this.pool[0];
    for (const c of this.pool) {
      if (!c.mesh.visible) {
        b = c;
        break;
      }
      if (c.life / c.max > b.life / b.max) b = c;
    }
    b.life = 0;
    b.max = life;
    b.size = size;
    b.mesh.visible = true;
    b.mesh.position.copy(pos);
    _n.copy(normal).normalize();
    b.mesh.quaternion.setFromUnitVectors(Z, _n);
    b.mat.uniforms.uColor.value.copy(color);
    b.mat.uniforms.uStyle.value = style;
    b.mat.uniforms.uT.value = 0;
    b.mesh.scale.setScalar(size * 0.2);
  }

  update(dt: number) {
    for (const b of this.pool) {
      if (!b.mesh.visible) continue;
      b.life += dt;
      const t = b.life / b.max;
      if (t >= 1) {
        b.mesh.visible = false;
        continue;
      }
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      b.mesh.scale.setScalar(b.size * (0.2 + 0.8 * e));
      b.mat.uniforms.uT.value = t;
    }
  }

  dispose() {
    this.geo.dispose();
    for (const b of this.pool) b.mat.dispose();
    this.group.removeFromParent();
  }
}

// ---------------------------------------------------------------------------------------
/** Pooled point sprites: dust puffs, sparks and shards. Diamond-shaped for a graphic look. */
export class Sparks {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private data: Float32Array; // size, life01
  private life: Float32Array;
  private max: Float32Array;
  private grav: Float32Array;
  private next = 0;
  private alive = 0;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private seed = 1;

  constructor(n = 420) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.data = new Float32Array(n * 2);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.grav = new Float32Array(n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aData', new THREE.BufferAttribute(this.data, 2).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute vec3 color; attribute vec2 aData;
        uniform float uScale;
        varying vec3 vColor; varying float vLife;
        void main() {
          vColor = color; vLife = aData.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aData.y <= 0.0 ? 0.0 : aData.x * uScale / max(0.3, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vLife;
        void main() {
          vec2 p = abs(gl_PointCoord - 0.5);
          float d = p.x + p.y;            // diamond
          float a = smoothstep(0.5, 0.36, d) * vLife;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * 1.8, a);
        }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  /** Small deterministic generator: effects never touch Math.random (keeps replays comparable). */
  private rnd() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  setViewportHeight(h: number) {
    this.mat.uniforms.uScale.value = h * 0.9;
  }

  emit(p: THREE.Vector3, dir: THREE.Vector3, count: number, color: THREE.Color, o: { speed?: number; spread?: number; life?: number; size?: number; gravity?: number } = {}) {
    const speed = o.speed ?? 3,
      spread = o.spread ?? 1,
      life = o.life ?? 0.5,
      size = o.size ?? 0.05;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const j = i * 3;
      this.pos[j] = p.x + (this.rnd() - 0.5) * 0.1;
      this.pos[j + 1] = p.y + (this.rnd() - 0.5) * 0.1;
      this.pos[j + 2] = p.z + (this.rnd() - 0.5) * 0.1;
      const s = speed * (0.4 + this.rnd() * 0.8);
      this.vel[j] = dir.x * s + (this.rnd() - 0.5) * spread * speed;
      this.vel[j + 1] = dir.y * s + (this.rnd() - 0.5) * spread * speed;
      this.vel[j + 2] = dir.z * s + (this.rnd() - 0.5) * spread * speed;
      this.col[j] = color.r;
      this.col[j + 1] = color.g;
      this.col[j + 2] = color.b;
      this.max[i] = life * (0.6 + this.rnd() * 0.7);
      this.life[i] = this.max[i];
      this.data[i * 2] = size * (0.6 + this.rnd() * 0.8);
      this.data[i * 2 + 1] = 1;
      this.grav[i] = o.gravity ?? 9;
    }
    this.alive = Math.max(this.alive, 1);
  }

  update(dt: number) {
    if (!this.alive) return;
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) {
        this.data[i * 2 + 1] = 0;
        continue;
      }
      alive++;
      this.vel[j + 1] -= this.grav[i] * dt;
      const drag = 1 - Math.min(1, dt * 1.8);
      this.vel[j] *= drag;
      this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.data[i * 2 + 1] = this.life[i] / this.max[i];
    }
    this.alive = alive;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aData.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.points.removeFromParent();
  }
}

// ---------------------------------------------------------------------------------------
/** Ambient drifting motes: positions wrap inside a box that follows the camera. */
export class Motes {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(count: number, color: number, size: number, rise: number) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
      pos[i] = x - Math.floor(x);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: worldUniforms.uTime,
        uColor: { value: new THREE.Color(color) },
        uSize: { value: size },
        uRise: { value: rise },
        uScale: { value: 600 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime, uSize, uRise, uScale;
        varying float vA;
        void main() {
          vec3 box = vec3(60.0, 34.0, 60.0);
          vec3 p = position * box;
          p.y += uTime * uRise * (0.5 + position.x);
          p.x += sin(uTime * 0.3 + position.z * 20.0) * 1.2;
          p.z += cos(uTime * 0.23 + position.x * 20.0) * 1.2;
          // wrap around the camera
          p = mod(p - cameraPosition + box * 0.5, box) - box * 0.5 + cameraPosition;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          vA = smoothstep(30.0, 14.0, d) * smoothstep(0.6, 2.5, d) * (0.5 + 0.5 * sin(uTime * 1.3 + position.y * 40.0));
          gl_PointSize = uSize * (0.6 + position.y) * uScale / max(0.5, d);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          vec2 p = abs(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.2, p.x + p.y) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * 1.5, a * 0.8);
        }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  setViewportHeight(h: number) {
    this.mat.uniforms.uScale.value = h * 0.9;
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
    this.points.removeFromParent();
  }
}
