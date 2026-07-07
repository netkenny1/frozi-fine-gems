// js/immersive.js
// "Into the stone" — the immersive scroll-scrubbed 3D homepage.
//
// This file (Task 3) is the foundation only: a mount guard, a Three.js
// renderer/camera/scene, a hand-rolled scroll rig, and chapter-copy fades
// driven off that rig. A placeholder spinning icosahedron stands in for the
// procedural emerald that a later task (Task 4) builds. Later tasks also add
// the camera spline, post-processing bloom chain, particles, and ledger
// plates — this module is deliberately left growable.
//
// Fallback contract: if the user prefers reduced motion, or a WebGL context
// can't be created, mount() must leave the page exactly as it started —
// canvas hidden, body without `is-immersive` — so index.html reads as the
// plain stacked page built in Task 2.

import * as THREE from "../vendor/three.module.min.js";

// The emerald shaders below are hand-authored GLSL ES 1.00, gamma-corrected
// in-shader (see the pow(col, 0.4545) at the end of GEM_FS). To keep parity
// with the raw-WebGL 404 stone (js/gem.js) we take Three fully out of the
// color pipeline: no automatic sRGB encode on output, no texture decode.
THREE.ColorManagement.enabled = false;

// Touch devices get a slightly lower pixel-ratio cap than desktop: phone DPRs
// run to 3+, and the full-res scene target + MSAA would triple the fill cost
// for detail a 6" screen can't show. 2 is retina-crisp; desktop gets 2.25 so
// facet edges stay clean on 4K/5K monitors.
const IS_TOUCH = navigator.maxTouchPoints > 0;
const DPR_CAP = IS_TOUCH ? 2 : 2.25;
const LERP_K = 0.07;

// Fog color 0x07130d (deep viridian black) as display-space RGB — the shaders
// gamma-correct themselves, so we mix toward this already-encoded value.
const FOG_RGB = [0x07 / 255, 0x13 / 255, 0x0d / 255];
const FOG_DENSITY_MAX = 0.3;

// ---------------------------------------------------------------------------
// Camera spline — the six-chapter travel INTO the stone. The emerald sits at
// the origin (widest ring ~1.0 across, front face at z~+0.72). The path starts
// high and far in front (small stone in darkness), dives through the crown at
// z~+0.7, threads the green interior, and exits far out the pavilion at -Z.
// Control points are tuned by eye against the six verification screenshots (see
// task-5-report.md); getPointAt is arc-length parameterized so speed is even.
// ---------------------------------------------------------------------------
// Retimed after review: the old path spent p ~.06-.22 with the camera 0.5-1.5
// units from the stone — a fifth of the scroll staring at giant flat facets.
// Now the approach is gradual (three points spread over z 6.2 -> 0.9, with a
// small lateral sweep for parallax), and the short close-in leg is fully covered
// by the crossing veil (see uVeil in COMP_FS / tick()).
const CAM_PATH_POINTS = [
  [-0.35, 0.34, 6.2],  // ch1: far, slightly off-axis — stone small in the dark
  [-0.18, 0.26, 4.3],  // ch2 approach: drifting onto the axis
  [0, 0.15, 2.3],      // ch2: the stone large but whole in frame
  [0, 0.05, 0.9],      // the dive — veil takes over here
  [0, 0.00, -1.3],     // ch3/4: inside the green
  [0, -0.08, -3.2],    // ch4: interior wall
  [0, -0.16, -5.0],    // ch5: deeper interior
  [0, 0.05, -6.8],     // ch6: descending the pavilion, walls receding behind
];

// NOTE ON THE EASE: the brief suggested smootherstep, but the journey needs a
// FAST approach (ch1 far → ch2 crown facet inside the first fifth of scroll)
// and a settled interior — smootherstep's ease-in shoulder makes the first ~20%
// of scroll barely move (ch1 and ch2 came out near-identical). A decelerating
// ease (easeOutQuad-ish, exponent 1.85) front-loads the approach then eases into
// the depths, which is what the six chapters want. Arc-length getPointAt then
// keeps speed even along the spline.
function easeOut(t) {
  t = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - t, 1.85);
}

// ---------------------------------------------------------------------------
// The emerald — ported verbatim from js/gem.js (the 404/about stone), adapted
// to Three built-ins. The GLSL bodies are the proven originals; only the
// hand-rolled uniforms (uProj/uView/uModel/uEye) are swapped for Three's
// modelMatrix / viewMatrix / projectionMatrix / cameraPosition.
// ---------------------------------------------------------------------------
// vN uses a dedicated uNormalMat (JS-side inverse-transpose of the world
// matrix, see uNormalMat below) rather than the model matrix's upper-left 3x3
// directly. The bare model-matrix approach is only correct for rotation +
// uniform scale; the shell mesh applies a non-uniform scale (3.6, 3.6, 10) to
// stretch into a tunnel, which would skew its facet normals toward face-on
// and flatten the interior lighting if fed through the raw model matrix.
const GEM_VS = [
  "varying vec3 vN; varying vec3 vP;",
  "uniform mat3 uNormalMat;",
  "void main(){",
  "  vec4 w = modelMatrix * vec4(position, 1.0);",
  "  vP = w.xyz;",
  "  vN = uNormalMat * normal;",
  "  gl_Position = projectionMatrix * viewMatrix * w;",
  "}",
].join("\n");

