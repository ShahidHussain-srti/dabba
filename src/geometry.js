/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* geometry.js — the case as solids: base, lid, hinge, clasps, decoration.
 *
 * Built with Manifold, whose booleans always return watertight, oriented
 * meshes. Every convex piece (the rounded shells, tapered pockets, knuckles) is
 * a hull of stacked outlines; concave profiles, like the round-over at a pocket
 * rim, are a union of hulls between consecutive outlines.
 *
 * Frames. The "layout" frame is the one the planner draws: x right, y towards
 * the back, z up from the underside of the closed case, centred on the case.
 * Hinge and clasps are built in a "canonical" frame, the layout rotated so the
 * hinge edge always faces +y; the solids are rotated in, fitted, and rotated
 * back. Only quarter turns are involved, which Manifold applies exactly.
 */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  var WASM = null;
  CS.setManifold = function (w) { WASM = w; };
  CS.manifoldReady = function () { return !!WASM; };

  var DEG = Math.PI / 180;
  var THETA = { back: 0, right: 90, front: 180, left: -90 };

  /* Every WASM object made during a build is recorded here and freed at the
     end; the JS garbage collector cannot see into the WASM heap. */
  function Scope() { this.list = []; }
  Scope.prototype.k = function (m) { this.list.push(m); return m; };
  Scope.prototype.free = function () {
    for (var i = 0; i < this.list.length; i++) {
      try { this.list[i].delete(); } catch (e) { /* already gone */ }
    }
    this.list.length = 0;
  };

  /* ── 2-D outlines ───────────────────────────────────────────────── */
  /* Rounded rectangle, counter-clockwise, as [[x, y], …]. */
  function rrect(w, l, r, cx, cy, seg) {
    w = Math.max(w, 0.02); l = Math.max(l, 0.02);
    r = CS.clamp(r, 0, Math.min(w, l) / 2 - 1e-4);
    cx = cx || 0; cy = cy || 0;
    var hx = w / 2, hy = l / 2;
    if (r < 0.03) return [[cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy], [cx - hx, cy - hy]];
    var n = CS.clamp(Math.ceil(r * 2.5), 2, Math.max(2, Math.round(seg / 4)));
    var corners = [[hx - r, hy - r, 0], [-hx + r, hy - r, 90], [-hx + r, -hy + r, 180], [hx - r, -hy + r, 270]];
    var pts = [];
    corners.forEach(function (c) {
      for (var i = 0; i <= n; i++) {
        var a = (c[2] + 90 * i / n) * DEG;
        pts.push([cx + c[0] + r * Math.cos(a), cy + c[1] + r * Math.sin(a)]);
      }
    });
    return pts;
  }

  function ellipse(a, b, cx, cy, seg) {
    a = Math.max(a, 0.01); b = Math.max(b, 0.01);
    var n = Math.max(16, seg), pts = [];
    for (var i = 0; i < n; i++) {
      var t = i / n * Math.PI * 2;
      pts.push([cx + a * Math.cos(t), cy + b * Math.sin(t)]);
    }
    return pts;
  }

  function lift(pts, z) { return pts.map(function (p) { return [p[0], p[1], z]; }); }

  CS.rrectPoints = rrect;

  /* ── solid helpers (all registered with a scope) ────────────────── */
  function api() { return WASM.Manifold; }

  function box(S, x0, y0, z0, x1, y1, z1) {
    if (x1 - x0 < 1e-5 || y1 - y0 < 1e-5 || z1 - z0 < 1e-5) return null;
    var c = S.k(api().cube([x1 - x0, y1 - y0, z1 - z0], false));
    return S.k(c.translate([x0, y0, z0]));
  }
  function hullPts(S, pts) { return S.k(api().hull(pts)); }
  function hullOf(S, list) { return S.k(api().hull(list.filter(Boolean))); }
  function union(S, list) {
    list = list.filter(Boolean);
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    return S.k(api().union(list));
  }
  function sub(S, a, b) { if (!a) return null; if (!b) return a; return S.k(a.subtract(b)); }
  function inter(S, a, b) { if (!a || !b) return null; return S.k(a.intersect(b)); }
  function move(S, m, x, y, z) { return m ? S.k(m.translate([x, y, z])) : null; }
  function turn(S, m, deg) { return (m && deg) ? S.k(m.rotate([0, 0, deg])) : m; }

  function cylX(S, x0, x1, y, z, r, seg) {
    var c = S.k(api().cylinder(x1 - x0, r, r, seg, false));
    var c2 = S.k(c.rotate([0, 90, 0]));                 // axis +z → +x
    return move(S, c2, x0, y, z);
  }
  function cylZ(S, x, y, z0, z1, r, seg) {
    var c = S.k(api().cylinder(z1 - z0, r, r, seg, false));
    return move(S, c, x, y, z0);
  }
  /* Cylinder along y from y0 to y1, centred on (x, z). */
  function cylY(S, x, z, y0, y1, r, seg) {
    var lo = Math.min(y0, y1), hi = Math.max(y0, y1);
    var c = S.k(api().cylinder(hi - lo, r, r, seg, false));
    var c2 = S.k(c.rotate([90, 0, 0]));                // axis +z → -y
    return move(S, c2, x, hi, z);
  }

  /* Swing-hook shapes, drawn in the face plane (u = x, v = z) and extruded
     towards the viewer, so they sit flat against the clasp edge. */
  function sw2(S, D) {
    var CSx = WASM.CrossSection, g = D.swing, seg = D.seg;
    var circ = function (u, v, r) { return S.k(S.k(CSx.circle(r, seg)).translate([u, v])); };
    var hull2 = function (list) { return S.k(CSx.hull(list)); };
    var solid = function (cs, y0, y1) {       // profile → slab y ∈ [y0, y1]
      var e = S.k(cs.extrude(y1 - y0));
      var r = S.k(e.rotate([90, 0, 0]));       // v → z, depth → -y
      return move(S, r, 0, y1, 0);
    };
    var at = function (xp, deg, r) {
      return [xp + r * Math.cos(deg * DEG), g.zA + r * Math.sin(deg * DEG)];
    };
    return {
      annulusY: function (u, v, r0, r1, y0, y1) {
        return solid(S.k(circ(u, v, r1).subtract(circ(u, v, r0))), y0, y1);
      },
      hook: function (xp) {
        var bits = [];
        var p0 = at(xp, g.a0, g.Rt);
        bits.push(hull2([circ(xp, g.zA, g.rb), circ(p0[0], p0[1], g.wb / 2)]));          // arm
        var k = at(xp, g.a0, g.Rt + 1);
        bits.push(hull2([circ(p0[0], p0[1], g.wb / 2), circ(k[0], k[1], g.wb / 2 + 1.2)])); // thumb knob
        var n = Math.max(6, Math.ceil(Math.abs(g.a1 - g.a0) / 6));
        for (var i = 0; i < n; i++) {                                                    // the curved tip
          var a = at(xp, g.a0 + (g.a1 - g.a0) * i / n, g.Rt), b = at(xp, g.a0 + (g.a1 - g.a0) * (i + 1) / n, g.Rt);
          bits.push(hull2([circ(a[0], a[1], g.wb / 2), circ(b[0], b[1], g.wb / 2)]));
        }
        var profile = S.k(S.k(CSx.union(bits)).subtract(circ(xp, g.zA, g.pinR + 0.1)));
        return solid(profile, g.yH0, g.yH1);
      }
    };
  }

  function sphere(S, x, y, z, r, seg) {
    var s = S.k(api().sphere(r, seg));
    return move(S, s, x, y, z);
  }
  function prism(S, rings, z0, z1, rule) {
    if (z1 - z0 < 1e-5) return null;
    var cs = S.k(new WASM.CrossSection(rings, rule || 'EvenOdd'));
    if (cs.isEmpty()) return null;
    var e = S.k(cs.extrude(z1 - z0));
    return move(S, e, 0, 0, z0);
  }
  /* Outline sequence → solid: one hull when the profile is convex, else a
     union of hulls between neighbours. */
  function loft(S, slices, convex) {
    if (convex) {
      var all = [];
      slices.forEach(function (s) { all.push.apply(all, s); });
      return hullPts(S, all);
    }
    var parts = [];
    for (var i = 0; i < slices.length - 1; i++) parts.push(hullPts(S, slices[i].concat(slices[i + 1])));
    return union(S, parts);
  }

  function rotPt(x, y, deg) {
    var c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
    // Quarter turns land exactly, so planner and mesh agree to the micron.
    if (Math.abs(c) < 1e-12) c = 0; if (Math.abs(s) < 1e-12) s = 0;
    return [x * c - y * s, x * s + y * c];
  }

  /* ── description: everything the planner can draw without meshing ── */
  CS.describe = function (state) {
    var D = CS.resolve(state);
    var Q = CS.qualityOf(state);
    var H = state.hinge, C = state.clasp;
    var warn = D.warnings;

    var side = THETA[H.side] !== undefined ? H.side : 'back';
    D.claspSide = { back: 'front', front: 'back', left: 'right', right: 'left' }[side];
    D.claspType = C.type;
    var theta = THETA[side];
    var quarter = Math.abs(theta) === 90;
    var Wc = quarter ? D.L : D.W, Lc = quarter ? D.W : D.L;
    D.side = side; D.theta = theta; D.Wc = Wc; D.Lc = Lc; D.seg = Q.seg;

    /* Hinge: groups of alternating knuckles on one axis just behind the wall,
       at the parting line. Clear of the wall by the clearance, so each half can
       swing past the other's knuckles. */
    var hg = { segments: [], groups: [], ok: !D.tray };
    // A tray has no lid, so no hinge: still worked out (the axis is used for
    // posing) but nothing is built and nothing is reported.
    if (D.tray) warn = [];
    var n = CS.clamp(Math.round(H.count), 1, 6), k = CS.clamp(Math.round(H.knuckles), 2, 9);
    var rk = Math.max(1.5, H.diameter / 2), c = CS.clamp(H.clearance, 0.1, 1.5);
    var gap = CS.clamp(H.gap, 0.1, 2);
    var inset = Math.max(H.inset, D.R + 1);
    var span0 = -Wc / 2 + inset, span1 = Wc / 2 - inset, avail = span1 - span0;
    var Lh = Math.min(H.length, (avail - (n - 1) * 3) / n);
    var minLh = k * 2 + (k - 1) * gap;
    if (Lh < minLh && hg.ok) {
      hg.ok = false;
      warn.push({ level: 'bad', msg: 'The hinge does not fit: ' + n + ' × ' + k + ' knuckles need at least ' +
        (n * minLh + (n - 1) * 3 + 2 * inset).toFixed(0) + ' mm along the ' + side + ' edge. Use fewer hinges or knuckles.' });
    } else if (hg.ok && Lh < H.length - 1e-6) {
      warn.push({ level: 'warn', msg: 'Hinge length was limited to ' + Lh.toFixed(1) + ' mm to fit ' + n +
        ' hinge' + (n === 1 ? '' : 's') + ' along the ' + side + ' edge.' });
    }
    hg.ya = Lc / 2 + rk + c; hg.za = D.zP; hg.rk = rk; hg.c = c;
    hg.pinR = CS.clamp(H.pin / 2, 0.3, rk - 0.5);
    hg.len = Lh; hg.kl = (Lh - (k - 1) * gap) / k;
    if (hg.ok) {
      for (var gi = 0; gi < n; gi++) {
        var cx = n === 1 ? 0 : span0 + Lh / 2 + gi * (avail - Lh) / (n - 1);
        var x0 = cx - Lh / 2;
        hg.groups.push({ x0: x0, x1: x0 + Lh });
        for (var j = 0; j < k; j++) {
          var xs = x0 + j * (hg.kl + gap);
          hg.segments.push({ x0: xs, x1: xs + hg.kl, owner: j % 2 ? 'lid' : 'base' });
        }
      }
    }
    if (rk * 2 - hg.pinR * 2 < 1.6) {
      warn.push({ level: 'warn', msg: 'Knuckles leave only ' + (rk - hg.pinR).toFixed(2) +
        ' mm of material around the pin. A larger knuckle diameter makes them stronger.' });
    }
    hg.chinBase = Math.max(D.zP - 1.2 * rk * 2, D.eb + 0.4);
    hg.chinLid = Math.min(D.zP + 1.2 * rk * 2, D.zT - D.et - 0.4);
    if (D.zP - hg.chinBase < rk || hg.chinLid - D.zP < rk) {
      warn.push({ level: 'warn', msg: 'The hinge knuckles are large for a case this shallow, so their supports are short. ' +
        'A smaller knuckle diameter or a taller ' + (D.zP - hg.chinBase < rk ? 'base' : 'lid') + ' prints more reliably.' });
    }
    if (H.pin < 1.8) {
      warn.push({ level: 'warn', msg: 'A ' + H.pin.toFixed(2) + ' mm pin hole is tight for 1.75 mm filament once printed. 1.9–2.0 mm slides in.' });
    }
    D.hinge = hg;

    /* Clasps along the edge opposite the hinge, evenly spaced. */
    warn = D.warnings;
    var cn = (C.type === 'none' || D.tray) ? 0 : CS.clamp(Math.round(C.count), 1, 6);
    var cw = Math.max(4, C.width);
    D.clasps = [];
    for (var ci = 0; ci < cn; ci++) {
      D.clasps.push({ xc: cn === 1 ? 0 : -Wc / 2 + Wc * (ci + 1) / (cn + 1), w: cw });
    }
    if (cn) {
      var pitch = Wc / (cn + 1);
      if (cn > 1 && pitch < cw + 3) {
        warn.push({ level: 'warn', msg: 'Clasps overlap — ' + cn + ' × ' + cw.toFixed(0) + ' mm do not fit along a ' +
          Wc.toFixed(0) + ' mm edge.' });
      }
      if (C.type === 'magnet' && D.T0 < C.magnetD + 1.2) {
        warn.push({ level: 'bad', msg: 'A ' + C.magnetD + ' mm magnet needs a side wall of at least ' +
          (C.magnetD + 1.2).toFixed(1) + ' mm; its pocket would break through a ' + D.T0.toFixed(1) +
          ' mm wall. Use thicker side walls or smaller magnets.' });
      }
      if (C.type === 'bump' && !(D.lipOn && D.lipSides[D.claspSide])) {
        warn.push({ level: 'bad', msg: 'Snap bumps sit on the alignment lip — switch the lip on along the ' + D.claspSide +
          ' edge, or choose another clasp.' });
      }
    }

    /* Hook latch: lugs on the lid carry a pivot pin, lugs on the base a catch
       pin, and a separate hook swings between them. Both pins are filament. */
    var rkL = CS.clamp(C.latchD / 2, 2, 7);
    D.latch = {
      rk: rkL, cl: CS.clamp(C.clearance, 0.1, 0.8),
      pinR: CS.clamp(H.pin / 2, 0.3, rkL - 0.6),
      ear: Math.max(2.5, rkL),
      yA: -Lc / 2 - rkL - CS.clamp(C.clearance, 0.1, 0.8),
      drop: CS.clamp(C.latchDrop, 0, 30)
    };
    D.latch.zA = D.zP + rkL + D.latch.cl;
    D.latch.zB = D.zP - rkL - D.latch.cl - D.latch.drop;
    D.latch.chinLid = Math.min(D.latch.zA + 2.4 * rkL, D.zT - D.et - 0.4);
    D.latch.chinBase = Math.max(D.latch.zB - 2.4 * rkL, D.eb + 0.4);
    /* Swing hook: a flat hook turns on a pin set square into the lid, and its
       tip — an arc about that pin — threads through an eye on the base. The
       eye sits straight below the pivot, so the tip slides through it level. */
    var sw = { cl: Math.max(0.3, CS.clamp(C.clearance, 0.1, 0.8)), s: 1.2, th: 3, legT: 1.6, bridgeT: 1.4, h: 2.5 };
    sw.pinR = D.latch.pinR;
    sw.rb = Math.max(sw.pinR + 1.6, rkL);
    sw.wb = CS.clamp(sw.rb * 0.9, 2, 4);
    sw.zA = D.zP + sw.rb + 1;
    // Radius chosen so the eye's upper bar stays below the parting line where
    // the curved band passes under it, at the eye's ends.
    var K = sw.zA - D.zP + 0.3 + sw.legT;
    sw.Rt = Math.sqrt(K * K + sw.h * sw.h) + sw.wb / 2 + sw.cl + D.latch.drop;
    sw.zB = sw.zA - sw.Rt;
    sw.yH1 = -Lc / 2 - sw.s; sw.yH0 = sw.yH1 - sw.th;
    sw.out = sw.s + sw.th + sw.cl + sw.bridgeT;
    sw.eyeLow = sw.zB - sw.wb / 2 - sw.cl - sw.legT;
    sw.a0 = -20; sw.a1 = -90 - Math.asin(Math.min(0.95, (sw.h + 1.5) / sw.Rt)) * 180 / Math.PI;
    // Pivot offset so the whole latch is centred on its clasp position.
    var left = -(sw.h + 1.5 + sw.wb / 2), right = sw.Rt * Math.cos(20 * DEG) + sw.wb / 2 + 2.2;
    sw.shift = (left + right) / 2;
    D.swing = sw;
    if (C.type === 'swing' && cn) {
      if (sw.eyeLow < D.eb + 0.4) {
        warn.push({ level: 'bad', msg: 'The swing hook\'s eye hangs below the base. Use a smaller hub, less extra length, or a taller base.' });
      }
      if (sw.zA + sw.rb > D.zT - D.et - 0.3) {
        warn.push({ level: 'bad', msg: 'The swing hook\'s pivot does not fit on the lid. Use a smaller hub or a taller lid.' });
      }
    }
    if (C.type === 'hook' && cn) {
      if (D.latch.zB - rkL < D.eb + 0.3) {
        warn.push({ level: 'bad', msg: 'The latch catch hangs below the base. Reduce the latch drop or lug diameter, or make the base taller.' });
      }
      if (D.latch.chinLid - D.latch.zA < rkL) {
        warn.push({ level: 'warn', msg: 'The lid is shallow for the latch lugs, so their supports are short. A smaller lug diameter prints more reliably.' });
      }
      var hookW = cw - 2 * (D.latch.ear + D.latch.cl);
      if (hookW < 4) {
        warn.push({ level: 'bad', msg: 'Latches ' + cw.toFixed(0) + ' mm wide leave only ' + hookW.toFixed(1) +
          ' mm for the hook between its lugs. Make them at least ' + (4 + 2 * (D.latch.ear + D.latch.cl)).toFixed(0) + ' mm wide.' });
      }
    }

    /* Patches of wall that hinge supports and clasps sit on or press against:
       texture there would only be hidden, or stop the part seating, so those
       stay plain. Stored in the layout frame as { side, a0, a1, z0, z1 },
       a being the coordinate along that side. */
    D.plainZones = [];
    var zone = function (sideName, edgeY, x0, x1, z0, z1) {
      var p0 = rotPt(x0, edgeY, -theta), p1 = rotPt(x1, edgeY, -theta);
      var along = sideName === 'front' || sideName === 'back' ? 0 : 1;
      D.plainZones.push({ side: sideName, a0: Math.min(p0[along], p1[along]), a1: Math.max(p0[along], p1[along]), z0: z0, z1: z1 });
    };
    hg.groups.forEach(function (g) { zone(side, Lc / 2, g.x0 - 1, g.x1 + 1, hg.chinBase - 0.5, hg.chinLid + 0.5); });
    D.clasps.forEach(function (q) {
      var x0 = q.xc - q.w / 2 - 1, x1 = q.xc + q.w / 2 + 1;
      if (C.type === 'snap') {
        var t = CS.clamp(C.thickness, 0.8, 5), cl2 = CS.clamp(C.clearance, 0.05, 0.8);
        var reach = CS.clamp(C.reach, 2, Math.max(2, D.zP - D.eb - 1));
        var attach = CS.clamp(D.zT - D.zP - D.et - t - cl2 - 0.6, 1.2, 10);
        zone(D.claspSide, -Lc / 2, x0, x1, D.zP - reach - 1, D.zP + attach + t + cl2 + 1);
      } else if (C.type === 'hook') {
        zone(D.claspSide, -Lc / 2, x0, x1, D.latch.chinBase - 0.5, D.latch.chinLid + 0.5);
      } else if (C.type === 'swing') {
        var g2 = D.swing, xp = q.xc - g2.shift;
        zone(D.claspSide, -Lc / 2, xp - g2.h - 2.5 - g2.wb, xp + g2.Rt + g2.wb + 3.5,
             Math.max(g2.eyeLow - g2.out, D.eb) - 0.5, g2.zA + g2.rb + 0.5);
      }
    });

    /* Opening axis in the layout frame, for previews and the print layout. */
    var p = rotPt(0, hg.ya, -theta), d = rotPt(1, 0, -theta), nrm = rotPt(0, 1, -theta);
    D.axis = { p: [p[0], p[1], D.zP], d: [d[0], d[1], 0], n: [nrm[0], nrm[1], 0] };

    /* Planner-ready shapes, already back in the layout frame. */
    var back = function (x, y) { return rotPt(x, y, -theta); };
    D.planKnuckles = hg.segments.map(function (s) {
      var a = back(s.x0, Lc / 2 + c), b = back(s.x1, Lc / 2 + c + 2 * rk);
      return { owner: s.owner, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]),
               y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) };
    });
    D.planClasps = D.clasps.map(function (q) {
      var outside = C.type === 'snap' || C.type === 'hook' || C.type === 'swing';
      var depth = C.type === 'snap' ? C.thickness + C.clearance
                : C.type === 'hook' ? 2 * D.latch.rk + D.latch.cl
                : C.type === 'swing' ? D.swing.out : 0;
      var a = back(q.xc - q.w / 2, -Lc / 2 - depth), b = back(q.xc + q.w / 2, -Lc / 2 + (outside ? 0 : D.T0));
      return { type: C.type, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]),
               y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) };
    });

    /* Finger notches, one per requested side of each compartment. */
    D.notches = [];
    D.rects.forEach(function (r) {
      var s = r.node, gTop = s._depth * D.tanP;
      var dg = s.groove.depth != null && isFinite(s.groove.depth)
        ? CS.clamp(s.groove.depth, 1, D.Hb) : Math.max(1, s._depth * 0.7);
      var sides = s.grooves || {};
      var add = function (x, y, along) {
        var rad = Math.max(2, Math.min(s.groove.width / 2, along / 2 - 0.5));
        D.notches.push({ id: s.id, x: x, y: y, r: rad, depth: dg });
      };
      if (sides.left)  add(r.x0 - gTop, r.cy, r.l);
      if (sides.right) add(r.x1 + gTop, r.cy, r.l);
      if (sides.back)  add(r.cx, r.y1 + gTop, r.w);
      if (sides.front) add(r.cx, r.y0 - gTop, r.w);
    });

    return D;
  };

  /* ── shells ─────────────────────────────────────────────────────── */
  function filletSteps(r, style, seg) {
    if (r <= 0.01) return [[0, 0]];
    if (style === 'chamfer') return [[0, r], [r, 0]];
    var n = Math.max(3, Math.round(seg / 8)), out = [];
    for (var i = 0; i <= n; i++) {
      var a = i / n * Math.PI / 2;
      out.push([r * (1 - Math.cos(a)), r * (1 - Math.sin(a))]);     // [rise, inset]
    }
    return out;
  }

  function outline(D, inset) {
    return rrect(D.W - 2 * inset, D.L - 2 * inset, Math.max(0, D.R - inset), 0, 0, D.seg);
  }

  function baseOuter(S, D, style) {
    var slices = [];
    filletSteps(D.eb, style, D.seg).forEach(function (st) {
      var z = st[0];
      slices.push(lift(outline(D, st[1] + (D.zP - z) * D.tanO), z));
    });
    slices.push(lift(outline(D, 0), D.zP));
    return loft(S, slices, true);
  }

  function lidOuter(S, D, style) {
    var slices = [lift(outline(D, 0), D.zP)];
    filletSteps(D.et, style, D.seg).slice().reverse().forEach(function (st) {
      var z = D.zT - st[0];
      slices.push(lift(outline(D, st[1] + (z - D.zP) * D.tanO), z));
    });
    return loft(S, slices, true);
  }

  function interiorRing(D, inset) {
    inset = inset || 0;
    return rrect(D.IW - 2 * inset, D.IL - 2 * inset, Math.max(0, D.Ri - inset), 0, 0, D.seg);
  }

  /* ── pockets ────────────────────────────────────────────────────── */
  function pocket(S, D, P, r, zTop, clip) {
    var s = r.node, d = r.depth != null ? r.depth : s._depth, zf = D.zP - d;
    var round = (r.shape || s.shape) === 'round';
    var rf = Math.max(0, Math.min(P.floor, d * 0.45, Math.min(r.w, r.l) / 2 - 0.2));
    var rr = Math.max(0, Math.min(P.rim, D.inner / 2 - 0.3, d * 0.35, d - rf - 0.2));
    var rc = r.corner != null ? Math.min(r.corner, Math.min(r.w, r.l) / 2) : Math.min(P.corner, Math.min(r.w, r.l) / 2);
    var seg = D.seg;

    var ring = function (z, off) {          // off > 0 grows the outline
      var g = (Math.min(z, D.zP) - zf) * D.tanP + off;
      var pts = round
        ? ellipse(r.w / 2 + g, r.l / 2 + g, r.cx, r.cy, seg)
        : rrect(r.w + 2 * g, r.l + 2 * g, Math.max(0, rc + g), r.cx, r.cy, seg);
      return lift(pts, z);
    };

    var lower = [];
    if (rf > 0.01) {
      var nf = Math.max(3, Math.round(seg / 8));
      for (var i = 0; i <= nf; i++) {
        var a = i / nf * Math.PI / 2;
        lower.push(ring(zf + rf * (1 - Math.cos(a)), -rf * (1 - Math.sin(a))));
      }
    } else lower.push(ring(zf, 0));
    lower.push(ring(D.zP - rr, 0));
    var parts = [loft(S, lower, true)];

    if (rr > 0.01) {
      var rim = [], nr = Math.max(3, Math.round(seg / 8));
      for (var j = 0; j <= nr; j++) {
        var b = j / nr * Math.PI / 2;
        rim.push(ring(D.zP - rr + rr * Math.sin(b), rr * (1 - Math.cos(b))));
      }
      parts.push(loft(S, rim, false));
    }
    parts.push(loft(S, [ring(D.zP, rr), ring(zTop, rr)], true));
    // The rim round-over and taper may not eat into the outer wall or lip.
    return clip ? inter(S, union(S, parts), clip) : union(S, parts);
  }

  /* ── Gridfinity feet ─────────────────────────────────────────────── */
  /* One standard foot per 42 mm cell, below z = 0: 0.8 mm at 45°, 1.8 mm
     straight, 2.15 mm at 45°, from a 35.6 mm square up to 41.5 mm. The two
     45° runs are hulled separately, since the step between them is concave.
     Optional 6.5 × 2.4 mm magnet pockets sit 13 mm from each cell centre. */
  function gridFeet(S, D) {
    var g = D.grid, z0 = -g.foot, feet = [], holes = [];
    for (var i = 0; i < g.nx; i++) for (var j = 0; j < g.ny; j++) {
      var cx = (i - (g.nx - 1) / 2) * 42, cy = (j - (g.ny - 1) / 2) * 42;
      var a = lift(rrect(35.6, 35.6, 0.8, cx, cy, D.seg), z0);
      var b = lift(rrect(37.2, 37.2, 1.6, cx, cy, D.seg), z0 + 0.8);
      var c = lift(rrect(37.2, 37.2, 1.6, cx, cy, D.seg), z0 + 2.6);
      var d = lift(rrect(41.5, 41.5, 3.75, cx, cy, D.seg), 0.2);    // overlaps into the floor
      feet.push(hullPts(S, a.concat(b, c)), hullPts(S, c.concat(d)));
      if (g.magnets) {
        [[-13, -13], [13, -13], [-13, 13], [13, 13]].forEach(function (o) {
          holes.push(cylZ(S, cx + o[0], cy + o[1], z0 - 1, z0 + 2.4, 3.25, Math.max(24, D.seg)));
        });
      }
    }
    return sub(S, union(S, feet), union(S, holes));
  }

  /* ── surface texture ───────────────────────────────────────────── */
  /* A textured half is built directly as one structured mesh rather than by
     subdividing the hull: a grid of columns running round the outline and rows
     running up it. Every quad is about `res` square, so the pattern is
     sampled evenly, and each vertex is pushed in (or out) by the pattern.
     Walls are mapped by (distance round the perimeter, z), faces by (x, y).

     Two engines (state.texture.engine):
       fine     The export samples far finer than the eye needs, then Manifold
                simplifies the shell to a 0.01 mm tolerance, so triangles stay
                dense only where the surface actually bends. The preview builds a light mesh for shape
                and carries per-vertex atlas coordinates; the viewer shades it
                per pixel from a height atlas of the very same function.
       classic  The previous behaviour: one grid density for both, every
                sample averaged over its cell. Kept as a way back. */
  var EPS_R = 0.05;
  var NP = 12;   // per-vertex: x y z | atlas u v | base normal xyz | tangent xyz | kind

  CS.texEngine = function (state) { return (state.texture && state.texture.engine) === 'classic' ? 'classic' : 'fine'; };

  /* Pattern size → grid spacing. Classic: ~14 samples per repeat, 1.5× coarser
     in the preview. Fine: the export oversamples (~30 per repeat, before
     simplification); the preview only needs the shape, the detail is shaded. */
  CS.texResFor = function (state, preview) {
    var T = state.texture || {};
    var q = { draft: 1.6, normal: 1, fine: 0.8, ultra: 0.6 }[state.quality] || 1;
    var scale = Math.max(0.5, T.scale || 4);
    if (CS.texEngine(state) === 'classic') {
      var r = CS.clamp(scale / 14, 0.12, 0.45) * q;
      return preview ? CS.clamp(r * 1.5, 0.25, 0.7) : CS.clamp(r, 0.1, 0.7);
    }
    return preview ? CS.clamp(scale / 9 * q, 0.3, 0.8) : CS.clamp(scale / 30 * q, 0.06, 0.2);
  };

  /* Plain border of one edge of a half's texture: 'bottom' / 'top' of the
     wall band (as the case sits closed) or round the 'face'. Falls back to
     the single border older designs had. */
  CS.texBorder = function (T, half, edge) {
    var b = T.borders && T.borders[half] && T.borders[half][edge];
    if (b == null || !isFinite(b)) b = T.border == null ? 1 : T.border;
    return CS.clamp(b, 0, 20);
  };

  function texturePlan(D, state, half) {
    var T = state.texture;
    if (!T || !T.enabled) return null;
    var cfg = (T.sides && T.sides[half]) || {};
    var pick = function (v) {
      var name = v === 'all' || v == null ? T.pattern : v === 'none' ? null : v;
      return name && CS.texReady(name) ? name : null;
    };
    var pats = { front: pick(cfg.front), back: pick(cfg.back), left: pick(cfg.left), right: pick(cfg.right),
                 face: pick(cfg.face || 'none') };
    if (half === 'base' && D.grid) pats.face = null;
    if (!pats.front && !pats.back && !pats.left && !pats.right && !pats.face) return null;
    return pats;
  }

  /* Everything about one half's textured walls that the mesh, the atlas and
     the preview all need, so the three can never disagree. */
  function wallSetup(D, state, half, pats, res) {
    var T = state.texture, isBase = half === 'base';
    var W = D.W, L = D.L, R = D.R;
    var ws = { isBase: isBase, depth: CS.clamp(T.depth, 0.05, 3), inCap: Math.max(0.05, D.T0 - 0.8),
               raise: texRaise(D, state), STEP: 0.05 };
    ws.zLo = isBase ? D.eb : D.zP;
    ws.zHi = isBase ? D.zP : D.zT - D.et;
    ws.taper = function (z) { return (isBase ? D.zP - z : z - D.zP) * D.tanO; };
    /* Textured band with a crisp edge: plain up to zA, a 0.05 mm step out to
       full depth, full depth to zB, and a step back. Each edge has its own
       plain border (bottom and top as the case sits closed). */
    ws.zA = ws.zLo + CS.texBorder(T, half, 'bottom');
    ws.zB = ws.zHi - CS.texBorder(T, half, 'top');
    /* Beside the lip the lid wall is only its outer half. If the texture is
       deeper than that can take, start the lid's band above the groove. */
    var deepest = Math.max.apply(null, ['front', 'back', 'left', 'right'].map(function (k) {
      return pats[k] ? Math.min(ws.inCap, ws.depth - ws.raise[k]) : 0;
    }));
    if (!isBase && D.lipOn && deepest > D.lipT - 0.6) ws.zA = Math.max(ws.zA, D.zP + D.lipH + D.lipC + 0.4);
    ws.band = ws.zB - ws.zA >= 2 * ws.STEP + res;

    /* Columns round the widest outline: a fixed number per side and corner, so
       every row has the same count and rows join up. */
    var Rr = Math.max(R, EPS_R);
    var ax0 = Math.max(0, W / 2 - Rr), ay0 = Math.max(0, L / 2 - Rr), arc = Rr * Math.PI / 2;
    var nX = Math.max(1, Math.ceil(2 * ax0 / res)), nY = Math.max(1, Math.ceil(2 * ay0 / res));
    var nA = Math.max(2, Math.ceil(arc / res));
    ws.segs = [['R', nY, 2 * ay0], ['TR', nA, arc], ['T', nX, 2 * ax0], ['TL', nA, arc],
               ['L', nY, 2 * ay0], ['BL', nA, arc], ['B', nX, 2 * ax0], ['BR', nA, arc]];
    ws.cols = []; ws.uCol = [];
    var acc = 0;
    ws.segs.forEach(function (sg) {
      for (var i = 0; i < sg[1]; i++) { ws.cols.push([sg[0], i / sg[1]]); ws.uCol.push(acc + sg[2] * i / sg[1]); }
      acc += sg[2];
    });
    ws.perimeter = acc;

    /* A point of the outline inset by `ins` (corner radius shrinks with it),
       with its outward normal. Corners never go below EPS_R, so columns stay
       distinct even where the requested corner is sharp. */
    ws.at = function (c, ins) {
      var hx = W / 2 - ins, hy = L / 2 - ins;
      var r = CS.clamp(R - ins, EPS_R, Math.max(EPS_R, Math.min(hx, hy) - 1e-3));
      var ax = Math.max(0, hx - r), ay = Math.max(0, hy - r), f = c[1], an;
      switch (c[0]) {
        case 'R':  return [ax + r, -ay + 2 * ay * f, 1, 0, r, false];
        case 'T':  return [ax - 2 * ax * f, ay + r, 0, 1, r, false];
        case 'L':  return [-ax - r, ay - 2 * ay * f, -1, 0, r, false];
        case 'B':  return [-ax + 2 * ax * f, -ay - r, 0, -1, r, false];
        case 'TR': an = f * Math.PI / 2; return [ax + r * Math.cos(an), ay + r * Math.sin(an), Math.cos(an), Math.sin(an), r, true];
        case 'TL': an = Math.PI / 2 + f * Math.PI / 2; return [-ax + r * Math.cos(an), ay + r * Math.sin(an), Math.cos(an), Math.sin(an), r, true];
        case 'BL': an = Math.PI + f * Math.PI / 2; return [-ax + r * Math.cos(an), -ay + r * Math.sin(an), Math.cos(an), Math.sin(an), r, true];
        default:   an = 1.5 * Math.PI + f * Math.PI / 2; return [ax + r * Math.cos(an), -ay + r * Math.sin(an), Math.cos(an), Math.sin(an), r, true];
      }
    };
    // The same, at a distance u round the outline (for the atlas).
    ws.atU = function (u, ins) {
      u = ((u % ws.perimeter) + ws.perimeter) % ws.perimeter;
      for (var i = 0; i < ws.segs.length; i++) {
        var sg = ws.segs[i];
        if (u <= sg[2] || i === ws.segs.length - 1) return ws.at([sg[0], sg[2] > 0 ? CS.clamp(u / sg[2], 0, 1) : 0], ins);
        u -= sg[2];
      }
    };
    ws.sideOf = function (nx, ny) {
      return Math.abs(nx) >= Math.abs(ny) ? (nx > 0 ? 'right' : 'left') : (ny > 0 ? 'back' : 'front');
    };
    /* The pattern's join goes in the middle of the hinge side (the back of a
       tray), where it shows least. */
    var seamSide = D.tray ? 'back' : D.side;
    var seamAt = { right: ws.segs[0][2] / 2 }[seamSide];
    if (seamAt === undefined) {
      var order = { R: 'right', T: 'back', L: 'left', B: 'front' }, acc2 = 0;
      ws.segs.forEach(function (sg) {
        if (order[sg[0]] === seamSide) seamAt = acc2 + sg[2] / 2;
        acc2 += sg[2];
      });
    }
    ws.samplers = {};
    ['front', 'back', 'left', 'right'].forEach(function (k) {
      if (pats[k]) ws.samplers[k] = CS.texSampler(pats[k], T.scale, T.angle, ws.perimeter, seamAt);
    });
    var zones = D.plainZones || [];
    ws.plainAt = function (side, x, y, z) {
      var a2 = side === 'front' || side === 'back' ? x : y;
      for (var q = 0; q < zones.length; q++) {
        var Z = zones[q];
        if (Z.side === side && a2 >= Z.a0 && a2 <= Z.a1 && z >= Z.z0 && z <= Z.z1) return true;
      }
      return false;
    };
    /* The pattern at a wall point: its raw depth below the high points `d`
       (for choosing diagonals), and `g`, how far the surface actually moves
       in (raise and the wall cap applied). Zero outside the band, on plain
       patches and on untextured sides. `sample` filters or not. */
    ws.disp = function (p, u, z, sample) {
      if (!ws.band || z < ws.zA + ws.STEP - 1e-9 || z > ws.zB - ws.STEP + 1e-9) return null;
      var side = ws.sideOf(p[2], p[3]), f = ws.samplers[side];
      if (!f || ws.plainAt(side, p[0], p[1], z)) return null;
      var d = ws.depth * sample(f, u, z);
      return { d: d, g: Math.min(d - ws.raise[side], ws.inCap), f: f };
    };
    return ws;
  }

  function texturedShell(S, D, state, half, pats, res, props) {
    var style = state.outer.edgeStyle;
    var ws = wallSetup(D, state, half, pats, res), isBase = ws.isBase;
    var fine = CS.texEngine(state) === 'fine' && !props;
    var sample = fine ? function (f, u, v) { return lightFilter(f, u, v, res); }
                      : function (f, u, v) { return filtered(f, u, v, res); };

    /* Rows up the side: [z, inset, plain]. Fillet rows follow the edge
       profile; the band gets evenly spaced rows `res` apart. */
    var rows = [], fil = filletSteps(isBase ? D.eb : D.et, style, D.seg);
    if (isBase) fil.forEach(function (f) { if (f[0] < ws.zLo - 1e-6) rows.push([f[0], f[1] + ws.taper(f[0]), true]); });
    if (!ws.band) {
      rows.push([ws.zLo, ws.taper(ws.zLo), true], [ws.zHi, ws.taper(ws.zHi), true]);
    } else {
      if (ws.zA > ws.zLo + 1e-6) rows.push([ws.zLo, ws.taper(ws.zLo), true]);
      rows.push([ws.zA, ws.taper(ws.zA), true]);
      var a0 = ws.zA + ws.STEP, b0 = ws.zB - ws.STEP, nz = Math.max(1, Math.ceil((b0 - a0) / res));
      for (var k = 0; k <= nz; k++) { var z = a0 + (b0 - a0) * k / nz; rows.push([z, ws.taper(z), false]); }
      rows.push([ws.zB, ws.taper(ws.zB), true]);
      if (ws.zB < ws.zHi - 1e-6) rows.push([ws.zHi, ws.taper(ws.zHi), true]);
    }
    if (!isBase) fil.slice().reverse().forEach(function (f) {
      var zz = D.zT - f[0];
      if (zz > ws.zHi + 1e-6) rows.push([zz, f[1] + ws.taper(zz), true]);
    });

    var N = ws.cols.length, atlas = props && props.atlas;
    var verts = [], disp = [], vu = [], vf = [];
    var push = function (x, y, z, d, u, f, pr) {
      verts.push(x, y, z);
      if (props) {
        if (pr) verts.push(pr[0], pr[1], pr[2], pr[3], pr[4], pr[5], pr[6], pr[7], pr[8]);
        else verts.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
      disp.push(d || 0); vu.push(u || 0); vf.push(f || null);
      return disp.length - 1;
    };
    // Atlas coordinates and shading frame for a wall vertex.
    var wallProps = function (p, u, z, band) {
      if (!atlas || !band) return null;
      return [atlas.wallU(u), atlas.wallV(z), p[2], p[3], 0, -p[3], p[2], 0, 1];
    };

    var mergeFrom = [], mergeTo = [];
    function sideRing(z, ins, plain) {
      var idx = new Array(props ? N + 1 : N);
      for (var j = 0; j <= N; j++) {
        if (j === N && !props) break;
        var jj = j % N, p = ws.at(ws.cols[jj], ins), x = p[0], y = p[1];
        var u = j === N ? ws.perimeter : ws.uCol[jj];
        var r = plain ? null : ws.disp(p, ws.uCol[jj], z, sample);
        var g = 0;
        if (r) {
          g = r.g;
          // Round a tight corner, an inward push bigger than the radius would
          // turn the surface inside out.
          if (p[5] && g > 0) g = Math.min(g, p[4] * 0.85);
          x -= p[2] * g; y -= p[3] * g;
        }
        idx[j] = push(x, y, z, r ? r.d : 0, u, r && !p[5] ? r.f : null, wallProps(p, u, z, !plain));
        // The column where u wraps is drawn twice (u = perimeter and u = 0) so
        // atlas coordinates never interpolate across the whole strip; Manifold
        // is told the two are one vertex.
        if (j === N) { mergeFrom.push(idx[j]); mergeTo.push(idx[0]); }
      }
      return idx;
    }

    // Depth the pattern really has at the middle of a quad, or null when the
    // quad isn't wholly in one textured side.
    var mid = function (a2, b2, c2, d2) {
      var f = vf[a2];
      if (!f || vf[b2] !== f || vf[c2] !== f || vf[d2] !== f) return null;
      var ub = vu[b2] < vu[a2] ? vu[b2] + ws.perimeter : vu[b2];
      return ws.depth * sample(f, (vu[a2] + ub) / 2, (verts[a2 * (props ? NP : 3) + 2] + verts[d2 * (props ? NP : 3) + 2]) / 2);
    };

    var zBot = rows[0][0], zTop = rows[rows.length - 1][0], ringIdx = [];
    var botPole = push(0, 0, zBot);
    rows.forEach(function (rw) { ringIdx.push(sideRing(rw[0], rw[1], rw[2])); });
    var topPole = push(0, 0, zTop);

    var tris = [], step = function (j) { return props ? j + 1 : (j + 1) % N; };
    var R0 = ringIdx[0];
    for (var j = 0; j < N; j++) tris.push(botPole, R0[step(j)], R0[j]);
    for (var rI = 0; rI < ringIdx.length - 1; rI++) {
      var A = ringIdx[rI], B = ringIdx[rI + 1];
      for (var j2 = 0; j2 < N; j2++) {
        var j3 = step(j2);
        quadSplit(tris, disp, A[j2], A[j3], B[j3], B[j2], mid(A[j2], A[j3], B[j3], B[j2]));
      }
    }
    var RL = ringIdx[ringIdx.length - 1];
    for (var j4 = 0; j4 < N; j4++) tris.push(RL[j4], RL[step(j4)], topPole);

    var opts = { numProp: props ? NP : 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) };
    if (mergeFrom.length) { opts.mergeFromVert = new Uint32Array(mergeFrom); opts.mergeToVert = new Uint32Array(mergeTo); }
    var m = S.k(new WASM.Manifold(new WASM.Mesh(opts)));
    if (m.status() !== 'NoError' || m.isEmpty()) throw new Error('Texture produced an invalid surface (' + m.status() + ').');
    return m;
  }

  /* Split a grid quad (corners a, b, c, d in order round it) along the
     diagonal whose midpoint comes closest to the pattern's true depth at the
     quad's centre, `hc`. That diagonal follows ridges and valleys, so an edge
     at an angle to the grid comes out straight, and on smooth slopes the
     choice is consistent rather than flickering. Without `hc`, fall back to
     joining the two corners closest in depth. */
  function quadSplit(tris, disp, a, b, c, d, hc) {
    var ac = hc == null ? Math.abs(disp[a] - disp[c]) : Math.abs((disp[a] + disp[c]) / 2 - hc);
    var bd = hc == null ? Math.abs(disp[b] - disp[d]) : Math.abs((disp[b] + disp[d]) / 2 - hc);
    if (ac <= bd) tris.push(a, b, c, a, c, d);
    else tris.push(a, b, d, b, c, d);
  }

  /* Classic: the pattern averaged over the whole grid cell (3 × 3 taps), so
     a crisp edge becomes a ramp one cell wide instead of a staircase. */
  function filtered(f, u, v, res) {
    var h = res / 3, sum = 0;
    for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) sum += f(u + i * h, v + j * h);
    return sum / 9;
  }
  /* Fine: the grid is already far finer than any feature, so a light four-tap
     average is enough to keep it from aliasing. */
  function lightFilter(f, u, v, res) {
    var h = res * 0.25;
    return (f(u - h, v - h) + f(u + h, v - h) + f(u - h, v + h) + f(u + h, v + h)) / 4;
  }

  /* ── height atlas (fine engine preview) ───────────────────────────── */
  /* An image of how far the surface moves in, for one half: the textured
     wall band unrolled (u round the perimeter × z) on top, the textured face
     (x × y) below, at k texels per mm. The viewer reads it per pixel to shade
     detail the light preview mesh doesn't carry. Values come from wallSetup's
     disp() — the same function the export uses — so the two always agree.
     Cached on everything that feeds it, so moving a compartment doesn't
     recompute it. */
  var atlasCache = {};
  CS.textureAtlas = function (D, state, half, pats, res) {
    var T = state.texture;
    var key = JSON.stringify([half, pats, T.pattern, T.scale, T.angle, T.depth, T.raise, T.border, T.borders, D.W, D.L, D.R,
      D.zP, D.zT, D.eb, D.et, D.tanO, D.T0, D.lipOn, D.lipH, D.lipC, D.lipT, D.plainZones, D.top, D.bottom,
      D.side, D.claspSide, D.tray, (CS.assets.texture && CS.assets.texture._rev) || 0]);
    if (atlasCache[half] && atlasCache[half].key === key) return atlasCache[half].atlas;

    var ws = wallSetup(D, state, half, pats, res);
    var walls = !!(pats.front || pats.back || pats.left || pats.right) && ws.band;
    var fo = CS.faceOutline(D, half), hasFace = !!pats.face;
    var k = CS.clamp(48 / Math.max(0.5, T.scale), 5, 14);
    k = Math.min(k, 4000 / Math.max(1, walls ? ws.perimeter : 1), 4000 / Math.max(1, fo.w));
    var wallRows = walls ? Math.ceil((ws.zHi - ws.zLo) * k) + 3 : 0;
    var faceRows = hasFace ? Math.ceil(fo.h * k) + 3 : 0;
    var AW = Math.max(walls ? Math.ceil(ws.perimeter * k) + 3 : 1, hasFace ? Math.ceil(fo.w * k) + 3 : 1);
    var AH = Math.max(1, wallRows + faceRows);
    var data = new Float32Array(AW * AH), raw = function (f, u, v) { return f(u, v); };

    if (walls) for (var j = 0; j < wallRows; j++) {
      var z = ws.zLo + (j - 1) / k;
      for (var i = 0; i < AW; i++) {
        var u = (i - 1) / k, p = ws.atU(u, ws.taper(z)), r = ws.disp(p, u, z, raw);
        if (!r) continue;
        var g = r.g;
        if (p[5] && g > 0) g = Math.min(g, p[4] * 0.85);
        data[j * AW + i] = g;
      }
    }
    if (hasFace) {
      var depth = CS.clamp(T.depth, 0.05, 3), raise = texRaise(D, state).face, isBase = half === 'base';
      var inCap = Math.max(0.05, (isBase ? D.bottom : D.top) - 0.8);
      var f = CS.texSampler(pats.face, T.scale, T.angle), border = CS.texBorder(T, half, 'face');
      var hx = fo.w / 2 - border, hy = fo.h / 2 - border, rr = Math.max(0, Math.min(fo.r, fo.w / 2, fo.h / 2) - border);
      for (var jf = 0; jf < faceRows; jf++) {
        var y = -fo.h / 2 + (jf - 1) / k;
        for (var ifc = 0; ifc < AW; ifc++) {
          var x = -fo.w / 2 + (ifc - 1) / k;
          var qx = Math.abs(x) - (hx - rr), qy = Math.abs(y) - (hy - rr);
          if (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) > rr) continue;
          data[(wallRows + jf) * AW + ifc] = Math.min(depth * f(isBase ? -x : x, y) - raise, inCap);
        }
      }
    }
    var atlas = {
      w: AW, h: AH, k: k, texelMM: 1 / k, data: data,
      wallU: function (u) { return (u * k + 1.5) / AW; },
      wallV: function (zz) { return ((zz - ws.zLo) * k + 1.5) / AH; },
      faceU: function (xx) { return ((xx + fo.w / 2) * k + 1.5) / AW; },
      faceV: function (yy) { return ((yy + fo.h / 2) * k + wallRows + 1.5) / AH; }
    };
    atlasCache[half] = { key: key, atlas: atlas };
    return atlas;
  };

  /* The outer shell of a half: textured when asked, else the plain hull.
     `atlas` (preview, fine engine) gets the half's height atlas attached. */
  function shellFor(S, D, state, half, style, notes, preview, atlasOut) {
    var pats = texturePlan(D, state, half);
    if (!pats) return half === 'base' ? baseOuter(S, D, style) : lidOuter(S, D, style);
    var engine = CS.texEngine(state), res = CS.texResFor(state, preview);
    if (notes && !notes._tex) {
      notes._tex = true;
      var depth = CS.clamp(state.texture.depth, 0.05, 3), rz = texRaise(D, state);
      var cutIn = depth - Math.min(rz.front, rz.back, rz.left, rz.right);
      if (cutIn > D.T0 - 0.8) {
        notes.push({ level: 'warn', msg: 'Texture was limited to cutting ' + Math.max(0.05, D.T0 - 0.8).toFixed(2) +
          ' mm into the ' + D.T0.toFixed(1) + ' mm side walls, so it cannot break through. Thicker walls or more outer depth allow more.' });
      }
      if (rz.limited) {
        notes.push({ level: 'warn', msg: 'Outer depth was held at ' + Math.min(rz.front, rz.back, rz.left, rz.right).toFixed(2) +
          ' mm so the sunk texture keeps 0.8 mm of wall behind it. Thicker walls let it go deeper.' });
      }
      if ((state.texture.raise || 0) > 0 && !D.tray) {
        notes.push({ level: 'ok', msg: 'Raised texture stays cut in along the ' + D.side + ' edge' +
          (D.clasps.length && /^(snap|hook|swing)$/.test(state.clasp.type) ? ' and the ' + D.claspSide + ' edge' : '') +
          ', so it cannot rub the hinge' + (D.clasps.length && /^(snap|hook|swing)$/.test(state.clasp.type) ? ' or the clasps' : '') + '.' });
      }
      if (D.lipOn && cutIn > D.lipT - 0.6) {
        notes.push({ level: 'ok', msg: 'The texture is deeper than the lid wall beside the lip, so on the lid it starts above the lip groove.' });
      }
    }

    var shaded = preview && engine === 'fine';
    var atlas = shaded ? CS.textureAtlas(D, state, half, pats, res) : null;
    if (atlas && atlasOut) atlasOut[half] = atlas;
    var props = atlas ? { atlas: atlas } : null;

    var walls = pats.front || pats.back || pats.left || pats.right;
    var shell = walls ? texturedShell(S, D, state, half, pats, res, props)
                      : (half === 'base' ? baseOuter(S, D, style) : lidOuter(S, D, style));
    // Fine export: oversampled, so thin it out wherever the surface is flat.
    if (walls && engine === 'fine' && !preview) shell = S.k(shell.simplify(0.01));
    if (!pats.face) return shell;
    var fr = faceRelief(S, D, state, half, pats.face, res, props);
    return fr ? union(S, [sub(S, shell, fr.cut), fr.add]) : shell;
  }

  /* How far the texture's high points stand out from the wall, per side.
     0 = high points flush, pattern cut in; = depth: low points flush, pattern
     standing proud. The hinge edge, and the clasp edge when a clasp hangs
     there, stay cut in: anything proud would rub the hinge or the clasp. */
  function texRaise(D, state) {
    var T = state.texture, depth = CS.clamp(T.depth, 0.05, 3), raise = CS.clamp(T.raise || 0, -3, 3), out = {};
    var hangs = !D.tray && D.clasps.length && /^(snap|hook|swing)$/.test(state.clasp.type);
    // Negative sinks the whole pattern into the wall, but never so far that its
    // deepest point comes within 0.8 mm of the inside.
    var wallFloor = depth - Math.max(0.05, D.T0 - 0.8);
    var faceFloor = depth - Math.max(0.05, Math.min(D.bottom, D.tray ? D.bottom : D.top) - 0.8);
    ['front', 'back', 'left', 'right', 'face'].forEach(function (k) {
      var r = raise;
      // Proud texture would rub the hinge or a hanging clasp; sunk is fine.
      if ((k === D.side && !D.tray) || (k === D.claspSide && hangs)) r = Math.min(r, 0);
      out[k] = Math.max(r, k === 'face' ? faceFloor : wallFloor);
    });
    out.limited = raise < Math.min(wallFloor, faceFloor) - 1e-9;
    return out;
  }

  function signedVolume(v, t) {
    var vol = 0;
    for (var i = 0; i < t.length; i += 3) {
      var a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
      vol += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) +
             v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
    }
    return vol / 6;
  }

  /* A textured face. The flat part of the face, less the plain border, is
     cut away to just below the deepest point and replaced by a block whose
     outer side is a regular x/y grid at the textured height — in for the
     valleys, out for anything raised — so the pattern can sit in the face,
     flush with it, or stand proud of it, with a crisp edge all round.
     Returns { cut, add }, or null when there is no room. */
  function faceRelief(S, D, state, half, pattern, res, props) {
    var T = state.texture, depth = CS.clamp(T.depth, 0.05, 3), isBase = half === 'base';
    var fine = CS.texEngine(state) === 'fine';
    var sample = fine && !props ? lightFilter : filtered;
    var atlas = props && props.atlas, np = props ? NP : 3;
    var raise = texRaise(D, state).face;
    var fo = CS.faceOutline(D, half), f = CS.texSampler(pattern, T.scale, T.angle);
    var z0 = isBase ? 0 : D.zT, out = isBase ? -1 : 1;
    var inCap = Math.max(0.05, (isBase ? D.bottom : D.top) - 0.8);
    var below = Math.min(inCap, Math.max(0, depth - raise)) + 0.2;        // floor of the cut, under the surface
    var border = CS.texBorder(T, half, 'face');
    var bw = fo.w - 2 * border, bh = fo.h - 2 * border;
    if (bw < 1 || bh < 1) return null;
    var hx = fo.w / 2, hy = fo.h / 2, r = Math.min(fo.r, hx, hy);
    var nx = Math.max(2, Math.ceil(fo.w / res)), ny = Math.max(2, Math.ceil(fo.h / res));
    var zFloor = z0 - out * (below + 0.05);
    var verts = [], tris = [], disp = [];
    var id = function (i, j, surf) { return (surf ? 0 : (nx + 1) * (ny + 1)) + j * (nx + 1) + i; };
    [true, false].forEach(function (surf) {
      for (var j = 0; j <= ny; j++) for (var i = 0; i <= nx; i++) {
        var x = -hx + fo.w * i / nx, y = -hy + fo.h * j / ny, d = 0, z = zFloor;
        if (surf) {
          d = depth * sample(f, isBase ? -x : x, y, res);
          z = z0 + out * Math.max(raise - d, -inCap);
        }
        verts.push(x, y, z);
        if (props) {
          // kind 2 = lid top, 3 = underside (its atlas runs the other way round)
          if (surf && atlas) verts.push(atlas.faceU(x), atlas.faceV(y), 0, 0, out, 1, 0, 0, isBase ? 3 : 2);
          else verts.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
        }
        disp.push(d);
      }
    });
    var quad = function (a, b, c, d2) { tris.push(a, b, c, a, c, d2); };
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
      var cxm = -hx + fo.w * (i + 0.5) / nx, cym = -hy + fo.h * (j + 0.5) / ny;
      quadSplit(tris, disp, id(i, j, true), id(i + 1, j, true), id(i + 1, j + 1, true), id(i, j + 1, true),
                depth * sample(f, isBase ? -cxm : cxm, cym, res));
      quad(id(i, j, false), id(i, j + 1, false), id(i + 1, j + 1, false), id(i + 1, j, false));
    }
    for (var i2 = 0; i2 < nx; i2++) {
      quad(id(i2, 0, true), id(i2, 0, false), id(i2 + 1, 0, false), id(i2 + 1, 0, true));
      quad(id(i2, ny, true), id(i2 + 1, ny, true), id(i2 + 1, ny, false), id(i2, ny, false));
    }
    for (var j2 = 0; j2 < ny; j2++) {
      quad(id(0, j2, true), id(0, j2 + 1, true), id(0, j2 + 1, false), id(0, j2, false));
      quad(id(nx, j2, true), id(nx, j2, false), id(nx, j2 + 1, false), id(nx, j2 + 1, true));
    }
    // One consistent winding was used throughout; flip it if it came out inside-out.
    if (signedVolume(np === 3 ? verts : verts.filter(function (_, k) { return k % np < 3; }), tris) < 0) {
      for (var t = 0; t < tris.length; t += 3) { var sw = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = sw; }
    }
    var mesh = new WASM.Mesh({ numProp: np, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) });
    var block = S.k(new WASM.Manifold(mesh));
    if (block.status() !== 'NoError' || block.volume() <= 0) throw new Error('Face texture produced an invalid surface (' + block.status() + ').');
    if (fine && !props) block = S.k(block.simplify(0.01));
    var lo = z0 - out * below, hi = z0 + out * (raise + depth + 2);
    var outline = [rrect(bw, bh, Math.max(0, r - border), 0, 0, D.seg)];
    // The block reaches 0.01 mm past the cut, so it overlaps the face round
    // it instead of meeting it wall-to-wall (which leaves zero-volume slivers).
    var wider = [rrect(bw + 0.02, bh + 0.02, Math.max(0, r - border) + 0.01, 0, 0, D.seg)];
    var clipAll = prism(S, wider, Math.min(zFloor, hi) - 1, Math.max(zFloor, hi) + 1);
    return {
      cut: prism(S, outline, Math.min(lo, hi), Math.max(lo, hi)),
      add: inter(S, block, clipAll)
    };
  }

  /* ── lip sides ──────────────────────────────────────────────────── */
  /* Regions to drop the lip from, one slab per side switched off. `extra`
     pulls the base's lip ends back so they clear the lid's filled groove. */
  function lipCuts(S, D, extra) {
    var big = 1e4, edge = { x: D.IW / 2 - D.Ri - extra, y: D.IL / 2 - D.Ri - extra }, list = [];
    if (!D.lipSides.front) list.push(box(S, -big, -big, -big, big, -edge.y, big));
    if (!D.lipSides.back)  list.push(box(S, -big, edge.y, -big, big, big, big));
    if (!D.lipSides.left)  list.push(box(S, -big, -big, -big, -edge.x, big, big));
    if (!D.lipSides.right) list.push(box(S, edge.x, -big, -big, big, big, big));
    return union(S, list);
  }

  /* ── mirrored lid interior ──────────────────────────────────────── */
  /* The lid gets walls over the base's walls, stopping `gap` above the parting
     line, with a pocket over every compartment. Near the hinge the lid swings
     sideways across the lip as it opens, so the walls also keep back from the
     lip by that sweep: about lipH² / 2r for a lip at distance r from the axis. */
  function mirrorLid(S, D, state, lid, lidShell) {
    var LI = state.lidInner;
    var gap = CS.clamp(LI.gap, 0.2, Math.max(0.2, D.Ht - 0.6));
    var r = D.hinge.rk + D.hinge.c + D.T0;
    var keep = D.lipOn ? D.lipC + D.lipH * D.lipH / (2 * r) : 0.1;
    var filler = inter(S, prism(S, [interiorRing(D, keep)], D.zP + gap, D.zP + D.Ht + 0.05), lidShell);
    var pockets = D.rects.map(function (rc) {
      var s = rc.node, gTop = s._depth * D.tanP;
      var dl = D.Ht + 1;
      if (LI.depth === 'fit') {
        var up = Math.max(0, s.h - s._depth) + Math.max(0.3, state.headroom);
        dl = Math.max(gap + 0.6, up);
        if (dl > D.Ht - 0.3) dl = D.Ht + 1;
      }
      var ring = function (z, g) {
        var pts = s.shape === 'round'
          ? ellipse(rc.w / 2 + g, rc.l / 2 + g, rc.cx, rc.cy, D.seg)
          : rrect(rc.w + 2 * g, rc.l + 2 * g, Math.max(0, Math.min(state.pocket.corner, Math.min(rc.w, rc.l) / 2) + g), rc.cx, rc.cy, D.seg);
        return lift(pts, z);
      };
      // Matches the base pocket at the rim and keeps its taper going.
      return loft(S, [ring(D.zP - 1, gTop), ring(D.zP + dl, Math.max(0, gTop - dl * D.tanP))], true);
    });
    D.lidGap = gap;
    return union(S, [lid, sub(S, filler, union(S, pockets))]);
  }

  /* ── shaped pockets ─────────────────────────────────────────────── */
  /* A compartment's cut: the plain box / oval as before (it can grow to fill
     its slot), otherwise every shape of what it holds, each at its own depth,
     placed round the compartment's centre. Boxes, ovals and capsules get the
     usual corner, floor and rim rounding; a lying cylinder is a U-shaped
     trough, round at the bottom with straight sides to the rim, its axis set
     so the object rests on the compartment floor (or on the largest section's
     axis, for a stepped cylinder). */
  function sectionCut(S, D, P, r, zTop, clip) {
    var sh = r.node._shape;
    if (!sh || sh.fill) return pocket(S, D, P, r, zTop, clip);
    var seg = D.seg, out = [];
    sh.prims.forEach(function (q) {
      var depth = q._depth != null ? q._depth : r.node._depth, solid = null;
      if (q.type === 'cyl') {
        var R = q.l / 2, zf = D.zP - r.node._depth, axis = zf + (q.axis != null ? q.axis : R);
        if (q._depth != null && q.depth != null) axis = D.zP - q._depth + R;   // custom: depth to the trough bottom
        var len = q.w;
        solid = union(S, [cylX(S, -len / 2, len / 2, 0, axis, R, seg), box(S, -len / 2, -R, axis, len / 2, R, zTop)]);
      } else if (q.type === 'hex') {
        var Rh = q.w / Math.sqrt(3), hex = [];
        for (var i = 0; i < 6; i++) hex.push([Rh * Math.cos(i * Math.PI / 3), Rh * Math.sin(i * Math.PI / 3)]);
        solid = prism(S, [hex], D.zP - depth, zTop);
      } else {
        var pr = { w: q.w, l: q.l, cx: 0, cy: 0, depth: depth, node: r.node,
                   shape: q.type === 'round' ? 'round' : 'rect', corner: q.type === 'capsule' ? Math.min(q.w, q.l) / 2 : null };
        solid = pocket(S, D, P, pr, zTop, null);
      }
      if (!solid) return;
      var turned = turn(S, solid, q.rot || 0);
      out.push(move(S, turned, r.cx + q.x, r.cy + q.y, 0));
    });
    return clip ? inter(S, union(S, out), clip) : union(S, out);
  }

  /* ── hinge (canonical frame: hinge edge at +y) ──────────────────── */
  function addHinge(S, D, base, lid) {
    var hg = D.hinge;
    if (!hg.ok || !hg.segments.length) return { base: base, lid: lid };
    var Lc = D.Lc, seg = D.seg, rk = hg.rk;
    var ov = Math.max(0.4, D.T0 / 2 - D.lipC / 2 - 0.05);
    var baseBits = [], lidBits = [];

    hg.segments.forEach(function (s) {
      var cyl = cylX(S, s.x0, s.x1, hg.ya, hg.za, rk, seg);
      var strip, clipBox;
      if (s.owner === 'base') {
        strip = box(S, s.x0, Lc / 2 - ov, hg.chinBase, s.x1, Lc / 2, D.zP);
        clipBox = box(S, s.x0, Lc / 2 - ov - 1, hg.chinBase - 1, s.x1, hg.ya + rk + 1, D.zP);
      } else {
        strip = box(S, s.x0, Lc / 2 - ov, D.zP, s.x1, Lc / 2, hg.chinLid);
        clipBox = box(S, s.x0, Lc / 2 - ov - 1, D.zP, s.x1, hg.ya + rk + 1, hg.chinLid + 1);
      }
      // The hull gives the knuckle a 45° chin, so it prints without support.
      // Clipped at the parting line, or it would reach across into the other half.
      var chin = inter(S, hullOf(S, [cyl, strip]), clipBox);
      (s.owner === 'base' ? baseBits : lidBits).push(cyl, chin);
    });

    base = union(S, [base].concat(baseBits));
    lid = union(S, [lid].concat(lidBits));
    var pins = union(S, hg.groups.map(function (g) {
      return cylX(S, g.x0 - 1, g.x1 + 1, hg.ya, hg.za, hg.pinR, Math.max(16, Math.round(seg / 2)));
    }));
    return { base: sub(S, base, pins), lid: sub(S, lid, pins) };
  }

  /* ── clasps (canonical frame: clasp edge at -y) ─────────────────── */
  function addClasps(S, D, state, base, lid, lidShell, lidCav) {
    var C = state.clasp, warn = D.warnings, hooks = null;
    if (!D.clasps.length) return { base: base, lid: lid };
    var yF = -D.Lc / 2, cl = CS.clamp(C.clearance, 0.05, 0.8), seg = D.seg;
    var addB = [], cutB = [], addL = [], cutL = [];

    if (C.type === 'snap') {
      var t = CS.clamp(C.thickness, 0.8, 5), e = CS.clamp(C.catch, 0.3, 3);
      var reach = CS.clamp(C.reach, 2, Math.max(2, D.zP - D.eb - 1));
      var zb = D.zP - reach;
      var attach = CS.clamp(D.zT - D.zP - D.et - t - cl - 0.6, 1.2, 10);
      if (attach < 2.5) {
        warn.push({ level: 'warn', msg: 'The lid is shallow, so the snap tabs only grip ' + attach.toFixed(1) +
          ' mm of it. A thinner tab or a taller lid makes them sturdier.' });
      }
      var ov = Math.max(0.4, D.T0 / 2 - D.lipC / 2 - 0.05) + (attach + t + cl) * D.tanO;
      var yo = yF - cl - t, yi = yF - cl;
      var gapAt = reach * D.tanO;
      var eP = e + cl + gapAt, nf = Math.max(0.8, e);
      var zTopNub = zb + eP + nf;
      if (zTopNub + cl > D.zP - 0.8) {
        warn.push({ level: 'warn', msg: 'Snap reach is short for its catch — the slot runs up to the rim. Increase the reach.' });
      }
      if (gapAt + e + cl > D.T0 - 0.8) {
        warn.push({ level: 'bad', msg: 'The snap slots are ' + (gapAt + e + cl).toFixed(1) + ' mm deep, nearly through a ' +
          D.T0.toFixed(1) + ' mm wall. Use a smaller catch or thicker walls.' });
      }
      D.clasps.forEach(function (q) {
        var x0 = q.xc - q.w / 2, x1 = q.xc + q.w / 2;
        addL.push(box(S, x0, yo, zb, x1, yi, D.zP + attach));
        addL.push(hullOf(S, [
          box(S, x0, yo, D.zP + 0.3, x1, yF + ov, D.zP + attach),
          box(S, x0, yF - 0.01, D.zP + 0.3, x1, yF + ov, D.zP + attach + t + cl)
        ]));
        // Hook: 45° lead-in underneath, flat catch on top.
        addL.push(hullOf(S, [
          box(S, x0, yi - 0.4, zb, x1, yi, zTopNub),
          box(S, x0, yi - 0.4, zb + eP, x1, yi + eP, zTopNub)
        ]));
        if (C.grip) {
          addL.push(hullOf(S, [
            box(S, x0, yo, zb, x1, yi, zb + 2.3),
            box(S, x0, yo - 1.5, zb, x1, yo, zb + 0.8)
          ]));
        }
        cutB.push(box(S, x0 - cl, yF - 1, zb - cl, x1 + cl, yF + gapAt + e + cl, zTopNub + cl));
      });
    } else if (C.type === 'magnet') {
      var rm = C.magnetD / 2 + cl, mh = Math.max(0.5, C.magnetH);
      var ym = yF + D.T0 / 2;
      D.clasps.forEach(function (q) {
        cutB.push(cylZ(S, q.xc, ym, D.zP - mh - cl, D.zP + D.lipH + 1, rm, seg));
        if (D.lipOn) {
          // Notch the lip and fill the lid's matching groove, so the two
          // magnets meet face to face at the parting line.
          cutB.push(cylZ(S, q.xc, ym, D.zP, D.zP + D.lipH + 1, rm + 1 + cl, seg));
          var boss = cylZ(S, q.xc, ym, D.zP, D.zP + D.lipH + D.lipC + 0.4, rm + 1, seg);
          addL.push(sub(S, inter(S, boss, lidShell), lidCav));
        }
        cutL.push(cylZ(S, q.xc, ym, D.zP - 1, D.zP + mh + cl, rm, seg));
      });
    } else if (C.type === 'hook') {
      var L = D.latch, rk = L.rk, kc = L.cl;
      var ovL = Math.max(0.4, D.T0 / 2 - D.lipC / 2 - 0.05) + (L.chinLid - D.zP) * D.tanO;
      var ovB = Math.max(0.4, D.T0 / 2 - 0.05) + (D.zP - L.chinBase) * D.tanO;
      var pseg = Math.max(16, Math.round(seg / 2));
      hooks = [];
      D.clasps.forEach(function (q) {
        var wh = Math.max(4, q.w - 2 * (L.ear + kc));
        var xa = q.xc - wh / 2, xb = q.xc + wh / 2;
        var ears = [[xa - kc - L.ear, xa - kc], [xb + kc, xb + kc + L.ear]];
        ears.forEach(function (e) {
          // Lid lugs carry the pivot; base lugs the catch pin. Each gets a 45°
          // chin into its wall, like the hinge knuckles, so it prints unsupported.
          var cA = cylX(S, e[0], e[1], L.yA, L.zA, rk, seg);
          addL.push(cA, hullOf(S, [cA, box(S, e[0], yF, D.zP + kc, e[1], yF + ovL, L.chinLid)]));
          var cB = cylX(S, e[0], e[1], L.yA, L.zB, rk, seg);
          addB.push(cB, hullOf(S, [cB, box(S, e[0], yF, L.chinBase, e[1], yF + ovB, D.zP - kc)]));
        });
        var x0 = ears[0][0] - 1, x1 = ears[1][1] + 1;
        cutL.push(cylX(S, x0, x1, L.yA, L.zA, L.pinR, pseg));
        cutB.push(cylX(S, x0, x1, L.yA, L.zB, L.pinR, pseg));

        // The hook: a bar from pivot to catch, with a slot that opens towards
        // the case, so swinging it in drops the slot over the catch pin.
        var bar = hullOf(S, [cylX(S, xa, xb, L.yA, L.zA, rk, seg), cylX(S, xa, xb, L.yA, L.zB, rk, seg)]);
        var grip = box(S, xa, L.yA - rk - 2.5, L.zB - rk, xb, L.yA - rk + 0.5, L.zB - rk + 1.6);
        var hole = cylX(S, xa - 1, xb + 1, L.yA, L.zA, L.pinR + 0.1, pseg);
        var slot = hullOf(S, [cylX(S, xa - 1, xb + 1, L.yA, L.zB, L.pinR + kc, pseg),
                              cylX(S, xa - 1, xb + 1, L.yA + rk + 2, L.zB, L.pinR + kc, pseg)]);
        hooks.push(sub(S, union(S, [bar, grip]), union(S, [hole, slot])));
      });
    } else if (C.type === 'swing') {
      var W2 = sw2(S, D);
      hooks = [];
      D.clasps.forEach(function (q) {
        var g = D.swing, xp = q.xc - g.shift;
        // Pivot boss on the lid, with a blind pin hole into the wall.
        var lipHere = D.lipOn && D.lipSides[D.claspSide] && g.zA - g.rb < D.zP + D.lipH + D.lipC;
        var wallHere = lipHere ? D.T0 / 2 - D.lipC / 2 : D.T0;
        var ovL = Math.max(0.4, wallHere - 0.6) + (g.zA - D.zP) * D.tanO;
        addL.push(cylY(S, xp, g.zA, g.yH1, yF + ovL, g.rb, seg));
        cutL.push(cylY(S, xp, g.zA, g.yH0 - 1, yF + Math.max(0.4, wallHere - 0.8), g.pinR, Math.max(16, Math.round(seg / 2))));

        // Eye on the base: a block with a 45° chin, slotted by the band's own
        // annulus so the tip slides through on its arc, bridged in front.
        var ovB = Math.max(0.4, D.T0 / 2) + (D.zP - g.eyeLow) * D.tanO;
        var yOut = g.yH0 - g.cl - g.bridgeT, top = D.zP - 0.3;
        var chinLow = Math.max(g.eyeLow - g.out, D.eb + 0.4);
        var block = hullOf(S, [box(S, xp - g.h, yOut, g.eyeLow, xp + g.h, yF + ovB, top),
                               box(S, xp - g.h, yF, chinLow, xp + g.h, yF + ovB, top)]);
        var slot = W2.annulusY(xp, g.zA, g.Rt - g.wb / 2 - g.cl, g.Rt + g.wb / 2 + g.cl, g.yH0 - g.cl, g.yH1 + g.cl);
        addB.push(sub(S, block, slot));

        hooks.push(W2.hook(xp));
      });
    } else if (C.type === 'bump') {
      if (!D.lipOn || !D.lipSides[D.claspSide]) return { base: base, lid: lid };
      var rb = Math.max(0.3, Math.min(C.bumpR, D.lipT - 0.2, D.lipH / 2 - 0.2));
      var yb = yF + D.T0 / 2 + D.lipC / 2, zc = D.zP + D.lipH / 2;
      var sseg = Math.max(16, Math.round(seg / 2));
      D.clasps.forEach(function (q) {
        var half = Math.max(0, q.w / 2 - rb);
        addB.push(hullOf(S, [sphere(S, q.xc - half, yb, zc, rb, sseg), sphere(S, q.xc + half, yb, zc, rb, sseg)]));
        cutL.push(hullOf(S, [sphere(S, q.xc - half, yb, zc, rb + cl, sseg), sphere(S, q.xc + half, yb, zc, rb + cl, sseg)]));
      });
    }

    base = sub(S, union(S, [base].concat(addB)), union(S, cutB));
    lid = sub(S, union(S, [lid].concat(addL)), union(S, cutL));
    return { base: base, lid: lid, hooks: hooks };
  }

  /* ── the whole model ────────────────────────────────────────────── */
  CS.buildModel = function (state, opts) {
    if (!WASM) throw new Error('The geometry engine is still loading.');
    opts = opts || {};
    var D = CS.describe(state);
    var P = state.pocket, style = state.outer.edgeStyle;
    var S = new Scope();
    var parts = [], warnings0 = [];

    try {
      var zTop = D.zP + D.lipH + 2;
      var interiorPrism = prism(S, [interiorRing(D)], D.zP - D.Hb - 2, D.zT + 2);

      /* Base: shell (textured, if asked) + lip, minus pockets and notches. */
      var atlases = {};
      var base = shellFor(S, D, state, 'base', style, warnings0, opts.preview, atlases);
      if (D.lipOn) {
        var b = D.T0 / 2 + D.lipC / 2;
        // Starts inside the wall, not on its top face: a union of two coincident
        // faces (worse on a textured, refined shell) leaves zero-volume specks.
        var lipRing = prism(S, [rrect(D.W - 2 * b, D.L - 2 * b, Math.max(0, D.R - b), 0, 0, D.seg),
                                interiorRing(D).slice().reverse()], D.zP - 0.2, D.zP + D.lipH);
        // Sides without a lip end a clearance short of the lid's filled groove.
        base = union(S, [base, sub(S, lipRing, lipCuts(S, D, D.lipC))]);
      }
      var cuts = D.rects.map(function (r) { return sectionCut(S, D, P, r, zTop, interiorPrism); });

      if (D.notches.length) {
        var keepIn = 1 + D.grow;
        var notchClip = prism(S, [rrect(D.W - 2 * keepIn, D.L - 2 * keepIn, Math.max(0, D.R - keepIn), 0, 0, D.seg)],
                              D.bottom, zTop + 1);
        var nseg = Math.max(16, Math.round(D.seg * 0.75));
        D.notches.forEach(function (n) {
          var zc = D.zP - n.depth + n.r;
          var cap = sphere(S, n.x, n.y, Math.min(zc, zTop - 0.5), n.r, nseg);
          var shaft = cylZ(S, n.x, n.y, Math.min(zc, zTop - 0.5), zTop, n.r, nseg);
          cuts.push(inter(S, hullOf(S, [cap, shaft]), notchClip));
        });
      }
      base = sub(S, base, union(S, cuts));
      if (D.grid) base = union(S, [base, gridFeet(S, D)]);

      /* Lid: shell minus its open interior and the groove the lip slides into.
         A tray has none. */
      var lid = null, lidShell = null, lidCav = null;
      if (!D.tray) {
        lidShell = shellFor(S, D, state, 'lid', style, warnings0, opts.preview, atlases);
        lidCav = loft(S, [lift(interiorRing(D), D.zP - 1), lift(interiorRing(D, D.Ht * D.tanO), D.zP + D.Ht)], true);
        lid = sub(S, lidShell, lidCav);
        if (D.lipOn) {
          var a = D.T0 / 2 - D.lipC / 2;
          var groove = prism(S, [rrect(D.W - 2 * a, D.L - 2 * a, Math.max(0, D.R - a), 0, 0, D.seg)],
                             D.zP - 1, D.zP + D.lipH + D.lipC);
          lid = sub(S, lid, sub(S, groove, lipCuts(S, D, 0)));
        }
        if (state.lidInner && state.lidInner.mode === 'mirror') lid = mirrorLid(S, D, state, lid, lidShell);
      }

      /* Into the canonical frame for the hinge and clasps, then back. */
      var th = D.theta;
      var cb = turn(S, base, th), cl = turn(S, lid, th);
      var hinged = addHinge(S, D, cb, cl);
      var clasped = addClasps(S, D, state, hinged.base, hinged.lid, turn(S, lidShell, th), turn(S, lidCav, th));
      base = turn(S, clasped.base, -th);
      lid = turn(S, clasped.lid, -th);
      D.latchBoxes = (clasped.hooks || []).map(function (h) { return h.boundingBox(); });
      var hooks = (clasped.hooks || []).map(function (h) { return turn(S, h, -th); });

      /* Decoration on the two outside faces. */
      var decor = opts.decor === false || typeof document === 'undefined'
        ? { base: base, lid: lid, parts: [], info: {} }
        : decorate(S, D, state, base, lid, opts.ppmm || CS.qualityOf(state).ppmm, opts.maxCells || 9e6);
      base = decor.base; lid = decor.lid;

      parts.push(toPart(base, 'base', 'Base', state.colors.base, 'base'));
      base = solidOnly(S, base);
      lid = lid && solidOnly(S, lid);
      if (lid) parts.push(toPart(lid, 'lid', 'Lid', state.colors.lid, 'lid'));
      decor.parts.forEach(function (p) { parts.push(toPart(p.m, p.key, p.label, p.color, p.half)); });
      hooks.forEach(function (h, i) {
        var part = toPart(h, 'latch' + (i + 1), 'Latch hook ' + (i + 1), state.colors.lid, 'latch');
        part.latch = i;
        parts.push(part);
      });
      if (hooks.length) {
        warnings0.push({ level: 'ok', msg: state.clasp.type === 'swing'
          ? 'Each swing hook prints flat as its own piece. Pin it to the boss on the lid with 1.75 mm filament through ' +
            'its hub, melt the pin head over, then turn it to thread the tip through the eye on the base.'
          : 'Each latch is three pieces: lugs on the case, plus a separate hook printed on its side. ' +
            'Pin the hook to the lid lugs and fit a catch pin through the base lugs — both 1.75 mm filament.' });
      }
      parts = parts.filter(function (p) { return p.indices.length; });

      var warnings = D.warnings.concat(decor.warnings || []).concat(checks(D, state, decor.info)).concat(warnings0);
      var tris = 0, vol = 0;
      parts.forEach(function (p) { tris += p.indices.length / 3; vol += p.volume; });
      var colours = {};
      parts.forEach(function (p) { colours[p.colorIndex] = 1; });

      return {
        parts: parts, D: D, warnings: warnings, atlas: atlases,
        stats: { tris: tris, vol: vol, w: D.W, l: D.L, h: D.zT + (D.grid ? D.grid.foot : 0),
                 colors: Object.keys(colours).length,
                 base: D.zP, lid: D.zT - D.zP }
      };
    } finally {
      S.free();
    }
  };

  /* Drop any zero-volume flakes a boolean left behind, so each body exports
     as one clean solid. */
  function solidOnly(S, m) {
    var bits = m.decompose();
    bits.forEach(function (b) { S.k(b); });
    if (bits.length <= 1) return m;
    var keep = bits.filter(function (b) { return b.volume() > 1e-3; });
    return keep.length === bits.length ? m : S.k(api().compose(keep));
  }

  function toPart(m, key, label, color, half) {
    var mesh = m.getMesh();
    var np = mesh.numProp, vp = mesh.vertProperties, nv = vp.length / np;
    var pos = new Float32Array(nv * 3), tex = np >= NP ? new Float32Array(nv * 9) : null;
    for (var i = 0; i < nv; i++) {
      pos[i * 3] = vp[i * np]; pos[i * 3 + 1] = vp[i * np + 1]; pos[i * 3 + 2] = vp[i * np + 2];
      if (tex) for (var q = 0; q < 9; q++) tex[i * 9 + q] = vp[i * np + 3 + q];
    }
    return {
      key: key, label: label, half: half,
      colorIndex: (color || '#000000').toUpperCase(), color: color,
      positions: pos, indices: new Uint32Array(mesh.triVerts), tex: tex,
      volume: m.volume(), status: m.status()
    };
  }

  /* ── decoration ─────────────────────────────────────────────────── */
  /* Lid top and base underside, each with its own relief style. Colour regions
     are made exclusive first in 2-D (topmost wins, as in the planner) and again
     as solids, so no two filaments ever claim the same space. */
  function decorate(S, D, state, base, lid, ppmm, maxCells) {
    var out = { base: base, lid: lid, parts: [], warnings: [], info: {} };
    var NAME = { border: 'Border', text: 'Text', art: 'Picture' };

    ['lid', 'base'].forEach(function (which) {
      var face = state.faces[which];
      if (!face.enabled) return;
      if (which === 'lid' && D.tray) return;
      if (which === 'base' && D.grid) {
        out.warnings.push({ level: 'warn', msg: 'The base underside is covered by Gridfinity feet, so its decoration is left off.' });
        return;
      }
      var fo = CS.faceOutline(D, which);
      var wallT = which === 'lid' ? D.top : D.bottom;
      var rel = CS.faceRelief(state, face, wallT);
      var cells = (D.W + 8) * (D.L + 8) * ppmm * ppmm;
      var pp = cells > maxCells ? Math.max(4, ppmm * Math.sqrt(maxCells / cells)) : ppmm;
      var g = CS.makeGrid(D.W, D.L, pp);
      var F = CS.faceElements(face, fo, g, which === 'base');
      out.info[which] = { F: F, rel: rel, grid: g };
      if (!F.list.length) return;

      var copts = { eps: 0.55 / g.ppmm, minArea: 0.03 };
      var top = which === 'lid' ? D.zT : 0;
      var dirn = which === 'lid' ? 1 : -1;
      var d = rel.depth;
      var span = rel.style === 'raised'
        ? (dirn > 0 ? [top, top + d] : [top - d, top])
        : (dirn > 0 ? [top - d, top] : [top, top + d]);

      var solids = F.list.map(function (e) {
        var rings = [];
        CS.contours(e.mask, g, copts).forEach(function (poly) {
          rings.push(poly.outer.map(function (p) { return [p.x, p.y]; }));
          poly.holes.forEach(function (h) { rings.push(h.map(function (p) { return [p.x, p.y]; })); });
        });
        if (!rings.length) return null;
        return { e: e, rings: rings, m: prism(S, rings, span[0], span[1]) };
      }).filter(function (x) { return x && x.m; });

      // Topmost wins, now exactly.
      var above = null;
      for (var i = solids.length - 1; i >= 0; i--) {
        var full = solids[i].m;
        solids[i].m = sub(S, full, above);
        above = above ? union(S, [above, full]) : full;
      }

      if (rel.style !== 'raised') {
        var ext = which === 'lid' ? [top - d, top + 1] : [top - 1, top + d];
        var recess = union(S, solids.map(function (s) { return prism(S, s.rings, ext[0], ext[1]); }));
        if (which === 'lid') out.lid = sub(S, out.lid, recess);
        else out.base = sub(S, out.base, recess);
      }
      if (rel.style === 'engraved') return;

      solids.forEach(function (s) {
        var e = s.e, n = e.kind === 'border' ? '' : ' ' + (e.index + 1);
        out.parts.push({
          m: s.m, half: which, color: e.color,
          key: e.kind + (e.kind === 'border' ? '' : (e.index + 1)) + '-' + which,
          label: NAME[e.kind] + n + ' (' + (which === 'lid' ? 'lid' : 'base') + ')'
        });
      });
    });
    return out;
  }

  /* The flat part of each decorated face: the outline at that height, inset by
     the edge rounding and by the taper. */
  CS.faceOutline = function (D, which) {
    var inset = which === 'lid' ? D.et + (D.zT - D.zP) * D.tanO : D.eb + D.zP * D.tanO;
    return { w: D.W - 2 * inset, h: D.L - 2 * inset, r: Math.max(0, D.R - inset), inset: inset,
             fullW: D.W, fullH: D.L };
  };

  /* ── printability checks ────────────────────────────────────────── */
  function checks(D, state, info) {
    var warn = [];
    var lh = D.lh, min = CS.minDepthOf(state);

    if (D.inner < 1.2) {
      warn.push({ level: 'warn', msg: 'Inner walls of ' + D.inner.toFixed(2) + ' mm are under three 0.4 mm lines; 1.2 mm or more prints cleanly.' });
    }
    if (state.walls.side < 1.6) {
      warn.push({ level: 'warn', msg: 'Side walls under 1.6 mm make a flimsy case, and leave no room for the lip or clasps.' });
    }
    if (D.bottom < 1.2 || (!D.tray && D.top < 1.2)) {
      warn.push({ level: 'warn', msg: 'A floor or lid top under 1.2 mm is thin enough to flex and show the infill through it.' });
    }
    if (state.pocket.taper > 0 && D.depthMax > 0) {
      warn.push({ level: 'ok', msg: 'Pockets widen by ' + (D.depthMax * D.tanP).toFixed(2) +
        ' mm per side towards the rim; inner walls were spaced to keep their minimum at the top.' });
    }

    ['lid', 'base'].forEach(function (which) {
      var face = state.faces[which], i = info[which];
      if (!face.enabled || !i) return;
      var tag = which === 'lid' ? 'the lid top' : 'the base underside';
      if (i.F.list.length && i.rel.style === 'raised') {
        warn.push({ level: 'warn', msg: 'Raised detail on ' + tag + ' ends up against the print bed, so the ' +
          (which === 'lid' ? 'lid' : 'case') + ' would rest on it. Inlay or engraved prints flat.' });
      }
      if (i.rel.style !== 'raised' && i.rel.snap.tooThin) {
        warn.push({ level: 'bad', msg: 'The ' + (which === 'lid' ? 'lid top' : 'floor') + ' is too thin for a ' + CS.MIN_LAYERS +
          '-layer ' + i.rel.style + ' with a floor behind it. Make it at least ' + (min * 2).toFixed(1) + ' mm.' });
      }
      if (i.F.list.length) {
        var thin = CS.maxInscribed(i.F.all, i.grid) * 2;
        if (thin > 0 && thin < 0.8) {
          warn.push({ level: 'warn', msg: 'Thinnest detail on ' + tag + ' is about ' + thin.toFixed(2) +
            ' mm wide — under two 0.4 mm lines. Try a bolder font or a thicker border.' });
        }
      }
      i.F.raw.forEach(function (r) {
        var live = i.F.list.filter(function (e) { return e.kind === r.kind && e.index === r.index; })[0];
        var what = r.kind === 'text' ? 'Text ' + (r.index + 1) : r.kind === 'art' ? 'Picture ' + (r.index + 1) : 'The border';
        if (!live) {
          if (r.kind !== 'border') warn.push({ level: 'bad', msg: what + ' on ' + tag + ' sits off the flat face, or is hidden behind something on top of it.' });
        } else if (CS.mask.area(live.mask, i.grid) < CS.mask.area(r.mask, i.grid) * 0.97) {
          warn.push({ level: 'warn', msg: what + ' on ' + tag + ' is partly clipped by the edge rounding or an element above it.' });
        }
      });
    });

    var colours = CS.coloursUsed(state).length;
    if (colours > 1) {
      warn.push({ level: 'ok', msg: colours + ' colours. Base and lid are separate objects, so they can simply be printed in ' +
        'different filaments; decoration colours need a multi-material printer (AMS / CFS / MMU).' });
    }
    warn.push({ level: 'ok', msg: 'Every height is a whole number of ' + lh.toFixed(2) + ' mm layers: ' +
      (D.tray ? 'tray ' + D.zP.toFixed(2) + ' mm' : 'base ' + D.zP.toFixed(2) + ' mm, lid ' + (D.zT - D.zP).toFixed(2) + ' mm') +
      '. Set the same layer height in your slicer.' });
    return warn;
  }

  /* ── posing: closed, open, and laid out for printing ─────────────── */
  /* Rotation of point p about the hinge axis by `deg` (positive opens). */
  function axisRot(A, deg) {
    var a = -deg * DEG, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    var x = A.d[0], y = A.d[1], z = A.d[2];
    var m = [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
             t * x * y + s * z, t * y * y + c, t * y * z - s * x,
             t * x * z - s * y, t * y * z + s * x, t * z * z + c];
    return function (px, py, pz) {
      var dx = px - A.p[0], dy = py - A.p[1], dz = pz - A.p[2];
      return [A.p[0] + m[0] * dx + m[1] * dy + m[2] * dz,
              A.p[1] + m[3] * dx + m[4] * dy + m[5] * dz,
              A.p[2] + m[6] * dx + m[7] * dy + m[8] * dz];
    };
  }

  /* Returns a function mapping (x, y, z) of a part to where it is shown.
     The base never moves; the lid swings about the hinge. For printing it
     swings the full 180°, comes down onto the bed beside the base and steps
     away from it, so the pair lies like an opened clamshell. */
  CS.poseFor = function (D, who, mode, angle) {
    var half = typeof who === 'string' ? who : who.half;
    if (half === 'latch' && mode === 'print') return latchPrint(D, who.latch || 0);
    if ((half !== 'lid' && half !== 'latch') || mode === 'closed') return null;
    if (mode === 'open') return axisRot(D.axis, angle == null ? 105 : angle);
    var rot = axisRot(D.axis, 180);
    var lift_ = D.zT - 2 * D.zP, sep = 8;
    return function (x, y, z) {
      var q = rot(x, y, z);
      return [q[0] + D.axis.n[0] * sep, q[1] + D.axis.n[1] * sep, q[2] + lift_];
    };
  };

  /* A latch hook lies on its side for printing, out in front of the clasp
     edge: turned a quarter about the line across it, so its long axis stands
     up and its profile lies flat on the bed. */
  function latchPrint(D, i) {
    var B = (D.latchBoxes || [])[i];
    if (!B) return null;
    var cc = [(B.min[0] + B.max[0]) / 2, (B.min[1] + B.max[1]) / 2, (B.min[2] + B.max[2]) / 2];
    var ext = [B.max[0] - B.min[0], B.max[1] - B.min[1], B.max[2] - B.min[2]];
    var c2 = rotPt(cc[0], cc[1], -D.theta), d = rotPt(1, 0, -D.theta), n = rotPt(0, 1, -D.theta);
    var c = [c2[0], c2[1], cc[2]];
    // A hook latch stands its long axis (x) up; a swing hook lays its thin
    // axis (y) down. Either way the profile ends up flat on the bed.
    var flat = D.claspType === 'swing';
    var a = flat ? [d[0], d[1], 0] : [d[1], -d[0], 0];
    var up = flat ? ext[1] : ext[0];
    var out = 8 + Math.max(ext[0], ext[1], ext[2]) / 2 + ext[1];
    var T = [c[0] - n[0] * out, c[1] - n[1] * out, up / 2];
    return function (x, y, z) {
      var v = [x - c[0], y - c[1], z - c[2]];
      var ad = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
      var cx = a[1] * v[2] - a[2] * v[1], cy = a[2] * v[0] - a[0] * v[2], cz = a[0] * v[1] - a[1] * v[0];
      return [T[0] + cx + a[0] * ad, T[1] + cy + a[1] * ad, T[2] + cz + a[2] * ad];
    };
  }

  /* Bake a pose into a copy of a part's positions. */
  CS.posed = function (part, fn) {
    if (!fn) return part;
    var p = part.positions, out = new Float32Array(p.length);
    for (var i = 0; i < p.length; i += 3) {
      var q = fn(p[i], p[i + 1], p[i + 2]);
      out[i] = q[0]; out[i + 1] = q[1]; out[i + 2] = q[2];
    }
    return Object.assign({}, part, { positions: out });
  };

  /* Parts as they should sit on the print bed. */
  CS.printLayout = function (model) {
    return model.parts.map(function (p) {
      return CS.posed(p, CS.poseFor(model.D, p, 'print'));
    });
  };

})(window.CS);
