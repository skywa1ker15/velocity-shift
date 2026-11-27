/**
 * Sky styles: one function per universe, sharing the sky shader's hash/noise/fbm helpers.
 * k[0..3] = top, horizon, bottom, sun colours of the universe being drawn.
 */
export const skyStyles = /* glsl */ `
// ---------- 6: INK. Paper, a black sun, washes of distant mountains ----------
vec3 skyInk(vec3 d, vec3 k[4]) {
  float h = d.y;
  float az = atan(d.x, d.z);
  vec3 paper = mix(k[1], k[0], smoothstep(0.0, 0.7, h));
  paper = mix(paper, k[2], smoothstep(0.0, -0.5, h));
  // paper fibre + a faint wash of grey cloud
  float fib = fbm(vec2(az * 40.0, h * 9.0));
  paper *= 0.96 + 0.06 * fib;
  float wash = fbm(d.xz / (abs(h) + 0.3) * 1.1 + uTime * 0.004);
  paper = mix(paper, paper * 0.8, smoothstep(0.52, 0.7, wash) * smoothstep(0.02, 0.3, h) * 0.7);
  // three ranges of mountains, far ones pale and flat, the nearest dark
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ridge = (fbm(vec2(az * (2.2 + fi * 1.4) + fi * 11.0, fi)) - 0.35) * (0.34 - (2.0 - fi) * 0.08) - 0.03 + (2.0 - fi) * 0.012;
    float cov = 1.0 - smoothstep(ridge - 0.004, ridge + 0.004, h);
    float tone = mix(0.62, 0.16, fi / 2.0);
    // mist gathers at the foot of each range
    float mist = smoothstep(ridge - 0.12, ridge, h);
    paper = mix(paper, mix(paper, vec3(tone), 0.35 + 0.65 * mist), cov);
  }
  // the sun: a solid ink disc with a dry ring
  float sd = max(dot(d, uSunDir), 0.0);
  float disc = smoothstep(0.9975, 0.998, sd);
  float ringS = (1.0 - smoothstep(0.0003, 0.0008, abs(sd - 0.9955))) * step(0.4, hash(vec2(floor(az * 30.0), 3.0)));
  paper = mix(paper, k[3], clamp(disc + ringS * 0.6, 0.0, 1.0));
  return paper;
}

vec3 mvSky(float id, vec3 d, vec3 k[4]) {
  if (id > 5.5 && id < 6.5) return skyInk(d, k);
  float h = d.y;
  vec3 col = mix(k[1], k[0], smoothstep(0.0, 0.8, h));
  return mix(col, k[2], smoothstep(0.0, -0.4, h));
}
`;
