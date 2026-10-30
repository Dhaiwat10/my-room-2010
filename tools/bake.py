"""Bake the room for the web: albedo, lighting and emission atlases plus a glTF.

Run headless so the interactive Blender session stays free:
    Blender -b room.blend --python tools/bake.py -- <out_dir> [samples] [scale]

What it does
- Joins every visible mesh into a handful of objects. Things the web app interacts with
  (monitor, speakers, keyboard, ...) stay separate; the rest is merged per atlas group.
- Gives texture space by importance: surfaces near the seated camera and in front of it get
  far more pixels per metre than the ceiling behind you. The room shell is cut into a grid
  first so the wall right behind the monitor can be sharper than the far end of the same wall.
- Bakes three maps per group with one shared UV layout:
    albedo  - surface colour, no lighting                 (sRGB JPEG)
    light   - diffuse lighting only, denoised, HDR        (sRGB-encoded JPEG + scale)
    emit    - emission, HDR, only for groups that glow    (sRGB-encoded JPEG + scale)
  The browser multiplies albedo x light, adds emit and applies AgX tone mapping, so surface
  detail stays sharp while the lighting can be soft.
"""
import bpy, bmesh, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else 'web/assets')
SAMPLES = int(argv[1]) if len(argv) > 1 else 256
SCALE = float(argv[2]) if len(argv) > 2 else 1.0     # <1 for quick test bakes
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
vl = bpy.context.view_layer

# ---------------------------------------------------------------- render setup
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'METAL'
    prefs.refresh_devices()
    for d in prefs.devices:
        d.use = d.type != 'CPU'
    scene.cycles.device = 'GPU'
    print('bake devices:', [d.name for d in prefs.devices if d.use])
except Exception as e:
    print('GPU unavailable, baking on CPU:', e)
scene.cycles.use_adaptive_sampling = False
scene.render.bake.margin = 12
scene.render.bake.use_clear = True

# ---------------------------------------------------------------- what goes where
SKIP = ('Glass', 'Cam_', 'Monitor_Glow')
WEB_SCREEN = 'VA_Screen'          # replaced by a live canvas/iframe in the browser
ATLAS = {'pc': 4096, 'desk': 4096, 'room': 4096, 'far': 1024, 'art': 2048}
CLUSTERS = {
    'Monitor':   ('VA_',),
    'Speaker_L': ('Speaker_L',),
    'Speaker_R': ('Speaker_R',),
    'Keyboard':  ('Keyboard_Body', 'Keyboard_Keys', 'Keyboard_Legends', 'Keyboard_LED', 'Keyboard_Logo'),
    'Mouse':     ('Mouse_Shell', 'Mouse_Split', 'Mouse_Wheel', 'Mouse_Logo'),
    'Tower':     ('PC_',),
    'Modem':     ('Modem',),
    'Spindle':   ('CD_Spindle',),
    'Art':       ('Art_', 'Clock_'),           # posters and photos on the wall; the web camera frames them
    'Fan_Blades': ('Fan_Blades',),    # spun in the browser, about its own origin
    'Fan_Head':  ('Fan_Head',),       # turned side to side in the browser, about the swivel
}
FAR_PREFIX = ('Bed_', 'Pillow', 'Wardrobe', 'Loft', 'Curtain', 'Plant', 'Swing', 'Ceiling_Fan')
SHELL_PREFIX = ('Wall_', 'Floor', 'Ceiling', 'Balcony_')


def group_of(o):
    cols = {c.name for c in o.users_collection}
    if o.name.startswith(('Art_', 'Clock_')):
        return 'art'          # posters and photos get a sharp texture of their own
    if 'PC' in cols:
        return 'pc'
    if o.name.startswith(FAR_PREFIX):
        return 'far'
    if 'Room' in cols:
        return 'room'
    return 'desk'


