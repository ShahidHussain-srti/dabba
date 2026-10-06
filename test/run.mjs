/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* run.mjs — geometry and export checks, run with `npm test`.
 *
 * The important ones are physical: base and lid must not overlap when closed,
 * the lid must swing through 180° without hitting the base, every part must be
 * a valid closed solid, and the 3MF must carry its colour assignments. */
import { load, toManifold } from './harness.mjs';

const { CS, wasm } = await load(['util.js', 'texture.js', 'items.js', 'layout.js', 'geometry.js', 'export.js']);

let failed = 0, passed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

/* Volume shared by the base and the lid in a given pose. */
function clash(model, mode, angle) {
  const b = model.parts.find(p => p.half === 'base' && p.key === 'base');
  const l = model.parts.find(p => p.half === 'lid' && p.key === 'lid');
  const mb = toManifold(wasm, b), ml = toManifold(wasm, l, CS.poseFor(model.D, 'lid', mode, angle));
  const i = mb.intersect(ml), v = i.volume();
  [mb, ml, i].forEach(m => m.delete());
  return v;
}

function variants() {
  const out = [];
  const base = CS.defaults();
  out.push(['default (snap clasp, lip, 2×3 hinge)', base]);

  const s2 = CS.defaults();
  s2.hinge.side = 'right'; s2.clasp.type = 'magnet'; s2.walls.side = 7.4; s2.clasp.count = 2;
  out.push(['hinge on right, magnets', s2]);

  const s3 = CS.defaults();
  s3.hinge.side = 'left'; s3.clasp.type = 'bump'; s3.clasp.count = 3; s3.split = 0.35;
  s3.outer.taper = 3; CS.layout.sections(s3.layout).forEach(sec => { sec.pocket.taper = 4; }); s3.outer.edgeStyle = 'chamfer';
  out.push(['hinge on left, bumps, tapers, chamfers, 35/65 split', s3]);

  const s4 = CS.defaults();
  s4.hinge.side = 'front'; s4.lip.enabled = false; s4.clasp.count = 2; s4.hinge.count = 1; s4.hinge.knuckles = 5;
  CS.layout.sections(s4.layout).forEach(s => { s.grooves.left = s.grooves.right = true; });
  out.push(['hinge on front, no lip, finger notches', s4]);

  for (const side of ['back', 'right']) {
    const h = CS.defaults();
    h.hinge.side = side; h.clasp.type = 'hook'; h.clasp.count = side === 'back' ? 2 : 1; h.clasp.width = 22;
    h.lidInner.mode = 'mirror';
    out.push(['hook latches, mirrored lid, hinge ' + side, h]);
  }

  for (const side of ['back', 'left']) {
    const w = CS.defaults();
    w.hinge.side = side; w.clasp.type = 'swing'; w.clasp.count = side === 'back' ? 2 : 1;
    out.push(['swing hooks, hinge ' + side, w]);
  }
  const w2 = CS.defaults();
  w2.clasp.type = 'swing'; w2.clasp.latchDrop = 3; w2.clasp.latchD = 8; w2.lip.height = 4; w2.split = 0.55;
  out.push(['big swing hook, tall lip', w2]);
  for (const side of ['back', 'left']) {
    const pr = CS.defaults();
    pr.hinge.side = side; pr.clasp.type = 'press'; pr.clasp.count = side === 'back' ? 2 : 1;
    out.push(['press latches, hinge ' + side, pr]);
  }
  const pr2 = CS.defaults(); pr2.clasp.type = 'press'; pr2.clasp.reach = 9; pr2.lip.enabled = false; pr2.lidInner.mode = 'walls';
  out.push(['long-reach press latch, no lip, walls-only lid', pr2]);

  const m2 = CS.defaults();
  m2.lidInner.mode = 'mirror'; m2.lidInner.depth = 'fit'; m2.lip.sides.front = false; m2.hinge.side = 'left';
  m2.clasp.type = 'hook'; m2.clasp.latchDrop = 4; m2.split = 0.5;
  out.push(['fit-depth lid pockets, no lip on the front, long hook', m2]);

  const m3 = CS.defaults();
  m3.lidInner.mode = 'mirror'; m3.lip.height = 4; m3.lip.sides.right = false; m3.hinge.side = 'front'; m3.split = 0.45;
  out.push(['mirrored lid with a tall lip, hinge on front', m3]);

  const t1 = CS.defaults();
  t1.texture.enabled = true; t1.texture.sides.lid.face = 'hex'; t1.texture.sides.base.left = 'ribs';
  t1.texture.sides.base.right = 'none'; t1.faces.lid.enabled = false;
  out.push(['knurled sides, hex lid top, mixed base sides', t1]);

  const r1 = CS.defaults();
  r1.texture.enabled = true; r1.texture.pattern = 'hex'; r1.texture.depth = 0.8; r1.texture.raise = 0.8;
  r1.texture.sides.lid.face = 'all'; r1.texture.sides.base.face = 'all'; r1.faces.lid.enabled = false;
  out.push(['raised hex on walls and faces', r1]);
  const r2 = CS.defaults();
  r2.texture.enabled = true; r2.texture.pattern = 'knurl'; r2.texture.depth = 0.6; r2.texture.raise = 0.3;
  r2.clasp.type = 'magnet'; r2.walls.side = 7.4; r2.hinge.side = 'left';
  out.push(['half-raised knurl, magnets, hinge left', r2]);

  const r3 = CS.defaults();
  r3.texture.enabled = true; r3.texture.pattern = 'scales'; r3.texture.depth = 0.5; r3.texture.raise = -0.6;
  r3.texture.sides.lid.face = 'all'; r3.faces.lid.enabled = false; r3.walls.top = 2.4;
  out.push(['sunk fish scales (outer depth below zero)', r3]);
  const r4 = CS.defaults();
  r4.texture.enabled = true; r4.texture.pattern = 'ribs'; r4.texture.depth = 0.6; r4.texture.raise = -2;
  out.push(['outer depth far below zero is held back', r4]);

  const b1 = CS.defaults();
  b1.texture.enabled = true; b1.texture.pattern = 'ribs'; b1.texture.sides.lid.face = 'all'; b1.faces.lid.enabled = false;
  b1.texture.borders = { base: { bottom: 0, top: 3, face: 1 }, lid: { bottom: 2.5, top: 0, face: 4 } };
  out.push(['different border on every edge', b1]);

  const g1 = CS.defaults();
  g1.gridfinity.enabled = true; g1.texture.enabled = true; g1.texture.pattern = 'voronoi'; g1.texture.depth = 0.4;
  out.push(['gridfinity case with stone texture', g1]);

  const s5 = CS.defaults();
  s5.layout = CS.newSection({ w: 80, l: 50, h: 30 });
  s5.seat = 'floor'; s5.split = 0.5; s5.clasp.type = 'none';
  out.push(['single compartment, 50/50, no clasp', s5]);
  // Shaped compartments: an air pump, batteries, bits, cards and free shapes.
  const it1 = CS.defaults();
  const secs1 = CS.layout.sections(it1.layout);
  secs1[0].item = 'stepped'; secs1[0].params = { stepped: { segs: [{ d: 42, len: 105 }, { d: 22, len: 28 }, { d: 9, len: 30 }] } };
  secs1[1].item = 'batteries'; secs1[1].params = { batteries: { type: 'AA', rows: 2, cols: 3, lying: 'yes' } };
  secs1[2].item = 'bits'; secs1[2].params = { bits: { rows: 2, cols: 4 } };
  out.push(['stepped pump, lying AA, hex bits', it1]);
  const it2 = CS.defaults();
  const secs2 = CS.layout.sections(it2.layout);
  secs2[0].item = 'custom';
  secs2[0].prims = [CS.newPrim('cyl', { w: 90, l: 28 }), CS.newPrim('rect', { x: 30, y: 22, w: 24, l: 18, rot: 30, depth: 6 }),
                    CS.newPrim('capsule', { x: -30, y: -20, w: 50, l: 12, rot: -15 }), CS.newPrim('hex', { x: 45, y: -18, w: 12 })];
  secs2[1].item = 'cards'; secs2[1].params = { cards: { type: 'SD', count: 5 } };
  secs2[2].item = 'batteries'; secs2[2].params = { batteries: { type: '18650', rows: 1, cols: 2 } };
  out.push(['custom shapes, SD slots, standing 18650', it2]);

  const tr = CS.defaults();
  tr.build = 'tray'; tr.gridfinity.enabled = true; tr.texture.enabled = true; tr.texture.pattern = 'bricks';
  out.push(['gridfinity tray (base only), bricks', tr]);
  const tr2 = CS.defaults();
  tr2.build = 'tray';
  out.push(['plain tray', tr2]);
  return out;
}

