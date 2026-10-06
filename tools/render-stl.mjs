#!/usr/bin/env node
/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* render-stl.mjs — look at an exported STL without a slicer or 3D viewer.
 *
 *   node tools/render-stl.mjs case.stl out.png [azimuth] [elevation] [zoom] [panX] [panY]
 *
 * A tiny software rasteriser with plain per-triangle shading: it shows the
 * facets exactly as exported, with none of the smoothing the app's 3D view
 * applies, and shares no code with the app. Angles in degrees. */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const [, , file, out, azDeg = '-35', elDeg = '25', zoom = '1', cx = '0', cz = '0'] = process.argv;
const buf = readFileSync(file);
const n = buf.readUInt32LE(80);
const tris = new Float32Array(n * 9);
for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) tris[i * 9 + k] = buf.readFloatLE(84 + i * 50 + 12 + k * 4);

let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
for (let i = 0; i < tris.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], tris[i + k]); max[k] = Math.max(max[k], tris[i + k]); }
const ctr = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];

const W = 1400, H = 900;
const az = +azDeg * Math.PI / 180, el = +elDeg * Math.PI / 180;
// camera basis: right, up, forward (orthographic)
const fwd = [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), -Math.sin(el)];
const right = [Math.cos(az), -Math.sin(az), 0];
const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
const scale = W / span * 0.8 * +zoom;
const proj = (x, y, z) => {
  const d = [x - ctr[0], y - ctr[1], z - ctr[2]];
  return [W / 2 + (d[0] * right[0] + d[1] * right[1] + d[2] * right[2] - +cx) * scale,
          H / 2 - (d[0] * up[0] + d[1] * up[1] + d[2] * up[2] - +cz) * scale,
          d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]];
};
const zbuf = new Float32Array(W * H).fill(1e9), img = new Uint8Array(W * H * 3).fill(18);
const L = [0.35, -0.75, 0.55]; const ll = Math.hypot(...L); L.forEach((v, i) => L[i] = v / ll);

for (let t = 0; t < n; t++) {
  const o = t * 9;
  const ax = tris[o], ay = tris[o + 1], az_ = tris[o + 2], bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5], cx2 = tris[o + 6], cy = tris[o + 7], cz2 = tris[o + 8];
  let nx = (by - ay) * (cz2 - az_) - (bz - az_) * (cy - ay), ny = (bz - az_) * (cx2 - ax) - (bx - ax) * (cz2 - az_), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx2 - ax);
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  if (nx * fwd[0] + ny * fwd[1] + nz * fwd[2] > 0) continue;            // back face
  const shade = Math.round(255 * Math.min(1, 0.18 + 0.82 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2])));
  const A = proj(ax, ay, az_), B = proj(bx, by, bz), C = proj(cx2, cy, cz2);
  const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
  const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
  const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
  if (Math.abs(den) < 1e-12) continue;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const w0 = ((B[1] - C[1]) * (px - C[0]) + (C[0] - B[0]) * (py - C[1])) / den;
    const w1 = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (py - C[1])) / den;
    const w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    const z = w0 * A[2] + w1 * B[2] + w2 * C[2], i = y * W + x;
    if (z < zbuf[i]) { zbuf[i] = z; img[i * 3] = shade; img[i * 3 + 1] = shade; img[i * 3 + 2] = Math.min(255, shade + 10); }
  }
}

// PNG
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
const crcT = new Int32Array(256).map((_, n2) => { let c = n2; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('rendered', n, 'triangles →', out);