CLOCK_HANDS = ('Clock_Hand_Hour', 'Clock_Hand_Minute', 'Clock_Hand_Second')
# pieces the browser moves on their own: clock hands, the speaker's knobs
CLOCK_HANDS += ('Speaker_L_Knob_Power', 'Speaker_L_Knob_Volume')
CLOCK_HANDS += tuple(f'Modem_LED_{i}' for i in range(5)) + ('PC_LED_Power', 'PC_LED_HDD')   # lit and blinked in the browser
CLOCK_HANDS += ('PC_Drive_Tray', 'PC_Drive_Bed', 'PC_Disc')   # the DVD tray slides out in the browser


def cluster_of(o, group):
    if o.name in CLOCK_HANDS:
        return o.name
    for name, prefixes in CLUSTERS.items():
        if o.name.startswith(prefixes) and o.name != WEB_SCREEN:
            return name
    return 'G_' + group


def select(objs, active=None):
    # not the select_all operator: its context check fails on files saved mid-edit
    for o in vl.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    vl.objects.active = active or objs[0]


# the seated camera decides what matters
cam = bpy.data.objects['Cam_Seated']
cam_pos = cam.matrix_world.translation.copy()
cam_fwd = (cam.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()

# ---------------------------------------------------------------- materials: diffuse-only for baking
# no metals (their diffuse pass is black) and no subsurface, so albedo x light reproduces them
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            for k in ('Metallic', 'Subsurface Weight', 'Transmission Weight'):
                s = n.inputs.get(k)
                if s is not None and not s.is_linked:
                    s.default_value = 0.0

# ---------------------------------------------------------------- collect + make real meshes
candidates = [o for o in scene.objects
              if o.type in {'MESH', 'CURVE', 'FONT'} and not o.hide_render
              and not any(s in o.name for s in SKIP)]
for o in candidates:
    o.hide_set(False)
    o.hide_viewport = False
    # architecture doesn't need rounded edges; the bevels at the wall bases leaked light
    if o.name.startswith(SHELL_PREFIX):
        for md in [md for md in o.modifiers if md.type == 'BEVEL']:
            o.modifiers.remove(md)

# window glass is only there for close-up renders; for baking it just blocks sky light
for o in scene.objects:
    if 'Glass' in o.name and o.name != 'CD_Spindle':
        o.hide_render = True

select(candidates)
bpy.ops.object.make_single_user(object=True, obdata=True)
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.convert(target='MESH')
candidates = [o for o in scene.objects if o.select_get()]
screen = bpy.data.objects[WEB_SCREEN]
# the old parent empties hold the names the joined meshes need (Keyboard, Mouse, ...)
for o in [o for o in scene.objects if o.type == 'EMPTY']:
    bpy.data.objects.remove(o)

# ---------------------------------------------------------------- room shell: cull + grid
xs = [v for o in candidates if o.name.startswith(('Floor',)) for v in (o.matrix_world @ Vector(c) for c in o.bound_box)]
IN_MIN = Vector((min(p.x for p in xs) - 0.17, min(p.y for p in xs) - 0.17, 0.0))
IN_MAX = Vector((max(p.x for p in xs) + 0.17, max(p.y for p in xs) + 0.17, 2.8))


def inside(p):
    return all(IN_MIN[i] - 1e-4 <= p[i] <= IN_MAX[i] + 1e-4 for i in range(3))


def cull_and_grid(o, step=0.5):
    """Drop faces nobody can see from inside, then cut what's left into a step-sized grid."""
    me = o.data
    me.transform(o.matrix_world)
    o.matrix_world = Matrix.Identity(4)
    bm = bmesh.new()
    bm.from_mesh(me)
    dead = [f for f in bm.faces if not inside(f.calc_center_median() + f.normal * 0.05)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    if not bm.faces:
        bm.free()
        return False
    for axis in range(3):
        lo = min(v.co[axis] for v in bm.verts); hi = max(v.co[axis] for v in bm.verts)
        k = math.floor(lo / step) + 1
        while k * step < hi - 1e-4:
            no = Vector((0, 0, 0)); no[axis] = 1
            co = Vector((0, 0, 0)); co[axis] = k * step
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
            k += 1
    on_grid = lambda x: abs(x / step - round(x / step)) < 1e-4
    cut = [e for e in bm.edges
           if any(on_grid(e.verts[0].co[a]) and on_grid(e.verts[1].co[a]) for a in range(3))]
    bmesh.ops.split_edges(bm, edges=cut)
    bm.to_mesh(me)
    bm.free()
    return True


shell = [o for o in candidates if o.name.startswith(SHELL_PREFIX)]
for o in shell:
    if not cull_and_grid(o):
        candidates.remove(o)
        bpy.data.objects.remove(o)
shell = [o for o in candidates if o.name.startswith(SHELL_PREFIX)]
select(shell)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')
shell_parts = [o for o in scene.objects if o.select_get()]
candidates = [o for o in candidates if o not in shell] + shell_parts
print('room shell cut into', len(shell_parts), 'tiles')

# ---------------------------------------------------------------- only what the seat can see
# The camera never turns, so anything outside its view (bed, wardrobe, swing, the far walls)
# is left out of the bake and the web scene. It stays in the Blender scene, so it still
# blocks and bounces light while baking.
from bpy_extras.object_utils import world_to_camera_view
MARGIN = 0.3        # browsers show a bit more than Blender's frame on some aspect ratios


def seen(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    ndc = [world_to_camera_view(scene, cam, p) for p in pts]
    if all(v.z <= 0 for v in ndc):
        return False
    inf = [v for v in ndc if v.z > 0]
    xs_ = [v.x for v in inf]; ys_ = [v.y for v in inf]
    if len(inf) < len(ndc):      # straddles the eye plane: keep if it's off to the side in front
        return True
    return max(xs_) > -MARGIN and min(xs_) < 1 + MARGIN and max(ys_) > -MARGIN and min(ys_) < 1 + MARGIN


hidden = [o for o in candidates if o != screen and not seen(o)]
candidates = [o for o in candidates if o not in hidden]
shell_parts = [o for o in shell_parts if o not in hidden]
print(f'left out {len(hidden)} objects the seated camera cannot see')

# ---------------------------------------------------------------- wall art: print and frame apart
# A framed photo's print and its moulding are one mesh; split them by material so the print
# can get far more texture resolution than the frame around it.
for o in [o for o in candidates if o.name.startswith(('Art_', 'Clock_')) and len(o.data.materials) > 1]:
    select([o])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='MATERIAL')
    bpy.ops.object.mode_set(mode='OBJECT')
    candidates += [x for x in scene.objects if x.select_get() and x not in candidates]
art_parts = [o for o in candidates if o.name.startswith(('Art_', 'Clock_')) and o.name not in CLOCK_HANDS]
loose = set(shell_parts) | set(art_parts)      # unwrapped one by one, merged afterwards

# ---------------------------------------------------------------- group + join
clusters = {}
for o in candidates:
    if o == screen:
        continue
    g = group_of(o)
    if o in loose:
        clusters.setdefault((g, 'tile:' + o.name), []).append(o)   # tiles stay apart until after UVs
    else:
        clusters.setdefault((g, cluster_of(o, g)), []).append(o)

groups = {}
for (g, name), objs in clusters.items():
    select(objs)
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = vl.objects.active
    if not name.startswith('tile:'):
        ob.name = ob.data.name = name
    groups.setdefault(g, []).append(ob)


def importance(ob):
    """Relative pixels-per-metre: near and in front of the seat is worth more."""
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(p.x for p in bb), min(p.y for p in bb), min(p.z for p in bb)))
    hi = Vector((max(p.x for p in bb), max(p.y for p in bb), max(p.z for p in bb)))
    nearest = Vector([min(max(cam_pos[i], lo[i]), hi[i]) for i in range(3)])
    d = max((nearest - cam_pos).length, 0.35)
    w = (0.9 / d) ** 1.4
    centre = (lo + hi) / 2
    facing = (centre - cam_pos).normalized().dot(cam_fwd)
    if facing < -0.2:            # behind you: only seen when you turn right round
        w *= 0.35
    if centre.z > 2.3:           # ceiling, top of the loft
        w *= 0.5
    if ob.name.startswith(('Art_', 'Clock_')):
        # printed surfaces (posters, the photo) are what you look at; the frame and tape aren't
        mats = [m.name for m in ob.data.materials if m]
        printed = any(n.startswith(('Art_Poster', 'Art_Photo', 'Clock_Face')) or n.endswith('_artwork') for n in mats)
        return w * (10.0 if printed else 0.4)
    return min(max(w, 0.06), 6.0)


