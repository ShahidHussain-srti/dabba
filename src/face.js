/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* face.js — the decoration editor for the lid top and the base underside: a
 * crisp, vector-drawn view you can drag text and pictures around in. Redraws
 * on every keystroke, so it never touches the mesh pipeline; the border ring
 * is the one exception and is cached.
 */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  function FaceView(canvas, state, onChange, onBeginEdit) {
    this.canvas = canvas;
    this.state = state;
    this.onChange = onChange;
    this.onBeginEdit = onBeginEdit || function () {};
    this.hot = null;        // element under the cursor
    this.selected = null;   // element clicked, movable with arrow keys
    this.drag = null;
    this.resize = null;
    this._ringCache = null;
    this._bind();
  }

  FaceView.prototype.which = function () { return this.state.activeFace; };
  FaceView.prototype.face = function () { return this.state.faces[this.which()]; };
  FaceView.prototype.outline = function () {
    this.D = CS.describe(this.state);
    return CS.faceOutline(this.D, this.which());
  };

  /* Elements are addressed as "kind:index". */
  FaceView.prototype.el = function (key) {
    var bits = key.split(':');
    var f = this.face();
    var list = bits[0] === 'text' ? f.texts : f.arts;
    return (list || [])[+bits[1]] || null;
  };

  FaceView.prototype.movable = function (key) {
    var f = this.face();
    if (!f.enabled) return false;
    var e = this.el(key);
    if (!e) return false;
    if (key.indexOf('text') === 0) return !!(e.content || '').trim();
    return e.source !== 'none';
  };

  /* Resizing writes the same field the slider does, within the same limits. */
  var SIZE = {
    text: { field: 'size', min: 2, max: 80 },
    art:  { field: 'size', min: 3, max: 250 }
  };
  var kindOf = function (key) { return key.split(':')[0]; };

  /* mm → CSS px for the current canvas size. */
  FaceView.prototype.transform = function () {
    var fo = this._fo || this.outline();
    var W = Math.max(1, this.canvas.clientWidth), H = Math.max(1, this.canvas.clientHeight);
    // Padding has to shrink with the viewport, or a small canvas yields a
    // negative scale and every arcTo/ellipse downstream throws.
    var pad = Math.min(56, W * 0.12, H * 0.12);
    var s = Math.min((W - pad * 2) / Math.max(fo.fullW, 1), (H - pad * 2) / Math.max(fo.fullH, 1));
    s = CS.clamp(s, 0.2, 18);
    return { s: s, ox: W / 2, oy: H / 2 };
  };

  FaceView.prototype.draw = function () {
    var canvas = this.canvas, state = this.state;
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

    var fo = this._fo = this.outline();
    var D = this.D;
    var t = this.transform();
    var which = this.which(), face = this.face();
    var bodyC = which === 'lid' ? state.colors.lid : state.colors.base;
    var px = Math.round(W * dpr), py = Math.round(H * dpr);

    this._grid(ctx, W, H, t);

    var layer = function (key) {
      var c = CS.scratch(key, px, py);
      var g2 = c.getContext('2d');
      g2.setTransform(dpr, 0, 0, dpr, 0, 0);
      g2.clearRect(0, 0, W, H);
      return { c: c, g: g2 };
    };

    // The hinge, so you know which way up the face is.
    this._hinge(ctx, t, bodyC);

    /* The whole face, with the rounded edge band a shade darker than the flat
       area decoration is allowed on. */
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = shadeOf(bodyC, 0.18);
    ctx.beginPath();
    CS.shapePath(ctx, 'rect', fo.fullW, fo.fullH, D.R, t);
    ctx.fill();
    ctx.restore();

    var plate = layer('faceplate');
    plate.g.fillStyle = bodyC;
    plate.g.beginPath();
    CS.drawFace(plate.g, fo, t);
    plate.g.fill();

    var feat = layer('facefeat');
    if (face.enabled) {
      CS.faceItems(face).forEach(function (e) {
        if (e.kind === 'border') { this._border(feat.g, t, fo, face); return; }
        if (e.kind === 'text') { CS.drawText(feat.g, e.item, t, { fill: e.item.color }); return; }
        if (e.item.source === 'none') return;
        var art = layer('faceart');
        if (!CS.drawArt(art.g, e.item, t)) return;
        if (CS.resolveArtMode(e.item) !== 'alpha') {
          // keep a thresholded photo readable while it is being tuned
          art.g.globalCompositeOperation = 'source-atop';
          art.g.fillStyle = e.item.color;
          art.g.globalAlpha = 0.55;
          art.g.fillRect(0, 0, W, H);
          art.g.globalAlpha = 1;
        } else {
          art.g.globalCompositeOperation = 'source-in';
          art.g.fillStyle = e.item.color;
          art.g.fillRect(0, 0, W, H);
        }
        art.g.globalCompositeOperation = 'source-over';
        feat.g.drawImage(art.c, 0, 0, W, H);
      }, this);
      feat.g.globalCompositeOperation = 'destination-in';
      feat.g.drawImage(plate.c, 0, 0, W, H);
      feat.g.globalCompositeOperation = 'source-over';
    }

    var out = layer('faceout');
    out.g.drawImage(plate.c, 0, 0, W, H);
    out.g.drawImage(feat.c, 0, 0, W, H);
    if (face.enabled && face.relief === 'engraved') {
      out.g.globalCompositeOperation = 'source-atop';
      out.g.fillStyle = 'rgba(0,0,0,0.22)';
      out.g.fillRect(0, 0, W, H);
      out.g.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(out.c, 0, 0, W, H);

    this._handles(ctx, t);
    this._dims(ctx, t, fo);
    this._badge(ctx, W);
  };

  function shadeOf(hex, k) {
    var c = CS.hexToRgb(hex);
    var f = function (v) { return Math.round(CS.clamp(v * (1 - k), 0, 1) * 255); };
    return 'rgb(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ')';
  }

  /* Knuckles along the hinge edge. The underside is seen from below, turned
     over left-to-right, so its hinge sits on the mirrored side. */
  FaceView.prototype._hinge = function (ctx, t, bodyC) {
    var D = this.D, mirror = this.which() === 'base' ? -1 : 1;
    ctx.save();
    ctx.globalAlpha = 0.7;
    D.planKnuckles.forEach(function (k) {
      var x0 = mirror > 0 ? k.x0 : -k.x1, x1 = mirror > 0 ? k.x1 : -k.x0;
      ctx.fillStyle = k.owner === 'base' ? this.state.colors.base : this.state.colors.lid;
      ctx.fillRect(t.ox + x0 * t.s, t.oy - k.y1 * t.s, (x1 - x0) * t.s, (k.y1 - k.y0) * t.s);
    }, this);
    ctx.restore();
    void bodyC;
  };

  FaceView.prototype._badge = function (ctx, W) {
    var on = this.face().enabled;
    var txt = this.which() === 'lid' ? 'Lid top — seen from above' : 'Base underside — seen from below';
    if (!on) txt += ' · off';
    ctx.save();
    ctx.font = '600 11px -apple-system,system-ui,sans-serif';
    var w = ctx.measureText(txt).width + 18;
    ctx.fillStyle = on ? 'rgba(43,111,209,0.9)' : 'rgba(120,132,150,0.85)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(W / 2 - w / 2, 12, w, 20, 10)
                  : ctx.rect(W / 2 - w / 2, 12, w, 20);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, W / 2, 22);
    ctx.restore();
  };

  FaceView.prototype._grid = function (ctx, W, H, t) {
    var step = t.s * 5;
    if (step < 8) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(128,142,164,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = t.ox % step; x < W; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (var y = t.oy % step; y < H; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
    ctx.restore();
  };

  /* Border ring, rasterised through the same SDF the exporter uses. Cached on
     the parameters that affect it so slider drags stay smooth. */
  FaceView.prototype._border = function (ctx, t, fo, face) {
    if (face.border.style === 'none') return;
    var key = JSON.stringify([fo.w, fo.h, fo.r, fo.fullW, fo.fullH, face.border]);

    if (!this._ringCache || this._ringCache.key !== key) {
      // Roughly matches the on-screen scale, so the ring isn't upscaled and soft.
      var ppmm = CS.clamp(900 / Math.max(fo.fullW, fo.fullH), 6, 16);
      var g = CS.makeGrid(fo.fullW, fo.fullH, ppmm);
      var plate = CS.faceMask(fo, g);
      var ring = CS.borderMask(face.border, fo, g, plate);
      var cv = document.createElement('canvas');
      cv.width = g.cols; cv.height = g.rows;
      if (ring) {
        var ictx = cv.getContext('2d');
        var img = ictx.createImageData(g.cols, g.rows);
        var rgb = CS.hexToRgb(face.border.color);
        var r = rgb[0] * 255, gg = rgb[1] * 255, b = rgb[2] * 255;
        for (var i = 0; i < ring.length; i++) {
          img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b;
          img.data[i * 4 + 3] = Math.round(ring[i] * 255);
        }
        ictx.putImageData(img, 0, 0);
      }
      this._ringCache = { key: key, canvas: cv, g: g };
    }

    var c = this._ringCache;
    var w = c.g.cols / c.g.ppmm * t.s, h = c.g.rows / c.g.ppmm * t.s;
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c.canvas, t.ox - w / 2, t.oy - h / 2, w, h);
    ctx.restore();
  };

  /* ── hit boxes & drag ───────────────────────────────────────────── */
  /* Listed back-to-front, so a reverse scan picks whatever is drawn on top. */
  FaceView.prototype.boxes = function (t) {
    var out = [];
    var face = this.face();
    var ctx = this.canvas.getContext('2d');
    if (!face.enabled) return out;

    (face.arts || []).forEach(function (a, i) {
      var p = CS.artPlacement(a, t);
      if (!p) return;
      out.push({ key: 'art:' + i, label: 'Picture ' + (i + 1), cx: p.cx, cy: p.cy,
                 w: p.w, h: p.h, rot: -a.rotation * Math.PI / 180 });
    });

    (face.texts || []).forEach(function (tx, i) {
      var L = CS.textLayout(ctx, tx, t);
      if (!L || L.width < 4) return;
      out.push({ key: 'text:' + i, label: 'Text ' + (i + 1),
                 cx: t.ox + tx.x * t.s, cy: t.oy - tx.y * t.s,
                 w: L.width + 6, h: L.height + 4, rot: -tx.rotation * Math.PI / 180 });
    });
    return out;
  };

  function alignOffset(el, key, b) {
    var al = el && key.indexOf('text') === 0 ? el.align : 'center';
    return al !== 'center' ? (al === 'left' ? b.w / 2 : -b.w / 2) : 0;
  }

  function toLocal(b, x, y) {
    var dx = x - b.cx, dy = y - b.cy;
    var c = Math.cos(-b.rot), s = Math.sin(-b.rot);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }

  /* Is (x, y) on a resize handle of the current selection? */
  FaceView.prototype.hitHandle = function (x, y) {
    var key = this.selected;
    if (!key || !this.movable(key) || !SIZE[kindOf(key)]) return null;
    var boxes = this.boxes(this.transform());
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.key !== key) continue;
      var l = toLocal(b, x, y), off = alignOffset(this.el(b.key), b.key, b);
      var L = off - b.w / 2, R = off + b.w / 2, T2 = -b.h / 2, B = b.h / 2;
      var pts = [[L, T2], [R, T2], [L, B], [R, B]];
      for (var k = 0; k < pts.length; k++) {
        if (Math.abs(l.x - pts[k][0]) <= 7 && Math.abs(l.y - pts[k][1]) <= 7) {
          return { key: b.key, cx: b.cx, cy: b.cy };
        }
      }
    }
    return null;
  };

  FaceView.prototype.hitTest = function (x, y) {
    var boxes = this.boxes(this.transform());
    for (var i = boxes.length - 1; i >= 0; i--) {
      var b = boxes[i], l = toLocal(b, x, y);
      var extra = alignOffset(this.el(b.key), b.key, b);
      if (Math.abs(l.x - extra) <= b.w / 2 + 3 && Math.abs(l.y) <= b.h / 2 + 3) return b.key;
    }
    return null;
  };

  FaceView.prototype._handles = function (ctx, t) {
    // Selection persists (so arrow keys have a target); hover is transient.
    var sel = this.selected && this.movable(this.selected) ? this.selected : null;
    var hov = this.drag ? this.drag.key : this.hot;
    if (!sel && !hov) return;

    var boxes = this.boxes(t);
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var isSel = b.key === sel, isHot = b.key === hov;
      if (!isSel && !isHot) continue;
      var off = alignOffset(this.el(b.key), b.key, b);

      ctx.save();
      ctx.translate(b.cx, b.cy);
      ctx.rotate(b.rot);
      ctx.strokeStyle = isSel ? 'rgba(90,169,255,1)' : 'rgba(90,169,255,0.6)';
      ctx.lineWidth = isSel ? 1.5 : 1;
      ctx.setLineDash(isSel ? [] : [4, 3]);
      ctx.strokeRect(off - b.w / 2, -b.h / 2, b.w, b.h);

      if (isSel) {
        ctx.setLineDash([]);
        var L = off - b.w / 2, R = off + b.w / 2, T2 = -b.h / 2, B = b.h / 2;
        var hs = 4;
        ctx.fillStyle = 'rgba(90,169,255,1)';
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1;
        [[L, T2], [R, T2], [L, B], [R, B]].forEach(function (k) {
          ctx.fillRect(k[0] - hs, k[1] - hs, hs * 2, hs * 2);
          ctx.strokeRect(k[0] - hs, k[1] - hs, hs * 2, hs * 2);
        });

        ctx.font = '10px -apple-system,system-ui,sans-serif';
        var tw = ctx.measureText(b.label).width + 10;
        ctx.fillStyle = 'rgba(43,111,209,0.95)';
        ctx.fillRect(off - b.w / 2, T2 - 16, tw, 14);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.label, off - b.w / 2 + 5, T2 - 9);
      }
      ctx.restore();
    }
  };

  FaceView.prototype._dims = function (ctx, t, fo) {
    ctx.save();
    ctx.fillStyle = 'rgba(140,155,175,0.75)';
    ctx.font = '11px "SF Mono",ui-monospace,Menlo,monospace';
    ctx.textAlign = 'center';
    ctx.fillText(fo.w.toFixed(1) + ' mm flat · ' + fo.fullW.toFixed(1) + ' mm overall',
                 t.ox, t.oy + fo.fullH / 2 * t.s + 24);
    ctx.translate(t.ox - fo.fullW / 2 * t.s - 20, t.oy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(fo.h.toFixed(1) + ' mm flat', 0, 0);
    ctx.restore();
  };

  FaceView.prototype._bind = function () {
    var self = this, canvas = this.canvas;

    function local(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (self.hidden) return;
      var p = local(e);
      canvas.focus();

      // grabbing a corner handle resizes instead of moving
      var h = self.hitHandle(p.x, p.y);
      if (h) {
        var spec = SIZE[kindOf(h.key)];
        self.onBeginEdit();
        self.resize = {
          key: h.key, field: spec.field, spec: spec,
          start: self.el(h.key)[spec.field],
          dist: Math.max(4, Math.hypot(p.x - h.cx, p.y - h.cy))
        };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      var key = self.hitTest(p.x, p.y);
      if (!key) {
        if (self.selected) { self.selected = null; self.draw(); }
        return;
      }
      self.selected = key;
      self.onSelect && self.onSelect(key);
      var t = self.transform();
      var el = self.el(key);
      self.drag = { key: key,
                    dx: el.x - (p.x - t.ox) / t.s,
                    dy: el.y + (p.y - t.oy) / t.s, moved: false };
      canvas.setPointerCapture(e.pointerId);
      self.draw();
      e.preventDefault();
    });

    /* Arrow keys nudge the selection; shift moves in bigger steps. */
    canvas.addEventListener('keydown', function (e) {
      if (self.hidden || !self.selected || !self.movable(self.selected)) return;
      var step = e.shiftKey ? 2 : 0.25;
      var dx = 0, dy = 0;
      switch (e.key) {
        case 'ArrowLeft':  dx = -step; break;
        case 'ArrowRight': dx =  step; break;
        case 'ArrowUp':    dy =  step; break;
        case 'ArrowDown':  dy = -step; break;
        case 'Escape':     self.selected = null; self.draw(); return;
        default: return;
      }
      e.preventDefault();
      self.onBeginEdit();
      var el = self.el(self.selected);
      el.x = Math.round((el.x + dx) * 100) / 100;
      el.y = Math.round((el.y + dy) * 100) / 100;
      self.draw();
      self.onChange(false);
    });

    canvas.addEventListener('pointermove', function (e) {
      if (self.hidden) return;
      var p = local(e);

      if (self.resize) {
        var r = self.resize;
        var b = self.boxes(self.transform()).filter(function (q) { return q.key === r.key; })[0];
        if (!b) return;
        var d = Math.max(4, Math.hypot(p.x - b.cx, p.y - b.cy));
        var v = CS.clamp(r.start * (d / r.dist), r.spec.min, r.spec.max);
        self.el(r.key)[r.field] = Math.round(v * 4) / 4;      // 0.25 mm steps
        canvas.style.cursor = 'nwse-resize';
        self.draw();
        self.onChange(true);
        return;
      }

      if (!self.drag) {
        if (self.hitHandle(p.x, p.y)) { canvas.style.cursor = 'nwse-resize'; return; }
        var hv = self.hitTest(p.x, p.y);
        canvas.style.cursor = hv ? 'grab' : 'default';
        if (hv !== self.hot) { self.hot = hv; self.draw(); }
        return;
      }
      if (!self.drag.moved) { self.drag.moved = true; self.onBeginEdit(); }
      var t = self.transform();
      var el = self.el(self.drag.key);
      var nx = (p.x - t.ox) / t.s + self.drag.dx;
      var ny = -(p.y - t.oy) / t.s + self.drag.dy;
      if (!e.altKey) {                        // snap to the centre lines
        if (Math.abs(nx) < 0.6) nx = 0;
        if (Math.abs(ny) < 0.6) ny = 0;
      }
      el.x = Math.round(nx * 20) / 20;
      el.y = Math.round(ny * 20) / 20;
      canvas.style.cursor = 'grabbing';
      self.draw();
      self.onChange(true);
    });

    var end = function (e) {
      if (self.resize) {
        self.resize = null;
        canvas.style.cursor = 'default';
        if (e && e.pointerId != null && canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
        self.draw();
        self.onChange(false);
        return;
      }
      if (!self.drag) return;
      self.drag = null;
      canvas.style.cursor = 'grab';
      if (e.pointerId != null && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      self.draw();
      self.onChange(false);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', function () {
      if (!self.drag && self.hot) { self.hot = null; self.draw(); }
    });
  };

  FaceView.prototype.invalidateBorder = function () { this._ringCache = null; };

  CS.FaceView = FaceView;
})(window.CS);
