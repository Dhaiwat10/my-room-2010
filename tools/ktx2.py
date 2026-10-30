#!/usr/bin/env python3
"""Encode the baked JPEG atlases as KTX2 (Basis Universal) next to them.

    python3 tools/ktx2.py [web/assets]

GPUs keep KTX2 compressed in memory (about 8x less than a decoded JPEG) and upload it
without decoding, and the files are smaller too. What each map gets:
  - colour, light, screen glow, emission, surface, key lights: ETC1S, which is about a third
    smaller than the JPEGs and holds up well on these (~38-40 dB against them)
  - normals: UASTC at half the size. ETC1S smears the fine bump detail that catches highlights,
    and full-size UASTC is ~7 MB a map; half size keeps them sharp at ~2 MB.
The manifest gets a `<map>Ktx2` entry beside each JPEG one; the browser uses it when it can and
falls back to the JPEGs. Needs `basisu` (brew install basis_universal); called by tools/bake.py.
"""
import json, os, shutil, subprocess, sys, tempfile

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'web/assets')
MAPS = ('albedo', 'light', 'screen', 'emit', 'nrm', 'surf', 'keys')


def encode(src, dst, key, tmp):
    args = ['basisu', '-ktx2', '-mipmap', '-quiet', '-output_file', dst]
    if key == 'nrm':
        half = os.path.join(tmp, os.path.basename(src).replace('.jpg', '.png'))
        w = int(subprocess.run(['sips', '-g', 'pixelWidth', src], capture_output=True, text=True)
                .stdout.split()[-1])
        subprocess.run(['sips', '-s', 'format', 'png', '-Z', str(max(w // 2, 256)), src, '--out', half],
                       check=True, capture_output=True)
        args += ['-uastc', '-quality', '75', '-effort', '4', '-linear', '-normal_map', half]
    else:
        args += ['-etc1s', '-quality', '95', '-effort', '4'] + ([] if key == 'albedo' else ['-linear']) + [src]
    subprocess.run(args, check=True, capture_output=True)


def main():
    if not shutil.which('basisu'):
        print('ktx2: basisu not found, keeping JPEGs only (brew install basis_universal)')
        return
    path = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(path))
    with tempfile.TemporaryDirectory() as tmp:
        for g, entry in manifest['groups'].items():
            for key in MAPS:
                files = entry.get(key)
                if not files:
                    continue
                ktx = {}
                for tag, fn in files.items():
                    out = fn.replace('.jpg', '.ktx2')
                    encode(os.path.join(OUT, fn), os.path.join(OUT, out), key, tmp)
                    ktx[tag] = out
                entry[key + 'Ktx2'] = ktx
                kb = sum(os.path.getsize(os.path.join(OUT, f)) for f in ktx.values()) // 1024
                print(f'ktx2: {g} {key} {kb} KB', flush=True)
    with open(path, 'w') as f:
        json.dump(manifest, f, indent=1)


if __name__ == '__main__':
    main()
