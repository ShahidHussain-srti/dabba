/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* plan.js — the top-down planner: click a compartment to select it, drag an
 * edge to resize it, use the + buttons to add neighbours. Everything is drawn
 * from CS.describe, the same numbers the mesh is built from, and redrawn on
 * every pointer move — it never waits for the mesh.
 */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  var EDGE_PX = 7;          // grab distance for an edge
  var PLUS_R = 10;

  function Plan(canvas, state, hooks) {
    this.canvas = canvas;
    this.state = state;
    this.hooks = hooks;
    this.hover = null;
    this.drag = null;
    this.frozen = null;
    this.D = null;
    this._bind();
  }

  Plan.prototype.describe = function () {
    try { this.D = CS.describe(this.state); } catch (e) { console.error(e); }
    return this.D;
  };

  /* mm → CSS px, fitted to the case and everything hanging off it. */
  Plan.prototype.transform = function () {
    if (this.frozen) return this.frozen;
    var D = this.D;
    var W = Math.max(1, this.canvas.clientWidth), H = Math.max(1, this.canvas.clientHeight);
    var ext = this.extent();
    // Room for the badge on top, the dimension lines, the + buttons and the edge names around.
    var pad = Math.min(68, W * 0.14, H * 0.14), top = 40, side = 34;
    var s = Math.min((W - pad * 2 - side) / Math.max(ext.w, 1), (H - pad * 2 - top - side) / Math.max(ext.h, 1));
    s = WB.clamp(s, 0.2, 30);
    var cx = (ext.x0 + ext.x1) / 2, cy = (ext.y0 + ext.y1) / 2;
    void D;
    return { s: s, ox: W / 2 + side / 2 - cx * s, oy: (H + top - side) / 2 + cy * s };
  };

  Plan.prototype.extent = function () {
    var D = this.D;
    var e = { x0: -D.W / 2, x1: D.W / 2, y0: -D.L / 2, y1: D.L / 2 };
    D.planKnuckles.concat(D.planClasps).forEach(function (k) {
      e.x0 = Math.min(e.x0, k.x0); e.x1 = Math.max(e.x1, k.x1);
      e.y0 = Math.min(e.y0, k.y0); e.y1 = Math.max(e.y1, k.y1);
    });
    e.w = e.x1 - e.x0; e.h = e.y1 - e.y0;
    return e;
  };

  /* 'right', 'back', or a corner like 'right-back' → { h: 'left'|'right'|null,
     v: 'back'|'front'|null }. */
  function sides(edge) {
    var out = { h: null, v: null };
    (edge || '').split('-').forEach(function (e) {
      if (e === 'left' || e === 'right') out.h = e; else if (e === 'back' || e === 'front') out.v = e;
    });
    return out;
  }
  /* Fill hands an axis's size to the layout, so its edges are locked. */
  function canResize(r, side) {
    if (!CS.itemByKey(r.node.item).size) return false;
    return side === 'left' || side === 'right' ? r.node.alignX !== 'stretch' : r.node.alignY !== 'stretch';
  }

  var DRAG_MS = 600000;            // an undo step held open for the length of a drag

  function sx(t, x) { return t.ox + x * t.s; }
  function sy(t, y) { return t.oy - y * t.s; }

  function shade(hex, k) {
    var c = WB.hexToRgb(hex);
    var f = function (v) { return Math.round(WB.clamp(v, 0, 1) * 255); };
    return 'rgb(' + f(c[0] * (1 - k)) + ',' + f(c[1] * (1 - k)) + ',' + f(c[2] * (1 - k)) + ')';
  }
  function tint(hex, k) {
    var c = WB.hexToRgb(hex);
    var f = function (v) { return Math.round(WB.clamp(v + (1 - v) * k, 0, 1) * 255); };
    return 'rgb(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ')';
  }

  function rrPath(ctx, t, cx, cy, w, l, r) {
    var x = sx(t, cx - w / 2), y = sy(t, cy + l / 2), W = w * t.s, H = l * t.s;
    var R = Math.max(0, Math.min(r * t.s, W / 2, H / 2));
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, W, H, R);
    else ctx.rect(x, y, W, H);
  }

  Plan.prototype.draw = function () {
    var canvas = this.canvas;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = canvas.clientWidth, H = canvas.clientHeight;
    if (W < 8 || H < 8) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!this.describe()) return;
    var D = this.D, state = this.state, t = this.transform();
    var baseC = state.colors.base, lidC = state.colors.lid;

    this._grid(ctx, W, H, t);

    // Knuckles and clasps sit outside the wall; draw them under the case edge.
    D.planKnuckles.forEach(function (k) {
      ctx.fillStyle = k.owner === 'base' ? baseC : lidC;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.fillRect(sx(t, k.x0), sy(t, k.y1), (k.x1 - k.x0) * t.s, (k.y1 - k.y0) * t.s);
      ctx.strokeRect(sx(t, k.x0) + 0.5, sy(t, k.y1) + 0.5, (k.x1 - k.x0) * t.s - 1, (k.y1 - k.y0) * t.s - 1);
    });
    D.planClasps.forEach(function (c) {
      if (c.type !== 'snap' && c.type !== 'hook' && c.type !== 'swing' && c.type !== 'press') return;
      ctx.fillStyle = lidC;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(sx(t, c.x0), sy(t, c.y1), (c.x1 - c.x0) * t.s, (c.y1 - c.y0) * t.s);
      ctx.strokeRect(sx(t, c.x0) + 0.5, sy(t, c.y1) + 0.5, (c.x1 - c.x0) * t.s - 1, (c.y1 - c.y0) * t.s - 1);
    });

    // The case, seen from above with the lid off.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    rrPath(ctx, t, 0, 0, D.W, D.L, D.R);
    ctx.fillStyle = baseC;
    ctx.fill();
    ctx.restore();
    rrPath(ctx, t, 0, 0, D.W, D.L, D.R);
    ctx.strokeStyle = shade(baseC, 0.45);
    ctx.lineWidth = 1;
    ctx.stroke();

    if (D.grid) {
      // Gridfinity cell boundaries.
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gi = 1; gi < D.grid.nx; gi++) {
        var gx = sx(t, (gi - D.grid.nx / 2) * 42);
        ctx.moveTo(gx, sy(t, D.L / 2)); ctx.lineTo(gx, sy(t, -D.L / 2));
      }
      for (var gj = 1; gj < D.grid.ny; gj++) {
        var gy = sy(t, (gj - D.grid.ny / 2) * 42);
        ctx.moveTo(sx(t, -D.W / 2), gy); ctx.lineTo(sx(t, D.W / 2), gy);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (D.lipOn) {
      var a = D.T0 / 2;
      rrPath(ctx, t, 0, 0, D.W - 2 * a, D.L - 2 * a, Math.max(0, D.R - a));
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = tint(baseC, 0.45);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Clasp marks that live inside the wall.
    D.planClasps.forEach(function (c) {
      if (c.type === 'hook' || c.type === 'swing') return;
      if (c.type === 'snap' || c.type === 'press') {
        ctx.fillStyle = shade(baseC, 0.5);
        var depth = Math.min(1.2, D.T0 * 0.5);
        var inward = rotIn(D, c, depth);
        ctx.fillRect(sx(t, inward.x0), sy(t, inward.y1), (inward.x1 - inward.x0) * t.s, (inward.y1 - inward.y0) * t.s);
        return;
      }
      ctx.fillStyle = c.type === 'magnet' ? '#9aa3ad' : tint(baseC, 0.5);
      var mx = (c.x0 + c.x1) / 2, my = (c.y0 + c.y1) / 2;
      if (c.type === 'magnet') {
        ctx.beginPath();
        ctx.arc(sx(t, mx), sy(t, my), state.clasp.magnetD / 2 * t.s, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(sx(t, c.x0), sy(t, c.y1), (c.x1 - c.x0) * t.s, Math.max(2, (c.y1 - c.y0) * t.s * 0.25));
      }
    });

    // Cavities: deeper reads darker.
    var self = this;
    D.rects.forEach(function (r) {
      var sh = r.node._shape;
      if (!sh || sh.fill) {
        var k = 0.28 + 0.42 * (r.node._depth / Math.max(D.Hb, 0.1));
        ctx.fillStyle = shade(baseC, k);
        self._cavityPath(ctx, t, r);
        ctx.fill();
        return;
      }
      // What it holds, shape by shape, on a faint footprint.
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = shade(baseC, 0.35);
      ctx.strokeRect(sx(t, r.x0) + 0.5, sy(t, r.y1) + 0.5, r.w * t.s - 1, r.l * t.s - 1);
      ctx.restore();
      sh.prims.forEach(function (q) {
        var k2 = 0.28 + 0.42 * ((q._depth != null ? q._depth : r.node._depth) / Math.max(D.Hb, 0.1));
        ctx.fillStyle = shade(baseC, k2);
        self._primPath(ctx, t, r, q);
        ctx.fill();
        if (q.type === 'cyl') {      // a lying cylinder: show its axis
          var a = (q.rot || 0) * Math.PI / 180, hw = q.w / 2;
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(sx(t, r.cx + q.x - hw * Math.cos(a)), sy(t, r.cy + q.y - hw * Math.sin(a)));
          ctx.lineTo(sx(t, r.cx + q.x + hw * Math.cos(a)), sy(t, r.cy + q.y + hw * Math.sin(a)));
          ctx.stroke();
          ctx.restore();
        }
      });
    });
    D.notches.forEach(function (n) {
      ctx.fillStyle = shade(baseC, 0.55);
      ctx.beginPath();
      ctx.arc(sx(t, n.x), sy(t, n.y), n.r * t.s, 0, Math.PI * 2);
      ctx.fill();
    });
    D.rects.forEach(function (r) { self._label(ctx, t, r); });

    this._selection(ctx, t);
    this._primSelection(ctx, t);
    this._guides(ctx, t);
    this._dims(ctx, t);
    this._badge(ctx, W);
  };

  /* A clasp rectangle stepped into the wall, for the snap slot. */
  function rotIn(D, c, depth) {
    var r = { x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 };
    var side = D.side;
    if (side === 'back')  { r.y0 = -D.L / 2; r.y1 = -D.L / 2 + depth; }
    if (side === 'front') { r.y1 = D.L / 2; r.y0 = D.L / 2 - depth; }
    if (side === 'right') { r.x0 = -D.W / 2; r.x1 = -D.W / 2 + depth; }
    if (side === 'left')  { r.x1 = D.W / 2; r.x0 = D.W / 2 - depth; }
    return r;
  }

  Plan.prototype._cavityPath = function (ctx, t, r) {
    if (r.node.shape === 'round') {
      ctx.beginPath();
      ctx.ellipse(sx(t, r.cx), sy(t, r.cy), r.w / 2 * t.s, r.l / 2 * t.s, 0, 0, Math.PI * 2);
    } else {
      rrPath(ctx, t, r.cx, r.cy, r.w, r.l, Math.min((r.node._P || this.state.pocket).corner, Math.min(r.w, r.l) / 2));
    }
  };

  Plan.prototype._primPath = function (ctx, t, r, q) {
    var pts = CS.primOutline(q, 40);
    ctx.beginPath();
    pts.forEach(function (p, i) {
      var X = sx(t, r.cx + p[0]), Y = sy(t, r.cy + p[1]);
      if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    });
    ctx.closePath();
  };

  /* The selected compartment, when it is built from free shapes. */
  Plan.prototype.customRect = function () {
    var D = this.D, sel = this.state.selected;
    var r = D && D.rects.filter(function (q) { return q.id === sel; })[0];
    return r && r.node.item === 'custom' && r.node._shape ? r : null;
  };

  /* Handles of one shape of a custom compartment, in CSS px. Eight resize
     handles sit on its box (corners and edge middles; corners only for a
     hexagon, which keeps its proportions), and a turn grip stands on a stem
     off its top edge. ax/ay say which sides a handle moves (-1, 0 or 1, in the
     shape's own frame). */
  var HANDLE_PX = 9, GRIP_GAP = 26;
  Plan.prototype.primHandles = function (t, r, q) {
    var a = (q.rot || 0) * Math.PI / 180, c = Math.cos(a), s2 = Math.sin(a);
    var hw = q.w / 2, hl = (q.type === 'hex' ? q.w : q.l) / 2;
    var cxw = r.cx + q.x, cyw = r.cy + q.y;
    var at = function (lx, ly) { return { x: sx(t, cxw + lx * c - ly * s2), y: sy(t, cyw + lx * s2 + ly * c) }; };
    var list = [];
    [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (k) {
      if (q.type === 'hex' && (!k[0] || !k[1])) return;
      var pt = at(k[0] * hw, k[1] * hl);
      list.push({ handle: 'resize', ax: k[0], ay: k[1], x: pt.x, y: pt.y });
    });
    var stem = at(0, hl), grip = at(0, hl + GRIP_GAP / t.s);
    return { resize: list, rotate: grip, stem: stem, centre: at(0, 0),
             box: [at(-hw, -hl), at(hw, -hl), at(hw, hl), at(-hw, hl)] };
  };

  /* Screen direction of a resize handle, as the nearest of the four resize
     cursors, so the cursor still points the right way on a turned shape. */
  function resizeCursor(q, ax, ay) {
    var a = (q.rot || 0) * Math.PI / 180;
    var dx = ax * Math.cos(a) - ay * Math.sin(a), dy = ax * Math.sin(a) + ay * Math.cos(a);
    var deg = ((Math.atan2(dy, dx) * 180 / Math.PI) % 180 + 180) % 180;
    return ['ew-resize', 'nesw-resize', 'ns-resize', 'nwse-resize'][Math.round(deg / 45) % 4];
  }

  function pill(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }

  Plan.prototype._primSelection = function (ctx, t) {
    var r = this.customRect();
    if (!r) return;
    var s = r.node, self = this, sel = s._sel || 0, hv = this.hover, d = this.drag;
    var ACC = '#ffd166';
    r.node._shape.prims.forEach(function (q, i) {
      var hot = hv && hv.prim === i && hv.id === r.id;
      if (i !== sel && !hot) return;
      ctx.save();
      self._primPath(ctx, t, r, q);
      if (i !== sel) {                       // a shape you could pick up
        ctx.fillStyle = 'rgba(255,209,102,0.10)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,209,102,0.7)'; ctx.lineWidth = 1.25; ctx.setLineDash([4, 3]); ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.strokeStyle = ACC; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();

      var h = self.primHandles(t, r, q);
      // Its box, when that isn't the outline itself.
      if (q.type !== 'rect') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,209,102,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath();
        h.box.forEach(function (pt, k) { if (k) ctx.lineTo(pt.x, pt.y); else ctx.moveTo(pt.x, pt.y); });
        ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
      // Move grip in the middle: a cross with four arrowheads.
      var c = h.centre, hotMove = (hv && hv.prim === i && !hv.handle) || (d && d.kind === 'prim' && d.handle === 'move');
      ctx.save();
      ctx.fillStyle = hotMove ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.arc(c.x, c.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hotMove ? '#fff' : ACC; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(c.x - 7, c.y); ctx.lineTo(c.x + 7, c.y); ctx.moveTo(c.x, c.y - 7); ctx.lineTo(c.x, c.y + 7); ctx.stroke();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (k) {
        var tx = c.x + k[0] * 8.5, ty = c.y + k[1] * 8.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - k[0] * 3.5 - k[1] * 3, ty - k[1] * 3.5 - k[0] * 3);
        ctx.lineTo(tx - k[0] * 3.5 + k[1] * 3, ty - k[1] * 3.5 + k[0] * 3);
        ctx.closePath(); ctx.fill();
      });
      ctx.restore();
      // Turn grip on its stem, with a curved arrow.
      var hotRot = (hv && hv.handle === 'rotate') || (d && d.kind === 'prim' && d.handle === 'rotate');
      var g = h.rotate;
      ctx.save();
      ctx.strokeStyle = ACC; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(h.stem.x, h.stem.y); ctx.lineTo(g.x, g.y); ctx.stroke();
      ctx.fillStyle = hotRot ? '#fff' : ACC;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(g.x, g.y, hotRot ? 10 : 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(g.x, g.y, 4.5, -Math.PI * 0.9, Math.PI * 0.4); ctx.stroke();
      var ea = Math.PI * 0.4, ex = g.x + 4.5 * Math.cos(ea), ey = g.y + 4.5 * Math.sin(ea);
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.beginPath(); ctx.moveTo(ex + 3, ey - 0.8); ctx.lineTo(ex - 2.2, ey + 2.2); ctx.lineTo(ex - 0.6, ey - 2.8); ctx.closePath(); ctx.fill();
      ctx.restore();
      // Resize handles: corners a little bigger than edge middles.
      h.resize.forEach(function (k) {
        var on = (hv && hv.handle === 'resize' && hv.ax === k.ax && hv.ay === k.ay) ||
                 (d && d.kind === 'prim' && d.handle === 'resize' && d.ax === k.ax && d.ay === k.ay);
        var sz = on ? 14 : (k.ax && k.ay ? 11 : 9);
        ctx.save();
        ctx.fillStyle = on ? '#fff' : ACC;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
        pill(ctx, k.x - sz / 2, k.y - sz / 2, sz, sz, 2.5);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      });
      // Live readout while resizing or turning.
      if (d && d.kind === 'prim' && d.prim === i && d.handle !== 'move') {
        var src = q.src || q;
        var txt = d.handle === 'rotate' ? Math.round(src.rot || 0) + '°'
                : q.type === 'hex' ? fmt(src.w) + ' mm across'
                : q.type === 'cyl' ? fmt(src.w) + ' long · ⌀ ' + fmt(src.l)
                : fmt(src.w) + ' × ' + fmt(src.l) + ' mm';
        ctx.save();
        ctx.font = '600 11px ui-monospace, Menlo, monospace';
        var tw = ctx.measureText(txt).width + 16;
        var by = Math.max.apply(null, h.box.map(function (pt) { return pt.y; }).concat([g.y])) + 16;
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        pill(ctx, c.x - tw / 2, by, tw, 20, 10); ctx.fill();
        ctx.fillStyle = ACC; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, c.x, by + 10);
        ctx.restore();
      }
    });
  };

  Plan.prototype._label = function (ctx, t, r) {
    var s = r.node, w = r.w * t.s, h = r.l * t.s;
    if (w < 36 || h < 22) return;
    // A custom compartment being edited has its shape handles there instead.
    if (s.item === 'custom' && r.id === this.state.selected) return;
    var name = s.name || CS.layout.label(s, this.D.sections);
    var l1 = CS.itemByKey(s.item).size ? fmt(s._size ? s._size.w : s.w) + ' × ' + fmt(s._size ? s._size.l : s.l) : CS.itemSummary(s);
    var hh = s._shape ? s._shape.h : s.h;
    var l2 = 'h ' + fmt(hh) + (Math.abs(s._depth - hh) > 0.05 ? ' · depth ' + fmt(s._depth) : '');
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    var big = WB.clamp(Math.min(w / 9, h / 4.2), 9, 13);
    var cx = sx(t, r.cx), cy = sy(t, r.cy);
    var lines = h > 52 ? [name, l1, l2] : h > 34 ? [name, l1] : [l1];
    var y0 = cy - (lines.length - 1) * big * 0.62;
    lines.forEach(function (txt, i) {
      ctx.font = (i === 0 && lines.length > 1 ? '600 ' : '') + (i === 0 ? big : big - 1.5) + 'px -apple-system,system-ui,sans-serif';
      if (i > 0 || lines.length === 1) ctx.font = (big - 1.5) + 'px "SF Mono",ui-monospace,Menlo,monospace';
      ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.72)';
      ctx.fillText(txt, cx, y0 + i * big * 1.25, w - 8);
    });
    ctx.restore();
  };

  function fmt(v) { return (Math.round(v * 10) / 10).toString(); }

  /* Selection outline, edge grips, + buttons and the delete chip. */
  Plan.prototype._selection = function (ctx, t) {
    var D = this.D, sel = this.state.selected, hov = this.hover;
    var self = this;
    D.rects.forEach(function (r) {
      var isSel = r.id === sel;
      var hot = hov && hov.id === r.id;
      if (!isSel && !hot) return;
      ctx.save();
      self._cavityPath(ctx, t, r);
      ctx.strokeStyle = isSel ? 'rgba(90,169,255,1)' : 'rgba(90,169,255,0.55)';
      ctx.lineWidth = isSel ? 2 : 1.25;
      ctx.setLineDash(isSel ? [] : [4, 3]);
      ctx.stroke();
      ctx.restore();

      if (hot && hov.edge) {
        var hs = sides(hov.edge);
        if (hs.h) self._edgeGlow(ctx, t, r, hs.h);
        if (hs.v) self._edgeGlow(ctx, t, r, hs.v);
      }
    });
    var r = D.rects.filter(function (q) { return q.id === sel; })[0];
    if (!r) return;

    // edge grips
    ctx.save();
    ctx.fillStyle = 'rgba(90,169,255,1)';
    ['left', 'right', 'back', 'front'].filter(function (e) { return canResize(r, e); }).forEach(function (e) {
      var g = self._grip(t, r, e);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(g.x - g.w / 2, g.y - g.h / 2, g.w, g.h, 2);
      else ctx.rect(g.x - g.w / 2, g.y - g.h / 2, g.w, g.h);
      ctx.fill();
    });
    if (canResize(r, 'left') && canResize(r, 'back')) {
      [[r.x0, r.y1], [r.x1, r.y1], [r.x0, r.y0], [r.x1, r.y0]].forEach(function (c) {
        ctx.fillRect(sx(t, c[0]) - 3.5, sy(t, c[1]) - 3.5, 7, 7);
      });
    }
    ctx.restore();

    this.buttons(t).forEach(function (b) {
      var on = self.hover && self.hover.button === b.key;
      if (b.kind === 'side') { self._sideButton(ctx, b, on); return; }
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.kind === 'delete' ? (on ? '#ff6b5e' : '#e0645a')
                                          : (on ? '#5aa9ff' : 'rgba(43,111,209,0.92)');
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      var k = b.r * 0.45;
      if (b.kind === 'delete') {
        ctx.moveTo(b.x - k, b.y - k); ctx.lineTo(b.x + k, b.y + k);
        ctx.moveTo(b.x + k, b.y - k); ctx.lineTo(b.x - k, b.y + k);
      } else {
        ctx.moveTo(b.x - k, b.y); ctx.lineTo(b.x + k, b.y);
        ctx.moveTo(b.x, b.y - k); ctx.lineTo(b.x, b.y + k);
      }
      ctx.stroke();
      ctx.restore();
    });

    // live dimensions while resizing
    if (this.drag && this.drag.kind === 'resize') {
      var s = r.node, dd = this.drag, horiz = !!dd.h && !dd.v;
      var txt = dd.h && dd.v ? fmt(s.w) + ' × ' + fmt(s.l) + ' mm'
              : (dd.h ? 'width ' + fmt(s.w) : 'length ' + fmt(s.l)) + ' mm';
      ctx.save();
      ctx.font = '600 11px -apple-system,system-ui,sans-serif';
      var tw = ctx.measureText(txt).width + 14;
      var gx = dd.h && dd.v
        ? { x: dd.h === 'right' ? sx(t, r.x1) : sx(t, r.x0), y: dd.v === 'back' ? sy(t, r.y1) : sy(t, r.y0) }
        : this._grip(t, r, dd.h || dd.v);
      var bx = dd.h && dd.v ? gx.x + (dd.h === 'right' ? 12 : -12 - tw)
             : gx.x + (horiz ? (dd.h === 'right' ? 14 : -14 - tw) : -tw / 2);
      var by = dd.h && dd.v ? gx.y + (dd.v === 'back' ? -28 : 8)
             : gx.y + (horiz ? -10 : (dd.v === 'back' ? -30 : 10));
      ctx.fillStyle = 'rgba(43,111,209,0.95)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, tw, 20, 10); else ctx.rect(bx, by, tw, 20);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx + 7, by + 10);
      ctx.restore();
    }
  };

  /* Move, resize or turn one shape of a custom compartment. The layout
     reflows as the footprint changes, so the view is panned to hold the shape
     where it should be on screen, the way edge resizing holds the far edge.
     Resizing keeps the opposite side still (Alt: resize about the centre);
     Shift gives fine steps, and free angles when turning. */
  Plan.prototype._dragPrim = function (e, p) {
    var d = this.drag, t = this.frozen, found = CS.layout.find(this.state.layout, d.id);
    if (!found) return;
    var node = found.node, src = node.prims[d.prim];
    if (!src) return;
    var step = e.shiftKey ? 0.1 : 0.5;
    var snap = function (v) { return Math.round(v / step) * step; };
    var mx = (p.x - d.x) / t.s, my = -(p.y - d.y) / t.s;      // pointer travel, mm
    d.guides = null;
    if (d.handle === 'move') {
      src.x = snap(d.sx0 + mx);
      src.y = snap(d.sy0 + my);
      if (!e.altKey) {
        // Line its box up with the compartment's other shapes (Alt: off).
        var lines = { x: [], y: [] }, box = function (q, x, y) {
          var pts = CS.primOutline(Object.assign({}, q, { x: 0, y: 0 }), 24);
          var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
          return { x0: x + Math.min.apply(null, xs), x1: x + Math.max.apply(null, xs),
                   y0: y + Math.min.apply(null, ys), y1: y + Math.max.apply(null, ys) };
        };
        node.prims.forEach(function (o, i) {
          if (i === d.prim) return;
          var b = box(o, o.x, o.y);
          lines.x.push(b.x0, (b.x0 + b.x1) / 2, b.x1);
          lines.y.push(b.y0, (b.y0 + b.y1) / 2, b.y1);
        });
        var raw = box(src, d.sx0 + mx, d.sy0 + my), sn = WB.snapBox(raw, lines, 6 / t.s);
        if (sn.x) src.x = WB.tidy(d.sx0 + mx + sn.dx);
        if (sn.y) src.y = WB.tidy(d.sy0 + my + sn.dy);
        var g = WB.boxGuides(box(src, src.x, src.y), lines);
        d.guides = { x: sn.x ? g.x : [], y: sn.y ? g.y : [], prim: true };
      }
      d.cx = d.cx0 + (src.x - d.sx0) * t.s; d.cy = d.cy0 - (src.y - d.sy0) * t.s;
    } else if (d.handle === 'resize') {
      var a = (d.rot0 || 0) * Math.PI / 180, c = Math.cos(a), s2 = Math.sin(a);
      var lx = mx * c + my * s2, ly = -mx * s2 + my * c;      // travel in the shape's frame
      var k = e.altKey ? 2 : 1;                              // about the centre, both sides move
      var w = d.w0, l = d.l0;
      if (src.type === 'hex') {                              // keeps its shape: follow the larger pull
        var gw = d.w0 + k * d.ax * lx, gl = d.w0 + k * d.ay * ly;
        w = l = Math.max(2, snap(Math.abs(gw - d.w0) > Math.abs(gl - d.w0) ? gw : gl));
      } else {
        if (d.ax) w = Math.max(2, snap(d.w0 + k * d.ax * lx));
        if (d.ay) l = Math.max(2, snap(d.l0 + k * d.ay * ly));
      }
      src.w = w;
      src.l = l;
      // The centre follows half the growth, so the opposite side stays put.
      var cxl = e.altKey ? 0 : d.ax * (w - d.w0) / 2;
      var cyl = e.altKey ? 0 : d.ay * (l - d.l0) / 2;
      var ox = cxl * c - cyl * s2, oy = cxl * s2 + cyl * c;
      src.x = Math.round((d.sx0 + ox) * 1000) / 1000;
      src.y = Math.round((d.sy0 + oy) * 1000) / 1000;
      d.cx = d.cx0 + ox * t.s; d.cy = d.cy0 - oy * t.s;
    } else {
      var dx = (p.x - d.cx) / t.s, dy = -(p.y - d.cy) / t.s;
      var deg = Math.atan2(dy, dx) * 180 / Math.PI - 90;
      src.rot = ((e.shiftKey ? Math.round(deg) : Math.round(deg / 15) * 15) + 360) % 360;
    }
    // Reflow, then pan so the shape's centre lands where it should on screen.
    this.describe();
    var r = this.D.rects.filter(function (q) { return q.id === d.id; })[0];
    var q = r && r.node._shape.prims[d.prim];
    if (q) {
      this.frozen.ox += d.cx - sx(this.frozen, r.cx + q.x);
      this.frozen.oy += d.cy - sy(this.frozen, r.cy + q.y);
    }
    this.canvas.style.cursor = d.handle === 'resize' ? resizeCursor(src, d.ax, d.ay) : 'grabbing';
    this.draw();
    this.hooks.change(true);
  };

  /* Move a whole compartment. It keeps its place in the layout and gains an
     offset, held inside the outer wall; neighbours stay where they are, and
     overlapping is fine (the pockets merge). Its edges and centre snap to the
     other compartments', the interior's and its slot's middle (Alt: off);
     otherwise it moves in 0.5 mm steps, Shift 0.1. */
  Plan.prototype._dragMove = function (e, p) {
    var d = this.drag, t = this.frozen;
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) < 3) return;
    var found = CS.layout.find(this.state.layout, d.id);
    if (!found) return;
    d.moved = true;
    this.hooks.beginEdit(DRAG_MS);
    var s = found.node, step = e.shiftKey ? 0.1 : 0.5;
    var snap = function (v) { return Math.round(v / step) * step; };
    // An axis it actually moves along becomes a custom position.
    var mx = (p.x - d.x) / t.s, my = -(p.y - d.y) / t.s;
    if (s.alignX !== 'custom' && Math.abs(mx) >= step / 2 && d.range.x[1] - d.range.x[0] > 1e-6) {
      var sx0 = CS.layout.toCustom(s, d.rect, 'x');
      d.dx0 += sx0; d.range.x = [d.range.x[0] + sx0, d.range.x[1] + sx0];
    }
    if (s.alignY !== 'custom' && Math.abs(my) >= step / 2 && d.range.y[1] - d.range.y[0] > 1e-6) {
      var sy0 = CS.layout.toCustom(s, d.rect, 'y');
      d.dy0 += sy0; d.range.y = [d.range.y[0] + sy0, d.range.y[1] + sy0];
    }
    var cx = s.alignX === 'custom', cy = s.alignY === 'custom', R = d.rect;
    var sn = { x: false, y: false, dx: 0, dy: 0 }, lines = null;
    if (!e.altKey) {
      lines = this.snapLines(d.id);
      lines.x.push({ v: (R.slot.x0 + R.slot.x1) / 2, centre: true });
      lines.y.push({ v: (R.slot.y0 + R.slot.y1) / 2, centre: true });
      var ox = cx ? mx : 0, oy = cy ? my : 0;
      sn = WB.snapBox({ x0: R.x0 + ox, x1: R.x1 + ox, y0: R.y0 + oy, y1: R.y1 + oy }, lines, 6 / t.s);
    }
    if (cx) s.dx = WB.tidy(WB.clamp(sn.x ? d.dx0 + mx + sn.dx : snap(d.dx0 + mx), d.range.x[0], d.range.x[1]));
    if (cy) s.dy = WB.tidy(WB.clamp(sn.y ? d.dy0 + my + sn.dy : snap(d.dy0 + my), d.range.y[0], d.range.y[1]));
    this.describe();
    var now = this.D.rects.filter(function (q) { return q.id === d.id; })[0];
    d.guides = null;
    if (lines && now) {
      var g = WB.boxGuides(now, lines);
      d.guides = { x: cx && sn.x ? g.x : [], y: cy && sn.y ? g.y : [] };
    }
    this.canvas.style.cursor = 'grabbing';
    this.draw();
    this.hooks.change(true);
  };

  /* What a dragged compartment can line up with: the interior's edges and
     middle, and the edges and centres of the other compartments. */
  Plan.prototype.snapLines = function (id) {
    var D = this.D, lines = { x: [-D.IW / 2, 0, D.IW / 2], y: [-D.IL / 2, 0, D.IL / 2] };
    D.rects.forEach(function (r) {
      if (r.id === id) return;
      lines.x.push(r.x0, r.cx, r.x1);
      lines.y.push(r.y0, r.cy, r.y1);
    });
    return lines;
  };

  /* Alignment guides while a compartment or a shape is dragged onto a line. */
  Plan.prototype._guides = function (ctx, t) {
    var d = this.drag, g = d && d.guides, D = this.D;
    if (!g || (!g.x.length && !g.y.length)) return;
    var ox = 0, oy = 0;
    if (g.prim) {                            // shape positions are in the compartment's own frame
      var r = this.customRect(), q = r && r.node._shape.prims[d.prim], src = r && r.node.prims[d.prim];
      if (!q || !src) return;
      ox = r.cx + q.x - src.x; oy = r.cy + q.y - src.y;
    }
    var m = 6;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,92,170,0.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    g.x.forEach(function (v) {
      var X = Math.round(sx(t, ox + v)) + 0.5;
      ctx.moveTo(X, sy(t, D.L / 2) - m); ctx.lineTo(X, sy(t, -D.L / 2) + m);
    });
    g.y.forEach(function (v) {
      var Y = Math.round(sy(t, oy + v)) + 0.5;
      ctx.moveTo(sx(t, -D.W / 2) - m, Y); ctx.lineTo(sx(t, D.W / 2) + m, Y);
    });
    ctx.stroke();
    ctx.restore();
  };

  Plan.prototype._edgeGlow = function (ctx, t, r, edge) {
    ctx.save();
    ctx.strokeStyle = 'rgba(90,169,255,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    var x0 = sx(t, r.x0), x1 = sx(t, r.x1), y0 = sy(t, r.y1), y1 = sy(t, r.y0);
    if (edge === 'left')  { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
    if (edge === 'right') { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
    if (edge === 'back')  { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
    if (edge === 'front') { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
    ctx.stroke();
    ctx.restore();
  };

  Plan.prototype._grip = function (t, r, e) {
    var x0 = sx(t, r.x0), x1 = sx(t, r.x1), yT = sy(t, r.y1), yB = sy(t, r.y0);
    var mx = (x0 + x1) / 2, my = (yT + yB) / 2;
    if (e === 'left')  return { x: x0, y: my, w: 5, h: 18 };
    if (e === 'right') return { x: x1, y: my, w: 5, h: 18 };
    if (e === 'back')  return { x: mx, y: yT, w: 18, h: 5 };
    return { x: mx, y: yB, w: 18, h: 5 };
  };

  /* Buttons around the selected compartment, in CSS px. */
  Plan.prototype.buttons = function (t) {
    var D = this.D, sel = this.state.selected;
    var r = D.rects.filter(function (q) { return q.id === sel; })[0];
    if (!r) return [];
    var x0 = sx(t, r.x0), x1 = sx(t, r.x1), yT = sy(t, r.y1), yB = sy(t, r.y0);
    // A custom compartment has shape handles on and just outside its edges
    // (the turn grip stands GRIP_GAP px out), so its buttons step clear of them.
    var custom = r.node.item === 'custom';
    var mx = (x0 + x1) / 2, my = (yT + yB) / 2, off = PLUS_R + (custom ? GRIP_GAP + 22 : 9);
    var out = [
      { key: 'add:left',  kind: 'add', side: 'left',  x: x0 - off, y: my, r: PLUS_R },
      { key: 'add:right', kind: 'add', side: 'right', x: x1 + off, y: my, r: PLUS_R },
      { key: 'add:back',  kind: 'add', side: 'back',  x: mx, y: yT - off, r: PLUS_R },
      { key: 'add:front', kind: 'add', side: 'front', x: mx, y: yB + off, r: PLUS_R }
    ];
    if (D.rects.length > 1) {
      out.push(custom ? { key: 'delete', kind: 'delete', x: x1 + 14, y: yT - 14, r: 8 }
                      : { key: 'delete', kind: 'delete', x: x1 - 11, y: yT + 11, r: 8 });
    }
    return out.concat(this.sideButtons(t));
  };

  /* "Add along this whole side": one pill beyond each side of the case,
     past the dimension lines and the hinge, so it can't be mistaken for the
     selected compartment's own +. */
  Plan.prototype.sideButtons = function (t) {
    var ext = this.extent(), mx = sx(t, (ext.x0 + ext.x1) / 2), my = sy(t, (ext.y0 + ext.y1) / 2);
    var gap = 48;
    return [
      { key: 'side:left',  kind: 'side', side: 'left',  x: sx(t, ext.x0) - gap, y: my, r: 11, vertical: true },
      { key: 'side:right', kind: 'side', side: 'right', x: sx(t, ext.x1) + gap - 14, y: my, r: 11, vertical: true },
      { key: 'side:back',  kind: 'side', side: 'back',  x: mx, y: sy(t, ext.y1) - gap + 14, r: 11 },
      { key: 'side:front', kind: 'side', side: 'front', x: mx, y: sy(t, ext.y0) + gap, r: 11 }
    ];
  };

  Plan.prototype._grid = function (ctx, W, H, t) {
    var step = t.s * 5;
    if (step < 8) step *= 2;
    if (step < 8) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(128,142,164,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = ((t.ox % step) + step) % step; x < W; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (var y = ((t.oy % step) + step) % step; y < H; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
    ctx.restore();
  };

  /* A long outlined pill with end stops and a +: "the whole side". */
  Plan.prototype._sideButton = function (ctx, b, on) {
    var L = 44, Hh = 18, w = b.vertical ? Hh : L, h = b.vertical ? L : Hh;
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(b.x - w / 2, b.y - h / 2, w, h, 9); else ctx.rect(b.x - w / 2, b.y - h / 2, w, h);
    ctx.fillStyle = on ? 'rgba(90,169,255,0.28)' : 'rgba(43,111,209,0.14)';
    ctx.fill();
    ctx.strokeStyle = on ? '#5aa9ff' : 'rgba(90,169,255,0.7)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash(on ? [] : [3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = on ? '#fff' : '#9cc8ff';
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    var k = 4.5, e = (b.vertical ? h : w) / 2 - 6;
    if (b.vertical) {
      ctx.moveTo(b.x - 4, b.y - e); ctx.lineTo(b.x + 4, b.y - e); ctx.moveTo(b.x - 4, b.y + e); ctx.lineTo(b.x + 4, b.y + e);
    } else {
      ctx.moveTo(b.x - e, b.y - 4); ctx.lineTo(b.x - e, b.y + 4); ctx.moveTo(b.x + e, b.y - 4); ctx.lineTo(b.x + e, b.y + 4);
    }
    ctx.moveTo(b.x - k, b.y); ctx.lineTo(b.x + k, b.y); ctx.moveTo(b.x, b.y - k); ctx.lineTo(b.x, b.y + k);
    ctx.stroke();
    ctx.restore();
  };

  Plan.prototype._dims = function (ctx, t) {
    var D = this.D, ext = this.extent();
    ctx.save();
    ctx.fillStyle = 'rgba(140,155,175,0.85)';
    ctx.strokeStyle = 'rgba(140,155,175,0.45)';
    ctx.font = '11px "SF Mono",ui-monospace,Menlo,monospace';
    ctx.textAlign = 'center';
    var yb = sy(t, ext.y0) + 22, xl = sx(t, ext.x0) - 22;
    var x0 = sx(t, -D.W / 2), x1 = sx(t, D.W / 2), y0 = sy(t, D.L / 2), y1 = sy(t, -D.L / 2);
    ctx.beginPath();
    ctx.moveTo(x0, yb - 4); ctx.lineTo(x0, yb + 4); ctx.moveTo(x0, yb); ctx.lineTo(x1, yb);
    ctx.moveTo(x1, yb - 4); ctx.lineTo(x1, yb + 4);
    ctx.moveTo(xl - 4, y0); ctx.lineTo(xl + 4, y0); ctx.moveTo(xl, y0); ctx.lineTo(xl, y1);
    ctx.moveTo(xl - 4, y1); ctx.lineTo(xl + 4, y1);
    ctx.stroke();
    var label = function (txt, x, y) {
      var w = ctx.measureText(txt).width + 8;
      ctx.save();
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--stage') || '#0a0d12';
      ctx.fillRect(x - w / 2, y - 7, w, 14);
      ctx.restore();
      ctx.fillText(txt, x, y + 4);
    };
    label(D.W.toFixed(1) + ' mm', (x0 + x1) / 2, yb);
    ctx.save();
    ctx.translate(xl, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    label(D.L.toFixed(1) + ' mm', 0, 0);
    ctx.restore();

    // Name each edge as the sidebar does, beyond its "whole side" pill, and
    // mark the one that carries the hinge.
    var mx = sx(t, (ext.x0 + ext.x1) / 2), my = sy(t, (ext.y0 + ext.y1) / 2);
    var hingeSide = D.tray ? null : D.side;
    ctx.font = '600 9.5px -apple-system,system-ui,sans-serif';
    ctx.fillStyle = 'rgba(140,155,175,0.85)';
    ctx.textBaseline = 'middle';
    [['back', mx, sy(t, ext.y1) - 56, 0], ['front', mx, sy(t, ext.y0) + 70, 0],
     ['left', sx(t, ext.x0) - 70, my, -1], ['right', sx(t, ext.x1) + 56, my, 1]].forEach(function (e) {
      ctx.save();
      ctx.translate(e[1], e[2]);
      if (e[3]) ctx.rotate(Math.PI / 2 * e[3]);
      ctx.fillText(e[0].toUpperCase() + (e[0] === hingeSide ? ' · HINGE' : ''), 0, 0);
      ctx.restore();
    });
    ctx.restore();
  };

  Plan.prototype._badge = function (ctx, W) {
    var D = this.D;
    var txt = D.tray ? 'Compartments · tray ' + D.zP.toFixed(1) + ' mm deep'
                     : 'Compartments · base ' + D.zP.toFixed(1) + ' mm + lid ' + (D.zT - D.zP).toFixed(1) + ' mm';
    if (D.grid) txt += ' · Gridfinity ' + D.grid.nx + '×' + D.grid.ny;
    ctx.save();
    ctx.font = '600 11px -apple-system,system-ui,sans-serif';
    var w = ctx.measureText(txt).width + 18;
    ctx.fillStyle = 'rgba(43,111,209,0.9)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(W / 2 - w / 2, 12, w, 20, 10); else ctx.rect(W / 2 - w / 2, 12, w, 20);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, W / 2, 22);
    ctx.restore();
  };

  /* ── hit testing ────────────────────────────────────────────────── */
  Plan.prototype.hit = function (x, y) {
    if (!this.D) return null;
    var t = this.transform(), D = this.D;
    // Shapes of the selected custom compartment, handles first.
    var cr = this.customRect();
    if (cr) {
      var prims = cr.node._shape.prims, selp = cr.node._sel || 0;
      if (prims[selp]) {
        var hh = this.primHandles(t, cr, prims[selp]);
        if (Math.hypot(x - hh.rotate.x, y - hh.rotate.y) <= 12) return { id: cr.id, prim: selp, handle: 'rotate' };
        var best = null, bd = HANDLE_PX + 1;
        hh.resize.forEach(function (k) {
          var dd = Math.max(Math.abs(x - k.x), Math.abs(y - k.y));
          if (dd < bd) { bd = dd; best = k; }
        });
        if (best) return { id: cr.id, prim: selp, handle: 'resize', ax: best.ax, ay: best.ay };
        if (Math.hypot(x - hh.centre.x, y - hh.centre.y) <= 12) return { id: cr.id, prim: selp };
      }
    }
    var btns = this.buttons(t);
    for (var i = 0; i < btns.length; i++) {
      var bb = btns[i];
      var hitB = bb.kind === 'side'
        ? Math.abs(x - bb.x) <= (bb.vertical ? 11 : 24) && Math.abs(y - bb.y) <= (bb.vertical ? 24 : 11)
        : Math.hypot(x - bb.x, y - bb.y) <= bb.r + 2;
      if (hitB) return { button: bb.key, b: bb };
    }
    if (cr) {
      var mmx = (x - t.ox) / t.s - cr.cx, mmy = (t.oy - y) / t.s - cr.cy;
      for (var pi = prims.length - 1; pi >= 0; pi--) {
        if (inPoly(mmx, mmy, CS.primOutline(prims[pi], 24))) return { id: cr.id, prim: pi };
      }
    }
    // Edges of any compartment, selected one first.
    var order = D.rects.slice().sort(function (a, b) {
      return (b.id === this.state.selected) - (a.id === this.state.selected);
    }.bind(this));
    for (var j = 0; j < order.length; j++) {
      var r = order[j];
      var x0 = sx(t, r.x0), x1 = sx(t, r.x1), yT = sy(t, r.y1), yB = sy(t, r.y0);
      var inY = y >= yT - EDGE_PX && y <= yB + EDGE_PX, inX = x >= x0 - EDGE_PX && x <= x1 + EDGE_PX;
      var cands = [];
      if (inY) cands.push(['left', Math.abs(x - x0)], ['right', Math.abs(x - x1)]);
      if (inX) cands.push(['back', Math.abs(y - yT)], ['front', Math.abs(y - yB)]);
      cands.sort(function (a, b) { return a[1] - b[1]; });
      // Only a sized box / oval / capsule has edges to drag; other items take
      // their size from what they hold.
      // Corners resize both ways at once.
      var CPX = EDGE_PX + 2;
      var corners = [['left-back', x0, yT], ['right-back', x1, yT], ['left-front', x0, yB], ['right-front', x1, yB]];
      for (var ci = 0; ci < corners.length; ci++) {
        var cc = corners[ci], sd = sides(cc[0]);
        if (Math.abs(x - cc[1]) <= CPX && Math.abs(y - cc[2]) <= CPX && canResize(r, sd.h) && canResize(r, sd.v)) return { id: r.id, edge: cc[0] };
      }
      cands = cands.filter(function (c) { return canResize(r, c[0]); });
      if (cands.length && cands[0][1] <= EDGE_PX) return { id: r.id, edge: cands[0][0] };
    }
    // Bodies: the selected one first (it's drawn on top where they overlap),
    // then the rest, last drawn first.
    var bodies = D.rects.slice().reverse().sort(function (a, b) {
      return (b.id === this.state.selected) - (a.id === this.state.selected);
    }.bind(this));
    for (var k = 0; k < bodies.length; k++) {
      var q = bodies[k];
      if (x >= sx(t, q.x0) && x <= sx(t, q.x1) && y >= sy(t, q.y1) && y <= sy(t, q.y0)) return { id: q.id, body: true };
    }
    var mm = { x: (x - t.ox) / t.s, y: (t.oy - y) / t.s };
    var inBox = function (b) { return mm.x >= b.x0 && mm.x <= b.x1 && mm.y >= b.y0 && mm.y <= b.y1; };
    if (D.planKnuckles.some(inBox)) return { panel: 'hinge' };
    if (D.planClasps.some(inBox)) return { panel: 'clasp' };
    if (Math.abs(mm.x) <= D.W / 2 && Math.abs(mm.y) <= D.L / 2) return { panel: 'walls' };
    return null;
  };

  function inPoly(x, y, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var yi = pts[i][1], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (pts[j][0] - pts[i][0]) * (y - yi) / (yj - yi) + pts[i][0]) inside = !inside;
    }
    return inside;
  }

  Plan.prototype._bind = function () {
    var self = this, canvas = this.canvas;

    function local(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function edgeCursor(edge) {
      var sd = sides(edge);
      if (sd.h && sd.v) return (sd.h === 'right') === (sd.v === 'back') ? 'nesw-resize' : 'nwse-resize';
      return sd.h ? 'ew-resize' : 'ns-resize';
    }
    function cursorFor(h) {
      if (!h) return 'default';
      if (h.button) return 'pointer';
      if (h.handle === 'resize') {
        var crc = self.customRect(), qc = crc && crc.node._shape.prims[h.prim];
        return qc ? resizeCursor(qc, h.ax, h.ay) : 'nwse-resize';
      }
      if (h.handle === 'rotate') return 'grab';
      if (h.prim != null) return 'move';
      if (h.body) return 'move';
      if (h.edge) return edgeCursor(h.edge);
      if (h.id || h.panel) return 'pointer';
      return 'default';
    }

    // Only the main button drags; the others do nothing, menu included.
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var p = local(e);
      canvas.focus();
      var h = self.hit(p.x, p.y);
      if (!h) return;
      if (h.button) {
        if (h.b.kind === 'side') { self.hooks.addSide(h.b.side); e.preventDefault(); return; }
        if (h.b.kind === 'delete') self.hooks.remove(self.state.selected);
        else self.hooks.add(self.state.selected, h.b.side);
        e.preventDefault();
        return;
      }
      if (h.panel) { self.hooks.focus(h.panel); return; }
      if (h.id && h.id !== self.state.selected) self.hooks.select(h.id);
      if (h.prim != null) {
        var cr = self.customRect();
        if (!cr) return;
        var node = cr.node, q = node._shape.prims[h.prim], src = q.src;
        if (node._sel !== h.prim) { node._sel = h.prim; self.hooks.primSelect(h.prim); }
        if (!src) return;
        var t0 = self.transform();
        self.hooks.beginEdit(DRAG_MS);
        self.frozen = { s: t0.s, ox: t0.ox, oy: t0.oy };
        var cx0 = sx(t0, cr.cx + q.x), cy0 = sy(t0, cr.cy + q.y);
        self.drag = { kind: 'prim', id: cr.id, prim: h.prim, handle: h.handle || 'move', x: p.x, y: p.y,
                      ax: h.ax || 0, ay: h.ay || 0,
                      sx0: src.x, sy0: src.y, rot0: src.rot || 0, w0: src.w, l0: src.type === 'hex' ? src.w : src.l,
                      // where the shape's centre sits on screen, held there as the layout reflows
                      cx: cx0, cy: cy0, cx0: cx0, cy0: cy0 };
        canvas.setPointerCapture(e.pointerId);
        self.draw();
        e.preventDefault();
        return;
      }
      if (h.body) {
        // Drag the whole compartment. A press without movement is just a click.
        var rb = self.D.rects.filter(function (q) { return q.id === h.id; })[0];
        if (!rb) return;
        var t1 = self.transform();
        self.frozen = { s: t1.s, ox: t1.ox, oy: t1.oy };
        self.drag = { kind: 'move', id: h.id, x: p.x, y: p.y, dx0: rb.dx, dy0: rb.dy, rect: rb,
                      range: { x: rb.range.x.slice(), y: rb.range.y.slice() }, moved: false };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (h.edge) {
        var found = CS.layout.find(self.state.layout, h.id);
        if (!found) return;
        var s = found.node, t = self.transform();
        var r = self.D.rects.filter(function (q) { return q.id === h.id; })[0];
        var sd = sides(h.edge);
        self.hooks.beginEdit(DRAG_MS);
        self.frozen = { s: t.s, ox: t.ox, oy: t.oy };
        self.drag = {
          kind: 'resize', id: h.id, edge: h.edge, h: sd.h, v: sd.v, x: p.x, y: p.y,
          w0: s.w, l0: s.l,
          // Hold the opposite edges still on screen while the layout reflows.
          ax: sd.h === 'right' ? sx(t, r.x0) : sd.h === 'left' ? sx(t, r.x1) : null,
          ay: sd.v === 'back' ? sy(t, r.y0) : sd.v === 'front' ? sy(t, r.y1) : null
        };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    });

    canvas.addEventListener('pointermove', function (e) {
      var p = local(e);
      // A drag is one undo step, however long it pauses; it closes on release.
      if (self.drag && self.drag.kind !== 'move') self.hooks.beginEdit(DRAG_MS);
      if (self.drag && self.drag.kind === 'prim') { self._dragPrim(e, p); return; }
      if (self.drag && self.drag.kind === 'move') { self._dragMove(e, p); return; }
      if (self.drag) {
        var d = self.drag, t = self.frozen;
        var found = CS.layout.find(self.state.layout, d.id);
        if (!found) return;
        var s = found.node;
        var step = e.shiftKey ? 0.1 : 0.5;
        var size = function (start, delta) { return Math.round(Math.max(2, Math.round((start + delta) / step) * step) * 10) / 10; };
        if (d.h) s.w = size(d.w0, (d.h === 'right' ? 1 : -1) * (p.x - d.x) / t.s);
        if (d.v) s.l = size(d.l0, (d.v === 'back' ? 1 : -1) * -(p.y - d.y) / t.s);
        self.describe();
        var r = self.D.rects.filter(function (q) { return q.id === d.id; })[0];
        if (r) {
          if (d.h === 'right') self.frozen.ox = d.ax - r.x0 * t.s;
          if (d.h === 'left') self.frozen.ox = d.ax - r.x1 * t.s;
          if (d.v === 'back') self.frozen.oy = d.ay + r.y0 * t.s;
          if (d.v === 'front') self.frozen.oy = d.ay + r.y1 * t.s;
        }
        canvas.style.cursor = edgeCursor(d.edge);
        self.draw();
        self.hooks.change(true);
        return;
      }
      var h = self.hit(p.x, p.y);
      canvas.style.cursor = cursorFor(h);
      var hkey = function (o) {
        return o ? (o.button || '') + (o.id || '') + (o.edge || '') + (o.prim != null ? 'p' + o.prim : '') +
                   (o.handle || '') + (o.ax || '') + (o.ay || '') : '';
      };
      var key = hkey(h), prev = hkey(self.hover);
      if (key !== prev) { self.hover = h; self.draw(); }
    });

    var end = function (e) {
      if (!self.drag) return;
      var still = self.drag.kind === 'move' && !self.drag.moved;
      self.drag = null;
      if (still) {
        self.frozen = null;
        if (e.pointerId != null && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        self.draw();
        return;
      }
      self.frozen = null;
      if (e.pointerId != null && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      self.draw();
      self.hooks.change(false);
      if (self.hooks.endEdit) self.hooks.endEdit();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', function () {
      if (!self.drag && self.hover) { self.hover = null; self.draw(); }
    });

    canvas.addEventListener('dblclick', function (e) {
      var p = local(e), h = self.hit(p.x, p.y);
      if (h && h.id) self.hooks.focus('compartment');
    });

    canvas.addEventListener('keydown', function (e) {
      var crk = self.customRect();
      if (crk && (e.key === '[' || e.key === ']')) {
        e.preventDefault();
        var srcq = crk.node._shape.prims[crk.node._sel || 0];
        if (srcq && srcq.src) { self.hooks.beginEdit(); srcq.src.rot = ((srcq.src.rot || 0) + (e.key === ']' ? 15 : -15) + 360) % 360; self.hooks.change(false); }
        return;
      }
      if (crk && /^Arrow/.test(e.key) && !e.altKey) {
        // Nudge the selected shape (Shift: 5 mm). Alt+arrows still walk between compartments.
        e.preventDefault();
        var nq = crk.node.prims[crk.node._sel || 0];
        if (nq) {
          var st = e.shiftKey ? 5 : 0.5;
          self.hooks.beginEdit();
          if (e.key === 'ArrowLeft') nq.x -= st;
          if (e.key === 'ArrowRight') nq.x += st;
          if (e.key === 'ArrowUp') nq.y += st;
          if (e.key === 'ArrowDown') nq.y -= st;
          self.hooks.change(false);
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && crk && (crk.node.prims || []).length > 1) {
        e.preventDefault();
        self.hooks.beginEdit();
        crk.node.prims.splice(crk.node._sel || 0, 1);
        crk.node._sel = Math.max(0, (crk.node._sel || 0) - 1);
        self.hooks.change(false);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        self.hooks.remove(self.state.selected);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Arrow keys walk the selection to the nearest compartment that way.
        e.preventDefault();
        var D = self.D, cur = D.rects.filter(function (q) { return q.id === self.state.selected; })[0];
        if (!cur) return;
        var dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
        var best = null, bd = Infinity;
        D.rects.forEach(function (q) {
          if (q === cur) return;
          var dx = q.cx - cur.cx, dy = q.cy - cur.cy;
          var along = dx * dir[0] + dy * dir[1];
          if (along <= 0.5) return;
          var d = along + Math.abs(dx * dir[1] - dy * dir[0]) * 2;
          if (d < bd) { bd = d; best = q; }
        });
        if (best) self.hooks.select(best.id);
      }
    });
  };

  CS.Plan = Plan;
})(window.CS);