console.log('geometry');
for (const [name, state] of variants()) {
  const t0 = Date.now();
  const model = CS.buildModel(state, { decor: false });
  const ms = Date.now() - t0;
  console.log(' ' + name + ' — ' + model.parts.length + ' parts, ' + model.stats.tris + ' tris, ' + ms + ' ms, ' +
    model.stats.w.toFixed(1) + '×' + model.stats.l.toFixed(1) + '×' + model.stats.h.toFixed(1));
  check('every part is a valid solid', model.parts.every(p => p.status === 'NoError' && p.volume > 0),
        model.parts.map(p => p.label + ':' + p.status).join(', '));
  // Texture and feet must not detach anything: each body stays one piece.
  const pieces = model.parts.filter(p => p.key === 'base' || p.key === 'lid').map(p => {
    const m = toManifold(wasm, p), n = m.decompose().length; m.delete(); return n;
  });
  check('each body is one piece', pieces.every(n => n === 1), pieces.join(','));
  if (state.build === 'tray') {
    check('a tray is just the base', model.parts.length === 1 && model.parts[0].key === 'base');
    if (state.gridfinity.enabled) {
      const g = model.D.grid;
      check('gridfinity footprint is whole units less 0.5 mm',
            Math.abs(model.D.W - (g.nx * 42 - 0.5)) < 1e-9 && Math.abs(model.D.L - (g.ny * 42 - 0.5)) < 1e-9,
            g.nx + '×' + g.ny + ' → ' + model.D.W + '×' + model.D.L);
    }
    continue;
  }
  const closed = clash(model, 'closed');
  check('base and lid do not overlap when closed', closed < 1e-3, closed.toFixed(4) + ' mm³');
  /* A snap hook is meant to catch: it overlaps its slot until the tab is
     flexed outward. Swing-test the hinge with the hooks off, and separately
     check the only thing in the way at the start is the hook itself. */
  let swing = model;
  if (state.clasp.type === 'press') {
    const free = JSON.parse(JSON.stringify(state));
    free.clasp.type = 'none';
    swing = CS.buildModel(free, { decor: false });
    const P = model.D.press, c = state.clasp, hook = model.D.clasps.length * c.width * (P.eP + 0.5) * (P.eP + P.nf + 1.5);
    const v5 = clash(model, 'open', 5);
    check('only the press hooks resist opening', v5 < hook, v5.toFixed(2) + ' mm³ vs hook ' + hook.toFixed(2));
    // Rocking the tab by its release angle about the web swings the hook's tip
    // clear of the slot, and the press side has room to move that far.
    const tipBelow = P.zW - P.tw / 2 - P.zTopNub, out = P.theta * tipBelow;
    check('pressing frees the hook before the tab meets the wall', out >= P.e + P.gapAt + P.cl && P.theta * P.pressH <= P.gP - 0.3,
          'hook moves ' + out.toFixed(2) + ' mm for ' + (P.e + P.gapAt + P.cl).toFixed(2) + ', press travel ' + (P.theta * P.pressH).toFixed(2) + ' of ' + P.gP.toFixed(2));
    check('the press latch web bends within what PLA repeats', P.strain <= 0.03, (P.strain * 100).toFixed(2) + '%');
  }
  if (state.clasp.type === 'snap') {
    const free = JSON.parse(JSON.stringify(state));
    free.clasp.type = 'none';
    swing = CS.buildModel(free, { decor: false });
    const c = state.clasp, hook = model.D.clasps.length * c.width * (c.catch + c.clearance + 0.5) * (c.catch * 2 + 1.5);
    const v5 = clash(model, 'open', 5);
    check('only the snap hooks resist opening', v5 < hook, v5.toFixed(2) + ' mm³ vs hook ' + hook.toFixed(2));
  }
  let worst = 0, at = 0;
  for (let a = 5; a <= 180; a += 5) {
    const v = clash(swing, 'open', a);
    if (v > worst) { worst = v; at = a; }
  }
  check('lid swings to 180° without hitting the base', worst < 1e-3, worst.toFixed(4) + ' mm³ at ' + at + '°');
  const hooks = model.parts.filter(p => p.half === 'latch');
  if (state.clasp.type === 'hook' || state.clasp.type === 'swing') {
    check('one hook per latch', hooks.length === model.D.clasps.length, hooks.length + ' hooks');
    const others = model.parts.filter(p => p.key === 'base' || p.key === 'lid');
    let worstHook = 0, worstFlat = 0;
    for (const h of hooks) for (const o of others) {
      for (const mode of ['closed', 'print']) {
        const a = toManifold(wasm, h, CS.poseFor(model.D, h, mode)), b = toManifold(wasm, o, CS.poseFor(model.D, o, mode));
        const i = a.intersect(b), v = i.volume();
        if (mode === 'closed') worstHook = Math.max(worstHook, v); else worstFlat = Math.max(worstFlat, v);
        [a, b, i].forEach(m => m.delete());
      }
    }
    check('hooks clear base and lid when closed', worstHook < 1e-3, worstHook.toFixed(4) + ' mm³');
    check('hooks lie apart on the print bed', worstFlat < 1e-3, worstFlat.toFixed(4) + ' mm³');
    const lowest = Math.min(...hooks.map(h => { const p = CS.posed(h, CS.poseFor(model.D, h, 'print')).positions; let m = Infinity; for (let i = 2; i < p.length; i += 3) m = Math.min(m, p[i]); return m; }));
    check('hooks lie flat on the bed', Math.abs(lowest) < 1e-3, lowest.toFixed(4));
  }
  const flat = clash(model, 'print');
  check('print layout pieces are apart', flat < 1e-3, flat.toFixed(4) + ' mm³');
  const bad = model.warnings.filter(w => w.level === 'bad');
  check('no blocking warnings', !bad.length, bad.map(w => w.msg).join(' | '));
}

