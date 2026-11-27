/**
 * Sky styles: one function per universe, sharing the sky shader's hash/noise/fbm helpers.
 * k[0..3] = top, horizon, bottom, sun colours of the universe being drawn.
 */
export const skyStyles = /* glsl */ `
// a ring of towers: returns coverage; 'win' receives a lit-window mask, 'top' the roof line
float mvTowers(float az, float h, float n, float hmax, float seed, out float win, out float roof) {
  float x = az * n;
  float cell = floor(x);
  float f = fract(x);
  float r = hash(vec2(cell, seed));
  float r2 = hash(vec2(cell, seed + 9.1));
  float wdt = 0.5 + r2 * 0.45;
  float inside = step(abs(f - 0.5), wdt * 0.5) * step(0.12, r2);
  float top = -0.03 + hmax * (0.2 + 0.8 * r * r);
  // a stepped crown on some towers
  top -= step(0.6, r2) * step(wdt * 0.28, abs(f - 0.5)) * hmax * 0.12;
  float cov = inside * step(h, top);
  roof = inside * (1.0 - smoothstep(0.0, 0.003, abs(h - top)));
  vec2 wg = vec2(f * (10.0 + r * 8.0), h * 520.0);
  win = cov * step(0.55, hash(floor(wg) + cell * 3.0)) * step(0.3, fract(wg.x)) * step(0.4, fract(wg.y));
  return cov;
}

// ---------- 1: NEON CYBERPUNK. A megacity under a wet violet night ----------
vec3 skyNeon(vec3 d, vec3 k[4]) {
  float h = d.y;
  float az = atan(d.x, d.z);
  vec3 cyan = vec3(0.1, 0.95, 1.0), mag = vec3(1.0, 0.12, 0.72);
  vec3 col = mix(k[1], k[0], smoothstep(-0.02, 0.55, h));
  col = mix(col, k[2], 1.0 - smoothstep(-0.45, 0.0, h));
  // low cloud lit from below by the city: slow rolling banks, pink and teal
  float cl = fbm(d.xz / (abs(h) + 0.25) * 0.9 + uTime * 0.006);
  vec3 under = mix(mag, cyan, smoothstep(0.35, 0.7, fbm(vec2(az * 1.3, 2.0))));
  col += under * smoothstep(0.45, 0.8, cl) * 0.2 * smoothstep(0.0, 0.25, h);
  // light pollution on the horizon
  col += mix(mag, cyan, 0.5 + 0.5 * sin(az * 2.0 + 1.0)) * exp(-abs(h) * 7.0) * 0.38;
  // a hazy moon
  float sd = max(dot(d, uSunDir), 0.0);
  col += k[3] * (smoothstep(0.9988, 0.9992, sd) * 1.2 + pow(sd, 90.0) * 0.35 + pow(sd, 9.0) * 0.07);
  // searchlights sweeping from the city
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float base = fi * 2.1 + 0.4;
    float sweep = base + sin(uTime * (0.11 + fi * 0.04) + fi) * 0.5;
    float beam = exp(-abs(az - sweep - (h * 0.6) * sin(uTime * 0.17 + fi * 2.0)) * 26.0);
    col += mix(cyan, vec3(1.0), 0.4) * beam * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.1, 0.6, h)) * 0.16;
  }
  // three ranks of towers, the far ones drowned in haze, the near ones black with lit windows
  if (h < 0.42 && h > -0.08) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float win, roof;
      float cov = mvTowers(az + fi * 0.37, h, 46.0 - fi * 13.0, 0.13 + fi * 0.1, 3.0 + fi * 7.0, win, roof);
      vec3 body = mix(k[1] * 0.75, vec3(0.012, 0.01, 0.035), fi / 2.0);
      col = mix(col, body, cov * (0.75 + 0.25 * fi / 2.0));
      vec3 wc = mix(vec3(1.0, 0.72, 0.36), mix(cyan, mag, step(0.5, hash(vec2(floor(az * 9.0), fi)))), step(0.5, hash(vec2(floor(az * 61.0), fi + 2.0))));
      col += wc * win * (0.35 + 0.45 * fi) * (0.7 + 0.3 * step(0.15, fract(uTime * 0.31 + hash(vec2(floor(az * 300.0), fi)))));
      col += mix(mag, cyan, fi / 2.0) * roof * 0.5;
    }
    // giant holo-signs hanging over the skyline
    float sg = az * 5.0;
    float sc = floor(sg);
    vec2 sf = vec2(fract(sg) - 0.5, (h - 0.13 - hash(vec2(sc, 4.0)) * 0.1) * 9.0);
    float on = step(0.45, hash(vec2(sc, 1.0)));
    float panel = step(abs(sf.x), 0.16) * step(abs(sf.y), 0.32) * on;
    float glyph = step(0.5, hash(floor(vec2(sf.x * 26.0, sf.y * 18.0 + uTime * 0.6)) + sc));
    vec3 sgc = mix(mag, cyan, step(0.5, hash(vec2(sc, 9.0))));
    col += sgc * panel * (0.25 + glyph * 0.85) * (0.8 + 0.2 * sin(uTime * 7.0 + sc));
    col += sgc * exp(-length(sf * vec2(3.0, 1.6)) * 2.2) * on * 0.25;
  }
  return col;
}

// ---------- 2: COMIC BOOK. Flat colour, sunburst rays, dot gradients, outlined clouds ----------
vec3 skyComic(vec3 d, vec3 k[4]) {
  float h = d.y;
  float az = atan(d.x, d.z);
  vec3 black = vec3(0.03, 0.03, 0.06);
  vec3 col = k[0];
  // the horizon colour comes in as bigger and bigger printed dots
  vec2 g = vec2(az * 34.0, h * 46.0);
  g.x += step(1.0, mod(floor(g.y), 2.0)) * 0.5;
  float r = length(fract(g) - 0.5);
  float size = (1.0 - smoothstep(0.0, 0.5, h)) * 0.62;
  col = mix(col, k[1], 1.0 - smoothstep(size - 0.03, size, r));
  col = mix(col, k[2], 1.0 - smoothstep(-0.3, -0.02, h));
  // a sunburst: alternating wedges radiating from the sun
  vec3 sdir = uSunDir;
  vec3 ax = normalize(cross(sdir, vec3(0.0, 1.0, 0.001)));
  vec3 ay = cross(ax, sdir);
  float ang = atan(dot(d, ay), dot(d, ax));
  float sd = dot(d, sdir);
  float wedge = step(0.5, fract(ang * 3.8197 + uTime * 0.01));
  col = mix(col, mix(col, vec3(1.0), 0.2), wedge * smoothstep(0.35, 0.97, sd));
  // sun: flat disc, heavy outline
  float disc = smoothstep(0.9962, 0.9966, sd);
  float ring = smoothstep(0.995, 0.9954, sd) - disc;
  col = mix(col, k[3] * 1.5, disc);
  col = mix(col, black, ring);
  // clouds: flat white, a flat shade tone underneath, and an ink outline
  if (h > -0.02) {
    vec2 cp = d.xz / (h + 0.3) * 1.2 + vec2(uTime * 0.008, 0.0);
    float c1 = fbm(cp);
    float c2 = fbm3(cp + vec2(0.0, 0.07));
    float body = step(0.6, c1);
    float ew = fwidth(c1) * 3.0 + 0.0005;
    float edge = (1.0 - smoothstep(ew * 0.6, ew, abs(c1 - 0.6))) * step(fwidth(c1), 0.05);
    float shade = body * (1.0 - step(0.6, c2));
    float vis = smoothstep(-0.02, 0.1, h);
    col = mix(col, vec3(1.0), body * vis);
    col = mix(col, k[1] * 0.75 + 0.2, shade * vis);
    col = mix(col, black, edge * vis);
  }
  return col;
}

// ---------- 3: LOW-POLY. A faceted dome, folded-paper peaks, a hexagon sun ----------
vec3 skyLowPoly(vec3 d, vec3 k[4]) {
  float h = d.y;
  float az = atan(d.x, d.z);
  // facet the dome: snap the gradient lookup to a triangle grid
  vec2 q = vec2(az * 5.0, h * 7.0);
  vec2 c = floor(q);
  vec2 f = fract(q);
  float tri = step(f.x, f.y);
  vec2 id = c * 2.0 + tri;
  float hq = (c.y + (tri > 0.5 ? 0.66 : 0.33)) / 7.0 + (hash(id) - 0.5) * 0.05;
  vec3 col = mix(k[1], k[0], smoothstep(-0.02, 0.7, hq));
  col *= 0.97 + 0.06 * hash(id + 5.0);
  col = mix(col, k[2], 1.0 - smoothstep(-0.35, -0.02, h));
  // sun: a hexagon with a soft facet halo
  vec3 sdir = uSunDir;
  vec3 ax = normalize(cross(sdir, vec3(0.0, 1.0, 0.001)));
  vec3 ay = cross(ax, sdir);
  vec2 sp = vec2(dot(d, ax), dot(d, ay)) / max(dot(d, sdir), 0.001);
  float hex = max(abs(sp.x) * 0.866 + abs(sp.y) * 0.5, abs(sp.y));
  col = mix(col, k[3] * 1.35, (1.0 - smoothstep(0.07, 0.073, hex)) * step(0.0, dot(d, sdir)));
  col += k[3] * (1.0 - smoothstep(0.07, 0.26, hex)) * 0.2 * step(0.0, dot(d, sdir));
  // two ranges of folded peaks: each slope is one flat tone, lit from the sun's side
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float x = az * (5.0 + fi * 4.0) + fi * 3.3;
    float cx = floor(x);
    float fx = fract(x);
    float a = hash(vec2(cx, 20.0 + fi)), b = hash(vec2(cx + 1.0, 20.0 + fi));
    // peak position inside the cell, valley at the cell borders
    float pk = 0.3 + 0.4 * hash(vec2(cx, 30.0 + fi));
    float ph = (0.05 + 0.2 * hash(vec2(cx, 40.0 + fi))) * (1.0 - fi * 0.45);
    float va = 0.02 * a, vb = 0.02 * b;
    float ridge = fx < pk ? mix(va, ph, fx / pk) : mix(ph, vb, (fx - pk) / (1.0 - pk));
    ridge -= 0.02;
    float cov = step(h, ridge);
    float lit = fx < pk ? 1.0 : 0.0;
    vec3 rock = mix(k[1] * 0.55, k[2] * 0.9, fi) * (0.75 + 0.45 * lit);
    // snow caps on the tall far peaks
    rock = mix(rock, vec3(0.97), step(ridge - 0.045 + fx * 0.01, h) * step(0.17, ph) * (1.0 - fi));
    col = mix(col, rock, cov);
  }
  return col;
}

// ---------- 6: INK. Paper, a black sun, washes of distant mountains ----------
vec3 skyInk(vec3 d, vec3 k[4]) {
  float h = d.y;
  float az = atan(d.x, d.z);
  vec3 paper = mix(k[1], k[0], smoothstep(0.0, 0.7, h));
  paper = mix(paper, k[2], 1.0 - smoothstep(-0.5, 0.0, h));
  // paper fibre + a faint wash of grey cloud
  float fib = fbm3(vec2(az * 40.0, h * 9.0));
  paper *= 0.96 + 0.06 * fib;
  float wash = fbm(d.xz / (abs(h) + 0.3) * 1.1 + uTime * 0.004);
  paper = mix(paper, paper * 0.8, smoothstep(0.52, 0.7, wash) * smoothstep(0.02, 0.3, h) * 0.7);
  // three ranges of mountains: far ones pale and flat, the nearest dark
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ridge = (fbm(vec2(az * (2.2 + fi * 1.4) + fi * 11.0, fi)) - 0.35) * (0.34 - fi * 0.08) - 0.03 - fi * 0.012;
    float cov = 1.0 - smoothstep(ridge - 0.004, ridge + 0.004, h);
    float tone = mix(0.62, 0.16, fi / 2.0);
    // mist gathers at the foot of each range
    float mist = smoothstep(ridge - 0.12, ridge, h);
    paper = mix(paper, mix(paper, vec3(tone), 0.35 + 0.65 * mist), cov);
  }
  // a flock of brush-tick birds
  vec2 bg = vec2(az * 14.0 + uTime * 0.05, h * 30.0);
  vec2 bc = floor(bg);
  vec2 bf = fract(bg) - 0.5;
  float bird = step(0.93, hash(bc)) * (1.0 - smoothstep(0.02, 0.05, abs(bf.y - abs(bf.x) * 0.7 + 0.1))) * step(abs(bf.x), 0.22);
  paper = mix(paper, vec3(0.08), bird * smoothstep(0.1, 0.2, h) * (1.0 - smoothstep(0.45, 0.6, h)));
  // the sun: a solid ink disc with a dry ring
  float sd = max(dot(d, uSunDir), 0.0);
  float disc = smoothstep(0.9975, 0.998, sd);
  float ringS = (1.0 - smoothstep(0.0003, 0.0008, abs(sd - 0.9955))) * step(0.4, hash(vec2(floor(az * 30.0), 3.0)));
  paper = mix(paper, k[3], clamp(disc + ringS * 0.6, 0.0, 1.0));
  return paper;
}

// ---------- 8: RETRO SYNTHWAVE. Striped sun, wireframe ranges, a grid to the horizon ----------
vec3 skySynth(vec3 d, vec3 k[4]) {
  float h = d.y;
  float az = atan(d.x, d.z);
  vec3 hot = vec3(1.0, 0.16, 0.62), cool = vec3(0.12, 0.85, 1.0);
  vec3 col = mix(k[1], k[0], pow(clamp(h * 1.6, 0.0, 1.0), 0.6));
  // stars, bigger and sparser than a real sky
  if (h > 0.02) {
    vec2 sp = d.xz / (h + 0.4) * 30.0;
    vec2 cell = floor(sp);
    float r = hash(cell);
    float dist = length(fract(sp) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6);
    col += vec3(1.0, 0.9, 1.0) * step(0.9, r) * (1.0 - smoothstep(0.0, 0.07, dist)) * (0.6 + 0.4 * sin(uTime * 2.0 + r * 50.0)) * smoothstep(0.02, 0.3, h);
  }
  // the sun sits on the horizon straight down the course, cut by widening dark bands
  vec3 sdir = normalize(vec3(0.0, 0.1, 1.0));
  vec3 ax = normalize(cross(sdir, vec3(0.0, 1.0, 0.0)));
  vec3 ay = cross(ax, sdir);
  vec2 sp2 = vec2(dot(d, ax), dot(d, ay)) / max(dot(d, sdir), 0.001);
  float rad = length(sp2);
  float front = step(0.0, dot(d, sdir));
  float R = 0.3;
  float disc = (1.0 - smoothstep(R - 0.004, R, rad)) * front;
  float yy = sp2.y / R;                       // -1 bottom .. 1 top
  float bandsP = fract((yy + 1.0) * 5.0 + uTime * 0.12);
  float cut = step(bandsP, (1.0 - (yy + 1.0) * 0.5) * 0.62) * step(yy, 0.25);
  vec3 sunC = mix(hot, k[3], smoothstep(-0.7, 0.9, yy)) * 1.5;
  col = mix(col, sunC, disc * (1.0 - cut));
  col += mix(hot, k[3], 0.4) * exp(-max(rad - R, 0.0) * 5.0) * 0.4 * front;
  // horizon glow
  col += hot * exp(-abs(h) * 14.0) * 0.55;
  // wireframe mountain ranges either side of the sun
  if (h > -0.02 && h < 0.3) {
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float x = az * (7.0 + fi * 5.0) + fi * 1.7;
      float cx = floor(x);
      float fx = fract(x);
      float a = hash(vec2(cx, 50.0 + fi)), b = hash(vec2(cx + 1.0, 50.0 + fi));
      float away = smoothstep(0.25, 0.9, abs(az));           // keep the sun clear
      float ridge = mix(a, b, fx) * (0.2 - fi * 0.07) * away - 0.01;
      float cov = step(h, ridge);
      col = mix(col, vec3(0.03, 0.0, 0.08), cov);
      float lineR = 1.0 - smoothstep(0.0, 0.004, abs(h - ridge));
      // wire: verticals at each vertex plus contour lines
      float wire = max(1.0 - smoothstep(0.0, 0.03, min(fx, 1.0 - fx)), 1.0 - smoothstep(0.0, 0.06, abs(fract(h * 60.0 / max(ridge * 9.0, 0.3)) - 0.5) * 2.0 - 0.9));
      col += mix(cool, hot, fi) * (lineR * 1.2 + wire * cov * 0.3);
    }
  }
  // below the horizon: the grid plane running out to infinity
  if (h < 0.0) {
    vec2 gp = d.xz / max(-h, 0.0005);
    gp.y += uTime * 0.8;
    float depth = 1.0 / max(-h, 0.0005);
    float fade = exp(-depth * 0.022);
    float lw = 0.03 + depth * 0.004;
    float lx = 1.0 - smoothstep(lw, lw + fwidth(gp.x) + 0.001, abs(fract(gp.x * 0.25 + 0.5) - 0.5));
    float ly = 1.0 - smoothstep(lw, lw + fwidth(gp.y) + 0.001, abs(fract(gp.y * 0.25 + 0.5) - 0.5));
    vec3 ground = mix(vec3(0.03, 0.0, 0.08), k[2], 0.4);
    col = mix(ground, col, smoothstep(-0.012, 0.0, h));
    col += hot * max(lx, ly) * fade * 1.1 * (1.0 - smoothstep(-0.012, 0.0, h) * 0.5);
  }
  return col;
}

vec3 skyHsv(float h, float s, float v) {
  vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

// ---------- 4: PSYCHEDELIC. A kaleidoscope sky around a watching iris ----------
vec3 skyPsyche(vec3 d, vec3 k[4]) {
  float t = uTime * 0.07;
  float az = atan(d.x, d.z);
  float h = d.y;
  // fold the sky into mirrored wedges, then warp a flowing field through them
  float seg = 3.14159 / 5.0;
  float fa = abs(mod(az + t * 0.6, seg * 2.0) - seg);
  vec2 p = vec2(fa * 2.2, acos(clamp(h, -1.0, 1.0)) * 1.6);
  float f1 = fbm(p * 1.3 + vec2(t, -t * 0.7));
  float f2 = fbm(p * 2.4 + f1 * 2.5 + vec2(-t * 1.3, t));
  float bands = (f1 * 0.6 + f2 * 0.6) * 7.0 + t * 3.0;
  float inBand = fract(bands);
  vec3 col = skyHsv(fract(floor(bands) * 0.13 + t), 0.8, 0.85) * (0.7 + 0.3 * inBand);
  col = mix(col, vec3(0.03, 0.0, 0.07), 1.0 - smoothstep(0.0, 0.07, min(inBand, 1.0 - inBand)));
  // concentric rings pulse out of the zenith
  float zen = acos(clamp(h, -1.0, 1.0));
  float ring = 0.5 + 0.5 * sin(zen * 16.0 - uTime * 1.1);
  col = mix(col, col.brg, smoothstep(0.75, 0.95, ring) * 0.5);
  // the "sun" is an iris: striated colour around a black pupil that slowly dilates
  vec3 sdir = uSunDir;
  vec3 ax = normalize(cross(sdir, vec3(0.0, 1.0, 0.001)));
  vec3 ay = cross(ax, sdir);
  vec2 sp = vec2(dot(d, ax), dot(d, ay)) / max(dot(d, sdir), 0.001);
  float r = length(sp);
  float front = step(0.0, dot(d, sdir));
  float R = 0.1;
  float pupil = R * (0.4 + 0.1 * sin(uTime * 0.6));
  float ang = atan(sp.y, sp.x);
  vec3 iris = skyHsv(fract(r * 3.0 - t * 2.0 + noise(vec2(ang * 9.0, 2.0)) * 0.3), 0.9, 1.1) * (0.6 + 0.4 * noise(vec2(ang * 40.0, r * 8.0)));
  float inIris = (1.0 - smoothstep(R - 0.006, R, r)) * front;
  col = mix(col, iris, inIris);
  col = mix(col, vec3(0.0), (1.0 - smoothstep(pupil - 0.006, pupil, r)) * front);
  col = mix(col, vec3(1.3), (1.0 - smoothstep(0.0, 0.006, abs(r - R))) * front);
  col += vec3(1.0) * (1.0 - smoothstep(0.0, 0.012, length(sp - vec2(-0.025, 0.025)))) * front * 0.9;
  // below the horizon the pattern sinks into a dark mirror
  col = mix(col, col * 0.25 + k[2] * 0.3, 1.0 - smoothstep(-0.25, 0.0, h));
  return col;
}

// ---------- 5: VOXEL. A sky made of big texels: square sun, block clouds, stepped hills ----------
vec3 skyVoxel(vec3 d, vec3 k[4]) {
  // snap the view direction onto a coarse cube grid: the whole sky becomes texels
  vec3 a = abs(d);
  float m = max(a.x, max(a.y, a.z));
  vec3 c3 = d / m;
  float res = 46.0;
  vec3 q = (floor(c3 * res) + 0.5) / res;
  vec3 qd = normalize(q);
  float h = qd.y;
  float steps = 9.0;
  vec3 col = mix(k[1], k[0], floor(clamp(h * 1.25, 0.0, 1.0) * steps) / steps);
  col = mix(col, k[2], 1.0 - step(-0.02, h));
  // square sun with a square halo
  vec3 sdir = uSunDir;
  vec3 ax = normalize(cross(sdir, vec3(0.0, 1.0, 0.001)));
  vec3 ay = cross(ax, sdir);
  vec2 sp = vec2(dot(qd, ax), dot(qd, ay)) / max(dot(qd, sdir), 0.001);
  float sq = max(abs(sp.x), abs(sp.y));
  float front = step(0.0, dot(qd, sdir));
  col = mix(col, mix(col, k[3], 0.35), step(sq, 0.2) * front);
  col = mix(col, k[3] * 1.4, step(sq, 0.11) * front);
  // flat block clouds on a plane, drifting one texel at a time
  if (h > 0.03) {
    vec2 cp = qd.xz / h;
    vec2 cc = floor(cp * 2.2 + vec2(floor(uTime * 0.25) * 0.25, 0.0));
    float cl = step(0.62, noise(cc * 0.37) * 0.7 + noise(cc * 0.11 + 9.0) * 0.5);
    float shade = step(0.62, noise((cc + vec2(0.0, 1.0)) * 0.37) * 0.7 + noise((cc + vec2(0.0, 1.0)) * 0.11 + 9.0) * 0.5);
    col = mix(col, mix(vec3(0.84, 0.9, 0.97), vec3(1.0), shade), cl * smoothstep(0.03, 0.14, h) * 0.95);
  }
  // stepped hills: two terraces of blocks with trees as single dark texels
  float az = atan(qd.x, qd.z);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float cx = floor(az * (26.0 + fi * 14.0));
    float hh = floor((noise(vec2(cx * 0.21, fi * 7.0)) * 0.16 + noise(vec2(cx * 0.05, fi)) * 0.12) * (1.0 - fi * 0.35) * 40.0) / 40.0 - 0.03;
    float cov = step(h, hh);
    vec3 hill = mix(vec3(0.3, 0.55, 0.3), vec3(0.42, 0.68, 0.34), fi) * mix(0.75, 1.0, step(hh - 0.03, h));
    hill = mix(hill, vec3(0.16, 0.36, 0.2), step(0.7, hash(vec2(cx, fi + 3.0))) * step(hh - 0.03, h));
    col = mix(col, mix(hill, k[1], 0.45 * (1.0 - fi)), cov);
  }
  return col;
}

// ---------- 7: PAINTED FANTASY. Towering brushed clouds, light shafts, far spires ----------
vec3 skyPainted(vec3 d, vec3 k[4]) {
  float h = d.y;
  float az = atan(d.x, d.z);
  float sd = max(dot(d, uSunDir), 0.0);
  // the canvas: a warm-to-cool gradient laid down in broad, visible strokes
  float strokeN = fbm3(vec2(az * 3.0 + h * 2.0, h * 14.0));
  vec3 col = mix(k[1], k[0], smoothstep(-0.05, 0.75, h + (strokeN - 0.5) * 0.12));
  col = mix(col, k[3], pow(sd, 5.0) * 0.5);
  // cumulus: two banks, lit warm toward the top and the sun, violet beneath
  if (h > -0.06) {
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      vec2 cp = d.xz / (abs(h) + 0.28 + fi * 0.12) * (0.8 + fi * 0.6) + vec2(uTime * (0.004 + fi * 0.002), fi * 3.7);
      float base_ = fbm(cp);
      float detail = fbm3(cp * 3.2 + base_ * 1.5);
      float dens = base_ * 0.78 + detail * 0.3;
      float thr = 0.56 - fi * 0.02;
      float edge = smoothstep(thr, thr + 0.07, dens + (strokeN - 0.5) * 0.06);
      float core = smoothstep(thr + 0.08, thr + 0.24, dens);
      vec3 lit = mix(vec3(1.0, 0.86, 0.7), vec3(1.0, 0.97, 0.9), core) * (0.85 + 0.5 * pow(sd, 2.0));
      vec3 under = mix(k[0] * 0.9 + vec3(0.12, 0.06, 0.16), k[1], 0.25);
      // dense cores and higher clouds catch the light; thin edges and low banks sit in shade
      vec3 cloud = mix(under, lit, smoothstep(0.25, 0.75, core * 0.7 + detail * 0.4 + h * 0.6));
      col = mix(col, cloud, edge * smoothstep(-0.06, 0.1, h) * (0.9 - fi * 0.15));
    }
  }
  // shafts of light fanning down from the sun
  vec3 sdir = uSunDir;
  vec3 ax = normalize(cross(sdir, vec3(0.0, 1.0, 0.001)));
  vec3 ay = cross(ax, sdir);
  if (sd > 0.3) {
    float ang = atan(dot(d, ay), dot(d, ax));
    float shaft = smoothstep(0.55, 0.9, noise(vec2(ang * 7.0, 1.0))) * smoothstep(0.3, 0.9, sd) * (1.0 - smoothstep(0.985, 1.0, sd));
    col += k[3] * shaft * 0.22;
  }
  col = mix(col, k[3] * 1.5, smoothstep(0.9968, 0.9982, sd));
  col += k[3] * pow(sd, 40.0) * 0.4;
  // distant ranges fading into the air, with a citadel of thin spires on the nearest
  if (h < 0.3) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float ridge = (fbm3(vec2(az * (1.8 + fi * 1.1) + fi * 9.0, fi * 2.0)) - 0.32) * (0.3 - fi * 0.07) - 0.02;
      if (i == 2) {
        float cx = floor(az * 60.0);
        float spire = step(0.86, hash(vec2(cx, 5.0))) * (0.03 + 0.07 * hash(vec2(cx, 8.0))) * (1.0 - abs(fract(az * 60.0) - 0.5) * 2.0);
        ridge += spire * step(0.3, noise(vec2(az * 1.3, 4.0)));
      }
      float cov = 1.0 - smoothstep(ridge - 0.003, ridge + 0.003, h + (strokeN - 0.5) * 0.004);
      vec3 rock = mix(k[1] * 0.85, k[2], fi / 2.0);
      rock = mix(rock, rock * 1.25 + k[3] * 0.1, smoothstep(ridge - 0.05, ridge, h));
      col = mix(col, mix(rock, col, 0.55 - fi * 0.22), cov);
    }
  }
  col = mix(col, k[2] * 0.8, 1.0 - smoothstep(-0.4, -0.03, h));
  col *= 0.95 + 0.1 * strokeN;
  return col;
}

// ---------- 9: REALITY CORRUPTION. The skybox is failing to load ----------
vec3 skyCorrupt(vec3 d, vec3 k[4]) {
  float tick = floor(uTime * 6.0);
  float slow = floor(uTime * 0.8);
  float h = d.y;
  float az = atan(d.x, d.z);
  // rows of the sky slide sideways
  float row = floor(h * 30.0);
  az += step(0.9, hash(vec2(row, tick))) * (hash(vec2(tick, row)) - 0.5) * 0.6;
  // a banded, low bit-depth gradient
  vec3 col = mix(k[1], k[0], floor(clamp(h * 1.4, 0.0, 1.0) * 6.0) / 6.0);
  col = mix(col, k[2], 1.0 - step(0.0, h));
  // the sky is a grid of tiles; some never loaded (black, or static), some show the wrong texture
  vec2 tg = vec2(az * 7.0, h * 9.0);
  vec2 tc = floor(tg);
  vec2 tf = fract(tg);
  float tr = hash(tc + slow * 0.13);
  float staticN = hash(floor(tf * 22.0) + tick + tc);
  col = mix(col, vec3(0.0), step(0.8, tr));
  col = mix(col, vec3(staticN) * vec3(0.8, 0.95, 1.0), step(0.9, tr));
  float chk = mod(floor(tf.x * 6.0) + floor(tf.y * 6.0), 2.0);
  col = mix(col, mix(vec3(0.02), vec3(1.0, 0.0, 0.86), chk), step(0.955, tr));
  // tile seams glow like a wireframe
  float seam = 1.0 - smoothstep(0.0, 0.02, min(min(tf.x, tf.y), min(1.0 - tf.x, 1.0 - tf.y)));
  col += vec3(0.1, 0.9, 1.0) * seam * 0.35;
  // a sun that cannot decide where it is: three offset ghosts in R, G and B
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 off = vec3(sin(tick * 1.7 + fi * 2.0), 0.0, cos(tick * 1.3 + fi)) * 0.03 * step(0.6, hash(vec2(tick, fi)));
    float sdn = dot(d, normalize(uSunDir + off));
    vec3 ch = vec3(fi == 0.0 ? 1.0 : 0.0, fi == 1.0 ? 1.0 : 0.0, fi == 2.0 ? 1.0 : 0.0);
    col += ch * step(0.9965, sdn) * 1.3;
  }
  // a vertical tear where another universe shows through as raw colour bars
  float tearX = fract(az * 0.5 + slow * 0.37);
  float tear = step(tearX, 0.035) * step(0.5, hash(vec2(slow, 2.0)));
  col = mix(col, skyHsv(floor(h * 14.0 + tick) * 0.14, 0.9, 1.0), tear * step(0.0, h));
  return col;
}

vec3 mvSky(float id, vec3 d, vec3 k[4]) {
  if (id < 1.5) return skyNeon(d, k);
  if (id < 2.5) return skyComic(d, k);
  if (id < 3.5) return skyLowPoly(d, k);
  if (id < 4.5) return skyPsyche(d, k);
  if (id < 5.5) return skyVoxel(d, k);
  if (id < 6.5) return skyInk(d, k);
  if (id < 7.5) return skyPainted(d, k);
  if (id < 8.5) return skySynth(d, k);
  if (id < 9.5) return skyCorrupt(d, k);
  float h = d.y;
  vec3 col = mix(k[1], k[0], smoothstep(0.0, 0.8, h));
  return mix(col, k[2], 1.0 - smoothstep(-0.4, 0.0, h));
}
`;
