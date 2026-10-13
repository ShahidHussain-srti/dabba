/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* gl.js — the shared viewer (WB.Viewer) with what is particular to a case:
 * the lid posed on the CPU (closed, swung open, or laid flat for printing, so
 * "Print layout" is exactly what is exported), the selected compartment
 * outlined at rim height, and clicking to pick a compartment.
 */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  CS.Viewer = function (canvas, onPick) {
    var self = this;
    this.mode = 'open';
    this.angle = 105;
    this.D = null;
    this.outline = null;
    this.onPick = onPick || function () {};
    WB.Viewer.call(this, canvas, {
      view: { az: -1.15, el: 0.72 },
      onClick: function (ray) { self._pick(ray); }
    });
    if (this.failed) return;
    this.plates = null;
    this.poser = function (part) {
      if (!self.D) return null;
      var pose = CS.poseFor(self.D, part, self.mode, self.angle), sh = self._plateShift(part);
      if (!sh) return pose;
      return function (x, y, z) {
        var q = pose ? pose(x, y, z) : [x, y, z];
        return [q[0] + sh.dx, q[1] + sh.dy, q[2]];
      };
    };
  };
  CS.Viewer.prototype = Object.create(WB.Viewer.prototype);
  CS.Viewer.prototype.constructor = CS.Viewer;

  CS.Viewer.prototype.setModel = function (parts, D, atlas) {
    this.D = D;
    WB.Viewer.prototype.setModel.call(this, parts, atlas);
    this._outline();
    this._placeBed();
  };

  CS.Viewer.prototype.setPose = function (mode, angle) {
    this.mode = mode;
    if (angle != null) this.angle = angle;
    this._upload();
    this._outline();
    this._placeBed();
  };

  /* The print bed ({ show, w, d }) shows under the print layout only (a tray
     is always in its print layout), centred on what is printed. With the base
     and lid on plates of their own (CS.printPlates), there is a bed for each,
     and the lid is shown on its plate, as the 3MF has it. */
  CS.Viewer.prototype.useBed = function (bed) {
    this.bedState = bed;
    this._placeBed();
  };
  CS.Viewer.prototype._bedOn = function () {
    var b = this.bedState, D = this.D;
    return !!(b && b.show && (this.mode === 'print' || (D && D.tray)));
  };
  CS.Viewer.prototype._plateShift = function (part) {
    var P = this.plates;
    if (!P || !P.split || this.mode !== 'print' || !this._bedOn()) return null;
    return P.shifts[P.plateOf[part.half] || 0];
  };
  CS.Viewer.prototype._placeBed = function () {
    if (this.failed) return;
    var b = this.bedState, B = this.bounds, P = this.plates;
    if (!this._bedOn() || !B) { this.setBed(null); return; }
    if (P && P.split && this.mode === 'print') {
      this.setBed({ w: b.w, d: b.d, z: B.minZ, at: P.shifts.map(function (s, i) {
        var o = WB.plateOrigin(i, P.shifts.length, b);
        return { cx: o.x + b.w / 2, cy: o.y + b.d / 2 };
      }) });
    } else {
      this.setBed({ w: b.w, d: b.d, cx: (B.minX + B.maxX) / 2, cy: (B.minY + B.maxY) / 2, z: B.minZ });
    }
  };

  /* Selected compartment, outlined at rim height. */
  CS.Viewer.prototype.setOutline = function (id) {
    this.outline = id;
    this._outline();
  };

  CS.Viewer.prototype._outline = function () {
    if (this.failed) return;
    var D = this.D, id = this.outline;
    var r = D && id && D.rects.filter(function (q) { return q.id === id; })[0];
    if (!r) { this.setLines(null); return; }
    var z = D.zP + 0.08, pts = [], sh = this._plateShift({ half: 'base' }) || { dx: 0, dy: 0 };
    var ring = r.node.shape === 'round'
      ? (function () {
          var out = [];
          for (var i = 0; i < 48; i++) {
            var t = i / 48 * Math.PI * 2;
            out.push([r.cx + r.w / 2 * Math.cos(t), r.cy + r.l / 2 * Math.sin(t)]);
          }
          return out;
        })()
      : CS.rrectPoints(r.w, r.l, Math.min(D.R, 1.5), r.cx, r.cy, 24);
    for (var i = 0; i < ring.length; i++) {
      var a = ring[i], b = ring[(i + 1) % ring.length];
      pts.push(a[0] + sh.dx, a[1] + sh.dy, z, b[0] + sh.dx, b[1] + sh.dy, z);
    }
    this.setLines(pts);
  };

  /* Click → the compartment under the cursor, found by casting the view ray
     onto the rim plane. The base only moves to centre on its plate, so this
     works in every pose, and through a closed lid as a sort of x-ray. */
  CS.Viewer.prototype._pick = function (ray) {
    if (!this.D) return;
    var a = ray.a, b = ray.b, dz = b[2] - a[2];
    if (Math.abs(dz) < 1e-9) return;
    var t = (this.D.zP - a[2]) / dz;
    if (t < 0) return;
    var sh = this._plateShift({ half: 'base' }) || { dx: 0, dy: 0 };
    var x = a[0] + (b[0] - a[0]) * t - sh.dx, y = a[1] + (b[1] - a[1]) * t - sh.dy;
    var hit = null;
    this.D.rects.forEach(function (rc) {
      if (x >= rc.x0 - 1 && x <= rc.x1 + 1 && y >= rc.y0 - 1 && y <= rc.y1 + 1) hit = rc.id;
    });
    this.onPick(hit, { x: x, y: y });
  };

})(window.CS);
