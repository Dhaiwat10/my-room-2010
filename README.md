# My Room, 2010

My desk from around 2010, in the browser: a baked 3D room (Blender → three.js), a working
Windows XP machine on the monitor, and its sound coming out of the desk speakers.

## Layout

- `room.blend` — the scene. Lighting is authored here.
- `tools/bake.py` — bakes lighting into textures and exports `web/assets/` (headless Blender).
  Besides the diffuse light it bakes normals, roughness/metalness, each key light on its own and a
  reflection probe, so the browser can add highlights and reflections.
- `tools/ktx2.py` — encodes every atlas as GPU-compressed KTX2, which the browser prefers over
  the JPEGs (`?ktx=0` forces JPEG). Run by the bake; needs `brew install basis_universal`.
- `web/` — the site: `main.js` (scene, camera, screen glow, specular), `audio.js` (3D speakers, fans).
  Look-dev flags: `?spec=0` (no specular), `?spec=only|env|keys|screen`, `?specgain=`, `?envgain=`.
  Post-processing (bloom, focus when leaning in, AgX, vignette, grain): `?post=0` turns it off;
  `?bloom=`, `?threshold=`, `?grain=`, `?vignette=`, `?dof=`, `?msaa=` tune it. `__bench()` in the console
  gives ms per frame. At the seat the head follows the mouse (or a phone's tilt) and breathes;
  `?head=0` holds it still, as does the system's reduced-motion setting.
- `pc/` — the XP machine (React + Vite), built into `web/pc/`.
- `art/` — posters, photos and repainted textures used in the scene, and scanned materials
  (`art/textures/`).

## Commands

```bash
# bake (quick: 96 samples at half size; full: 512)
/Applications/Blender.app/Contents/MacOS/Blender -b room.blend --python tools/bake.py -- web/assets 512

# build the XP machine
cd pc && bun install && bun run build

# serve locally (and on the LAN)
python3 tools/serve.py

# deploy to Cloudflare
npx wrangler@4.150.0 deploy
```

## Credits

- Pedestal fan: "Electric Fan" by Lillya on Sketchfab, CC BY 4.0 (rebranded texture).
- Picture-frame wood: "Hanging Picture Frame 03" by James Ray Cock, Poly Haven, CC0.
- Desk laminate: "Rosewood Veneer 02" by Jenelle van Heerden, Poly Haven, CC0.
- Windows XP recreation, apps and assets: from personal-site-v2.
- DVD drive sounds (Freesound, CC0): "compCDandDVD_OpenClose.wav" (sound 146958) for the tray opening and closing, "Disc drive reading" (sound 556490) for the spin-up.