# ---------------------------------------------------------------- UVs per group
for g, objs in groups.items():
    for ob in objs:
        # image textures (posters, photos, scanned models) still read the object's own UVs
        # while baking, so those stay as the render UVs; the new 'Bake' layout is the one the
        # unwrap, pack and bake work on, and the only one exported
        layers = ob.data.uv_layers
        if 'Bake' in layers:
            layers.remove(layers['Bake'])
        render = next((l for l in layers if l.active_render), layers[0] if len(layers) else None)
        bake_uv = layers.new(name='Bake')
        layers.active = bake_uv
        if render is not None:
            render.active_render = True
    select(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()          # same pixels per metre everywhere ...
    bpy.ops.object.mode_set(mode='OBJECT')
    for ob in objs:                              # ... then weight by importance
        w = math.sqrt(importance(ob))            # UV scale is linear, importance is per area
        uv = ob.data.uv_layers['Bake'].data
        co = np.empty(len(uv) * 2, np.float32)
        uv.foreach_get('uv', co)
        uv.foreach_set('uv', co * w)
    size = max(256, int(ATLAS[g] * SCALE))
    select(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='FRACTION', margin=6 / size,
                            shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    # the concave packer occasionally gives up on dense meshes (leaves, keys) and leaves
    # islands outside 0..1; shrink everything back in and pack again with simple boxes
    def uv_max():
        m = 0.0
        for ob in objs:
            uv = ob.data.uv_layers['Bake'].data
            co = np.empty(len(uv) * 2, np.float32); uv.foreach_get('uv', co)
            m = max(m, float(np.abs(co).max()) if len(co) else 0.0)
        return m
    if uv_max() > 1.001:
        k = 1.0 / uv_max()
        for ob in objs:
            uv = ob.data.uv_layers['Bake'].data
            co = np.empty(len(uv) * 2, np.float32); uv.foreach_get('uv', co); uv.foreach_set('uv', co * k)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='FRACTION', margin=6 / size,
                                shape_method='AABB')
        bpy.ops.object.mode_set(mode='OBJECT')
        print(f'{g}: repacked, uv max now {uv_max():.3f}')
    if uv_max() > 1.001:
        # last resort: Blender's lightmap packer always fits (one island per face, even density)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.lightmap_pack(PREF_CONTEXT='ALL_FACES', PREF_PACK_IN_ONE=True,
                                 PREF_BOX_DIV=48, PREF_MARGIN_DIV=0.2)
        bpy.ops.object.mode_set(mode='OBJECT')
        print(f'{g}: lightmap-packed, uv max now {uv_max():.3f}')
    # tiles were only separate for their UVs; merge them back into the group mesh
    merged_name = 'Art' if g == 'art' else 'G_' + g
    tiles = [o for o in objs if o in loose]
    base = next((o for o in objs if o.name == merged_name), None)
    if tiles:
        select(tiles + ([base] if base else []), active=base or tiles[0])
        bpy.ops.object.join()
        merged = vl.objects.active
        merged.name = merged.data.name = merged_name
        groups[g] = [o for o in objs if o not in tiles and o is not base] + [merged]
    print(f'{g:5s}', ', '.join(f'{o.name}:{len(o.data.polygons)}' for o in groups[g]))

