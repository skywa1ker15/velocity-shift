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
uniform float uHalftone, uScan, uPixel, uFringe, uGrain, uPosterize, uPaper, uGlitch, uHueDrift, uT, uBurst;
uniform vec2 uRes;
float uvH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float uvN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(uvH(i), uvH(i + vec2(1, 0)), f.x), mix(uvH(i + vec2(0, 1)), uvH(i + vec2(1, 1)), f.x), f.y);
}
vec3 uvHue(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a), sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
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
  if (uPixel > 0.5) {
    vec2 px = uPixel / uRes;
    p = (floor(p / px) + 0.5) * px;
  }
  vec3 col;
  float fr = uFringe + glitch * 0.6;
  if (fr > 0.001 || uPixel > 0.5 || glitch > 0.001) {
    vec2 off = (p - 0.5) * fr * 0.012;
    col = vec3(texture2D(inputBuffer, p + off).r, texture2D(inputBuffer, p).g, texture2D(inputBuffer, p - off).b);
  } else {
    col = inputColor.rgb;
  }
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
    col = mix(col, col * 0.42, cover * uHalftone * smoothstep(0.75, 0.3, lum));
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
  if (uGrain > 0.001) {
    float g = uvH(uv * uRes + fract(uT * 7.0) * 91.7) - 0.5;
    col += g * uGrain * 0.09;
  }
  outputColor = vec4(col, inputColor.a);
}`;

export class UniverseEffect extends Effect {
  private look: ScreenLook = { ...NO_SCREEN };
  /** 0..1 momentary glitch kick (transitions). */
  burst = 0;
  /** Scales the harsher treatments (accessibility: reduced flashing). */
  intensity = 1;

  constructor() {
    super('UniverseEffect', frag, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
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
  }

  override setSize(width: number, height: number) {
    (this.uniforms.get('uRes')!.value as Vector2).set(width, height);
  }
}
