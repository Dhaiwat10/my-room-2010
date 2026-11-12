#!/usr/bin/env bun
// Print the <link rel="modulepreload"> tags for web/index.html: every module the room imports,
// local and from the CDN, followed through the import map in index.html.
//
//     bun tools/preloads.mjs
//
// Without them the browser only finds each module once the one importing it has arrived, which
// was four round trips deep before the room could even ask for its assets. Rerun it and paste the
// output over the list in index.html after adding or removing an import.
import fs from 'node:fs';
import path from 'node:path';

const WEB = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'web');
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const { imports } = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
const resolve = (spec, from) => {
  if (imports[spec]) return imports[spec];
  const prefix = Object.keys(imports).find((k) => k.endsWith('/') && spec.startsWith(k));
  if (prefix) return imports[prefix] + spec.slice(prefix.length);
  return new URL(spec, from).href;
};
const IMPORT = /(?:^|[\s;}])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]/gm;
const LOCAL = 'http://local/';
const seen = new Map();   // url -> how deep it was first found
async function visit(url, depth) {
  if (seen.has(url) && seen.get(url) <= depth) return;
  seen.set(url, depth);
  const text = url.startsWith(LOCAL)
    ? fs.readFileSync(path.join(WEB, url.slice(LOCAL.length)), 'utf8')
    : await (await fetch(url)).text();
  const deps = [...text.matchAll(IMPORT)].map((m) => m[1] || m[2]);
  await Promise.all(deps.map((d) => visit(resolve(d, url), depth + 1)));
}
await visit(LOCAL + 'main.js', 0);
for (const [url] of [...seen].sort((a, b) => a[1] - b[1])) {
  console.log(`<link rel="modulepreload" href="${url.startsWith(LOCAL) ? url.slice(LOCAL.length) : url}">`);
}
