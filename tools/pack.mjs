#!/usr/bin/env bun
// Shrink the baked room model for the web, in place:
//
//     bun tools/pack.mjs [web/assets/room.glb]
//
// 1. The stadium under the desk is simplified to about a quarter of its triangles. It's small on
//    screen from the seat, and the battle loads its own full model (assets/stadium/). The
//    simplifier keeps UV seams where they are, so the baked atlases still line up.
// 2. Everything is meshopt-compressed (EXT_meshopt_compression, as the tops and the stadium are).
//    Positions and UVs stay plain floats in their own space (-vpf/-vtf), at high precision: the
//    room's shader samples the atlases by raw UV and main.js reads some meshes' local positions,
//    so the integer quantization gltfpack does by default (which moves the offset and scale onto
//    the node or a material's texture transform) would break both. Named nodes are kept (-kn).
//
// Run by tools/bake.py after the export; needs `bun install` in tools/ (skipped without).
import { NodeIO } from '@gltf-transform/core';
import { simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const file = path.resolve(process.argv[2] || 'web/assets/room.glb');
const SIMPLIFY = { Stadium: { ratio: 0.25, error: 0.0008 } };   // by node name

// already done? (read from the GLB's JSON chunk: gltf-transform can't open a packed file without
// the meshopt decoder, and packing twice would simplify the stadium twice)
const glb = fs.readFileSync(file);
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
if (json.extensionsUsed?.includes('EXT_meshopt_compression')) {
  console.log(`pack: ${path.basename(file)} is already packed`);
  process.exit(0);
}
const io = new NodeIO();
const doc = await io.readBinary(new Uint8Array(glb.buffer, glb.byteOffset, glb.byteLength));
await MeshoptSimplifier.ready;
const tris = (p) => (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
for (const node of doc.getRoot().listNodes()) {
  const opts = SIMPLIFY[node.getName()], mesh = node.getMesh();
  if (!opts || !mesh) continue;
  for (const prim of mesh.listPrimitives()) {
    const before = tris(prim);
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ...opts, lockBorder: false });
    console.log(`pack: ${node.getName()} ${before} -> ${tris(prim)} triangles`);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-'));
const mid = path.join(tmp, 'in.glb'), out = path.join(tmp, 'out.glb');
await io.write(mid, doc);
const bin = path.join(path.dirname(new URL(import.meta.url).pathname), 'node_modules', '.bin', 'gltfpack');
execFileSync(bin, ['-i', mid, '-o', out, '-cc', '-kn', '-kv', '-vpf', '-vp', '16', '-vtf', '-vt', '16'], { stdio: 'inherit' });
const kb = (f) => Math.round(fs.statSync(f).size / 1024);
console.log(`pack: ${path.basename(file)} ${kb(file)} KB -> ${kb(out)} KB`);
fs.copyFileSync(out, file);
fs.rmSync(tmp, { recursive: true });
