/**
 * Illustrated visual effects. Everything here is drawn, not simulated:
 *  - SpeedLines: anime-style screen-space speed lines converging on the direction of travel.
 *  - Stickers: pooled sprites from a small sprite sheet painted in code (dust puffs, impact
 *    stars, brush streaks, rings), flat-coloured with ink outlines and animated in steps at
 *    12 frames per second, the cadence of hand-drawn animation. One draw call for all of them.
 *  - Sparks: a CPU-updated point pool of small four-point glints for hot contact (slide, wall).
 *  - Motes: an endless ambient particle field that wraps around the camera (no CPU cost).
 * Colours come from the level palette so the effects belong to the world they appear in.
 */
import * as THREE from 'three';
import { worldUniforms } from '../render/WorldMaterial';

/** Hand-animation cadence: effects advance on "twos". */
const STEP_FPS = 12;

// ---------------------------------------------------------------------------------------
export class SpeedLines {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private intensity = 0;
  private cx = 0;
  private cy = 0;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uBurst: { value: 0 },
        uColor: { value: new THREE.Color(1, 1, 1) },
        uInk: worldUniforms.uInk,
        uCenter: { value: new THREE.Vector2() },
        uAspect: { value: 1.78 },
        uStyle: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() { vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uIntensity, uBurst, uAspect, uStyle;
        uniform vec3 uColor, uInk;
        uniform vec2 uCenter;
        varying vec2 vP;
        float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
        void main() {
          float k = clamp(uIntensity + uBurst, 0.0, 1.0);
          if (k < 0.01) discard;
          vec2 sp = vP;
          // voxel universe: the lines are built from screen blocks
          if (uStyle > 2.5 && uStyle < 3.5) sp = (floor(vP * 34.0) + 0.5) / 34.0;
          vec2 p = (sp - uCenter) * vec2(uAspect, 1.0);
          float r = length(p);
          if (uStyle > 4.5) {
            // corruption: not rays at all, but rows of the picture tearing sideways from the edges
            float frame5 = floor(uTime * 14.0);
            float row = floor((vP.y * 0.5 + 0.5) * 46.0);
            float on5 = step(h1(row + frame5 * 3.0), 0.05 + k * 0.22);
            float reach = (0.08 + h1(row * 1.7 + frame5) * 0.3) * (0.4 + k);
            float edge5 = 1.0 - abs(vP.x);
            float bar = on5 * step(edge5, reach);
            if (bar < 0.01) discard;
            float ch = h1(row * 2.3 + frame5 * 5.0);
            gl_FragColor = vec4(ch < 0.33 ? vec3(1.0, 0.1, 0.3) : ch < 0.66 ? vec3(0.1, 1.0, 0.45) : vec3(0.2, 0.5, 1.0), bar * (0.35 + 0.3 * k));
            return;
          }
          float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
          float frame = floor(uTime * ${STEP_FPS}.0);          // redrawn 12 times a second
          const float N = 120.0;
          float cell = ang * N;
          float id = floor(cell);
          float across = abs(fract(cell) - 0.5);                // 0 at the middle of the wedge
          float hA = h1(id + frame * 13.0);
          float hB = h1(id * 1.73 + 5.0 + frame * 7.0);
          // only some wedges carry a line each frame; more as speed builds
          float on = step(hA, 0.08 + k * 0.3);
          // each line is a long thin spike: its tip points at the focus, its base is off-screen
          float tip = mix(1.35, 0.66, k) + hB * 0.5 - uBurst * 0.12;
          float len = max(r - tip, 0.0);
          float halfW = min(0.34, len * (0.3 + hB * 0.6));
          if (uStyle > 0.5 && uStyle < 1.5) halfW = min(0.1, len * 0.12);                    // neon: hair-thin streaks
          else if (uStyle > 1.5 && uStyle < 2.5) halfW = min(0.46, len * (0.6 + hB * 0.8));     // comic: fat wedges
          else if (uStyle > 3.5 && uStyle < 4.5)                                                // brush: wandering width
            halfW *= 0.5 + 1.1 * h1(id + floor(r * 9.0) * 3.7 + frame);
          float line = on * (1.0 - smoothstep(halfW - 0.06, halfW, across)) * step(tip, r);
          if (line < 0.01) discard;
          // most lines are light, some are ink: reads on bright and dark backgrounds alike
          float inkLine = step(0.72, h1(id * 3.1 + frame));
          vec3 col = mix(uColor, uInk, inkLine);
          float alpha = line * (0.4 + 0.35 * k) * mix(1.0, 0.7, inkLine);
          if (uStyle > 0.5 && uStyle < 1.5) {
            // light, not ink: a bright core that blooms
            col = uColor * 2.2;
            alpha = line * (0.5 + 0.4 * k);
          } else if (uStyle > 1.5 && uStyle < 2.5) {
            // black wedges with a white twin beside every third: the printed-page speed line
            col = mix(vec3(0.03, 0.03, 0.06), vec3(1.0), step(0.66, h1(id * 5.3)));
            alpha = line * (0.6 + 0.3 * k);
          } else if (uStyle > 3.5 && uStyle < 4.5) {
            // dry brush: the stroke breaks up along its length
            alpha *= step(0.25, h1(id * 2.1 + floor(r * 22.0)));
            col = uColor;
            alpha = min(1.0, alpha * 1.5);
          }
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  setColor(hex: number) {
    // keep the lines light: tint white toward the chosen colour
    this.mat.uniforms.uColor.value.set(hex).lerp(new THREE.Color(1, 1, 1), 0.55);
  }
  setAspect(a: number) {
    this.mat.uniforms.uAspect.value = a;
  }
  /** 0 inked, 1 light streaks, 2 comic wedges, 3 pixel blocks, 4 dry brush, 5 glitch bars. */
  setStyle(style: number, rawColor?: number) {
    this.mat.uniforms.uStyle.value = style;
    // brush universes want the true colour (black ink), not a tint of white
    if (rawColor !== undefined) this.mat.uniforms.uColor.value.set(rawColor);
  }

  /**
   * speed in m/s; `burst` 0..1 for dashes; `scale` from comfort settings; (fx, fy) is where the
   * motion is heading on screen (-1..1), so the lines streak sideways in a strafe and upward in a fall.
   */
  update(
    time: number,
    dt: number,
    speed: number,
    burst: number,
    scale: number,
    fx = 0,
    fy = 0,
    snap = false,
  ) {
    const target = Math.min(1, Math.max(0, (speed - 11.5) / 13)) * scale;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 6);
    const rate = snap ? 1 : Math.min(1, dt * 7);
    this.cx += (fx - this.cx) * rate;
    this.cy += (fy - this.cy) * rate;
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uIntensity.value = this.intensity;
    u.uBurst.value = burst * scale;
    u.uCenter.value.set(this.cx, this.cy);
    this.mesh.visible = this.intensity > 0.01 || burst * scale > 0.01;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}

// ---------------------------------------------------------------------------------------
/** Sprite-sheet cells (4 x 4 grid). Animated sprites occupy a whole row, left to right. */
export const Sprite = {
  puff: 0, // 4 frames: a cartoon dust cloud that swells and breaks apart
  star: 4, // 4 frames: an impact burst that opens into a hollow ring of spikes
  ring: 8, // 2 frames: a hand-drawn ring, thick then thin
  streak: 10, // a tapered brush stroke
  scuff: 11, // a short double skid mark
  tick: 12, // a small wedge ("action line")
  glint: 13, // a four-point sparkle
  chevron: 14,
  dot: 15,
} as const;

/** Paint the sprite sheet: white shapes with black ink outlines, tinted per sprite at draw time. */
function paintSheet(): THREE.Texture {
  const S = 512,
    C = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  // deterministic wobble so the shapes look hand-drawn but are identical on every run
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cell = (i: number, draw: () => void) => {
    g.save();
    g.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    draw();
    g.restore();
  };
  const INK = '#0b0d14';
  const blob = (x: number, y: number, r: number) => {
    g.beginPath();
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.9 + rnd() * 0.2);
      const px = x + Math.cos(a) * rr,
        py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else
        g.quadraticCurveTo(
          x + Math.cos(a - Math.PI / n) * rr * 1.12,
          y + Math.sin(a - Math.PI / n) * rr * 1.12,
          px,
          py,
        );
    }
    g.closePath();
  };
  // puffs: clusters of lobes, outlined as one shape, with a shade crescent
  for (let f = 0; f < 4; f++)
    cell(Sprite.puff + f, () => {
      const lobes = [
        [-16, 6, 22],
        [10, 10, 24],
        [-2, -12, 24],
        [22, -8, 16],
        [-26, -10, 14],
      ];
      const spread = 1 + f * 0.32,
        shrink = 1 - f * 0.2;
      g.fillStyle = INK;
      for (const [x, y, r] of lobes.slice(0, 5 - (f === 3 ? 1 : 0))) {
        blob(x * spread, y * spread, r * shrink + 5);
        g.fill();
      }
      g.fillStyle = '#fff';
      for (const [x, y, r] of lobes.slice(0, 5 - (f === 3 ? 1 : 0))) {
        blob(x * spread, y * spread, Math.max(2, r * shrink - (f === 3 ? 3 : 0)));
        g.fill();
      }
      g.fillStyle = 'rgba(11,13,20,0.22)';
      for (const [x, y, r] of lobes.slice(0, 3)) {
        g.beginPath();
        g.arc(x * spread + 3, y * spread + r * shrink * 0.45, r * shrink * 0.55, 0.1, Math.PI - 0.1);
        g.fill();
      }
    });
  // impact stars
  for (let f = 0; f < 4; f++)
    cell(Sprite.star + f, () => {
      const n = 11;
      const outer = 30 + f * 9,
        inner = f < 2 ? 12 + f * 6 : 0;
      const hole = f >= 2 ? 22 + (f - 2) * 12 : 0;
      const path = (grow: number) => {
        g.beginPath();
        for (let i = 0; i < n * 2; i++) {
          const a = (i / (n * 2)) * Math.PI * 2;
          const spike = i % 2 === 0;
          const r = spike
            ? (outer + grow) * (0.78 + ((i * 7) % 5) * 0.06)
            : Math.max(inner, hole * 0.9) + 8 - grow * 0.3;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
      };
      g.fillStyle = INK;
      path(5);
      g.fill();
      g.fillStyle = '#fff';
      path(0);
      g.fill();
      if (hole) {
        g.globalCompositeOperation = 'destination-out';
        g.beginPath();
        g.arc(0, 0, hole, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = INK;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(0, 0, hole, 0, Math.PI * 2);
        g.stroke();
      }
    });
  // rings: a brush ring with uneven weight and a gap, like a quick pen stroke
  for (let f = 0; f < 2; f++)
    cell(Sprite.ring + f, () => {
      const R = 50;
      const w = f === 0 ? 11 : 5;
      for (const [col, extra] of [
        [INK, 7],
        ['#fff', 0],
      ] as const) {
        g.strokeStyle = col;
        for (let i = 0; i < 40; i++) {
          const a0 = (i / 40) * Math.PI * 2 + 0.2,
            a1 = a0 + (Math.PI * 2) / 40 + 0.02;
          if (f === 1 && i % 10 > 7) continue; // broken line on the thin frame
          g.lineWidth = w * (0.55 + 0.45 * Math.sin(a0 * 1.5 + 1) ** 2) + extra;
          g.beginPath();
          g.arc(0, 0, R, a0, a1);
          g.stroke();
        }
      }
    });
  // brush streak: tapered at both ends, with dry-brush gaps at the tail
  cell(Sprite.streak, () => {
    const shape = (grow: number) => {
      g.beginPath();
      g.moveTo(-58, 0);
      g.quadraticCurveTo(-10, -13 - grow, 56, -3 - grow * 0.4);
      g.lineTo(60, 2);
      g.quadraticCurveTo(-10, 12 + grow, -58, 0);
      g.closePath();
    };
    g.fillStyle = INK;
    shape(5);
    g.fill();
    g.fillStyle = '#fff';
    shape(0);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(-56, -5 + i * 3.4);
      g.lineTo(-22 + i * 5, -6 + i * 3.6);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  });
  cell(Sprite.scuff, () => {
    for (const y of [-14, 14]) {
      g.strokeStyle = INK;
      g.lineWidth = 15;
      g.beginPath();
      g.moveTo(-46, y);
      g.lineTo(46, y * 0.8);
      g.stroke();
      g.strokeStyle = '#fff';
      g.lineWidth = 8;
      g.setLineDash([26, 9, 14, 7]);
      g.beginPath();
      g.moveTo(-44, y);
      g.lineTo(44, y * 0.8);
      g.stroke();
      g.setLineDash([]);
    }
  });
  cell(Sprite.tick, () => {
    const shape = (grow: number) => {
      g.beginPath();
      g.moveTo(-50 - grow, 0);
      g.lineTo(46, -9 - grow);
      g.lineTo(52 + grow, 0);
      g.lineTo(46, 9 + grow);
      g.closePath();
    };
    g.fillStyle = INK;
    shape(4);
    g.fill();
    g.fillStyle = '#fff';
    shape(0);
    g.fill();
  });
  cell(Sprite.glint, () => {
    const shape = (R: number, r: number) => {
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = i % 2 ? r : R;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
    };
    g.fillStyle = INK;
    shape(56, 15);
    g.fill();
    g.fillStyle = '#fff';
    shape(48, 9);
    g.fill();
  });
  cell(Sprite.chevron, () => {
    for (const [col, w] of [
      [INK, 26],
      ['#fff', 15],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.lineJoin = 'miter';
      g.beginPath();
      g.moveTo(-34, 30);
      g.lineTo(0, -22);
      g.lineTo(34, 30);
      g.stroke();
    }
  });
  cell(Sprite.dot, () => {
    g.fillStyle = INK;
    blob(0, 0, 40);
    g.fill();
    g.fillStyle = '#fff';
    blob(0, 0, 32);
    g.fill();
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

export interface StickerOpts {
  /** First sprite cell and how many frames to play through over the lifetime. */
  sprite: number;
  frames?: number;
  size: number;
  /** Final size as a multiple of the start size (sprites pop out fast, then settle). */
  grow?: number;
  life?: number;
  /** Lie flat on this surface normal. Omit for a camera-facing sprite. */
  normal?: THREE.Vector3;
  /** Rotation in the sprite's plane (radians). For flat sprites, 0 points the sprite's +X along `along`. */
  rot?: number;
  along?: THREE.Vector3;
  vel?: THREE.Vector3;
  gravity?: number;
  drag?: number;
  alpha?: number;
  /** Stretch along the sprite's X axis. */
  stretch?: number;
}

interface Sticker {
  life: number;
  max: number;
  sprite: number;
  frames: number;
  size: number;
  grow: number;
  flat: boolean;
  rot: number;
  alpha: number;
  stretch: number;
  gravity: number;
  drag: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  ax: THREE.Vector3;
  ay: THREE.Vector3;
  c: THREE.Color;
}

const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();

/** Pooled illustrated sprites, world-space, drawn in one instanced call. */
export class Stickers {
  readonly mesh: THREE.Mesh;
  private pool: Sticker[] = [];
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private tex: THREE.Texture;
  private aPos: THREE.InstancedBufferAttribute;
  private aX: THREE.InstancedBufferAttribute;
  private aY: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private aCell: THREE.InstancedBufferAttribute;
  private next = 0;
  private live = 0;

  constructor(private n = 180) {
    this.tex = paintSheet();
    const geo = (this.geo = new THREE.InstancedBufferGeometry());
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
    );
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (size: number) =>
      new THREE.InstancedBufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', (this.aPos = attr(3)));
    geo.setAttribute('aX', (this.aX = attr(3)));
    geo.setAttribute('aY', (this.aY = attr(3)));
    geo.setAttribute('aCol', (this.aCol = attr(4)));
    geo.setAttribute('aCell', (this.aCell = attr(1)));
    geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uMap: { value: this.tex }, uMode: { value: 0 }, uTime: worldUniforms.uTime },
      vertexShader: /* glsl */ `
        attribute vec3 aPos, aX, aY; attribute vec4 aCol; attribute float aCell;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          vec2 c = vec2(mod(aCell, 4.0), floor(aCell / 4.0));
          vUv = (c + position.xy + 0.5) * 0.25;
          vUv.y = 1.0 - vUv.y;
          vCol = aCol;
          gl_Position = projectionMatrix * viewMatrix * vec4(aPos + aX * position.x + aY * position.y, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uMode, uTime;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          vec2 uv = vUv;
          // pixel universes: the drawn sprite becomes a 12x12 block of texels
          if (uMode > 2.5 && uMode < 3.5) uv = (floor(uv * 48.0) + 0.5) / 48.0;
          // corruption: rows of the sprite slip sideways
          if (uMode > 3.5) uv.x += (fract(sin(floor(uv.y * 64.0) * 91.7 + floor(uTime * 12.0) * 7.3) * 43758.5) - 0.5) * 0.02;
          vec4 t = texture2D(uMap, uv);
          float a = t.a * vCol.a;
          if (a < 0.02) discard;
          // white paint takes the sprite's colour, ink stays ink
          vec3 col = t.rgb * mix(vec3(1.0), vCol.rgb, smoothstep(0.2, 0.9, t.r));
          if (uMode > 0.5 && uMode < 1.5) col = vCol.rgb * (0.5 + 1.9 * t.r);                 // light: no ink, it glows
          else if (uMode > 1.5 && uMode < 2.5) col = mix(vec3(0.035, 0.035, 0.045), vec3(0.955, 0.94, 0.9), step(0.5, t.r)); // ink on paper
          else if (uMode > 3.5) col = mix(col, col.gbr, step(0.5, fract(uv.y * 40.0 + uTime * 6.0)));
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    for (let i = 0; i < n; i++)
      this.pool.push({
        life: 0,
        max: 1,
        sprite: 0,
        frames: 1,
        size: 1,
        grow: 1,
        flat: false,
        rot: 0,
        alpha: 1,
        stretch: 1,
        gravity: 0,
        drag: 0,
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        ax: new THREE.Vector3(),
        ay: new THREE.Vector3(),
        c: new THREE.Color(),
      });
  }

  spawn(pos: THREE.Vector3, color: THREE.Color, o: StickerOpts) {
    const s = this.pool[this.next];
    this.next = (this.next + 1) % this.n;
    s.max = o.life ?? 0.4;
    s.life = s.max;
    s.sprite = o.sprite;
    s.frames = o.frames ?? 1;
    s.size = o.size;
    s.grow = o.grow ?? 1;
    s.rot = o.rot ?? 0;
    s.alpha = o.alpha ?? 1;
    s.stretch = o.stretch ?? 1;
    s.gravity = o.gravity ?? 0;
    s.drag = o.drag ?? 0;
    s.p.copy(pos);
    if (o.vel) s.v.copy(o.vel);
    else s.v.set(0, 0, 0);
    s.c.copy(color);
    s.flat = !!o.normal;
    if (o.normal) {
      // build the sprite's plane: X along `along` (projected), Y perpendicular, both in the surface
      _n.copy(o.normal).normalize();
      if (o.along && o.along.lengthSq() > 1e-6) _t.copy(o.along);
      else _t.set(Math.abs(_n.y) > 0.9 ? 1 : 0, Math.abs(_n.y) > 0.9 ? 0 : 1, 0);
      _t.addScaledVector(_n, -_t.dot(_n));
      if (_t.lengthSq() < 1e-6) _t.set(1, 0, 0).addScaledVector(_n, -_n.x);
      _t.normalize();
      _u.crossVectors(_n, _t);
      const cs = Math.cos(s.rot),
        sn = Math.sin(s.rot);
      s.ax.copy(_t).multiplyScalar(cs).addScaledVector(_u, sn);
      s.ay.copy(_u).multiplyScalar(cs).addScaledVector(_t, -sn);
      s.p.addScaledVector(_n, 0.02); // sit just off the surface
    }
    this.live = Math.max(this.live, 1);
  }

  /** 0 inked sprites, 1 glowing light, 2 black-and-paper, 3 pixel blocks, 4 corrupted. */
  setMode(mode: number) {
    this.mat.uniforms.uMode.value = mode;
  }

  /** `camera` orients the camera-facing sprites. Time is stepped so motion lands on twos. */
  update(dt: number, camera: THREE.Camera) {
    if (!this.live) {
      this.geo.instanceCount = 0;
      return;
    }
    _r.setFromMatrixColumn(camera.matrixWorld, 0);
    _u.setFromMatrixColumn(camera.matrixWorld, 1);
    let k = 0;
    const P = this.aPos.array as Float32Array,
      AX = this.aX.array as Float32Array,
      AY = this.aY.array as Float32Array,
      CO = this.aCol.array as Float32Array,
      CE = this.aCell.array as Float32Array;
    for (const s of this.pool) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) continue;
      s.v.y -= s.gravity * dt;
      if (s.drag) s.v.multiplyScalar(Math.max(0, 1 - s.drag * dt));
      s.p.addScaledVector(s.v, dt);
      // age snaps to 12 fps steps: size and frame change together, like drawn frames
      const age = 1 - s.life / s.max;
      const stepped = Math.min(
        1,
        Math.floor(age * s.max * STEP_FPS + 1) / Math.max(1, Math.ceil(s.max * STEP_FPS)),
      );
      const e = 1 - (1 - stepped) * (1 - stepped);
      const size = s.size * (1 + (s.grow - 1) * e);
      const frame = s.sprite + Math.min(s.frames - 1, Math.floor(stepped * s.frames));
      let ax = s.ax,
        ay = s.ay;
      if (!s.flat) {
        const cs = Math.cos(s.rot),
          sn = Math.sin(s.rot);
        ax = _n.copy(_r).multiplyScalar(cs).addScaledVector(_u, sn);
        ay = _t.copy(_u).multiplyScalar(cs).addScaledVector(_r, -sn);
      }
      const j = k * 3;
      P[j] = s.p.x;
      P[j + 1] = s.p.y;
      P[j + 2] = s.p.z;
      AX[j] = ax.x * size * s.stretch;
      AX[j + 1] = ax.y * size * s.stretch;
      AX[j + 2] = ax.z * size * s.stretch;
      AY[j] = ay.x * size;
      AY[j + 1] = ay.y * size;
      AY[j + 2] = ay.z * size;
      CO[k * 4] = s.c.r;
      CO[k * 4 + 1] = s.c.g;
      CO[k * 4 + 2] = s.c.b;
      // hold solid, then drop out over the last third
      CO[k * 4 + 3] = s.alpha * Math.min(1, (1 - stepped) * 3 + 0.001);
      CE[k] = frame;
      k++;
    }
    this.live = k;
    this.geo.instanceCount = k;
    this.aPos.needsUpdate =
      this.aX.needsUpdate =
      this.aY.needsUpdate =
      this.aCol.needsUpdate =
      this.aCell.needsUpdate =
        true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
    this.mesh.removeFromParent();
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
    this.geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
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
          float d = p.x + p.y + min(p.x, p.y) * 2.6;   // four-point glint
          float a = step(d, 0.5) * step(0.12, vLife);
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(vColor, vec3(1.0), step(d, 0.2)) * 1.5, a);
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

  emit(
    p: THREE.Vector3,
    dir: THREE.Vector3,
    count: number,
    color: THREE.Color,
    o: { speed?: number; spread?: number; life?: number; size?: number; gravity?: number } = {},
  ) {
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

/**
 * Speed streaks: thin slivers of light (or ink) hanging in the air around the camera. Standing
 * still they are invisible; at speed each one stretches along the direction of travel, so the
 * world itself seems to smear past. One instanced draw call, no per-frame allocation.
 */
export class Streaks {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private amount = 0;

  constructor(count = 90) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3),
    );
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const seed = new Float32Array(count * 3);
    for (let i = 0; i < seed.length; i++) {
      const x = Math.sin(i * 78.233 + 1.7) * 43758.5453;
      seed[i] = x - Math.floor(x);
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3));
    geo.instanceCount = count;
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uVel: { value: new THREE.Vector3() },
        uAmount: { value: 0 },
        uColor: { value: new THREE.Color(1, 1, 1) },
        uDark: { value: 0 },
        uTime: worldUniforms.uTime,
      },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform vec3 uVel;
        uniform float uAmount, uTime;
        varying float vA;
        varying float vT;
        void main() {
          vec3 box = vec3(26.0, 14.0, 26.0);
          vec3 p = aSeed * box;
          // wrap a fixed cloud of points around the camera
          p = mod(p - cameraPosition + box * 0.5, box) - box * 0.5 + cameraPosition;
          float speed = length(uVel);
          vec3 dir = speed > 0.01 ? uVel / speed : vec3(0.0, 0.0, 1.0);
          float len = uAmount * (1.2 + aSeed.x * 3.2);
          vec3 toCam = cameraPosition - p;
          float d = length(toCam);
          vec3 side = normalize(cross(dir, toCam));
          float w = 0.016 + aSeed.y * 0.02;
          vec3 wp = p - dir * (position.y * len) + side * position.x * w;
          vT = position.y;
          // nothing right in the face, nothing far away, nothing dead ahead where the route is
          float ahead = abs(dot(normalize(toCam), dir));
          vA = uAmount * smoothstep(1.4, 4.0, d) * (1.0 - smoothstep(9.0, 13.0, d)) * (1.0 - smoothstep(0.86, 0.97, ahead));
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uDark;
        varying float vA;
        varying float vT;
        void main() {
          float a = vA * (1.0 - vT) * (1.0 - vT);
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(uColor * 1.8, uColor, uDark), a * mix(0.55, 0.75, uDark));
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }

  /** dark = ink-coloured streaks for bright universes. */
  setLook(color: number, dark: boolean) {
    this.mat.uniforms.uColor.value.set(color);
    this.mat.uniforms.uDark.value = dark ? 1 : 0;
  }

  update(dt: number, vx: number, vy: number, vz: number, scale: number) {
    const speed = Math.hypot(vx, vy, vz);
    const target = Math.min(1, Math.max(0, (speed - 10.5) / 12)) * scale;
    this.amount += (target - this.amount) * Math.min(1, dt * 5);
    const u = this.mat.uniforms;
    u.uVel.value.set(vx, vy, vz);
    u.uAmount.value = this.amount;
    this.mesh.visible = this.amount > 0.02;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