console.log('items');
{
  // A lying cylinder rests on the compartment floor: its trough bottom is the floor.
  const s = CS.defaults(); s.layout = CS.newSection({ item: 'cylinder', params: { cylinder: { d: 30, len: 100 } } });
  s.selected = s.layout.id;
  const D = CS.resolve(s), r = D.rects[0];
  check('a lying cylinder reserves its length × diameter plus fit', Math.abs(r.w - (100 + 2 * s.fit)) < 1e-6 && Math.abs(r.l - (30 + 2 * s.fit)) < 1e-6,
        r.w.toFixed(2) + ' × ' + r.l.toFixed(2));
  check('the closed case has room for the whole cylinder', D.Hi >= 30 && D.Ht >= 30 - r.node._depth, 'Hi ' + D.Hi + ', in base ' + r.node._depth + ', lid ' + D.Ht);
  const m = CS.buildModel(s, { decor: false });
  const base = m.parts.find(p => p.key === 'base');
  const mb = toManifold(wasm, base);
  // A probe at the cylinder's lowest line should be empty; just under it, solid.
  const zf = D.zP - r.node._depth;
  const probe = (z) => { const b = wasm.Manifold.cube([4, 4, 0.1], true).translate([0, 0, z]); const v = b.intersect(mb).volume(); b.delete(); return v; };
  check('the trough bottom sits on the compartment floor', probe(zf + 0.3) < 1e-3 && probe(zf - 0.3) > 1e-3,
        'above ' + probe(zf + 0.3).toFixed(4) + ', below ' + probe(zf - 0.3).toFixed(4));
  const edge = (y, z) => { const b = wasm.Manifold.cube([4, 0.2, 0.2], true).translate([0, y, z]); const v = b.intersect(mb).volume(); b.delete(); return v; };
  const Rr = r.l / 2;
  check('the trough is round: solid beside the bottom, open at the axis', edge(Rr * 0.8, zf + 1) > 1e-4 && edge(Rr * 0.8, zf + Rr) < 1e-4,
        edge(Rr * 0.8, zf + 1).toFixed(4) + ' / ' + edge(Rr * 0.8, zf + Rr).toFixed(4));
  mb.delete();
  const st = CS.itemShape(CS.newSection({ item: 'stepped', params: { stepped: { segs: [{ d: 40, len: 100 }, { d: 20, len: 30 }] } } }), 0.4);
  check('stepped cylinder sections share one axis', st.prims.every(q => Math.abs(q.axis - (40 + 0.8) / 2) < 1e-9) && Math.abs(st.w - 130.8) < 1e-9,
        st.prims.map(q => q.axis).join(',') + ' w ' + st.w);
  const bt = CS.itemShape(CS.newSection({ item: 'batteries', params: { batteries: { type: 'AA', rows: 2, cols: 3, hold: 50 } } }), 0.4);
  check('standing batteries hold half their length', bt.prims.length === 6 && bt.prims.every(q => Math.abs(q.depth - 25.25) < 1e-9) && bt.h === 50.5);
}

