"""Textures for the stadium, drawn with numpy and saved as PNGs beside this file.

Run inside Blender (it saves through bpy):  exec(open('art/stadium/textures.py').read())

stickers.png  unrolled around the bowl ('Cyl' UV: u = angle, v = height / 70 mm):
              alpha = the light blue vinyl strips on the outer rails and under the inner ramps,
              red = a faint lift/wear at each sticker's edges
wear.png      plan view ('Top' UV, 272 mm across):
              red = scratches (circular, where tips grind; a few straight launch scuffs)
              green = dust, settled where the floor meets the wall and in the centre groove
              blue = smudges and fingerprints on the gloss
"""
import math, os
import numpy as np
import bpy

HERE = os.path.dirname(os.path.abspath(bpy.data.filepath))
rng = np.random.default_rng(2010)
RAMP0 = np.radians([20, 140, 260])     # must match the model: where each ramp leaves the rim
SPAN = np.radians(72)


def save(name, rgba):
    h, w = rgba.shape[:2]
    img = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=True)
    if img.size[0] != w or img.size[1] != h:
        img.scale(w, h)
    img.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    img.filepath_raw = os.path.join(HERE, name)
    img.file_format = 'PNG'
    img.save()
    return img


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def field(h, w, scale, seed):
    """smooth random field in 0..1, features about `scale` pixels across"""
    g = np.random.default_rng(seed).standard_normal((h, w))
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None, :]
    f = np.fft.ifft2(np.fft.fft2(g) * np.exp(-(fx ** 2 + fy ** 2) * (scale ** 2) * 2)).real
    f -= f.min(); return f / max(f.max(), 1e-9)


# ------------------------------------------------------------------ stickers
W, H = 8192, 1024
u = (np.arange(W) + 0.5) / W; v = (np.arange(H) + 0.5) / H
TH, Z = np.meshgrid(u * 2 * np.pi, v * 70.0)          # angle, height in mm
mask = np.zeros((H, W)); lift = np.zeros((H, W))
for a0 in RAMP0:
    # on each outer rail: a 2.6 mm strip from just above the flange to just under the rim
    a1 = a0 - np.radians(30)
    frac = np.clip((Z - 9.0) / 51.5, 0, 1)
    phi2 = (TH - a1 + np.pi) % (2 * np.pi) - np.pi
    across = (phi2 - np.radians(30) * frac) * 117.6 * math.cos(math.atan2(51.5, 117 * np.radians(30)))
    along = Z
    m = (1 - sstep(1.95, 2.25, np.abs(across))) * sstep(15.0, 15.6, along) * (1 - sstep(55.4, 56.0, along))
    mask = np.maximum(mask, m)
    lift += m * sstep(1.7, 2.15, np.abs(across)) * np.clip(field(H, W, 160, int(a0 * 100)) * 2 - 1, 0, 1) * 0.8
    # inside, a strip following just under each ramp's edge, most of its length
    phi = (TH - a0) % (2 * np.pi)
    zh = 61.0 - 31.0 * np.clip(phi / SPAN, 0, 1)
    off = Z - (zh - 3.4)
    m2 = (1 - sstep(1.6, 1.9, np.abs(off))) * sstep(np.radians(7), np.radians(8), phi) * (1 - sstep(np.radians(58), np.radians(59), phi))
    mask = np.maximum(mask, m2)
    lift += m2 * sstep(1.4, 1.8, np.abs(off)) * np.clip(field(H, W, 160, int(a0 * 100) + 7) * 2 - 1, 0, 1) * 0.8
rgba = np.zeros((H, W, 4)); rgba[..., 0] = np.clip(lift, 0, 1); rgba[..., 3] = mask
save('stickers.png', rgba)

# ------------------------------------------------------------------ wear, plan view
S = 2048; MM = 272.0 / S                                # mm per pixel
y, x = np.mgrid[0:S, 0:S]
X = (x + 0.5) * MM - 136.0; Y = (y + 0.5) * MM - 136.0
R = np.hypot(X, Y); A = np.arctan2(Y, X)
scr = np.zeros((S, S))


