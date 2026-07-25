/* FROZI FINE GEMS — the cuts.
   -------------------------------------------------------------------------
   One stone per species, each in its own cut: the emerald in a step cut, the
   sapphire oval, the ruby pear, the diamond round brilliant, the tourmaline
   cushion, the kunzite marquise.

   Every cut is built the same way — a convex girdle outline, swept through a
   profile of concentric rings — because js/gem.js traces refracted rays to
   their true exit facet using the solid's plane set, and that trace is only
   valid on a CONVEX body. Two things guarantee convexity here: the outline is
   replaced by its own 2D convex hull, and the profile's rings only ever taper
   away from the girdle. Frustum side faces are planar, so each band of the
   sweep contributes exactly one plane per outline edge, which is what keeps
   every cut inside the shader's 90-plane budget.

   Output matches js/gem-model.js: { positions, indices, planes, planeCount }
   in a unit-radius space, so the cuts are interchangeable with the baked
   round brilliant. */
(function () {
  "use strict";

  var PLANE_BUDGET = 90;

  /* ---- outlines (x, z) ---------------------------------------------------- */

  function ellipse(n, a, b) {
    var p = [], i;
    for (i = 0; i < n; i++) {
      var t = (i / n) * Math.PI * 2;
      p.push([a * Math.cos(t), b * Math.sin(t)]);
    }
    return p;
  }

  /* a rectangle with its corners cut off: the emerald cut's silhouette */
  function octagon(a, b, cut) {
    return [
      [a, b - cut], [a - cut, b], [-(a - cut), b], [-a, b - cut],
      [-a, -(b - cut)], [-(a - cut), -b], [a - cut, -b], [a, -(b - cut)]
    ];
  }

  /* teardrop: an ellipse whose width falls away toward one end */
  function pear(n, a, b) {
    var p = [], i;
    for (i = 0; i < n; i++) {
      var t = (i / n) * Math.PI * 2;
      var taper = 0.30 + 0.70 * ((1 + Math.cos(t)) / 2);
      p.push([a * Math.cos(t), b * Math.sin(t) * taper]);
    }
    return p;
  }

  /* lens: pointed at both ends */
  function marquise(n, a, b) {
    var p = [], i;
    for (i = 0; i < n; i++) {
      var t = (i / n) * Math.PI * 2;
      var s = Math.sin(t);
      p.push([a * Math.cos(t), b * s * Math.pow(Math.abs(s), 0.45)]);
    }
    return p;
  }

  /* superellipse: the cushion's soft-cornered square */
  function cushion(n, a, b, power) {
    var p = [], i;
    for (i = 0; i < n; i++) {
      var t = (i / n) * Math.PI * 2;
      var c = Math.cos(t), s = Math.sin(t);
      var k = Math.pow(Math.pow(Math.abs(c), power) + Math.pow(Math.abs(s), power), -1 / power);
      p.push([a * c * k, b * s * k]);
    }
    return p;
  }

  /* 2D convex hull (monotone chain), so a taper can never make a dent */
  function hull(points) {
    var pts = points.slice().sort(function (u, v) { return u[0] - v[0] || u[1] - v[1]; });
    if (pts.length < 3) return pts;
    var cross = function (o, a, b) {
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    };
    var lower = [], upper = [], i;
    for (i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    for (i = pts.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
      upper.push(pts[i]);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);          /* counter-clockwise */
  }

  /* ---- the sweep ---------------------------------------------------------- */

  /* profile rings run top (table) to bottom (culet or keel); s is the scale
     of the outline at that height, so s = 1 is the girdle. */
  var STEP_PROFILE = [
    { y: 0.30, s: 0.60 },   /* table */
    { y: 0.17, s: 0.80 },   /* crown step */
    { y: 0.035, s: 1.0 },   /* girdle, upper edge */
    { y: -0.035, s: 1.0 },  /* girdle, lower edge */
    { y: -0.27, s: 0.72 },  /* pavilion step */
    { y: -0.46, s: 0.40 },  /* pavilion step */
    { y: -0.58, s: 0.10 }   /* keel */
  ];

  var BRILLIANT_PROFILE = [
    { y: 0.26, s: 0.57 },   /* table */
    { y: 0.15, s: 0.82 },   /* star facets */
    { y: 0.03, s: 1.0 },    /* girdle, upper edge */
    { y: -0.03, s: 1.0 },   /* girdle, lower edge */
    { y: -0.36, s: 0.54 },  /* pavilion main */
    { y: -0.62, s: 0.05 }   /* culet */
  ];

  function build(outline, profile) {
    var ring = hull(outline);
    var n = ring.length;
    var pos = [], idx = [];

    /* every ring gets its own vertices, so each facet keeps a hard edge */
    var rings = profile.map(function (p) {
      var start = pos.length / 3, i;
      for (i = 0; i < n; i++) {
        pos.push(ring[i][0] * p.s, p.y, ring[i][1] * p.s);
      }
      return start;
    });

    /* table: a fan across the top ring */
    var t = rings[0], i2;
    for (i2 = 1; i2 < n - 1; i2++) idx.push(t, t + i2, t + i2 + 1);

    /* bands between consecutive rings */
    for (var r = 0; r < rings.length - 1; r++) {
      var A = rings[r], B = rings[r + 1];
      for (var k = 0; k < n; k++) {
        var k2 = (k + 1) % n;
        idx.push(A + k, B + k, B + k2);
        idx.push(A + k, B + k2, A + k2);
      }
    }

    /* close the bottom ring */
    var last = rings[rings.length - 1];
    for (var j = 1; j < n - 1; j++) idx.push(last, last + j + 1, last + j);

    return normalize(pos, idx);
  }

  /* scale to the same unit space as the baked round brilliant, then derive
     the plane set from the faces themselves */
  function normalize(pos, idx) {
    /* normalise on the longest half-extent, not the corner radius, so an
       elongated cut still reads the same size as a round one */
    var maxR = 0, i;
    for (i = 0; i < pos.length; i += 3) {
      maxR = Math.max(maxR, Math.abs(pos[i]), Math.abs(pos[i + 2]));
    }
    var k = maxR ? 0.99 / maxR : 1;
    for (i = 0; i < pos.length; i++) pos[i] *= k;

    var planes = [], seen = [];
    for (i = 0; i < idx.length; i += 3) {
      var a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      var ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      var vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var len = Math.hypot(nx, ny, nz);
      if (len < 1e-9) continue;                       /* degenerate sliver */
      nx /= len; ny /= len; nz /= len;
      var d = nx * pos[a] + ny * pos[a + 1] + nz * pos[a + 2];
      if (d < 0) { nx = -nx; ny = -ny; nz = -nz; d = -d; }   /* outward */
      var dup = false;
      for (var s = 0; s < seen.length; s++) {
        var q = seen[s];
        if (Math.abs(q[0] - nx) < 2e-3 && Math.abs(q[1] - ny) < 2e-3 &&
            Math.abs(q[2] - nz) < 2e-3 && Math.abs(q[3] - d) < 2e-3) { dup = true; break; }
      }
      if (dup) continue;
      seen.push([nx, ny, nz, d]);
      planes.push(nx, ny, nz, d);
    }

    var count = planes.length / 4;
    /* pad to the shader's fixed loop with planes nothing can ever hit */
    while (planes.length / 4 < PLANE_BUDGET) planes.push(0, 1, 0, 1000);

    return {
      positions: new Float32Array(pos),
      indices: new Uint16Array(idx),
      planes: new Float32Array(planes),
      planeCount: count,
      overBudget: count > PLANE_BUDGET
    };
  }

  window.FROZI_CUTS = {
    emerald: build(octagon(1.0, 1.34, 0.30), STEP_PROFILE),
    oval: build(ellipse(14, 1.0, 0.72), BRILLIANT_PROFILE),
    pear: build(pear(14, 1.0, 0.78), BRILLIANT_PROFILE),
    marquise: build(marquise(14, 1.0, 0.58), BRILLIANT_PROFILE),
    cushion: build(cushion(14, 1.0, 0.88, 3.2), BRILLIANT_PROFILE)
  };
})();
