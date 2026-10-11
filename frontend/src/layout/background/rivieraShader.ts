/**
 * The Riviera scene's fragment shader. It works in the original artwork's pixels (1672×941) so the
 * positions below can be read straight off the picture. Each effect only touches its own mask:
 *   masks A: r water, g foam, b smoke    masks B: r sky (core), g palm sway, b flag / boat
 *   masks C: r the exact sky, for hiding birds and the plane behind palms and buildings
 */
export const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uPlate;
uniform sampler2D uMasksA;
uniform sampler2D uMasksB;
uniform sampler2D uMasksC;
uniform sampler2D uPlane;
uniform vec2 uRes;      // canvas size, device px
uniform vec2 uOffset;   // where the artwork's top-left lands, device px
uniform float uScale;   // device px per artwork px
uniform float uTime;    // seconds

out vec4 outColor;

const vec2 IMG = vec2(1672.0, 941.0);
const vec2 SUN = vec2(1637.0, 527.0);
const float HORIZON = 578.0;
const vec2 PLANE_SIZE = vec2(226.0, 87.8); // the sprite, in artwork px
const float BANNER_FROM = 0.33;            // where the banner starts along the sprite

// ---------- noise ----------
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}

vec3 plate(vec2 p) { return texture(uPlate, p / IMG).rgb; }
vec3 masksA(vec2 p) { return texture(uMasksA, p / IMG).rgb; }
vec3 masksB(vec2 p) { return texture(uMasksB, p / IMG).rgb; }
float exactSky(vec2 p) { return texture(uMasksC, p / IMG).r; }

// ---------- a gull: two bent wings, flapping ----------
float bird(vec2 q, float flap) {
  q.x = abs(q.x);
  vec2 elbow = vec2(0.45, -0.18 - 0.25 * flap);
  vec2 tip = vec2(1.0, 0.05 + 0.55 * flap);
  vec2 pa = q, ba = elbow;
  float h1 = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float d1 = length(pa - ba * h1) - mix(0.11, 0.07, h1);
  vec2 pb = q - elbow, bb = tip - elbow;
  float h2 = clamp(dot(pb, bb) / dot(bb, bb), 0.0, 1.0);
  float d2 = length(pb - bb * h2) - mix(0.07, 0.015, h2);
  float body = length(q * vec2(1.6, 1.0)) - 0.12;
  return min(min(d1, d2), body);
}

float flock(vec2 p, float t) {
  // A flock of five crosses right to left every 70 s, taking ~40 s.
  float cycle = 70.0, k = mod(t + 25.0, cycle);
  if (k > 42.0) return 0.0;
  float a = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 slot = vec2(fi * 34.0 + hash(vec2(fi, 3.0)) * 12.0, abs(fi - 1.5) * 18.0 - fi * 8.0);
    vec2 c = vec2(1760.0 - k * 46.0, 175.0 + sin(t * 0.35 + fi) * 8.0) + slot;
    float size = 11.0 + hash(vec2(fi, 9.0)) * 3.5;
    float flap = sin(t * (7.0 + fi * 0.6) + fi * 1.7);
    float d = bird((p - c) / size, flap) * size;
    a = max(a, smoothstep(0.9, -0.3, d));
  }
  return a;
}

