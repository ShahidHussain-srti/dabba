/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* layout.js — the compartment tree, and every dimension that follows from it.
 *
 * Compartments are leaves of a guillotine tree: a split lines its children up
 * along x (left → right) or y (back → front), with one inner wall between
 * neighbours. Sizes flow upwards from the objects — nobody types in a box
 * size — and placement flows back down.
 *
 * Neighbours rarely match. Where one object is smaller than the row it sits
 * in, its cavity stays object-sized and the wall around it grows to fill the
 * slack, so the thinnest wall anywhere is exactly the inner-wall setting.
 * `stretch` opts a compartment out of that and lets its cavity grow instead.
 */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  var L = CS.layout = {};

  /* ── tree walking ───────────────────────────────────────────────── */
  L.sections = function (node, out) {
    out = out || [];
    if (!node) return out;
    if (node.kind === 'section') out.push(node);
    else node.children.forEach(function (c) { L.sections(c, out); });
    return out;
  };

  L.find = function (root, id) {
    var hit = null;
    (function walk(n, parent, index) {
      if (hit || !n) return;
      if (n.id === id) { hit = { node: n, parent: parent, index: index }; return; }
      if (n.kind === 'split') n.children.forEach(function (c, i) { walk(c, n, i); });
    })(root, null, -1);
    return hit;
  };

  var AXIS = { left: 'x', right: 'x', back: 'y', front: 'y' };
  var BEFORE = { left: true, back: true, right: false, front: false };

  /* Put a new compartment beside `id`. Joins the existing row when it runs the
     same way, otherwise wraps the two in a new split. Returns the new root. */
  L.addNeighbor = function (root, id, side) {
    var hit = L.find(root, id);
    if (!hit || hit.node.kind !== 'section') return { root: root, id: null };
    var s = hit.node, dir = AXIS[side];
    var fresh = CS.newSection({ w: s.w, l: s.l, h: s.h, shape: s.shape, pocket: Object.assign({}, s.pocket) });

    if (hit.parent && hit.parent.dir === dir) {
      hit.parent.children.splice(hit.index + (BEFORE[side] ? 0 : 1), 0, fresh);
      return { root: root, id: fresh.id };
    }
    var pair = CS.newSplit(dir, BEFORE[side] ? [fresh, s] : [s, fresh]);
    if (!hit.parent) return { root: pair, id: fresh.id };
    hit.parent.children[hit.index] = pair;
    return { root: root, id: fresh.id };
  };

  /* Put a new compartment along a whole side of the case: first or last in
     the top-level row when that row runs the same way, otherwise beside
     everything that's there now. `like` is copied for its size. */
  L.addAtSide = function (root, side, like) {
    var dir = AXIS[side];
    var fresh = CS.newSection(like ? { w: like.w, l: like.l, h: like.h, shape: like.shape,
                                       pocket: Object.assign({}, like.pocket) } : {});
    if (root.kind === 'split' && root.dir === dir) {
      if (BEFORE[side]) root.children.unshift(fresh); else root.children.push(fresh);
      return { root: root, id: fresh.id };
    }
    return { root: CS.newSplit(dir, BEFORE[side] ? [fresh, root] : [root, fresh]), id: fresh.id };
  };

  /* Switch one axis of a compartment to a custom position without it
     moving: from then on dx / dy is measured from the middle of its slot.
     `r` is its rect as last laid out. Returns how far the offset's zero moved,
     for a drag in progress. A filled axis keeps the size it had. */
  L.toCustom = function (s, r, axis) {
    var k = axis === 'x' ? 'alignX' : 'alignY', d = axis === 'x' ? 'dx' : 'dy';
    if (s[k] === 'custom' || !r) return 0;
    if (s[k] === 'stretch' && s._size && s._shape && s._shape.fill) {
      if (axis === 'x') s.w = Math.round(s._size.w * 10) / 10; else s.l = Math.round(s._size.l * 10) / 10;
      if (s._fill) s._fill[axis] = false;
    }
    var mid = axis === 'x' ? (r.slot.x0 + r.slot.x1) / 2 : (r.slot.y0 + r.slot.y1) / 2;
    var off = CS.tidy((axis === 'x' ? r.cx : r.cy) - mid), shift = off - (r[d] || 0);
    s[k] = 'custom';
    s[d] = off;
    return shift;
  };

  L.remove = function (root, id) {
    if (L.sections(root).length <= 1) return root;
    var hit = L.find(root, id);
    if (!hit || !hit.parent) return root;
    hit.parent.children.splice(hit.index, 1);
    return L.normalize(root);
  };

  /* Swap a compartment with its neighbour in the same row. */
  L.move = function (root, id, delta) {
    var hit = L.find(root, id);
    if (!hit || !hit.parent) return false;
    var arr = hit.parent.children, j = hit.index + delta;
    if (j < 0 || j >= arr.length) return false;
    var t = arr[j]; arr[j] = arr[hit.index]; arr[hit.index] = t;
    return true;
  };

  /* Collapse one-child splits and flatten a split nested in one running the
     same way, so the tree stays as shallow as the layout it describes. */
  L.normalize = function (node) {
    if (!node || node.kind !== 'split') return node;
    var kids = [];
    node.children.forEach(function (c) {
      c = L.normalize(c);
      if (!c) return;
      if (c.kind === 'split' && c.dir === node.dir) kids.push.apply(kids, c.children);
      else kids.push(c);
    });
    node.children = kids;
    if (!kids.length) return null;
    if (kids.length === 1) return kids[0];
    return node;
  };

  /* ── dimensions ─────────────────────────────────────────────────── */
  /* Everything with a height snaps to whole layers, so the parting line, floors
     and rim all fall on slice boundaries and nothing asks for a partial layer. */
  CS.resolve = function (state) {
    var lh = CS.layerHeightOf(state);
    var snap = function (v, mode) { return CS.snapLayers(state, v, mode); };
    var secs = L.sections(state.layout);
    var Wl = state.walls, O = state.outer, P = state.pocket;
    var warn = [];

    var fit = Math.max(0, state.fit);
    var hmax = 0, held = 0;
    // What each compartment holds, as pocket shapes (items.js).
    secs.forEach(function (s) {
      if (!s.item) s.item = s.shape === 'round' ? 'round' : 'box';
      s._shape = CS.itemShape(s, fit);
      if (s._shape.h > hmax) hmax = s._shape.h;
      // Shapes held at their own depth (standing batteries, bits) stand that
      // much higher out of the base, into the lid.
      s._shape.prims.forEach(function (q) {
        if (q.depth != null && isFinite(q.depth)) held = Math.max(held, s._shape.h - Math.max(lh, q.depth));
      });
    });

    var tray0 = state.build === 'tray', room = Math.max(0, state.headroom);
    var autoHi = snap(Math.max(hmax + room, tray0 || !held ? 0 : (held + room) / Math.max(0.15, 1 - state.split)), 'up');
    var Hi = state.interior.auto ? autoHi : snap(Math.max(state.interior.height, lh * 4));
    if (!state.interior.auto && Hi < autoHi - 1e-6) {
      warn.push({ level: 'warn', msg: 'The interior is ' + Hi.toFixed(1) + ' mm tall but the tallest object needs ' +
        autoHi.toFixed(1) + ' mm with headroom — the lid will not close over it.' });
    }

    // A tray is the base on its own: the whole interior is in it.
    var tray = state.build === 'tray';
    var Hb = tray ? Hi : WB.clamp(snap(Hi * state.split), lh * 2, Hi - lh * 2);
    var Ht = CS.tidy(Hi - Hb);
    var bottom = snap(Math.max(Wl.bottom, lh * 2), 'up');
    var top = tray ? 0 : snap(Math.max(Wl.top, lh * 2), 'up');
    var zP = CS.tidy(bottom + Hb), zT = CS.tidy(zP + Ht + top);

    // Each pocket has its own shape; anything missing falls back to the defaults.
    secs.forEach(function (s) {
      s._P = Object.assign({}, P, s.pocket || {});
      s._tanP = Math.tan(WB.clamp(+s._P.taper || 0, 0, 20) * Math.PI / 180);
    });
    var tanP = Math.max.apply(null, secs.map(function (s) { return s._tanP; }).concat([0]));
    var depthMax = 0;
    secs.forEach(function (s) {
      var d;
      var sh = s._shape;
      if (s.depth != null && isFinite(s.depth)) d = WB.clamp(snap(s.depth), lh, Hb);
      else if (state.seat === 'flush') d = Math.min(snap(sh.h), Hb);
      else d = Hb;
      s._depth = CS.tidy(d);
      // Shapes with their own hold depth (bits, standing batteries) may go no
      // deeper than the base allows.
      sh.prims.forEach(function (q) {
        q._depth = q.depth != null && isFinite(q.depth) ? WB.clamp(snap(q.depth), lh, Hb) : s._depth;
        if (q._depth > depthMax) depthMax = q._depth;
      });
      s._margin = s._depth * s._tanP;       // the taper widens the cavity this much at the rim
      s._cw = sh.w;
      s._cl = sh.l;
      if (s._depth > depthMax) depthMax = s._depth;
      // How far the object rises above the rim, held at its shallowest shape.
      var stickUp = sh.h - (sh.prims.length ? Math.min.apply(null, sh.prims.map(function (q) { return q._depth; })) : s._depth);
      s._stickUp = stickUp;
      if (tray && stickUp > 0.05) {
        warn.push({ level: 'warn', msg: label(s, secs) + ' stands ' + stickUp.toFixed(1) + ' mm above the rim of the tray.' });
      } else if (!tray && stickUp > Ht - 0.1 + 1e-6) {
        warn.push({ level: 'bad', msg: label(s, secs) + ' stands ' + stickUp.toFixed(1) + ' mm above its pocket but the lid only has ' +
          Ht.toFixed(1) + ' mm of room. Deepen the pocket or give the lid a bigger share.' });
      }
    });

    var inner = Math.max(0.4, Wl.inner);
    var root = state.layout;
    measure(root, inner);
    var IW = root._m.w, IL = root._m.l;

    /* An outer taper leans the walls in towards the top and bottom, so the wall
       is thinnest at the deepest pocket floor. Grow the box until that point is
       still a full side wall thick. Gridfinity bins stand straight. */
    var gf = state.gridfinity && state.gridfinity.enabled;
    var tanO = gf ? 0 : Math.tan(WB.clamp(O.taper, 0, 15) * Math.PI / 180);
    var grow = depthMax * tanO;
    var T0 = Math.max(0.8, Wl.side) + grow;     // wall thickness at the parting line
    var W = IW + 2 * T0, Ld = IL + 2 * T0;

    /* Gridfinity: the footprint rounds up to whole 42 mm units, less the 0.5 mm
       the standard leaves between bins. The extra goes to the layout as slack,
       so it thickens walls — or grows any compartment set to Fill. */
    var grid = null;
    if (gf) {
      var nx = Math.max(1, Math.ceil((W + 0.5) / 42 - 1e-9)), ny = Math.max(1, Math.ceil((Ld + 0.5) / 42 - 1e-9));
      W = nx * 42 - 0.5; Ld = ny * 42 - 0.5;
      IW = W - 2 * T0; IL = Ld - 2 * T0;
      grid = { nx: nx, ny: ny, foot: 4.75, magnets: !!state.gridfinity.magnets };
      if (O.taper > 0 || O.edgeBottom > 0) {
        warn.push({ level: 'ok', msg: 'Gridfinity bins stand straight on flat feet, so the outer taper and base edge rounding are off.' });
      }
    }
    var rects = [];
    place(root, -IW / 2, IL / 2, IW, IL, inner, rects);

    /* A compartment dragged in the plan keeps its place in the layout and
       sits dx, dy off it. It may overlap its neighbours (the pockets merge)
       but stays inside the outer wall, measured at the rim where the taper
       makes it widest. The allowed range rides along for the plan. */
    rects.forEach(function (r) {
      // The object size it ends up with: what was asked for, or with Fill,
      // whatever its slot gives it.
      // Only boxes and ovals grow with Fill; other shapes keep their own size.
      var grows = r.node._shape && r.node._shape.fill;
      r.node._size = grows ? { w: CS.tidy(r.w - 2 * fit), l: CS.tidy(r.l - 2 * fit) } : { w: r.node.w, l: r.node.l };
      r.node._fill = { x: r.node.alignX === 'stretch', y: r.node.alignY === 'stretch' };
      var m = r.node._margin || 0;
      var xr = [-IW / 2 + m - r.x0, IW / 2 - m - r.x1], yr = [-IL / 2 + m - r.y0, IL / 2 - m - r.y1];
      xr = [Math.min(xr[0], 0), Math.max(xr[1], 0)];
      yr = [Math.min(yr[0], 0), Math.max(yr[1], 0)];
      var dx = WB.clamp(+r.node.dx || 0, xr[0], xr[1]), dy = WB.clamp(+r.node.dy || 0, yr[0], yr[1]);
      r.x0 += dx; r.x1 += dx; r.cx += dx;
      r.y0 += dy; r.y1 += dy; r.cy += dy;
      r.dx = dx; r.dy = dy;
      r.range = { x: xr, y: yr };
    });

    var R = WB.clamp(O.corner, 0, Math.min(W, Ld) / 2 - 0.01);
    var eb = gf ? 0 : WB.clamp(O.edgeBottom, 0, Math.min(zP * 0.5, 2 * Math.min(bottom, T0)));
    var et = tray ? 0 : WB.clamp(O.edgeTop, 0, Math.min((zT - zP) * 0.5, 2 * Math.min(top, T0)));
    if ((!gf && O.edgeBottom > eb + 1e-6) || (!tray && O.edgeTop > et + 1e-6)) {
      warn.push({ level: 'warn', msg: 'Edge rounding was limited to ' + eb.toFixed(1) + ' mm (base) / ' + et.toFixed(1) +
        ' mm (lid) so it cannot break through the walls. Thicker walls allow more.' });
    }

    var ls = state.lip.sides || {};
    var lipSides = { back: ls.back !== false, front: ls.front !== false, left: ls.left !== false, right: ls.right !== false };
    var lipOn = !tray && !!state.lip.enabled && (lipSides.back || lipSides.front || lipSides.left || lipSides.right);
    var lipC = WB.clamp(state.lip.clearance, 0, 0.8);
    var lipH = lipOn ? WB.clamp(snap(state.lip.height), lh * 2, Math.max(lh * 2, Ht - lipC - lh)) : 0;
    var lipT = T0 / 2 - lipC / 2;
    if (lipOn && lipT < 0.8) {
      warn.push({ level: 'bad', msg: 'The alignment lip is only ' + lipT.toFixed(2) + ' mm thick. Use side walls of at least ' +
        (1.6 + lipC).toFixed(1) + ' mm, or switch the lip off.' });
    } else if (lipOn && lipT < 1.0) {
      warn.push({ level: 'warn', msg: 'The alignment lip and the lid skirt are ' + lipT.toFixed(2) +
        ' mm each — about two perimeters. 2.4 mm side walls or more make both sturdier.' });
    }

    return {
      lh: lh, fit: fit, Hi: Hi, Hb: Hb, Ht: Ht, bottom: bottom, top: top,
      zP: zP, zT: zT, IW: IW, IL: IL, W: W, L: Ld, T0: T0, grow: grow,
      R: R, Ri: Math.max(0, R - T0), eb: eb, et: et, tanO: tanO, tanP: tanP,
      inner: inner, rects: rects, dividers: rects.walls || [], sections: secs, depthMax: depthMax, tray: tray, grid: grid,
      lipOn: lipOn, lipSides: lipSides, lipH: lipH, lipC: lipC, lipT: lipT, warnings: warn
    };
  };

  function label(s, secs) {
    return s.name ? '"' + s.name + '"' : 'Compartment ' + (secs.indexOf(s) + 1);
  }
  L.label = label;

  function measure(n, inner) {
    if (n.kind === 'section') {
      n._m = { w: n._cw + 2 * n._margin, l: n._cl + 2 * n._margin };
      return n._m;
    }
    var w = 0, l = 0;
    n.children.forEach(function (c, i) {
      var m = measure(c, inner);
      if (n.dir === 'x') { w += m.w + (i ? inner : 0); l = Math.max(l, m.l); }
      else { l += m.l + (i ? inner : 0); w = Math.max(w, m.w); }
    });
    n._m = { w: w, l: l };
    return n._m;
  }

  function offset(align, slot, size) {
    if (align === 'start') return 0;
    if (align === 'end') return slot - size;
    return (slot - size) / 2;
  }

  /* Region: x ∈ [x0, x0+sw], y ∈ [y0-sl, y0] — y0 is the back edge. */
  function place(n, x0, y0, sw, sl, inner, out) {
    if (n.kind === 'section') {
      var fw = n.alignX === 'stretch' ? sw : n._m.w;
      var fl = n.alignY === 'stretch' ? sl : n._m.l;
      var ox = offset(n.alignX, sw, fw), oy = offset(n.alignY, sl, fl);
      var m = n._margin;
      var r = {
        id: n.id, node: n,
        x0: x0 + ox + m, x1: x0 + ox + fw - m,           // cavity at floor level
        y1: y0 - oy - m, y0: y0 - oy - fl + m,
        slot: { x0: x0, x1: x0 + sw, y0: y0 - sl, y1: y0 }
      };
      r.cx = (r.x0 + r.x1) / 2; r.cy = (r.y0 + r.y1) / 2;
      r.w = r.x1 - r.x0; r.l = r.y1 - r.y0;
      out.push(r);
      return;
    }

    var along = n.dir === 'x' ? sw : sl;
    var slack = along - (n.dir === 'x' ? n._m.w : n._m.l);
    var grow = n.children.filter(function (c) {
      return c.kind === 'section' && (n.dir === 'x' ? c.alignX : c.alignY) === 'stretch';
    });
    var share = grow.length ? slack / grow.length : 0;
    var cursor = grow.length ? 0 : slack / 2;

    n.children.forEach(function (c, i) {
      if (i) {
        // The divider between this child's area and the last one's, right
        // across this split's region: the lid's thin walls follow these.
        out.walls = out.walls || [];
        out.walls.push(n.dir === 'x' ? { x0: x0 + cursor, x1: x0 + cursor + inner, y0: y0 - sl, y1: y0 }
                                     : { x0: x0, x1: x0 + sw, y0: y0 - cursor - inner, y1: y0 - cursor });
        cursor += inner;
      }
      var size = (n.dir === 'x' ? c._m.w : c._m.l) + (grow.indexOf(c) >= 0 ? share : 0);
      if (n.dir === 'x') place(c, x0 + cursor, y0, size, sl, inner, out);
      else place(c, x0, y0 - cursor, sw, size, inner, out);
      cursor += size;
    });
  }

})(window.CS);
