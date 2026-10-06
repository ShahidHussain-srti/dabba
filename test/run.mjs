/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* run.mjs — geometry and export checks, run with `npm test`.
 *
 * The important ones are physical: base and lid must not overlap when closed,
 * the lid must swing through 180° without hitting the base, every part must be
 * a valid closed solid, and the 3MF must carry its colour assignments. */
import { load, toManifold } from './harness.mjs';

const { CS, wasm } = await load(['util.js', 'texture.js', 'layout.js', 'geometry.js', 'zip.js', 'export.js']);

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
  s3.outer.taper = 3; s3.pocket.taper = 4; s3.outer.edgeStyle = 'chamfer';
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

  const g1 = CS.defaults();
  g1.gridfinity.enabled = true; g1.texture.enabled = true; g1.texture.pattern = 'voronoi'; g1.texture.depth = 0.4;
  out.push(['gridfinity case with stone texture', g1]);

  const s5 = CS.defaults();
  s5.layout = CS.newSection({ w: 80, l: 50, h: 30 });
  s5.seat = 'floor'; s5.split = 0.5; s5.clasp.type = 'none';
  out.push(['single compartment, 50/50, no clasp', s5]);
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
