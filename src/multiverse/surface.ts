/**
 * Surface styles: how each universe renders the level's solid geometry.
 *
 * The world shader measures a set of universe-independent facts about a pixel (which material
 * role it is, where it sits on its box face, how lit it is, and the gameplay markings: wall-run
 * paint, hazard stripes, safe-ground lip, glow strips, telegraph, landing ring). Each style turns
 * those facts into a picture in its own rendering language. The gameplay markings go through
 * mvMarks() in every style, so "orange rails = wall-run, striped = lethal" survives every shift.
 *
 * Style 0 (anime) is the original inked material and is produced by the main shader body.
 */
export const surfaceDecl = /* glsl */ `
uniform vec3 uPalA[7];
uniform vec3 uPalB[7];
uniform vec3 uSunA;
uniform vec3 uSunB;
uniform vec3 uAmbA;
uniform vec3 uAmbB;
uniform vec3 uFogColA;
uniform vec3 uFogColB;
uniform vec3 uFogSunA;
uniform vec3 uFogSunB;
uniform vec3 uFogPA;
uniform vec3 uFogPB;
varying float vRole;
// ---- facts about this pixel, filled in by the main shader body ----
float mvU = 0.0, mvV = 0.0, mvFw = 100.0, mvFh = 100.0;
float mvEdge = 50.0;     // metres to the nearest edge of the box face
float mvPx = 0.001;      // metres per pixel
float mvUp = 0.0;        // world normal y
float mvBox = 0.0;       // 1 on box faces (edges are meaningful)
float mvTiny = 1.0;      // fades detail on faces only a few pixels wide
float mvWalk = 0.0;      // walkable top
float mvLip = 0.0;       // safe-ground lip band
float mvPaint = 0.0;     // wall-run rails + chevrons
float mvNear = 0.0;      // player is close to this wall
float mvRun = 0.0;       // inside the wall-run band (darkened backing)
float mvGlow = 0.0;      // glow strip strength
float mvHaz = 0.0;       // lethal surface
float mvStripe = 0.0;    // hazard stripe mask
float mvWarn = 0.0;      // telegraph amount (already flickering)
float mvRing = 0.0;      // landing ring
float mvLit = 1.0;       // sun on this pixel: 0 in shadow, banded otherwise
float mvNdl = 1.0;       // raw N.L
float mvSdfV = 1000.0;
float mvM = 0.0;
vec3 mvGlowCol = vec3(1.0);
vec3 mvCA = vec3(0.0);
vec3 mvCB = vec3(0.0);

vec3 mvFog(vec3 color, vec3 wpos, vec3 camPos, vec3 fogCol, vec3 fogSun, vec3 P) {
  vec3 toP = wpos - camPos;
  float dist = length(toP);
  float fd = 1.0 - exp(-P.x * P.x * dist * dist);
  float hf = exp(-max(wpos.y - P.y, 0.0) * P.z);
  float below = smoothstep(P.y + 4.0, P.y - 70.0, wpos.y);
  float f = clamp(fd * (0.3 + 0.7 * hf) + below * smoothstep(20.0, 160.0, dist), 0.0, 1.0);
  float s = pow(max(dot(toP / max(dist, 0.001), uSunDir), 0.0), 6.0);
  return mix(color, mix(fogCol, fogSun, s * 0.7), f);
}

// Gameplay markings, shared by every style. 'ink' is the style's darkest tone, 'k' scales glow.
vec3 mvMarks(vec3 c, vec3 accent, vec3 hazard, vec3 ink, float k) {
  // safe-ground lip
  c = mix(c, mix(c * 1.3 + 0.05, accent, 0.4), mvLip);
  // wall-run: darkened band, rails and chevrons in the accent colour, brighter when close
  c = mix(c, c * 0.7, mvRun * 0.6);
  c = mix(c, accent * (1.0 + (0.35 + mvNear * 0.9) * k), mvPaint);
  // glow strips
  c += mvGlowCol * mvGlow * max(k, 0.25) * (0.9 + 0.2 * sin(uTime * 1.7 + vWPos.x * 0.3 + vWPos.z * 0.3));
  // lethal: bold stripes, pattern as well as colour
  if (mvHaz > 0.5) {
    float pulse = 0.75 + 0.25 * sin(uTime * 6.0);
    c = mix(ink, hazard * (1.0 + (0.9 + uHazardAlt * 1.2) * pulse * max(k, 0.35)), mvStripe);
  }
  // telegraph
  c = mix(c, hazard * 1.6, clamp(mvWarn, 0.0, 1.0) * 0.6);
  // landing ring
  c += accent * mvRing * 1.2 * max(k, 0.4);
  return c;
}

// ---------- 6: INK. Black brush on paper: three tones, wobbling brush lines, dry-brush shade ----------
vec3 mvInkStyle(vec3 base, vec3 pal[7], vec3 sun, vec3 amb) {
  vec3 black = vec3(0.035, 0.035, 0.045);
  float wash = mvNoise(vWPos * 0.55);
  float grain = mvNoise(vWPos * 3.3 + 5.0);
  // tone: light, plus a wandering wash so the boundary between tones looks brushed
  float tone = mvLit * (0.55 + 0.45 * max(mvNdl, 0.0)) + (wash - 0.5) * 0.22;
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 paper = vec3(0.955, 0.94, 0.9) * mix(0.82, 1.0, smoothstep(0.2, 0.8, lum));
  vec3 c = paper;
  // grey wash in the half-light, with pooled darker edges like wet ink
  float mid = 1.0 - smoothstep(0.42, 0.47, tone);
  float pool = smoothstep(0.36, 0.42, tone) * mid;
  c = mix(c, paper * 0.66, mid);
  c = mix(c, paper * 0.5, pool * 0.6);
  // dry-brush strokes in the shade: long streaks that break up
  float streak = mvNoise(vec3(mvU * 0.35 + mvV * 0.2, mvV * 7.0 + mvU * 1.2, wash * 3.0));
  float dry = smoothstep(0.52, 0.6, streak) * mid * (1.0 - smoothstep(0.02, 0.08, mvPx));
  c = mix(c, black, dry * 0.75);
  // heavy masses and undersides are solid black with a paper speckle
  float mass = max(step(lum, 0.25), smoothstep(-0.4, -0.7, mvUp));
  c = mix(c, mix(black, paper * 0.4, smoothstep(0.78, 0.9, grain) * 0.5), mass);
  // the brush line along every edge: width wanders, and it runs dry in places
  if (mvBox > 0.5) {
    float along = mvNoise(vec3(mvU * 0.9, mvV * 0.9, vWPos.y * 0.5 + 3.0));
    float w = max(0.05, mvPx * 1.8) * (0.55 + along * 1.1);
    float line = (1.0 - smoothstep(w, w + mvPx * 1.2, mvEdge)) * mvTiny;
    float dryLine = smoothstep(0.86, 0.95, mvNoise(vec3(mvU * 4.0, mvV * 4.0, 9.0)));
    c = mix(c, mass > 0.5 ? paper : black, line * (1.0 - dryLine * 0.7));
  }
  // paper tooth
  c *= 0.97 + 0.05 * grain;
  return mvMarks(c, pal[3], pal[5], black, 0.0);
}

vec3 mvSurface(float id, vec3 pal[7], vec3 sun, vec3 amb) {
  vec3 base = pal[int(vRole + 0.5)];
  mvGlowCol = base;
  if (id > 5.5 && id < 6.5) return mvInkStyle(base, pal, sun, amb);
  // a universe without a style yet: flat lit colour, markings intact
  return mvMarks(base * (amb + sun * mvLit * max(mvNdl, 0.0)), pal[3], pal[5], vec3(0.04), 1.0);
}

// Resolve both sides of the front. 'legacy' is the original inked result (style 0).
void mvResolve(vec3 legacy) {
  mvCA = legacy;
  mvCB = legacy;
  if (uUniA > 0.5 && mvM < 0.999) mvCA = mvSurface(uUniA, uPalA, uSunA, uAmbA);
  if (uUniB > 0.5 && mvM > 0.001) mvCB = mvSurface(uUniB, uPalB, uSunB, uAmbB);
}

vec3 mvCompose(vec3 camPos) {
  vec3 a = mvM < 0.999 ? mvFog(mvCA, vWPos, camPos, uFogColA, uFogSunA, uFogPA) : vec3(0.0);
  vec3 b = mvM > 0.001 ? mvFog(mvCB, vWPos, camPos, uFogColB, uFogSunB, uFogPB) : vec3(0.0);
  vec3 c = mix(a, b, mvM);
  if (uUniOn > 0.5) {
    // the seam between realities: a hot core line with a soft halo in both universes' accents
    float d = abs(mvSdfV);
    float core = 1.0 - smoothstep(0.0, 0.09, d);
    float halo = exp(-d * 1.6);
    vec3 seam = mix(uPalA[3], uPalB[3], 0.5) + 0.25;
    float fade = 1.0 - smoothstep(250.0, 900.0, uFront.w);
    c += seam * (core * 3.0 + halo * 0.7) * fade;
  }
  return c;
}
`;
