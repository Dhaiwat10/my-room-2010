"""The four tops, built the way the real ones are: face bolt, clear wheel, metal wheel, track, tip.

Run inside Blender:  exec(open('art/tops/model.py').read())
Builds each top in its own collection, tip at the origin, Z up, real size (metres), then exports
web/assets/tops/<id>.glb. Construction and proportions follow product photos of Metal Fight tops
(see REFERENCES.md); the wheels themselves are original designs, one per class:
  fang   attack    three hooked blades, gunmetal
  shell  defence   six heavy rounded lobes, steel
  gale   stamina   a near-round polished disc with two low wings
  rook   balance   four blocks with notched tops, gunmetal

How a wheel is made: a lathe of its cross-section (the steps and slopes you see from the side)
intersected with an extrusion of its outline (the shape you see from above), minus its windows.
"""
import bpy, bmesh, math, os

TAU = math.pi * 2
SEG = 192


# ------------------------------------------------------------------ helpers
def mat(name, rgb, rough, metal=0.0, alpha=1.0, coat=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Alpha'].default_value = alpha
    try:
        b.inputs['Coat Weight'].default_value = coat
    except KeyError:
        pass
    if alpha < 1:
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            m.blend_method = 'BLEND'
    return m


def lathe(profile, seg=SEG):
    """spin a closed (r, z) polygon round the Z axis into a closed solid"""
    bm = bmesh.new()
    n = len(profile)
    rows = []
    for j in range(seg):
        a = TAU * j / seg
        c, s = math.cos(a), math.sin(a)
        rows.append([bm.verts.new((r * c, r * s, z)) for r, z in profile])
    for j in range(seg):
        A, B = rows[j], rows[(j + 1) % seg]
        for i in range(n):
            k = (i + 1) % n
            bm.faces.new((A[i], A[k], B[k], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def prism(outline, z0, z1):
    """a closed (x, y) outline extruded between two heights"""
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, z0)) for x, y in outline]
    top = [bm.verts.new((x, y, z1)) for x, y in outline]
    n = len(outline)
    bm.faces.new(bot[::-1]); bm.faces.new(top)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def polar(fn, n=720):
    return [(fn(TAU * i / n) * math.cos(TAU * i / n), fn(TAU * i / n) * math.sin(TAU * i / n)) for i in range(n)]


def circle(cx, cy, r, n=40):
    return [(cx + r * math.cos(TAU * i / n), cy + r * math.sin(TAU * i / n)) for i in range(n)]


