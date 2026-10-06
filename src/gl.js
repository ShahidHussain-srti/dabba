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
    this.poser = function (part) { return self.D ? CS.poseFor(self.D, part, self.mode, self.angle) : null; };
  };
  CS.Viewer.prototype = Object.create(WB.Viewer.prototype);
  CS.Viewer.prototype.constructor = CS.Viewer;

  CS.Viewer.prototype.setModel = function (parts, D, atlas) {
    this.D = D;
    WB.Viewer.prototype.setModel.call(this, parts, atlas);
    this._outline();
  };

  CS.Viewer.prototype.setPose = function (mode, angle) {
    this.mode = mode;
    if (angle != null) this.angle = angle;
    this._upload();
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
    var z = D.zP + 0.08, pts = [];
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
      pts.push(a[0], a[1], z, b[0], b[1], z);
    }
    this.setLines(pts);
  };

  /* Click → the compartment under the cursor, found by casting the view ray
     onto the rim plane. The base never moves, so this works in every pose,
     and through a closed lid as a sort of x-ray. */
  CS.Viewer.prototype._pick = function (ray) {
    if (!this.D) return;
    var a = ray.a, b = ray.b, dz = b[2] - a[2];
    if (Math.abs(dz) < 1e-9) return;
    var t = (this.D.zP - a[2]) / dz;
    if (t < 0) return;
    var x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    var hit = null;
    this.D.rects.forEach(function (rc) {
      if (x >= rc.x0 - 1 && x <= rc.x1 + 1 && y >= rc.y0 - 1 && y <= rc.y1 + 1) hit = rc.id;
    });
    this.onPick(hit, { x: x, y: y });
  };

})(window.CS);
