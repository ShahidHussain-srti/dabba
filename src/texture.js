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
  function sstep(a, b, x) { var t = WB.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  function hash(ix, iy) {
    var h = (ix * 374761393 + iy * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  /* Noise can be made to repeat every `pc` lattice cells along x (0 = never),
     so a pattern that wraps round the case meets its own start seamlessly. */
  function wrapI(i, pc) { return pc > 0 ? ((i % pc) + pc) % pc : i; }
  function vnoise(x, y, pc) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    var i0 = wrapI(ix, pc), i1 = wrapI(ix + 1, pc);
    var a = hash(i0, iy), b = hash(i1, iy), c = hash(i0, iy + 1), d = hash(i1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  /* Octaves are capped by the caller: the mesh samples about 14 times per
     pattern unit, so anything finer than ~4 cycles per unit only aliases into
     grit. Doubling the frequency doubles the wrap, so every octave repeats too. */
  function fbm(x, y, octaves, pc) {
    var n = octaves || 3, v = 0, amp = 0.5, f = 1, norm = 0;
    for (var o = 0; o < n; o++) { v += amp * vnoise(x * f, y * f, (pc || 0) * f); norm += amp; f *= 2; amp *= 0.5; }
    return v / norm;
  }
  /* Distances to the nearest and second-nearest jittered cell point. */
  function worley(x, y, pc) {
    var ix = Math.floor(x), iy = Math.floor(y), f1 = 9, f2 = 9;
    for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
      var cx = ix + i, cy = iy + j, hx = wrapI(cx, pc || 0);
      var px = cx + 0.15 + 0.7 * hash(hx, cy), py = cy + 0.15 + 0.7 * hash(cy * 7 + 3, hx * 13 + 1);
      var d = Math.hypot(x - px, y - py);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return [f1, f2];
  }
  /* Distance, in pattern units, to the nearest knot: sparse, on a coarse
     jittered lattice that repeats round the wrap like the rest. */
  function woodKnot(x, y, W) {
    var q = wf(0.07, W), fy = 0.08, X = x * q[0], Y = y * fy, ix = Math.floor(X), iy = Math.floor(Y), best = 9;
    for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
      var cx = ix + i, cy = iy + j, hx = wrapI(cx, q[1]);
      if (hash(hx * 3 + 11, cy * 5 + 7) > 0.3) continue;             // most cells have no knot
      var px = cx + 0.2 + 0.6 * hash(hx, cy + 91), py = cy + 0.2 + 0.6 * hash(cy + 17, hx + 29);
      var d = Math.hypot((X - px) / q[0], (Y - py) / fy * 1.6);       // a little long along the grain
      if (d < best) best = d;
    }
    return best;
  }

  /* A noise frequency along x that fits a whole number of cells into a wrap of
     W units: returns [x frequency, cells per wrap]. Without a wrap, as asked. */
  function wf(freq, W) {
    if (!(W > 0)) return [freq, 0];
    var cells = Math.max(1, Math.round(W * freq));
    return [cells / W, cells];
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
    voronoi: function (x, y, W) {
      var q = wf(1, W), w = worley(x * q[0], y, q[1]);
      return Math.max(1 - sstep(0, 0.17, w[1] - w[0]), 0.3 * w[0]);
    },
    leather: function (x, y, W) {
      var q = wf(1.6, W), r = wf(1.5, W), w = worley(x * q[0], y * 1.6, q[1]);
      return 0.65 * (1 - sstep(0, 0.16, w[1] - w[0])) + 0.35 * fbm(x * r[0], y * 1.5, 2, r[1]);
    },
    noise: function (x, y, W) { var q = wf(1.2, W); return fbm(x * q[0], y * 1.2, 2, q[1]); },
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
      var a = WB.clamp(Math.sin(Math.PI * x) * 3, -1, 1), b = WB.clamp(Math.sin(Math.PI * y) * 3, -1, 1);
      return 0.5 - 0.5 * a * b;
    },
    /* A flat-sawn board. Growth rings are cylinders round the log's axis
       (along x), cut by a plane that drifts nearer and further from it, which
       draws the cathedral arches; the log's centre wanders, and repeats down
       the board (mirrored, so the rings run on unbroken). Rings vary in width
       year to year; each runs from soft early wood up to a sharp, proud ridge
       of late wood, as on brushed or weathered timber, with fine fibres along
       the grain and now and then a knot the rings swirl round. */
    wood: function (x, y, W) {
      var a = wf(0.07, W), c = wf(0.05, W), e = wf(0.08, W), b = wf(0.3, W), fq = wf(0.6, W), P = 9;
      var h = 1.8 + 5 * Math.abs(fbm(x * a[0], y * 0.04 + 0.37, 2, a[1]) - 0.5);   // the cut's distance from the axis
      var dy = P * (frac((y - 2.2 * (fbm(x * c[0], 5.1, 2, c[1]) - 0.5)) / P) - 0.5);
      // The log tapers, so rings grow along it and the cut slips out of them
      // in nested arches; the taper swells and eases along the board.
      var taper = 3.6 * (fbm(x * e[0], 8.3, 2, e[1]) - 0.5);
      var r = Math.sqrt(dy * dy + h * h) + taper + 0.25 * fbm(x * b[0], y * 0.7, 2, b[1]);
      var kn = woodKnot(x, y, W);
      r += 2 * Math.exp(-(kn / 1.7) * (kn / 1.7));                    // rings bend round a knot
      var t = r * 1.9 + 1.1 * vnoise(r * 0.55, 3.3, 0);                // wider and narrower years
      var ring = function (p) { return sstep(0.45, 0.8, p) * (1 - sstep(0.9, 1, p)); };
      var fibre = fbm(x * fq[0], y * 3.4, 2, fq[1]);
      var hgt = 0.12 + 0.68 * ring(frac(t)) + 0.2 * fibre;
      if (kn < 1) {                                                    // the knot: tight rings of its own
        var core = 1 - sstep(0.7, 1, kn);
        hgt = hgt * (1 - core) + (0.25 + 0.7 * ring(frac(kn * 2.4 + 0.3))) * core;
      }
      return 1 - WB.clamp(hgt, 0, 1);
    },
    crosshatch: function (x, y) {
      var a = 0.5 + 0.5 * Math.cos(TAU * (x + y) * 1.5), b = 0.5 + 0.5 * Math.cos(TAU * (x - y) * 1.5);
      return Math.pow(Math.max(a, b), 1.5);
    },
    topo: function (x, y, W) {
      var q = wf(0.3, W), n = fbm(x * q[0], y * 0.3, 2, q[1]) * 6, g = Math.min(frac(n), 1 - frac(n));
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
    bubbles: function (x, y, W) {
      var q = wf(1.3, W), w = worley(x * q[0], y * 1.3, q[1]), r = w[0] / 0.42;
      return r < 1 ? Math.sqrt(1 - r * r) : 0;
    },
    crystal: function (x, y, W) {
      var q = wf(1, W), w = worley(x * q[0], y, q[1]);
      return WB.clamp(w[0] * 1.6, 0, 1);
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

  /* How far each pattern runs along x before repeating, in pattern units.
     'wrap' marks the noise patterns, which repeat only when told a wrap. */
  var PERIOD = {
    knurl: 1, pyramids: 1, crosshatch: 2 / 3, ribs: 1, chevron: 1, waves: 1, hex: 1, triangles: 1,
    waffle: 1, tiles: 1, checker: 2, bricks: 1, herringbone: 4 / 3, weave: 2, diamondplate: 2,
    scales: 1, dimples: 1, studs: 1, mesh: 1, rings: 1, image: 1,
    bubbles: 'wrap', voronoi: 'wrap', crystal: 'wrap', leather: 'wrap', wood: 'wrap', topo: 'wrap', noise: 'wrap'
  };
  CS.texPeriod = function (name) { return PERIOD[name]; };

  /* A sampler in millimetres: pattern size `scale`, turned by `angle` degrees.

     Round a wall (`period` = the perimeter, `seamAt` = where the pattern should
     start), the pattern has to meet itself again. Unrotated, the u scale bends
     slightly so a whole number of repeats fits — for noise, the noise itself is
     told to repeat — and the join is invisible. A rotated pattern can't wrap
     exactly, so it cross-fades with its own start over one repeat before the
     join. */
  CS.texSampler = function (name, scale, angle, period, seamAt) {
    var f = P[name];
    if (!f) return null;
    var s = Math.max(0.5, scale), a = (angle || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    var rotated = Math.abs(angle || 0) >= 0.01;
    if (!period) {
      return function (u, v) {
        return WB.clamp(rotated ? f((u * c - v * sn) / s, (u * sn + v * c) / s, 0) : f(u / s, v / s, 0), 0, 1);
      };
    }
    var off = seamAt || 0, per = PERIOD[name], su = s, W = 0;
    if (!rotated) {
      if (per === 'wrap') {
        var n = Math.max(1, Math.round(period / s));
        su = period / n; W = n;
      } else {
        var reps = Math.max(1, Math.round(period / (s * per)));
        su = period / (reps * per);
      }
    }
    var band = Math.min(s, period * 0.25);
    var at = function (u, v) {
      return rotated ? f((u * c - v * sn) / s, (u * sn + v * c) / s, 0) : f(u / su, v / s, W);
    };
    return function (u, v) {
      var uu = ((u - off) % period + period) % period;
      var val = at(uu, v);
      if (rotated && uu > period - band) {
        var t = (uu - (period - band)) / band;
        t = t * t * (3 - 2 * t);
        val = val * (1 - t) + at(uu - period, v) * t;
      }
      return WB.clamp(val, 0, 1);
    };
  };

})(window.CS);