console.log('layout');
{
  const s = CS.defaults();
  const D = CS.resolve(s);
  const secs = D.rects;
  let minGap = Infinity;
  for (let i = 0; i < secs.length; i++) for (let j = i + 1; j < secs.length; j++) {
    const a = secs[i], b = secs[j];
    const gx = Math.max(b.x0 - a.x1, a.x0 - b.x1), gy = Math.max(b.y0 - a.y1, a.y0 - b.y1);
    minGap = Math.min(minGap, Math.max(gx, gy));
  }
  check('thinnest inner wall equals the setting', Math.abs(minGap - s.walls.inner) < 1e-6, minGap.toFixed(3));
  check('every cavity is object + fit', secs.every(r => Math.abs(r.w - (r.node.w + 2 * s.fit)) < 1e-6 &&
                                                       Math.abs(r.l - (r.node.l + 2 * s.fit)) < 1e-6));
  const id = s.selected;
  const res = CS.layout.addNeighbor(s.layout, id, 'right');
  s.layout = res.root;
  check('adding a neighbour adds a compartment', CS.layout.sections(s.layout).length === 4);
  s.layout = CS.layout.remove(s.layout, res.id);
  check('removing it restores the tree', CS.layout.sections(s.layout).length === 3 && s.layout.kind === 'split');
  const stretch = CS.defaults();
  const small = CS.layout.sections(stretch.layout)[1];
  // The two small compartments stack shorter than the large one beside them.
  small.alignY = 'stretch';
  const D2 = CS.resolve(stretch);
  const r2 = D2.rects.find(r => r.id === small.id);
  const slack = D2.IL - (2 * (18 + 2 * stretch.fit) + stretch.walls.inner);
  check('stretch grows the cavity into the slack', slack > 0.5 && Math.abs(r2.l - (small.l + 2 * stretch.fit + slack)) < 1e-6,
        'slack ' + slack.toFixed(2) + ', cavity ' + r2.l.toFixed(2));
}

