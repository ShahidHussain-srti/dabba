/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* raster.js — every design element, rendered to an anti-aliased alpha mask.
 *
 * Working in mask space buys three things at once: 2-D booleans (so colours
 * never overlap in the mesh), polygon offsetting via the distance transform
 * (so borders follow any outline), and one geometry path shared by text,
 * uploads and freehand drawings.
 */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  var gridTransform = WB.gridTransform, ctxFor = WB.rasterCtx;

  /* ── face outline ───────────────────────────────────────────────
     The flat part of a decorated face, as a rounded rectangle. `fo` comes from
     CS.faceOutline: {w, h, r} in mm, centred on the face. */
  CS.drawFace = function (ctx, fo, t) {
    WB.shapePath(ctx, 'rect', fo.w, fo.h, fo.r, t);
  };

  CS.faceMask = function (fo, g) {
    var o = ctxFor('face', g);
    o.ctx.fillStyle = '#fff';
    o.ctx.beginPath();
    CS.drawFace(o.ctx, fo, gridTransform(g));
    o.ctx.fill();
    return WB.mask.sealEdges(WB.mask.fromCanvas(o.canvas), g);
  };

  /* Every element on one face, colour-separated and clipped to the flat area.
     The underside is mirrored so its artwork reads correctly once the case is
     turned over. Where elements overlap, the one drawn on top keeps the pixel. */
  CS.faceElements = function (face, fo, g, mirror) {
    var out = { list: [], all: null, raw: [] };
    if (!face.enabled) return out;
    var plate = CS.faceMask(fo, g);

    CS.faceItems(face).forEach(function (e) {
      var m = null;
      if (e.kind === 'border') m = WB.borderMask(face.border, fo, g, plate);
      else if (e.kind === 'text') m = WB.textMask(e.item, g);
      else m = WB.artMask(e.item, g);
      if (!m) return;
      if (mirror) m = WB.mirrorMaskX(m, g);
      out.raw.push({ kind: e.kind, index: e.index, mask: m });
      out.list.push({ kind: e.kind, index: e.index, item: e.item,
                      color: e.item.color, mask: WB.mask.and(m, plate) });
    });

    /* Topmost wins: walk down the stack subtracting everything above. */
    var claimed = null;
    for (var i = out.list.length - 1; i >= 0; i--) {
      var full = out.list[i].mask;
      out.list[i].mask = WB.mask.sub(full, claimed);
      claimed = WB.mask.union(claimed, full);
    }
    out.list = out.list.filter(function (e) { return e.mask && !WB.mask.empty(e.mask); });
    out.list.forEach(function (e) { out.all = WB.mask.union(out.all, e.mask); });
    return out;
  };

})(window.CS);