// ---------- exhaust smoke: puffs leaving the two pipes, drifting left and up ----------
float plume(vec2 p, vec2 tip, float t, float seed) {
  vec2 q = p - tip;
  float along = -q.x;                       // distance travelled to the left
  if (along < -6.0 || along > 330.0) return 0.0;
  float rise = along * 0.28 + along * along * 0.0006;
  float width = 8.0 + along * 0.32;
  float across = (q.y + rise) / width;
  float body = exp(-across * across * 1.6);
  vec2 flow = vec2(q.x * 0.022 + t * 0.9, q.y * 0.03 + t * 0.25 + seed);
  float n = fbm(flow + fbm(flow * 1.7 - t * 0.2) * 0.8);
  float fade = smoothstep(-6.0, 14.0, along) * smoothstep(330.0, 90.0, along);
  return clamp(body * fade * smoothstep(0.35, 0.8, n) * 1.25, 0.0, 1.0);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = (frag - uOffset) / uScale;
  float t = uTime;

  vec3 ma = masksA(p);
  vec3 mb = masksB(p);
  vec2 d = vec2(0.0);

  // Palms: a gusty breeze, leaves moving more than trunks (the mask carries the weight).
  float gust = 0.65 + 0.35 * sin(t * 0.31) * sin(t * 0.17 + 1.3);
  if (mb.g > 0.002) {
    float ph = p.y * 0.011 + p.x * 0.004;
    d.x += mb.g * (sin(t * 1.25 + ph) * 3.0 + sin(t * 3.1 + ph * 2.7) * 0.8 + (noise(p * 0.05 + t * 0.8) - 0.5) * 1.6) * gust;
    d.y += mb.g * sin(t * 1.05 + ph * 1.6) * 1.1 * gust;
  }

  // Sky: the clouds slide and breathe slowly (kept off the palms and buildings).
  float skyAmt = smoothstep(0.92, 1.0, mb.r) * (1.0 - smoothstep(0.0, 0.05, mb.g));
  if (skyAmt > 0.01) {
    vec2 c = vec2(sin(t * 0.045 + p.y * 0.008) * 9.0 + (noise(p * 0.012 + t * 0.06) - 0.5) * 5.0,
                  (noise(p * 0.02 - t * 0.05) - 0.5) * 1.5);
    if (masksB(p - c).r > 0.97) d += c * skyAmt;
  }

  // Water. Swells roll in toward the beach (their crests travel down the picture), and in the surf
  // the waves run up the sand and slide back. A wave can cover sand just below the waterline, so the
  // surf zone reaches past the water mask; every sample must still land on water.
  float near = clamp((p.y - HORIZON) / 125.0, 0.0, 1.0);
  float surf = smoothstep(636.0, 668.0, p.y) * smoothstep(1130.0, 1150.0, p.x);
  float shore = masksA(p - vec2(0.0, 16.0)).r * (1.0 - ma.r) * surf; // sand a wave can reach
  float wet = max(ma.r, shore);
  float wash = 0.0;
  if (wet > 0.01) {
    vec2 w = vec2(
      sin(p.y * 0.8 + t * 1.5 + sin(p.x * 0.018 + t * 0.4) * 2.0) * (0.4 + near * 1.2),
      sin(p.y * 0.3 - t * 2.0 + p.x * 0.01 + sin(p.x * 0.004 + t * 0.2) * 3.0) * (0.5 + near * 2.2));
    // the run-up: a slow surge, lingering out and rushing in, at its own pace along the beach
    float surge = 0.5 + 0.5 * sin(t * 0.55 + p.x * 0.006 + noise(vec2(p.x * 0.008, t * 0.08)) * 2.5);
    wash = surf * surge * surge * 13.0;
    w.y += wash;
    if (masksA(p - w).r > 0.35) d += w * wet;
  }

  // The lifeguard flag flaps away from its pole; the sailboat bobs.
  if (mb.b > 0.01) {
    if (p.x < 1540.0) {
      float s = clamp((p.x - 1463.0) / 20.0, 0.0, 1.0);
      d += mb.b * s * vec2(sin(t * 7.5 - p.x * 0.6) * 0.8, sin(t * 6.3 - p.x * 0.5) * 1.3);
    } else {
      d += mb.b * vec2(sin(t * 0.6) * 0.7, sin(t * 1.3) * 0.9);
    }
  }

  vec3 col = plate(p - d);

  // Smoke already in the picture: drift it left with the flow.
  if (ma.b > 0.01) {
    vec2 s = vec2(t * 7.0, -t * 1.5);
    vec2 off = vec2(mod(s.x, 24.0), 0.0);
    float f = mod(s.x, 24.0) / 24.0;
    vec2 warp = vec2(noise(p * 0.04 + t * 0.3), noise(p * 0.04 - t * 0.25)) * 5.0 - 2.5;
    vec3 a = plate(p + off + warp);
    vec3 b = plate(p + off - vec2(24.0, 0.0) + warp);
    vec3 drift = mix(a, b, f);
    float keep = min(masksA(p + off + warp).b, masksA(p + off - vec2(24.0, 0.0) + warp).b);
    col = mix(col, drift, ma.b * keep * 0.85);
  }

  // Sand the wave has just run over: lacy white foam that fizzes at the front.
  if (shore > 0.01 && wash > 0.5) {
    float covered = shore * smoothstep(0.3, 0.6, masksA(p - d).r);
    float lace = smoothstep(0.42, 0.7, fbm(p * vec2(0.09, 0.3) + vec2(t * 0.2, -t * 0.6)));
    col = mix(col, vec3(0.97, 0.96, 0.93), covered * lace * 0.75);
  }

  // Foam glints as the waves break.
  col += ma.g * vec3(0.10, 0.11, 0.12) * (0.5 + 0.5 * sin(t * 0.8 + p.x * 0.012 - 1.2));

  // Sun glints on the water: brightest in a path under the sun, widening toward the shore.
  if (ma.r > 0.01) {
    vec2 cellSize = vec2(7.0, 2.6);
    vec2 cell = floor(p / cellSize);
    float r = hash(cell);
    float tw = pow(max(0.0, sin(t * (1.5 + r * 2.5) + r * 60.0)), 18.0);
    vec2 fp = (fract(p / cellSize) - 0.5) * vec2(1.0, 2.2);
    float spot = smoothstep(0.5, 0.0, length(fp));
    float path = exp(-pow((p.x - SUN.x) / (40.0 + (p.y - HORIZON) * 1.4), 2.0));
    col += ma.r * tw * spot * vec3(1.0, 0.86, 0.6) * (0.18 + path * 1.3);
  }

  // The sun: a soft glow that breathes.
  float sr = length(p - SUN);
  float pulse = 1.0 + 0.08 * sin(t * 0.7);
  col += vec3(1.0, 0.72, 0.4) * (exp(-sr / 26.0) * 0.28 + exp(-sr / 140.0) * 0.12) * pulse;

  // Things in the sky are hidden behind palms and buildings: wherever the (swaying) picture isn't sky.
  float open = smoothstep(0.3, 0.7, exactSky(p - d));

  // Birds (they only fly through this band of sky).
  if (open > 0.0 && p.y > 60.0 && p.y < 320.0) {
    float b = flock(p, t) * open;
    col = mix(col, vec3(0.24, 0.22, 0.34), b * 0.9);
  }

  // The banner plane: right to left every 80 s, taking ~55 s.
  float pk = mod(t + 8.0, 80.0);
  vec2 planeAt = vec2(1720.0 - pk * 36.0, 104.0 + sin(t * 0.4) * 4.0);
  vec2 uv = (p - planeAt) / PLANE_SIZE;
  if (uv.x > -0.05 && uv.x < 1.05 && uv.y > -0.2 && uv.y < 1.2) {
    float bx = max(0.0, uv.x - BANNER_FROM);
    uv.y += sin(uv.x * 16.0 - t * 7.0) * 0.022 * bx;   // the banner flutters
    uv.y += sin(t * 0.9) * 0.01 * uv.x;                // and the whole tow sways a little
    vec4 sprite = texture(uPlane, uv);
    sprite *= step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    col = col * (1.0 - sprite.a * open) + sprite.rgb * open; // premultiplied
  }

  // Fresh exhaust from the two pipes.
  if (p.x > 180.0 && p.x < 545.0 && p.y > 430.0 && p.y < 740.0) {
    float s = max(plume(p, vec2(522.0, 641.0), t, 0.0), plume(p, vec2(508.0, 695.0), t * 1.07, 5.0));
    vec3 smokeCol = mix(vec3(0.93, 0.80, 0.80), vec3(0.98, 0.92, 0.88), noise(p * 0.05 + t));
    col = mix(col, smokeCol, s * 0.5);
  }

  // A gentle vignette keeps the edges calm under the glass panes.
  vec2 v = frag / uRes - 0.5;
  col *= 1.0 - dot(v, v) * 0.35;

  outColor = vec4(col, 1.0);
}
`
