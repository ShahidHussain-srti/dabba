/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* util.js — namespace, defaults, small helpers shared by every module. */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  /* Fonts are resolved from the system; each entry is a stack with fallbacks so
     the app still works where a face is missing. Identified by `key`, not by
     position, so the list can grow without changing anyone's saved design. */
  CS.FONTS = [
    // clean
    { key: 'grotesk',   name: 'Grotesk',     group: 'Clean',  css: '"Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif' },
    { key: 'neue',      name: 'Neue Sans',   group: 'Clean',  css: '"Helvetica Neue",Helvetica,Arial,sans-serif' },
    { key: 'futura',    name: 'Futura',      group: 'Clean',  css: 'Futura,"Century Gothic","Avenir Next",sans-serif' },
    { key: 'optima',    name: 'Optima',      group: 'Clean',  css: 'Optima,Candara,"Gill Sans","Trebuchet MS",sans-serif' },
    { key: 'rounded',   name: 'Rounded',     group: 'Clean',  css: '"Arial Rounded MT Bold",Nunito,"Trebuchet MS",sans-serif' },
    { key: 'condensed', name: 'Condensed',   group: 'Clean',  css: '"Arial Narrow","Avenir Next Condensed","Helvetica Neue",sans-serif' },
    { key: 'wideblack', name: 'Wide Black',  group: 'Clean',  css: '"Arial Black","Arial Bold",Gadget,sans-serif' },

    // serif
    { key: 'serif',     name: 'Serif',       group: 'Serif',  css: 'Georgia,"Times New Roman",serif' },
    { key: 'baskerville', name: 'Baskerville', group: 'Serif', css: 'Baskerville,"Libre Baskerville",Georgia,serif' },
    { key: 'cochin',    name: 'Cochin',      group: 'Serif',  css: 'Cochin,"Hoefler Text",Georgia,serif' },
    { key: 'elegant',   name: 'Elegant',     group: 'Serif',  css: 'Didot,"Bodoni 72","Playfair Display",Georgia,serif' },
    { key: 'slab',      name: 'Slab',        group: 'Serif',  css: 'Rockwell,"Courier New",Georgia,serif' },
    { key: 'clarendon', name: 'Fat Slab',    group: 'Serif',  css: 'Superclarendon,"Rockwell Extra Bold",Rockwell,Georgia,serif' },
    { key: 'copperplate', name: 'Copperplate', group: 'Serif', css: 'Copperplate,"Copperplate Gothic Light",Optima,serif' },

    // display / fun
    { key: 'impact',    name: 'Impact',      group: 'Display', css: 'Impact,Haettenschweiler,"Arial Black",sans-serif' },
    { key: 'stencil',   name: 'Stencil',     group: 'Display', css: 'Stencil,"Stencil Std","Arial Black",fantasy' },
    { key: 'phosphate', name: 'Phosphate',   group: 'Display', css: 'Phosphate,"Arial Narrow Bold",Impact,sans-serif' },
    { key: 'playbill',  name: 'Playbill',    group: 'Display', css: 'Playbill,Rockwell,"Arial Black",fantasy' },
    { key: 'luminari',  name: 'Luminari',    group: 'Display', css: 'Luminari,Herculanum,Papyrus,fantasy' },
    { key: 'herculanum',name: 'Herculanum',  group: 'Display', css: 'Herculanum,Luminari,Copperplate,fantasy' },
    { key: 'papyrus',   name: 'Papyrus',     group: 'Display', css: 'Papyrus,Herculanum,fantasy' },
    { key: 'jazz',      name: 'Jazz',        group: 'Display', css: '"Jazz LET","Party LET",Impact,fantasy' },
    { key: 'party',     name: 'Party',       group: 'Display', css: '"Party LET","Jazz LET","Comic Sans MS",fantasy' },
    { key: 'krungthep', name: 'Techno',      group: 'Display', css: 'Krungthep,"Silom","Courier New",monospace' },
    { key: 'bauhaus',   name: 'Geometric',   group: 'Display', css: '"Bauhaus 93","Century Gothic",Futura,sans-serif' },

    // script + hand
    { key: 'script',    name: 'Script',      group: 'Script & hand', css: '"Snell Roundhand","Brush Script MT",cursive' },
    { key: 'savoye',    name: 'Savoye',      group: 'Script & hand', css: '"Savoye LET","Snell Roundhand","Brush Script MT",cursive' },
    { key: 'zapfino',   name: 'Flourish',    group: 'Script & hand', css: 'Zapfino,"Savoye LET","Snell Roundhand",cursive' },
    { key: 'signpainter', name: 'Sign Painter', group: 'Script & hand', css: 'SignPainter,"Brush Script MT","Marker Felt",cursive' },
    { key: 'trattatello', name: 'Quill',     group: 'Script & hand', css: 'Trattatello,Herculanum,Papyrus,fantasy' },
    { key: 'hand',      name: 'Handwriting', group: 'Script & hand', css: '"Bradley Hand","Comic Sans MS",cursive' },
    { key: 'noteworthy',name: 'Noteworthy',  group: 'Script & hand', css: 'Noteworthy,"Bradley Hand","Comic Sans MS",cursive' },
    { key: 'marker',    name: 'Marker',      group: 'Script & hand', css: '"Marker Felt","Comic Sans MS",cursive' },
    { key: 'chalk',     name: 'Chalk',       group: 'Script & hand', css: 'Chalkduster,"Chalkboard SE","Comic Sans MS",fantasy' },
    { key: 'chalkboard',name: 'Chalkboard',  group: 'Script & hand', css: '"Chalkboard SE",Chalkboard,"Comic Sans MS",sans-serif' },
    { key: 'comic',     name: 'Comic',       group: 'Script & hand', css: '"Comic Sans MS","Chalkboard SE",cursive' },
    { key: 'skia',      name: 'Skia',        group: 'Script & hand', css: 'Skia,"Gill Sans","Trebuchet MS",sans-serif' },

    // mono
    { key: 'mono',      name: 'Monospace',   group: 'Mono',   css: '"SF Mono",Menlo,Consolas,"Courier New",monospace' },
    { key: 'typewriter',name: 'Typewriter',  group: 'Mono',   css: '"American Typewriter","Courier New",monospace' }
  ];

  CS.fontByKey = function (key) {
    for (var i = 0; i < CS.FONTS.length; i++) if (CS.FONTS[i].key === key) return CS.FONTS[i];
    return CS.FONTS[0];
  };
  CS.fontKey = function (v) { return CS.fontByKey(v).key; };

  /* ── element defaults ───────────────────────────────────────────── */
  var uid = 0;
  CS.newId = function (p) { return p + (Date.now().toString(36)) + (uid++).toString(36); };

  CS.newText = function (opts) {
    return Object.assign({
      id: CS.newId('t'), content: 'DABBA', font: 'grotesk', bold: true, italic: false,
      style: 'fill', strokeWidth: 0.8, size: 10, tracking: 0.6, lineHeight: 1.15,
      rotation: 0, align: 'center', x: 0, y: 0, color: '#16181d'
    }, opts || {});
  };

  CS.newArt = function (opts) {
    return Object.assign({
      id: CS.newId('a'), source: 'none', mode: 'auto', threshold: 0.5, size: 20,
      rotation: 0, mirror: false, x: 0, y: 0, color: '#4b8ef0'
    }, opts || {});
  };

  /* A compartment, sized by the object it holds. w/l/h are the object's own
     measurements; the fit clearance is added on top. `depth` null means
     "work it out from the object height". */
  CS.newSection = function (opts) {
    return Object.assign({
      id: CS.newId('s'), kind: 'section', name: '',
      w: 40, l: 30, h: 18, depth: null, shape: 'rect',
      alignX: 'center', alignY: 'center',
      grooves: { left: false, right: false, front: false, back: false },
      groove: { width: 18, depth: null }
    }, opts || {});
  };

  CS.newSplit = function (dir, children) {
    return { id: CS.newId('g'), kind: 'split', dir: dir, children: children };
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
    var c = CS.newSection({ name: 'Small', w: 28, l: 18, h: 10, shape: 'round' });
    return {
      name: 'case',
      build: 'case',            // 'case' = base + lid; 'tray' = base only
      gridfinity: { enabled: false, magnets: true },
      texture: {
        enabled: false, pattern: 'knurl', depth: 0.5, raise: 0, scale: 4, angle: 0, border: 1, engine: 'fine',
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
  CS.assets = { images: {}, drawings: {}, texture: null };

  CS.artBitmap = function (art) {
    if (!art) return null;
    if (art.source === 'image') return CS.assets.images[art.id] || null;
    if (art.source === 'draw') return CS.assets.drawings[art.id] || null;
    return null;
  };

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

  /* ── tiny helpers ───────────────────────────────────────────────── */
  CS.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  CS.lerp = function (a, b, t) { return a + (b - a) * t; };

  CS.get = function (obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  };
  CS.set = function (obj, path, val) {
    var ks = path.split('.'), last = ks.pop();
    var o = ks.reduce(function (o, k) { return o[k]; }, obj);
    o[last] = val;
  };

  CS.debounce = function (fn, ms) {
    var t = 0;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  CS.hexToRgb = function (hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  };

  /* Reusable offscreen canvas pool — avoids reallocating big buffers on every
     keystroke while the user drags a slider. */
  var pool = {};
  CS.scratch = function (key, w, h) {
    var c = pool[key];
    if (!c) { c = pool[key] = document.createElement('canvas'); }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    else { c.getContext('2d').clearRect(0, 0, w, h); }
    return c;
  };

  /* Grid: maps millimetres (origin at face centre, +y up) to raster pixels. */
  CS.makeGrid = function (w, h, ppmm) {
    var pad = 4; // mm of empty margin so contours never touch the raster edge
    var cols = Math.max(16, Math.ceil((w + pad * 2) * ppmm));
    var rows = Math.max(16, Math.ceil((h + pad * 2) * ppmm));
    return {
      ppmm: ppmm, cols: cols, rows: rows,
      ox: cols / 2, oy: rows / 2,
      w: w, h: h,
      px: function (mm) { return this.ox + mm * this.ppmm; },
      py: function (mm) { return this.oy - mm * this.ppmm; },
      mmx: function (px) { return (px - this.ox) / this.ppmm; },
      mmy: function (py) { return (this.oy - py) / this.ppmm; }
    };
  };

  /* Anything that carries colour needs real depth to read as solid: one or two
     layers is translucent and fragile, so 3 is the floor everywhere — raised
     text, engraved recesses and colour inlays alike. Depths snap up to whole
     layers so they land on slice boundaries. */
  CS.MIN_LAYERS = 3;

  CS.layerHeightOf = function (state) { return Math.max(0.02, state.layerHeight || 0.2); };

  /* Layer arithmetic is done in floats, where 3 * 0.2 is 0.6000000000000001.
     Rounding keeps that noise out of state and off the sliders. */
  function tidy(v) { return Math.round(v * 1e6) / 1e6; }
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

  /* Mirror a mask about the face's vertical centre line — how the underside is
     turned around so its text reads the right way when you flip the box over. */
  CS.mirrorMaskX = function (m, g) {
    if (!m) return null;
    var out = new Float32Array(m.length);
    for (var y = 0; y < g.rows; y++) {
      var row = y * g.cols, last = row + g.cols - 1;
      for (var x = 0; x < g.cols; x++) out[row + x] = m[last - x];
    }
    return out;
  };

  /* ── mask algebra (alpha 0..1 Float32Array) ─────────────────────── */
  CS.mask = {
    make: function (g) { return new Float32Array(g.cols * g.rows); },
    union: function (a, b) {
      if (!a) return b; if (!b) return a;
      var o = new Float32Array(a.length);
      for (var i = 0; i < a.length; i++) o[i] = a[i] > b[i] ? a[i] : b[i];
      return o;
    },
    sub: function (a, b) {           // a AND NOT b
      if (!a) return null; if (!b) return a;
      var o = new Float32Array(a.length);
      for (var i = 0; i < a.length; i++) o[i] = a[i] * (1 - b[i]);
      return o;
    },
    and: function (a, b) {
      if (!a || !b) return null;
      var o = new Float32Array(a.length);
      for (var i = 0; i < a.length; i++) o[i] = a[i] * b[i];
      return o;
    },
    empty: function (m) {
      if (!m) return true;
      for (var i = 0; i < m.length; i++) if (m[i] > 0.5) return false;
      return true;
    },
    /* Coverage in mm², handy for sanity checks. */
    area: function (m, g) {
      if (!m) return 0;
      var s = 0;
      for (var i = 0; i < m.length; i++) s += m[i];
      return s / (g.ppmm * g.ppmm);
    },
    /* Read the alpha channel of a canvas into a mask. */
    fromCanvas: function (canvas) {
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      var d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      var n = canvas.width * canvas.height, out = new Float32Array(n);
      for (var i = 0; i < n; i++) out[i] = d[i * 4 + 3] / 255;
      return out;
    },
    /* Zero the outermost ring so marching squares always yields closed loops. */
    sealEdges: function (m, g) {
      var c = g.cols, r = g.rows, i;
      for (i = 0; i < c; i++) { m[i] = 0; m[(r - 1) * c + i] = 0; }
      for (i = 0; i < r; i++) { m[i * c] = 0; m[i * c + c - 1] = 0; }
      return m;
    }
  };

})(window.CS);