console.log('moving and adding');
{
  const size = r => r.w.toFixed(4) + 'x' + r.l.toFixed(4);
  // Resizing one compartment grows the box but leaves every other cavity alone.
  const s = CS.defaults(), D0 = CS.resolve(s);
  const secs = CS.layout.sections(s.layout);
  let others = true, grew = true;
  secs.forEach(sec => {
    for (const k of ['w', 'l']) {
      const keep = sec[k];
      sec[k] = keep + 30;
      const D1 = CS.resolve(s);
      D1.rects.forEach((r, i) => { if (r.id !== sec.id && size(r) !== size(D0.rects[i])) others = false; });
      if (D1.W * D1.L <= D0.W * D0.L) grew = false;
      sec[k] = keep;
    }
  });
  check('resizing a compartment never resizes the others', others);
  check('resizing a compartment grows the case', grew);

  // An offset moves only that compartment, and stays inside the outer wall.
  const m = CS.defaults(), big = CS.layout.sections(m.layout)[0];
  const Da = CS.resolve(m), ra = Da.rects.find(r => r.id === big.id);
  big.dx = 3; big.dy = -2;
  const Db = CS.resolve(m), rb = Db.rects.find(r => r.id === big.id);
  // It fills the case front to back, so it can slide sideways but not forwards.
  const ex = Math.min(3, ra.range.x[1]), ey = Math.max(-2, ra.range.y[0]);
  check('an offset moves the compartment by that much, within its room', ex === 3 && Math.abs(rb.cx - ra.cx - ex) < 1e-9 && Math.abs(rb.cy - ra.cy - ey) < 1e-9,
        'moved ' + (rb.cx - ra.cx).toFixed(3) + ', ' + (rb.cy - ra.cy).toFixed(3) + ' room y ' + ra.range.y.map(v => v.toFixed(2)));
  check('an offset leaves the case and the others alone', Db.W === Da.W && Db.L === Da.L &&
        Db.rects.every((r, i) => r.id === big.id || (r.cx === Da.rects[i].cx && r.cy === Da.rects[i].cy)));
  big.dx = 999; big.dy = -999;
  const Dc = CS.resolve(m), rc = Dc.rects.find(r => r.id === big.id), mg = big._margin;
  check('a big offset is held at the outer wall', Math.abs(rc.x1 + mg - Dc.IW / 2) < 1e-9 && Math.abs(rc.y0 - mg + Dc.IL / 2) < 1e-9,
        'x1 ' + (rc.x1 + mg).toFixed(3) + ' / ' + (Dc.IW / 2).toFixed(3));
  big.dx = 40; big.dy = 0;
  const Dd = CS.resolve(m), rd = Dd.rects.find(r => r.id === big.id);
  const overlap = Dd.rects.some(r => r.id !== big.id && r.x0 < rd.x1 && r.x1 > rd.x0 && r.y0 < rd.y1 && r.y1 > rd.y0);
  check('a moved compartment may overlap its neighbours', overlap);
  const mo = CS.buildModel(m, { decor: false });
  check('overlapping pockets still build a valid base', mo.parts.every(p => { const t = toManifold(wasm, p); const ok = t.status() === 'NoError' && !t.isEmpty(); t.delete(); return ok; }));

  // Adding along a whole side spans it: the new compartment's slot is the full interior.
  for (const side of ['left', 'right', 'back', 'front']) {
    const a = CS.defaults(), before = CS.layout.sections(a.layout).length;
    const res = CS.layout.addAtSide(a.layout, side, CS.layout.sections(a.layout)[0]);
    a.layout = CS.layout.normalize(res.root);
    const Da2 = CS.resolve(a), r = Da2.rects.find(q => q.id === res.id);
    const across = side === 'left' || side === 'right' ? r.slot.y1 - r.slot.y0 : r.slot.x1 - r.slot.x0;
    const full = side === 'left' || side === 'right' ? Da2.IL : Da2.IW;
    const edge = { left: r.slot.x0 + Da2.IW / 2, right: Da2.IW / 2 - r.slot.x1, back: Da2.IL / 2 - r.slot.y1, front: r.slot.y0 + Da2.IL / 2 }[side];
    check('adding along the whole ' + side + ' side spans it', CS.layout.sections(a.layout).length === before + 1 &&
          Math.abs(across - full) < 1e-6 && Math.abs(edge) < 1e-6, 'span ' + across.toFixed(2) + '/' + full.toFixed(2) + ', edge ' + edge.toFixed(3));
  }
}

