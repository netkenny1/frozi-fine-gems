/* FROZI FINE GEMS — the loose stone.
   A real-time faceted emerald: procedural step-cut mesh, fresnel +
   refraction shading, and a two-pass bloom with chromatic dispersion.
   Zero dependencies, WebGL1. Mounts into the first [data-gem] element;
   the host section gets .has-gem while the stone is live, so static
   fallbacks can hide themselves. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- shaders ---- */
  var GEM_VS = [
    "attribute vec3 aP; attribute vec3 aN;",
    "uniform mat4 uProj, uView, uModel;",
    "varying vec3 vN; varying vec3 vP;",
    "void main(){",
    "  vec4 w = uModel * vec4(aP, 1.0);",
    "  vP = w.xyz; vN = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aN;",
    "  gl_Position = uProj * uView * w;",
    "}"
  ].join("\n");

  var GEM_FS = [
    "precision highp float;",
    "varying vec3 vN; varying vec3 vP;",
    "uniform vec3 uEye; uniform vec3 uKey; uniform float uOrbit; uniform float uAmp;",
    "const vec3 IVORY = vec3(0.945, 0.937, 0.91);",
    "const vec3 JADE  = vec3(0.29, 0.57, 0.455);",
    "vec3 env(vec3 d){",                                    /* procedural studio */
    "  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);",
    "  vec3 base = mix(vec3(0.006, 0.009, 0.008), vec3(0.03, 0.07, 0.055), up * up);",
    "  float box = smoothstep(0.32, 0.03, abs(d.y - 0.42)) * smoothstep(-0.4, 0.6, d.x);",
    "  float glow = smoothstep(0.2, 1.0, -d.y);",
    "  return base + IVORY * box * 0.7 + vec3(0.05, 0.16, 0.11) * glow * 0.3;",
    "}",
    "void main(){",
    "  vec3 N = normalize(vN);",
    "  vec3 V = normalize(uEye - vP);",
    "  if (dot(N, V) < 0.0) N = -N;",
    "  vec3 R = reflect(-V, N);",
    "  vec3 T = refract(-V, N, 0.66);",
    "  if (dot(T, T) < 0.001) T = R;",
    "  float fres = 0.05 + 0.95 * pow(1.0 - max(dot(N, V), 0.0), 3.0);",
    "  vec3 deep = mix(vec3(0.008, 0.075, 0.045), vec3(0.035, 0.34, 0.20), clamp(T.y * 0.6 + 0.55, 0.0, 1.0));",
    "  vec3 body = deep * (0.35 + 2.2 * env(T).g);",        /* light seen through the stone */
    "  float fid = fract(sin(dot(N, vec3(12.9898, 78.233, 37.719))) * 43758.5453);",
    "  body *= 0.7 + 0.6 * fid;",                           /* per-facet fire */
    "  vec3 col = mix(body, env(R) * 1.5, fres);",
    "  vec3 H1 = normalize(uKey + V);",                     /* ivory key light */
    "  float s1 = pow(max(dot(N, H1), 0.0), 140.0);",
    "  vec3 H2 = normalize(normalize(vec3(-0.65, -0.15, -0.5)) + V);",
    "  float s2 = pow(max(dot(N, H2), 0.0), 36.0);",        /* jade rim */
    "  float a = uOrbit * 6.28318;",
    "  vec3 H3 = normalize(normalize(vec3(cos(a), 0.35, sin(a))) + V);",
    "  float s3 = pow(max(dot(N, H3), 0.0), 90.0) * uAmp;", /* the walking light */
    "  col += IVORY * (s1 * 1.1 + smoothstep(0.6, 1.0, s1) * 0.6);",
    "  col += JADE * s2 * 0.5 + IVORY * s3 * 2.6;",
    "  col = col / (col + vec3(1.0));",                     /* soft tonemap */
    "  gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);",
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
    "  gl_FragColor = vec4(max(c.rgb - 0.55, 0.0) * 1.9 * c.a, 1.0);",
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
    "  b.r = texture2D(uBloom, 0.5 + d * 1.014).r;",
    "  b.g = texture2D(uBloom, vUV).g;",
    "  b.b = texture2D(uBloom, 0.5 + d * 0.986).b;",
    "  vec3 col = s.rgb + b * 1.35;",
    "  float a = clamp(s.a + dot(b, vec3(0.299, 0.587, 0.114)) * 1.7, 0.0, 1.0);",
    "  gl_FragColor = vec4(col, a);",
    "}"
  ].join("\n");

  function mount(host) {
    var canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;" +
      "cursor:grab;touch-action:none";
    host.appendChild(canvas);
    var gl = canvas.getContext("webgl", { antialias: false, alpha: true }) ||
             canvas.getContext("experimental-webgl", { antialias: false, alpha: true });
    if (!gl) { host.removeChild(canvas); return false; }

    /* ---- geometry: elongated octagonal step cut, flat-shaded ---- */
    function ring(s, y) {
      var W = 1.02 * s, D = 0.72 * s, C = 0.36 * s;
      return [
        [ W, y,  D - C], [ W, y, -(D - C)], [ W - C, y, -D], [-(W - C), y, -D],
        [-W, y, -(D - C)], [-W, y,  D - C], [-(W - C), y,  D], [ W - C, y,  D]
      ];
    }
    var rings = [
      ring(0.60,  0.42), ring(0.85,  0.28), ring(1.00,  0.00),
      ring(0.97, -0.08), ring(0.60, -0.52), ring(0.30, -0.82), ring(0.10, -0.98)
    ];
    var pos = [], nrm = [];
    function tri(a, b, c) {
      var ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
      var vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
      var nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
      var cx = (a[0]+b[0]+c[0])/3, cy = (a[1]+b[1]+c[1])/3 + 0.15, cz = (a[2]+b[2]+c[2])/3;
      if (nx*cx + ny*cy + nz*cz < 0) { var t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
      var l = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
      [a, b, c].forEach(function (p) { pos.push(p[0], p[1], p[2]); nrm.push(nx/l, ny/l, nz/l); });
    }
    var i, j;
    for (i = 0; i < rings.length - 1; i++) {
      for (j = 0; j < 8; j++) {
        var k = (j + 1) % 8;
        tri(rings[i][j], rings[i][k], rings[i+1][k]);
        tri(rings[i][j], rings[i+1][k], rings[i+1][j]);
      }
    }
    for (j = 1; j < 7; j++) tri(rings[0][0], rings[0][j], rings[0][j+1]);
    var last = rings.length - 1;
    for (j = 1; j < 7; j++) tri(rings[last][0], rings[last][j+1], rings[last][j]);
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
      ["uProj", "uView", "uModel", "uEye", "uKey", "uOrbit", "uAmp"]);
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
    function model(rx, ry, ty) {
      var cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      return [cy,sx*sy,-cx*sy,0, 0,cx,sx,0, sy,-sx*cy,cx*cy,0, 0,ty,0,1];
    }

    /* ---- interaction: drag with inertia, idle drift, the walking light ---- */
    var rx = -0.16, ry = 0.65, vx = 0, vy = 0;
    var dragging = false, lastX = 0, lastY = 0, lastTouch = 0;
    var keyX = 0.55, keyY = 0.75;
    var orbitT = -1e9;

    if (!reduce) {
      canvas.addEventListener("pointerdown", function (e) {
        dragging = true; lastX = e.clientX; lastY = e.clientY; lastTouch = performance.now();
        canvas.style.cursor = "grabbing"; canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener("pointermove", function (e) {
        if (dragging) {
          vy = (e.clientX - lastX) * 0.008;
          vx = (e.clientY - lastY) * 0.006;
          ry += vy; rx += vx;
          lastX = e.clientX; lastY = e.clientY; lastTouch = performance.now();
        }
        var r = canvas.getBoundingClientRect();
        keyX = 0.25 + ((e.clientX - r.left) / r.width) * 0.7;
        keyY = 1.0 - ((e.clientY - r.top) / r.height) * 0.6;
      }, { passive: true });
      var release = function () { dragging = false; canvas.style.cursor = "grab"; };
      canvas.addEventListener("pointerup", release);
      canvas.addEventListener("pointercancel", release);
      canvas.addEventListener("click", function () { orbitT = performance.now(); });
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(canvas.clientWidth * dpr | 0, 2);
      var h = Math.max(canvas.clientHeight * dpr | 0, 2);
      if (canvas.width === w && canvas.height === h && scene) return;
      canvas.width = w; canvas.height = h;
      var ss = dpr < 1.5 ? 2 : 1;                           /* supersample on 1x displays */
      drop(scene); drop(pingA); drop(pingB);
      scene = makeTarget(w * ss, h * ss, true);
      pingA = makeTarget(Math.max(w >> 2, 1), Math.max(h >> 2, 1), false);
      pingB = makeTarget(Math.max(w >> 2, 1), Math.max(h >> 2, 1), false);
      gl.useProgram(P3D.p);
      gl.uniformMatrix4fv(P3D.u.uProj, false, persp(0.55, w / h, 0.1, 20));
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

    function frame(now) {
      resize();
      if (!dragging && !reduce) {
        rx += vx; ry += vy; vx *= 0.94; vy *= 0.94;         /* inertia */
        if (now - lastTouch > 2500) ry += 0.0032;           /* idle drift */
        rx += (-0.16 - rx) * 0.005;
      }
      rx = Math.max(-0.9, Math.min(0.9, rx));
      var o = (now - orbitT) / 1400;
      var amp = (o >= 0 && o <= 1) ? Math.sin(o * 3.14159) : 0;

      /* pass 1: the stone, into the supersampled scene target */
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb);
      gl.viewport(0, 0, scene.w, scene.h);
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(P3D.p);
      gl.uniform1f(P3D.u.uOrbit, o);
      gl.uniform1f(P3D.u.uAmp, amp);
      gl.uniform3f(P3D.u.uKey, keyX, keyY, 0.5);
      var bob = reduce ? 0 : Math.sin(now * 0.0007) * 0.04;
      gl.uniformMatrix4fv(P3D.u.uModel, false, model(rx, ry, bob));
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(P3D.a.aP);
      gl.vertexAttribPointer(P3D.a.aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
      gl.enableVertexAttribArray(P3D.a.aN);
      gl.vertexAttribPointer(P3D.a.aN, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, vertCount);
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

      if (!reduce) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    if (!reduce) {
      setTimeout(function () { orbitT = performance.now(); }, 2400);
      setInterval(function () {                             /* an occasional walk on its own */
        if (performance.now() - lastTouch > 4000) orbitT = performance.now();
      }, 9000);
      window.addEventListener("resize", resize);
    }
    return true;
  }

  window.FroziGem = { mount: mount };

  /* auto-mount */
  var host = document.querySelector("[data-gem]");
  if (host) {
    var scope = host.closest("section") || document.body;
    scope.classList.add("has-gem");
    var ok = false;
    try { ok = mount(host); } catch (e) {}
    if (!ok) scope.classList.remove("has-gem");
  }
})();
