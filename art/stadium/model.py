"""The Super Vortex stadium's body: one moulded red plastic shell, scaled down to sit on the desk.

Run inside Blender:  exec(open('art/stadium/model.py').read())
Rebuilds the object 'Stadium_Body' (keeping its material) from a cross-section spun round the
axis, then shapes the details into it:
- three ramps on the inner wall: above a line falling from the rim, the wall stands proud
- three rounded rails climbing the outside from the flange to the rim
- a notch in the rim where each rail arrives and its ramp leaves
UV maps: 'Top' is a plan view (272 mm across), 'Cyl' is unrolled around (u = angle, v = height / 70 mm).
Sizes are in mm below; the object is in metres. Full size the real one is about 38 cm across;
this one is 27 cm, which is what fits on the front corner of the desk.
"""
import bpy, bmesh, math
import numpy as np

SEGMENTS = 256                          # light enough for the web (about 45k vertices)
RAMP0 = np.radians([20, 140, 260])     # where each ramp leaves the rim (textures.py uses the same)
SPAN = np.radians(72)                  # how far round each ramp runs as it falls 31 mm
RAIL = 3.4                             # half-width of the outer rails


def catmull(pts, per=8):
    """centripetal Catmull-Rom through pts, `per` samples per span"""
    P = [np.array(p, float) for p in pts]
    P = [P[0]] + P + [P[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        tj = lambda ti, a, b: ti + max(np.linalg.norm(b - a), 1e-6) ** 0.5
        t0 = 0; t1 = tj(t0, p0, p1); t2 = tj(t1, p1, p2); t3 = tj(t2, p2, p3)
        for k in range(per):
            t = t1 + (t2 - t1) * k / per
            A1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1 if t1 != t0 else p1
            A2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            A3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3 if t3 != t2 else p2
            B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2
            B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3
            out.append((t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2)
    out.append(P[-2])
    return np.array(out)


def resample(c, step):
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))]
    n = max(2, int(round(d[-1] / step)) + 1)
    s = np.linspace(0, d[-1], n)
    return np.c_[np.interp(s, d, c[:, 0]), np.interp(s, d, c[:, 1])]


def offset(c, d):
    t = np.gradient(c, axis=0); t /= np.linalg.norm(t, axis=1)[:, None]
    return c + np.c_[t[:, 1], -t[:, 0]] * d      # to the right of travel: under the surface


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ the cross-section (r, z in mm)
# the top surface, from the centre out: a flat centre disc, half the floor across, ringed by a fine groove, the dish
# curving up into a steep inner wall
centre = np.array([(0, 10.0), (12, 10.0), (24, 10.0), (36, 10.0), (48.6, 10.0)])
groove = catmull([(48.6, 10.0), (49.6, 9.88), (50.2, 9.82), (50.8, 9.9), (51.8, 10.3)], 4)
floor = catmull([(51.8, 10.3), (62, 12.6), (74, 17.4), (86, 25.2), (96, 33.2), (101.5, 40.0),
                 (105, 47.5), (107, 54.5), (108.2, 60.2)], 12)
# the rolled rim, the outer wall flaring down to the flange, the flange's rounded edge
outside = catmull([(108.2, 60.2), (108.9, 61.7), (110.6, 62.5), (112.6, 62.4), (114.0, 61.3), (114.6, 59.0),
                   (115.4, 45), (116.8, 25), (118.2, 13), (119.3, 9.6), (120.8, 8.1), (123.5, 7.5), (130.5, 6.3),
                   (133.4, 5.7), (134.8, 4.6), (135.2, 3.0), (134.9, 1.2), (134.0, 0.25), (132.6, 0.0)], 10)
foot = np.array([(132.6, 0.0), (128.0, 0.0), (126.4, 0.0)])
# underneath it's a 2 mm shell, open at the bottom: up inside the outer wall to the rim, then
# back down under the dish to the axis
under = catmull([(126.4, 0.0), (125.6, 0.6), (125.2, 2.0), (122.0, 2.6), (118.4, 4.5), (117.2, 10), (115.4, 25),
                 (114.0, 45), (113.0, 57.5), (112.0, 60.0), (110.6, 60.4), (109.8, 59.6)], 8)
back = offset(np.vstack([centre[:-1], groove[:-1], floor]), 2.2)[::-1]
back = back[back[:, 1] < 59.0]
parts = [('centre', np.vstack([np.c_[np.linspace(0, 46, 8), np.full(8, 10.0)], resample(np.vstack([[(48.6, 10.0)], groove[:-1]]), 0.6)])),
         ('floor', resample(floor, 1.6)), ('outside', resample(outside, 1.2)), ('foot', resample(foot, 3.0)),
         ('under', resample(under, 3.5)), ('back', resample(np.vstack([back, [(0.0, back[-1][1])]]), 5.0))]
prof, tags = [], []
for name, c in parts:
    for p in c:
        if prof and np.linalg.norm(np.array(prof[-1]) - p) < 0.05:
            continue
        prof.append(tuple(p)); tags.append(name)
