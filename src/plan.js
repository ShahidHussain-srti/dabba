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
    // Room for the badge on top, the dimension lines and the + buttons around.
    var pad = Math.min(56, W * 0.12, H * 0.12), top = 40, side = 34;
    var s = Math.min((W - pad * 2 - side) / Math.max(ext.w, 1), (H - pad * 2 - top - side) / Math.max(ext.h, 1));
    s = CS.clamp(s, 0.2, 30);
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

  function sx(t, x) { return t.ox + x * t.s; }
  function sy(t, y) { return t.oy - y * t.s; }

  function shade(hex, k) {
    var c = CS.hexToRgb(hex);
    var f = function (v) { return Math.round(CS.clamp(v, 0, 1) * 255); };
    return 'rgb(' + f(c[0] * (1 - k)) + ',' + f(c[1] * (1 - k)) + ',' + f(c[2] * (1 - k)) + ')';
  }
  function tint(hex, k) {
    var c = CS.hexToRgb(hex);
    var f = function (v) { return Math.round(CS.clamp(v + (1 - v) * k, 0, 1) * 255); };
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
      if (c.type !== 'snap' && c.type !== 'hook' && c.type !== 'swing') return;
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
      if (c.type === 'snap') {
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
      var k = 0.28 + 0.42 * (r.node._depth / Math.max(D.Hb, 0.1));
      ctx.fillStyle = shade(baseC, k);
      self._cavityPath(ctx, t, r);
      ctx.fill();
    });
    D.notches.forEach(function (n) {
      ctx.fillStyle = shade(baseC, 0.55);
      ctx.beginPath();
      ctx.arc(sx(t, n.x), sy(t, n.y), n.r * t.s, 0, Math.PI * 2);
      ctx.fill();
    });
    D.rects.forEach(function (r) { self._label(ctx, t, r); });

    this._selection(ctx, t);
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
      rrPath(ctx, t, r.cx, r.cy, r.w, r.l, Math.min(this.state.pocket.corner, Math.min(r.w, r.l) / 2));
    }
  };

  Plan.prototype._label = function (ctx, t, r) {
    var s = r.node, w = r.w * t.s, h = r.l * t.s;
    if (w < 36 || h < 22) return;
    var name = s.name || CS.layout.label(s, this.D.sections);
    var l1 = fmt(s.w) + ' × ' + fmt(s.l);
    var l2 = 'h ' + fmt(s.h) + (Math.abs(s._depth - s.h) > 0.05 ? ' · depth ' + fmt(s._depth) : '');
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    var big = CS.clamp(Math.min(w / 9, h / 4.2), 9, 13);
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

      if (hot && hov.edge) self._edgeGlow(ctx, t, r, hov.edge);
    });
    var r = D.rects.filter(function (q) { return q.id === sel; })[0];
    if (!r) return;

    // edge grips
    ctx.save();
    ctx.fillStyle = 'rgba(90,169,255,1)';
    ['left', 'right', 'back', 'front'].forEach(function (e) {
      var g = self._grip(t, r, e);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(g.x - g.w / 2, g.y - g.h / 2, g.w, g.h, 2);
      else ctx.rect(g.x - g.w / 2, g.y - g.h / 2, g.w, g.h);
      ctx.fill();
    });
    ctx.restore();

    this.buttons(t).forEach(function (b) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      var on = self.hover && self.hover.button === b.key;
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
      var s = r.node, horiz = this.drag.edge === 'left' || this.drag.edge === 'right';
      var txt = (horiz ? 'width ' + fmt(s.w) : 'length ' + fmt(s.l)) + ' mm';
      ctx.save();
      ctx.font = '600 11px -apple-system,system-ui,sans-serif';
      var tw = ctx.measureText(txt).width + 14;
      var gx = this._grip(t, r, this.drag.edge);
      var bx = gx.x + (horiz ? (this.drag.edge === 'right' ? 14 : -14 - tw) : -tw / 2);
      var by = gx.y + (horiz ? -10 : (this.drag.edge === 'back' ? -30 : 10));
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
    var mx = (x0 + x1) / 2, my = (yT + yB) / 2, off = PLUS_R + 9;
    var out = [
      { key: 'add:left',  kind: 'add', side: 'left',  x: x0 - off, y: my, r: PLUS_R },
      { key: 'add:right', kind: 'add', side: 'right', x: x1 + off, y: my, r: PLUS_R },
      { key: 'add:back',  kind: 'add', side: 'back',  x: mx, y: yT - off, r: PLUS_R },
      { key: 'add:front', kind: 'add', side: 'front', x: mx, y: yB + off, r: PLUS_R }
    ];
    if (D.rects.length > 1) out.push({ key: 'delete', kind: 'delete', x: x1 - 11, y: yT + 11, r: 8 });
    return out;
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

    // Which edge carries the hinge, just beyond the knuckles.
    if (D.tray) { ctx.restore(); return; }
    var out = { back: [0, 1], front: [0, -1], left: [-1, 0], right: [1, 0] }[D.side];
    var reach = (out[1] ? D.L / 2 : D.W / 2) + D.hinge.c + 2 * D.hinge.rk;
    ctx.font = '600 9.5px -apple-system,system-ui,sans-serif';
    ctx.fillStyle = 'rgba(140,155,175,0.85)';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(sx(t, out[0] * reach) + out[0] * 10, sy(t, out[1] * reach) - out[1] * 10);
    if (out[0]) ctx.rotate(-Math.PI / 2 * out[0]);
    ctx.fillText('HINGE', 0, 0);
    ctx.restore();
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
    var btns = this.buttons(t);
    for (var i = 0; i < btns.length; i++) {
      if (Math.hypot(x - btns[i].x, y - btns[i].y) <= btns[i].r + 2) return { button: btns[i].key, b: btns[i] };
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
      if (cands.length && cands[0][1] <= EDGE_PX) return { id: r.id, edge: cands[0][0] };
    }
    for (var k = 0; k < D.rects.length; k++) {
      var q = D.rects[k];
      if (x >= sx(t, q.x0) && x <= sx(t, q.x1) && y >= sy(t, q.y1) && y <= sy(t, q.y0)) return { id: q.id };
    }
    var mm = { x: (x - t.ox) / t.s, y: (t.oy - y) / t.s };
    var inBox = function (b) { return mm.x >= b.x0 && mm.x <= b.x1 && mm.y >= b.y0 && mm.y <= b.y1; };
    if (D.planKnuckles.some(inBox)) return { panel: 'hinge' };
    if (D.planClasps.some(inBox)) return { panel: 'clasp' };
    if (Math.abs(mm.x) <= D.W / 2 && Math.abs(mm.y) <= D.L / 2) return { panel: 'walls' };
    return null;
  };

  Plan.prototype._bind = function () {
    var self = this, canvas = this.canvas;

    function local(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function cursorFor(h) {
      if (!h) return 'default';
      if (h.button) return 'pointer';
      if (h.edge) return (h.edge === 'left' || h.edge === 'right') ? 'ew-resize' : 'ns-resize';
      if (h.id || h.panel) return 'pointer';
      return 'default';
    }

    canvas.addEventListener('pointerdown', function (e) {
      var p = local(e);
      canvas.focus();
      var h = self.hit(p.x, p.y);
      if (!h) return;
      if (h.button) {
        if (h.b.kind === 'delete') self.hooks.remove(self.state.selected);
        else self.hooks.add(self.state.selected, h.b.side);
        e.preventDefault();
        return;
      }
      if (h.panel) { self.hooks.focus(h.panel); return; }
      if (h.id && h.id !== self.state.selected) self.hooks.select(h.id);
      if (h.edge) {
        var found = CS.layout.find(self.state.layout, h.id);
        if (!found) return;
        var s = found.node, t = self.transform();
        var r = self.D.rects.filter(function (q) { return q.id === h.id; })[0];
        var horiz = h.edge === 'left' || h.edge === 'right';
        self.hooks.beginEdit();
        // A stretched axis has no size of its own; resizing pins it again.
        if (horiz && s.alignX === 'stretch') { s.w = Math.round((r.w - 2 * self.D.fit) * 10) / 10; s.alignX = 'center'; }
        if (!horiz && s.alignY === 'stretch') { s.l = Math.round((r.l - 2 * self.D.fit) * 10) / 10; s.alignY = 'center'; }
        self.frozen = { s: t.s, ox: t.ox, oy: t.oy };
        self.drag = {
          kind: 'resize', id: h.id, edge: h.edge, x: p.x, y: p.y,
          start: horiz ? s.w : s.l,
          // Hold the opposite edge still on screen while the layout reflows.
          anchor: h.edge === 'right' ? sx(t, r.x0) : h.edge === 'left' ? sx(t, r.x1)
                : h.edge === 'back' ? sy(t, r.y0) : sy(t, r.y1)
        };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    });

    canvas.addEventListener('pointermove', function (e) {
      var p = local(e);
      if (self.drag) {
        var d = self.drag, t = self.frozen;
        var found = CS.layout.find(self.state.layout, d.id);
        if (!found) return;
        var s = found.node;
        var mmDelta = (d.edge === 'left' || d.edge === 'right') ? (p.x - d.x) / t.s : -(p.y - d.y) / t.s;
        var sign = (d.edge === 'right' || d.edge === 'back') ? 1 : -1;
        var step = e.shiftKey ? 0.1 : 0.5;
        var v = Math.max(2, Math.round((d.start + sign * mmDelta) / step) * step);
        v = Math.round(v * 10) / 10;
        if (d.edge === 'left' || d.edge === 'right') s.w = v; else s.l = v;
        self.describe();
        var r = self.D.rects.filter(function (q) { return q.id === d.id; })[0];
        if (r) {
          if (d.edge === 'right') self.frozen.ox = d.anchor - r.x0 * t.s;
          if (d.edge === 'left') self.frozen.ox = d.anchor - r.x1 * t.s;
          if (d.edge === 'back') self.frozen.oy = d.anchor + r.y0 * t.s;
          if (d.edge === 'front') self.frozen.oy = d.anchor + r.y1 * t.s;
        }
        canvas.style.cursor = (d.edge === 'left' || d.edge === 'right') ? 'ew-resize' : 'ns-resize';
        self.draw();
        self.hooks.change(true);
        return;
      }
      var h = self.hit(p.x, p.y);
      canvas.style.cursor = cursorFor(h);
      var key = h ? (h.button || '') + (h.id || '') + (h.edge || '') : '';
      var prev = self.hover ? (self.hover.button || '') + (self.hover.id || '') + (self.hover.edge || '') : '';
      if (key !== prev) { self.hover = h; self.draw(); }
    });

    var end = function (e) {
      if (!self.drag) return;
      self.drag = null;
      self.frozen = null;
      if (e.pointerId != null && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      self.draw();
      self.hooks.change(false);
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
