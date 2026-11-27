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

float mvShadow = 1.0;    // 1 = not in cast shadow (soft at shadow edges)
float mvSun = 1.0;       // smooth lambert * shadow
vec3 mvView = vec3(0.0, 0.0, 1.0);
float mvDist = 1.0;
// line coverage around integer values of x, width w (in x units), anti-aliased
float mvLine(float x, float w) { float d = abs(fract(x + 0.5) - 0.5); float aa = fwidth(x) + 1e-5; return 1.0 - smoothstep(w, w + aa, d); }
// distance fade for fine detail: 1 near, 0 where a detail of 'size' metres is under ~2 px
float mvDetail(float size) { return clamp(size / (mvPx * 2.5) - 0.4, 0.0, 1.0); }
vec3 mvHsv(float h, float s, float v) {
  vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

// ---------- 1: NEON CYBERPUNK. Wet black architecture, light only from signs and edges ----------
vec3 mvNeonStyle(vec3 base, vec3 pal[7], vec3 sun, vec3 amb) {
  vec3 cyan = vec3(0.1, 0.95, 1.0), mag = vec3(1.0, 0.12, 0.72);
  // which neon colour this block wears: constant per block face region
  float pick = step(0.5, mvH2(floor(vWPos.xz / 9.0) + floor(vWPos.y / 7.0)));
  vec3 neon = mix(cyan, mag, pick);
  vec3 c = base * (amb * 0.9 + sun * mvSun * 0.5);
  // brushed panels: faint seams every 2 m
  float fine = mvDetail(0.08);
  float seams = max(mvLine(mvU / 2.0, 0.012), mvLine(mvV / 2.0, 0.012)) * fine * mvBox;
  c *= 1.0 - seams * 0.5;
  vec3 glow = vec3(0.0);
  if (mvUp > 0.6) {
    // ---- wet ground: puddles mirror the city glow, rain rings spread across them ----
    float puddle = smoothstep(0.42, 0.62, mvNoise(vec3(vWPos.xz * 0.23, 2.0)));
    vec3 r = reflect(-mvView, vec3(0.0, 1.0, 0.0));
    float fres = pow(1.0 - max(mvView.y, 0.0), 3.0);
    float az = atan(r.x, r.z);
    // the reflected skyline: bands of sign light smeared vertically
    float sign = mvNoise(vec3(az * 7.0, 1.0, 0.0));
    vec3 refl = mix(mag, cyan, smoothstep(0.3, 0.7, sign)) * (0.25 + 0.75 * smoothstep(0.45, 0.8, mvNoise(vec3(az * 23.0, r.y * 3.0, 4.0))));
    refl *= smoothstep(0.0, 0.35, r.y) * (1.0 - smoothstep(0.35, 0.95, r.y)) * 1.6;
    // rain rings
    vec2 cell = floor(vWPos.xz / 0.9);
    vec2 f = fract(vWPos.xz / 0.9) - 0.5;
    float ph = fract(uTime * 0.9 + mvH2(cell) * 7.0);
    float ring = (1.0 - smoothstep(0.0, 0.035, abs(length(f - (vec2(mvH2(cell + 3.0), mvH2(cell + 9.0)) - 0.5) * 0.5) - ph * 0.42))) * (1.0 - ph) * fine;
    c = mix(c, c * 0.6 + refl * (0.06 + 0.5 * fres), puddle * 0.85);
    c += refl * fres * 0.1;
    glow += refl * fres * puddle * 0.3 + vec3(0.6, 0.8, 1.0) * ring * 0.22 * (0.3 + puddle);
    // lane light: thin guide lines down walkable ground
    float lane = mvLine(mvU / 3.0, 0.01) * fine * mvWalk;
    glow += neon * lane * 0.5;
  } else if (abs(mvUp) < 0.5 && mvBox > 0.5) {
    // ---- walls: stacks of lit windows and the odd holographic sign panel ----
    float big = step(5.0, mvFh) * step(3.0, mvFw);
    vec2 wg = vec2(mvU / 1.1, mvV / 1.6);
    vec2 wc = floor(wg);
    vec2 wf = fract(wg);
    float lit = step(0.74, mvH2(wc + floor(vWPos.xz / 13.0)));
    float flick = 0.75 + 0.25 * step(0.2, fract(uTime * 0.7 + mvH2(wc) * 9.0));
    float win = step(0.18, wf.x) * step(wf.x, 0.82) * step(0.25, wf.y) * step(wf.y, 0.8) * lit * big * mvDetail(0.5);
    vec3 winCol = mix(vec3(1.0, 0.75, 0.4), neon, step(0.55, mvH2(wc + 5.0)));
    glow += winCol * win * flick * 0.7;
    // a vertical sign strip on some faces, with scrolling glyph blocks
    float stripX = mvFw * (0.2 + 0.6 * mvH2(floor(vWPos.xz / 9.0) + 2.0));
    float inStrip = (1.0 - smoothstep(0.32, 0.34, abs(mvU - stripX))) * step(7.0, mvFh) * step(0.55, mvH2(floor(vWPos.xz / 9.0) + 8.0));
    float glyph = step(0.45, mvH2(vec2(floor(mvV * 1.4 + uTime * 0.8), floor(mvU * 6.0))));
    glow += mix(mag, cyan, 1.0 - pick) * inStrip * (0.35 + glyph * 1.4) * mvDetail(0.3);
    c *= 1.0 - inStrip * 0.5;
    // light pooling at the foot of every wall from the wet street
    glow += neon * exp(-mvV * 1.1) * 0.12;
  }
  // ---- every edge is a neon tube ----
  if (mvBox > 0.5) {
    float w = max(0.035, mvPx * 1.4);
    float tube = (1.0 - smoothstep(w, w + mvPx, mvEdge)) * mvTiny;
    float halo = exp(-mvEdge * 5.0) * 0.22 * mvTiny;
    glow += neon * (tube * 2.6 + halo);
  }
  // rim light against the fog so silhouettes read
  c += neon * pow(1.0 - abs(dot(mvView, normalize(vWNormal))), 3.0) * 0.12;
  return mvMarks(c + glow, pal[3], pal[5], vec3(0.01, 0.01, 0.03), 1.6);
}

// ---------- 2: COMIC BOOK. Flat inks, Ben-Day dots, spot blacks, heavy outlines ----------
vec3 mvComicStyle(vec3 base, vec3 pal[7], vec3 sun, vec3 amb) {
  vec3 black = vec3(0.03, 0.03, 0.06);
  float lightV = mvSun;
  // two flat tones split by a hard terminator
  float litTone = step(0.3, lightV);
  vec3 c = base;
  vec3 shadeCol = base * vec3(0.5, 0.48, 0.72);
  // Ben-Day dots: the shadow tone is the lit colour overprinted with dots, in screen space like print
  vec2 g = mat2(0.866, -0.5, 0.5, 0.866) * gl_FragCoord.xy / 7.0;
  float dotR = length(fract(g) - 0.5);
  float half1 = 1.0 - smoothstep(0.34, 0.4, dotR);           // dense dots
  float half2 = 1.0 - smoothstep(0.2, 0.26, dotR);           // sparse dots in the half-light
  float band = smoothstep(0.3, 0.75, lightV);
  c = mix(mix(c, shadeCol, half1 * 0.95 + 0.05), c, litTone);
  c = mix(c, mix(c, shadeCol, half2), litTone * (1.0 - band) * 0.9);
  // spot blacks: undersides and the deepest shade go solid
  float spot = max((1.0 - smoothstep(-0.7, -0.5, mvUp)), (1.0 - step(0.02, mvShadow)) * step(mvUp, 0.5) * step(mvV, 1.2));
  c = mix(c, black, spot);
  if (mvBox > 0.5) {
    // feathered hatching climbing walls out of the shade
    float hatch = mvLine((mvU - mvV * 0.6) * 2.4, 0.09 * (1.0 - smoothstep(0.0, 2.6, mvV))) * step(abs(mvUp), 0.5) * mvDetail(0.12);
    c = mix(c, black, hatch * 0.85);
    // a shine stroke across lit tops: two parallel white slashes
    float sh = mvU + mvV * 0.8;
    float shine = (mvLine(sh / 6.5, 0.02) + mvLine(sh / 6.5 + 0.06, 0.008)) * mvWalk * litTone * mvDetail(0.3) * step(3.0, min(mvFw, mvFh));
    c = mix(c, vec3(1.0), shine * 0.55);
    // the outline: thick, slightly uneven, like a brush pen
    float w = max(0.07, mvPx * 2.2) * (0.85 + 0.3 * mvNoise(vec3(mvU, mvV, 1.0) * 0.8));
    float line = (1.0 - smoothstep(w, w + mvPx, mvEdge)) * mvTiny;
    // a thin inner highlight makes edges pop like inked plastic
    float inner = smoothstep(w + mvPx, w + mvPx * 2.0, mvEdge) * (1.0 - smoothstep(w * 1.7, w * 1.7 + mvPx, mvEdge));
    c = mix(c, vec3(1.0), inner * 0.5 * litTone * mvTiny * max(mvUp, 0.0));
    c = mix(c, black, line);
  }
  return mvMarks(c, pal[3], pal[5], black, 0.25);
}

// ---------- 3: LOW-POLY. Every surface is faceted into flat triangles, soft gradient light ----------
vec3 mvLowPolyStyle(vec3 base, vec3 pal[7], vec3 sun, vec3 amb) {
  // triangulate the face: a square grid split along alternating diagonals
  float size = abs(mvUp) < 0.5 ? 2.8 : 1.9;
  vec2 q = vec2(mvU, mvV) / size;
  if (mvBox < 0.5) q = vWPos.xz / size + vWPos.y / size;
  vec2 cell = floor(q);
  vec2 f = fract(q);
  float flip = step(0.5, mvH2(cell + floor(vWPos.y * 0.37)));
  float tri = flip > 0.5 ? step(f.x, f.y) : step(1.0 - f.x, f.y);
  vec2 id = cell * 2.0 + tri + floor(vWPos.xz / 31.0);
  // each facet leans a little: a tilted normal gives it its own flat tone
  vec3 n = normalize(vWNormal);
  vec3 jit = vec3(mvH2(id), mvH2(id + 17.0), mvH2(id + 41.0)) - 0.5;
  float facet = mvDetail(0.9);
  vec3 fn = normalize(n + jit * 0.55 * facet);
  float ndl = max(dot(fn, uSunDir), 0.0);
  float sh = mvShadow;
  float skyL = 0.5 + 0.5 * fn.y;
  vec3 tint = base * (1.0 + (mvH2(id + 3.0) - 0.5) * 0.16 * facet);
  // hue leans warm in light, cool in shade
  vec3 c = tint * (amb * (0.65 + 0.6 * skyL) + sun * ndl * sh * 1.05);
  c = mix(c, c * vec3(0.8, 0.9, 1.15), (1.0 - sh) * 0.35);
  // soft contact darkening at the foot of walls, light lifting toward the top
  if (abs(mvUp) < 0.5 && mvBox > 0.5) c *= 0.78 + 0.22 * smoothstep(0.0, 3.5, mvV);
  // facet creases catch a hair of light
  float d1 = min(f.x, f.y);
  float d2 = min(1.0 - f.x, 1.0 - f.y);
  float dd = abs(flip > 0.5 ? f.x - f.y : f.x + f.y - 1.0) * 0.7071;
  float crease = 1.0 - smoothstep(0.0, fwidth(q.x) * 1.5 + 0.004, min(min(d1, d2), dd));
  c += vec3(1.0, 0.97, 0.9) * crease * 0.07 * mvDetail(0.25);
  // chamfered block edges: a bright bevel on top edges, a dark one below
  if (mvBox > 0.5) {
    float w = max(0.06, mvPx * 1.5);
    float bevel = (1.0 - smoothstep(w, w + mvPx, mvEdge)) * mvTiny;
    c = mix(c, c * (mvUp > 0.5 ? 1.45 : 0.7) + (mvUp > 0.5 ? 0.06 : 0.0), bevel * 0.8);
  }
  return mvMarks(c, pal[3], pal[5], vec3(0.08, 0.07, 0.1), 0.55);
}

// ---------- 8: RETRO SYNTHWAVE. Black volumes wrapped in a glowing grid ----------
vec3 mvSynthStyle(vec3 base, vec3 pal[7], vec3 sun, vec3 amb) {
  vec3 hot = vec3(1.0, 0.16, 0.62), cool = vec3(0.12, 0.85, 1.0), gold = vec3(1.0, 0.72, 0.22);
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 c = mix(vec3(0.035, 0.012, 0.085), vec3(0.11, 0.04, 0.2), lum) * (0.75 + 0.5 * mvSun);
  vec3 glow = vec3(0.0);
  float gridFade = mvDetail(0.1);
  if (mvUp > 0.6) {
    // floors: a cyan grid in world space, so it lines up from platform to platform
    vec2 g = vWPos.xz / 2.0;
    float lines = max(mvLine(g.x, 0.02), mvLine(g.y, 0.02));
    float soft = max(mvLine(g.x, 0.09), mvLine(g.y, 0.09));
    // pulses race down the grid toward the horizon
    float pulse = smoothstep(0.75, 1.0, fract(vWPos.z * 0.035 - uTime * 0.45));
    glow += cool * (lines * (1.1 + pulse * 1.6) + soft * 0.16) * gridFade;
    c += cool * 0.04;
  } else if (abs(mvUp) < 0.5) {
    // walls: a magenta grid that burns hot at the foot and cools as it rises
    float heat = exp(-max(mvV, 0.0) * 0.16);
    vec3 wallC = mix(mix(cool, hot, 0.75), gold, heat * 0.6);
    float lines = max(mvLine(mvU / 2.0, 0.02), mvLine(mvV / 2.0, 0.02));
    float soft = max(mvLine(mvU / 2.0, 0.08), mvLine(mvV / 2.0, 0.08));
    glow += wallC * (lines * (0.55 + heat * 1.3) + soft * 0.12) * gridFade * mvBox;
    // horizontal scan bands slide up the towers
    float bandS = smoothstep(0.92, 1.0, fract(vWPos.y * 0.09 - uTime * 0.22));
    glow += hot * bandS * 0.3;
    c += hot * heat * 0.1;
  } else {
    c *= 0.5;
  }
  if (mvBox > 0.5) {
    float w = max(0.045, mvPx * 1.5);
    float tube = (1.0 - smoothstep(w, w + mvPx, mvEdge)) * mvTiny;
    glow += mix(hot, cool, step(0.6, mvUp)) * (tube * 2.4 + exp(-mvEdge * 4.0) * 0.25 * mvTiny);
  }
  // chrome kiss: a sunset gradient reflected in anything facing the viewer side-on
  float fres = pow(1.0 - abs(dot(mvView, normalize(vWNormal))), 2.5);
  c += mix(hot, gold, 0.5 + 0.5 * mvView.y) * fres * 0.22;
  return mvMarks(c + glow, pal[3], pal[5], vec3(0.01, 0.0, 0.03), 1.7);
}

// ---------- 4: PSYCHEDELIC. Surfaces are flowing contour maps of impossible colour ----------
vec3 mvPsycheStyle(vec3 base, vec3 pal[7], vec3 sun, vec3 amb) {
  float t = uTime * 0.12;
  // a slow domain-warped field; its contour lines crawl across everything
  vec3 q = vWPos * 0.11;
  float w1 = mvNoise(q + vec3(t, 0.0, -t));
  float w2 = mvNoise(q * 2.1 + vec3(w1 * 2.0, t * 1.3, w1));
  float field = w1 * 0.65 + w2 * 0.35 + dot(normalize(vWNormal), vec3(0.13, 0.31, 0.07));
  float bands = field * 9.0 + t * 2.0;
  float bandId = floor(bands);
  float inBand = fract(bands);
  // walkable ground stays calmer and darker so the route always reads
  float calm = mvWalk;
  float hue = fract(bandId * 0.137 + t * 0.4 + vRole * 0.11);
  vec3 c = mvHsv(hue, mix(0.85, 0.6, calm), mix(0.95, 0.45, calm));
  // each band has a soft inner gradient and a hard black contour
  c *= 0.75 + 0.35 * inBand;
  float bw = fwidth(bands);
  float contour = 1.0 - smoothstep(0.02, 0.02 + bw * 1.5, min(inBand, 1.0 - inBand));
  // where bands get thinner than a few pixels, drop the contour instead of flooding black
  c = mix(c, vec3(0.02, 0.0, 0.05), contour * 0.85 * clamp(1.0 - bw * 4.0, 0.0, 1.0));
  // breathing rings ripple out from the player
  float pd = distance(vWPos, uPlayer);
  float breathe = 0.5 + 0.5 * sin(pd * 0.9 - uTime * 2.2);
  c += mvHsv(hue + 0.33, 0.7, 1.0) * pow(breathe, 6.0) * 0.16 * (1.0 - smoothstep(10.0, 40.0, pd));
  c *= 0.7 + 0.4 * mvSun;
  if (mvBox > 0.5) {
    // a white edge with a black keyline: shapes stay legible inside the colour storm
    float w = max(0.05, mvPx * 1.6);
    float white = (1.0 - smoothstep(w, w + mvPx, mvEdge)) * mvTiny;
    float key = (1.0 - smoothstep(w * 2.2, w * 2.2 + mvPx, mvEdge)) * mvTiny - white;
    c = mix(c, vec3(0.02, 0.0, 0.05), clamp(key, 0.0, 1.0));
    c = mix(c, vec3(1.3), white);
  }
  return mvMarks(c, pal[3], pal[5], vec3(0.02, 0.0, 0.05), 0.9);
}

// ---------- 5: VOXEL. The world is rebuilt from half-metre blocks ----------
vec3 mvVoxelStyle(vec3 base, vec3 pal[7], vec3 sun, vec3 amb) {
  float size = 0.5;
  vec3 n = normalize(vWNormal);
  // which block: step just inside the surface so faces do not flicker between cells
  vec3 cellP = (vWPos - n * 0.02) / size;
  vec3 cell = floor(cellP);
  vec3 f = fract(cellP);
  // 2D position inside the block face
  vec3 an = abs(n);
  vec2 uv = an.y > 0.5 ? f.xz : (an.x > 0.5 ? f.zy : f.xy);
  float rnd = mvHash(cell * 0.731);
  float patch_ = mvNoise(cell * 0.16);
  // materials by role and height on the block: grass caps, soil under them, stone, ore
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 stone = base * (0.86 + 0.24 * rnd);
  stone = mix(stone, stone * vec3(0.9, 0.95, 1.08), step(0.6, patch_));
  vec3 c = stone;
  if (mvBox > 0.5 && vRole < 1.5 || vRole > 5.5) {
    vec3 grass = mix(vec3(0.36, 0.72, 0.3), vec3(0.5, 0.8, 0.32), rnd);
    vec3 soil = mix(vec3(0.5, 0.36, 0.24), vec3(0.42, 0.3, 0.2), rnd);
    if (mvUp > 0.6) c = mix(stone, grass, step(0.35, patch_));
    else if (abs(mvUp) < 0.5) {
      // the top block of a wall wears the turf, with a ragged lower edge
      float fromTop = mvFh - mvV;
      float turf = step(fromTop, size * (1.0 + step(0.5, mvHash(vec3(cell.x, 0.0, cell.z)))));
      c = mix(c, mix(soil, grass, step(fromTop, size * 0.45)), turf * step(0.35, patch_) * step(3.0, mvFh));
    }
  }
  // ore flecks in the dark masses
  if (vRole > 1.5 && vRole < 2.5) {
    vec2 pix = floor(uv * 4.0);
    float ore = step(0.9, rnd) * step(0.55, mvH2(pix + cell.xy));
    c = mix(c, pal[4] * 1.3, ore);
  }
  // each block is a tile of 8x8 texels: quantise a little tone noise to them
  vec2 texel = floor(uv * 8.0);
  c *= 0.93 + 0.14 * mvH2(texel + cell.xz * 7.0 + cell.y * 3.0) * mvDetail(0.07);
  // block bevel: light top-left, dark bottom-right, a groove between blocks
  float fade = mvDetail(0.06);
  float edgeD = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
  float groove = 1.0 - smoothstep(0.03, 0.03 + fwidth(uv.x) * 1.5, edgeD);
  float hi = step(uv.y, 0.94) * step(0.88, uv.y) + step(uv.x, 0.12) * step(0.06, uv.x);
  float lo = step(uv.y, 0.12) * step(0.06, uv.y) + step(uv.x, 0.94) * step(0.88, uv.x);
  c *= 1.0 + (hi * 0.16 - lo * 0.14) * fade;
  c *= 1.0 - groove * 0.4 * fade;
  // flat, stepped light per face, as block games do it
  float face = an.y > 0.5 ? (n.y > 0.0 ? 1.0 : 0.5) : (an.x > 0.5 ? 0.7 : 0.82);
  float sh = mix(0.62, 1.0, mvShadow);
  c *= face * sh * (0.55 + 0.75 * dot(amb + sun * 0.55, vec3(0.333)));
  // blocky ambient occlusion in the corner where a wall meets the ground
  if (abs(mvUp) < 0.5 && mvBox > 0.5) c *= 0.8 + 0.2 * step(size, mvV);
  return mvMarks(c, pal[3], pal[5], vec3(0.07, 0.06, 0.08), 0.45);
}

// ---------- 7: PAINTED FANTASY. Thick brushwork, warm light, cool shade, no hard lines ----------
vec3 mvPaintedStyle(vec3 base, vec3 pal[7], vec3 sun, vec3 amb) {
  vec3 n = normalize(vWNormal);
  // brush strokes: long streaks following each face, in three sizes
  vec2 fuv = vec2(mvU, mvV);
  if (mvBox < 0.5) fuv = vWPos.xz + vWPos.y * 0.7;
  float dirK = mvNoise(vWPos * 0.09) * 2.4;
  vec2 dir = vec2(cos(dirK), sin(dirK));
  vec2 along = vec2(dot(fuv, dir), dot(fuv, vec2(-dir.y, dir.x)));
  float s1 = mvNoise(vec3(along.x * 0.45, along.y * 1.1, 1.0));
  float s2 = mvNoise(vec3(along.x * 1.3, along.y * 3.4, 5.0));
  float s3 = mvNoise(vec3(along.x * 4.0, along.y * 10.0, 9.0)) * mvDetail(0.12);
  float stroke = s1 * 0.5 + s2 * 0.32 + s3 * 0.18;
  // pigment wanders: hue leans toward a neighbour colour in broad patches
  float patch_ = mvNoise(vWPos * 0.17 + 20.0);
  vec3 c = mix(base, base * vec3(1.12, 0.98, 0.84), smoothstep(0.35, 0.75, patch_));
  c = mix(c, mix(c, pal[1], 0.35), smoothstep(0.6, 0.85, mvNoise(vWPos * 0.31 + 3.0)) * 0.6);
  c *= 0.9 + 0.26 * stroke;
  // moss and lichen gather on tops and ledges
  float moss = smoothstep(0.52, 0.7, mvNoise(vWPos * 0.42 + 7.0) + (mvUp > 0.6 ? 0.08 : -0.12) + stroke * 0.12);
  c = mix(c, vec3(0.34, 0.5, 0.27) * (0.8 + 0.5 * stroke), moss * (mvUp > 0.6 ? 0.7 : 0.35));
  // light: a soft warm key with the terminator broken up by the strokes, deep cool shade
  // the key light is judged by shadow first, angle second, so a low sun still reads as daylight
  float key = smoothstep(0.05, 0.75, mvShadow * (0.5 + 0.5 * max(mvNdl, 0.0)) * step(-0.05, mvNdl) + (stroke - 0.5) * 0.35);
  vec3 warm = sun * vec3(1.12, 1.0, 0.82);
  vec3 coolSh = amb * vec3(0.84, 0.9, 1.12);
  vec3 lit = c * (coolSh * (0.95 + 0.35 * n.y) + warm * key * 0.95);
  // bounced gold on undersides and at the foot of walls
  lit += c * vec3(1.0, 0.72, 0.4) * 0.14 * max(-n.y, 0.0);
  if (mvBox > 0.5) {
    // edges are painted, not drawn: a broad soft shadow in the creases, a dry-brush light on top edges
    float crease = exp(-mvEdge * 5.5) * mvTiny;
    lit *= 1.0 - crease * 0.42 * (0.6 + 0.8 * s2);
    float dry = (1.0 - smoothstep(0.03, 0.16, mvEdge)) * step(0.55, s2 + s3 * 0.5) * mvTiny * max(mvUp, 0.0);
    lit += vec3(1.0, 0.93, 0.78) * dry * 0.4 * key;
    if (abs(mvUp) < 0.5) lit *= 0.8 + 0.2 * smoothstep(0.0, 3.0, mvV);
  }
  // rim of sky light so forms turn
  lit += amb * pow(1.0 - abs(dot(mvView, n)), 3.0) * 0.35;
  return mvMarks(lit, pal[3], pal[5], vec3(0.12, 0.08, 0.14), 0.7);
}

// ---------- 9: REALITY CORRUPTION. A level whose data is failing ----------
vec3 mvCorruptStyle(vec3 base, vec3 pal[7], vec3 sun, vec3 amb) {
  float tick = floor(uTime * 7.0);
  float slow = floor(uTime * 1.3);
  vec3 n = normalize(vWNormal);
  // untextured debug look: grey shaded geometry with a measurement grid
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 c = vec3(0.2 + lum * 0.4) * (0.5 + 0.6 * mvSun + 0.25 * n.y);
  float fine = mvDetail(0.06);
  float grid = max(mvLine(mvU, 0.012), mvLine(mvV, 0.012)) * fine * mvBox;
  float grid5 = max(mvLine(mvU / 5.0, 0.006), mvLine(mvV / 5.0, 0.006)) * mvBox;
  c = mix(c, vec3(0.85, 0.95, 1.0), grid * 0.22 + grid5 * 0.55);
  // chunks of surface have lost their texture: the classic magenta/black checker
  vec3 chunk = floor(vWPos / 4.0);
  float lost = step(0.86, mvHash(chunk + slow * 0.37)) * (1.0 - mvWalk * 0.75);
  float chk = mod(floor(mvU * 2.0) + floor(mvV * 2.0), 2.0);
  c = mix(c, mix(vec3(0.02), vec3(1.0, 0.0, 0.86), chk), lost * mvBox);
  // other chunks show raw memory: columns of flickering bytes
  float mem = step(0.9, mvHash(chunk * 1.7 + 11.0 + floor(uTime * 0.6))) * (1.0 - mvWalk);
  vec2 by = floor(vec2(mvU * 5.0, mvV * 3.0 + tick * 0.5));
  float byte = step(0.5, mvH2(by + chunk.xz));
  c = mix(c, vec3(0.1, 1.0, 0.45) * byte * 1.2, mem * mvBox * fine);
  // horizontal tears: bands of the world are colour-shifted and offset
  float band = floor(vWPos.y * 2.3 + tick * 0.13);
  float tear = step(0.93, mvHash(vec3(band, tick, 3.0)));
  c = mix(c, c.gbr * 1.4 + vec3(0.0, 0.2, 0.3), tear * 0.8);
  // z-fighting shimmer on big faces
  float zf = step(0.5, fract(gl_FragCoord.y * 0.25 + tick * 0.5)) * step(0.95, mvHash(chunk + 5.0 + slow));
  c = mix(c, vec3(0.0), zf * 0.6 * (1.0 - mvWalk));
  // edges: RGB-split wireframe
  if (mvBox > 0.5) {
    float w = max(0.03, mvPx * 1.3);
    float jitter = (mvH2(vec2(band, tick)) - 0.5) * 0.08;
    float r = 1.0 - smoothstep(w, w + mvPx, abs(mvEdge - 0.05 + jitter));
    float g = 1.0 - smoothstep(w, w + mvPx, mvEdge);
    float b = 1.0 - smoothstep(w, w + mvPx, abs(mvEdge - 0.1 - jitter));
    c = mix(c, vec3(1.6, 0.1, 0.2), r * 0.7 * mvTiny);
    c = mix(c, vec3(0.1, 0.4, 1.6), b * 0.7 * mvTiny);
    c = mix(c, vec3(1.5), g * mvTiny);
  }
  return mvMarks(c, pal[3], pal[5], vec3(0.0), 1.2);
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
  float mass = max(step(lum, 0.25), (1.0 - smoothstep(-0.7, -0.4, mvUp)));
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
  if (id < 1.5) return mvNeonStyle(base, pal, sun, amb);
  if (id < 2.5) return mvComicStyle(base, pal, sun, amb);
  if (id < 3.5) return mvLowPolyStyle(base, pal, sun, amb);
  if (id < 4.5) return mvPsycheStyle(base, pal, sun, amb);
  if (id < 5.5) return mvVoxelStyle(base, pal, sun, amb);
  if (id < 6.5) return mvInkStyle(base, pal, sun, amb);
  if (id < 7.5) return mvPaintedStyle(base, pal, sun, amb);
  if (id < 8.5) return mvSynthStyle(base, pal, sun, amb);
  if (id < 9.5) return mvCorruptStyle(base, pal, sun, amb);
  // a universe without a style yet: flat lit colour, markings intact
  return mvMarks(base * (amb + sun * mvSun), pal[3], pal[5], vec3(0.04), 1.0);
}

// Resolve both sides of the front. 'legacy' is the original inked result (style 0).
void mvResolve(vec3 legacy) {
  // undo the toon ramp to recover a clean shadow term and a smooth lambert
  float rampV = mvNdl < -0.5 ? 0.376 : mvNdl < 0.0 ? 0.588 : mvNdl < 0.5 ? 0.87 : 1.0;
  mvShadow = clamp(mvLit / rampV, 0.0, 1.0);
  mvSun = mvShadow * max(mvNdl, 0.0);
  vec3 toCam = cameraPosition - vWPos;
  mvDist = length(toCam);
  mvView = toCam / max(mvDist, 0.001);
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
