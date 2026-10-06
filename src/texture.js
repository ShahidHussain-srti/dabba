/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* texture.js — displacement patterns for the outside surfaces.
 *
 * The surface is refined into
 * small triangles and every vertex is pushed inwards by depth × pattern(u, v),
 * where (u, v) are millimetres across the surface. Patterns return 0 at the
 * surface and 1 at full depth, and are all tileable so a wall reads as one
 * continuous texture. "image" tiles an uploaded picture: dark is deep.
 */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  var TAU = Math.PI * 2;
  function frac(v) { return v - Math.floor(v); }
  function tri(v) { return 1 - Math.abs(2 * frac(v) - 1); }          // 0 on integers, 1 halfway
  function sstep(a, b, x) { var t = CS.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  function hash(ix, iy) {
    var h = (ix * 374761393 + iy * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    var a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  /* Octaves are capped by the caller: the mesh samples about 14 times per
     pattern unit, so anything finer than ~4 cycles per unit only aliases into
     grit. */
  function fbm(x, y, octaves) {
    var n = octaves || 3, v = 0, amp = 0.5, f = 1, norm = 0;
    for (var o = 0; o < n; o++) { v += amp * vnoise(x * f, y * f); norm += amp; f *= 2; amp *= 0.5; }
    return v / norm;
  }
  /* Distances to the nearest and second-nearest jittered cell point. */
  function worley(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y), f1 = 9, f2 = 9;
    for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
      var cx = ix + i, cy = iy + j;
      var px = cx + 0.15 + 0.7 * hash(cx, cy), py = cy + 0.15 + 0.7 * hash(cy * 7 + 3, cx * 13 + 1);
      var d = Math.hypot(x - px, y - py);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return [f1, f2];
  }
  /* Offset to the centre of the nearest cell of a unit hexagonal grid. */
  function hexCell(x, y) {
    var rx = 1, ry = 1.7320508, hx = 0.5, hy = 0.8660254;
    var ax = ((x % rx) + rx) % rx - hx, ay = ((y % ry) + ry) % ry - hy;
    var bx = (((x - hx) % rx) + rx) % rx - hx, by = (((y - hy) % ry) + ry) % ry - hy;
    return ax * ax + ay * ay < bx * bx + by * by ? [ax, ay] : [bx, by];
  }

  var P = {
    knurl: function (x, y) { return Math.max(1 - tri(x + y), 1 - tri(x - y)); },
    ribs: function (x) { return 0.5 + 0.5 * Math.cos(TAU * x); },
    hex: function (x, y) {
      var g = hexCell(x, y);
      var d = Math.max(Math.abs(g[0]) * 0.5 + Math.abs(g[1]) * 0.8660254, Math.abs(g[0]));
      return sstep(0.33, 0.47, d);
    },
    dimples: function (x, y) {
      var g = hexCell(x, y), r = Math.hypot(g[0], g[1]) / 0.38;
      return r < 1 ? Math.sqrt(1 - r * r) : 0;
    },
    waves: function (x, y) { return 0.5 + 0.5 * Math.sin(TAU * (x + 0.35 * Math.sin(TAU * y * 0.5))); },
    bricks: function (x, y) {
      var yy = y * 2, row = Math.floor(yy), ox = x + (row & 1 ? 0.5 : 0);
      var dy = Math.min(frac(yy), 1 - frac(yy)) * 0.5, dx = Math.min(frac(ox), 1 - frac(ox));
      return 1 - sstep(0.04, 0.11, Math.min(dx, dy));
    },
    voronoi: function (x, y) {
      var w = worley(x, y);
      return Math.max(1 - sstep(0, 0.17, w[1] - w[0]), 0.3 * w[0]);
    },
    leather: function (x, y) {
      var w = worley(x * 1.6, y * 1.6);
      return 0.65 * (1 - sstep(0, 0.16, w[1] - w[0])) + 0.35 * fbm(x * 1.5, y * 1.5, 2);
    },
    noise: function (x, y) { return fbm(x * 1.2, y * 1.2, 2); },
    /* Over-and-under threads, one each way per repeat, with gaps between.
       At each crossing the thread on top alternates (cos π(x+y) flips sign
       from one crossing to the next), and both profiles are smooth. */
    weave: function (x, y) {
      var warp = Math.pow(Math.cos(Math.PI * x), 2), weft = Math.pow(Math.cos(Math.PI * y), 2);
      var s = Math.cos(Math.PI * (Math.round(x) + Math.round(y))) * Math.cos(Math.PI * (x - Math.round(x))) *
              Math.cos(Math.PI * (y - Math.round(y)));
      return 1 - Math.max(warp * (0.72 + 0.28 * s), weft * (0.72 - 0.28 * s));
    },
    /* ── more patterns ── */
    pyramids: function (x, y) { return 2 * Math.max(Math.abs(frac(x) - 0.5), Math.abs(frac(y) - 0.5)); },
    waffle: function (x, y) {
      var g = Math.min(Math.min(frac(x), 1 - frac(x)), Math.min(frac(y), 1 - frac(y)));
      return 1 - sstep(0.05, 0.15, g);
    },
    tiles: function (x, y) {
      var g = Math.min(Math.min(frac(x), 1 - frac(x)), Math.min(frac(y), 1 - frac(y)));
      return 1 - sstep(0.03, 0.2, g);
    },
    diamondplate: function (x, y) {
      // tread plate: staggered lozenges, alternately turned ±45°, on a flat plate
      var row = Math.floor(y * 2), ox = x + (row & 1 ? 0.5 : 0), col = Math.floor(ox);
      var u = frac(ox) - 0.5, v = (frac(y * 2) - 0.5) * 0.5, lean = (row + col) & 1 ? 1 : -1;
      var a = (u + lean * v) * 0.7071, b = (v - lean * u) * 0.7071;
      var d = Math.hypot(a / 0.36, b / 0.17);
      return sstep(0.55, 1.15, d);
    },
    scales: function (x, y) {
      // overlapping fish scales: the scale from the row below sits on top
      var best = 1;
      for (var r = Math.floor(y * 2) - 1; r <= Math.floor(y * 2) + 1; r++) {
        var cx = Math.round(x - (r & 1 ? 0.5 : 0)) + (r & 1 ? 0.5 : 0), cy = r / 2;
        var d = Math.hypot(x - cx, (y - cy) * 1.25) / 0.62;
        if (d < 1 && y >= cy - 0.05) best = Math.min(best, 0.15 + 0.55 * d * d + 0.3 * sstep(0.86, 1, d));
      }
      return best;
    },
    chevron: function (x, y) { return 0.5 + 0.5 * Math.cos(TAU * (y + Math.abs(frac(x) - 0.5))); },
    triangles: function (x, y) {
      var a = y * 1.1547, b = x + y * 0.5774, c = x - y * 0.5774;
      var g = Math.min(Math.min(frac(a), 1 - frac(a)), Math.min(frac(b), 1 - frac(b)), Math.min(frac(c), 1 - frac(c)));
      return 1 - sstep(0.05, 0.18, g);
    },
    rings: function (x, y) {
      var g = hexCell(x, y), r = Math.hypot(g[0], g[1]);
      return r > 0.5 ? 0 : (0.5 + 0.5 * Math.cos(TAU * r * 3)) * (1 - sstep(0.4, 0.5, r));
    },
    checker: function (x, y) {
      var a = CS.clamp(Math.sin(Math.PI * x) * 3, -1, 1), b = CS.clamp(Math.sin(Math.PI * y) * 3, -1, 1);
      return 0.5 - 0.5 * a * b;
    },
    wood: function (x, y) {
      var t = y + 0.45 * fbm(x * 0.35, y * 0.9, 2) + 0.15 * Math.sin(x * 0.7);
      return 0.5 + 0.5 * Math.cos(TAU * t * 2.5);
    },
    crosshatch: function (x, y) {
      var a = 0.5 + 0.5 * Math.cos(TAU * (x + y) * 1.5), b = 0.5 + 0.5 * Math.cos(TAU * (x - y) * 1.5);
      return Math.pow(Math.max(a, b), 1.5);
    },
    topo: function (x, y) {
      var n = fbm(x * 0.3, y * 0.3, 2) * 6, g = Math.min(frac(n), 1 - frac(n));
      return 1 - sstep(0.05, 0.22, g);
    },
    studs: function (x, y) {
      var g = hexCell(x, y), r = Math.hypot(g[0], g[1]) / 0.34;
      return r < 1 ? 1 - Math.sqrt(1 - r * r) : 1;
    },
    mesh: function (x, y) {
      var r = Math.hypot(frac(x) - 0.5, frac(y) - 0.5) / 0.34;
      return r < 1 ? Math.sqrt(1 - r * r) : 0;
    },
    bubbles: function (x, y) {
      var w = worley(x * 1.3, y * 1.3), r = w[0] / 0.42;
      return r < 1 ? Math.sqrt(1 - r * r) : 0;
    },
    crystal: function (x, y) {
      var w = worley(x, y);
      return CS.clamp(w[0] * 1.6, 0, 1);
    },
    /* 2:1 planks, alternately lying and standing, on the lattice spanned by
       (1, 1) and (2, -2) in plank units: lying plank [0,2]×[0,1], standing
       plank [0,1]×[1,3]. Grooves along every plank edge. */
    herringbone: function (x, y) {
      var px = x * 3, py = y * 3, i0 = Math.floor((px + py) / 2), j0 = Math.floor((px - py) / 4), seam = 1;
      for (var i = i0 - 2; i <= i0 + 2; i++) for (var j = j0 - 2; j <= j0 + 2; j++) {
        var ox = i + 2 * j, oy = i - 2 * j, lx = px - ox, ly = py - oy;
        if (lx >= 0 && lx <= 2 && ly >= 0 && ly <= 1) seam = Math.min(seam, lx, 2 - lx, ly, 1 - ly);
        if (lx >= 0 && lx <= 1 && ly >= 1 && ly <= 3) seam = Math.min(seam, lx, 1 - lx, ly - 1, 3 - ly);
      }
      return 1 - sstep(0.04, 0.14, seam);
    },
    image: function (x, y) {
      var T = CS.texTile();
      if (!T) return 0;
      var u = frac(x) * T.w, v = (1 - frac(y)) * T.h;
      var x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
      var at = function (i, j) { return T.d[((j + T.h) % T.h) * T.w + ((i + T.w) % T.w)]; };
      var a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return 1 - (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy);
    }
  };

  /* Grey levels of the uploaded tile, cached per bitmap. */
  var tileCache = { src: null, tile: null };
  CS.texTile = function () {
    var src = CS.assets && CS.assets.texture;
    if (!src) return null;
    if (tileCache.src === src) return tileCache.tile;
    var k = Math.min(1, 256 / Math.max(src.width, src.height));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    var px = ctx.getImageData(0, 0, c.width, c.height).data, d = new Float32Array(c.width * c.height);
    for (var i = 0; i < d.length; i++) d[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
    tileCache = { src: src, tile: { w: c.width, h: c.height, d: d } };
    return tileCache.tile;
  };

  CS.texReady = function (name) { return name !== 'image' || !!(CS.assets && CS.assets.texture); };

  /* A sampler in millimetres: pattern size `scale`, turned by `angle` degrees.
     `period` (optional) bends the u scale so a whole number of repeats wraps
     around the case, leaving no seam where the perimeter closes. */
  CS.texSampler = function (name, scale, angle, period) {
    var f = P[name];
    if (!f) return null;
    var s = Math.max(0.5, scale), a = (angle || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    var su = s;
    if (period && Math.abs(angle || 0) < 0.01) su = period / Math.max(1, Math.round(period / s));
    return function (u, v) {
      if (a === 0) return CS.clamp(f(u / su, v / s), 0, 1);
      return CS.clamp(f((u * c - v * sn) / s, (u * sn + v * c) / s), 0, 1);
    };
  };

})(window.CS);
