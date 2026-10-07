/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* app.js — UI wiring: declarative bindings, the two views, live mesh, export. */
(function (CS) {
  'use strict';

  var state = CS.defaults();
  var plan, face, viewer, drawpad;
  var lastModel = null;
  var planMode = 'plan';
  var D = null;                  // CS.describe(state), refreshed on every apply()

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* Derived fields (prefixed _) are recomputed on every build; keep them out
     of saves, undo snapshots and change detection. */
  CS.serialize = function (s) {
    return JSON.stringify(s, function (k, v) { return k.charAt(0) === '_' ? undefined : v; });
  };

  /* ── markup helpers ─────────────────────────────────────────────── */
  /* <div class="row num" data-num="path" …>Label</div> becomes a label, a
     number field for exact values and a slider for quick ones, both bound to
     the same setting. */
  function expandNums() {
    $$('[data-num]').forEach(function (row, i) {
      var path = row.dataset.num, id = 'n' + i + '-' + path.replace(/[^\w]/g, '-');
      var lab = document.createElement('label');
      lab.htmlFor = id;
      lab.innerHTML = row.innerHTML.trim();
      row.innerHTML = '';
      var nf = document.createElement('span');
      nf.className = 'nf';
      nf.dataset.unit = row.dataset.unit || '';
      var num = document.createElement('input');
      if (row.dataset.id) { id = row.dataset.id; lab.htmlFor = id; }
      num.type = 'number'; num.id = id; num.dataset.bind = path; num.step = row.dataset.step;
      num.min = row.dataset.min; num.max = row.dataset.max;
      if (row.dataset.scale) num.dataset.scale = row.dataset.scale;   // shown ×scale, e.g. 0.6 as 60 %
      if (row.dataset.range) num.dataset.range = row.dataset.range;
      nf.appendChild(num);
      row.appendChild(lab); row.appendChild(nf);
    });
  }

  /* ── drag to change a number ────────────────────────────────────────
     As in Unity's inspector: the label, and the left and right edges of the
     box, are drag handles. Drag sideways to change the value — Shift for big
     steps, Alt for fine ones; click the middle of the box to type. */



  function bindScrubbing() {
    $$('input[type=number]').forEach(function (input) {
      var label = null;
      var row = input.closest('.row.num');
      if (row) label = $('label', row);
      var trio = input.closest('.trio label');
      if (trio) label = $('span', trio);
      WB.scrubbable(input, label);
    });
  }

  function populate() {
    var bs = $('#f-b-style');
    WB.BORDER_STYLES.forEach(function (st) {
      var o = document.createElement('option');
      o.value = st[0]; o.textContent = st[1];
      bs.appendChild(o);
    });

    var hs = $('#f-s-item'), hgroups = {};
    CS.ITEMS.forEach(function (it) {
      var g = hgroups[it.group];
      if (!g) { g = hgroups[it.group] = document.createElement('optgroup'); g.label = it.group; hs.appendChild(g); }
      var o = document.createElement('option');
      o.value = it.key; o.textContent = it.name;
      g.appendChild(o);
    });

    var tx = $('#f-tex');
    CS.TEXTURES.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t[0]; o.textContent = t[1];
      tx.appendChild(o);
    });
    $$('.texsel').forEach(function (sel) {
      [['all', 'Same as above'], ['none', 'None']].concat(CS.TEXTURES).forEach(function (t) {
        var o = document.createElement('option');
        o.value = t[0]; o.textContent = t[1];
        sel.appendChild(o);
      });
    });

    var fs = $('#font-select'), groups = {};
    WB.FONTS.forEach(function (f) {
      var g = groups[f.group];
      if (!g) {
        g = groups[f.group] = document.createElement('optgroup');
        g.label = f.group;
        fs.appendChild(g);
      }
      var o = document.createElement('option');
      o.value = f.key; o.textContent = f.name;
      o.style.fontFamily = f.css;      // preview the face in the dropdown
      g.appendChild(o);
    });
  }

  /* ── paths ──────────────────────────────────────────────────────────
     Prefixes address whatever is being edited right now:
       ~s.  the selected compartment      ~.   the active face
       ~t.  its selected text             ~a.  its selected picture */
  function faceNow() { return state.faces[state.activeFace]; }
  function sectionNow() {
    var hit = CS.layout.find(state.layout, state.selected);
    return hit && hit.node.kind === 'section' ? hit.node : null;
  }

  function target(path) {
    var root = state, p = path, f = faceNow();
    if (p.indexOf('~s.') === 0) { root = sectionNow(); p = p.slice(3); }
    else if (p.indexOf('~t.') === 0) { root = (f.texts || [])[f.textIdx || 0]; p = p.slice(3); }
    else if (p.indexOf('~a.') === 0) { root = (f.arts || [])[f.artIdx || 0]; p = p.slice(3); }
    else if (p.indexOf('~.') === 0) { root = f; p = p.slice(2); }
    if (!root) return null;
    var ks = p.split('.'), last = ks.pop();
    var o = ks.reduce(function (o2, k) { return o2 == null ? o2 : o2[k]; }, root);
    return o == null ? null : { o: o, k: last };
  }
  function getV(path) { var t = target(path); return t ? t.o[t.k] : undefined; }
  function setV(path, v) { var t = target(path); if (t) t.o[t.k] = v; }

  function coerce(path, raw) {
    var cur = getV(path);
    if (typeof cur === 'number') return parseFloat(raw);
    if (typeof cur === 'boolean') return !!raw;
    return raw;
  }

  /* ── undo / redo ────────────────────────────────────────────────────
     The whole design is small and JSON-safe, so history is just a stack of
     snapshots. A burst of changes from dragging one slider is coalesced into a
     single step: the pre-edit snapshot is captured once at the start of the
     burst and only committed after things go quiet. */

  function snapshot() {
    return {
      state: CS.serialize(state),
      assets: { images: Object.assign({}, CS.assets.images),
                drawings: Object.assign({}, CS.assets.drawings), texture: CS.assets.texture }
    };
  }


  function restore(snap) {
    var s = JSON.parse(snap.state);
    // Assign in place so anything holding a reference to `state` stays valid.
    Object.keys(state).forEach(function (k) { if (!(k in s)) delete state[k]; });
    Object.keys(s).forEach(function (k) { state[k] = s[k]; });
    CS.assets.images = Object.assign({}, snap.assets.images);
    CS.assets.drawings = Object.assign({}, snap.assets.drawings);
    CS.assets.texture = snap.assets.texture || null;
    dropDrags();
    face.invalidateBorder();
    refresh();
    apply();
  }

  /* Call immediately BEFORE mutating state. */
  var undoHistory = null;           // set up in init(), once the buttons exist
  /* Call immediately BEFORE changing the design. */
  function beginEdit(coalesceMs) { if (undoHistory) undoHistory.begin(coalesceMs); }
  /* Load a design as one undo step. Loading can wait on pictures, so the step
     stays open until it is in. */
  function loadAsStep(payload, after) {
    if (undoHistory) undoHistory.commit();             // close any edit still pending first
    beginEdit(600000);
    loadPayload(payload, function () { after(); if (undoHistory) undoHistory.commit(); });
  }





  /* Text fields have their own native undo; leave those alone. */

  function bindHistory() {
    undoHistory = new WB.History({ snapshot: snapshot, restore: restore,
                               undoButton: $('#btn-undo'), redoButton: $('#btn-redo') });
    undoHistory.bind();
  }

  /* ── reset a section ────────────────────────────────────────────────
     Every setting the panel shows goes back to its default. What a
     compartment is (its name, what it holds, its size and custom shapes) and
     what you typed or uploaded are kept: those are yours, not settings. */
  var KEEP = /^~s\.(name|item|w|l|h|params|prims)\b|^~t\.(content)$|^~a\.(source|id)$|^name$/;
  function defaultFor(path) {
    var src, p = path;
    if (p.indexOf('~s.') === 0) { src = CS.newSection(); p = p.slice(3); }
    else if (p.indexOf('~t.') === 0) { src = CS.newText(); p = p.slice(3); }
    else if (p.indexOf('~a.') === 0) { src = CS.newArt(); p = p.slice(3); }
    else if (p.indexOf('~.') === 0) { src = CS.faceDefaults(state.activeFace); p = p.slice(2); }
    else src = CS.defaults();
    return WB.get(src, p);
  }
  function resetPanel(panel) {
    var paths = WB.panelPaths(panel).filter(function (p) { return !KEEP.test(p) && getV(p) !== undefined; });
    var changed = paths.filter(function (p) {
      var d = defaultFor(p);
      return d !== undefined && JSON.stringify(d) !== JSON.stringify(getV(p));
    });
    var s = sectionNow(), depthToo = panel.id === 'p-compartment' && s && s.depth != null;
    if (!changed.length && !depthToo) return;
    beginEdit(0);
    changed.forEach(function (p) {
      var d = defaultFor(p);
      setV(p, d && typeof d === 'object' ? JSON.parse(JSON.stringify(d)) : d);
    });
    if (depthToo) s.depth = null;                  // pocket depth back to automatic
    if (panel.id === 'p-decor' || panel.id === 'p-colours') face.invalidateBorder();
    itemSig = '';
    refresh();
    apply();
  }

  /* ── declarative two-way binding ───────────────────────────────── */
  function bind() { $$('[data-bind]').forEach(bindEl); }

  function bindEl(el) {
      if (el._bound) return;
      el._bound = true;
      var path = el.dataset.bind;

      if (el.classList.contains('seg')) {
        $$('button', el).forEach(function (b) {
          b.addEventListener('click', function () {
            if (getV(path) === undefined) return;
            beginEdit(0);
            setV(path, coerce(path, b.value));
            syncSeg(el, path);
            onEdit(path, el);
          });
        });
        return;
      }

      var ev = (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'color')
        ? 'change' : 'input';
      el.addEventListener(ev, function () {
        if (getV(path) === undefined) return;   // no such element selected
        var v = el.type === 'checkbox' ? el.checked : el.value;
        // An empty nullable number means "automatic".
        if (el.dataset.nullable != null) v = el.value === '' ? null : parseFloat(el.value);
        else v = coerce(path, v);
        if (typeof v === 'number' && !isFinite(v)) return;   // half-typed number
        if (el.type === 'number' && v != null) {
          // Below the minimum may be a value still being typed ("1" on the
          // way to "12"), so wait; over the maximum is capped straight away.
          if (el.min !== '' && v < parseFloat(el.min)) return;
          if (el.max !== '' && v > parseFloat(el.max)) v = parseFloat(el.max);
          v /= +(el.dataset.scale || 1);
        }
        // Sliders and typing coalesce into one undo step; discrete pickers don't.
        var continuous = el.type === 'range' || el.type === 'number' || el.tagName === 'TEXTAREA' ||
                         el.type === 'text' || el.type === 'color';
        beginEdit(continuous ? 450 : 0);
        setV(path, v);
        onEdit(path, el);
      });
      if (el.type === 'number') {
        // Settle the field once typing is done, pulling a too-small value up.
        el.addEventListener('change', function () {
          var v = parseFloat(el.value), k = +(el.dataset.scale || 1);
          if (isFinite(v) && el.min !== '' && v < parseFloat(el.min) && getV(path) !== undefined) {
            beginEdit(0); setV(path, parseFloat(el.min) / k); onEdit(path, el);
          }
          refreshValues();
        });
      }
  }

  function syncSeg(el, path) {
    var v = String(getV(path));
    $$('button', el).forEach(function (b) { b.classList.toggle('on', b.value === v); });
  }

  /* Push state → DOM. `except` (the element being typed in) is left alone so
     its caret and half-typed value survive. */
  function refreshValues(except) {
    $$('[data-bind]').forEach(function (el) {
      if (el === except) return;
      var path = el.dataset.bind, v = getV(path);
      if (el.classList.contains('seg')) { syncSeg(el, path); return; }
      if (v === undefined || (v === null && el.dataset.nullable == null)) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'number') el.value = v == null ? '' : Math.round(v * (+el.dataset.scale || 1) * 1000) / 1000;
      else el.value = v;
    });
    var sn = sectionNow();
    if (sn) { paintFill(sn); paintPosition(sn); }
    paintBedPreset();
  }

  /* The printer list shows the bed it matches, or Custom. */
  function paintBedPreset() {
    var sel = $('#bed-preset'), b = state.bed;
    if (!sel || !b) return;
    var key = b.w + 'x' + b.d;
    sel.value = [].some.call(sel.options, function (o) { return o.value === key; }) ? key : 'custom';
  }
  function paintBedToggle() {
    var print = state.build === 'tray' || ($('#pose .on') || {}).value === 'print';
    $('#bed-wrap').style.display = print ? '' : 'none';
  }

  function refresh() {
    D = CS.describe(state);
    updateRanges();
    refreshValues();
    paintColours();
  }

  function labels() {
    var pct = Math.round(state.split * 100);
    $('#split-readout').textContent = 'The lid takes the other ' + (100 - pct) + ' %.';
  }

  /* Slider limits that depend on the design. */
  function updateRanges() {
    var lim = Math.ceil(Math.max(D.W, D.L) / 2) + 5;
    $$('[data-range=pos]').forEach(function (el) {
      el.min = -lim; el.max = lim;
    });

    /* Decoration depth follows wall thickness and layer height, so it only
       ever lands on whole layers and always leaves a floor behind. */
    var f = faceNow();
    var wallT = state.activeFace === 'lid' ? D.top : D.bottom;
    var lh = D.lh, minD = CS.minDepthOf(state);
    var lay = function (v) { return CS.tidy(Math.round(v / lh) * lh); };
    var maxCut = Math.max(minD, CS.tidy(Math.floor((wallT - minD) / lh + 1e-6) * lh));
    f.inlayDepth = WB.clamp(lay(f.inlayDepth), minD, maxCut);
    var maxRelief = f.relief === 'engraved' ? maxCut : 3;
    f.reliefHeight = WB.clamp(lay(f.reliefHeight), minD, Math.max(minD, maxRelief));
    [['#f-inlayDepth', f.inlayDepth, maxCut], ['#f-reliefHeight', f.reliefHeight, Math.max(minD, maxRelief)]]
      .forEach(function (q) {
        var el = $(q[0]);
        el.min = minD.toFixed(2); el.max = q[2].toFixed(2); el.step = lh.toFixed(2); el.value = q[1];
      });
    var rel = CS.faceRelief(state, f, wallT);
    var depthTxt = 'Works out to ' + rel.depth.toFixed(2) + ' mm, which is ' + rel.snap.layers + ' layers of ' + lh.toFixed(2) + ' mm.';
    $('#lbl-inlay').textContent = depthTxt;
    $('#lbl-relief').textContent = depthTxt;
    $('#face-hint').textContent = f.relief === 'raised'
      ? 'Stands ' + rel.depth.toFixed(2) + ' mm proud of the face.'
      : 'Cut into a ' + wallT.toFixed(2) + ' mm ' + (state.activeFace === 'lid' ? 'lid top' : 'floor') +
        ', keeping at least ' + minD.toFixed(2) + ' mm (' + CS.MIN_LAYERS + ' layers) behind it.' +
        (rel.snap.tooThin ? ' Too thin for that — thicken the wall.' : '');

    var wavy = WB.isWavyBorder(f.border.style);
    var gl = $('#lbl-b-gap'), dl = $('#lbl-b-dashes');
    if (gl) gl.textContent = wavy ? 'Wave depth' : 'Gap';
    if (dl) dl.textContent = wavy ? 'Waves' : 'Count';
  }

  /* Conditional rows. */
  function visibility() {
    $$('[data-show],[data-hide]').forEach(function (el) {
      var show = true;
      if (el.dataset.show) show = match(el.dataset.show);
      if (el.dataset.hide && match(el.dataset.hide)) show = false;
      el.style.display = show ? '' : 'none';
    });
    paintBedToggle();
  }
  function match(rule) {
    var i = rule.indexOf(':');
    var path = rule.slice(0, i), vals = rule.slice(i + 1).split('|');
    return vals.indexOf(String(getV(path))) >= 0;
  }

  /* ── compartments ───────────────────────────────────────────────── */
  function select(id, quiet) {
    if (!id || id === state.selected) return;
    state.selected = id;
    refreshValues();
    apply({ rebuild: false });
    if (!quiet) setPlanMode('plan');
  }

  /* whole: along a whole side of the case rather than beside this one. */
  function addSection(side, whole) {
    var s = sectionNow();
    if (!s && !whole) return;
    beginEdit(0);
    var res = whole ? CS.layout.addAtSide(state.layout, side, s)
                    : CS.layout.addNeighbor(state.layout, s.id, side);
    state.layout = res.root;
    if (res.id) state.selected = res.id;
    refresh();
    apply();
  }

  function removeSection(id) {
    var secs = CS.layout.sections(state.layout);
    if (secs.length <= 1) return;
    beginEdit(0);
    var i = secs.map(function (s) { return s.id; }).indexOf(id);
    state.layout = CS.layout.remove(state.layout, id);
    var left = CS.layout.sections(state.layout);
    state.selected = (left[Math.max(0, Math.min(i, left.length - 1))] || left[0]).id;
    refresh();
    apply();
  }

  function paintSections() {
    var secs = CS.layout.sections(state.layout);
    var box = $('#sec-list');
    box.innerHTML = '';
    secs.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'itemrow' + (s.id === state.selected ? ' on' : '');
      b.innerHTML = '<span class="dot"></span><span class="txt"></span><span class="num"></span>';
      var roundish = s.item === 'round' || s.item === 'cylinder' || s.item === 'stepped' || s.item === 'batteries';
      $('.dot', b).style.background = roundish ? 'transparent' : 'var(--ink3)';
      $('.dot', b).style.borderRadius = roundish ? '50%' : '3px';
      $('.dot', b).style.boxShadow = 'inset 0 0 0 2px var(--ink3)';
      $('.txt', b).textContent = s.name || 'Compartment ' + (i + 1);
      $('.num', b).textContent = CS.itemSummary(s);
      b.addEventListener('click', function () { select(s.id, true); });
      box.appendChild(b);
    });
    $('#cap-sections').textContent = secs.length + (secs.length === 1 ? ' compartment' : ' compartments');

    var s = sectionNow();
    $('#sec-editor').hidden = !s;
    if (!s) return;
    paintItem(s);
    paintFill(s);
    paintPosition(s);
    // Battery holes are always automatic: the base share sets them.
    var fixed = s.item === 'batteries', auto = s.depth == null || fixed;
    $('#sec-depth-auto').checked = auto;
    $('#sec-depth-auto').disabled = fixed;
    var dEl = $('#sec-depth');
    if (document.activeElement !== dEl) dEl.value = s._depth != null ? s._depth : '';
    dEl.disabled = auto;
    $('#sec-depth-now').textContent = s._depth != null ? s._depth.toFixed(2) + ' mm' : '';
    var up = (s._shape ? s._shape.h : s.h) - (s._depth || 0);
    $('#sec-depth-hint').textContent = (fixed
      ? 'Batteries are a standard size, so the holes go as deep as the base allows (' + D.Hb.toFixed(1) +
        ' mm): set the base share of the height to change it.'
      : auto
      ? (state.seat === 'flush' ? 'Matched to the object, up to the full ' + D.Hb.toFixed(1) + ' mm the base allows.'
                                : 'Reaches the floor: the full ' + D.Hb.toFixed(1) + ' mm of the base.')
      : 'Custom; the base allows up to ' + D.Hb.toFixed(1) + ' mm.') +
      (up > 0.05 ? ' The object stands ' + up.toFixed(1) + ' mm above the rim, into the lid.' : '');

    var gf = Math.max(0, state.fit), own = isFinite(s.fit) ? +s.fit : 0;
    $('#sec-fit-hint').textContent = 'Added to the global ' + gf.toFixed(2) + ' mm under Fit & height; negative for a snugger fit. ' +
      'This pocket: ' + (s._fit != null ? s._fit : Math.max(0, gf + own)).toFixed(2) + ' mm each side' +
      (gf + own < 0 ? ' (it can\'t go below zero).' : '.');

    var nAuto = s.groove.depth == null;
    $('#notch-depth-auto').checked = nAuto;
    var nEl = $('#notch-depth');
    if (document.activeElement !== nEl) {
      nEl.value = nAuto ? Math.round(Math.max(1, (s._depth || 0) * 0.7) * 10) / 10 : s.groove.depth;
    }
    nEl.disabled = nAuto;

    var hit = CS.layout.find(state.layout, s.id);
    var sib = hit && hit.parent ? hit.parent.children.length : 1;
    $('[data-move="-1"]').disabled = !hit || !hit.parent || hit.index === 0;
    $('[data-move="1"]').disabled = !hit || !hit.parent || hit.index >= sib - 1;
    $('#btn-del-sec').disabled = CS.layout.sections(state.layout).length <= 1;
  }

  function fmt(v) { return String(Math.round(v * 10) / 10); }

  /* ── what a compartment holds ─────────────────────────────────────── */
  /* The settings under "Holds" depend on the item, so they are built here and
     rebuilt only when the item (or the number of sections / shapes) changes —
     never while you type in one of them. */
  var itemSig = '';
  function numField(label, path, opts) {
    opts = opts || {};
    var wrap = document.createElement('label');
    wrap.className = 'pf';
    wrap.innerHTML = '<span></span><span class="nf"><input type="number"></span>';
    wrap.firstChild.textContent = label;
    var nf = wrap.lastChild, inp = nf.firstChild;
    nf.dataset.unit = opts.unit == null ? 'mm' : opts.unit;
    inp.dataset.bind = path;
    inp.step = opts.step || 0.1;
    if (opts.min != null) inp.min = opts.min;
    if (opts.max != null) inp.max = opts.max;
    if (opts.nullable) { inp.dataset.nullable = ''; inp.placeholder = 'auto'; }
    return wrap;
  }
  function selField(label, path, options) {
    var wrap = document.createElement('label');
    wrap.className = 'pf';
    wrap.innerHTML = '<span></span><select></select>';
    wrap.firstChild.textContent = label;
    var sel = wrap.lastChild;
    sel.dataset.bind = path;
    options.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      sel.appendChild(op);
    });
    return wrap;
  }
  function smallBtn(text, cls, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'ghost ' + (cls || ''); b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  function paintItem(s) {
    var it = CS.itemByKey(s.item);
    $('#item-hint').textContent = it.hint || '';
    $('#item-size').style.display = it.size || it.custom ? '' : 'none';
    $$('#item-size [data-sz=wl]').forEach(function (el) { el.style.display = it.custom ? 'none' : ''; });
    if (!it.custom) {
      s.params = s.params || {};
      s.params[it.key] = CS.itemParams(s);           // defaults written in, so fields can bind
    } else if (!s.prims || !s.prims.length) {
      s.prims = [CS.newPrim('rect', { w: s.w, l: s.l })];
    }
    var p = s.params && s.params[it.key];
    var sig = [s.id, it.key, p && p.segs ? p.segs.length : 0, it.custom ? s.prims.length : 0, it.custom ? s._sel || 0 : 0].join('|');
    if (sig === itemSig) return;
    itemSig = sig;

    var box = $('#item-params');
    box.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'pgrid';
    (it.params || []).forEach(function (d) {
      if (Array.isArray(d)) grid.appendChild(numField(d[1], '~s.params.' + it.key + '.' + d[0], { step: d[5], min: d[3], max: d[4], unit: d[6] != null ? d[6] : /^(rows|cols|count)$/.test(d[0]) ? '' : 'mm' }));
      else grid.appendChild(selField(d.label, '~s.params.' + it.key + '.' + d.key, d.options));
    });
    if (grid.childNodes.length) box.appendChild(grid);

    if (it.segments) {
      var h = document.createElement('h3'); h.textContent = 'Sections, end to end';
      box.appendChild(h);
      p.segs.forEach(function (q, i) {
        var row = document.createElement('div');
        row.className = 'segrow';
        var tag = document.createElement('span'); tag.className = 'segtag'; tag.textContent = i + 1;
        row.appendChild(tag);
        row.appendChild(numField('⌀', '~s.params.stepped.segs.' + i + '.d', { min: 1 }));
        row.appendChild(numField('Length', '~s.params.stepped.segs.' + i + '.len', { min: 1 }));
        row.appendChild(smallBtn('✕', 'danger iconbtn', function () {
          if (p.segs.length <= 1) return;
          beginEdit(0); p.segs.splice(i, 1); apply();
        }));
        box.appendChild(row);
      });
      var add = document.createElement('div');
      add.className = 'row inlinerow';
      add.appendChild(smallBtn('+ Add section', '', function () {
        beginEdit(0);
        var last = p.segs[p.segs.length - 1] || { d: 20, len: 20 };
        p.segs.push({ d: Math.max(4, Math.round(last.d * 0.6)), len: 20 });
        apply();
      }));
      box.appendChild(add);
      var hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Measure each round section from one end to the other: for an air pump, the body, then the neck, then the nozzle. They share one axis and the object rests on the widest.';
      box.appendChild(hint);
    }

    if (it.custom) {
      var h2 = document.createElement('h3'); h2.textContent = 'Shapes';
      box.appendChild(h2);
      s.prims.forEach(function (q, i) {
        var card = document.createElement('div');
        card.className = 'primcard' + (i === (s._sel || 0) ? ' on' : '');
        card.addEventListener('click', function (ev) {
          if (ev.target.closest('input,select,button')) return;
          s._sel = i; itemSig = ''; apply({ rebuild: false });
        });
        var top = document.createElement('div');
        top.className = 'primtop';
        top.appendChild(selField('', '~s.prims.' + i + '.type', CS.PRIMS));
        top.appendChild(smallBtn('✕', 'danger iconbtn', function () {
          if (s.prims.length <= 1) return;
          beginEdit(0); s.prims.splice(i, 1); s._sel = Math.max(0, Math.min(s._sel || 0, s.prims.length - 1)); apply();
        }));
        card.appendChild(top);
        var g2 = document.createElement('div');
        g2.className = 'pgrid four';
        g2.appendChild(numField(q.type === 'cyl' ? 'Length' : q.type === 'hex' ? 'Across flats' : 'Width', '~s.prims.' + i + '.w', { min: 1 }));
        if (q.type !== 'hex') g2.appendChild(numField(q.type === 'cyl' ? 'Diameter' : 'Length', '~s.prims.' + i + '.l', { min: 1 }));
        g2.appendChild(numField('Turn', '~s.prims.' + i + '.rot', { unit: '°', step: 1 }));
        g2.appendChild(numField(q.type === 'cyl' ? 'Bottom depth' : 'Depth', '~s.prims.' + i + '.depth', { nullable: true, min: 0.5 }));
        g2.appendChild(numField('X', '~s.prims.' + i + '.x', { step: 0.5 }));
        g2.appendChild(numField('Y', '~s.prims.' + i + '.y', { step: 0.5 }));
        card.appendChild(g2);
        box.appendChild(card);
      });
      var adds = document.createElement('div');
      adds.className = 'btngrid five';
      CS.PRIMS.forEach(function (pr) {
        adds.appendChild(smallBtn('+ ' + pr[1], '', function () {
          beginEdit(0);
          var last = s.prims[s.prims.length - 1];
          s.prims.push(CS.newPrim(pr[0], { x: last ? last.x + 10 : 0, y: last ? last.y - 10 : 0 }));
          s._sel = s.prims.length - 1;
          apply();
        }));
      });
      box.appendChild(adds);
      var hint2 = document.createElement('p');
      hint2.className = 'hint';
      hint2.textContent = 'In the plan: drag a shape (or its centre cross) to move it, and arrow keys nudge it. Drag a square on its edge or corner to resize; the opposite side stays put, or hold Alt to resize from the centre. Drag the round grip to turn it ([ and ] turn by 15°). Shift gives fine steps. Depth left on auto follows the compartment; a lying cylinder\'s depth is to the bottom of its trough.';
      box.appendChild(hint2);
    }
    $$('#item-params [data-bind]').forEach(bindEl);
    $$('#item-params input[type=number]').forEach(function (inp) { WB.scrubbable(inp, inp.closest('label') && inp.closest('label').firstChild); });
    refreshValues();
  }

  function bindSections() {
    // "Next to this one" or "Along a whole side" decides what the arrows do.
    var addWhole = false;
    $$('#add-scope button').forEach(function (b) {
      b.addEventListener('click', function () {
        addWhole = b.value === 'side';
        $$('#add-scope button').forEach(function (x) { x.classList.toggle('on', x === b); });
        $$('[data-add]').forEach(function (a) {
          var where = { left: 'left', right: 'right', back: 'back (towards the hinge)', front: 'front' }[a.dataset.add];
          a.title = addWhole ? 'Add along the whole ' + where + ' side of the case' : 'Add next to this one, on its ' + where + ' side';
        });
      });
    });
    $$('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { addSection(b.dataset.add, addWhole); });
    });
    $('#btn-pocket-all').addEventListener('click', function () {
      var s = sectionNow();
      if (!s) return;
      beginEdit(0);
      CS.layout.sections(state.layout).forEach(function (o) { o.pocket = Object.assign({}, s.pocket); });
      refreshValues(); apply();
    });
    $('#btn-recentre').addEventListener('click', function () {
      var s = sectionNow();
      if (!s || (!s.dx && !s.dy && s.alignX !== 'custom' && s.alignY !== 'custom')) return;
      beginEdit(0); s.dx = 0; s.dy = 0;
      if (s.alignX === 'custom') s.alignX = 'center';
      if (s.alignY === 'custom') s.alignY = 'center';
      refreshValues(); apply();
    });
    $$('[data-move]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = sectionNow();
        if (!s) return;
        beginEdit(0);
        CS.layout.move(state.layout, s.id, +b.dataset.move);
        apply();
      });
    });
    $('#btn-del-sec').addEventListener('click', function () { removeSection(state.selected); });

    $('#sec-depth-auto').addEventListener('change', function (e) {
      var s = sectionNow(); if (!s) return;
      beginEdit(0);
      s.depth = e.target.checked ? null : (s._depth || (s._shape ? s._shape.h : s.h));
      apply();
    });
    $('#sec-depth').addEventListener('input', function (e) {
      var s = sectionNow(), v = parseFloat(e.target.value);
      if (!s || !isFinite(v)) return;
      beginEdit(450);
      s.depth = Math.max(0.2, v);
      apply();
    });
    $('#sec-depth').addEventListener('change', function () { paintSections(); });

    $('#notch-depth-auto').addEventListener('change', function (e) {
      var s = sectionNow(); if (!s) return;
      beginEdit(0);
      s.groove.depth = e.target.checked ? null : Math.round(Math.max(1, (s._depth || 0) * 0.7) * 10) / 10;
      apply();
    });
    $('#notch-depth').addEventListener('input', function (e) {
      var s = sectionNow(), v = parseFloat(e.target.value);
      if (!s || !isFinite(v)) return;
      beginEdit(450);
      s.groove.depth = Math.max(1, v);
      apply();
    });
  }

  /* ── decoration lists ───────────────────────────────────────────── */
  function paintLists() {
    var f = faceNow();
    [['text', '#text-list', f.texts, f.textIdx],
     ['art', '#art-list', f.arts, f.artIdx]].forEach(function (row) {
      var box = $(row[1]);
      box.innerHTML = '';
      (row[2] || []).forEach(function (item, i) {
        var b = document.createElement('button');
        b.className = 'itemrow' + (i === row[3] ? ' on' : '');
        b.type = 'button';
        var label = row[0] === 'text'
          ? ((item.content || '').split('\n')[0] || '(empty)')
          : (item.source === 'none' ? '(empty)' : item.source === 'draw' ? 'drawing' : 'image');
        b.innerHTML = '<span class="dot"></span><span class="txt"></span>' +
                      '<span class="num">' + (i + 1) + '</span>';
        $('.dot', b).style.background = item.color;
        $('.txt', b).textContent = label;
        b.addEventListener('click', function () {
          f[row[0] === 'text' ? 'textIdx' : 'artIdx'] = i;
          face.selected = row[0] + ':' + i;
          setPlanMode(state.activeFace);
          refresh();
          apply({ rebuild: false });
        });
        box.appendChild(b);
      });
    });
    $('#text-editor').hidden = !(f.texts || []).length;
    $('#art-editor').hidden = !(f.arts || []).length;
    $('#btn-del-text').disabled = !(f.texts || []).length;
    $('#btn-del-art').disabled = !(f.arts || []).length;
  }

  function bindLists() {
    $('#btn-add-text').addEventListener('click', function () {
      beginEdit(0);
      var f = faceNow();
      var last = f.texts[f.texts.length - 1];
      f.texts.push(CS.newText(last ? { content: '', font: last.font, size: last.size,
                                       color: last.color, x: last.x,
                                       y: last.y - last.size * 1.4 } : { content: 'TEXT' }));
      f.textIdx = f.texts.length - 1;
      f.enabled = true;
      face.selected = 'text:' + f.textIdx;
      setPlanMode(state.activeFace);
      refresh(); apply();
    });

    $('#btn-del-text').addEventListener('click', function () {
      var f = faceNow();
      if (!f.texts.length) return;
      beginEdit(0);
      f.texts.splice(f.textIdx, 1);
      f.textIdx = Math.max(0, Math.min(f.textIdx, f.texts.length - 1));
      face.selected = null;
      refresh(); apply();
    });

    $('#btn-add-art').addEventListener('click', function () {
      beginEdit(0);
      var f = faceNow();
      f.arts.push(CS.newArt());
      f.artIdx = f.arts.length - 1;
      f.enabled = true;
      face.selected = 'art:' + f.artIdx;
      setPlanMode(state.activeFace);
      refresh(); apply();
    });

    $('#btn-del-art').addEventListener('click', function () {
      var f = faceNow();
      if (!f.arts.length) return;
      beginEdit(0);
      var gone = f.arts.splice(f.artIdx, 1)[0];
      if (gone) { delete CS.assets.images[gone.id]; delete CS.assets.drawings[gone.id]; }
      f.artIdx = Math.max(0, Math.min(f.artIdx, f.arts.length - 1));
      face.selected = null;
      refresh(); apply();
    });

    $('#face-enabled').addEventListener('change', function (e) {
      beginEdit(0);
      faceNow().enabled = e.target.checked;
      setPlanMode(state.activeFace);
      apply();
    });

    $$('[data-center]').forEach(function (b) {
      b.addEventListener('click', function () {
        beginEdit(0);
        var f = faceNow();
        var el = b.dataset.center === 'text' ? f.texts[f.textIdx] : f.arts[f.artIdx];
        if (!el) return;
        el.x = 0; el.y = 0;
        refreshValues();
        apply();
      });
    });
  }

  /* One colour per element, so the count is whatever the design needs. */
  function paintColours() {
    var used = CS.coloursUsed(state);
    var box = $('#used-colours');
    box.innerHTML = '';
    used.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 's';
      d.style.background = c;
      d.title = c;
      box.appendChild(d);
    });
    var n = used.length;
    var deco = n - (state.colors.base.toUpperCase() === state.colors.lid.toUpperCase() ? 1 : 2);
    $('#color-count').textContent = n + (n === 1 ? ' colour' : ' colours') + ' in use' +
      (deco > 0 ? ' — the decoration needs a multi-material printer, or ' + deco + ' manual swap' +
                  (deco === 1 ? '' : 's') + ' per face.' : ' — base and lid can each print in one filament.');
  }

  function paintFacePanel() {
    var f = faceNow();
    $('#face-enabled').checked = f.enabled;
    $('#cap-face').textContent = CS.FACE_NAME[state.activeFace];
  }

  function paintReadouts() {
    var mh = state.build === 'tray' ? 'Just the base: no lid, hinge or clasps — an open tray or insert.' :
      'Base and lid, joined by a filament-pin hinge.';
    if (D.grid) {
      var h = D.zT + D.grid.foot;
      mh += ' Gridfinity ' + D.grid.nx + ' × ' + D.grid.ny + ' units (' + D.W.toFixed(1) + ' × ' + D.L.toFixed(1) +
        ' mm) on 4.75 mm feet; ' + h.toFixed(1) + ' mm tall ≈ ' + (h / 7).toFixed(1) + ' height units.';
    }
    $('#make-hint').textContent = mh;
    $('#clasp-side').textContent = 'the ' + D.claspSide + ' edge here';
    $('#box-readout').innerHTML =
      'Outside <b>' + D.W.toFixed(1) + ' × ' + D.L.toFixed(1) + ' × ' + D.zT.toFixed(1) + '</b> mm closed, ' +
      'before hinge and clasps. Base ' + D.zP.toFixed(2) + ' mm, lid ' + (D.zT - D.zP).toFixed(2) + ' mm. ' +
      'Interior ' + D.Hi.toFixed(2) + ' mm: ' + D.Hb.toFixed(2) + ' in the base, ' + D.Ht.toFixed(2) + ' in the lid.';
  }

  /* ── views ──────────────────────────────────────────────────────── */
  function setPlanMode(m) {
    if (m !== 'plan' && m !== state.activeFace) {
      state.activeFace = m;
      face.selected = null;
      face.invalidateBorder();
      refresh();
      apply({ rebuild: false });
    }
    planMode = m;
    $$('#planmode button').forEach(function (b) { b.classList.toggle('on', b.value === m); });
    $('#cplan').hidden = m !== 'plan';
    $('#cface').hidden = m === 'plan';
    face.hidden = m === 'plan';
    $('#hud2d').innerHTML = m === 'plan'
      ? 'drag to move (Alt: no snapping) · drag an edge to resize · <b>+</b> adds a neighbour, the outer pills a whole side · Delete removes'
      : 'click to select · drag to move (Alt: no snapping) · corner handles resize · arrow keys nudge';
    drawViews();
  }

  function drawViews() {
    try {
      if (planMode === 'plan') plan.draw(); else face.draw();
    } catch (e) { console.error('plan draw failed', e); }
    if (viewer && !viewer.failed) viewer.setOutline(state.selected), viewer.draw();
  }

  function focusPanel(name) {
    var p = $('#p-' + name);
    if (!p) return;
    p.classList.add('open');
    p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    p.classList.remove('flash');
    void p.offsetWidth;
    p.classList.add('flash');
    if (name === 'compartment') { var w = $('#f-s-w'); if (w) w.focus(); }
  }

  /* ── build / render ─────────────────────────────────────────────── */
  var rebuild = WB.debounce(function () {
    if (!CS.manifoldReady()) return;
    var t0 = performance.now();
    var model;
    try {
      model = CS.buildModel(state, { ppmm: Math.min(CS.qualityOf(state).ppmm, 10), maxCells: 2.5e6, preview: true });
    } catch (err) {
      console.error(err);
      showWarnings([{ level: 'bad', msg: 'Could not build the case: ' + err.message }]);
      return;
    }
    lastModel = model;
    if (viewer && !viewer.failed) {
      var first = !viewer.count;
      viewer.bedState = state.bed;
      viewer.setModel(model.parts, model.D, model.atlas);
      viewer.setOutline(state.selected);
      if (first) viewer.frame();
      viewer.draw();
    }
    stats(model, performance.now() - t0);
    showWarnings(model.warnings.concat(bedWarnings(model)));
  }, 180);

  /* Does the print layout fit the bed? Turned a quarter, if that helps. */
  function bedWarnings(model) {
    var b = state.bed;
    if (!b || !b.show) return [];
    var f = CS.printFootprint(model), e = 1e-6;
    var fits = (f.w <= b.w + e && f.d <= b.d + e), turned = (f.d <= b.w + e && f.w <= b.d + e);
    if (fits) return [];
    var size = f.w.toFixed(0) + ' × ' + f.d.toFixed(0) + ' mm';
    return [turned
      ? { level: 'warn', msg: 'The print layout (' + size + ') fits the ' + b.w + ' × ' + b.d + ' mm bed only turned a quarter; turn it in your slicer.' }
      : { level: 'warn', msg: 'The print layout (' + size + ') is bigger than the ' + b.w + ' × ' + b.d + ' mm bed. ' +
          'Print the parts one at a time (most slicers can split a 3MF by object), or make the case smaller.' }];
  }

  function stats(model, ms) {
    var s = model.stats;
    $('#stat-dims').innerHTML = '<b>' + s.w.toFixed(1) + ' × ' + s.l.toFixed(1) + ' × ' + s.h.toFixed(1) + '</b> mm';
    $('#stat-tris').innerHTML = '<b>' + s.tris.toLocaleString() + '</b> triangles';
    var grams = s.vol / 1000 * 1.24;   // PLA
    $('#stat-mass').innerHTML = '<b>' + grams.toFixed(1) + '</b> g · ' + Math.round(ms) + ' ms';
  }

  /* Notices stay above the build warnings until dismissed, since those are
     redrawn on every rebuild. */

  var warnings = null;
  function warningsStrip() { return warnings || (warnings = new WB.Warnings($('#warnings'))); }
  function showWarnings(list) { warningsStrip().show(list); }
  function notice(level, msg) { warningsStrip().notice(level, msg); }

  function apply(opts) {
    opts = opts || {};
    // A tray has no lid, so the lid top can't be the face being edited.
    if (state.build === 'tray' && state.activeFace === 'lid') {
      state.activeFace = 'base';
      face.invalidateBorder();
      if (planMode === 'lid') planMode = 'base';
    }
    D = CS.describe(state);
    updateRanges();
    visibility();
    labels();
    paintSections();
    paintLists();
    $$('[data-bind]').forEach(function (el) {
      if (el.classList.contains('seg')) syncSeg(el, el.dataset.bind);
    });
    paintColours();
    paintFacePanel();
    paintReadouts();
    drawViews();
    if (opts.rebuild !== false) rebuild();
    persist();
  }

  /* Fill hands a width or length to the layout: show what it comes to, and
     lock the field until Fill is off again. */
  function paintFill(s) {
    [['~s.w', 'x', 'w'], ['~s.l', 'y', 'l']].forEach(function (a) {
      var el = $('input[data-bind="' + a[0] + '"]');
      if (!el) return;
      // Fill only sets the size of shapes that grow with it (box, oval).
      var filled = s['align' + a[1].toUpperCase()] === 'stretch' && !!(s._shape && s._shape.fill);
      el.disabled = filled;
      el.title = filled ? 'Set by Fill: the compartment takes the space its slot has. Turn Fill off to set it.' : '';
      el.closest('label').classList.toggle('locked', filled);
      if (filled && s._size && document.activeElement !== el) el.value = Math.round(s._size[a[2]] * 10) / 10;
    });
  }

  /* The position boxes measure from the middle of the slot (as Custom does),
     so an aligned compartment shows where it actually sits and a nudge moves
     it on from there. */
  function paintPosition(s) {
    var r = rectNow(s);
    if (!r) return;
    [['~s.dx', 'x'], ['~s.dy', 'y']].forEach(function (a) {
      var el = $('input[data-bind="' + a[0] + '"]');
      if (!el || document.activeElement === el || s['align' + a[1].toUpperCase()] === 'custom') return;
      var mid = a[1] === 'x' ? (r.slot.x0 + r.slot.x1) / 2 : (r.slot.y0 + r.slot.y1) / 2;
      el.value = Math.round(((a[1] === 'x' ? r.cx : r.cy) - mid) * 10) / 10;
    });
  }

  // The compartment's rect as last laid out (D is refreshed on every apply).
  function rectNow(s) { return s && D ? D.rects.filter(function (q) { return q.id === s.id; })[0] : null; }

  function onEdit(path, el) {
    if (path === '~s.alignX' || path === '~s.alignY') {
      var sc = sectionNow(), axc = path === '~s.alignX' ? 'x' : 'y', kc = 'align' + axc.toUpperCase();
      if (sc && sc[kc] === 'custom') {
        // Custom: it stays where it is, and the position below now sets it.
        sc[kc] = sc._fill && sc._fill[axc] ? 'stretch' : 'center';
        CS.layout.toCustom(sc, rectNow(sc), axc);
        sc[kc] = 'custom';
      } else if (sc) {
        // A fixed alignment puts it back in place along that axis.
        sc[axc === 'x' ? 'dx' : 'dy'] = 0;
      }
    }
    if ((path === '~s.dx' || path === '~s.dy') && sectionNow()) {
      // Typing a position makes that axis custom, measured from the slot's middle.
      var sd = sectionNow(), axd = path === '~s.dx' ? 'x' : 'y', kd = 'align' + axd.toUpperCase(), dk = axd === 'x' ? 'dx' : 'dy';
      var typed = sd[dk], rd = rectNow(sd);
      if (sd[kd] !== 'custom') CS.layout.toCustom(sd, rd, axd);
      sd[kd] = 'custom';
      // Kept as typed, but no further than the outer wall allows.
      if (rd && rd.range && isFinite(typed)) {
        var base = (axd === 'x' ? rd.cx - (rd.slot.x0 + rd.slot.x1) / 2 : rd.cy - (rd.slot.y0 + rd.slot.y1) / 2) - (rd[dk] || 0);
        var rg = rd.range[axd];
        typed = WB.clamp(typed, base + rg[0], base + rg[1]);
      }
      sd[dk] = CS.tidy(typed);
    }
    // Leaving Fill goes back to the object's own size (Fill never changed it),
    // so Back / Centre / Front have room to place it again.
    if (path === '~s.alignX' || path === '~s.alignY') {
      var sf = sectionNow(), ax = path === '~s.alignX' ? 'x' : 'y';
      if (sf && sf._fill && sf['align' + ax.toUpperCase()] !== 'stretch') sf._fill[ax] = false;
    }
    if (path === '~s.item') {
      var sn = sectionNow();
      if (sn) { sn.shape = sn.item === 'round' ? 'round' : 'rect'; itemSig = ''; }
    }
    if (/^~s\.prims\.\d+\.type$/.test(path)) itemSig = '';
    if (path === 'texture.border') {
      var b = state.texture.border;
      state.texture.borders = { base: { bottom: b, top: b, face: b }, lid: { bottom: b, top: b, face: b } };
    }
    if (path === 'activeFace') {
      face.selected = null;
      face.invalidateBorder();
      refresh();
      setPlanMode(state.activeFace);
    } else if (path.indexOf('~.border') === 0 || /^(outer|walls|layout|fit)/.test(path)) {
      face.invalidateBorder();
    }
    refreshValues(el);
    apply();
  }

  /* ── panels, tabs ───────────────────────────────────────────────── */
  function chrome() {
    $$('.panel > h2').forEach(function (h) {
      h.addEventListener('click', function () { h.parentNode.classList.toggle('open'); });
    });

    $$('#panetabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#panetabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
        $('#panes').dataset.pane = b.value;
        requestAnimationFrame(drawViews);
      });
    });

    $$('#planmode button').forEach(function (b) {
      b.addEventListener('click', function () { setPlanMode(b.value); });
    });

    $('#bed-preset').addEventListener('change', function (e) {
      var m = /^(\d+)x(\d+)$/.exec(e.target.value);
      if (!m) { var w = $('[data-num="bed.w"] input') || $('input[data-bind="bed.w"]'); if (w) w.focus(); return; }
      beginEdit(0);
      state.bed.w = +m[1]; state.bed.d = +m[2];
      refreshValues(); apply();
    });
    $$('#pose button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#pose button').forEach(function (x) { x.classList.toggle('on', x === b); });
        $('#angle-wrap').style.visibility = b.value === 'open' ? '' : 'hidden';
        paintBedToggle();
        viewer.setPose(b.value);
        viewer.draw();
      });
    });
    $('#open-angle').addEventListener('input', function (e) {
      $('#open-angle-val').textContent = e.target.value + '°';
      viewer.setPose('open', +e.target.value);
      viewer.draw();
    });
  }

  /* ── assets ─────────────────────────────────────────────────────── */
  function loadImageFile(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        // Normalise to a canvas so bbox/threshold work uniformly.
        var max = 1200;
        var k = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c._rev = Date.now();
        var f = faceNow();
        var art = f.arts[f.artIdx];
        if (!art) return;
        beginEdit(0);
        CS.assets.images[art.id] = c;
        art.source = 'image';
        refresh();
        apply();
      };
      img.onerror = function () {
        showWarnings([{ level: 'bad', msg: 'That image could not be read.' }]);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function assets() {
    $('#art-file').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) loadImageFile(e.target.files[0]);
    });

    $('#tex-file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, 512 / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          beginEdit(0);
          CS.assets.texture = c;
          state.texture.pattern = 'image';
          refresh();
          apply();
        };
        img.onerror = function () { showWarnings([{ level: 'bad', msg: 'That image could not be read.' }]); };
        img.src = fr.result;
      };
      fr.readAsDataURL(f);
      e.target.value = '';
    });

    drawpad = new WB.DrawPad($('#drawmodal'));

    $$('[data-draw]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = faceNow();
        var art = f.arts[f.artIdx];
        drawpad.open('art', art ? CS.assets.drawings[art.id] : null, null, {
          title: 'Draw a picture',
          hint: 'Anything you draw is set into the face. Enclosed areas can be filled or left open.'
        });
      });
    });

    $('#draw-cancel').addEventListener('click', function () { drawpad.close(); });
    $('#draw-apply').addEventListener('click', function () {
      beginEdit(0);
      var out = drawpad.result($('#draw-fill').checked);
      var f = faceNow();
      var art = f.arts[f.artIdx];
      if (art) { CS.assets.drawings[art.id] = out; art.source = 'draw'; }
      drawpad.close();
      refresh();
      apply();
    });

    $$('#draw-tool button').forEach(function (b) {
      b.addEventListener('click', function () {
        drawpad.tool = b.value;
        $$('#draw-tool button').forEach(function (x) { x.classList.toggle('on', x === b); });
      });
    });
    $('#draw-size').addEventListener('input', function (e) {
      drawpad.size = +e.target.value;
      $('#draw-size-val').textContent = e.target.value;
    });
    $('#draw-undo').addEventListener('click', function () { drawpad.undo(); });
    $('#draw-clear').addEventListener('click', function () { drawpad.clear(); });
  }

  /* ── export ─────────────────────────────────────────────────────── */
  function busy(on, text) {
    $('#busy').hidden = !on;
    if (text) $('#busy-text').textContent = text;
  }

  function buildForExport() {
    return CS.buildModel(state, { ppmm: CS.qualityOf(state).ppmm, maxCells: 1.2e7 });
  }

  function safeName() {
    var n = (state.name || 'case').replace(/[^\w\-]+/g, '-').replace(/^-|-$/g, '');
    return n || 'case';
  }

  function exports_() {
    $('#btn-3mf').addEventListener('click', function () {
      if (!CS.manifoldReady()) return;
      busy(true, 'Building mesh…');
      setTimeout(function () {
        var model;
        try { model = buildForExport(); }
        catch (e) { busy(false); showWarnings([{ level: 'bad', msg: 'Build failed: ' + e.message }]); return; }

        busy(true, 'Packing 3MF…');
        CS.exportThreeMF(model, state).then(function (blob) {
          WB.download(blob, safeName() + '.3mf');
          busy(false);
          var n = model.stats.colors;
          showWarnings(model.warnings.concat([{
            level: 'ok',
            msg: 'Exported ' + safeName() + '.3mf — base and lid as two objects, ' + model.parts.length + ' bodies, ' +
                 n + ' colour' + (n === 1 ? '' : 's') + ', ' + model.stats.tris.toLocaleString() + ' triangles.'
          }]));
        }).catch(function (e) {
          busy(false);
          showWarnings([{ level: 'bad', msg: 'Export failed: ' + e.message }]);
        });
      }, 30);
    });

    $('#btn-stl').addEventListener('click', function () {
      if (!CS.manifoldReady()) return;
      busy(true, 'Building mesh…');
      setTimeout(function () {
        try {
          var model = buildForExport();
          var blob = CS.exportSTL({ parts: CS.printLayout(model) });
          busy(false);
          if (!blob) { showWarnings([{ level: 'bad', msg: 'Nothing to export.' }]); return; }
          WB.download(blob, safeName() + '.stl');
        } catch (e) {
          busy(false);
          showWarnings([{ level: 'bad', msg: 'Export failed: ' + e.message }]);
        }
      }, 30);
    });

    $('#btn-save').addEventListener('click', function () {
      WB.download(new Blob([JSON.stringify(buildPayload())], { type: 'application/json' }),
                  safeName() + '.case.json');
    });

    $('#btn-share').addEventListener('click', shareLink);
    $('#btn-load').addEventListener('click', function () { $('#loadfile').click(); });
    $('#loadfile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var parsed = JSON.parse(fr.result);
          loadAsStep(parsed, afterLoad);
        } catch (err) {
          showWarnings([{ level: 'bad', msg: 'That file could not be loaded: ' + err.message }]);
        }
      };
      fr.readAsText(f);
      e.target.value = '';
    });

    $('#btn-reset').addEventListener('click', function () {
      if (!window.confirm('Discard this design and start from the defaults?')) return;
      beginEdit(0);
      var name = state.name;
      toDefaults();
      state.name = name;                    // still the same design, by the same name
      clearSession();
      afterLoad();
    });

    $('#btn-designs').addEventListener('click', function (e) {
      WB.designsMenu({ anchor: e.currentTarget, session: session, open: openDesign, create: newDesign,
                       duplicate: duplicateDesign, wipe: wipeDesigns });
    });
  }

  function toDefaults() {
    var d = CS.defaults();
    Object.keys(state).forEach(function (k) { if (!(k in d)) delete state[k]; });
    Object.keys(d).forEach(function (k) { state[k] = d[k]; });
    CS.assets.images = {};
    CS.assets.drawings = {};
    CS.assets.texture = null;
  }

  /* ── designs kept in this browser (WB.Session) ── */
  function openDesign(id) {
    session.open(id, function (note) {
      afterLoad();
      if (undoHistory) undoHistory.clear();   // undo stays with the design it was made in
      if (note) notice('warn', note);
    });
  }
  function newDesign() {
    session.saveNow();
    toDefaults();
    state.name = session.uniqueName(CS.defaults().name);
    afterLoad();
    if (undoHistory) undoHistory.clear();
    session.startNew();
    setTimeout(function () { session.settled(); }, 0);
  }
  function duplicateDesign() {
    session.duplicate();
    state.name = session.uniqueName(state.name + ' copy');
    refreshValues();
    persist();
    notice('ok', 'You are now working on "' + state.name + '", a copy; the original is kept as it was.');
  }
  function wipeDesigns() {
    session.wipe();
    toDefaults();
    afterLoad();
    if (undoHistory) undoHistory.clear();
    session.startNew();
    setTimeout(function () { session.settled(); }, 0);
    notice('ok', 'Every design this app kept in this browser has been deleted.');
  }

  // A drag in progress belongs to the design it started on.
  function dropDrags() {
    if (plan) { plan.drag = null; plan.frozen = null; }
    if (face) { face.drag = null; face.resize = null; }
  }

  function afterLoad() {
    dropDrags();
    face.selected = null;
    face.invalidateBorder();
    refresh();
    setPlanMode(planMode === 'plan' ? 'plan' : state.activeFace);
    apply();
  }

  /* ── design payload (shared by file save/load and session storage) ── */
  function buildPayload() {
    var payload = { app: 'dabba', version: 1, state: JSON.parse(CS.serialize(state)), assets: {} };
    var put = function (k, cv) { if (cv) payload.assets[k] = cv.toDataURL('image/png'); };
    Object.keys(CS.assets.images).forEach(function (k) { put('img:' + k, CS.assets.images[k]); });
    Object.keys(CS.assets.drawings).forEach(function (k) { put('draw:' + k, CS.assets.drawings[k]); });
    put('texture', CS.assets.texture);
    return payload;
  }

  /* Missing fields fall back to defaults, so older saves keep loading as the
     design grows new settings. */
  function loadPayload(p, done) {
    var ps = p.state || {};
    var assets = p.assets || {};
    var d = CS.defaults();

    // A saved or shared value only replaces a default of the same kind, so a
    // damaged link can't leave, say, text where a number belongs.
    var sameKind = function (a, b) {
      if (a === null || a === undefined) return true;
      if (typeof a === 'number') return typeof b === 'number' && isFinite(b);
      if (Array.isArray(a)) return Array.isArray(b);
      if (typeof a === 'object') return !!b && typeof b === 'object' && !Array.isArray(b);
      return typeof a === typeof b;
    };
    (function merge(dst, src) {
      Object.keys(dst).forEach(function (k) {
        if (src[k] === undefined || k === 'layout' || k === 'faces') return;
        if (dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k]) &&
            src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
          merge(dst[k], src[k]);
        } else if (sameKind(dst[k], src[k])) { dst[k] = src[k]; }
      });
    })(d, ps);

    // "Mirror compartments" at full height was walls only before it had a name.
    if (ps.lidInner && ps.lidInner.mode === 'mirror' && ps.lidInner.depth === 'full') {
      d.lidInner.mode = 'walls'; d.lidInner.depth = 'mirror';
    }
    if (d.lidInner.depth !== 'fit') d.lidInner.depth = 'mirror';   // 'full' and anything older
    if (d.activeFace !== 'lid' && d.activeFace !== 'base') d.activeFace = 'lid';
    if (ps.texture && ps.texture.border != null && !ps.texture.borders) {
      var b0 = ps.texture.border;
      d.texture.borders = { base: { bottom: b0, top: b0, face: b0 }, lid: { bottom: b0, top: b0, face: b0 } };
    }

    if (ps.layout && (ps.layout.kind === 'section' || ps.layout.kind === 'split')) {
      d.layout = (function fix(n) {
        if (n.kind === 'split') {
          n.children = (n.children || []).map(fix).filter(Boolean);
          if (!n.id) n.id = WB.newId('g');
          return n;
        }
        var base = CS.newSection();
        var out = Object.assign(base, n);
        out.grooves = Object.assign(CS.newSection().grooves, n.grooves || {});
        out.groove = Object.assign(CS.newSection().groove, n.groove || {});
        if (!n.item) out.item = n.shape === 'round' ? 'round' : 'box';   // saved before item shapes
        // Saved when pocket shape was one setting for the whole case.
        out.pocket = Object.assign({}, CS.newSection().pocket, ps.pocket || {}, n.pocket || {});
        if (!out.params || typeof out.params !== 'object') out.params = {};
        if (!Array.isArray(out.prims)) out.prims = [];
        if (!out.id) out.id = WB.newId('s');
        return out;
      })(ps.layout);
      d.layout = CS.layout.normalize(d.layout) || CS.defaults().layout;
      // Saved before Custom: a moved compartment kept its alignment and an
      // offset from it. Turn that into Custom at the same place.
      var olds = CS.layout.sections(d.layout).filter(function (n) {
        return (n.dx && n.alignX !== 'custom' && n.alignX !== 'stretch') || (n.dy && n.alignY !== 'custom' && n.alignY !== 'stretch');
      });
      if (olds.length) {
        try {
          var Dm = CS.describe(d);
          olds.forEach(function (n) {
            var r = Dm.rects.filter(function (q) { return q.id === n.id; })[0];
            if (n.dx && n.alignX !== 'custom' && n.alignX !== 'stretch') CS.layout.toCustom(n, r, 'x');
            if (n.dy && n.alignY !== 'custom' && n.alignY !== 'stretch') CS.layout.toCustom(n, r, 'y');
          });
        } catch (err) { /* keep them as they were */ }
      }
    }

    ['lid', 'base'].forEach(function (w) {
      var src = ps.faces && ps.faces[w];
      if (!src) return;
      var f = d.faces[w];
      Object.keys(f).forEach(function (k) {
        if (src[k] === undefined) return;
        if (k === 'border') Object.assign(f.border, src.border);
        else f[k] = src[k];
      });
      f.texts = (f.texts || []).map(function (t) {
        var n = CS.newText(t); n.font = WB.fontKey(n.font); return n;
      });
      f.arts = (f.arts || []).map(function (a) { return CS.newArt(a); });
      f.textIdx = WB.clamp(f.textIdx || 0, 0, Math.max(0, f.texts.length - 1));
      f.artIdx = WB.clamp(f.artIdx || 0, 0, Math.max(0, f.arts.length - 1));
    });

    if (!CS.layout.find(d.layout, d.selected)) d.selected = CS.layout.sections(d.layout)[0].id;
    sanitize(d);

    Object.keys(state).forEach(function (k) { if (!(k in d)) delete state[k]; });
    Object.keys(d).forEach(function (k) { state[k] = d[k]; });

    CS.assets.images = {};
    CS.assets.drawings = {};
    CS.assets.texture = null;
    var jobs = [];
    if (assets.texture) jobs.push({ data: assets.texture, put: function (c) { CS.assets.texture = c; } });
    Object.keys(assets).forEach(function (k) {
      if (k.indexOf('img:') === 0) {
        jobs.push({ data: assets[k], put: function (c) { CS.assets.images[k.slice(4)] = c; } });
      } else if (k.indexOf('draw:') === 0) {
        jobs.push({ data: assets[k], put: function (c) { CS.assets.drawings[k.slice(5)] = c; } });
      }
    });

    jobs = jobs.filter(function (j) { return WB.isImageData(j.data); });   // inline pictures only
    var pending = jobs.length;
    if (!pending) { done(); return; }
    jobs.forEach(function (job) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        c._rev = Date.now();
        job.put(c);
        if (!--pending) done();
      };
      img.onerror = function () { if (!--pending) done(); };
      img.src = job.data;
    });
  }

  /* A setting path inside each object of a list kept within its field's
     limits: 'pocket.corner' on every compartment, say. */
  function clampAll(list, sub, L, fresh) {
    var parts = sub.split('.'), key = parts.pop(), at = parts.join('.');
    list.forEach(function (o) {
      var tgt = at ? WB.get(o, at) : o;
      WB.clampField(tgt, key, L.min, L.max, fresh ? WB.get(fresh, sub) : undefined);
    });
  }

  /* A design from a file, a link or storage, kept to what the app can build:
     hex colours only, every number inside its field's limits, and lists of a
     sane length, so a crafted link can't hang the page (and stay saved). */
  var MAX_SECTIONS = 120, MAX_ITEMS = 40;
  function sanitize(d) {
    WB.cleanColours(d, CS.defaults());
    if (CS.layout.sections(d.layout).length > MAX_SECTIONS) {
      d.layout = CS.defaults().layout;
      d.selected = CS.layout.sections(d.layout)[0].id;
    }
    var secs = CS.layout.sections(d.layout), faces = [d.faces.lid, d.faces.base];
    faces.forEach(function (f) { f.texts = f.texts.slice(0, MAX_ITEMS); f.arts = f.arts.slice(0, MAX_ITEMS); });
    var texts = [].concat(faces[0].texts, faces[1].texts), arts = [].concat(faces[0].arts, faces[1].arts);
    WB.fieldLimits(document, ['f-inlayDepth', 'f-reliefHeight']).forEach(function (L) {
      var p = L.path;
      if (p.indexOf('~s.') === 0) clampAll(secs, p.slice(3), L, CS.newSection());
      else if (p.indexOf('~t.') === 0) clampAll(texts, p.slice(3), L, CS.newText());
      else if (p.indexOf('~a.') === 0) clampAll(arts, p.slice(3), L, CS.newArt());
      else if (p.indexOf('~.') === 0) clampAll(faces, p.slice(2), L, CS.faceDefaults('lid'));
      else clampAll([d], p, L, CS.defaults());
    });
    secs.forEach(function (s) {
      // What each one holds, inside the limits its own fields have.
      Object.keys(s.params || {}).forEach(function (key) {
        var it = CS.itemByKey(key), pp = s.params[key];
        if (!pp || typeof pp !== 'object' || it.key !== key) { delete s.params[key]; return; }
        (it.params || []).forEach(function (sp) { if (Array.isArray(sp)) WB.clampField(pp, sp[0], sp[3], sp[4], sp[2]); });
        if (Array.isArray(pp.segs)) {
          pp.segs = pp.segs.filter(function (q) { return q && typeof q === 'object'; }).slice(0, 12);
          pp.segs.forEach(function (q) { WB.clampField(q, 'd', 1, 400, 20); WB.clampField(q, 'len', 1, 800, 20); });
        }
      });
      s.prims = s.prims.filter(function (q) { return q && typeof q === 'object'; }).slice(0, MAX_ITEMS);
      s.prims.forEach(function (q) {
        WB.clampField(q, 'w', 1, 400, 20); WB.clampField(q, 'l', 1, 400, 20);
        WB.clampField(q, 'x', -400, 400, 0); WB.clampField(q, 'y', -400, 400, 0);
        WB.clampField(q, 'rot', -360, 360, 0); WB.clampField(q, 'depth', 0.1, 300, null);
      });
    });
  }

  /* ── share links ──────────────────────────────────────────────────
     The settings travel in the link; pictures and image textures do not, as
     they would make it far too long. */
  function pictureCount() {
    return Object.keys(CS.assets.images).length + Object.keys(CS.assets.drawings).length +
           (CS.assets.texture ? 1 : 0);
  }
  /* The design as small as it goes for a link: compartments, texts and
     pictures keep only what differs from a fresh one (loading fills the rest
     back in), and compartments get short ids. */
  function forLink(full) {
    var n = 0, ids = {}, fresh = JSON.parse(CS.serialize({ s: CS.newSection() })).s;
    full.layout = (function walk(node) {
      var id = (n++).toString(36);
      ids[node.id] = id;
      if (node.kind === 'split') {
        var sp = Object.assign({}, node, { id: id });
        sp.children = (node.children || []).map(walk);
        return sp;
      }
      return Object.assign({ id: id, kind: 'section' }, WB.shareTrim(node, fresh, ['id', 'kind']));
    })(full.layout);
    if (ids[full.selected]) full.selected = ids[full.selected];
    ['lid', 'base'].forEach(function (w) {
      var f = full.faces && full.faces[w];
      if (!f) return;
      f.texts = (f.texts || []).map(function (t) { return WB.shareTrim(t, CS.newText(), ['id']); });
      f.arts = (f.arts || []).map(function (a) { return WB.shareTrim(a, CS.newArt(), ['id']); });
    });
    return full;
  }

  function shareLink() {
    var pics = pictureCount(), btn = $('#btn-share');
    // Only the changes from the defaults travel, which keeps links short.
    var full = forLink(JSON.parse(CS.serialize(state))), base = JSON.parse(CS.serialize(CS.defaults()));
    var payload = { app: 'dabba', version: 1, diff: 1, state: WB.shareDiff(base, full) || {} };
    if (pics) payload.picturesLeftOut = pics;
    WB.shareEncode(payload).then(function (hash) {
      var url = WB.shareBase() + hash;
      return WB.copyText(url).then(function (ok) {
        if (ok) WB.flashButton(btn, 'Copied ✓');
        var body = [];
        body.push(ok ? 'Anyone with this link can open the design and carry on editing their own copy.'
                     : 'Your browser blocked the clipboard here; copy the link above.');
        if (url.length > 8000) body.push('It is a long link, so some chat apps may cut it short.');
        if (pics) {
          body.push({ warn: true, text: 'Not included: ' + (pics === 1 ? 'a picture or image texture' : pics + ' pictures or image textures') +
                     '. Links cannot carry those — to share the design complete, send the file from Save (.case.json) or the exported 3MF.' });
        }
        WB.sharePopup({ anchor: btn, title: ok ? 'Link copied' : 'Share this link', link: url, linkCopied: ok, body: body });
      });
    }).catch(function (err) {
      WB.sharePopup({ anchor: btn, kind: 'warn', title: 'Could not make a link', body: [err.message] });
    });
  }

  /* Opens a design from the link, if it carries one. Returns whether it does;
     done() runs once the design is in place. */
  /* inTab: a link pasted into an open tab; if it fails, the design on screen
     stays as it is rather than falling back to the saved session. */
  function openSharedLink(done, inTab) {
    if (location.hash.indexOf('#d=') !== 0) return false;
    // Only a link that won't decode counts as damaged; a problem after it has
    // loaded is not the link's fault and must not load a second time.
    WB.shareDecode(location.hash).then(function (p) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('not a design');
      // A short link holds only the changes from the defaults.
      if (p.diff) p.state = WB.sharePatch(JSON.parse(CS.serialize(CS.defaults())), p.state || {});
      return p;
    }).then(function (p) {
      history.replaceState(null, '', WB.shareBase());   // later refreshes use the session
      loadPayload(p, function () {
        done();
        var n = p.picturesLeftOut;
        WB.sharePopup({ title: 'Opened a shared design', kind: n ? 'warn' : 'ok', body: n
          ? [{ warn: true, text: 'It had ' + (n === 1 ? 'a picture or image texture' : n + ' pictures or image textures') +
               ' that links cannot carry. Ask the sender for the design file to get ' + (n === 1 ? 'it' : 'them') + '.' }]
          : ['Changes you make stay in your own copy.'] });
      });
    }, function (err) {
      history.replaceState(null, '', WB.shareBase());
      WB.sharePopup({ kind: 'warn', title: 'That link could not be opened',
        body: ['It looks damaged or cut short. Ask for it again, or for the design file.'] });
      if (inTab || !restoreSession(done)) done();
    });
    return true;
  }

  /* ── session persistence ────────────────────────────────────────────
     The design survives a refresh via localStorage. Artwork is stored too, but
     dropped rather than losing the design if the quota is hit. */
  function clearSession() { session.clear(); }
  /* Returns true when a stored design is being restored. */
  function restoreSession(done) { return session.restore(done); }
  var session = new WB.Session({ key: 'dabba.session.v1', build: buildPayload, load: loadPayload });
  var storageOK = session.ok;
  function persist() { session.save(); }



  /* ── geometry engine ────────────────────────────────────────────── */
  function loadEngine() {
    busy(true, 'Loading the geometry engine…');
    WB.loadManifold().then(function (w) {
      CS.setManifold(w);
      busy(false);
      rebuild.now();                        // nothing to wait for: show the first model at once
    }, function (err) {
      busy(false);
      showWarnings([{ level: 'bad', msg: err.message }]);
    });
  }

  /* ── boot ───────────────────────────────────────────────────────── */
  function init() {
    expandNums();
    populate();

    plan = new CS.Plan($('#cplan'), state, {
      select: function (id) { select(id, true); },
      add: function (id, side) { if (id !== state.selected) state.selected = id; addSection(side); },
      addSide: function (side) { addSection(side, true); },
      remove: removeSection,
      focus: focusPanel,
      primSelect: function () { itemSig = ''; paintSections(); },
      beginEdit: function (ms) { beginEdit(ms == null ? 450 : ms); },
      endEdit: function () { if (undoHistory) undoHistory.commit(); },
      change: function (dragging) {
        if (dragging) { D = CS.describe(state); paintSections(); refreshValues(); rebuild(); persist(); return; }
        refresh();
        apply();
      }
    });

    face = new CS.FaceView($('#cface'), state,
      function (dragging) {
        // Dragging mutates state directly rather than through the binder, so it
        // has to save explicitly.
        if (dragging) { refreshValues(); rebuild(); persist(); return; }
        refresh();
        apply();
      },
      function () { beginEdit(450); });
    face.hidden = true;
    face.onSelect = function (key) {
      var bits = key.split(':'), f = faceNow();
      f[bits[0] === 'text' ? 'textIdx' : 'artIdx'] = +bits[1];
      refreshValues();
      paintLists();
      visibility();
      var p = $('#p-decor');
      if (!p.classList.contains('open')) p.classList.add('open');
    };

    try {
      viewer = new CS.Viewer($('#c3d'), function (id) {
        if (!id) return;
        select(id);
        focusPanel('compartment');
      });
    } catch (e) {
      viewer = { failed: true, setModel: function () {}, draw: function () {}, frame: function () {},
                 setPose: function () {}, setOutline: function () {} };
    }

    bind();
    bindScrubbing();
    bindHistory();
    WB.addResetButtons($$('.sidebar .panel'), resetPanel);
    WB.addCollapseAll($('#sidebar'));
    bindSections();
    bindLists();
    chrome();
    assets();
    exports_();

    // A link pasted into a tab that already has the app open.
    window.addEventListener('hashchange', function () {
      if (location.hash.indexOf('#d=') !== 0) return;
      if (undoHistory) undoHistory.commit();           // close any edit still pending first
      beginEdit(600000);
      openSharedLink(function () { afterLoad(); if (undoHistory) undoHistory.commit(); }, true);
    });
    var restoring = openSharedLink(afterLoad) ||
      restoreSession(function (note) {
        afterLoad();
        if (note) notice('warn', note);
      });
    refresh();

    var ro = new ResizeObserver(function () { drawViews(); });
    ro.observe($('#stage2d'));
    ro.observe($('#stage3d'));

    if (viewer && viewer.failed) {
      showWarnings([{ level: 'warn', msg: 'WebGL is unavailable, so the 3D preview is disabled. Export still works.' }]);
    }
    if (!storageOK) {
      showWarnings([{ level: 'warn', msg: 'This browser will not keep the design across refreshes here — ' +
        'localStorage is blocked. Use Save to keep a copy.' }]);
    }
    if (!restoring) apply();
    session.settled();
    loadEngine();
  }

  /* Live handles, for console poking and automated checks. */
  CS.getState = function () { return state; };
  CS.getViewer = function () { return viewer; };
  CS.getPlan = function () { return plan; };
  CS.getFace = function () { return face; };
  CS.getModel = function () { return lastModel; };
  CS.undo = function () { undoHistory.undo(); };
  CS.redo = function () { undoHistory.redo(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(window.CS);