console.log('pocket shape per compartment');
{
  const s = CS.defaults(), secs = CS.layout.sections(s.layout);
  secs[0].pocket.taper = 8; secs[0].pocket.corner = 6;
  const D = CS.resolve(s);
  const [a, b] = [D.rects.find(r => r.id === secs[0].id), D.rects.find(r => r.id === secs[1].id)];
  check('taper widens only its own pocket', a.node._margin > 0.5 && b.node._margin === 0, a.node._margin.toFixed(3) + ' / ' + b.node._margin);
  check('each pocket keeps its own corner radius', a.node._P.corner === 6 && b.node._P.corner === 1.5);
  const m = CS.buildModel(s, { decor: false });
  check('mixed pocket shapes build a valid case', m.parts.every(p => { const t = toManifold(wasm, p); const ok = t.status() === 'NoError' && !t.isEmpty(); t.delete(); return ok; }));
  const fresh = CS.layout.addNeighbor(s.layout, secs[0].id, 'right');
  const added = CS.layout.find(fresh.root, fresh.id).node;
  check('a new compartment copies the pocket shape it was added from', added.pocket.taper === 8 && added.pocket !== secs[0].pocket);
}

console.log('lid mirrors the base');
{
  const s = CS.defaults();
  s.lidInner.mode = 'mirror'; s.lidInner.depth = 'mirror';
  const secs = CS.layout.sections(s.layout);
  secs[0].pocket.floor = 2; secs[0].pocket.rim = 1; secs[0].pocket.taper = 3; secs[1].pocket.corner = 4;
  const m = CS.buildModel(s, { decor: false }), D = m.D || CS.describe(s);
  const base = toManifold(wasm, m.parts.find(p => p.key === 'base')), lid = toManifold(wasm, m.parts.find(p => p.key === 'lid'));
  const gap = s.lidInner.gap, zm = D.zP + gap / 2;
  // Inside the interior, keeping clear of the lip and the hinge sweep.
  const inset = 3, W = D.IW - 2 * inset, L = D.IL - 2 * inset;
  const slab = (body, z) => { const b = wasm.Manifold.cube([W, L, 0.1], true).translate([0, 0, z]); const v = body.intersect(b).volume(); b.delete(); return v; };
  let worst = 0, rows = [];
  for (const k of [gap / 2 + 0.3, gap / 2 + 1, 3, 6, 9]) {
    if (zm + k > D.zP + D.Ht - 0.2 || zm - k < D.bottom + 0.2) continue;
    const a = slab(base, zm - k), b = slab(lid, zm + k);
    worst = Math.max(worst, Math.abs(a - b) / Math.max(a, 1e-6));
    rows.push(k.toFixed(1) + ':' + a.toFixed(1) + '/' + b.toFixed(1));
  }
  check('each lid slice matches the base slice it mirrors', rows.length >= 3 && worst < 0.02, rows.join(' '));
  base.delete(); lid.delete();
  // Walls only: dividers over the base walls, open over each compartment.
  const w = JSON.parse(JSON.stringify(s)); w.lidInner.mode = 'walls';
  const mw = CS.buildModel(w, { decor: false }), lw = toManifold(wasm, mw.parts.find(p => p.key === 'lid'));
  const open = CS.buildModel(Object.assign(JSON.parse(JSON.stringify(s)), { lidInner: { mode: 'open', gap: gap, depth: 'mirror' } }), { decor: false });
  const lo = toManifold(wasm, open.parts.find(p => p.key === 'lid'));
  const z2 = zm + 2, sw = slab(lw, z2), so = slab(lo, z2), sm = slab(toManifold(wasm, m.parts.find(p => p.key === 'lid')), z2);
  const r0 = D.rects[0], probe = wasm.Manifold.cube([2, 2, 0.1], true).translate([r0.cx, r0.cy, z2]);
  const overPocket = lw.intersect(probe).volume();
  check('walls only: dividers in the lid, nothing over the compartments', sw > so + 0.5 && Math.abs(sw - sm) / sm < 0.15 && overPocket < 1e-6,
        'walls ' + sw.toFixed(1) + ', open ' + so.toFixed(1) + ', mirror ' + sm.toFixed(1) + ', over pocket ' + overPocket.toFixed(4));
  probe.delete(); lw.delete(); lo.delete();
  check('the mirrored lid is a valid solid', m.parts.every(p => { const t = toManifold(wasm, p); const ok = t.status() === 'NoError'; t.delete(); return ok; }));
}

