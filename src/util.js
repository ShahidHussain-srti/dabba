/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* util.js — namespace, defaults, small helpers shared by every module. */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  /* ── element defaults ───────────────────────────────────────────── */
  CS.newText = function (opts) {
    return Object.assign({
      id: WB.newId('t'), content: 'DABBA', font: 'grotesk', bold: true, italic: false,
      style: 'fill', strokeWidth: 0.8, size: 10, tracking: 0.6, lineHeight: 1.15,
      rotation: 0, align: 'center', x: 0, y: 0, color: '#16181d'
    }, opts || {});
  };

  CS.newArt = function (opts) {
    return Object.assign({
      id: WB.newId('a'), source: 'none', mode: 'auto', threshold: 0.5, size: 20,
      rotation: 0, mirror: false, x: 0, y: 0, color: '#4b8ef0'
    }, opts || {});
  };

  /* A compartment, sized by the object it holds. w/l/h are the object's own
     measurements; the fit clearance is added on top. `depth` null means
     "work it out from the object height". */
  CS.newSection = function (opts) {
    return Object.assign({
      id: WB.newId('s'), kind: 'section', name: '',
      w: 40, l: 30, h: 18, depth: null, shape: 'rect',
      item: 'box', params: {}, prims: [],      // what it holds: see items.js
      alignX: 'center', alignY: 'center',
      dx: 0, dy: 0,                            // dragged off its place in the layout, mm
      grooves: { left: false, right: false, front: false, back: false },
      groove: { width: 18, depth: null }
    }, opts || {});
  };

  CS.newSplit = function (dir, children) {
    return { id: WB.newId('g'), kind: 'split', dir: dir, children: children };
  };

  /* The two outside faces that take decoration: the top of the lid and the
     underside of the base. Both print against the bed, so the default is a
     flush colour inlay rather than raised relief. */
  CS.faceDefaults = function (which) {
    return {
      enabled: which === 'lid',
      relief: 'inlay', reliefHeight: 0.6, inlayDepth: 0.6,
      border: { style: which === 'lid' ? 'single' : 'none', shape: 'follow', inset: 3,
                width: 1.2, gap: 1.2, dashes: 32, radius: 4, color: '#16181d' },
      texts: which === 'lid' ? [CS.newText()] : [],
      arts: [],
      textIdx: 0, artIdx: 0
    };
  };

  CS.defaults = function () {
    var a = CS.newSection({ name: 'Large', w: 60, l: 40, h: 22 });
    var b = CS.newSection({ name: 'Small', w: 28, l: 18, h: 14 });
    var c = CS.newSection({ name: 'Small', w: 28, l: 18, h: 10, shape: 'round', item: 'round' });
    return {
      name: 'case',
      build: 'case',            // 'case' = base + lid; 'tray' = base only
      gridfinity: { enabled: false, magnets: true },
      texture: {
        enabled: false, pattern: 'knurl', depth: 0.5, raise: 0, scale: 4, angle: 0, border: 1, engine: 'fine',
        // plain band at each edge of the texture, per half (bottom/top as closed)
        borders: { base: { bottom: 1, top: 1, face: 1 }, lid: { bottom: 1, top: 1, face: 1 } },
        sides: {
          base: { front: 'all', back: 'all', left: 'all', right: 'all', face: 'none' },
          lid:  { front: 'all', back: 'all', left: 'all', right: 'all', face: 'none' }
        }
      },
      layerHeight: 0.2,
      quality: 'normal',
      fit: 0.4,                 // clearance around each object, per side
      headroom: 0.6,            // above the tallest object, inside the closed box
      interior: { auto: true, height: 30 },
      split: 0.6,               // share of the interior height that is in the base
      seat: 'flush',            // shallow objects sit flush with the rim
      walls: { side: 2.4, bottom: 1.6, top: 1.6, inner: 1.6 },
      outer: { corner: 5, edgeBottom: 1.6, edgeTop: 2.4, edgeStyle: 'round', taper: 0 },
      pocket: { corner: 1.5, floor: 0.8, rim: 0.6, taper: 0 },
      lip: { enabled: true, height: 2.4, clearance: 0.2,
             sides: { back: true, front: true, left: true, right: true } },
      lidInner: { mode: 'open', gap: 0.8, depth: 'full' },
      hinge: { side: 'back', count: 2, knuckles: 3, length: 24, diameter: 6, pin: 1.9,
               gap: 0.4, clearance: 0.4, inset: 10 },
      clasp: { type: 'snap', count: 1, width: 14, thickness: 1.8, reach: 6, catch: 0.9,
               clearance: 0.2, grip: true, magnetD: 6, magnetH: 2, bumpR: 0.8,
               latchD: 6, latchDrop: 0 },
      layout: CS.newSplit('x', [a, CS.newSplit('y', [b, c])]),
      selected: a.id,
      faces: { lid: CS.faceDefaults('lid'), base: CS.faceDefaults('base') },
      activeFace: 'lid',
      colors: { base: '#2f6db5', lid: '#e9edf2' }
    };
  };

  CS.QUALITY = {
    draft:  { seg: 24, ppmm: 8,  label: 'Draft' },
    normal: { seg: 48, ppmm: 12, label: 'Normal' },
    fine:   { seg: 72, ppmm: 16, label: 'Fine' },
    ultra:  { seg: 96, ppmm: 22, label: 'Ultra' }
  };
  CS.qualityOf = function (state) { return CS.QUALITY[state.quality] || CS.QUALITY.normal; };

  /* Surface textures: displacement patterns for the outside walls.
     Each returns 0 (surface) .. 1 (deepest). */
  CS.TEXTURES = [
    ['knurl', 'Diamond knurl'], ['pyramids', 'Pyramids'], ['crosshatch', 'Crosshatch'], ['ribs', 'Ribs'],
    ['chevron', 'Chevron'], ['waves', 'Waves'], ['hex', 'Hexagons'], ['triangles', 'Triangles'],
    ['waffle', 'Waffle grid'], ['tiles', 'Tiles'], ['checker', 'Checkerboard'], ['bricks', 'Bricks'],
    ['herringbone', 'Herringbone'], ['weave', 'Basket weave'], ['diamondplate', 'Diamond plate'],
    ['scales', 'Fish scales'], ['dimples', 'Dimples'], ['studs', 'Studs'], ['mesh', 'Perforated'],
    ['rings', 'Rings'], ['bubbles', 'Bubbles'], ['voronoi', 'Stone'], ['crystal', 'Crystal'],
    ['leather', 'Leather'], ['wood', 'Wood grain'], ['topo', 'Topographic'], ['noise', 'Sand'],
    ['image', 'Image (upload)']
  ];

  /* Bitmaps live outside the serialisable state, keyed by the picture's id.
     `texture` is the tile for the image texture, if any. */
  CS.assets = WB.assets;          // pictures, shared with the library's decoration code
  CS.assets.texture = null;


  /* Every element on a face, bottom to top: the border first, then pictures,
     then text. Later entries win where they overlap. */
  CS.faceItems = function (face) {
    var out = [];
    if (face.border.style !== 'none') out.push({ kind: 'border', item: face.border });
    (face.arts || []).forEach(function (a, i) { out.push({ kind: 'art', item: a, index: i }); });
    (face.texts || []).forEach(function (t, i) { out.push({ kind: 'text', item: t, index: i }); });
    return out;
  };

  /* Colours actually used by a design, in a stable order. */
  CS.coloursUsed = function (state) {
    var seen = [], add = function (c) {
      c = (c || '#000000').toUpperCase();
      if (seen.indexOf(c) < 0) seen.push(c);
    };
    var tray = state.build === 'tray';
    add(state.colors.base);
    if (!tray) add(state.colors.lid);
    ['lid', 'base'].forEach(function (w) {
      var f = state.faces[w];
      if (!f.enabled || f.relief === 'engraved') return;
      if (w === 'lid' && tray) return;
      if (w === 'base' && state.gridfinity && state.gridfinity.enabled) return;
      CS.faceItems(f).forEach(function (e) {
        if (e.kind === 'text' && !(e.item.content || '').trim()) return;
        if (e.kind === 'art' && e.item.source === 'none') return;
        add(e.item.color);
      });
    });
    return seen;
  };

  CS.FACE_NAME = { lid: 'Lid top', base: 'Base underside' };

  /* Anything that carries colour needs real depth to read as solid: one or two
     layers is translucent and fragile, so 3 is the floor everywhere — raised
     text, engraved recesses and colour inlays alike. Depths snap up to whole
     layers so they land on slice boundaries. */
  CS.MIN_LAYERS = 3;

  CS.layerHeightOf = function (state) { return Math.max(0.02, state.layerHeight || 0.2); };

  /* Layer arithmetic is done in floats, where 3 * 0.2 is 0.6000000000000001.
     Rounding keeps that noise out of state and off the sliders. */
  var tidy = WB.tidy;
  CS.tidy = tidy;
  CS.minDepthOf = function (state) { return tidy(CS.MIN_LAYERS * CS.layerHeightOf(state)); };

  /* Nearest whole number of layers (at least one). Used for every structural
     height so the parting line, floors and rims all land on slice boundaries. */
  CS.snapLayers = function (state, v, mode) {
    var lh = CS.layerHeightOf(state);
    var f = mode === 'up' ? Math.ceil : mode === 'down' ? Math.floor : Math.round;
    return tidy(Math.max(1, f(v / lh - (mode === 'up' ? 1e-6 : mode === 'down' ? -1e-6 : 0))) * lh);
  };

  /* Snap `requested` up to a whole number of layers, never below the 3-layer
     floor and never past `maxDepth` (which is itself rounded down to layers). */
  CS.snapDepth = function (state, requested, maxDepth) {
    var lh = CS.layerHeightOf(state);
    var floor = tidy(CS.MIN_LAYERS * lh);
    var d = tidy(Math.ceil(Math.max(floor, requested) / lh - 1e-6) * lh);
    if (maxDepth != null && d > maxDepth) d = tidy(Math.floor(maxDepth / lh + 1e-6) * lh);
    if (d < 0) d = 0;
    return { depth: d, floor: floor, lh: lh, layers: Math.round(d / lh),
             tooThin: d < floor - 1e-6 };
  };

  /* Depth of a face's decoration. Neither recess may eat through the wall it is
     cut into: at least the 3-layer floor's worth of wall stays behind it. */
  CS.faceRelief = function (state, face, wallT) {
    var min = CS.minDepthOf(state);
    var max = Math.max(0, wallT - min);
    if (face.relief === 'raised') {
      var r = CS.snapDepth(state, face.reliefHeight, null);
      return { style: 'raised', depth: r.depth, cut: 0, snap: r };
    }
    var want = face.relief === 'engraved' ? face.reliefHeight : face.inlayDepth;
    var s = CS.snapDepth(state, want, max);
    return { style: face.relief, depth: s.depth, cut: s.depth, snap: s, max: max };
  };

})(window.CS);