def arc_slot(r0, r1, a0, a1, n=40):
    """a window shaped like a curved slot with round ends"""
    rm, hw = (r0 + r1) / 2, (r1 - r0) / 2
    pts = [(r1 * math.cos(a0 + (a1 - a0) * i / n), r1 * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
    for a, sgn in ((a1, 1), (a0, -1)):
        cx, cy = rm * math.cos(a), rm * math.sin(a)
        ux, uy, tx, ty = math.cos(a), math.sin(a), -math.sin(a), math.cos(a)
        for i in range(1, 12):
            p = math.pi * i / 12
            if sgn > 0:      # from the outer edge round the end to the inner edge
                pts.append((cx + hw * (ux * math.cos(p) + tx * math.sin(p)), cy + hw * (uy * math.cos(p) + ty * math.sin(p))))
            else:            # from the inner edge round the start back to the outer edge
                pts.append((cx + hw * (-ux * math.cos(p) - tx * math.sin(p)), cy + hw * (-uy * math.cos(p) - ty * math.sin(p))))
        if sgn > 0:
            pts += [(r0 * math.cos(a1 - (a1 - a0) * i / n), r0 * math.sin(a1 - (a1 - a0) * i / n)) for i in range(n + 1)]
    return pts


def to_obj(name, bm, m, coll):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); coll.objects.link(o)
    if m:
        me.materials.append(m)
    return o


def boolean(o, cutter_bm, op, coll):
    c = to_obj(o.name + '_cut', cutter_bm, None, coll)
    md = o.modifiers.new('b', 'BOOLEAN'); md.object = c; md.operation = op; md.solver = 'EXACT'
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    old = o.data; o.data = me; bpy.data.meshes.remove(old)
    cm = c.data; bpy.data.objects.remove(c); bpy.data.meshes.remove(cm)


def finish(o, bevel=0.00028, smooth=32):
    b = o.modifiers.new('edges', 'BEVEL'); b.width = bevel; b.segments = 2
    b.limit_method = 'ANGLE'; b.angle_limit = math.radians(40); b.harden_normals = False
    try:
        b.clamp_overlap = True
    except Exception:
        pass
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear(); old = o.data; o.data = me; bpy.data.meshes.remove(old)
    for p in o.data.polygons:
        p.use_smooth = True
    o.data.set_sharp_from_angle(angle=math.radians(smooth))


def sstep(a, b, x):
    t = min(1, max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ the shared parts
# heights (m): tip 0-5.8 mm, track to 16.6, metal wheel 16.0-24.7, clear wheel 20-26, bolt to 28.6
# the bottom: a small nose (the tip proper) under a wider bell-shaped housing that the track sits in
def tip_profile(nose):
    return [(1e-5, 0)] + nose + [(0.0040, 0.0034), (0.0062, 0.0046), (0.0066, 0.0054), (0.0064, 0.0072), (0.0050, 0.0076), (1e-5, 0.0076)]


TIPS = {
    'sharp': tip_profile([(0.0006, 0.0005), (0.0016, 0.0016), (0.0026, 0.0026)]),
    'flat':  tip_profile([(0.0026, 0.0), (0.0031, 0.0004), (0.0034, 0.0016)]),
    'ball':  tip_profile([(0.0030 * math.sin(t), 0.0030 - 0.0030 * math.cos(t)) for t in [i * math.pi / 2 / 8 for i in range(1, 9)]]),
    'semi':  tip_profile([(0.0014, 0.0), (0.0024, 0.0004), (0.0031, 0.0014)]),
}
TRACK = [(1e-5, 0.0070), (0.0049, 0.0070), (0.0052, 0.0076), (0.0054, 0.0142), (0.0058, 0.0150), (0.0091, 0.0153),
         (0.0096, 0.0158), (0.0094, 0.0166), (0.0064, 0.0168), (1e-5, 0.0168)]


def face_bolt(coll, plastic, metal_dark, sticker):
    # the washer under it, then the hexagon with its sticker inset on top
    to_obj('bolt_washer', lathe([(1e-5, 0.0236), (0.0074, 0.0236), (0.0076, 0.0240), (0.0072, 0.0244), (1e-5, 0.0244)], 64), metal_dark, coll)
    R = 0.0064                                           # 11 mm across the flats
    hexo = [(R * math.cos(TAU * i / 6 + math.pi / 6), R * math.sin(TAU * i / 6 + math.pi / 6)) for i in range(6)]
    h = to_obj('bolt', prism(hexo, 0.0240, 0.0284), plastic, coll)
    # a shallow dish on top for the sticker
    boolean(h, prism([(x * 0.86, y * 0.86) for x, y in hexo], 0.0281, 0.0290), 'DIFFERENCE', coll)
    finish(h, 0.0004, 40)
    bm = bmesh.new()
    r = R * 0.84
    vs = [bm.verts.new((r * math.cos(TAU * i / 6 + math.pi / 6), r * math.sin(TAU * i / 6 + math.pi / 6), 0.02815)) for i in range(6)]
    c = bm.verts.new((0, 0, 0.02815))
    for i in range(6):
        bm.faces.new((c, vs[i], vs[(i + 1) % 6]))
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = (l.vert.co.x / (2 * r) + 0.5, l.vert.co.y / (2 * r) + 0.5)
    to_obj('face_sticker', bm, sticker, coll)


# ------------------------------------------------------------------ the metal wheels
# the cross-section every metal wheel shares, scaled a little per class: a seat inside for the clear
# wheel, a step up, the top rising to a rounded rim, a chamfered underside
def wheel_profile(top=0.0247, rim=0.0244, bottom=0.0160, step=0.0232):
    # underneath it slopes up and out to the contact edge, so from the side it's a wedge, not a can
    return [(0.0066, bottom), (0.0128, bottom), (0.0150, bottom + 0.0008), (0.0238, bottom + 0.0046), (0.0238, rim - 0.0012), (0.0224, rim),
            (0.0192, top), (0.0150, step + 0.0004), (0.0134, step), (0.0127, 0.0214), (0.0124, 0.0201), (0.0066, 0.0201)]


def hub_keys():
    # the two square keys in the bore that lock it onto the track
    pts = []
    for a in (0, math.pi):
        pts.append([(0.0066 * math.cos(a) + dx * math.cos(a) - dy * math.sin(a), 0.0066 * math.sin(a) + dx * math.sin(a) + dy * math.cos(a))
                    for dx, dy in ((-0.0010, -0.0016), (0.0012, -0.0016), (0.0012, 0.0016), (-0.0010, 0.0016))])
    return pts


def fang_outline(a):
    f = (a * 3 / TAU) % 1
    # each blade rises slowly to its tip, then drops sharply: a hook that catches
    if f < 0.78:
        k = (f / 0.78) ** 1.6
    else:
        k = 1 - sstep(0.78, 0.86, f)
    return 0.0186 + 0.0040 * k


def shell_outline(a):
    c = math.cos(a * 6)
    return 0.0209 + 0.0013 * (abs(c) ** 0.45) * (1 if c > 0 else -0.6)


def gale_outline(a):
    return 0.0221 - 0.0004 * (abs(math.sin(a)) ** 8)


def rook_outline(a):
    f = (a * 4 / TAU) % 1
    block = sstep(0.06, 0.10, f) * (1 - sstep(0.58, 0.62, f))
    notch = sstep(0.24, 0.26, f) * (1 - sstep(0.30, 0.32, f)) + sstep(0.38, 0.40, f) * (1 - sstep(0.44, 0.46, f))
    return 0.0180 + 0.0039 * block - 0.0012 * notch * block


WHEELS = {
    'fang':  dict(outline=fang_outline, prof=dict(top=0.0248, rim=0.0242),
                  grooves=lambda: [[(r * math.cos(TAU * k / 3 + a), r * math.sin(TAU * k / 3 + a)) for r, a in
                                    ((0.0193, 1.45), (0.0222, 1.86), (0.0222, 1.92), (0.0193, 1.55))] for k in range(3)],
                  windows=lambda: [arc_slot(0.0146, 0.0172, TAU * k / 3 + 0.35, TAU * k / 3 + 1.25) for k in range(3)]),
    'shell': dict(outline=shell_outline, prof=dict(top=0.0250, rim=0.0248, bottom=0.0158),
                  windows=lambda: [circle(0.0160 * math.cos(TAU * k / 6 + TAU / 12), 0.0160 * math.sin(TAU * k / 6 + TAU / 12), 0.0016) for k in range(6)]),
    'gale':  dict(outline=gale_outline, prof=dict(top=0.0240, rim=0.0236, step=0.0228),
                  windows=lambda: [arc_slot(0.0150, 0.0168, TAU * k / 2 + 0.3, TAU * k / 2 + 2.3) for k in range(2)]),
    'rook':  dict(outline=rook_outline, prof=dict(top=0.0247, rim=0.0245),
                  grooves=lambda: [[(r * math.cos(TAU * k / 4 + a), r * math.sin(TAU * k / 4 + a)) for r, a in
                                    ((0.0194, 0.30), (0.0230, 0.30), (0.0230, 0.34), (0.0194, 0.34))] for k in range(4)],
                  windows=lambda: [[(r * math.cos(TAU * k / 4 + a), r * math.sin(TAU * k / 4 + a)) for r, a in
                                    ((0.0142, 0.62), (0.0174, 0.62), (0.0174, 1.12), (0.0142, 1.12))] for k in range(4)]),
}


def field_cutter(a0, a1, r0, r1, zfun, ztop=0.031, na=96, nr=8):
    """a solid whose underside is the surface z = zfun(r, a) over a sector: cuts sloped facets"""
    bm = bmesh.new()
    A = [a0 + (a1 - a0) * i / na for i in range(na + 1)]
    R = [r0 + (r1 - r0) * j / nr for j in range(nr + 1)]
    bot = [[bm.verts.new((r * math.cos(a), r * math.sin(a), zfun(r, a))) for r in R] for a in A]
    top = [[bm.verts.new((r * math.cos(a), r * math.sin(a), ztop)) for r in R] for a in A]
    for i in range(na):
        for j in range(nr):
            bm.faces.new((bot[i][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j]))
            bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
    for i in range(na):                                       # inner and outer walls
        bm.faces.new((bot[i][0], bot[i + 1][0], top[i + 1][0], top[i][0]))
        bm.faces.new((bot[i][nr], top[i][nr], top[i + 1][nr], bot[i + 1][nr]))
    for j in range(nr):                                       # the two ends
        bm.faces.new((bot[0][j], top[0][j], top[0][j + 1], bot[0][j + 1]))
        bm.faces.new((bot[na][j], bot[na][j + 1], top[na][j + 1], top[na][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def wrap(a):
    return (a + math.pi) % TAU - math.pi


def facets(tid):
    """the sloped faces cut into each metal wheel's top: what makes it look cast and sculpted, not lathed"""
    out = []
    if tid == 'fang':           # a ramp along each blade, falling to its hook
        for k in range(3):
            tip = (k + 0.78) * TAU / 3
            a0 = tip - 1.25
            out.append(field_cutter(a0, tip + 0.03, 0.0150, 0.0245,
                       lambda r, a, a0=a0: 0.0252 - 0.0034 * ((a - a0) / 1.28) ** 1.4 - max(0, r - 0.0205) * 0.25))
    elif tid == 'shell':        # each lobe a low ridge: two faces meeting along its middle
        for k in range(6):
            ac = TAU * k / 6
            out.append(field_cutter(ac - 0.53, ac + 0.53, 0.0175, 0.0245,
                       lambda r, a, ac=ac: 0.0253 - 0.0024 * abs(wrap(a - ac)) / 0.53 - max(0, r - 0.0215) * 0.3))
    elif tid == 'rook':         # the blocks' tops chamfered to their outer edge, like a parapet
        out.append(field_cutter(0, TAU, 0.0195, 0.0245, lambda r, a: 0.0249 - max(0, r - 0.0200) * 0.36, na=180, nr=6))
    return out


def groove(r0, r1, z0=0.0243, z1=0.0262, n=360):
    bm = lathe([(r0, z0), (r1, z0), (r1, z1), (r0, z1)], n)
    return bm


def metal_wheel(tid, coll, metal):
    W = WHEELS[tid]
    o = to_obj('metal_wheel', lathe(wheel_profile(**W['prof'])), metal, coll)
    boolean(o, prism(polar(W['outline']), 0.0150, 0.0260), 'INTERSECT', coll)
    for w in W['windows']():
        boolean(o, prism(w, 0.0150, 0.0260), 'DIFFERENCE', coll)
    for k in hub_keys():
        boolean(o, prism(k, 0.0161, 0.0199), 'UNION', coll)
    # machined detail on the top face: a fine ring groove near the rim, and each class's own cuts
    for f in facets(tid):
        boolean(o, f, 'DIFFERENCE', coll)
    boolean(o, groove(0.0185, 0.0190, 0.0236), 'DIFFERENCE', coll)
    if tid == 'gale':           # a stamina disc: fine machined rings instead of cuts
        for r in (0.0160, 0.0205):
            boolean(o, groove(r, r + 0.00035, 0.0234), 'DIFFERENCE', coll)
    for g in W.get('grooves', lambda: [])():
        boolean(o, prism(g, 0.0236, 0.0262), 'DIFFERENCE', coll)
    # the parting line round the side, where the two halves of the die met
    boolean(o, lathe([(0.0226, 0.0219), (0.0300, 0.0219), (0.0300, 0.0222), (0.0226, 0.0222)], 360), 'DIFFERENCE', coll)
    finish(o, 0.00022, 30)
    return o


# ------------------------------------------------------------------ the clear wheels
def saw(a, n, rise=0.8, sharp=0.06):
    """0..1 per wing: a straight ramp up to the tip, then a sharp drop: a swept, pointed wing"""
    f = (a * n / TAU) % 1
    return f / rise if f < rise else max(0.0, 1 - (f - rise) / sharp)


CLEAR = {
    'fang':  lambda a: 0.0119 + 0.0061 * saw(a, 3, 0.62, 0.05),
    'shell': lambda a: 0.0121 + 0.0036 * min(1, 1.6 * (1 - abs(((a * 6 / TAU) % 1) * 2 - 1))),
    'gale':  lambda a: 0.0118 + 0.0063 * saw(a, 2, 0.84, 0.04) ** 1.3,
    'rook':  lambda a: 0.0120 + 0.0048 * (1 if ((a * 4 / TAU) % 1) < 0.34 else 0) ,
}


def clear_wheel(tid, coll, clear):
    prof = [(0.0070, 0.0201), (0.0121, 0.0201), (0.0122, 0.0229), (0.0136, 0.0233), (0.0180, 0.0251),
            (0.0180, 0.0257), (0.0122, 0.0263), (0.0086, 0.0259), (0.0070, 0.0252)]
    o = to_obj('clear_wheel', lathe(prof), clear, coll)
    boolean(o, prism(polar(CLEAR[tid]), 0.0190, 0.0270), 'INTERSECT', coll)
    # each wing's top slopes down from its leading edge to its tail: faceted, not puffy
    n = {'fang': 3, 'shell': 6, 'gale': 2, 'rook': 4}[tid]
    boolean(o, field_cutter(0, TAU, 0.0125, 0.0190,
            lambda r, a: 0.0261 - 0.0026 * ((a * n / TAU) % 1) - max(0, r - 0.0140) * 0.12, na=360, nr=6), 'DIFFERENCE', coll)
    # the notched ring round the bore
    for k in range(18):
        a = TAU * k / 18
        boolean(o, prism([(r * math.cos(a + d), r * math.sin(a + d)) for r, d in ((0.0066, -0.05), (0.0084, -0.05), (0.0084, 0.05), (0.0066, 0.05))],
                         0.0255, 0.0270), 'DIFFERENCE', coll)
    finish(o, 0.00018, 30)
    return o


# ------------------------------------------------------------------ a whole top
TOPS = {
    'fang':  dict(clear=(0.85, 0.06, 0.04), bolt=(0.75, 0.05, 0.04), metal='gun', tip='flat', tipc=(0.85, 0.08, 0.06), track=(0.05, 0.05, 0.06)),
    'shell': dict(clear=(0.06, 0.62, 0.22), bolt=(0.05, 0.45, 0.18), metal='steel', tip='ball', tipc=(0.92, 0.92, 0.9), track=(0.06, 0.40, 0.18)),
    'gale':  dict(clear=(0.08, 0.32, 0.95), bolt=(0.10, 0.30, 0.85), metal='bright', tip='sharp', tipc=(0.95, 0.95, 0.95), track=(0.55, 0.70, 0.95)),
    'rook':  dict(clear=(0.40, 0.10, 0.85), bolt=(0.32, 0.08, 0.70), metal='gun', tip='semi', tipc=(0.95, 0.75, 0.10), track=(0.10, 0.08, 0.12)),
}
METALS = {'gun': ((0.20, 0.21, 0.23), 0.48), 'steel': ((0.46, 0.47, 0.49), 0.44), 'bright': ((0.52, 0.52, 0.54), 0.38)}   # die-cast: satin, never mirror


def build(tid):
    T = TOPS[tid]
    coll = bpy.data.collections.get('top_' + tid)
    if coll:
        for o in list(coll.objects):
            me = o.data; bpy.data.objects.remove(o)
            if me and me.users == 0:
                bpy.data.meshes.remove(me)
    else:
        coll = bpy.data.collections.new('top_' + tid); bpy.context.scene.collection.children.link(coll)
    mc, mr = METALS[T['metal']]
    metal = mat(f'{tid}_metal', mc, mr, metal=1.0)
    clear = mat(f'{tid}_clear', T['clear'], 0.12, alpha=0.84, coat=0.2)
    bolt = mat(f'{tid}_bolt', T['bolt'], 0.12, alpha=0.88, coat=0.6)
    track = mat(f'{tid}_track', T['track'], 0.18, alpha=0.82)
    tip = mat(f'{tid}_tip', T['tipc'], 0.35)
    dark = mat('bolt_washer_metal', (0.18, 0.18, 0.2), 0.35, metal=1.0)
    sticker = mat('face_sticker', (1, 1, 1), 0.3)
    t = to_obj('tip', lathe(TIPS[T['tip']], 96), tip, coll)
    for j in range(16):                                        # the housing's gear-toothed rim
        a = TAU * j / 16
        boolean(t, prism([(r * math.cos(a + d), r * math.sin(a + d)) for r, d in ((0.0058, -0.07), (0.0070, -0.07), (0.0070, 0.07), (0.0058, 0.07))],
                         0.0050, 0.0080), 'DIFFERENCE', coll)
    finish(t, 0.00015, 40)
    k = to_obj('track', lathe(TRACK, 96), track, coll)
    for z in (0.0080, 0.0118):                                  # moulded rings round the post
        boolean(k, lathe([(0.0050, z), (0.0070, z), (0.0070, z + 0.0005), (0.0050, z + 0.0005)], 96), 'DIFFERENCE', coll)
    for j in range(4):                                          # and four small ribs under the flange
        a = TAU * j / 4 + 0.4
        boolean(k, prism([(r * math.cos(a + d), r * math.sin(a + d)) for r, d in ((0.0050, -0.09), (0.0084, -0.09), (0.0084, 0.09), (0.0050, 0.09))],
                         0.0128, 0.0152), 'UNION', coll)
    finish(k, 0.0002, 40)
    metal_wheel(tid, coll, metal)
    clear_wheel(tid, coll, clear)
    face_bolt(coll, bolt, dark, sticker)
    # give each its own object names so the four can sit side by side in one file
    for o in coll.objects:
        o.name = f'{tid}_{o.name.split(".")[0]}'
    return coll


def export(tid, repo):
    coll = bpy.data.collections['top_' + tid]
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.objects:
        o.hide_set(False); o.select_set(True)
    os.makedirs(os.path.join(repo, 'web/assets/tops'), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(repo, f'web/assets/tops/{tid}.glb'), export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_meshopt_compression_enable=True,
                              export_image_format='JPEG', export_jpeg_quality=88)


# ------------------------------------------------------------------ baked surface: the part that makes it look real
# Each part gets UVs and two baked maps (Cycles, on the CPU):
#   colour     its base colour, darkened by ambient occlusion in the windows, grooves and under the
#              clear wheel, and lifted a little on edges, where handling polishes it
#   roughness  (metal only) satin with a fine cast grain, polished edges, duller in the recesses
def _uv(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.006)
    bpy.ops.object.mode_set(mode='OBJECT')


def _bake(o, size, net, name, colour=True):
    """bake the emission network `net(nodes, links) -> socket` on o into a new image"""
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    m = bpy.data.materials.new(name + '_bake'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(net(nt.nodes, nt.links), em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs['Surface'])
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.nodes.active = tex
    keep = list(o.data.materials); o.data.materials.clear(); o.data.materials.append(m)
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='EMIT', margin=4)
    o.data.materials.clear()
    for k in keep:
        o.data.materials.append(k)
    bpy.data.materials.remove(m)
    img.pack()
    return img


def _ao(nodes, dist=0.0035):
    a = nodes.new('ShaderNodeAmbientOcclusion'); a.inputs['Distance'].default_value = dist; a.samples = 24
    return a.outputs['AO']


def _edge(nodes, links, radius=0.00035):
    """1 on rounded edges, 0 on flats: where the bevelled normal parts from the true one"""
    bv = nodes.new('ShaderNodeBevel'); bv.inputs['Radius'].default_value = radius; bv.samples = 8
    geo = nodes.new('ShaderNodeNewGeometry')
    dot = nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    links.new(bv.outputs[0], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    mr = nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.995; mr.inputs['From Max'].default_value = 0.94
    links.new(dot.outputs['Value'], mr.inputs['Value'])
    return mr.outputs['Result']


def _math(nodes, links, op, a, b):
    n = nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = False
    n.inputs[2].default_value = 0.0          # MULTIPLY_ADD's addend: zero unless we chain an ADD ourselves
    for i, v in enumerate((a, b)):
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            links.new(v, n.inputs[i])
    return n.outputs[0]


def _grain(nodes, links, scale=9000):
    tc = nodes.new('ShaderNodeTexCoord')
    nz = nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 6
    links.new(tc.outputs['Object'], nz.inputs['Vector'])
    return nz.outputs['Fac']


def bake_top(tid, size_metal=1024, size_part=512):
    sc = bpy.context.scene
    try:
        sc.render.engine = 'CYCLES'
    except TypeError:
        pass
    sc.cycles.device = 'CPU'; sc.cycles.samples = 24
    sc.render.bake.use_selected_to_active = False
    T = TOPS[tid]
    coll = bpy.data.collections['top_' + tid]
    for o in coll.objects:
        if o.name.endswith(('face_sticker', 'bolt_washer')):
            continue
        _uv(o)
        base = o.data.materials[0]
        bsdf = next(n for n in base.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        rgb = tuple(bsdf.inputs['Base Color'].default_value)[:3]
        metal = bsdf.inputs['Metallic'].default_value > 0.5
        r0 = bsdf.inputs['Roughness'].default_value
        size = size_metal if metal else size_part

        def colour(nodes, links, rgb=rgb, metal=metal):
            ao = _ao(nodes); edge = _edge(nodes, links)
            shade = _math(nodes, links, 'MULTIPLY_ADD', ao, 0.75 if metal else 0.5)
            shade = _math(nodes, links, 'ADD', shade, 0.25 if metal else 0.5)
            lift = _math(nodes, links, 'MULTIPLY_ADD', edge, 0.35 if metal else 0.1)
            lift = _math(nodes, links, 'ADD', lift, 1.0)
            k = _math(nodes, links, 'MULTIPLY', shade, lift)
            c = nodes.new('ShaderNodeRGB'); c.outputs[0].default_value = (*rgb, 1)
            mul = nodes.new('ShaderNodeVectorMath'); mul.operation = 'SCALE'
            links.new(c.outputs[0], mul.inputs[0]); links.new(k, mul.inputs['Scale'])
            return mul.outputs[0]
        cimg = _bake(o, size, colour, f'{o.name}_col')

        rimg = None
        if metal:
            def rough(nodes, links, r0=r0):
                ao = _ao(nodes); edge = _edge(nodes, links); g = _grain(nodes, links)
                r = _math(nodes, links, 'MULTIPLY_ADD', g, 0.16)          # grain
                r = _math(nodes, links, 'ADD', r, r0 - 0.08)
                r = _math(nodes, links, 'SUBTRACT', r, _math(nodes, links, 'MULTIPLY', edge, 0.16))   # polished edges
                r = _math(nodes, links, 'ADD', r, _math(nodes, links, 'MULTIPLY', _math(nodes, links, 'SUBTRACT', 1.0, ao), 0.2))
                return r
            rimg = _bake(o, size, rough, f'{o.name}_rough', colour=False)

        # the final material: the baked maps on the principled shader
        nt = base.node_tree
        for n in [n for n in nt.nodes if n.type == 'TEX_IMAGE']:
            nt.nodes.remove(n)
        tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = cimg
        nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
        if rimg:
            tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = rimg
            nt.links.new(tr.outputs['Color'], bsdf.inputs['Roughness'])