# ---------------------------------------------------------------- bake helpers
def bake_into(objs, img, kind, passes, samples):
    for ob in objs:
        if not ob.data.materials:
            ob.data.materials.append(bpy.data.materials.new('Default'))
        for m in ob.data.materials:
            if m is None:
                continue
            m.use_nodes = True
            nt = m.node_tree
            node = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage')
            node.name = 'BAKE_TARGET'
            node.image = img
            nt.nodes.active = node
    scene.cycles.samples = samples
    select(objs)
    bpy.ops.object.bake(type=kind, pass_filter=passes)


def pixels(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def denoise(img):
    """OpenImageDenoise through the compositor; returns the input unchanged if that fails."""
    try:
        ng = bpy.data.node_groups.new('BakeDenoise', 'CompositorNodeTree')
        ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        src = ng.nodes.new('CompositorNodeImage'); src.image = img
        dn = ng.nodes.new('CompositorNodeDenoise')
        out = ng.nodes.new('NodeGroupOutput')
        ng.links.new(src.outputs[0], dn.inputs[0])
        ng.links.new(dn.outputs[0], out.inputs[0])
        prev = (scene.render.engine, scene.render.resolution_x, scene.render.resolution_y,
                scene.render.resolution_percentage, scene.compositing_node_group)
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.render.resolution_x, scene.render.resolution_y = img.size
        scene.render.resolution_percentage = 100
        scene.compositing_node_group = ng
        scene.render.use_compositing = True
        bpy.ops.render.render()
        path = os.path.join(bpy.app.tempdir, 'denoised.exr')
        s = scene.render.image_settings
        s.file_format = 'OPEN_EXR'; s.color_depth = '32'
        bpy.data.images['Render Result'].save_render(path, scene=scene)
        (scene.render.engine, scene.render.resolution_x, scene.render.resolution_y,
         scene.render.resolution_percentage, scene.compositing_node_group) = prev
        res = bpy.data.images.load(path)
        a = pixels(res)
        bpy.data.images.remove(res)
        bpy.data.node_groups.remove(ng)
        print(f'denoised {img.name}')
        return a
    except Exception as e:
        print('denoise skipped:', e)
        return pixels(img)


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def save_jpeg(rgb, path, quality=90):
    """rgb: HxWx3 in 0..1, already display-encoded; written bit-for-bit (no view transform)."""
    h, w, _ = rgb.shape
    im = bpy.data.images.new('out', w, h, float_buffer=True)
    im.colorspace_settings.name = 'Non-Color'
    a = np.ones((h, w, 4), np.float32); a[..., :3] = rgb
    im.pixels.foreach_set(a.ravel())
    im.filepath_raw = path
    im.file_format = 'JPEG'
    s = scene.render.image_settings
    s.file_format = 'JPEG'; s.quality = quality; s.color_management = 'OVERRIDE'
    s.view_settings.view_transform = 'Standard'; s.view_settings.look = 'None'
    s.view_settings.exposure = 0; s.view_settings.gamma = 1
    s.display_settings.display_device = 'sRGB'
    im.save_render(path, scene=scene)
    bpy.data.images.remove(im)


def half(a):
    h, w = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2
    a = a[:h, :w]
    return (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2]) / 4


