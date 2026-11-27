/**
 * Screen-space half of a universe's look: halftone, scanlines, pixel grid, colour fringe, grain,
 * posterising, paper texture, digital glitch and hue drift. One effect covers every universe, so
 * the post chain never has to be rebuilt (or a shader recompiled) when the world shifts; the
 * director just blends the numbers as the camera crosses the front.
 */
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { Uniform, Vector2 } from 'three';
import { NO_SCREEN, type ScreenLook } from '../multiverse/universes';

const frag = /* glsl */ `
uniform float uRain;
uniform float uPixelBurst;
uniform float uFlash;
uniform float uHalftone, uScan, uPixel, uFringe, uGrain, uPosterize, uPaper, uGlitch, uHueDrift, uT, uBurst;
uniform vec2 uRes;
float uvH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float uvN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(uvH(i), uvH(i + vec2(1, 0)), f.x), mix(uvH(i + vec2(0, 1)), uvH(i + vec2(1, 1)), f.x), f.y);
}
vec3 uvHue(vec3 c, float a) {
  // rotate chroma in YIQ space
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  float ci = dot(c, vec3(0.596, -0.274, -0.322));
  float cq = dot(c, vec3(0.211, -0.523, 0.312));
  float cs = cos(a);
  float sn = sin(a);
  float i2 = ci * cs - cq * sn;
  float q2 = ci * sn + cq * cs;
  return vec3(y + 0.956 * i2 + 0.621 * q2, y - 0.272 * i2 - 0.647 * q2, y - 1.106 * i2 + 1.703 * q2);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 p = uv;
  float glitch = uGlitch + uBurst;
  // digital tearing: rows jump sideways in bursts
  if (glitch > 0.001) {
    float row = floor(p.y * 38.0);
    float tick = floor(uT * 11.0);
    float r = uvH(vec2(row, tick));
    float on = step(1.0 - glitch * 0.28, r);
    p.x += on * (uvH(vec2(tick, row)) - 0.5) * 0.09 * glitch;
    float blk = step(1.0 - glitch * 0.06, uvH(floor(p * vec2(9.0, 6.0)) + tick));
    p += blk * (vec2(uvH(vec2(tick, 3.0)), uvH(vec2(tick, 7.0))) - 0.5) * 0.06;
  }
  float pixel = max(uPixel, uPixelBurst);
  if (pixel > 0.5) {
    vec2 px = pixel / uRes;
    p = (floor(p / px) + 0.5) * px;
  }
  vec3 col;
  float fr = uFringe + glitch * 0.6;
  if (fr > 0.001 || pixel > 0.5 || glitch > 0.001) {
    vec2 off = (p - 0.5) * fr * 0.012;
    col = vec3(texture2D(inputBuffer, p + off).r, texture2D(inputBuffer, p).g, texture2D(inputBuffer, p - off).b);
  } else {
    col = inputColor.rgb;
  }
  // grading before this pass can push a channel of a pure colour below zero, which the colour
  // transform between passes turns into NaN; one bad channel would poison everything below
  if (isnan(col.r)) col.r = 0.0;
  if (isnan(col.g)) col.g = 0.0;
  if (isnan(col.b)) col.b = 0.0;
  col = max(col, 0.0);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  if (uPosterize > 0.5) {
    col = floor(col * uPosterize + 0.5) / uPosterize;
  }
  if (uHalftone > 0.001) {
    // a rotated dot screen that swallows the darker tones
    float s = uRes.y / 150.0;
    vec2 g = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (uv * uRes) / (4.0 * s);
    float dotR = length(fract(g) - 0.5);
    float cover = smoothstep(0.0, 0.08, (1.0 - lum) * 0.62 - dotR);
    col = mix(col, col * 0.42, cover * uHalftone * (1.0 - smoothstep(0.3, 0.75, lum)));
  }
  if (uScan > 0.001) {
    float line = 0.5 + 0.5 * sin(uv.y * uRes.y * 3.14159 / max(1.0, floor(uRes.y / 360.0)));
    col *= 1.0 - uScan * 0.28 * line;
  }
  if (uHueDrift > 0.001) col = uvHue(col, sin(uT * 0.35 + uv.x * 1.3 + uv.y * 0.7) * uHueDrift);
  if (uPaper > 0.001) {
    float fibre = uvN(uv * uRes * vec2(0.09, 0.42)) * 0.6 + uvN(uv * uRes * 0.5) * 0.4;
    col *= 1.0 - uPaper * 0.1 * (1.0 - fibre);
  }
  if (uRain > 0.001) {
    // rain: two layers of slanted streaks falling past the lens
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      vec2 q = uv * vec2(uRes.x / uRes.y, 1.0) * (22.0 + fi * 16.0);
      q.x += q.y * 0.12;
      q.y += uT * (9.0 + fi * 5.0);
      vec2 id = floor(q * vec2(1.0, 0.12));
      float on = step(0.72, uvH(id + fi * 31.0));
      float x = abs(fract(q.x) - 0.5);
      float len = fract(q.y * 0.12);
      float streak = (1.0 - smoothstep(0.02, 0.06, x)) * smoothstep(0.0, 0.2, len) * (1.0 - smoothstep(0.55, 0.9, len));
      col += vec3(0.55, 0.7, 0.9) * streak * on * uRain * (0.1 - fi * 0.03);
    }
  }
  if (uGrain > 0.001) {
    float g = uvH(uv * uRes + fract(uT * 7.0) * 91.7) - 0.5;
    col += g * uGrain * 0.09;
  }
  // a brief lift as the front passes through the lens
  col += uFlash * (0.35 + 0.65 * col);
  // negative channels (hue rotation, grain) would turn into NaN in the output transform
  outputColor = vec4(max(col, 0.0), inputColor.a);
}`;