def splat(px, py, val, img):
    ix = np.clip(px.astype(int), 0, S - 1); iy = np.clip(py.astype(int), 0, S - 1)
    np.add.at(img, (iy, ix), val)


# fine arcs: tips skating round the bowl, thickest where tops spend their time
n = 1100
r0 = np.concatenate([rng.normal(62, 18, n // 2), rng.uniform(14, 100, n // 2)])
r0 = np.clip(r0, 3, 104)
for r_, a_, L, s in zip(r0, rng.uniform(0, 2 * np.pi, len(r0)), rng.uniform(0.05, 1.4, len(r0)), rng.uniform(0.03, 0.4, len(r0))):
    k = max(8, int(r_ * L / (MM * 0.5)))
    t = a_ + np.linspace(0, L, k) * rng.choice([-1, 1])
    rr = r_ + np.linspace(0, rng.normal(0, 2.5), k)            # tops drift in or out as they slow
    val = s * np.sin(np.linspace(0, np.pi, k)) ** 0.5
    splat((rr * np.cos(t) + 136) / MM, (rr * np.sin(t) + 136) / MM, val, scr)
# the centre, where a top settles and spins in place: a polished, finely ringed patch
ring = (0.5 + 0.5 * np.sin(R * 9.0 + field(S, S, 6, 3) * 6)) * (1 - sstep(4, 16, R))
scr += ring * 0.35 * field(S, S, 40, 4)
# a few straight scuffs where launchers and tops landed near the wall
for _ in range(45):
    r_ = rng.uniform(70, 104); a_ = rng.uniform(0, 2 * np.pi); L = rng.uniform(2, 9); d = a_ + np.pi / 2 + rng.normal(0, 0.5)
    k = int(L / (MM * 0.5)); t = np.linspace(0, L, k)
    splat((r_ * np.cos(a_) + t * np.cos(d) + 136) / MM, (r_ * np.sin(a_) + t * np.sin(d) + 136) / MM, rng.uniform(0.3, 0.9) * np.ones(k), scr)
# soften the splats into hairline scratches
f = np.fft.fft2(scr); fy = np.fft.fftfreq(S)[:, None]; fx = np.fft.fftfreq(S)[None, :]
scr = np.fft.ifft2(f * np.exp(-(fx ** 2 + fy ** 2) * 1.2 ** 2 * 2 * np.pi ** 2)).real
scr = np.clip(scr * 1.4, 0, 1) * (R < 109)

# dust: in the corner where the floor meets the wall, in the centre groove, and under the rim's lip outside
corner = np.exp(-((R - 103) / 3.2) ** 2) + 0.6 * np.exp(-((R - 50.2) / 0.8) ** 2) + 0.5 * np.exp(-((R - 120.5) / 1.6) ** 2)
specks = (field(S, S, 1.2, 5) > 0.83) * field(S, S, 3, 6)
dust = np.clip(corner * (0.4 + 0.6 * field(S, S, 18, 7)) + specks * 0.5 + 0.08 * field(S, S, 80, 8), 0, 1)

# smudges: a couple of thumb prints on the rim and flange, and a light general haze
smudge = 0.15 * field(S, S, 60, 9)
for _ in range(7):
    a_ = rng.uniform(0, 2 * np.pi); r_ = rng.choice([111.5, 127.0]) + rng.normal(0, 1.5)
    cx, cy = r_ * math.cos(a_), r_ * math.sin(a_)
    d2 = ((X - cx) ** 2 + (Y - cy) ** 2) / rng.uniform(25, 60)
    whorl = 0.5 + 0.5 * np.sin(np.sqrt(d2) * 9 * 2.2 + rng.uniform(0, 6))
    smudge += np.exp(-d2) * (0.5 + 0.5 * whorl) * rng.uniform(0.5, 0.9)
smudge = np.clip(smudge, 0, 1)

rgba = np.ones((S, S, 4)); rgba[..., 0] = scr; rgba[..., 1] = dust; rgba[..., 2] = smudge
save('wear.png', rgba)
print('textures saved to', HERE)