console.log('export');
{
  const s = CS.defaults();
  s.colors.lid = '#ff0000';
  const model = CS.buildModel(s, { decor: false });
  const blob = await CS.exportThreeMF(model, s);
  const buf = new Uint8Array(await blob.arrayBuffer());
  check('3MF is a zip', buf[0] === 0x50 && buf[1] === 0x4b);
  const files = await unzip(buf);
  const names = Object.keys(files);
  check('3MF has model and slicer configs', ['3D/3dmodel.model', 'Metadata/model_settings.config',
    'Metadata/Slic3r_PE_model.config', 'Metadata/project_settings.config', '[Content_Types].xml', '_rels/.rels']
    .every(n => names.includes(n)), names.join(', '));
  const xml = files['3D/3dmodel.model'];
  const ms = files['Metadata/model_settings.config'];
  const items = (xml.match(/<item /g) || []).length;
  check('two build items (base and lid)', items === 2, items + ' items');
  const comps = [...xml.matchAll(/<component objectid="(\d+)"/g)].map(m => m[1]);
  const partIds = [...ms.matchAll(/<part id="(\d+)"/g)].map(m => m[1]);
  check('model_settings parts are keyed by component objectid', comps.length && comps.join() === partIds.join(),
        comps.join() + ' vs ' + partIds.join());
  const ex = [...ms.matchAll(/key="extruder" value="(\d+)"/g)].map(m => +m[1]);
  check('extruders are dense from 1', ex.every(e => e >= 1 && e <= 2) && ex.includes(2), ex.join());
  const proj = JSON.parse(files['Metadata/project_settings.config']);
  check('filament swatches follow extruder order', proj.filament_colour.join() === '#2F6DB5,#FF0000', proj.filament_colour.join());
  const minZ = Math.min(...[...xml.matchAll(/<item objectid="\d+" transform="([^"]+)"/g)].map(m => +m[1].split(' ')[11]));
  check('build items carry a placement transform', isFinite(minZ));
  // Every mesh object in the file must still be a closed solid after the
  // exporter's vertex merge and 4-decimal rounding.
  const objs = [...xml.matchAll(/<object id="(\d+)"[^>]*>\s*<mesh><vertices>([\s\S]*?)<\/vertices><triangles>([\s\S]*?)<\/triangles>/g)];
  let solid = 0;
  for (const o of objs) {
    const v = [...o[2].matchAll(/x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].flatMap(m => [+m[1], +m[2], +m[3]]);
    const t = [...o[3].matchAll(/v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].flatMap(m => [+m[1], +m[2], +m[3]]);
    try {
      const mesh = new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(v), triVerts: new Uint32Array(t) });
      const m = new wasm.Manifold(mesh);
      if (m.status() === 'NoError' && m.volume() > 0) solid++;
      m.delete();
    } catch (e) { /* not manifold */ }
  }
  check('every exported mesh re-imports as a closed solid', objs.length >= 2 && solid === objs.length, solid + '/' + objs.length);
  const stl = CS.exportSTL({ parts: CS.printLayout(model) });
  const sb = new DataView(await stl.arrayBuffer());
  check('STL triangle count matches', sb.getUint32(80, true) === model.stats.tris);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

/* Tiny unzip for stored/deflated entries, enough to read our own output. */
async function unzip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = u8.length - 22;
  while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  const n = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const out = {};
  const { inflateRawSync } = await import('node:zlib');
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
    const nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nlen));
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const body = u8.subarray(start, start + csize);
    out[name] = new TextDecoder().decode(method === 8 ? inflateRawSync(body) : body);
    off += 46 + nlen + xlen + clen;
  }
  return out;
}