LOG_K = 256.0   # log encoding strength for HDR maps: more levels for the dark end


def log_encode(x):
    return np.log2(1.0 + LOG_K * np.clip(x, 0, 1)) / np.log2(1.0 + LOG_K)


def write(name, a, hdr):
    """Save hi + lo versions.

    Colour maps are plain sRGB. HDR maps (light, emit) are divided by a scale so 99.8% of
    texels fit, then log-encoded: a dark room keeps hundreds of levels in its shadows instead
    of the handful a gamma curve leaves them. The browser undoes it with the same LOG_K."""
    rgb = a[..., :3]
    scale = 1.0
    if hdr:
        lit = rgb.max(axis=2)
        lit = lit[lit > 1e-5]
        scale = float(np.percentile(lit, 99.8)) if lit.size else 1.0
        scale = max(scale, 1e-3)
    files = {}
    for tag, arr in (('hi', rgb), ('lo', half(rgb))):
        fn = f'{name}_{tag}.jpg'
        enc = log_encode(arr / scale) if hdr else srgb(arr)
        save_jpeg(enc, os.path.join(OUT, fn), quality=94 if hdr else 90)
        files[tag] = fn
    return files, scale


# ---------------------------------------------------------------- light from the monitor, on its own
# The monitor's glow is baked as a separate layer, with every other light off, and left out
# of the main lighting. The browser adds it back scaled by what the screen is showing.
SCREEN_MAT = 'LCD_Screen'


