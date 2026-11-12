# My Room, 2010

My desk from around 2010, rebuilt in the browser. **Live at [home.dhaiwat.com](https://home.dhaiwat.com).**

- **A baked 3D room.** Modelled and lit in Blender, light baked into textures and drawn with three.js, with specular, reflections, bloom and a head that follows the mouse (or a phone's tilt).
- **A working Windows XP machine on the monitor.** Winamp, Paint, VLC, Firefox, Movie Maker, Nero, uTorrent and Cricket 07, built in React. Its sound comes out of the two desk speakers in 3D.
- **Things you can touch.** The pedestal fan's speed keys, the speaker knobs, the CD drive (put a game disc in), and a spinning-top battle in the stadium under the desk, with real rigid-body physics.

## Layout

| Path | What's there |
| --- | --- |
| `room.blend` | The scene. Lighting is authored here. |
| `tools/bake.py` | Bakes light, normals, roughness/metalness, each key light and a reflection probe into atlases, and exports `web/assets/`. Runs in headless Blender. |
| `tools/ktx2.py` | Encodes the atlases as GPU-compressed KTX2. Run by the bake; needs `basis_universal`. |
| `tools/pack.mjs` | Meshopt-compresses `room.glb` and simplifies the stadium in it. Run by the bake; needs `bun install` in `tools/`. |
| `tools/preloads.mjs` | Prints the module preload list in `web/index.html`. Rerun it after changing an import. |
| `web/` | The site: `main.js` (room, camera, post), `audio.js` (3D speakers, fans), `bey.js` (the top battle), `inspect.js` (close-ups). |
| `pc/` | The XP machine (React + Vite), built into `web/pc/`. |
| `art/` | Posters, photos and textures used in the scene, and the models and scripts for the stadium, tops and launcher. |

## Running it

```bash
cd pc && bun install && bun run build   # build the XP machine into web/pc
python3 tools/serve.py                  # serve web/ locally (and on the LAN)
```

Rebake the room (quick: 96 samples at half size; full: 512):

```bash
cd tools && bun install && cd ..                # once: the model packer's dependencies
/Applications/Blender.app/Contents/MacOS/Blender -b room.blend --python tools/bake.py -- web/assets 512
```

Pushes to `main` deploy to Cloudflare Workers through Workers Builds; other branches get preview builds. `npx wrangler deploy` deploys by hand, building the XP machine first.

### Flags

Add these to the URL for look-dev and debugging:

- `?post=0` turns post-processing off; `?bloom=`, `?threshold=`, `?grain=`, `?vignette=`, `?dof=`, `?msaa=` tune it.
- `?spec=0` turns specular off; `?spec=only|env|keys|screen`, `?specgain=`, `?envgain=` isolate or scale it.
- `?ktx=0` uses the JPEG atlases instead of KTX2. `?head=0` holds the head still.
- `?bey` opens the top battle straight away; `?lite` forces its phone build.
- In the console, `__bench()` and `__bey.bench()` time frames.

## Credits

- Pedestal fan: "Electric Fan" by Lillya on Sketchfab, CC BY 4.0 (rebranded texture).
- Picture-frame wood: "Hanging Picture Frame 03" by James Ray Cock, Poly Haven, CC0.
- Desk laminate: "Rosewood Veneer 02" by Jenelle van Heerden, Poly Haven, CC0.
- Windows XP recreation, apps and assets: from personal-site-v2.
- XP styling: [XP.css](https://github.com/botoxparty/XP.css) (MIT); Paint: [JS Paint](https://github.com/1j01/jspaint) (MIT).
- DVD drive sounds (Freesound, CC0): "compCDandDVD_OpenClose.wav" (146958) and "Disc drive reading" (556490).
- Spinning-top sounds: Freesound, CC0, listed in [`web/assets/sfx/bey/CREDITS.md`](web/assets/sfx/bey/CREDITS.md).

## License

The code is [MIT](LICENSE). The music, photos, posters, game art and Windows XP sounds and imagery belong to their owners and aren't covered by it.
