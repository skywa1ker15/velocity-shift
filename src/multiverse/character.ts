/**
 * Character styles: how each universe draws the runner, the first-person arms, the sword and the
 * destructible props (they all share one material). Same idea as the surface styles: the shader
 * gathers facts (part colour, light, rim, outline hull, glow) and each universe re-renders them.
 * Style 0 is the original inked-and-dotted look.
 */
export const charDecl = /* glsl */ `
uniform vec3 uPalA[7];
uniform vec3 uPalB[7];
uniform vec3 uSunA;
uniform vec3 uSunB;
uniform vec3 uAmbA;
uniform vec3 uAmbB;
uniform float uInB;
uniform float uViewModel;
uniform float uTime;
varying vec3 vMvW;
float chLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// alb = part colour, lit = 0..1 sun on this pixel, rim = 0 facing .. 1 silhouette,
// hull = outline shell, glow = accent glow amount, n = view-space normal
vec3 mvChar(float id, vec3 alb, float lit, float rim, float hull, vec3 glow, vec3 n, vec3 pal[7], vec3 sun, vec3 amb) {
  vec3 cyan = vec3(0.1, 0.95, 1.0), mag = vec3(1.0, 0.12, 0.72);
  vec2 fc = gl_FragCoord.xy;
  if (id < 1.5) {
    // NEON: a dark figure cut out by light. Outline becomes a neon tube; rim picks up the street
    if (hull > 0.5) return mix(cyan, mag, step(0.0, n.x)) * 1.6;
    vec3 c = alb * (amb * 0.8 + sun * lit * 0.45);
    c += mix(mag, cyan, 0.5 + 0.5 * n.x) * pow(rim, 2.2) * 0.9;
    // wet sheen: a tight highlight that slides with the view
    c += vec3(0.7, 0.85, 1.0) * pow(max(n.y * 0.6 + n.z * 0.8, 0.0), 24.0) * 0.35;
    return c + glow * 1.6;
  }
  if (id < 2.5) {
    // COMIC: flat colour, hard shadow full of dots, white shine, black outline
    if (hull > 0.5) return vec3(0.03, 0.03, 0.06);
    vec3 flat_ = alb * 1.12;
    vec2 hg = mat2(0.866, -0.5, 0.5, 0.866) * fc / 6.0;
    float dots = 1.0 - smoothstep(0.3, 0.36, length(fract(hg) - 0.5));
    float dark = 1.0 - step(0.5, lit);
    vec3 c = mix(flat_, flat_ * vec3(0.5, 0.48, 0.72), dark * (0.25 + 0.75 * dots));
    c = mix(c, vec3(1.0), step(0.86, rim) * step(0.15, n.y) * (1.0 - dark) * 0.75);
    return c + glow * 0.5;
  }
  if (id < 3.5) {
    // LOW-POLY: flat facets from screen-space derivatives, no outline, soft warm/cool light
    vec3 fn = normalize(cross(dFdx(vMvW), dFdy(vMvW)));
    float nl = clamp(fn.y * 0.65 + 0.4 + (mvH2(floor(fn.xz * 6.0)) - 0.5) * 0.12, 0.0, 1.0);
    if (hull > 0.5) return alb * 0.0 + amb * 0.25;
    vec3 c = alb * (amb * (0.7 + 0.5 * nl) + sun * nl * (0.45 + 0.55 * lit));
    return mix(c, c * vec3(0.82, 0.9, 1.15), (1.0 - lit) * 0.3) + glow * 0.8;
  }
  if (id > 5.5 && id < 6.5) {
    // INK: paper or black, with brushed strokes where the two meet
    if (hull > 0.5) return vec3(0.035, 0.035, 0.045);
    float tone = chLum(alb) * (0.35 + 0.75 * lit);
    float stroke = step(0.5, fract((fc.x * 0.6 + fc.y) / 7.0));
    float inkiness = 1.0 - smoothstep(0.22, 0.26, tone + stroke * 0.07);
    float wash = (1.0 - smoothstep(0.42, 0.46, tone)) * (1.0 - inkiness);
    vec3 paper = vec3(0.955, 0.94, 0.9);
    vec3 c = mix(paper, paper * 0.62, wash);
    c = mix(c, vec3(0.035, 0.035, 0.045), inkiness);
    return mix(c, pal[5], clamp(chLum(glow) * 2.0, 0.0, 1.0));
  }
  if (id > 7.5 && id < 8.5) {
    // SYNTHWAVE: chrome-black body, sunset rim, scanlines, hot outline
    if (hull > 0.5) return vec3(1.0, 0.16, 0.62) * 1.8;
    vec3 c = mix(vec3(0.04, 0.012, 0.09), alb * 0.35, 0.45) * (0.7 + 0.5 * lit);
    vec3 sunset = mix(vec3(1.0, 0.16, 0.62), vec3(1.0, 0.75, 0.25), clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
    c += sunset * pow(rim, 1.8) * 1.1;
    c += vec3(0.12, 0.85, 1.0) * step(0.9, fract(fc.y / 4.0)) * 0.1;
    return c + glow * 1.7;
  }
  if (id > 3.5 && id < 4.5) {
    // PSYCHEDELIC: the figure is a moving heat-map of itself with a white keyline
    if (hull > 0.5) return vec3(1.3);
    float band = fract(chLum(alb) * 2.0 + lit * 1.5 + rim * 1.2 + uTime * 0.25);
    vec3 k = clamp(abs(fract(band + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    vec3 c = mix(alb, k, 0.7) * (0.55 + 0.6 * lit);
    c = mix(c, vec3(0.02, 0.0, 0.05), step(0.94, fract(band * 6.0)));
    return c + glow;
  }
  if (id > 4.5 && id < 5.5) {
    // VOXEL: three flat steps of light and a chunky dither where they meet
    if (hull > 0.5) return vec3(0.07, 0.06, 0.08);
    float dither = step(0.5, fract((floor(fc.x / 3.0) + floor(fc.y / 3.0)) * 0.5));
    float st = floor(clamp(lit + dither * 0.12, 0.0, 0.999) * 3.0) / 2.0;
    vec3 c = alb * (0.5 + 0.6 * st) * (0.6 + 0.6 * dot(amb + sun * 0.5, vec3(0.333)));
    return c + glow * 0.7;
  }
  if (id > 6.5 && id < 7.5) {
    // PAINTED: soft warm key, cool shade, strokes across the form, no outline
    float stroke = mvNoise(vec3(fc * 0.045, 3.0)) * 0.6 + mvNoise(vec3(fc.x * 0.02, fc.y * 0.2, 7.0)) * 0.4;
    if (hull > 0.5) return alb * 0.0 + amb * vec3(0.3, 0.26, 0.4);
    float key = smoothstep(0.1, 0.8, lit + (stroke - 0.5) * 0.3);
    vec3 c = alb * (0.85 + 0.3 * stroke) * (amb * vec3(0.75, 0.88, 1.2) * 0.95 + sun * vec3(1.1, 1.0, 0.84) * key);
    c += amb * pow(rim, 3.0) * 0.35;
    return c + glow * 0.9;
  }
  if (id > 8.5) {
    // CORRUPTION: untextured grey with scan tears and a split-colour outline
    float tick = floor(uTime * 7.0);
    if (hull > 0.5) return mix(vec3(1.6, 0.1, 0.2), vec3(0.1, 0.4, 1.6), step(0.0, n.x));
    vec3 c = vec3(0.25 + chLum(alb) * 0.5) * (0.45 + 0.7 * lit);
    float row = floor(fc.y / 6.0);
    float tear = step(0.9, mvH2(vec2(row, tick)));
    c = mix(c, alb.gbr * 1.4, tear);
    c = mix(c, vec3(0.1, 1.0, 0.45), step(0.97, mvH2(floor(fc / 8.0) + tick)) * 0.8);
    return c + glow * 1.3;
  }
  // a universe without a character style yet: simple lit colour
  if (hull > 0.5) return vec3(0.04);
  return alb * (amb + sun * lit) + glow;
}
`;
