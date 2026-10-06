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
      num.type = 'number'; num.id = id; num.dataset.bind = path; num.step = row.dataset.step;
      if (+row.dataset.min >= 0) num.min = 0;
      nf.appendChild(num);
      var rng = document.createElement('input');
      rng.type = 'range'; rng.dataset.bind = path;
      rng.min = row.dataset.min; rng.max = row.dataset.max; rng.step = row.dataset.step;
      rng.setAttribute('aria-label', lab.textContent);
      if (row.dataset.range) { rng.dataset.range = row.dataset.range; num.dataset.range = row.dataset.range; }
      row.appendChild(lab); row.appendChild(nf); row.appendChild(rng);
    });
  }

  /* ── drag to change a number ────────────────────────────────────────
     As in Unity's inspector: the label, and the left and right edges of the
     box, are drag handles. Drag sideways to change the value — Shift for big
     steps, Alt for fine ones; click the middle of the box to type. */
  var SCRUB_EDGE = 10;

  function scrubbable(input, label) {
    var nearEdge = function (e) {
      var r = input.getBoundingClientRect(), x = e.clientX - r.left;
      return x <= SCRUB_EDGE || x >= r.width - SCRUB_EDGE;
    };
    input.addEventListener('pointermove', function (e) {
      if (document.body.classList.contains('scrubbing')) return;
      input.classList.toggle('edgehot', !input.disabled && nearEdge(e));
    });
    input.addEventListener('pointerleave', function () { input.classList.remove('edgehot'); });
    input.addEventListener('pointerdown', function (e) {
      if (e.button === 0 && !input.disabled && nearEdge(e)) startScrub(e, input, input);
    });
    if (label) {
      label.classList.add('scrublabel');
      label.addEventListener('pointerdown', function (e) {
        if (e.button === 0 && !input.disabled) startScrub(e, input, label);
      });
    }
  }

  function startScrub(e, input, handle) {
    e.preventDefault();
    var x0 = e.clientX, v0 = parseFloat(input.value);
    if (!isFinite(v0)) v0 = 0;
    var step = parseFloat(input.step) || 1;
    var min = input.min !== '' ? parseFloat(input.min) : -Infinity;
    var moved = false;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('scrubbing');

    var move = function (ev) {
      var dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      var mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      var grain = step * (ev.altKey ? 0.1 : 1);
      var perPx = (step >= 1 ? step / 6 : step) * mult;
      var v = Math.max(min, Math.round((v0 + dx * perPx) / grain) * grain);
      var dp = Math.max(0, (String(grain).split('.')[1] || '').length);
      input.value = v.toFixed(Math.min(dp, 4));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    var up = function () {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('scrubbing');
      if (moved) input.dispatchEvent(new Event('change', { bubbles: true }));
      else { input.focus(); input.select(); }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  function bindScrubbing() {
    $$('input[type=number]').forEach(function (input) {
      var label = null;
      var row = input.closest('.row.num');
      if (row) label = $('label', row);
      var trio = input.closest('.trio label');
      if (trio) label = $('span', trio);
      scrubbable(input, label);
    });
  }

  function populate() {
    var bs = $('#f-b-style');
    CS.BORDER_STYLES.forEach(function (st) {
      var o = document.createElement('option');
      o.value = st[0]; o.textContent = st[1];
      bs.appendChild(o);
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
    CS.FONTS.forEach(function (f) {
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
  var undoStack = [], redoStack = [], pendingBefore = null, pendingTimer = 0;
  var HISTORY_LIMIT = 120;

  function snapshot() {
    return {
      state: CS.serialize(state),
      assets: { images: Object.assign({}, CS.assets.images),
                drawings: Object.assign({}, CS.assets.drawings), texture: CS.assets.texture }
    };
  }

  function sameMap(a, b) {
    var ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(function (k) { return a[k] === b[k]; });
  }
  function assetsEqual(a) {
    return sameMap(a.images, CS.assets.images) && sameMap(a.drawings, CS.assets.drawings) &&
           a.texture === CS.assets.texture;
  }

  function restore(snap) {
    var s = JSON.parse(snap.state);
    // Assign in place so anything holding a reference to `state` stays valid.
    Object.keys(state).forEach(function (k) { if (!(k in s)) delete state[k]; });
    Object.keys(s).forEach(function (k) { state[k] = s[k]; });
    CS.assets.images = Object.assign({}, snap.assets.images);
    CS.assets.drawings = Object.assign({}, snap.assets.drawings);
    CS.assets.texture = snap.assets.texture || null;
    face.invalidateBorder();
    refresh();
    apply();
  }

  /* Call immediately BEFORE mutating state. */
  function beginEdit(coalesceMs) {
    if (pendingBefore === null) pendingBefore = snapshot();
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(commitEdit, coalesceMs == null ? 450 : coalesceMs);
  }

  function commitEdit() {
    clearTimeout(pendingTimer);
    if (pendingBefore === null) return;
    // Nothing actually changed (e.g. slider returned to its original value).
    if (pendingBefore.state !== CS.serialize(state) || !assetsEqual(pendingBefore.assets)) {
      undoStack.push(pendingBefore);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack.length = 0;
    }
    pendingBefore = null;
    paintHistory();
  }

  function undo() {
    commitEdit();                     // fold any in-flight burst in first
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    paintHistory();
  }

  function redo() {
    commitEdit();
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    paintHistory();
  }

  function paintHistory() {
    var u = $('#btn-undo'), r = $('#btn-redo');
    var pend = pendingBefore !== null ? 1 : 0;
    u.disabled = !(undoStack.length + pend);
    r.disabled = !redoStack.length;
  }

  /* Text fields have their own native undo; leave those alone. */
  function inTextEntry() {
    var el = document.activeElement;
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' && /^(text|number|search|email|url|password)$/.test(el.type);
  }

  function bindHistory() {
    $('#btn-undo').addEventListener('click', undo);
    $('#btn-redo').addEventListener('click', redo);
    document.addEventListener('keydown', function (e) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        if (inTextEntry()) return;
        e.preventDefault(); undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        if (inTextEntry() && k === 'z') return;
        e.preventDefault(); redo();
      }
    });
    paintHistory();
  }

  /* ── declarative two-way binding ───────────────────────────────── */
  function bind() {
    $$('[data-bind]').forEach(function (el) {
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
        v = coerce(path, v);
        if (typeof v === 'number' && !isFinite(v)) return;   // half-typed number
        // Sliders and typing coalesce into one undo step; discrete pickers don't.
        var continuous = el.type === 'range' || el.type === 'number' || el.tagName === 'TEXTAREA' ||
                         el.type === 'text' || el.type === 'color';
        beginEdit(continuous ? 450 : 0);
        setV(path, v);
        onEdit(path, el);
      });
      if (el.type === 'number') {
        // Settle the field to the stored value once typing is done.
        el.addEventListener('change', function () { refreshValues(); });
      }
    });
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
      if (v === undefined) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'number') el.value = Math.round(v * 1000) / 1000;
      else el.value = v;
    });
  }

  function refresh() {
    D = CS.describe(state);
    updateRanges();
    refreshValues();
    paintColours();
  }

  function labels() {
    var pct = Math.round(state.split * 100);
    $('#split-readout').textContent = pct + '% base · ' + (100 - pct) + '% lid';
    var th = getV('~a.threshold');
    $('#lbl-threshold').textContent = th == null ? '' : Math.round(th * 100) + '%';
  }

  /* Slider limits that depend on the design. */
  function updateRanges() {
    var lim = Math.ceil(Math.max(D.W, D.L) / 2) + 5;
    $$('[data-range=pos]').forEach(function (el) {
      if (el.type === 'range') { el.min = -lim; el.max = lim; }
    });

    /* Decoration depth follows wall thickness and layer height, so it only
       ever lands on whole layers and always leaves a floor behind. */
    var f = faceNow();
    var wallT = state.activeFace === 'lid' ? D.top : D.bottom;
    var lh = D.lh, minD = CS.minDepthOf(state);
    var lay = function (v) { return CS.tidy(Math.round(v / lh) * lh); };
    var maxCut = Math.max(minD, CS.tidy(Math.floor((wallT - minD) / lh + 1e-6) * lh));
    f.inlayDepth = CS.clamp(lay(f.inlayDepth), minD, maxCut);
    var maxRelief = f.relief === 'engraved' ? maxCut : 3;
    f.reliefHeight = CS.clamp(lay(f.reliefHeight), minD, Math.max(minD, maxRelief));
    [['#f-inlayDepth', f.inlayDepth, maxCut], ['#f-reliefHeight', f.reliefHeight, Math.max(minD, maxRelief)]]
      .forEach(function (q) {
        var el = $(q[0]);
        el.min = minD.toFixed(2); el.max = q[2].toFixed(2); el.step = lh.toFixed(2); el.value = q[1];
      });
    var rel = CS.faceRelief(state, f, wallT);
    var depthTxt = rel.depth.toFixed(2) + ' mm · ' + rel.snap.layers + ' layers';
    $('#lbl-inlay').textContent = depthTxt;
    $('#lbl-relief').textContent = depthTxt;
    $('#face-hint').textContent = f.relief === 'raised'
      ? 'Stands ' + rel.depth.toFixed(2) + ' mm proud of the face.'
      : 'Cut into a ' + wallT.toFixed(2) + ' mm ' + (state.activeFace === 'lid' ? 'lid top' : 'floor') +
        ', keeping at least ' + minD.toFixed(2) + ' mm (' + CS.MIN_LAYERS + ' layers) behind it.' +
        (rel.snap.tooThin ? ' Too thin for that — thicken the wall.' : '');

    var wavy = CS.isWavyBorder(f.border.style);
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

  function addSection(side) {
    var s = sectionNow();
    if (!s) return;
    beginEdit(0);
    var res = CS.layout.addNeighbor(state.layout, s.id, side);
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
      $('.dot', b).style.background = s.shape === 'round' ? 'transparent' : 'var(--ink3)';
      $('.dot', b).style.borderRadius = s.shape === 'round' ? '50%' : '3px';
      $('.dot', b).style.boxShadow = 'inset 0 0 0 2px var(--ink3)';
      $('.txt', b).textContent = s.name || 'Compartment ' + (i + 1);
      $('.num', b).textContent = fmt(s.w) + '×' + fmt(s.l) + '×' + fmt(s.h);
      b.addEventListener('click', function () { select(s.id, true); });
      box.appendChild(b);
    });
    $('#cap-sections').textContent = secs.length + (secs.length === 1 ? ' compartment' : ' compartments');

    var s = sectionNow();
    $('#sec-editor').hidden = !s;
    if (!s) return;
    var auto = s.depth == null;
    $('#sec-depth-auto').checked = auto;
    var dEl = $('#sec-depth');
    if (document.activeElement !== dEl) dEl.value = s._depth != null ? s._depth : '';
    dEl.disabled = auto;
    $('#sec-depth-now').textContent = s._depth != null ? s._depth.toFixed(2) + ' mm' : '';
    var up = s.h - (s._depth || 0);
    $('#sec-depth-hint').textContent = (auto
      ? (state.seat === 'flush' ? 'Matched to the object, up to the full ' + D.Hb.toFixed(1) + ' mm the base allows.'
                                : 'Reaches the floor: the full ' + D.Hb.toFixed(1) + ' mm of the base.')
      : 'Custom; the base allows up to ' + D.Hb.toFixed(1) + ' mm.') +
      (up > 0.05 ? ' The object stands ' + up.toFixed(1) + ' mm above the rim, into the lid.' : '');

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

  function bindSections() {
    $$('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { addSection(b.dataset.add); });
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
      s.depth = e.target.checked ? null : (s._depth || s.h);
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
      ? 'click to select · drag an edge to resize · <b>+</b> adds a neighbour · Delete removes'
      : 'click to select · drag to move · corner handles resize · arrow keys nudge';
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
  var rebuild = CS.debounce(function () {
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
      viewer.setModel(model.parts, model.D, model.atlas);
      viewer.setOutline(state.selected);
      if (first) viewer.frame();
      viewer.draw();
    }
    stats(model, performance.now() - t0);
    showWarnings(model.warnings);
  }, 180);

  function stats(model, ms) {
    var s = model.stats;
    $('#stat-dims').innerHTML = '<b>' + s.w.toFixed(1) + ' × ' + s.l.toFixed(1) + ' × ' + s.h.toFixed(1) + '</b> mm';
    $('#stat-tris').innerHTML = '<b>' + s.tris.toLocaleString() + '</b> triangles';
    var grams = s.vol / 1000 * 1.24;   // PLA
    $('#stat-mass').innerHTML = '<b>' + grams.toFixed(1) + '</b> g · ' + Math.round(ms) + ' ms';
  }

  function showWarnings(list) {
    var box = $('#warnings');
    box.innerHTML = '';
    var order = { bad: 0, warn: 1, ok: 2 };
    (list || []).slice().sort(function (a, b) { return order[a.level] - order[b.level]; }).forEach(function (w) {
      var d = document.createElement('div');
      d.className = 'w ' + w.level;
      d.innerHTML = '<span class="ic">' +
        (w.level === 'bad' ? '●' : w.level === 'warn' ? '▲' : 'ⓘ') + '</span><span></span>';
      d.lastChild.textContent = w.msg;
      box.appendChild(d);
    });
  }

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

  function onEdit(path, el) {
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

    $$('#pose button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#pose button').forEach(function (x) { x.classList.toggle('on', x === b); });
        $('#angle-wrap').style.visibility = b.value === 'open' ? '' : 'hidden';
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

    drawpad = new CS.DrawPad($('#drawmodal'));

    $$('[data-draw]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = faceNow();
        var art = f.arts[f.artIdx];
        drawpad.open('art', art ? CS.assets.drawings[art.id] : null, null);
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
          CS.download(blob, safeName() + '.3mf');
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
          CS.download(blob, safeName() + '.stl');
        } catch (e) {
          busy(false);
          showWarnings([{ level: 'bad', msg: 'Export failed: ' + e.message }]);
        }
      }, 30);
    });

    $('#btn-save').addEventListener('click', function () {
      CS.download(new Blob([JSON.stringify(buildPayload())], { type: 'application/json' }),
                  safeName() + '.case.json');
    });

    $('#btn-load').addEventListener('click', function () { $('#loadfile').click(); });
    $('#loadfile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var parsed = JSON.parse(fr.result);
          beginEdit(0);
          loadPayload(parsed, afterLoad);
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
      var d = CS.defaults();
      Object.keys(state).forEach(function (k) { if (!(k in d)) delete state[k]; });
      Object.keys(d).forEach(function (k) { state[k] = d[k]; });
      CS.assets.images = {};
      CS.assets.drawings = {};
      CS.assets.texture = null;
      clearSession();
      afterLoad();
    });
  }

  function afterLoad() {
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

    (function merge(dst, src) {
      Object.keys(dst).forEach(function (k) {
        if (src[k] === undefined || k === 'layout' || k === 'faces') return;
        if (dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k]) &&
            src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
          merge(dst[k], src[k]);
        } else { dst[k] = src[k]; }
      });
    })(d, ps);

    if (ps.layout && (ps.layout.kind === 'section' || ps.layout.kind === 'split')) {
      d.layout = (function fix(n) {
        if (n.kind === 'split') {
          n.children = (n.children || []).map(fix).filter(Boolean);
          if (!n.id) n.id = CS.newId('g');
          return n;
        }
        var base = CS.newSection();
        var out = Object.assign(base, n);
        out.grooves = Object.assign(CS.newSection().grooves, n.grooves || {});
        out.groove = Object.assign(CS.newSection().groove, n.groove || {});
        if (!out.id) out.id = CS.newId('s');
        return out;
      })(ps.layout);
      d.layout = CS.layout.normalize(d.layout) || CS.defaults().layout;
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
        var n = CS.newText(t); n.font = CS.fontKey(n.font); return n;
      });
      f.arts = (f.arts || []).map(function (a) { return CS.newArt(a); });
      f.textIdx = CS.clamp(f.textIdx || 0, 0, Math.max(0, f.texts.length - 1));
      f.artIdx = CS.clamp(f.artIdx || 0, 0, Math.max(0, f.arts.length - 1));
    });

    if (!CS.layout.find(d.layout, d.selected)) d.selected = CS.layout.sections(d.layout)[0].id;

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

  /* ── session persistence ────────────────────────────────────────────
     The design survives a refresh via localStorage. Artwork is stored too, but
     dropped rather than losing the design if the quota is hit. */
  var STORE_KEY = 'dabba.session.v1';
  var storageOK = (function () {
    try {
      localStorage.setItem('dabba.probe', '1');
      localStorage.removeItem('dabba.probe');
      return true;
    } catch (e) { return false; }
  })();

  var persist = CS.debounce(function () {
    if (!storageOK) return;
    var payload = buildPayload();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    } catch (e) {
      try {                                   // over quota: keep the design at least
        payload.assets = {};
        payload.assetsDropped = true;
        localStorage.setItem(STORE_KEY, JSON.stringify(payload));
      } catch (e2) { /* give up silently; the design is still on screen */ }
    }
  }, 900);

  function clearSession() {
    if (!storageOK) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* nothing to undo */ }
  }

  function restoreSession(done) {
    if (!storageOK) return false;
    var raw;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      var p = JSON.parse(raw);
      loadPayload(p, function () {
        done(p.assetsDropped ? 'Restored your last session, but the artwork was too large to keep.' : null);
      });
      return true;
    } catch (e) {
      clearSession();
      return false;
    }
  }

  /* ── geometry engine ────────────────────────────────────────────── */
  function loadEngine() {
    busy(true, 'Loading the geometry engine…');
    var bin;
    try {
      var s = atob(window.ManifoldWasmBase64);
      bin = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);
    } catch (e) {
      busy(false);
      showWarnings([{ level: 'bad', msg: 'vendor/manifold.js is missing or damaged, so nothing can be built.' }]);
      return;
    }
    window.ManifoldModule({ wasmBinary: bin }).then(function (w) {
      w.setup();
      CS.setManifold(w);
      busy(false);
      rebuild();
    }).catch(function (err) {
      busy(false);
      showWarnings([{ level: 'bad', msg: 'The geometry engine failed to start: ' + err.message }]);
    });
  }

  /* ── boot ───────────────────────────────────────────────────────── */
  function init() {
    expandNums();
    populate();

    plan = new CS.Plan($('#cplan'), state, {
      select: function (id) { select(id, true); },
      add: function (id, side) { if (id !== state.selected) state.selected = id; addSection(side); },
      remove: removeSection,
      focus: focusPanel,
      beginEdit: function () { beginEdit(450); },
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
    bindSections();
    bindLists();
    chrome();
    assets();
    exports_();

    var restoring = restoreSession(function (note) {
      afterLoad();
      if (note) showWarnings([{ level: 'warn', msg: note }]);
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
    loadEngine();
  }

  /* Live handles, for console poking and automated checks. */
  CS.getState = function () { return state; };
  CS.getViewer = function () { return viewer; };
  CS.getPlan = function () { return plan; };
  CS.getModel = function () { return lastModel; };
  CS.undo = undo;
  CS.redo = redo;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(window.CS);
