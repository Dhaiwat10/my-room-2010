# Audit

The short version: the Blender file is better than what reaches the browser, and the Blender file itself is a mid-2000s scene. The web viewer is a Quake-3-style lightmapper. Every pixel is albedo times a baked diffuse lightmap, from a camera that never moves, with no post-processing. Everything that makes a modern real-time scene read as real is missing. The two images I sent show it directly: Cycles renders gloss on the laminate, a shine on the lamp shade, a gold clock frame and a chrome fan cage. The browser shows matte paint in every one of those spots.

## What is going wrong, by visual impact

1. **No specular or reflections anywhere.** The bake script only runs DIFFUSE passes. Glossy light, the lamp's hot spot on the desk, bezel sheen and every metal are discarded. Metals come out worst. The clock frame is 85% metallic in Blender and bakes to beige plastic. The fan cage and lamp shade do the same. This is the single biggest reason the room looks flat.
2. **One material model for the whole room.** The fragment shader is colour times light plus emission. No normal map, no roughness, no metalness reach the GPU. The bump detail you authored on walls, fabric and tiles survives only as frozen shading, so it cannot respond to where you look.
3. **A dead camera.** Outside the three tweens, the camera is pinned. No head sway, no mouse parallax, no look-around. A static baked view reads as a photograph with JPEG artefacts rather than a place. The fan blur is the only thing that says "live".
4. **No post pipeline.** The renderer draws straight to the canvas with 4x MSAA. No bloom, so the bulb, LEDs and screen just clip to white. No depth of field when you sit up, no grain, no vignette, no grade beyond plain AgX, no temporal anti-aliasing. These are the cheapest wins in modern three.js and they are all absent.
5. **Texel density and compression.** Shared 4096 atlases give the desk about one texel per millimetre on a surface that fills the screen. Light maps and albedo share one resolution, so soft lighting steals pixels from sharp colour. Everything ships as JPEG at quality 90 with no GPU-compressed mipmapped format. The hi tier is 21 MB and still soft.
6. **Procedural everything.** Of 138 live materials, 87 are flat colours and 41 are noise-based. Only 10 use images, and 6 of those are imported assets. There is no scanned laminate, plastic grain, wall paint, floor tile or fabric. The same Wear node group is pasted onto 25 materials, so the desk, tower, keyboard, monitor and lamp share one mottled fingerprint. This is the problem from your first message, and it is scene-wide.
7. **Boxy geometry.** 69 render objects are boxes of 12 polygons or fewer with no bevel, including the tower shell. Walls and floor are flat planes. Without bevels there is no edge to catch light, which is a large part of why the tower reads as a dark slab. There is almost no clutter and no cables apart from the mouse. The Cycles render shows this ceiling too.
8. **Cheated lighting.** The scene has one visible source, the desk lamp, propped up by five invisible fills. Window, street sodium, gobo and tube light are all disabled. The result is a single warm pool in murk with no cool-versus-warm contrast and a nearly black world. The browser then adds another fake fill light in the shader. The browser output is also visibly darker and muddier than Cycles at the same exposure, so the two are no longer calibrated.
9. **The screen floats.** The CSS iframe monitor is the sharpest thing in the scene, but the panel glass reflects nothing, and its light only tints a pre-baked map.

## What state of the art looks like for this room

- **Hybrid lighting.** Keep the baked GI lightmaps, but switch the surface model to physically based shading with a baked normal and roughness-metalness atlas, plus an HDR environment probe rendered from the seat. That restores every highlight and reflection for a few bake passes and one shader change. Screen-space reflections on the desk and monitor glass are optional on top.
- **A post stack.** Bloom thresholded for the bulb, LEDs and screen, SMAA or TAA, a touch of depth of field when sitting up, grain, vignette and a LUT grade.
- **A living camera.** Two or three degrees of eased mouse parallax and a slow breathing sway.
- **Real materials.** Scanned PBR sets for laminate, paint, tile and plastic, with wear expressed as roughness and dust instead of colour blotches. The desk wear fix I proposed earlier folds into this.
- **Textures that scale.** KTX2 compressed textures via gltf-transform, with 8k albedo for the desk and PC atlases and 4k light maps.
- **Blender passes.** Bevel modifiers everywhere, cables as curves, clutter, a chair, a visible window or tube light for a second light colour, and a re-match of web exposure to Cycles.
- **The radical option.** Since the camera is static most of the time, a WebGPU progressive path tracer could render the room at Cycles quality in the browser, refining while you sit still. It is heavy, and the live screen and fan complicate it, but it is the genuinely state-of-the-art route.

## Where I would start

| order | work | why first |
|---|---|---|
| 1 | PBR shader path with baked normal and ORM atlases plus an environment probe | restores specular and metals, the biggest gap |
| 2 | post-processing stack | cheap, immediate, makes the lamp and LEDs glow |
| 3 | camera parallax and sway | makes it feel like a place |
| 4 | texture overhaul: scans, wear fix, KTX2, 8k albedo | fixes the softness you noticed |
| 5 | geometry, clutter and lighting pass in Blender | raises the ceiling Cycles itself hits |

Items one to three are browser work and keep the Blender look intact. Four and five are art work and take longer. I can also publish this as a shareable page if you want it outside the terminal.