// A physically-plausible stone, single pass, traced against the REAL cut:
//  - The mesh (js/gem-model.js, a round brilliant) is convex, and its exact
//    convex-hull facet planes ride along as uPlanes. A refracted ray is traced
//    to its true exit facet analytically (nearest plane ahead), so the
//    interior shows the actual pavilion facets of the cut — not a hashed
//    approximation of one.
//  - Schlick fresnel with emerald's real F0 (~0.05 at IOR 1.57) splits the
//    light into surface reflection and body transmission.
//  - Transmission traces each RGB channel separately (dispersion): refract at
//    the entry facet, exit through a real facet (with up to two total-
//    internal-reflection bounces — the "fire"), sample the studio environment
//    along the exit direction.
//  - Beer–Lambert absorption over the traversed path length gives the body
//    its depth: green survives, red dies, thin edges glow lighter than the
//    thick heart of the stone — real transparency, not a flat tint.
//  - ACES tonemap keeps the ivory softbox glints crisp without clipping.
// GEM_PLANE_COUNT must match gem-model.js's planeCount; buildEmerald asserts.
const GEM_PLANE_COUNT = 90;
const GEM_FS = [
  "varying vec3 vN; varying vec3 vP;",
  "uniform vec3 uKey; uniform float uOrbit; uniform float uAmp;",
  "uniform vec3 uFogColor; uniform float uFogDensity;",
  "uniform mat3 uNormalMat; uniform mat3 uInvRot; uniform vec3 uCenter;",
  "uniform vec4 uPlanes[" + GEM_PLANE_COUNT + "];",
  "const vec3 IVORY = vec3(0.985, 0.972, 0.94);",
  "const vec3 JADE  = vec3(0.29, 0.57, 0.455);",
  // per-channel absorption (per local unit): emerald transmits green,
  // swallows red, dims blue toward teal. Red keeps a survivable floor — total
  // red kill reads as neon-candy RGB green, not a mineral. Tuned so a mid
  // chord lands in the site's own deep-emerald family (#0e3d2b / #4a9174).
  "const vec3 SIGMA = vec3(3.2, 0.60, 1.30);",
  // per-channel entry eta (1/n) — spread a touch wider than beryl's true
  // dispersion so the TIR fire separates visibly at screen scale
  "const vec3 ETA = vec3(0.6460, 0.6365, 0.6270);",
  // Procedural jewelry-studio environment. Real facets are discrete mirrors:
  // each one shows ONE direction of this map, so the map needs structure —
  // several distinct panels at different angles and intensities, a bright
  // ceiling strip, and a dark floor — or every downward facet shades the same
  // flat green and the cut reads as CAD plastic. Panel edges are steep
  // smoothsteps so reflections read as lit softboxes, not radial blobs.
  "vec3 env(vec3 d){",
  "  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);",
  "  vec3 base = mix(vec3(0.004, 0.007, 0.006), vec3(0.035, 0.075, 0.058), up * up);",
  // key softbox, high left-front, hot core
  "  float ck = dot(d, normalize(vec3(-0.42, 0.60, 0.55)));",
  "  float key = smoothstep(0.50, 0.86, ck) * (0.6 + 1.1 * smoothstep(0.84, 0.985, ck));",
  // second panel, high right-rear, cooler and dimmer — crown facets opposite
  // the key still catch a distinct shape
  "  float ck2 = dot(d, normalize(vec3(0.55, 0.52, -0.42)));",
  "  float key2 = smoothstep(0.72, 0.93, ck2) * (0.5 + 0.8 * smoothstep(0.90, 0.99, ck2));",
  // thin horizontal strip light just above the horizon — the classic jewelry
  // girdle glint; narrow in elevation, wide in azimuth
  "  float strip = smoothstep(0.10, 0.16, d.y) * (1.0 - smoothstep(0.20, 0.27, d.y))",
  "              * smoothstep(-0.2, 0.45, d.z);",
  "  float fill = smoothstep(0.45, 0.95, dot(d, normalize(vec3(0.72, 0.10, 0.30))));",
  "  float rim = smoothstep(0.78, 0.985, dot(d, normalize(vec3(0.10, -0.25, -0.94))));",
  // broad reflector card under the stone — pavilion TIR paths that exit
  // downward pick up a soft ivory-green bounce instead of dead black
  "  float under = smoothstep(-0.05, -0.75, d.y) * (0.5 + 0.5 * smoothstep(-0.4, 0.6, d.z));",
  "  return base + IVORY * key * 2.2 + vec3(0.80, 0.86, 0.90) * key2 * 1.1",
  "       + IVORY * strip * 0.4 + vec3(0.42, 0.50, 0.44) * fill * 0.3",
  "       + vec3(0.30, 0.58, 0.47) * rim * 0.5 + vec3(0.05, 0.10, 0.08) * under;",
  "}",
  // exit of a ray travelling INSIDE the convex stone: the nearest facet plane
  // ahead of it. Returns the distance; writes the exit facet's outward normal.
  // (Planes are n.p = d with outward n, in the cut's local frame.)
  "float planeExit(vec3 o, vec3 d, out vec3 n){",
  "  float tMin = 4.0; n = vec3(0.0, 1.0, 0.0);",
  "  for (int i = 0; i < " + GEM_PLANE_COUNT + "; i++) {",
  "    float dn = dot(uPlanes[i].xyz, d);",
  "    if (dn > 1e-5) {",
  "      float t = (uPlanes[i].w - dot(uPlanes[i].xyz, o)) / dn;",
  "      if (t > 1e-4 && t < tMin) { tMin = t; n = uPlanes[i].xyz; }",
  "    }",
  "  }",
  "  return tMin;",
  "}",
  // The path through the stone, traced ONCE at the green eta: entry
  // refraction -> true exit facet, one total-internal-reflection bounce (the
  // fire). Writes the internal ray and exit facet normal (both local) so
  // main() can split R/G/B at the exit — per-channel exit refraction carries
  // the dispersion at a third of the cost of tracing three full paths, which
  // is the difference between 12fps and 60fps when the stone fills a phone
  // screen. Returns traversed path length.
  "float gemPath(vec3 V, vec3 N, vec3 oL, out vec3 rayL, out vec3 exitN){",
  "  vec3 T = refract(-V, N, ETA.g);",
  "  if (dot(T, T) < 1e-4) T = reflect(-V, N);",
  "  vec3 tL = normalize(uInvRot * T);",
  "  vec3 n2;",
  "  float dist = planeExit(oL, tL, n2);",
  "  vec3 T2 = refract(tL, -n2, 1.0 / ETA.g);",
  "  if (dot(T2, T2) < 1e-4) {",
  "    vec3 pE = oL + tL * dist;",
  "    tL = reflect(tL, n2);",
  "    dist += planeExit(pE, tL, n2);",
  "  }",
  "  rayL = tL; exitN = n2;",
  "  return max(dist, 0.32);",
  "}",
  "vec3 aces(vec3 x){",
  "  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);",
  "}",
  "vec3 hash3(vec3 q){",
"  return fract(sin(vec3(dot(q, vec3(127.1, 311.7, 74.7)),",
"                        dot(q, vec3(269.5, 183.3, 246.1)),",
"                        dot(q, vec3(113.5, 271.9, 124.6)))) * 43758.5453) * 2.0 - 1.0;",
"}",
"void main(){",
"  vec3 N = normalize(vN);",
  // a whisper of polish waviness — kills the dead-flat CAD tone inside a
  // big facet while staying far below "frosted"
"  N = normalize(N + hash3(floor(vP * 90.0)) * 0.002);",
"  vec3 V = normalize(cameraPosition - vP);",
  "  if (dot(N, V) < 0.0) N = -N;",
  "  vec3 R = reflect(-V, N);",
  // entry point in the cut's local frame (the baked model is centred)
  "  vec3 oL = uInvRot * (vP - uCenter);",
  // nudge the origin just inside the entry facet so planeExit's t>0 guard
  // can't re-hit the entry plane on a grazing ray
  "  oL -= normalize(uInvRot * N) * 0.002;",
  // one traced path; dispersion split at the exit facet per channel
  "  vec3 rayL, exitN;",
  "  float plen = gemPath(V, N, oL, rayL, exitN);",
  "  vec3 er = refract(rayL, -exitN, 1.0 / ETA.r);",
  "  vec3 eg = refract(rayL, -exitN, 1.0 / ETA.g);",
  "  vec3 eb = refract(rayL, -exitN, 1.0 / ETA.b);",
  "  if (dot(eg, eg) < 1e-4) eg = reflect(rayL, exitN);",
  "  if (dot(er, er) < 1e-4) er = eg;",
  "  if (dot(eb, eb) < 1e-4) eb = eg;",
  "  vec3 body;",
  "  body.r = env(uNormalMat * normalize(er)).r * exp(-SIGMA.r * plen * 1.8);",
  "  body.g = env(uNormalMat * normalize(eg)).g * exp(-SIGMA.g * plen * 1.8);",
  "  body.b = env(uNormalMat * normalize(eb)).b * exp(-SIGMA.b * plen * 1.8);",
  // the deep body floor: even where no light exits toward a softbox, the stone
  // reads as material, not a hole — thin edges lighter than the thick heart.
  "  body += vec3(0.003, 0.042, 0.026) * exp(-0.9 * plen);",
  "  body += vec3(0.002, 0.016, 0.010);",
  "  float fid = fract(sin(dot(N, vec3(12.9898, 78.233, 37.719))) * 43758.5453);",
  "  body *= 0.92 + 0.16 * fid;", // real facets vary on their own; keep this subtle
  "  float fres = 0.05 + 0.95 * pow(1.0 - max(dot(N, V), 0.0), 5.0);",
  "  vec3 col = mix(body * 1.15, env(R) * 1.2, fres);",
  "  vec3 H1 = normalize(uKey + V);", // ivory key light
  "  float s1 = pow(max(dot(N, H1), 0.0), 120.0);",
  "  vec3 H2 = normalize(normalize(vec3(-0.65, -0.15, -0.5)) + V);",
  "  float s2 = pow(max(dot(N, H2), 0.0), 48.0);", // jade rim
  "  float a = uOrbit * 6.28318;",
  "  vec3 H3 = normalize(normalize(vec3(cos(a), 0.35, sin(a))) + V);",
  "  float s3 = pow(max(dot(N, H3), 0.0), 70.0) * uAmp;", // the walking light
  "  col += IVORY * (s1 * 1.5 + smoothstep(0.5, 1.0, s1) * 0.8);",
  "  col += JADE * s2 * 0.35 + IVORY * s3 * 3.4;",
  // a whisper of desaturation — pure-primary green reads as plastic
  "  col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), 0.04);",
  "  vec3 outc = pow(aces(col), vec3(0.4545));",
  // FogExp2, applied in output (gamma) space so it matches the interior shell
  // and the noir page behind. Scene.fog is inert for ShaderMaterial, so we do
  // it by hand: as the stone recedes past the camera it dissolves into the
  // green depth rather than floating as a bright chip in a black void.
  "  float fdist = length(cameraPosition - vP);",
  "  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * fdist * fdist);",
  "  outc = mix(outc, uFogColor, clamp(fogF, 0.0, 1.0));",
  "  gl_FragColor = vec4(outc, 1.0);",
  "}",
].join("\n");

// The interior shell — a scaled, inverted-normal (BackSide) clone of the
// emerald that surrounds the camera once it has passed through the crown. It
// reads as clean near-black depth with a faint emerald fresnel lift,
// dissolving into fog toward the deep interior. Simpler than the gem: no
// refraction/dispersion, just a faceted wall + fresnel edge glow + the fog mix.
// The old wall shaded each facet a single flat colour; the shell's facets are
// huge (scale 3.6, 3.6, 10), so one facet could fill the whole viewport as a
// flat bright-green card — the "unwanted texture" behind the vitrines. The
// rework darkens the palette two stops, breaks every facet up with slow
// position-based light bands (caustics drifting through the crystal), and
// tonemaps with the same ACES curve as the stone so the layers match.
const SHELL_FS = [
  "varying vec3 vN; varying vec3 vP;",
  "uniform vec3 uKey; uniform float uOrbit; uniform float uAmp; uniform float uFade;",
  "uniform vec3 uFogColor; uniform float uFogDensity; uniform float uTime;",
  "vec3 aces(vec3 x){",
  "  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);",
  "}",
  "void main(){",
  "  vec3 N = normalize(vN);",
  "  vec3 V = normalize(cameraPosition - vP);",
  "  if (dot(N, V) < 0.0) N = -N;",
  "  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);",
  // clean darkness: a near-black emerald gradient with the faintest fresnel
  // lift toward the walls — no facet texture, no light bands. The depth cue
  // is the motes and the fog, not the surface.
  "  vec3 wall = vec3(0.002, 0.008, 0.005);",
  "  wall += vec3(0.005, 0.022, 0.014) * fres;",
  "  float a = uOrbit * 6.28318;",
  "  vec3 H3 = normalize(normalize(vec3(cos(a), 0.35, sin(a))) + V);",
  "  float s3 = pow(max(dot(N, H3), 0.0), 60.0) * uAmp;", // walking light, subtle
  "  wall += vec3(0.6, 0.95, 0.78) * s3 * 0.15;",
  "  vec3 outc = pow(aces(wall), vec3(0.4545));",
  "  float fdist = length(cameraPosition - vP);",
  "  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * fdist * fdist);",
  "  outc = mix(outc, uFogColor, clamp(fogF, 0.0, 1.0));",
  "  gl_FragColor = vec4(outc, uFade);",
  "}",
].join("\n");

// Fullscreen-triangle passes (post chain). vUV comes from the clip-space
// triangle positions we feed the geometry, so the built-in `position`
// attribute is all these need.
const QUAD_VS = [
  "varying vec2 vUV;",
  "void main(){ vUV = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }",
].join("\n");