export class UniverseEffect extends Effect {
  private look: ScreenLook = { ...NO_SCREEN };
  /** 0..1 momentary glitch kick (transitions). */
  burst = 0;
  /** Momentary chunky pixels in screen pixels (pixel transition). */
  pixelBurst = 0;
  /** 0..1 momentary brightening as a front crosses the camera. */
  flash = 0;
  /** Scales the harsher treatments (accessibility: reduced flashing). */
  intensity = 1;

  constructor() {
    super('UniverseEffect', frag, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uRain', new Uniform(0)],
        ['uPixelBurst', new Uniform(0)],
        ['uFlash', new Uniform(0)],
        ['uHalftone', new Uniform(0)],
        ['uScan', new Uniform(0)],
        ['uPixel', new Uniform(0)],
        ['uFringe', new Uniform(0)],
        ['uGrain', new Uniform(0)],
        ['uPosterize', new Uniform(0)],
        ['uPaper', new Uniform(0)],
        ['uGlitch', new Uniform(0)],
        ['uHueDrift', new Uniform(0)],
        ['uT', new Uniform(0)],
        ['uBurst', new Uniform(0)],
        ['uRes', new Uniform(new Vector2(1, 1))],
      ]),
    });
  }

  /** Blend two universes' screen looks: k = how far the camera is into b. */
  setLook(a: ScreenLook, b: ScreenLook, k: number) {
    const o = this.look;
    for (const key of Object.keys(o) as (keyof ScreenLook)[]) o[key] = a[key] + (b[key] - a[key]) * k;
    // discrete treatments switch at the halfway point instead of sliding through odd values
    o.pixel = k < 0.5 ? a.pixel : b.pixel;
    o.posterize = k < 0.5 ? a.posterize : b.posterize;
    this.push();
  }

  private push() {
    const u = this.uniforms,
      o = this.look,
      i = this.intensity;
    u.get('uRain')!.value = o.rain;
    u.get('uHalftone')!.value = o.halftone;
    u.get('uScan')!.value = o.scan * i;
    u.get('uPixel')!.value = o.pixel;
    u.get('uFringe')!.value = o.fringe * i;
    u.get('uGrain')!.value = o.grain;
    u.get('uPosterize')!.value = o.posterize;
    u.get('uPaper')!.value = o.paper;
    u.get('uGlitch')!.value = o.glitch * i;
    u.get('uHueDrift')!.value = o.hueDrift * i;
  }

  tick(time: number, dt: number) {
    this.uniforms.get('uT')!.value = time;
    this.burst = Math.max(0, this.burst - dt * 2.2);
    this.uniforms.get('uBurst')!.value = this.burst * this.intensity;
    this.pixelBurst = Math.max(0, this.pixelBurst - dt * 34);
    this.uniforms.get('uPixelBurst')!.value = this.pixelBurst > 1.5 ? Math.round(this.pixelBurst) : 0;
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.uniforms.get('uFlash')!.value = this.flash * this.flash * 0.5 * this.intensity;
  }

  override setSize(width: number, height: number) {
    (this.uniforms.get('uRes')!.value as Vector2).set(width, height);
  }
}
