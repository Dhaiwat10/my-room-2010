# My Room, 2010

My desk from around 2010, in the browser: a baked 3D room (Blender → three.js), a working
Windows XP machine on the monitor, and its sound coming out of the desk speakers.

## Layout

- `room.blend` — the scene. Lighting is authored here.
- `tools/bake.py` — bakes lighting into textures and exports `web/assets/` (headless Blender).
- `web/` — the site: `main.js` (scene, camera, screen glow), `audio.js` (3D speakers, fans).
- `pc/` — the XP machine (React + Vite), built into `web/pc/`.
- `art/` — posters, photos and repainted textures used in the scene.

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
- Windows XP recreation, apps and assets: from personal-site-v2.