// Threshold 0.7: with ACES in the materials, only genuine glints (softbox
// speculars, TIR fire) cross it — body colour and the vitrine photographs
// stay out of the bloom entirely, so nothing washes into white rectangles.
const BRIGHT_FS = [
  "varying vec2 vUV; uniform sampler2D uTex;",
  "void main(){",
  "  vec4 c = texture2D(uTex, vUV);",
  "  gl_FragColor = vec4(max(c.rgb - 0.7, 0.0) * 1.6 * c.a, 1.0);",
  "}",
].join("\n");

const BLUR_FS = [
  "varying vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir;",
  "void main(){",
  "  vec3 c = texture2D(uTex, vUV).rgb * 0.227;",
  "  c += (texture2D(uTex, vUV + uDir * 1.385).rgb + texture2D(uTex, vUV - uDir * 1.385).rgb) * 0.316;",
  "  c += (texture2D(uTex, vUV + uDir * 3.231).rgb + texture2D(uTex, vUV - uDir * 3.231).rgb) * 0.07;",
  "  gl_FragColor = vec4(c, 1.0);",
  "}",
].join("\n");

// bloom re-enters with the red channel spread wider than the blue — the
// fringe reads as dispersion, the fire of a real stone. Alpha carries the
// bloom luminance so the halo shows through the transparent page background.
//
// uVeil replaces the old uFlash whiteout. The flash added up to 0.9 of pure
// white to the whole frame across ~9% of the scroll range — parking the
// scroll there left the page a blank white sheet that read as a rendering
// failure. The veil is the moment the camera passes through the crown: a
// luminous emerald caustic, ivory-green at the centre falling to deep green
// at the edges, gently shimmering, and hard-capped at 0.88 mix so the frame
// underneath always survives. Parked mid-crossing, the page now holds a
// designed glow instead of a blowout.
const COMP_FS = [
  "varying vec2 vUV;",
  "uniform sampler2D uScene; uniform sampler2D uBloom;",
  "uniform float uVeil; uniform float uTime;",
  "void main(){",
  "  vec4 s = texture2D(uScene, vUV);",
  "  vec2 d = vUV - 0.5;",
  "  vec3 b;",
  "  b.r = texture2D(uBloom, 0.5 + d * 1.012).r;",
  "  b.g = texture2D(uBloom, vUV).g;",
  "  b.b = texture2D(uBloom, 0.5 + d * 0.988).b;",
  "  vec3 col = s.rgb + b * 0.95;",
  "  float r = length(d) * 2.0;",
  "  float shimmer = 0.88 + 0.12 * sin(uTime * 0.0011 + r * 7.0);",
  "  vec3 veilC = mix(vec3(0.16, 0.40, 0.29), vec3(0.006, 0.028, 0.018), clamp(r, 0.0, 1.0));",
  "  float v = clamp(uVeil * (1.0 - 0.25 * r * r) * shimmer, 0.0, 0.93);",
  "  col = mix(col, veilC, v);",
  "  float a = clamp(s.a + dot(b, vec3(0.299, 0.587, 0.114)) * 1.7 + v, 0.0, 1.0);",
  "  gl_FragColor = vec4(col, a);",
  "}",
].join("\n");

// Build the stone from the baked round-brilliant model (js/gem-model.js —
// a real cut, CC-BY, see vendor/LICENSE-diamond.md) as a non-indexed
// BufferGeometry with per-face flat normals. The model's convex-hull facet
// planes feed the shader's exact interior trace (uPlanes).
function buildEmerald() {
  const model = window.FROZI_GEM_MODEL;
  if (!model) throw new Error("js/gem-model.js must load before immersive.js");
  if (model.planeCount !== GEM_PLANE_COUNT) {
    throw new Error("gem-model planeCount " + model.planeCount + " != shader " + GEM_PLANE_COUNT);
  }

  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.BufferAttribute(model.positions, 3));
  indexed.setIndex(new THREE.BufferAttribute(model.indices, 1));
  // non-indexed + computeVertexNormals = true per-face flat normals, which is
  // what makes each facet a discrete mirror (smooth normals would melt the
  // cut into a blob).
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();

  const material = new THREE.ShaderMaterial({
    vertexShader: GEM_VS,
    fragmentShader: GEM_FS,
    uniforms: {
      uKey: { value: new THREE.Vector3(0.55, 0.75, 0.5) },
      uOrbit: { value: 0 },
      uAmp: { value: 0 },
      uFogColor: { value: new THREE.Vector3(FOG_RGB[0], FOG_RGB[1], FOG_RGB[2]) },
      uFogDensity: { value: 0 },
      // world-space normal matrix (inverse-transpose of matrixWorld); the
      // emerald rotates every frame (pure rotation, no scale), so tick()
      // refreshes this from the current matrixWorld each frame.
      uNormalMat: { value: new THREE.Matrix3() },
      // world->local rotation (transpose of uNormalMat — valid because the
      // emerald's transform is pure rotation) and the stone's world centre;
      // the transmission trace in GEM_FS works in the cut's local frame.
      // Both refreshed alongside uNormalMat in tick().
      uInvRot: { value: new THREE.Matrix3() },
      uCenter: { value: new THREE.Vector3() },
      // the cut's convex-hull facet planes (local frame, n.p = d) — a flat
      // Float32Array uploads directly as the vec4 array. Never changes.
      uPlanes: { value: model.planes },
    },
    // the baked mesh has consistent outward winding, so back-face culling is
    // safe — and halves the fragment work when the stone fills the viewport.
    side: THREE.FrontSide,
  });

  return new THREE.Mesh(geometry, material);
}