prof = np.array(prof)

# ------------------------------------------------------------------ spun into a mesh
mid, mtags = prof[1:-1], tags[1:-1]
M = len(mid)
ang = 2 * np.pi * np.arange(SEGMENTS) / SEGMENTS
R_, Z_ = mid[:, 0][None, :], mid[:, 1][None, :]
X = R_ * np.cos(ang)[:, None]; Y = R_ * np.sin(ang)[:, None]; Z = np.broadcast_to(Z_, X.shape)
co = np.stack([X, Y, Z], -1).reshape(-1, 3)
tag = np.tile(np.array(mtags), SEGMENTS)

# ------------------------------------------------------------------ the details
r = np.hypot(co[:, 0], co[:, 1]); z = co[:, 2]; th = np.arctan2(co[:, 1], co[:, 0]) % (2 * np.pi)
inner = (tag == 'floor') & (z > 26)
outer = (tag == 'outside') & (z > 8.5) & (r > 114.4) & (r < 120.5)
rim = ((tag == 'outside') | (tag == 'floor') | (tag == 'under')) & (z > 58.5)
dr = np.zeros(len(co)); dz = np.zeros(len(co))
for a0 in RAMP0:
    # the ramp: above a line falling from the rim, the wall stands 2.6 mm proud
    phi = (th - a0) % (2 * np.pi)
    zh = 61.0 - 31.0 * np.clip(phi / SPAN, 0, 1)
    # (it starts just past the rim notch, and keeps below the rolled rim so the lip stays round)
    fade = sstep(np.radians(7), np.radians(13), phi) * (1 - sstep(SPAN - np.radians(4), SPAN + np.radians(8), phi))
    dr -= np.where(inner, 2.6 * sstep(zh - 1.5, zh + 1.5, z) * fade * (1 - sstep(56.5, 59.5, z)), 0)
    # the rail: a rounded strip climbing 30 degrees round the outside, flange to rim notch
    a1 = a0 - np.radians(30)
    phi2 = (th - a1 + np.pi) % (2 * np.pi) - np.pi
    frac = np.clip((z - 9.0) / 51.5, 0, 1)
    across = np.abs(phi2 - np.radians(30) * frac) * 117.0 * math.cos(math.atan2(51.5, 117 * np.radians(30)))
    shape = np.clip(1 - (across / RAIL) ** 2, 0, 1) ** 0.6
    ends = sstep(8.5, 13, z) * (1 - sstep(55.0, 58.5, z))
    dr += np.where(outer, 1.3 * shape * ends, 0)
    # the rim dips where the rail arrives and the ramp leaves
    w = np.abs((th - a0 + np.pi) % (2 * np.pi) - np.pi)
    dz -= np.where(rim, 2.4 * (1 - sstep(np.radians(2.5), np.radians(9), w)) * sstep(58.5, 61.0, z), 0)
s = (r + dr) / np.maximum(r, 1e-6)
co[:, 0] *= s; co[:, 1] *= s; co[:, 2] += dz

# ------------------------------------------------------------------ build it
bm = bmesh.new()
verts = [bm.verts.new(p * 1e-3) for p in co]
top = bm.verts.new((0, 0, prof[0][1] * 1e-3)); bot = bm.verts.new((0, 0, prof[-1][1] * 1e-3))
g = lambda j, i: verts[(j % SEGMENTS) * M + i]
for j in range(SEGMENTS):
    for i in range(M - 1):
        bm.faces.new((g(j, i), g(j, i + 1), g(j + 1, i + 1), g(j + 1, i)))
    bm.faces.new((top, g(j, 0), g(j + 1, 0)))
    bm.faces.new((bot, g(j + 1, M - 1), g(j, M - 1)))
uv_top = bm.loops.layers.uv.new('Top'); uv_cyl = bm.loops.layers.uv.new('Cyl')
for f in bm.faces:
    f.smooth = True
    us = []
    for l in f.loops:
        x, y, zz = l.vert.co
        l[uv_top].uv = (x / 0.272 + 0.5, y / 0.272 + 0.5)
        us.append((math.atan2(y, x) / (2 * math.pi)) % 1.0)
    wrap = max(us) - min(us) > 0.5
    for l, u in zip(f.loops, us):
        l[uv_cyl].uv = (u + 1.0 if wrap and u < 0.5 else u, l.vert.co.z / 0.07)
ob = bpy.data.objects.get('Stadium_Body')
me = bpy.data.meshes.new('Stadium_Body')
bm.to_mesh(me); bm.free()
if ob is None:
    ob = bpy.data.objects.new('Stadium_Body', me); bpy.context.scene.collection.objects.link(ob)
else:
    old = ob.data
    for m in old.materials:
        me.materials.append(m)
    ob.data = me; bpy.data.meshes.remove(old)
print('Stadium_Body:', len(me.vertices), 'verts')