def emission_inputs():
    for m in bpy.data.materials:
        if m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    yield (m.name, n.name), m, n.inputs['Emission Strength']


saved_emission = {key: s.default_value for key, _, s in emission_inputs()}
lights = [o for o in scene.objects if o.type == 'LIGHT' and not o.hide_render]
world_bg = next((n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND'), None) if scene.world else None
world_strength = world_bg.inputs['Strength'].default_value if world_bg else 0.0


def lighting(mode):
    """'room': everything but the monitor. 'screen': only the monitor. 'all': as authored."""
    for key, m, s in emission_inputs():
        orig = saved_emission[key]
        if mode == 'room':
            s.default_value = 0.0 if m.name == SCREEN_MAT else orig
        elif mode == 'screen':
            s.default_value = orig if m.name == SCREEN_MAT else 0.0
        else:
            s.default_value = orig
    for o in lights:
        o.hide_render = mode == 'screen'
    if world_bg:
        world_bg.inputs['Strength'].default_value = 0.0 if mode == 'screen' else world_strength


# ---------------------------------------------------------------- bake every group
manifest = {'groups': {}, 'objects': {}, 'exposure': scene.view_settings.exposure,
            'look': scene.view_settings.look, 'logK': LOG_K}
for g, objs in groups.items():
    size = max(256, int(ATLAS[g] * SCALE))
    entry = {}

    img = bpy.data.images.new(f'{g}_albedo', size, size, float_buffer=True)
    print(f'{g}: albedo {size}px', flush=True)
    bake_into(objs, img, 'DIFFUSE', {'COLOR'}, 8)
    entry['albedo'], _ = write(f'{g}_albedo', pixels(img), hdr=False)

    img = bpy.data.images.new(f'{g}_light', size, size, float_buffer=True)
    print(f'{g}: light {size}px {SAMPLES}spp', flush=True)
    lighting('room')
    bake_into(objs, img, 'DIFFUSE', {'DIRECT', 'INDIRECT'}, SAMPLES)
    entry['light'], entry['lightScale'] = write(f'{g}_light', denoise(img), hdr=True)

    if any(m.name == SCREEN_MAT for m in bpy.data.materials):
        # the monitor's glow is soft, so half the samples will do
        img = bpy.data.images.new(f'{g}_screen', size, size, float_buffer=True)
        print(f'{g}: screen light {size}px {max(SAMPLES // 2, 16)}spp', flush=True)
        lighting('screen')
        bake_into(objs, img, 'DIFFUSE', {'DIRECT', 'INDIRECT'}, max(SAMPLES // 2, 16))
        entry['screen'], entry['screenScale'] = write(f'{g}_screen', denoise(img), hdr=True)

    lighting('all')
    img = bpy.data.images.new(f'{g}_emit', size, size, float_buffer=True)
    bake_into(objs, img, 'EMIT', set(), 4)
    e = pixels(img)
    if e[..., :3].max() > 1e-3:
        entry['emit'], entry['emitScale'] = write(f'{g}_emit', e, hdr=True)

    manifest['groups'][g] = entry
    for ob in objs:
        manifest['objects'][ob.name] = g

# ---------------------------------------------------------------- export
for ob in [o for g in groups.values() for o in g]:
    for l in [l for l in ob.data.uv_layers if l.name != 'Bake']:
        ob.data.uv_layers.remove(l)
export = [o for g in groups.values() for o in g] + [screen, cam]
select(export)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'room.glb'), export_format='GLB',
                          use_selection=True, export_materials='NONE', export_cameras=True,
                          export_apply=True, export_yup=True, export_texcoords=True,
                          export_normals=False)
with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
    json.dump(manifest, f, indent=1)
# the joined, unwrapped scene, for inspecting a bake (kept out of web/, which gets served)
DEBUG_BLEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'build', 'room_baked.blend')
os.makedirs(os.path.dirname(DEBUG_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=DEBUG_BLEND, copy=True)
print('DONE', OUT)
