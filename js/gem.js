/* FROZI FINE GEMS — the loose stones.
   Real-time faceted gems: the baked round-brilliant mesh, fresnel +
   refraction shading through the cut's true facets, and a two-pass bloom
   with chromatic dispersion. Zero dependencies, WebGL1.
   Mounts into every [data-gem] element on the page. One stone by default;
   data-gems="emerald,sapphire,…" renders that roster as a tray of
   individually grabbable stones in a single context (see SPECIES). The host
   section gets .has-gem while the stones are live, so static fallbacks can
   hide themselves, and an off-screen mount is parked rather than rendered. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- shaders ---- */
  var GEM_VS = [
    "attribute vec3 aP; attribute vec3 aN;",
    "uniform mat4 uProj, uView, uModel;",
    "uniform float uScale;",                                /* 1.0 for a lone stone */
    "varying vec3 vN; varying vec3 vP;",
    "void main(){",
    "  vec4 w = uModel * vec4(aP * uScale, 1.0);",
    "  vP = w.xyz; vN = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aN;",
    "  gl_Position = uProj * uView * w;",
    "}"
  ].join("\n");

  /* The same physically-plausible material as the immersive homepage stone
     (js/immersive.js GEM_FS): per-channel refraction marched through an
     analytic bounding ellipsoid broken into virtual facets, Beer-Lambert
     absorption, TIR fire, Schlick fresnel over a structured studio
     environment, ACES tonemap. The model transform is pure rotation +
     translation, so world->local is `v * rot` (row-vector = transpose) with
     uScale divided back out.
     What the STONE is — absorption, index of refraction, inner glow, rim
     tint — arrives as uniforms, so one program renders every species in the
     tray. What the ROOM is (uEnv*) is set once per mount: five stones have
     to be read against the same light or their colours mean nothing. */
  var GEM_FS = [
    "precision highp float;",
    "varying vec3 vN; varying vec3 vP;",
    "uniform mat4 uModel;",
    "uniform vec3 uEye; uniform vec3 uKey; uniform float uOrbit; uniform float uAmp;",
    "uniform float uScale;",
    "const vec3 IVORY = vec3(0.985, 0.972, 0.94);",
    "uniform vec4 uPlanes[90];",                            /* the cut's hull facets */
    "uniform vec3 uSigma;",                                 /* absorption per unit */
    "uniform vec3 uEta;",                                   /* 1/n per channel */
    "uniform vec3 uBody;",                                  /* light kept in the stone */
    "uniform vec3 uRim;",                                   /* the stone's own rim tint */
    "uniform vec3 uEnvBase, uEnvFill, uEnvRim;",            /* the room, not the stone */
    "vec3 env(vec3 d){",                                    /* procedural studio */
    "  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);",
    "  vec3 base = mix(vec3(0.004, 0.007, 0.006), uEnvBase, up * up);",
    "  float ck = dot(d, normalize(vec3(-0.42, 0.60, 0.55)));",
    "  float key = smoothstep(0.50, 0.86, ck) * (0.6 + 1.1 * smoothstep(0.84, 0.985, ck));",
    "  float ck2 = dot(d, normalize(vec3(0.55, 0.52, -0.42)));",
    "  float key2 = smoothstep(0.72, 0.93, ck2) * (0.5 + 0.8 * smoothstep(0.90, 0.99, ck2));",
    "  float strip = smoothstep(0.10, 0.16, d.y) * (1.0 - smoothstep(0.20, 0.27, d.y))",
    "              * smoothstep(-0.2, 0.45, d.z);",
    "  float fill = smoothstep(0.45, 0.95, dot(d, normalize(vec3(0.72, 0.10, 0.30))));",
    "  float rim = smoothstep(0.78, 0.985, dot(d, normalize(vec3(0.10, -0.25, -0.94))));",
    "  float under = smoothstep(-0.05, -0.75, d.y) * (0.5 + 0.5 * smoothstep(-0.4, 0.6, d.z));",
    "  return base + IVORY * key * 2.2 + vec3(0.80, 0.86, 0.90) * key2 * 1.1",
    "       + IVORY * strip * 0.4 + uEnvFill * fill * 0.3",
    "       + uEnvRim * rim * 0.5 + uEnvBase * under * 1.35;",
    "}",
    "vec3 hash3(vec3 q){",                                  /* polish micro-waviness */
    "  return fract(sin(vec3(dot(q, vec3(127.1, 311.7, 74.7)),",
    "                        dot(q, vec3(269.5, 183.3, 246.1)),",
    "                        dot(q, vec3(113.5, 271.9, 124.6)))) * 43758.5453) * 2.0 - 1.0;",
    "}",
    "float planeExit(vec3 o, vec3 d, out vec3 n){",         /* true exit facet */
    "  float tMin = 4.0; n = vec3(0.0, 1.0, 0.0);",
    "  for (int i = 0; i < 90; i++) {",
    "    float dn = dot(uPlanes[i].xyz, d);",
    "    if (dn > 1e-5) {",
    "      float t = (uPlanes[i].w - dot(uPlanes[i].xyz, o)) / dn;",
    "      if (t > 1e-4 && t < tMin) { tMin = t; n = uPlanes[i].xyz; }",
    "    }",
    "  }",
    "  return tMin;",
    "}",
    "float gemPath(vec3 V, vec3 N, vec3 oL, mat3 rot, out vec3 rayL, out vec3 exitN){",
    "  vec3 T = refract(-V, N, uEta.g);",
    "  if (dot(T, T) < 1e-4) T = reflect(-V, N);",
    "  vec3 tL = normalize(T * rot);",                      /* world -> local */
    "  vec3 n2;",
    "  float dist = planeExit(oL, tL, n2);",
    "  vec3 T2 = refract(tL, -n2, 1.0 / uEta.g);",
    "  if (dot(T2, T2) < 1e-4) {",                          /* TIR: one bounce */
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
    "void main(){",
    "  vec3 N = normalize(vN);",
    "  N = normalize(N + hash3(floor(vP * 90.0)) * 0.002);",
    "  vec3 V = normalize(uEye - vP);",
    "  if (dot(N, V) < 0.0) N = -N;",
    "  vec3 R = reflect(-V, N);",
    "  mat3 rot = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz);",
    "  vec3 oL = (vP - uModel[3].xyz) * rot / uScale;",              /* world -> local */
    "  oL -= normalize(N * rot) * 0.002;",                  /* just inside the facet */
    "  vec3 rayL, exitN;",
    "  float plen = gemPath(V, N, oL, rot, rayL, exitN) * uScale;",
    "  vec3 er = refract(rayL, -exitN, 1.0 / uEta.r);",
    "  vec3 eg = refract(rayL, -exitN, 1.0 / uEta.g);",
    "  vec3 eb = refract(rayL, -exitN, 1.0 / uEta.b);",
    "  if (dot(eg, eg) < 1e-4) eg = reflect(rayL, exitN);",
    "  if (dot(er, er) < 1e-4) er = eg;",
    "  if (dot(eb, eb) < 1e-4) eb = eg;",
    "  vec3 body;",
    "  body.r = env(rot * normalize(er)).r * exp(-uSigma.r * plen * 1.8);",
    "  body.g = env(rot * normalize(eg)).g * exp(-uSigma.g * plen * 1.8);",
    "  body.b = env(rot * normalize(eb)).b * exp(-uSigma.b * plen * 1.8);",
    "  body += uBody * exp(-0.9 * plen);",
    "  body += uBody * 0.4;",
    "  float fid = fract(sin(dot(N, vec3(12.9898, 78.233, 37.719))) * 43758.5453);",
    "  body *= 0.92 + 0.16 * fid;",
    "  float fres = 0.05 + 0.95 * pow(1.0 - max(dot(N, V), 0.0), 5.0);",
    "  vec3 col = mix(body * 1.15, env(R) * 1.2, fres);",
    "  vec3 H1 = normalize(uKey + V);",                     /* ivory key light */
    "  float s1 = pow(max(dot(N, H1), 0.0), 120.0);",
    "  vec3 H2 = normalize(normalize(vec3(-0.65, -0.15, -0.5)) + V);",
    "  float s2 = pow(max(dot(N, H2), 0.0), 48.0);",        /* jade rim */
    "  float a = uOrbit * 6.28318;",
    "  vec3 H3 = normalize(normalize(vec3(cos(a), 0.35, sin(a))) + V);",
    "  float s3 = pow(max(dot(N, H3), 0.0), 70.0) * uAmp;", /* the walking light */
    "  col += IVORY * (s1 * 1.5 + smoothstep(0.5, 1.0, s1) * 0.8);",
    "  col += uRim * s2 * 0.35 + IVORY * s3 * 3.4;",
    "  col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), 0.04);",
    "  gl_FragColor = vec4(pow(aces(col), vec3(0.4545)), 1.0);",
    "}"
  ].join("\n");

  var QUAD_VS = [
    "attribute vec2 aQ; varying vec2 vUV;",
    "void main(){ vUV = aQ * 0.5 + 0.5; gl_Position = vec4(aQ, 0.0, 1.0); }"
  ].join("\n");

  var BRIGHT_FS = [
    "precision mediump float; varying vec2 vUV; uniform sampler2D uTex;",
    "void main(){",
    "  vec4 c = texture2D(uTex, vUV);",
    "  gl_FragColor = vec4(max(c.rgb - 0.7, 0.0) * 1.6 * c.a, 1.0);",
    "}"
  ].join("\n");

  var BLUR_FS = [
    "precision mediump float; varying vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir;",
    "void main(){",
    "  vec3 c = texture2D(uTex, vUV).rgb * 0.227;",
    "  c += (texture2D(uTex, vUV + uDir * 1.385).rgb + texture2D(uTex, vUV - uDir * 1.385).rgb) * 0.316;",
    "  c += (texture2D(uTex, vUV + uDir * 3.231).rgb + texture2D(uTex, vUV - uDir * 3.231).rgb) * 0.07;",
    "  gl_FragColor = vec4(c, 1.0);",
    "}"
  ].join("\n");

  /* bloom re-enters with the red channel spread wider than the blue —
     the fringe reads as dispersion, the fire of a real stone */
  var COMP_FS = [
    "precision mediump float; varying vec2 vUV;",
    "uniform sampler2D uScene; uniform sampler2D uBloom;",
    "void main(){",
    "  vec4 s = texture2D(uScene, vUV);",
    "  vec2 d = vUV - 0.5;",
    "  vec3 b;",
    "  b.r = texture2D(uBloom, 0.5 + d * 1.012).r;",
    "  b.g = texture2D(uBloom, vUV).g;",
    "  b.b = texture2D(uBloom, 0.5 + d * 0.988).b;",
    "  vec3 col = s.rgb + b * 0.95;",
    "  float a = clamp(s.a + dot(b, vec3(0.299, 0.587, 0.114)) * 1.7, 0.0, 1.0);",
    "  gl_FragColor = vec4(col, a);",
    "}"
  ].join("\n");

  /* ---- what each stone is -------------------------------------------------
     eta is 1/n per channel, spread by the species' real dispersion (diamond
     0.044 fires hardest, emerald 0.014 least) on the same exaggeration the
     lone emerald was tuned with, so the fire stays readable at this size.
     sigma is Beer-Lambert absorption per unit of path: what the stone takes
     out of the light on its way through, which is where the colour comes
     from. body is the light it keeps; rim tints its own grazing highlight. */
  var SPECIES = {
    emerald: {
      label: "Emerald", eta: [0.6460, 0.6365, 0.6270], sigma: [3.20, 0.60, 1.30],
      body: [0.003, 0.042, 0.026], rim: [0.29, 0.57, 0.455]
    },
    sapphire: {
      label: "Sapphire", eta: [0.5773, 0.5650, 0.5527], sigma: [3.60, 2.30, 0.42],
      body: [0.003, 0.014, 0.055], rim: [0.32, 0.48, 0.78]
    },
    ruby: {
      label: "Ruby", eta: [0.5798, 0.5675, 0.5552], sigma: [0.34, 3.30, 2.60],
      body: [0.055, 0.004, 0.010], rim: [0.78, 0.30, 0.36]
    },
    diamond: {
      label: "Diamond", eta: [0.4435, 0.4137, 0.3839], sigma: [0.05, 0.05, 0.05],
      body: [0.020, 0.022, 0.026], rim: [0.72, 0.78, 0.84]
    },
    tourmaline: {
      label: "Tourmaline", eta: [0.6273, 0.6158, 0.6043], sigma: [3.00, 0.55, 0.45],
      body: [0.003, 0.040, 0.040], rim: [0.26, 0.66, 0.62]
    }
  };

  /* the room. A lone stone sits in the maison's green light; a tray of five
     has to sit in neutral cold light or every stone reads faintly emerald. */
  var ROOM_SOLO = { base: [0.035, 0.075, 0.058], fill: [0.42, 0.50, 0.44], rim: [0.30, 0.58, 0.47] };
  var ROOM_TRAY = { base: [0.038, 0.056, 0.070], fill: [0.44, 0.48, 0.53], rim: [0.34, 0.44, 0.55] };

  function mount(host) {
    var scrollDriven = host.hasAttribute("data-scroll-gem");
    if (scrollDriven && reduce) return false;

    /* one stone by default; data-gems="emerald,ruby,…" makes it a tray */
    var roster = (host.getAttribute("data-gems") || "emerald")
      .split(",")
      .map(function (n) { return n.trim().toLowerCase(); })
      .filter(function (n) { return SPECIES[n]; });
    if (!roster.length) roster = ["emerald"];
    var tray = roster.length > 1;
    var room = tray ? ROOM_TRAY : ROOM_SOLO;

    var canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;" +
      "cursor:grab;touch-action:none";
    host.appendChild(canvas);
    var gl = canvas.getContext("webgl", { antialias: false, alpha: true }) ||
             canvas.getContext("experimental-webgl", { antialias: false, alpha: true });
    if (!gl) { host.removeChild(canvas); return false; }

    /* ---- geometry: the baked round-brilliant cut (js/gem-model.js),
       expanded to non-indexed triangles with flat per-face normals. The same
       model's hull planes drive the shader's exact interior trace. ---- */
    var MODEL = window.FROZI_GEM_MODEL;
    if (!MODEL) { host.removeChild(canvas); return false; }
    var pos = [], nrm = [];
    var mp = MODEL.positions, mi = MODEL.indices;
    for (var f = 0; f < mi.length; f += 3) {
      var a = [mp[mi[f]*3], mp[mi[f]*3+1], mp[mi[f]*3+2]];
      var b = [mp[mi[f+1]*3], mp[mi[f+1]*3+1], mp[mi[f+1]*3+2]];
      var c = [mp[mi[f+2]*3], mp[mi[f+2]*3+1], mp[mi[f+2]*3+2]];
      var ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
      var vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
      var nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
      var l = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
      [a, b, c].forEach(function (p) { pos.push(p[0], p[1], p[2]); nrm.push(nx/l, ny/l, nz/l); });
    }
    var vertCount = pos.length / 3;

    /* ---- programs ---- */
    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function program(vs, fs, attribs, uniforms) {
      var p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var o = { p: p, a: {}, u: {} };
      attribs.forEach(function (n) { o.a[n] = gl.getAttribLocation(p, n); });
      uniforms.forEach(function (n) { o.u[n] = gl.getUniformLocation(p, n); });
      return o;
    }
    var P3D = program(GEM_VS, GEM_FS, ["aP", "aN"],
      ["uProj", "uView", "uModel", "uEye", "uKey", "uOrbit", "uAmp", "uPlanes",
       "uScale", "uSigma", "uEta", "uBody", "uRim", "uEnvBase", "uEnvFill", "uEnvRim"]);
    gl.useProgram(P3D.p);
    gl.uniform4fv(P3D.u.uPlanes, MODEL.planes);
    gl.uniform3fv(P3D.u.uEnvBase, room.base);
    gl.uniform3fv(P3D.u.uEnvFill, room.fill);
    gl.uniform3fv(P3D.u.uEnvRim, room.rim);
    var PBRIGHT = program(QUAD_VS, BRIGHT_FS, ["aQ"], ["uTex"]);
    var PBLUR = program(QUAD_VS, BLUR_FS, ["aQ"], ["uTex", "uDir"]);
    var PCOMP = program(QUAD_VS, COMP_FS, ["aQ"], ["uScene", "uBloom"]);

    function buffer(data) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return b;
    }
    var posBuf = buffer(pos), nrmBuf = buffer(nrm);
    var quadBuf = buffer([-1, -1, 3, -1, -1, 3]);           /* one big triangle */

    /* ---- framebuffers: full-res scene (supersampled), quarter-res bloom ---- */
    function makeTarget(w, h, depth) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      var rb = null;
      if (depth) {
        rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fb: fb, tex: tex, rb: rb, w: w, h: h };
    }
    function drop(t) {
      if (!t) return;
      gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex);
      if (t.rb) gl.deleteRenderbuffer(t.rb);
    }
    var scene = null, pingA = null, pingB = null;

    /* ---- matrices ---- */
    function persp(fov, asp, n, f) {
      var t = 1 / Math.tan(fov / 2);
      return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
    }
    var EYE = [0, 0.85, 4.7];
    function lookAt(e) {
      var zx = e[0], zy = e[1], zz = e[2];
      var zl = Math.sqrt(zx*zx+zy*zy+zz*zz); zx/=zl; zy/=zl; zz/=zl;
      var xx = zz, xz = -zx;
      var xl = Math.sqrt(xx*xx+xz*xz); xx/=xl; xz/=xl;
      var yx = zy*xz, yy = zz*xx - zx*xz, yz = -zy*xx;
      return [xx,yx,zx,0, 0,yy,zy,0, xz,yz,zz,0,
        -(xx*e[0]+xz*e[2]), -(yx*e[0]+yy*e[1]+yz*e[2]), -(zx*e[0]+zy*e[1]+zz*e[2]), 1];
    }
    function model(rx, ry, tx, ty) {
      var cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      return [cy,sx*sy,-cx*sy,0, 0,cx,sx,0, sy,-sx*cy,cx*cy,0, tx,ty,0,1];
    }

    /* column-major 4x4 point transform, for placing screen hit-targets */
    function xform(m, p) {
      var o = [0, 0, 0, 0], i, j;
      for (i = 0; i < 4; i++) {
        for (j = 0; j < 4; j++) o[i] += m[j * 4 + i] * p[j];
      }
      return o;
    }

    /* ---- the stones ---------------------------------------------------------
       Each stone owns its own pose, throw velocity and idle drift, so a tray
       reads as five separate objects on one piece of felt rather than one
       rig with five heads. Stone 0 is the primary: the scroll choreography,
       the dataset the tests read, and every single-stone mount drive it. */
    var stones = roster.map(function (name, i) {
      return {
        name: name, spec: SPECIES[name],
        rx: 0.45, ry: 0.65 + i * 1.13, vx: 0, vy: 0,
        x: 0, y: 0, scale: 1,
        sx: 0, sy: 0, sr: 0,                                /* screen centre + radius */
        lastTouch: 0, orbitT: -1e9, releasedAt: -1e9, settling: false,
        drift: 0.0026 + (i % 3) * 0.0007,                   /* no two turn in step */
        phase: i * 1.7
      };
    });
    var primary = stones[0];
    var dragging = false, dragPointer = null, dragStone = null, lastX = 0, lastY = 0;
    var keyX = 0.55, keyY = 0.75;
    var targetRx = primary.rx, targetRy = primary.ry;
    var lastFrame = performance.now();
    var active = true;
    var raf = 0;
    var stage = host.closest(".rt-stage");

    function nearestAngle(target, current) {
      return current + Math.atan2(Math.sin(target - current), Math.cos(target - current));
    }

    /* which stone is under the pointer (a lone stone always answers) */
    function pick(clientX, clientY) {
      if (!tray) return primary;
      var r = canvas.getBoundingClientRect();
      var px = clientX - r.left, py = clientY - r.top;
      var best = null, bestD = Infinity;
      stones.forEach(function (st) {
        var d = Math.sqrt((px - st.sx) * (px - st.sx) + (py - st.sy) * (py - st.sy));
        if (d < st.sr * 1.5 && d < bestD) { bestD = d; best = st; }
      });
      return best;
    }

    if (!reduce) {
      canvas.addEventListener("pointerdown", function (e) {
        var hit = pick(e.clientX, e.clientY);
        if (!hit) return;
        dragging = true; dragStone = hit; hit.settling = false;
        dragPointer = e.pointerId;
        lastX = e.clientX; lastY = e.clientY;
        hit.lastTouch = e.timeStamp || performance.now();
        hit.vx = 0; hit.vy = 0;
        canvas.style.cursor = "grabbing"; canvas.setPointerCapture(e.pointerId);
        if (stage) stage.classList.add("is-dragging");
        schedule();
      });
      canvas.addEventListener("pointermove", function (e) {
        if (dragging && dragStone && e.pointerId === dragPointer) {
          var st = dragStone;
          var samples = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
          if (!samples.length) samples = [e];
          samples.forEach(function (sample) {
            var stamp = sample.timeStamp || performance.now();
            var frameTime = Math.max(4, Math.min(50, stamp - st.lastTouch)) / 16.667;
            var moveY = (sample.clientX - lastX) * 0.008;
            var moveX = (sample.clientY - lastY) * 0.006;
            var instantVx = Math.max(-0.14, Math.min(0.14, moveX / frameTime));
            var instantVy = Math.max(-0.18, Math.min(0.18, moveY / frameTime));
            st.vx = st.vx * 0.45 + instantVx * 0.55;
            st.vy = st.vy * 0.45 + instantVy * 0.55;
            st.ry += moveY; st.rx += moveX;
            lastX = sample.clientX; lastY = sample.clientY; st.lastTouch = stamp;
          });
        }
        var r = canvas.getBoundingClientRect();
        keyX = 0.25 + ((e.clientX - r.left) / r.width) * 0.7;
        keyY = 1.0 - ((e.clientY - r.top) / r.height) * 0.6;
        if (tray && !dragging) {
          canvas.style.cursor = pick(e.clientX, e.clientY) ? "grab" : "default";
        }
      }, { passive: true });
      var release = function () {
        if (!dragging) return;
        dragging = false; dragPointer = null;
        if (dragStone) {
          dragStone.settling = scrollDriven;
          dragStone.releasedAt = performance.now();
        }
        dragStone = null;
        canvas.style.cursor = "grab";
        if (stage) stage.classList.remove("is-dragging");
      };
      canvas.addEventListener("pointerup", release);
      canvas.addEventListener("pointercancel", release);
      canvas.addEventListener("lostpointercapture", release);
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
      window.addEventListener("pointerout", function (e) {
        if (!e.relatedTarget) release();
      });
      window.addEventListener("blur", release);
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) release();
      });
      canvas.addEventListener("click", function (e) {
        var hit = pick(e.clientX, e.clientY);
        if (hit) { hit.orbitT = performance.now(); schedule(); }
      });
    }

    /* ---- where the stones sit ------------------------------------------------
       Laid out in world units against the visible frame at z = 0, so a wide
       tray gets one row and a narrow one folds to 3 over 2 rather than
       shrinking five stones into invisibility. Screen centres and radii fall
       out of the same projection the GPU uses, which is what makes each
       stone individually grabbable. */
    var projM = persp(0.55, 1, 0.1, 20);
    var viewM = lookAt(EYE);
    var VIS_H = 2 * 4.7 * Math.tan(0.275);                 /* frame height at z = 0 */

    function layout() {
      var cw = Math.max(canvas.clientWidth, 1), ch = Math.max(canvas.clientHeight, 1);
      var asp = cw / ch;
      var visW = VIS_H * asp;
      if (!tray) {
        primary.x = 0; primary.y = 0; primary.scale = 1;
      } else if (asp >= 2.55) {
        var gap = Math.min(1.74, visW / (stones.length + 0.5));
        var s = Math.min(gap * 0.44, VIS_H * 0.30);
        stones.forEach(function (st, i) {
          st.x = (i - (stones.length - 1) / 2) * gap;
          st.y = 0;
          st.scale = s;
        });
      } else {
        var top = Math.ceil(stones.length / 2);
        var bot = stones.length - top;
        var gap2 = Math.min(1.74, visW / (top + 0.5));
        var s2 = Math.min(gap2 * 0.44, VIS_H * 0.21);
        stones.forEach(function (st, i) {
          var lower = i >= top;
          var k = lower ? i - top : i;
          var cols = lower ? bot : top;
          st.x = (k - (cols - 1) / 2) * gap2;
          st.y = (lower ? -1 : 1) * VIS_H * 0.24;
          st.scale = s2;
        });
      }
      /* project each centre, and a point one radius to its side, to screen px */
      var vp = [], i, j;
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) {
        var sum = 0, k2;
        for (k2 = 0; k2 < 4; k2++) sum += projM[k2 * 4 + i] * viewM[j * 4 + k2];
        vp[j * 4 + i] = sum;
      }
      stones.forEach(function (st) {
        var c = xform(vp, [st.x, st.y, 0, 1]);
        var e = xform(vp, [st.x + st.scale, st.y, 0, 1]);
        var cx = (c[0] / c[3] * 0.5 + 0.5) * cw;
        var cy = (1 - (c[1] / c[3] * 0.5 + 0.5)) * ch;
        st.sx = cx;
        st.sy = cy;
        st.sr = Math.max(Math.abs((e[0] / e[3] * 0.5 + 0.5) * cw - cx), 8);
      });
    }

    function resize() {
      var compact = window.matchMedia("(max-width: 820px)").matches;
      var cap = scrollDriven ? (compact ? 1.25 : 1.5) : (tray ? 1.75 : 2);
      var dpr = Math.min(window.devicePixelRatio || 1, cap);
      var w = Math.max(canvas.clientWidth * dpr | 0, 2);
      var h = Math.max(canvas.clientHeight * dpr | 0, 2);
      if (canvas.width === w && canvas.height === h && scene) return;
      canvas.width = w; canvas.height = h;
      /* the tray already spreads its cost over five stones — no supersample */
      var ss = (scrollDriven || tray) ? 1 : (dpr < 1.5 ? 2 : 1);
      drop(scene); drop(pingA); drop(pingB);
      scene = makeTarget(w * ss, h * ss, true);
      pingA = makeTarget(Math.max(w >> 2, 1), Math.max(h >> 2, 1), false);
      pingB = makeTarget(Math.max(w >> 2, 1), Math.max(h >> 2, 1), false);
      projM = persp(0.55, w / h, 0.1, 20);
      gl.useProgram(P3D.p);
      gl.uniformMatrix4fv(P3D.u.uProj, false, projM);
      layout();
    }

    function drawQuad(P, src, src2) {
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src);
      if (src2 !== undefined) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, src2);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(P.a.aQ);
      gl.vertexAttribPointer(P.a.aQ, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.useProgram(P3D.p);
    gl.uniformMatrix4fv(P3D.u.uView, false, lookAt(EYE));
    gl.uniform3fv(P3D.u.uEye, EYE);
    gl.useProgram(PCOMP.p);
    gl.uniform1i(PCOMP.u.uScene, 0);
    gl.uniform1i(PCOMP.u.uBloom, 1);

    function schedule() {
      if (!raf && active) raf = requestAnimationFrame(frame);
    }

    function frame(now) {
      raf = 0;
      if (!active) return;
      var frameScale = Math.max(0.25, Math.min(2.5, (now - lastFrame) / 16.667));
      lastFrame = now;
      resize();

      stones.forEach(function (st) {
        if ((dragging && dragStone === st) || reduce) return;
        st.rx += st.vx * frameScale; st.ry += st.vy * frameScale;
        var drag = scrollDriven ? 0.972 : 0.94;
        var friction = Math.pow(drag, frameScale);
        st.vx *= friction; st.vy *= friction;                 /* frame-rate independent inertia */
        if (scrollDriven && st === primary) {
          var restRy = nearestAngle(targetRy, st.ry);
          if (st.settling || Math.abs(st.vx) > 0.0002 || Math.abs(st.vy) > 0.0002) {
            /* A thrown stone coasts first. The restoring spring then fades in,
               keeping the release direction readable before it returns home. */
            var returnMix = Math.max(0, Math.min(1, (now - st.releasedAt - 260) / 900));
            var spring = 0.03 * returnMix * frameScale;
            st.rx += (targetRx - st.rx) * spring;
            st.ry += (restRy - st.ry) * spring;
            if (
              Math.abs(targetRx - st.rx) < 0.001 &&
              Math.abs(restRy - st.ry) < 0.001 &&
              Math.abs(st.vx) < 0.0002 &&
              Math.abs(st.vy) < 0.0002
            ) {
              st.rx = targetRx; st.ry = restRy; st.vx = 0; st.vy = 0; st.settling = false;
            }
          } else {
            st.rx = targetRx; st.ry = restRy;
          }
        } else {
          if (now - st.lastTouch > 2500) st.ry += st.drift;   /* Maison idle drift */
          st.rx += (0.45 - st.rx) * 0.005;
        }
        st.rx = Math.max(-0.9, Math.min(0.9, st.rx));
      });

      /* pass 1: the stones, into the scene target */
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb);
      gl.viewport(0, 0, scene.w, scene.h);
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(P3D.p);
      gl.uniform3f(P3D.u.uKey, keyX, keyY, 0.5);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(P3D.a.aP);
      gl.vertexAttribPointer(P3D.a.aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
      gl.enableVertexAttribArray(P3D.a.aN);
      gl.vertexAttribPointer(P3D.a.aN, 3, gl.FLOAT, false, 0, 0);

      canvas.dataset.rx = primary.rx.toFixed(5);
      canvas.dataset.ry = primary.ry.toFixed(5);
      canvas.dataset.targetRx = targetRx.toFixed(5);
      canvas.dataset.targetRy = nearestAngle(targetRy, primary.ry).toFixed(5);
      canvas.dataset.dragging = dragging ? "true" : "false";
      canvas.dataset.vx = primary.vx.toFixed(5);
      canvas.dataset.vy = primary.vy.toFixed(5);
      canvas.dataset.settling = primary.settling ? "true" : "false";

      stones.forEach(function (st) {
        var o = (now - st.orbitT) / 1400;
        var amp = (o >= 0 && o <= 1) ? Math.sin(o * 3.14159) : 0;
        var bob = reduce ? 0 : Math.sin(now * 0.0007 + st.phase) * 0.04 * (tray ? 0.6 : 1);
        gl.uniform1f(P3D.u.uOrbit, o);
        gl.uniform1f(P3D.u.uAmp, amp);
        gl.uniform1f(P3D.u.uScale, st.scale);
        /* absorption is divided back by the stone's size so a small stone
           keeps its species' depth of colour instead of washing out — the
           tray is a colour chart, not a carat chart */
        gl.uniform3f(P3D.u.uSigma,
          st.spec.sigma[0] / st.scale, st.spec.sigma[1] / st.scale, st.spec.sigma[2] / st.scale);
        gl.uniform3fv(P3D.u.uEta, st.spec.eta);
        gl.uniform3fv(P3D.u.uBody, st.spec.body);
        gl.uniform3fv(P3D.u.uRim, st.spec.rim);
        gl.uniformMatrix4fv(P3D.u.uModel, false, model(st.rx, st.ry, st.x, st.y + bob));
        gl.drawArrays(gl.TRIANGLES, 0, vertCount);
      });
      gl.disableVertexAttribArray(P3D.a.aN);
      gl.disable(gl.DEPTH_TEST);

      /* pass 2: bright extract at quarter res, then separable blur */
      gl.bindFramebuffer(gl.FRAMEBUFFER, pingA.fb);
      gl.viewport(0, 0, pingA.w, pingA.h);
      drawQuad(PBRIGHT, scene.tex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pingB.fb);
      gl.useProgram(PBLUR.p);
      gl.uniform2f(PBLUR.u.uDir, 1 / pingA.w, 0);
      drawQuad(PBLUR, pingA.tex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pingA.fb);
      gl.useProgram(PBLUR.p);
      gl.uniform2f(PBLUR.u.uDir, 0, 1 / pingA.h);
      drawQuad(PBLUR, pingB.tex);

      /* pass 3: composite with dispersion, out to the canvas */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      drawQuad(PCOMP, scene.tex, pingA.tex);

      if (!reduce) schedule();
    }
    resize();                    /* stones placed before the first pointer can land */
    schedule();

    if (!reduce) {
      setTimeout(function () { primary.orbitT = performance.now(); schedule(); }, 2400);
      var walker = 0;
      setInterval(function () {                             /* an occasional walk on its own */
        var st = stones[walker++ % stones.length];
        if (performance.now() - st.lastTouch > 4000) { st.orbitT = performance.now(); schedule(); }
      }, tray ? 4200 : 9000);
      window.addEventListener("resize", function () { resize(); layout(); schedule(); });
    }

    var controller = {
      setScrollProgress: function (progress) {
        if (!scrollDriven) return;
        var p = Math.max(0, Math.min(1, progress));
        var nextRx = 0.38 + Math.sin(p * Math.PI * 4) * 0.28;
        var nextRy = 0.65 + p * Math.PI * 4;
        var scrollRx = nextRx - targetRx;
        var scrollRy = nextRy - targetRy;
        targetRx = nextRx;
        targetRy = nextRy;
        if (!dragging) {
          if (primary.settling) {
            /* Scroll always owns the base choreography. Carry the temporary
               throw offset along with that base so inertia never suppresses
               the stone's original scroll spin. */
            primary.rx += scrollRx;
            primary.ry += scrollRy;
          } else {
            primary.rx = targetRx;
            primary.ry = targetRy;
            primary.vx = 0;
            primary.vy = 0;
          }
        }
        schedule();
      },
      setActive: function (value) {
        active = Boolean(value);
        if (active) schedule();
      },
      stones: stones,
      canvas: canvas,
    };
    return controller;
  }

  window.FroziGem = { mount: mount };

  /* ---- auto-mount every stone host on the page -----------------------------
     A page can hold more than one (the maison's lone emerald and the tray of
     five), so each is mounted and then parked while it is off screen: a WebGL
     context nobody is looking at should not be spending frames. The
     scroll-driven homepage stone is left alone — js/cinema.js owns its
     activity, keyed to its own pinned section. */
  var hosts = [].slice.call(document.querySelectorAll("[data-gem]"));
  hosts.forEach(function (host) {
    var scope = host.closest("section") || document.body;
    scope.classList.add("has-gem");
    var controller = false;
    try { controller = mount(host); } catch (e) { controller = false; }
    if (!controller) { scope.classList.remove("has-gem"); return; }
    host._froziGemController = controller;
    if (host.hasAttribute("data-scroll-gem") || !("IntersectionObserver" in window)) return;
    controller.setActive(false);
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { controller.setActive(entry.isIntersecting); });
    }, { rootMargin: "10% 0px" }).observe(host);
  });
})();
