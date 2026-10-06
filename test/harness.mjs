/* Dabba — case studio. Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* harness.mjs — load the browser modules into node for testing.
 * They are classic scripts that hang everything off window.CS, so a window
 * shim plus vm is enough. Decoration needs a canvas and is skipped here. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import Module from 'manifold-3d';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function load(files) {
  globalThis.window = globalThis;
  for (const f of files) vm.runInThisContext(readFileSync(join(root, 'src', f), 'utf8'), { filename: f });
  const wasm = await Module();
  wasm.setup();
  globalThis.CS.setManifold(wasm);
  return { CS: globalThis.CS, wasm };
}

/* Part → Manifold, for boolean checks on what the app produced. */
export function toManifold(wasm, part, pose) {
  const p = pose ? globalThis.CS.posed(part, pose).positions : part.positions;
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(p), triVerts: new Uint32Array(part.indices) });
  mesh.merge();
  return new wasm.Manifold(mesh);
}
