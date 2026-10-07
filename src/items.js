/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* items.js — what a compartment holds, as a set of simple pocket shapes.
 *
 * Every compartment is cut as one or more primitives, placed round its
 * centre: box, oval, capsule, hexagon, or a lying cylinder (a U-shaped
 * trough). Presets are generators — a battery holder is a grid of circles,
 * an air pump is a few cylinders on one axis — with a handful of settings.
 * "Custom" is the shape list itself, free to move, resize and rotate.
 *
 * Sizes are the object's own; the fit clearance is added here. A primitive
 * may carry its own pocket depth; otherwise it takes the compartment's,
 * which follows the seat rule (flush with the rim, or on the floor).
 */
window.CS = window.CS || {};
(function (CS) {
  'use strict';

  /* Standard sizes, mm: the largest a cell of the type is made to (IEC
     maximums where they exist), so any brand fits. A box is width × thickness
     × height. The menu follows BATTERY_ORDER (an object puts number-like
     keys such as '18650' first, whatever order they are written in). */
  var BATTERIES = {
    AA:     { d: 14.5, len: 50.5, label: 'AA' },
    AAA:    { d: 10.5, len: 44.5, label: 'AAA' },
    AAAA:   { d: 8.3,  len: 42.5, label: 'AAAA' },
    C:      { d: 26.2, len: 50,   label: 'C' },
    D:      { d: 34.2, len: 61.5, label: 'D' },
    N:      { d: 12,   len: 30.2, label: 'N' },
    A23:    { d: 10.3, len: 28.5, label: 'A23 (12 V)' },
    '4LR44':{ d: 13,   len: 25.2, label: '4LR44 (6 V)' },
    '9V':   { box: [26.5, 17.5, 48.5], label: '9 V' },
    '3LR12':{ box: [62, 22, 67], label: '4.5 V flat (3LR12)' },
    SubC:   { d: 22.2, len: 42.9, label: 'Sub-C' },
    '10440':{ d: 10.2, len: 44.5, label: '10440 Li-ion' },
    '14500':{ d: 14.5, len: 53.5, label: '14500 Li-ion' },
    '16340':{ d: 16.4, len: 34.5, label: '16340 / RCR123A' },
    '18350':{ d: 18.4, len: 36,   label: '18350 Li-ion' },
    '18500':{ d: 18.4, len: 50.5, label: '18500 Li-ion' },
    '18650':{ d: 18.6, len: 65.2, label: '18650' },
    '20700':{ d: 20.4, len: 70.5, label: '20700 Li-ion' },
    '21700':{ d: 21.4, len: 70.2, label: '21700' },
    '26650':{ d: 26.5, len: 65.8, label: '26650 Li-ion' },
    '32650':{ d: 32.4, len: 67.7, label: '32650 Li-ion' },
    '4680': { d: 46,   len: 80,   label: '4680 Li-ion' },
    CR123A: { d: 17,   len: 34.5, label: 'CR123A' },
    CR2:    { d: 15.6, len: 27,   label: 'CR2' },
    CR1220: { d: 12.5, len: 2,    coin: true, label: 'CR1220 coin' },
    CR1616: { d: 16,   len: 1.6,  coin: true, label: 'CR1616 coin' },
    CR1632: { d: 16,   len: 3.2,  coin: true, label: 'CR1632 coin' },
    CR2016: { d: 20,   len: 1.6,  coin: true, label: 'CR2016 coin' },
    CR2025: { d: 20,   len: 2.5,  coin: true, label: 'CR2025 coin' },
    CR2032: { d: 20,   len: 3.2,  coin: true, label: 'CR2032 coin' },
    CR2430: { d: 24.5, len: 3,    coin: true, label: 'CR2430 coin' },
    CR2450: { d: 24.5, len: 5,    coin: true, label: 'CR2450 coin' },
    CR2477: { d: 24.5, len: 7.7,  coin: true, label: 'CR2477 coin' },
    LR44:   { d: 11.6, len: 5.4,  coin: true, label: 'LR44 / AG13 button' },
    LR1130: { d: 11.6, len: 3.1,  coin: true, label: 'LR1130 / AG10 button' },
    LR41:   { d: 7.9,  len: 3.6,  coin: true, label: 'LR41 / AG3 button' },
    SR626:  { d: 6.8,  len: 2.6,  coin: true, label: 'SR626 / 377 button' }
  };
  var BATTERY_ORDER = ['AA', 'AAA', 'AAAA', 'C', 'D', 'N', 'A23', '4LR44', '9V', '3LR12', 'SubC',
    '10440', '14500', '16340', '18350', '18500', '18650', '20700', '21700', '26650', '32650', '4680',
    'CR123A', 'CR2', 'CR1220', 'CR1616', 'CR1632', 'CR2016', 'CR2025', 'CR2032', 'CR2430', 'CR2450', 'CR2477',
    'LR44', 'LR1130', 'LR41', 'SR626'];
  var batteryOption = function (k) {
    var b = BATTERIES[k], f = function (v) { return String(v); };
    return [k, b.label + ' — ' + (b.box ? b.box.map(f).join(' × ') : '⌀' + f(b.d) + ' × ' + f(b.len)) + ' mm'];
  };
  var CARDS = {
    SD:      { w: 24, t: 2.1, h: 32, label: 'SD card' },
    microSD: { w: 11, t: 1,   h: 15, label: 'microSD' },
    USB:     { w: 12.5, t: 4.6, h: 45, label: 'USB stick' },
    CF:      { w: 36.4, t: 3.3, h: 42.8, label: 'CompactFlash' }
  };
  CS.BATTERIES = BATTERIES;
  CS.CARDS = CARDS;

  /* The library. `params` drive the sidebar: [key, label, default, min, max,
     step] for numbers, or { key, label, options } for a choice. Box, Round
     and Capsule use the compartment's own width / length / height fields. */
  CS.ITEMS = [
    { key: 'box', name: 'Box', group: 'Basic', hint: 'Phone, power bank, multimeter — anything boxy.', size: true },
    { key: 'round', name: 'Round / oval', group: 'Basic', hint: 'Jar, standing bottle, tape roll.', size: true },
    { key: 'capsule', name: 'Capsule', group: 'Basic', hint: 'Pen, toothbrush, glasses, a remote.', size: true },
    { key: 'cylinder', name: 'Lying cylinder', group: 'Tools & gadgets',
      hint: 'Torch, bottle, rolled-up cable — anything round lying on its side.',
      params: [['d', 'Diameter', 40, 3, 200, 0.5], ['len', 'Length', 120, 5, 400, 0.5]] },
    { key: 'stepped', name: 'Stepped cylinder', group: 'Tools & gadgets',
      hint: 'Battery air pump, screwdriver, drill, a bottle with a cap: round sections of different sizes on one axis, end to end.',
      segments: true },
    { key: 'batteries', name: 'Battery holder', group: 'Batteries & small parts',
      hint: 'A grid of batteries, standing or lying. Batteries are a standard size, so each hole is ' +
            'automatic: as deep as the battery, up to what the base allows (the base share of the height ' +
            'sets that), and the lid takes the rest.',
      params: [{ key: 'type', label: 'Battery', options: BATTERY_ORDER.map(batteryOption), def: 'AA' },
               ['rows', 'Rows', 2, 1, 20, 1], ['cols', 'Columns', 4, 1, 30, 1],
               { key: 'lying', label: 'Orientation', options: [['no', 'Standing'], ['yes', 'Lying']] },
               ['gap', 'Wall between', 1.6, 0.6, 10, 0.1]] },
    { key: 'bits', name: 'Hex bit holder', group: 'Batteries & small parts',
      hint: 'Standard ¼″ hex screwdriver bits (6.35 mm across flats), standing.',
      params: [['rows', 'Rows', 2, 1, 20, 1], ['cols', 'Columns', 8, 1, 40, 1],
               ['size', 'Across flats', 6.35, 3, 20, 0.05], ['length', 'Bit length', 25, 10, 120, 0.5],
               ['depth', 'Hold depth', 10, 3, 60, 0.5], ['gap', 'Wall between', 2, 0.8, 10, 0.1]] },
    { key: 'cards', name: 'Card slots', group: 'Batteries & small parts',
      hint: 'Memory cards or USB sticks, standing in a row of slots.',
      params: [{ key: 'type', label: 'Card', options: Object.keys(CARDS).map(function (k) { return [k, CARDS[k].label]; }) },
               ['count', 'Slots', 6, 1, 40, 1], ['hold', 'Hold depth', 60, 20, 100, 5, '%'], ['gap', 'Wall between', 1.6, 0.6, 10, 0.1]] },
    { key: 'custom', name: 'Custom shapes', group: 'Custom',
      hint: 'Build the pocket from basic shapes: drag them in the plan, resize from any edge or corner, turn with the round grip.',
      custom: true }
  ];
  CS.itemByKey = function (k) {
    for (var i = 0; i < CS.ITEMS.length; i++) if (CS.ITEMS[i].key === k) return CS.ITEMS[i];
    return CS.ITEMS[0];
  };

  CS.PRIMS = [['rect', 'Box'], ['round', 'Oval'], ['capsule', 'Capsule'], ['hex', 'Hexagon'], ['cyl', 'Lying cylinder']];

  CS.newPrim = function (type, opts) {
    var base = { rect: [40, 30], round: [30, 30], capsule: [60, 16], hex: [10, 10], cyl: [80, 30] }[type] || [30, 30];
    return Object.assign({ type: type, x: 0, y: 0, w: base[0], l: base[1], rot: 0, depth: null }, opts || {});
  };

  /* Settings of the item a compartment holds, defaults filled in. */
  CS.itemParams = function (s) {
    var it = CS.itemByKey(s.item), p = Object.assign({}, (s.params && s.params[it.key]) || {});
    (it.params || []).forEach(function (d) {
      var key = Array.isArray(d) ? d[0] : d.key, def = Array.isArray(d) ? d[2] : d.def != null ? d.def : d.options[0][0];
      if (p[key] == null) p[key] = def;
    });
    if (it.segments && !Array.isArray(p.segs)) p.segs = [{ d: 45, len: 110 }, { d: 24, len: 30 }, { d: 9, len: 28 }];
    return p;
  };

  function grid(rows, cols, pw, pl, make) {
    var out = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      out.push(make((c - (cols - 1) / 2) * pw, ((rows - 1) / 2 - r) * pl));
    }
    return out;
  }

  /* A compartment's shapes. Returns
       { w, l, h, prims: [{ type, x, y, w, l, rot, depth, axis }], fill }
     w × l is the footprint the layout reserves (fit included); h the height
     of the object, for headroom and the seat rule. `fill` marks the plain
     box / oval, which keep the old behaviour of growing to fill a slot. */
  CS.itemShape = function (s, fit) {
    var it = CS.itemByKey(s.item || (s.shape === 'round' ? 'round' : 'box'));
    var p = CS.itemParams(s), f2 = 2 * fit, prims = [], h = s.h;

    if (it.key === 'box' || it.key === 'round') {
      return { w: s.w + f2, l: s.l + f2, h: s.h, fill: true, prims: [{ type: it.key === 'round' ? 'round' : 'rect' }] };
    }
    if (it.key === 'capsule') {
      prims.push({ type: 'capsule', x: 0, y: 0, w: s.w + f2, l: s.l + f2, rot: 0 });
    } else if (it.key === 'cylinder') {
      prims.push({ type: 'cyl', x: 0, y: 0, w: p.len + f2, l: p.d + f2, rot: 0 });
      h = p.d;
    } else if (it.key === 'stepped') {
      var segs = p.segs.filter(function (q) { return q.d > 0 && q.len > 0; });
      if (!segs.length) segs = [{ d: 40, len: 100 }];
      var total = segs.reduce(function (a, q) { return a + q.len; }, 0) + f2, dmax = 0, at = -total / 2;
      segs.forEach(function (q) { dmax = Math.max(dmax, q.d); });
      segs.forEach(function (q, i) {
        // Segments meet end to end; the ends get the clearance, inner joins none.
        var len = q.len + (i === 0 ? fit : 0) + (i === segs.length - 1 ? fit : 0);
        prims.push({ type: 'cyl', x: at + len / 2, y: 0, w: len, l: q.d + f2, rot: 0, axis: (dmax + f2) / 2 });
        at += len;
      });
      h = dmax;
    } else if (it.key === 'batteries') {
      var b = BATTERIES[p.type] || BATTERIES.AA, lying = p.lying === 'yes', gap = p.gap;
      if (b.box) {
        var bw = b.box[0] + f2, bt = b.box[1] + f2, bl = b.box[2];
        if (lying) prims = grid(p.rows, p.cols, bl + f2 + gap, bw + gap, function (x, y) { return { type: 'rect', x: x, y: y, w: bl + f2, l: bw, rot: 0 }; });
        else prims = grid(p.rows, p.cols, bw + gap, bt + gap, function (x, y) { return { type: 'rect', x: x, y: y, w: bw, l: bt, rot: 0 }; });
        h = lying ? b.box[1] : bl;
      } else if (b.coin) {
        var cd = b.d + f2;
        prims = grid(p.rows, p.cols, cd + gap, cd + gap, function (x, y) { return { type: 'round', x: x, y: y, w: cd, l: cd, rot: 0 }; });
        h = b.len;
      } else if (lying) {
        prims = grid(p.rows, p.cols, b.len + f2 + gap, b.d + f2 + gap, function (x, y) { return { type: 'cyl', x: x, y: y, w: b.len + f2, l: b.d + f2, rot: 0 }; });
        h = b.d;
      } else {
        var dd = b.d + f2;
        prims = grid(p.rows, p.cols, dd + gap, dd + gap, function (x, y) { return { type: 'round', x: x, y: y, w: dd, l: dd, rot: 0 }; });
        h = b.len;
      }
    } else if (it.key === 'bits') {
      var af = p.size + f2, pitchX = af * 1.1547 + p.gap, pitchY = af + p.gap;
      prims = grid(p.rows, p.cols, pitchX, pitchY, function (x, y) { return { type: 'hex', x: x, y: y, w: af, l: af, rot: 0, depth: p.depth }; });
      h = p.length;
    } else if (it.key === 'cards') {
      var cdef = CARDS[p.type] || CARDS.SD;
      prims = grid(1, p.count, cdef.t + f2 + p.gap, 0, function (x, y) {
        return { type: 'rect', x: x, y: y, w: cdef.t + f2, l: cdef.w + f2, rot: 0, depth: cdef.h * p.hold / 100 };
      });
      h = cdef.h;
    } else if (it.key === 'custom') {
      var list = Array.isArray(s.prims) && s.prims.length ? s.prims : [CS.newPrim('rect')];
      prims = list.map(function (q) {
        return { type: q.type, x: q.x, y: q.y, w: q.w + f2, l: (q.type === 'hex' ? q.w : q.l) + f2, rot: q.rot || 0,
                 depth: q.depth, src: q };
      });
      h = s.h;
    }

    // Footprint: the bounding box of every shape, turned as placed.
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    prims.forEach(function (q) {
      var e = primExtent(q);
      x0 = Math.min(x0, q.x - e[0]); x1 = Math.max(x1, q.x + e[0]);
      y0 = Math.min(y0, q.y - e[1]); y1 = Math.max(y1, q.y + e[1]);
    });
    if (!isFinite(x0)) { x0 = y0 = -5; x1 = y1 = 5; }
    // Centre the shapes on their footprint, so the layout can place it.
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    prims.forEach(function (q) { q.x -= mx; q.y -= my; });
    return { w: x1 - x0, l: y1 - y0, h: h, prims: prims, shift: [mx, my] };
  };

  /* Half-extents of a turned shape along x and y. */
  function primExtent(q) {
    var a = (q.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    var hw = q.w / 2, hl = q.l / 2;
    if (q.type === 'hex') {
      // circumradius from across-flats; a hexagon's extent depends on its turn
      var R = q.w / Math.sqrt(3), best = [0, 0];
      for (var i = 0; i < 6; i++) {
        var t = a + i * Math.PI / 3;
        best[0] = Math.max(best[0], Math.abs(R * Math.cos(t)));
        best[1] = Math.max(best[1], Math.abs(R * Math.sin(t)));
      }
      return best;
    }
    if (q.type === 'round') return [Math.hypot(hw * c, hl * s), Math.hypot(hw * s, hl * c)];
    return [hw * c + hl * s, hw * s + hl * c];
  }
  CS.primExtent = primExtent;

  /* Outline of a shape in the compartment's plane, for drawing and hit tests:
     [[x, y], …] round its centre, already turned. */
  CS.primOutline = function (q, seg) {
    seg = seg || 32;
    var pts = [], a = (q.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), i;
    var hw = q.w / 2, hl = q.l / 2;
    if (q.type === 'round') {
      for (i = 0; i < seg; i++) { var t = i / seg * 2 * Math.PI; pts.push([hw * Math.cos(t), hl * Math.sin(t)]); }
    } else if (q.type === 'hex') {
      var R = q.w / Math.sqrt(3);
      for (i = 0; i < 6; i++) { var th = i * Math.PI / 3; pts.push([R * Math.cos(th), R * Math.sin(th)]); }
    } else if (q.type === 'capsule') {
      var r = Math.min(hw, hl), ex = hw - r, ey = hl - r, n = Math.max(4, seg / 4);
      [[ex, ey, 0], [-ex, ey, 90], [-ex, -ey, 180], [ex, -ey, 270]].forEach(function (k) {
        for (var j = 0; j <= n; j++) { var an = (k[2] + 90 * j / n) * Math.PI / 180; pts.push([k[0] + r * Math.cos(an), k[1] + r * Math.sin(an)]); }
      });
    } else {
      pts = [[hw, -hl], [hw, hl], [-hw, hl], [-hw, -hl]];
    }
    return pts.map(function (p) { return [q.x + p[0] * c - p[1] * s, q.y + p[0] * s + p[1] * c]; });
  };

  /* One-line description of what a compartment holds, for lists and labels. */
  CS.itemSummary = function (s) {
    var it = CS.itemByKey(s.item), p = CS.itemParams(s), f = function (v) { return String(Math.round(v * 10) / 10); };
    if (it.size) return f(s._size ? s._size.w : s.w) + '×' + f(s._size ? s._size.l : s.l) + '×' + f(s.h);
    if (it.key === 'cylinder') return '⌀' + f(p.d) + ' × ' + f(p.len);
    if (it.key === 'stepped') return p.segs.length + ' sections, ⌀' + f(Math.max.apply(null, p.segs.map(function (q) { return q.d; }))) + ' max';
    if (it.key === 'batteries') return p.rows * p.cols + ' × ' + (BATTERIES[p.type] || BATTERIES.AA).label + (p.lying === 'yes' ? ' lying' : '');
    if (it.key === 'bits') return p.rows * p.cols + ' hex bits';
    if (it.key === 'cards') return p.count + ' × ' + (CARDS[p.type] || CARDS.SD).label;
    if (it.key === 'custom') return ((s.prims && s.prims.length) || 1) + ' shape' + ((s.prims && s.prims.length) === 1 ? '' : 's');
    return '';
  };

})(window.CS);