// The interior shell shares the emerald's geometry (never disposed twice — see
// teardown). Scaled up and stretched along -Z into a faceted green tunnel that
// wraps the camera through the whole interior leg of the journey; BackSide so
// we see its inner walls. uFade crossfades it in behind the pass-through flash.
function buildShell(geometry) {
  const material = new THREE.ShaderMaterial({
    vertexShader: GEM_VS,
    fragmentShader: SHELL_FS,
    uniforms: {
      uKey: { value: new THREE.Vector3(0.55, 0.75, 0.5) },
      uOrbit: { value: 0 },
      uAmp: { value: 0 },
      uFade: { value: 0 },
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Vector3(FOG_RGB[0], FOG_RGB[1], FOG_RGB[2]) },
      uFogDensity: { value: 0 },
      // world-space normal matrix; the shell's transform (scale only, never
      // rotated or moved) is fixed once built, so buildScene() computes this
      // a single time from matrixWorld rather than refreshing it per frame.
      uNormalMat: { value: new THREE.Matrix3() },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  // Stretched along Z into a long faceted tunnel (z half-extent ~0.72*10 = 7.2)
  // so it contains the camera through the whole interior + exit leg — the deep
  // chapters would go black otherwise once the camera flew past a compact blob.
  mesh.scale.set(3.6, 3.6, 10);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

// The post chain: full-res scene target (with depth) → bright-pass at quarter
// res → separable gaussian → composite with chromatic dispersion, to screen.
// Ported from js/gem.js:183-345.
function buildPost(renderer) {
  const rtOpts = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
  };
  // 4x MSAA on the scene target under WebGL2 — the old target had no
  // multisampling at all (canvas antialias only applies to the default
  // framebuffer), which left every facet edge a hard jaggy line.
  const rtScene = new THREE.WebGLRenderTarget(2, 2, {
    ...rtOpts,
    depthBuffer: true,
    samples: renderer.capabilities.isWebGL2 ? 4 : 0,
  });
  const rtA = new THREE.WebGLRenderTarget(2, 2, rtOpts);
  const rtB = new THREE.WebGLRenderTarget(2, 2, rtOpts);

  const fsScene = new THREE.Scene();
  const fsCam = new THREE.Camera();
  const fsGeo = new THREE.BufferGeometry();
  fsGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
  );
  const fsMesh = new THREE.Mesh(fsGeo, null);
  fsMesh.frustumCulled = false;
  fsScene.add(fsMesh);

  function passMat(fs, uniforms) {
    return new THREE.ShaderMaterial({
      vertexShader: QUAD_VS,
      fragmentShader: fs,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
  }
  const mBright = passMat(BRIGHT_FS, { uTex: { value: null } });
  const mBlur = passMat(BLUR_FS, { uTex: { value: null }, uDir: { value: new THREE.Vector2() } });
  const mComp = passMat(COMP_FS, {
    uScene: { value: null },
    uBloom: { value: null },
    uVeil: { value: 0 },
    uTime: { value: 0 },
  });

  function draw(mat) {
    fsMesh.material = mat;
    renderer.render(fsScene, fsCam);
  }

  let qw = 1, qh = 1;

  return {
    setSize(w, h) {
      rtScene.setSize(w, h);
      qw = Math.max(w >> 2, 1);
      qh = Math.max(h >> 2, 1);
      rtA.setSize(qw, qh);
      rtB.setSize(qw, qh);
    },
    render(worldScene, worldCamera, veil, now) {
      mComp.uniforms.uVeil.value = veil || 0;
      mComp.uniforms.uTime.value = now || 0;
      // pass 1: the stone into the full-res scene target
      renderer.setRenderTarget(rtScene);
      renderer.render(worldScene, worldCamera);

      // pass 2: bright extract at quarter res, then separable blur
      renderer.setRenderTarget(rtA);
      mBright.uniforms.uTex.value = rtScene.texture;
      draw(mBright);

      renderer.setRenderTarget(rtB);
      mBlur.uniforms.uTex.value = rtA.texture;
      mBlur.uniforms.uDir.value.set(1 / qw, 0);
      draw(mBlur);

      renderer.setRenderTarget(rtA);
      mBlur.uniforms.uTex.value = rtB.texture;
      mBlur.uniforms.uDir.value.set(0, 1 / qh);
      draw(mBlur);

      // pass 3: composite with dispersion, out to the canvas
      renderer.setRenderTarget(null);
      mComp.uniforms.uScene.value = rtScene.texture;
      mComp.uniforms.uBloom.value = rtA.texture;
      draw(mComp);
    },
    dispose() {
      rtScene.dispose();
      rtA.dispose();
      rtB.dispose();
      fsGeo.dispose();
      mBright.dispose();
      mBlur.dispose();
      mComp.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Motes — a tube of drifting luminous points that surrounds the camera through
// the interior leg of the journey (p .25-.85), giving the deep its sense of
// scale. One InstancedMesh, matrices rewritten every frame (cheap even at
// desktop counts) rather than a vertex-shader time uniform, so the velocity
// streak (a per-instance scale.y stretch) can reuse the same compose() call.
// ---------------------------------------------------------------------------
// Arc-length (spline t, i.e. post-easeOut) range the tube is distributed
// across — NOT scroll progress p. The brief's own suggestion (sample p
// uniformly, t = easeOut(p)) was tried first and measured broken: easeOut's
// deceleration compresses almost the entire second half of the p range into
// a sliver of t near 1, so a uniform-in-p sample starves the tail of arc
// length to distribute along. Concretely, with p sampled up to .93, the
// camera at p=.7 (t=.89) had only ~0.1 arc-length units of "ahead" motes left
// to draw from — measured via NDC-projecting every instance, 2-11 of 400
// ever landed inside the frustum there, vs 250+ near the start. Sampling t
// directly gives uniform arc-length density everywhere, so the tube's
// density (hence visibility) stays roughly constant across the whole
// interior instead of collapsing well before chapter 6. Bounds mirror the
// visibility guard below (p>.2 -> t>~.34, p<.95 -> t<~.996).
const MOTE_T_RANGE = [0.3, 0.999];

function buildMoteTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const cx = canvas.getContext("2d");
  const g = cx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  cx.fillStyle = g;
  cx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Builds the InstancedMesh plus the plain-array per-instance state (base
// position, a random drift axis/phase, and a base size). Orientation is NOT
// precomputed per-instance: motes are billboards (see updateMotes) — a plane
// oriented by aligning its local +Y straight to the path tangent, without
// also keeping its face toward the camera, ends up lying edge-on to the
// camera for most of the interior travel (where the look direction IS
// roughly the tangent) and is invisible despite being geometrically right in
// front of the lens. tick() rewrites all instance matrices every frame from
// one shared camera-facing quaternion; nothing here is re-derived per frame.
function buildMotes() {
  const count = IS_TOUCH ? 90 : 220;

  const texture = buildMoteTexture();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    // white base — each instance carries its own colour (jade..ivory mix,
    // see instanceColor below) so the field reads as suspended mineral dust
    // rather than a uniform sheet of green blobs.
    color: new THREE.Color(0xffffff),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    // depthTest off + a renderOrder after the shell: the tunnel shell is a
    // faceted BackSide surface that, once fully faded in (uFade -> 1 through
    // most of the chapters motes occupy), reads as opaque and can sit
    // nearer than expected at some view angles because its facets aren't a
    // smooth cylinder — without this the shell silently paints over motes
    // that are geometrically well inside it.
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 10;

  const bases = new Array(count);
  const drifts = new Array(count);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);

  const up = new THREE.Vector3(0, 1, 0);
  const altUp = new THREE.Vector3(1, 0, 0);
  const p0 = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const perp1 = new THREE.Vector3();
  const perp2 = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const t = MOTE_T_RANGE[0] + Math.random() * (MOTE_T_RANGE[1] - MOTE_T_RANGE[0]);
    camPath.getPointAt(t, p0);
    camPath.getTangentAt(t, tan);
    const arbitrary = Math.abs(tan.y) < 0.9 ? up : altUp;
    perp1.crossVectors(tan, arbitrary).normalize();
    perp2.crossVectors(tan, perp1).normalize();
    // Tube radius. The brief suggested ~1.5-3, but against this camera's
    // narrow ~31deg vertical FOV a mote needs to be roughly
    // radius/tan(halfFOV) world units AHEAD of the camera just to stay in
    // frustum — at radius 3 that's 6-10+ units, more than the ~7-unit
    // arc-length window the whole tube covers, so almost none of them were
    // ever actually on screen except right at the start of the range
    // (verified by projecting instances: at p=0.5 only 1 of 400 motes
    // landed inside [-1,1] NDC). A tighter radius keeps the required lead
    // distance small enough that motes stay visible throughout p .25-.85.
    const radius = 0.15 + Math.random() * 0.55; // tube radius 0.15 - 0.7
    const angle = Math.random() * Math.PI * 2;
    const base = p0.clone()
      .addScaledVector(perp1, Math.cos(angle) * radius)
      .addScaledVector(perp2, Math.sin(angle) * radius);
    bases[i] = base;
    drifts[i] = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).normalize();
    phases[i] = Math.random() * Math.PI * 2;
    // smaller than the first pass (0.018-0.048 read as fist-sized bokeh blobs
    // whenever one drifted near the lens); a wide size spread with a small
    // ceiling reads as dust catching the light instead.
    sizes[i] = 0.008 + Math.random() * 0.022;
    _moteColor.lerpColors(MOTE_JADE, MOTE_IVORY, Math.random() * Math.random());
    mesh.setColorAt(i, _moteColor);
  }

  return {
    mesh,
    bases,
    drifts,
    phases,
    sizes,
    count,
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

const MOTE_JADE = new THREE.Color(0x4a9174);
const MOTE_IVORY = new THREE.Color(0xf2eedd);
const _moteColor = new THREE.Color();
const _moteMatrix = new THREE.Matrix4();
const _motePos = new THREE.Vector3();
const _moteScale = new THREE.Vector3();
const _moteBillboard = new THREE.Quaternion();
const _moteRoll = new THREE.Quaternion();
const _moteLocalTan = new THREE.Vector3();
const _moteCamQuatInv = new THREE.Quaternion();
const _moteZAxis = new THREE.Vector3(0, 0, 1);

// tan is the camera's current direction-of-travel tangent (tick() already
// has it in _tangent — passed in so this isn't recomputed here).
function updateMotes(now, p, travelTangent) {
  if (!motes) return;
  // Fade with actual camera depth rather than popping at a scroll fraction:
  // in over the first unit past the crown (behind the crossing veil), out
  // across the emergence turn. Opacity carries the ramp so there's no pop.
  const cz = camera.position.z;
  const fade = clamp01((-cz - 0.35) / 0.9) * (1 - clamp01((p - 0.86) / 0.08));
  motes.mesh.visible = fade > 0.01;
  motes.mesh.material.opacity = 0.42 * fade;
  if (!motes.mesh.visible) return;

  // Every mote billboards to face the camera (shares one quaternion, computed
  // once per frame) — a plane oriented purely by "local Y along the tangent"
  // goes edge-on to the camera whenever the view direction IS roughly the
  // tangent (true through most of the interior once the chapter 3 lookAt
  // blend completes), which made every mote invisible despite being right in
  // front of the lens. The billboard is then rolled about the view axis so
  // its local Y — the streak/stretch axis — reads as the screen-projected
  // direction of travel rather than an arbitrary fixed "up".
  _moteCamQuatInv.copy(camera.quaternion).invert();
  _moteLocalTan.copy(travelTangent).applyQuaternion(_moteCamQuatInv);
  const rollAngle = Math.atan2(_moteLocalTan.x, _moteLocalTan.y);
  _moteRoll.setFromAxisAngle(_moteZAxis, -rollAngle);
  _moteBillboard.copy(camera.quaternion).multiply(_moteRoll);

  // fast scrolling stretches every mote into a streak along its travel axis
  const streak = 1 + Math.min(Math.abs(rig.velocity) * 400, 6);
  for (let i = 0; i < motes.count; i++) {
    const amp = 0.14;
    _motePos.copy(motes.bases[i]).addScaledVector(
      motes.drifts[i],
      amp * Math.sin(now * 0.00035 + motes.phases[i])
    );
    const size = motes.sizes[i];
    _moteScale.set(size, size * streak, size);
    _moteMatrix.compose(_motePos, _moteBillboard, _moteScale);
    motes.mesh.setMatrixAt(i, _moteMatrix);
  }
  motes.mesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// The vitrines — chapter 5's four featured pieces, suspended in the interior
// as lit photograph plates. Each DOM .vitrine card (index.html) contributes
// its <img> src as a texture on a plane; the DOM card itself is restyled by
// CSS into a compact caption and repositioned every frame (updateVitrines) to
// its plate's projected screen position, so the real <a> the reader clicks is
// plain DOM navigation and js/main.js's view-transition naming fires unchanged.
//
// Placement: p values are scroll progress, eased to
// arc-length along the spline, alternating sides. The window (p ~.55-.9) brackets
// chapter 5 (.6-.8) with a little lead-in/out.
// ---------------------------------------------------------------------------
const VITRINE_P = [0.62, 0.67, 0.72, 0.77];
const VITRINE_SIDE = [-1, 1, -1, 1];
// same-side plates share a screen column, so stagger them in height: the two
// left pieces (Vipera, Eos) go low/high, the two right (Lumen, Sable) high/low,
// so all four read as separate framed photographs rather than a stack.
const VITRINE_Y = [-0.52, 0.54, 0.54, -0.52];
const VITRINE_W = 1.2;
const VITRINE_H = 1.5;
// caption anchor sits this far below the plate centre (local units), so it
// overlaps the photograph's lower edge — close enough that a single pointer
// hover lands on the plate mesh (raycast path) and the caption (DOM-hover path).
const VITRINE_LABEL_DROP = VITRINE_H * 0.34;

// Idle-state target for a plate's brightest (q90) texel once the shared base
// tint is applied: q90Texel * effectiveBase ≈ VITRINE_BASE_TARGET, kept a
// healthy margin under the bloom bright-pass threshold (0.7) so a
// white-ground photograph doesn't bloom at rest. 0.5 was the first value
// tried and held — see task-7-report.md fix round 2 for the visual check.
const VITRINE_BASE_TARGET = 0.62;

// Bright-quantile luminance (~q90, 0..1) of a loaded same-origin image,
// sampled through a small canvas. Used to make the hover lift luminance-aware:
// the post chain's bright pass fires at 0.7, so a plate's hover multiplier is
// capped so its bright texels stay under ~0.8 — a white-ground studio shot
// gets a whisper of a lift while a dark-ground one keeps the pronounced glow.
// Returns null on any failure (tainted canvas, zero size), leaving the caller's
// conservative default in place.
function imageBrightLuma(image) {
  try {
    const s = 32;
    const cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(image, 0, 0, s, s);
    const d = cx.getImageData(0, 0, s, s).data;
    const lum = new Float32Array(s * s);
    for (let i = 0; i < s * s; i++) {
      const j = i * 4;
      lum[i] = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) / 255;
    }
    lum.sort();
    return lum[Math.floor(lum.length * 0.9)];
  } catch (e) {
    return null;
  }
}

function buildVitrines() {
  const group = new THREE.Group();
  group.visible = false;
  group.renderOrder = 11;

  const loader = new THREE.TextureLoader();
  const disposables = [];
  const entries = [];
  let disposed = false;

  const up = new THREE.Vector3(0, 1, 0);
  const altUp = new THREE.Vector3(1, 0, 0);
  const p0 = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  // On a narrow (portrait / mobile) viewport the horizontal FOV collapses, so a
  // plate at the full ±1.3-unit lateral offset projects clean off the sides and
  // its caption clips the screen edges. Pull the plates toward the path centre
  // in proportion to how much narrower than the ~1.6 desktop aspect we are. The
  // linear maps aspect 1.6 -> 1.0 (desktop unchanged) and aspect ~0.46 (a phone
  // in portrait) -> ~0.2, which keeps all four captions fully inside a 390px
  // viewport while the left/right stagger still reads. Clamped [0.2, 1].
  const aspect = window.innerWidth / window.innerHeight;
  const lateral = Math.min(1, Math.max(0.2, aspect * 0.7 - 0.122));
  // portrait phones: the horizontal FOV is so narrow that a full-size card a
  // few units out already spans the screen — shrink the plates so they read
  // as framed photographs there too.
  const cardScale = aspect < 1 ? 0.62 : 1;

  const cards = Array.from(
    document.querySelectorAll('.chapter[data-chapter="5"] .vitrine')
  ).slice(0, VITRINE_P.length);

  cards.forEach((card, i) => {
    const img = card.querySelector(".vitrine-media img");
    const src = img && img.getAttribute("src");

    const sub = new THREE.Group();

    // matte backing — a slightly larger plane in a dim ivory so a hair of it
    // shows around the photograph as a lit frame edge (the vitrine's mount).
    const backGeo = new THREE.PlaneGeometry(VITRINE_W + 0.11, VITRINE_H + 0.11);
    const backMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x39392f),
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      // fog off: a vitrine reads as internally lit, cutting through the deep —
      // fogging the plates toward the green made the (mostly dark-ground)
      // photographs vanish. The motes/shell still fog, so depth is preserved
      // around the plates without drowning them.
      fog: false,
    });
    const back = new THREE.Mesh(backGeo, backMat);
    back.renderOrder = 11;

    const photoGeo = new THREE.PlaneGeometry(VITRINE_W, VITRINE_H);
    const baseColor = new THREE.Color(0xf0f0ea);
    // hover target — provisional; re-derived per plate from the photograph's
    // own brightness once its texture loads (see setHotFromImage below). A
    // flat 1.28x lift blew white-ground shots (texels ~0.94) far past the
    // bloom bright-pass threshold (0.7), bleaching the whole plate into a
    // white rectangle with a dispersion fringe. Dark-ground shots need the
    // pronounced lift to read at all.
    const hotColor = baseColor.clone().multiplyScalar(1.12);
    const photoMat = new THREE.MeshBasicMaterial({
      // black until (and if) the texture arrives, so a missing image is an
      // empty dark frame rather than a white slab; on error the plate is
      // hidden entirely (entry.failed) so nothing shows at all.
      color: new THREE.Color(0x000000),
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    const photo = new THREE.Mesh(photoGeo, photoMat);
    photo.renderOrder = 12;
    photo.position.z = 0.002; // sit just in front of the backing

    sub.add(back);
    sub.add(photo);

    // placement along the path
    const t = easeOut(VITRINE_P[i]);
    camPath.getPointAt(t, p0);
    camPath.getTangentAt(t, tan);
    const arbitrary = Math.abs(tan.y) < 0.9 ? up : altUp;
    perp.crossVectors(tan, arbitrary).normalize();
    sub.position
      .copy(p0)
      .addScaledVector(tan, 4.6)
      .addScaledVector(perp, VITRINE_SIDE[i] * 1.3 * lateral);
    sub.position.y += VITRINE_Y[i];
    // angled back toward the camera's approach — a fixed, tasteful lean.
    lookTarget.copy(p0).addScaledVector(tan, -4);
    sub.lookAt(lookTarget);
    sub.scale.setScalar(cardScale);
    sub.visible = false; // revealed once its texture loads (or stays hidden)

    group.add(sub);

    const entry = {
      card,
      img,
      anchors: Array.from(card.querySelectorAll("a")),
      focusable: true, // tracks the tabindex/aria-hidden gate (see updateVitrines)
      sub,
      photoMat,
      backMat,
      baseColor,
      hotColor,
      baseQuat: sub.quaternion.clone(),
      worldCenter: new THREE.Vector3(),
      tiltX: 0,
      tiltY: 0,
      hot: 0,
      hotClass: false,
      loaded: false,
      failed: !src,
      tex: null,
    };
    sub.updateMatrixWorld(true);
    sub.getWorldPosition(entry.worldCenter);
    entries.push(entry);
    disposables.push(backGeo, backMat, photoGeo, photoMat);

    if (src) {
      loader.load(
        src,
        (tex) => {
          if (disposed) {
            tex.dispose();
            return;
          }
          entry.tex = tex;
          // anisotropic filtering: the plates sit at an oblique lean, and
          // default trilinear sampling smears them — this is most of the
          // "pictures aren't clear" complaint.
          tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
          photoMat.map = tex;
          photoMat.needsUpdate = true;
          // luminance-aware BASE exposure: the shared 0xf0f0ea tint (luminance
          // ~0.941) times a white-ground photo's own bright texels (q90~0.94)
          // lands at ~0.88 — far past the bloom bright-pass threshold (0.7),
          // so a white-ground plate blooms permanently at idle, washing the
          // photograph into a halo. Scale the base DOWN per-plate so
          // q90Texel * base ≈ VITRINE_BASE_TARGET, but clamp the factor to
          // <=1 so this can only ever darken the shared tint — a dark-ground
          // photo (q90 well under target already) keeps its untouched ~0.94
          // base and stays visually unchanged.
          const q90 = imageBrightLuma(tex.image);
          const baseLum = 0.941; // luminance of the base tint 0xf0f0ea
          if (q90 !== null) {
            const baseFactor = Math.min(1, VITRINE_BASE_TARGET / Math.max(q90 * baseLum, 1e-3));
            baseColor.multiplyScalar(baseFactor);
          }
          photoMat.color.copy(baseColor);
          // hover lift now targets headroom above the (possibly darkened)
          // per-plate base rather than the old flat baseLum, so bright texels
          // still only nudge just past threshold (gentle glow) instead of
          // overshooting now that the base itself sits lower for that plate.
          if (q90 !== null) {
            const effBaseLum = baseColor.r * 0.299 + baseColor.g * 0.587 + baseColor.b * 0.114;
            const lift = Math.min(Math.max(0.8 / Math.max(q90 * effBaseLum, 1e-3), 1.04), 1.3);
            entry.hotColor.copy(baseColor).multiplyScalar(lift);
          }
          entry.loaded = true;
        },
        undefined,
        () => {
          // A failed load leaves no plate (see updateVitrines: the caption then
          // falls back to always-visible in the chapter window). No throw, so
          // there are no console errors beyond the browser's own network log.
          entry.failed = true;
        }
      );
    }
  });

  group.userData.entries = entries;
  group.userData.dispose = () => {
    disposed = true;
    disposables.forEach((d) => d.dispose());
    entries.forEach((e) => {
      if (e.tex) e.tex.dispose();
    });
  };
  return group;
}

// ---------------------------------------------------------------------------
// Scroll rig
//
// rig.target tracks scroll position as a 0..1 fraction of the scrollable
// range; rig.progress eases toward it every frame; rig.velocity is the
// per-frame delta (later tasks use it for particle streaks / light stir).
// ---------------------------------------------------------------------------
const rig = { target: 0, progress: 0, velocity: 0 };

function computeTarget() {
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  rig.target = max > 0 ? window.scrollY / max : 0;
}

// 0..1 progress inside a [start, end] window; 0 outside it.
function chapterWindow(p, start, end) {
  return Math.min(Math.max((p - start) / (end - start), 0), 1);
}

// ---------------------------------------------------------------------------
// Chapters
//
// Six windows over the 0..1 scroll range, matching the spec table in
// docs/superpowers/specs/2026-07-06-immersive-3d-homepage-design.md:
//   1: 0-10%   2: 10-25%   3: 25-40%   4: 40-60%   5: 60-80%   6: 80-100%
// ---------------------------------------------------------------------------
const CHAPTER_WINDOWS = [
  { start: 0.0, end: 0.1 },
  { start: 0.1, end: 0.25 },
  { start: 0.25, end: 0.4 },
  { start: 0.4, end: 0.6 },
  { start: 0.6, end: 0.8 },
  { start: 0.8, end: 1.0 },
];

let CHAPTERS = [];

function buildChapters() {
  CHAPTERS = CHAPTER_WINDOWS.map((win, i) => ({
    el: document.querySelector(`.chapter[data-chapter="${i + 1}"]`),
    start: win.start,
    end: win.end,
    number: i + 1,
  })).filter((c) => c.el);
}

// fade peaks mid-window for most chapters, but the first and last chapter
// get special-cased curves (see report for the reasoning):
//  - chapter 1 must read fully visible at progress 0 (top of page), not
//    sin(0) = 0, so it fades out monotonically from 1 across its window.
//  - chapter 6 must reach fade 1 and HOLD it through the rest of the scroll
//    (the CTA shouldn't fade back out once the page bottoms out).
function fadeForChapter(chapter, w) {
  if (chapter.number === 1) {
    return Math.cos(w * (Math.PI / 2));
  }
  if (chapter.number === 6) {
    return Math.sin(Math.min(w, 0.5) * Math.PI);
  }
  return Math.sin(Math.PI * w);
}

function updateChapterFades() {
  for (const chapter of CHAPTERS) {
    const w = chapterWindow(rig.progress, chapter.start, chapter.end);
    const fade = fadeForChapter(chapter, w);
    // Set on the .chapter section itself, not .chapter-copy: the CSS rule
    // (body.is-immersive .chapter-copy { opacity: var(--cop, 0) }) reads
    // --cop via inheritance from its ancestor section.
    chapter.el.style.setProperty("--cop", fade.toFixed(4));
  }
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
let canvas = null;
let renderer = null;
let scene = null;
let camera = null;
let emerald = null;
let shell = null;
let camPath = null;
let post = null;
let motes = null;
let vitrines = null;
let rafId = null;

// scratch vectors reused every frame (no per-frame allocation)
const _tangent = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _lookAhead = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _lookMat = new THREE.Matrix4();
const _qLook = new THREE.Quaternion();
const _qBack = new THREE.Quaternion();

// Pointer parallax — a small, lerped camera offset (magnitude clamped to
// PARALLAX_MAX world units) added to the spline position every frame in every
// chapter. Target (tx, ty) is set from the pointer in onPointerMove; tick()
// eases the live offset toward it and clamps the length. Additive and tiny, so
// it never fights the lookAt blend or the emergence turn-around.
const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
const PARALLAX_MAX = 0.15;

// The chapter-1 scroll cue (.scroll-cue) is plain DOM the immersive rig owns:
// its js/main.js fade is dead on this page (no .hero-grid), so tick() fades it
// out over p 0-0.06. Cached at mount, style cleared at teardown.
let scrollCue = null;
// last value written to canvas.style.opacity by the end-of-journey fade
let lastCanvasFade = -1;
// Latches once the cue has fully faded (p >= 0.06) so tick() stops writing
// "0.000" to its opacity every single frame for the rest of the page's life —
// un-latches if the reader scrolls back above the fade window so the cue can
// resume tracking p normally.
let scrollCueFaded = false;

// vitrine hover + projection scratch (no per-frame allocation)
let rayHover = -1; // plate index the pointer raycast is over, or -1
let domHover = -1; // plate index a caption mouseenter is over, or -1
const hoverNdc = new THREE.Vector2();
const _vProj = new THREE.Vector3();
const _vAnchor = new THREE.Vector3();
const _vColor = new THREE.Color();
const _vEuler = new THREE.Euler();
const _vQuat = new THREE.Quaternion();

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// Ken Perlin's smootherstep — zero first AND second derivative at both ends, so
// the emergence turn-around, fog clear, and shell dissolve all start/stop
// imperceptibly rather than with the visible kink a linear ramp leaves.
function smootherstep(x) {
  x = clamp01(x);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

// ---------------------------------------------------------------------------
// Emerald interaction state (mirrors js/gem.js): idle orientation drift, the
// pointer-driven key light, and the "walking light" orbit timeline.
// ---------------------------------------------------------------------------
const stone = {
  // resting tilt: crown toward the camera — a brilliant is shot from above
  // its table, never edge-on at the girdle
  rx: 0.45,
  ry: 0.65,
  keyX: 0.55,
  keyY: 0.75,
  orbitT: -1e9,
  lastTouch: 0,
};
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let orbitTimer = null;
let orbitInterval = null;

function applySize() {
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (post) {
    const buf = new THREE.Vector2();
    renderer.getDrawingBufferSize(buf);
    post.setSize(Math.max(buf.x | 0, 2), Math.max(buf.y | 0, 2));
  }
}

// Thrown by buildScene() when no WebGL context is available, BEFORE Three's
// WebGLRenderer is ever constructed. Distinguishing this from a genuine
// runtime error lets mount()'s catch stay silent for the expected "no WebGL"
// fallback while still logging anything unexpected.
class NoWebGLError extends Error {}

function buildScene() {
  canvas = document.querySelector("canvas.world[data-world]");
  if (!canvas) throw new Error("canvas.world[data-world] not found");

  // Probe for a context ourselves before handing the canvas to Three. If we
  // let THREE.WebGLRenderer discover the absence of WebGL on its own, its
  // constructor logs a console.error ("THREE.WebGLRenderer: <reason>") before
  // throwing — so even though mount()'s catch handles the fallback cleanly,
  // a console error would still surface. Probing first and bailing here keeps
  // the no-WebGL path completely silent.
  const probeGl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!probeGl) throw new NoWebGLError("WebGL is not available");

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  // The gem shaders gamma-correct themselves; keep Three out of the color
  // pipeline so the output matches the raw-WebGL 404 stone exactly.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  scene = new THREE.Scene();
  // FogExp2 in deep viridian. THREE.ShaderMaterial does NOT read scene.fog —
  // the gem and shell materials each carry their own uFogDensity uniform
  // (scrubbed by hand in tick(), see `density` below) and mix fog in-shader
  // (GEM_FS/SHELL_FS). The motes material IS a built-in
  // MeshBasicMaterial though, so they DO pick this up automatically; tick()
  // writes the same `density` value here each frame to keep every layer of
  // the interior dissolving into the fog together.
  scene.fog = new THREE.FogExp2(0x07130d, 0);

  // fov ~31deg (0.55 rad). The camera now rides the spline instead of the fixed
  // 404 vantage; tick() writes its position/lookAt every frame. Near plane is
  // small so the crown facet doesn't clip hard as we punch through it.
  const fovDeg = (0.55 * 180) / Math.PI;
  camera = new THREE.PerspectiveCamera(fovDeg, window.innerWidth / window.innerHeight, 0.03, 100);
  camPath = new THREE.CatmullRomCurve3(
    CAM_PATH_POINTS.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    "catmullrom",
    0.5
  );
  camPath.getPointAt(0, camera.position);
  camera.lookAt(0, 0, 0);

  emerald = buildEmerald();
  scene.add(emerald);
  emerald.updateMatrixWorld(true);
  emerald.material.uniforms.uNormalMat.value.getNormalMatrix(emerald.matrixWorld);

  // shares the emerald geometry; teardown disposes that buffer exactly once.
  shell = buildShell(emerald.geometry);
  scene.add(shell);
  // the shell never rotates or moves after this — its normal matrix is fixed
  // for the mesh's lifetime, so this one-time computation (post transform)
  // is all it ever needs.
  shell.updateMatrixWorld(true);
  shell.material.uniforms.uNormalMat.value.getNormalMatrix(shell.matrixWorld);

  motes = buildMotes();
  scene.add(motes.mesh);

  vitrines = buildVitrines();
  scene.add(vitrines);

  post = buildPost(renderer);

  applySize();
}

// The world canvas is fixed behind the .chapters copy layer (z-index 0 vs 1),
// so pointer events never reach it directly — we listen on the window and use
// the raycaster to decide whether a click actually landed on the stone. The
// pointer also drives the key light, exactly as js/gem.js does.
function onPointerMove(e) {
  stone.keyX = 0.25 + (e.clientX / window.innerWidth) * 0.7;
  stone.keyY = 1.0 - (e.clientY / window.innerHeight) * 0.6;
  stone.lastTouch = performance.now();

  // pointer parallax target — normalized pointer position mapped to a small
  // offset (the tick lerps toward this and clamps the length to PARALLAX_MAX).
  parallax.tx = ((e.clientX / window.innerWidth) - 0.5) * 2 * 0.12;
  parallax.ty = -((e.clientY / window.innerHeight) - 0.5) * 2 * 0.09;

  // raycast the vitrine plates so hovering the 3D photograph (not just the
  // DOM caption) lights it up and turns the cursor to a pointer.
  hoverNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
  hoverNdc.y = -((e.clientY / window.innerHeight) * 2 - 1);
  rayHover = pickVitrine();
  if (canvas) canvas.style.cursor = rayHover >= 0 ? "pointer" : "";
}

// Returns the index of the vitrine plate under hoverNdc, or -1. Uses the
// plate geometry (raycast is independent of the depthTest:false material), so
// it works even though the plates draw over the shell.
function pickVitrine() {
  if (!vitrines || !vitrines.visible) return -1;
  const entries = vitrines.userData.entries;
  raycaster.setFromCamera(hoverNdc, camera);
  const hits = raycaster.intersectObject(vitrines, true);
  for (const hit of hits) {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].sub.visible && hit.object.parent === entries[i].sub) return i;
    }
  }
  return -1;
}

function onClick(e) {
  pointerNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNdc.y = -((e.clientY / window.innerHeight) * 2 - 1);
  raycaster.setFromCamera(pointerNdc, camera);
  if (emerald && raycaster.intersectObject(emerald, false).length > 0) {
    stone.orbitT = performance.now();
  }
}

function handleResize() {
  applySize();
  computeTarget();
}

// Every frame: fade the plate group in over chapter 5's window, run the
// two-way hover (tilt + brightness lift on the hovered plate, .is-hot on its
// caption), and pin each DOM caption to its plate's projected screen position.
// Writes only transform / opacity / pointer-events on the captions — no reads,
// no layout.
function updateVitrines(p) {
  if (!vitrines) return;
  const entries = vitrines.userData.entries;

  // chapter-5 envelope: in .585-.63 (after chapter 4's copy has largely
  // faded — starting at .55 parked the cards behind the ch4 column), hold
  // to .74, out by .80 — gone before the camera passes them, so a card is
  // never parked half-off the screen edge, and well clear of the
  // chapter-6 emergence turn (~.82).
  const env = clamp01((p - 0.585) / 0.045) * (1 - clamp01((p - 0.74) / 0.06));
  vitrines.visible = p > 0.57 && p < 0.82;

  // project against the camera as it stands this frame (position + lookAt were
  // written at the top of tick; matrixWorldInverse is refreshed here because the
  // renderer only recomputes it later, inside post.render).
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

  const hovered = domHover >= 0 ? domHover : rayHover;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];

    // hover: brightness + tilt lerp toward the pointer (±0.12 rad)
    const isHot = i === hovered;
    e.hot += ((isHot ? 1 : 0) - e.hot) * 0.16;
    const txTarget = isHot ? hoverNdc.y * 0.12 : 0;
    const tyTarget = isHot ? hoverNdc.x * 0.12 : 0;
    e.tiltX += (txTarget - e.tiltX) * 0.16;
    e.tiltY += (tyTarget - e.tiltY) * 0.16;
    _vEuler.set(e.tiltX, e.tiltY, 0, "XYZ");
    _vQuat.setFromEuler(_vEuler);
    e.sub.quaternion.copy(e.baseQuat).multiply(_vQuat);
    if (e.loaded) {
      _vColor.copy(e.baseColor).lerp(e.hotColor, e.hot);
      e.photoMat.color.copy(_vColor);
    }
    // distance fade: a card dissolves as the camera closes on it, instead of
    // swelling into a screen-filling photograph — on a portrait phone the
    // narrow horizontal FOV made a passing plate fill the whole frame.
    const camDist = camera.position.distanceTo(e.worldCenter);
    const fadeAt = camera.aspect < 1 ? 2.6 : 1.5; // portrait: fade sooner
    const nearFade = smootherstep(clamp01((camDist - fadeAt) / 1.3));
    e.photoMat.opacity = nearFade;
    e.backMat.opacity = nearFade;
    e.sub.visible = e.loaded && !e.failed && nearFade > 0.01;
    e.sub.updateMatrixWorld(true);

    // .is-hot on the DOM caption (both hover directions land here)
    const wantHot = e.hot > 0.12;
    if (wantHot !== e.hotClass) {
      e.card.classList.toggle("is-hot", wantHot);
      e.hotClass = wantHot;
    }

    // pin the caption under the plate: project a point a little below the
    // plate centre (rotates with the tilt), map NDC -> CSS pixels.
    _vAnchor.set(0, -VITRINE_LABEL_DROP, 0);
    e.sub.localToWorld(_vAnchor);
    _vProj.copy(_vAnchor).project(camera);
    const behind = _vProj.z > 1;
    const onScreen =
      !behind &&
      _vProj.x > -1.3 && _vProj.x < 1.3 &&
      _vProj.y > -1.4 && _vProj.y < 1.4;
    const op =
      (e.failed ? (behind ? 0 : env) : e.loaded && onScreen ? env : 0) * nearFade;

    const st = e.card.style;
    if (!behind) {
      // behind the camera the projection flips/diverges — freeze the last
      // sane transform rather than writing a garbage position (opacity is 0).
      const sx = (_vProj.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-_vProj.y * 0.5 + 0.5) * window.innerHeight;
      st.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
    st.opacity = op.toFixed(3);
    const interactive = op > 0.05;
    st.pointerEvents = interactive ? "auto" : "none";

    // keyboard/AT gate: pointer-events doesn't stop Tab, so an invisible
    // caption would still be a focusable link. Mirror the visual state onto
    // tabindex + aria-hidden (only written on change, not per frame).
    if (interactive !== e.focusable) {
      e.focusable = interactive;
      if (interactive) {
        e.card.removeAttribute("aria-hidden");
        e.anchors.forEach((a) => a.removeAttribute("tabindex"));
      } else {
        e.card.setAttribute("aria-hidden", "true");
        e.anchors.forEach((a) => a.setAttribute("tabindex", "-1"));
      }
    }
  }
}

function tick() {
  const prev = rig.progress;
  rig.progress += (rig.target - rig.progress) * LERP_K;
  rig.velocity = rig.progress - prev;

  updateChapterFades();

  const now = performance.now();
  const p = rig.progress;

  // scroll cue: the immersive rig owns fading the chapter-1 cue out over the
  // first 6% of scroll (its js/main.js fade is inert on this page — no hero-grid).
  // Latched once fully faded so this stops writing an unchanging "0.000" every
  // frame for the rest of the scroll journey; un-latches on scrolling back up.
  if (scrollCue) {
    if (p >= 0.06) {
      if (!scrollCueFaded) {
        scrollCue.style.opacity = "0.000";
        scrollCueFaded = true;
      }
    } else {
      scrollCueFaded = false;
      scrollCue.style.opacity = (1 - clamp01(p / 0.06)).toFixed(3);
    }
  }

  // --- emergence envelope (chapter 6) --------------------------------------
  // One eased 0..1 ramp that drives the whole close: it turns the gaze back
  // toward the stone, dollies the camera away so the stone recedes tiny, clears
  // the fog to near-black, and dissolves the tunnel shell. Timed to complete as
  // the chapter-6 CTA copy settles centred (~p .9-.93), so the reader sees the
  // invitation over a small, glinting, receding stone in the dark — the close.
  const emerge = smootherstep(chapterWindow(p, 0.82, 0.93));

  // --- camera spline -------------------------------------------------------
  // easeOut maps scroll fraction to arc-length position along the spline.
  const t = easeOut(p);
  camPath.getPointAt(t, camera.position);
  // pointer parallax: ease the live offset toward the pointer-set target, clamp
  // its length to PARALLAX_MAX, and add it to the spline position. Small and
  // lerped so it reads as a living float, not a fight with the lookAt below.
  parallax.x += (parallax.tx - parallax.x) * 0.05;
  parallax.y += (parallax.ty - parallax.y) * 0.05;
  const plen = Math.hypot(parallax.x, parallax.y);
  if (plen > PARALLAX_MAX) {
    const ps = PARALLAX_MAX / plen;
    parallax.x *= ps;
    parallax.y *= ps;
  }
  camera.position.x += parallax.x;
  camera.position.y += parallax.y;
  // emergence dolly: the spline all but parks near the pavilion through chapter
  // 6, so pull the camera straight back out into the dark as `emerge` ramps.
  // This is what actually makes the stone recede and shrink to "tiny again",
  // and carries the camera clear of the tunnel-shell extent (z ~ -7.2) so the
  // surround genuinely opens to black rather than the fogged interior.
  camera.position.z -= emerge * 5.0;

  // lookAt blends from the stone (chapters 1-2) to the direction of travel
  // (chapters 3-6) so once inside we look where we're going. The chapter-1
  // gaze aims left of the stone, which frames the emerald in the RIGHT half
  // of the viewport — clear of the left-anchored headline instead of muddying
  // it from behind (the first pass centred the stone under the copy).
  camPath.getTangentAt(t, _tangent);
  const look = chapterWindow(p, 0.18, 0.3);
  _lookAhead.copy(camera.position).add(_tangent);
  // The lateral offset is calibrated against a ~1.6 desktop aspect; a phone
  // in portrait has a far narrower horizontal FOV, and the full -0.78 pushes
  // the stone clean off the right edge. Scale it with aspect so the stone
  // stays framed beside/below the copy on any viewport.
  const lookX = -0.78 * Math.min(1, camera.aspect / 1.6);
  _lookTarget.set(lookX, 0.1, 0).lerp(_lookAhead, look);
  // forward-look orientation — identical to camera.lookAt(_lookTarget).
  _lookMat.lookAt(camera.position, _lookTarget, _up);
  _qLook.setFromRotationMatrix(_lookMat);
  // Emergence (chapter 6): the gaze turns back toward the stone as the camera
  // dollies away, so the emerald drifts into frame far behind and recedes.
  // Slerped, not target-lerped: lerping the look TARGET from a point ahead to a
  // point behind sweeps it through the camera itself near the midpoint, where
  // lookAt is degenerate and the view snaps. Quaternion slerp turns the head
  // cleanly. The back-target sits a little ABOVE the origin so the receding
  // stone rides the lower third of the frame, clear of the centred CTA copy.
  if (emerge > 0.0001) {
    _lookTarget.set(0, 1.2, 0);
    _lookMat.lookAt(camera.position, _lookTarget, _up);
    _qBack.setFromRotationMatrix(_lookMat);
    _qLook.slerp(_qBack, emerge);
  }
  camera.quaternion.copy(_qLook);

  // --- fog: ramp up across chapter 3, back down across chapter 6 -----------
  // The extra (1 - 0.75*emerge) tail clears the residual fog floor across the
  // final turn so the emergence frame reads as near-black around a small,
  // near-unfogged receding stone rather than a grey-green haze.
  const fogIn = chapterWindow(p, 0.22, 0.4);
  const fogOut = chapterWindow(p, 0.82, 1.0);
  const density = FOG_DENSITY_MAX * fogIn * (1 - 0.85 * fogOut) * (1 - 0.75 * emerge);

  // --- crossing veil: the luminous emerald sheet that carries the camera
  // through the crown. Driven by actual camera depth (not a scroll fraction,
  // so retiming the spline can never desynchronize it): rises over z
  // 1.55->0.55, holds through the surface, clears over z -0.45->-1.45. The
  // stone itself is hidden while the camera is inside its extent — up close
  // its facets are viewport-sized flat polygons — and the veil covers both
  // toggles completely.
  const cz = camera.position.z;
  const veil =
    smootherstep(clamp01((2.9 - cz) / 1.7)) *
    smootherstep(clamp01((cz + 1.45) / 1.0)) * 0.95;
  emerald.visible = cz > 1.05 || cz < -0.95;

  // --- interior shell: fades in behind the flash, holds lit through the deep,
  // then dissolves across the emergence turn (1 - emerge) so the tunnel walls
  // fall away to black as the camera looks back at the receding stone.
  const shellFade = chapterWindow(p, 0.19, 0.3) * (1 - emerge);
  shell.visible = shellFade > 0.002;

  // motes: built-in MeshBasicMaterial does read scene.fog (unlike the
  // hand-rolled gem/shell ShaderMaterials), so driving it with the same
  // density keeps their glow dissolving into the deep in lockstep with the
  // stone and tunnel walls.
  scene.fog.density = density;
  updateMotes(now, p, _tangent);
  updateVitrines(p);

  // idle orientation drift + easing back toward the resting tilt (gem.js)
  if (now - stone.lastTouch > 2500) stone.ry += 0.0032;
  stone.rx += (0.45 - stone.rx) * 0.005;
  stone.rx = Math.max(-0.9, Math.min(0.9, stone.rx));
  const bob = Math.sin(now * 0.0007) * 0.04;
  emerald.rotation.set(stone.rx, stone.ry, 0);
  emerald.position.y = bob;
  // world-space normal matrix (see uNormalMat in GEM_VS) — the emerald rotates
  // every frame, so matrixWorld must be forced current before deriving it (the
  // renderer's own updateMatrixWorld pass happens later, inside render()).
  emerald.updateMatrixWorld(true);

  // walking-light orbit: 1400ms sweep, amp = sin(pi * o)
  const o = (now - stone.orbitT) / 1400;
  const amp = o >= 0 && o <= 1 ? Math.sin(o * 3.14159) : 0;
  // Farewell glint — a scroll-scrubbed specular sweep across the receding stone,
  // peaking (glintW=.5, p~.925) as the gaze completes its turn. Reuses the same
  // uOrbit/uAmp uniforms as the walking light (uOrbit sweeps the highlight, uAmp
  // is its strength), so no new lighting path is introduced. Takes over only
  // when it's stronger than any live click/idle orbit, so the two never stack.
  const glintW = chapterWindow(p, 0.85, 1.0);
  const glintAmp = Math.sin(glintW * Math.PI);
  let orbitVal = o;
  let ampVal = amp;
  if (glintAmp > ampVal) {
    orbitVal = glintW;
    ampVal = glintAmp;
  }
  const u = emerald.material.uniforms;
  u.uOrbit.value = orbitVal;
  u.uAmp.value = ampVal;
  u.uKey.value.set(stone.keyX, stone.keyY, 0.5);
  u.uFogDensity.value = density;
  u.uNormalMat.value.getNormalMatrix(emerald.matrixWorld);
  // world->local rotation for the transmission march: the transform is pure
  // rotation, so the normal matrix IS the rotation and its transpose is the
  // inverse. uCenter tracks the idle bob.
  u.uInvRot.value.copy(u.uNormalMat.value).transpose();
  u.uCenter.value.copy(emerald.position);

  const su = shell.material.uniforms;
  su.uOrbit.value = orbitVal;
  su.uAmp.value = ampVal;
  su.uKey.value.set(stone.keyX, stone.keyY, 0.5);
  su.uFogDensity.value = density;
  su.uFade.value = shellFade;
  su.uTime.value = now;

  post.render(scene, camera, veil, now);

  // The journey ends before the document does: the footer scrolls up over
  // the fixed canvas, and the receding stone was landing right on its link
  // columns. Fade the whole 3D layer to nothing across the last stretch so
  // the close hands the page back to the DOM.
  const canvasFade = 1 - smootherstep(chapterWindow(p, 0.94, 0.985));
  if (canvasFade !== lastCanvasFade) {
    canvas.style.opacity = canvasFade.toFixed(3);
    lastCanvasFade = canvasFade;
  }
  rafId = requestAnimationFrame(tick);
}

function teardown() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  if (orbitTimer !== null) clearTimeout(orbitTimer);
  if (orbitInterval !== null) clearInterval(orbitInterval);
  orbitTimer = orbitInterval = null;
  window.removeEventListener("scroll", computeTarget);
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("click", onClick);
  if (post) post.dispose();
  post = null;
  if (motes) {
    if (scene) scene.remove(motes.mesh);
    motes.dispose();
  }
  motes = null;
  if (vitrines) {
    vitrines.userData.entries.forEach((e) => {
      if (e.onEnter) e.card.removeEventListener("mouseenter", e.onEnter);
      if (e.onLeave) e.card.removeEventListener("mouseleave", e.onLeave);
      e.card.classList.remove("is-hot");
      // clear the per-frame inline styles + focus gate so the fallback card
      // returns clean and fully keyboard-reachable
      e.card.style.transform = "";
      e.card.style.opacity = "";
      e.card.style.pointerEvents = "";
      e.card.removeAttribute("aria-hidden");
      e.anchors.forEach((a) => a.removeAttribute("tabindex"));
    });
    if (scene) scene.remove(vitrines);
    vitrines.userData.dispose();
  }
  vitrines = null;
  rayHover = domHover = -1;
  if (shell) {
    // geometry is shared with the emerald (disposed just below) — material only.
    shell.material.dispose();
  }
  shell = null;
  if (emerald) {
    emerald.geometry.dispose();
    emerald.material.dispose();
  }
  emerald = null;
  if (scrollCue) {
    // hand the cue back to the static page cleanly
    scrollCue.style.opacity = "";
    scrollCue = null;
  }
  scrollCueFaded = false;
  parallax.x = parallax.y = parallax.tx = parallax.ty = 0;
  if (canvas) {
    canvas.style.opacity = "";
    canvas.hidden = true;
  }
  lastCanvasFade = -1;
  document.body.classList.remove("is-immersive");
}

// ---------------------------------------------------------------------------
// Mount guard
// ---------------------------------------------------------------------------
function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function mount() {
  if (prefersReducedMotion()) return false;

  try {
    buildChapters();
    buildScene();

    // Snap the rig to the current scroll position instead of easing up from
    // zero on load, so a mid-scroll refresh doesn't play a visible catch-up.
    computeTarget();
    rig.progress = rig.target;
    updateChapterFades();

    scrollCue = document.querySelector(".scroll-cue");
    scrollCueFaded = false;

    window.addEventListener("scroll", computeTarget, { passive: true });
    window.addEventListener("resize", handleResize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("click", onClick);

    // reverse hover: pointing at a DOM caption lights its 3D plate (the other
    // direction — plate raycast -> caption — runs in onPointerMove/updateVitrines).
    if (vitrines) {
      vitrines.userData.entries.forEach((e, i) => {
        e.onEnter = () => {
          domHover = i;
        };
        e.onLeave = () => {
          if (domHover === i) domHover = -1;
        };
        e.card.addEventListener("mouseenter", e.onEnter);
        e.card.addEventListener("mouseleave", e.onLeave);
      });
    }

    // the walking light fires once ~2.4s after mount, then wanders on its own
    // every 9s whenever the pointer has been idle for >4s
    orbitTimer = setTimeout(() => {
      stone.orbitT = performance.now();
    }, 2400);
    orbitInterval = setInterval(() => {
      if (performance.now() - stone.lastTouch > 4000) stone.orbitT = performance.now();
    }, 9000);

    canvas.hidden = false;
    document.body.classList.add("is-immersive");

    rafId = requestAnimationFrame(tick);
    return true;
  } catch (err) {
    // NoWebGLError is the expected, silent fallback path (see buildScene) —
    // only log genuinely unexpected mount failures.
    if (!(err instanceof NoWebGLError)) {
      console.error("[immersive] mount failed, falling back to the static page:", err);
    }
    teardown();
    return false;
  }
}

mount();
