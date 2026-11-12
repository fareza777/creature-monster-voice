"""The specimen heads: one parameter set and one set of sculpting primitives per creature.

Every head shares the app's API (node names, shape keys, eye and teeth nodes) and the same frame:
Blender Z up, the face toward -Y, the neck cut at z = 0.08, the jaw hinge near (0, 0.05, 0.86).
"""
import math

import numpy as np
from mathutils import Vector

from specimen_lib import box, cyl, curve_tube, ell, ell_along, gradient_material, join, leaf, orient, paint_along, poly_dist, seg_dist, sstep, sweep, vnoise, voronoi

S = (-1, 1)

# the defaults are the ogre's
BASE = dict(
    mouth_z=0.64, smile=0.14, lens=(0.44, 0.6, 0.04), wrap=1.1, lens_y0=-1.0, teeth_y0=-0.93, lip_y=-1.1, front_y=-1.0,
    curl=0.05, fang_x=0.2, jag=False, jaw_angle=28.0, pivot=(0.0, 0.05, 0.86), fillet=0.07, smooth=6,
    eye_r=0.15, eye_x=0.33, eye_z=1.1, eye_tilt=0.3, eye_a=0.152, eye_b=0.06, eye_depth=0.8, eye_cut="almond", eye_style="slit", eye_shape=(1, 1, 1),
    sclera=(0.5, 0.3, 0.1), iris=(1.0, 0.55, 0.05),
    nostrils=[dict(x=0.09, z=0.88, scale=(0.045, 0.09, 0.026), rot=(-0.55, 0, 0.6), inset=0.035)],
    nose_z=0.95, brow_z=1.32,
    bag=((0, -0.64, -0.02), (0.42, 0.38, 0.17), -0.8), tongue=((0, -0.62, -0.04), (0.23, 0.34, 0.065)),
    teeth="fangs", inside=(0.26, 0.03, 0.06), inside_glow=0.0,
    detail=dict(hollows=1, lumps=1, forehead=1, frown=1, lids=1, crow=1, naso=1, lips=1, neck=1, scales=1, warts=1, veins=1, grain=1),
    dark=[],
)


# ---------------------------------------------------------------------------- ogre

def ogre_parts(P):
    MZ = P.mouth_z
    parts = [
        ell("cranium", (0, 0.16, 1.45), (0.86, 0.92, 0.8)),
        ell("occiput", (0, 0.48, 1.5), (0.72, 0.6, 0.62)),
        ell("crown", (0, 0.12, 1.88), (0.6, 0.66, 0.36)),
        ell("forehead", (0, -0.42, 1.55), (0.6, 0.4, 0.4)),
        ell("glabella", (0, -0.84, 1.27), (0.14, 0.12, 0.12)),
        ell("bridge", (0, -0.98, 1.08), (0.12, 0.14, 0.15)),
        ell("muzzle", (0, -0.76, 0.84), (0.46, 0.4, 0.25)),
        ell("nose", (0, -1.1, 0.95), (0.24, 0.15, 0.13)),
        ell("lipU", (0, -0.98, MZ + 0.065), (0.45, 0.17, 0.075)),
        ell("lipL", (0, -0.93, MZ - 0.075), (0.41, 0.17, 0.08)),
        ell("chin", (0, -0.8, 0.43), (0.36, 0.26, 0.17)),
        ell("chinKnob", (0, -0.94, 0.4), (0.16, 0.1, 0.1)),
        ell("neck", (0, 0.12, 0.3), (0.44, 0.42, 0.55)),
        ell("nape", (0, 0.42, 0.62), (0.44, 0.3, 0.4)),
    ]
    for s in S:
        parts += [
            ell_along("brow", (0.08 * s, -0.86, 1.26), (0.56 * s, -0.66, 1.42), 0.13, 0.095),
            ell_along("browOuter", (0.5 * s, -0.7, 1.4), (0.74 * s, -0.36, 1.36), 0.1, 0.08),
            ell("temple", (0.7 * s, -0.3, 1.24), (0.22, 0.3, 0.3)),
            ell("cheek", (0.52 * s, -0.66, 0.98), (0.22, 0.17, 0.12), rot=(0, 0.25 * s, 0)),
            ell_along("zygo", (0.55 * s, -0.6, 1.0), (0.78 * s, -0.12, 1.06), 0.09, 0.075),
            ell("noseWing", (0.15 * s, -1.05, 0.9), (0.11, 0.1, 0.09)),
            ell("snout", (0.23 * s, -0.86, 0.86), (0.18, 0.17, 0.14)),
            ell("jaw", (0.44 * s, -0.42, 0.55), (0.22, 0.38, 0.2), rot=(0, 0, -0.25 * s)),
            ell("gonion", (0.56 * s, -0.04, 0.64), (0.16, 0.2, 0.2)),
            ell_along("tendon", (0.52 * s, 0.1, 0.92), (0.12 * s, -0.36, 0.06), 0.1, 0.09),
        ]
        ear = leaf("ear", (0.2, 0.07, 0.62))
        orient(ear, (1.0 * s, 0.26, 1.4), (0.62 * s, 0.62, 0.45), (0.8 * s, -0.5, 0.1))
        parts.append(ear)
    crest = [(0, -0.62, 1.82), (0, -0.36, 2.06), (0, -0.04, 2.2), (0, 0.32, 2.18), (0, 0.66, 2.0), (0, 0.9, 1.7)]
    for a, b in zip(crest[:-1], crest[1:]):
        parts.append(ell_along("crest", a, b, 0.06, 0.07))
    return parts


# ---------------------------------------------------------------------------- demon

def demon_parts(P):
    MZ = P.mouth_z
    parts = [
        ell("cranium", (0, 0.14, 1.5), (0.78, 0.88, 0.8)),
        ell("occiput", (0, 0.46, 1.52), (0.64, 0.56, 0.6)),
        ell("crown", (0, 0.1, 1.9), (0.56, 0.62, 0.34)),
        ell("forehead", (0, -0.44, 1.6), (0.55, 0.4, 0.42)),
        ell("glabella", (0, -0.84, 1.25), (0.11, 0.11, 0.11)),
        ell_along("bridge", (0, -0.9, 1.2), (0, -1.04, 0.98), 0.075, 0.08),
        ell("nose", (0, -1.07, 0.94), (0.12, 0.1, 0.085)),
        ell("muzzle", (0, -0.74, 0.8), (0.4, 0.36, 0.22)),
        ell("lipU", (0, -0.95, MZ + 0.05), (0.42, 0.14, 0.05)),
        ell("lipL", (0, -0.91, MZ - 0.055), (0.38, 0.14, 0.055)),
        ell("chin", (0, -0.78, 0.4), (0.24, 0.22, 0.19)),
        ell_along("goatee", (0, -0.84, 0.36), (0, -1.0, 0.12), 0.075, 0.065),
        ell("neck", (0, 0.12, 0.3), (0.38, 0.38, 0.55)),
        ell("nape", (0, 0.42, 0.62), (0.4, 0.28, 0.4)),
    ]
    for s in S:
        parts += [
            ell_along("brow", (0.06 * s, -0.86, 1.22), (0.52 * s, -0.64, 1.47), 0.11, 0.08),
            ell_along("ridgeA", (0.12 * s, -0.8, 1.45), (0.24 * s, -0.52, 1.98), 0.045, 0.045),
            ell_along("ridgeB", (0.32 * s, -0.7, 1.5), (0.5 * s, -0.36, 1.92), 0.04, 0.04),
            ell("temple", (0.66 * s, -0.3, 1.26), (0.2, 0.28, 0.28)),
            ell_along("cheekbone", (0.28 * s, -0.84, 1.0), (0.72 * s, -0.36, 1.12), 0.085, 0.07),
            ell("noseWing", (0.08 * s, -1.02, 0.9), (0.06, 0.06, 0.05)),
            ell("jaw", (0.38 * s, -0.42, 0.55), (0.2, 0.4, 0.22), rot=(0, 0, -0.35 * s)),
            ell("gonion", (0.5 * s, -0.06, 0.66), (0.14, 0.18, 0.18)),
            ell_along("tendon", (0.46 * s, 0.1, 0.92), (0.1 * s, -0.34, 0.06), 0.085, 0.08),
        ]
        ear = leaf("ear", (0.13, 0.05, 0.5))
        orient(ear, (0.86 * s, 0.22, 1.42), (0.45 * s, 0.45, 0.75), (0.8 * s, -0.5, 0.1))
        parts.append(ear)
    return parts


# ---------------------------------------------------------------------------- alien

def alien_parts(P):
    MZ = P.mouth_z
    parts = [
        ell("cranium", (0, 0.32, 1.72), (0.92, 1.02, 0.92)),
        ell("backBulb", (0, 0.78, 1.86), (0.78, 0.72, 0.72)),
        ell("forehead", (0, -0.3, 1.66), (0.74, 0.55, 0.62)),
        ell("face", (0, -0.5, 1.0), (0.46, 0.4, 0.42)),
        ell("chin", (0, -0.62, 0.5), (0.19, 0.19, 0.17)),
        ell("mouthArea", (0, -0.7, 0.66), (0.22, 0.2, 0.12)),
        ell("lipU", (0, -0.83, MZ + 0.026), (0.13, 0.07, 0.03)),
        ell("lipL", (0, -0.81, MZ - 0.026), (0.11, 0.07, 0.03)),
        ell("nose", (0, -0.86, 0.86), (0.065, 0.06, 0.06)),
        ell("neck", (0, 0.18, 0.32), (0.24, 0.26, 0.6)),
    ]
    for s in S:
        parts += [
            ell("eyeMass", (0.34 * s, -0.58, 1.16), (0.3, 0.26, 0.26)),
            ell_along("jawline", (0.36 * s, -0.36, 0.82), (0.1 * s, -0.62, 0.48), 0.12, 0.1),
            ell("cheek", (0.4 * s, -0.52, 0.92), (0.2, 0.22, 0.18)),
        ]
    return parts


def alien_detail(P, x, y, z, d, cav, groove):
    # soft cranial lobes and a vein web over the dome
    top = sstep(1.75, 2.1, z)
    for k in (-1, 0, 1):
        groove(np.abs(x - k * 0.34 - 0.04 * np.sin(y * 5 + k)), 0.025, 0.012, top * sstep(-0.4, 0.0, y))
    groove(np.abs(y - 0.25 - 0.05 * np.sin(x * 4)), 0.03, 0.01, sstep(1.6, 1.9, z))


# ---------------------------------------------------------------------------- robot

def robot_parts(P):
    parts = [
        box("cranium", (0, 0.1, 1.52), (0.74, 0.8, 0.56)),
        ell("dome", (0, 0.12, 1.98), (0.7, 0.76, 0.3)),
        box("face", (0, -0.6, 1.06), (0.6, 0.34, 0.5)),
        box("browBar", (0, -0.9, 1.32), (0.64, 0.08, 0.075)),
        box("cheeks", (0, -0.66, 0.86), (0.62, 0.3, 0.14)),
        box("jaw", (0, -0.52, 0.54), (0.5, 0.42, 0.2)),
        box("mouthPlate", (0, -0.84, 0.63), (0.38, 0.1, 0.15)),
        box("noseRidge", (0, -0.94, 1.02), (0.06, 0.06, 0.14)),
        cyl("neck", (0, 0.1, 0.36), 0.34, 0.6),
        box("neckRing", (0, 0.1, 0.22), (0.4, 0.4, 0.06)),
    ]
    for s in S:
        parts += [
            cyl("ear", (0.76 * s, 0.0, 1.2), 0.28, 0.22, rot=(0, math.pi / 2, 0)),
            box("vent", (0.5 * s, -0.86, 0.9), (0.1, 0.06, 0.12)),
        ]
    return parts


def robot_detail(P, x, y, z, d, cav, groove):
    ax = np.abs(x)
    # panel seams: around the skull, between face and jaw, down the face, over the dome
    groove(z - 1.64, 0.008, 0.012, 1.0)
    groove(z - 0.76, 0.008, 0.012, sstep(-0.2, -0.5, y))
    groove(y - 0.36, 0.008, 0.012, sstep(0.45, 0.6, z))
    groove(ax - 0.36, 0.008, 0.01, sstep(-0.5, -0.8, y) * sstep(0.85, 0.95, z) * sstep(1.55, 1.45, z))
    groove(x, 0.008, 0.01, sstep(1.9, 2.0, z))
    # vents (horizontal slots) and the speaker grill around the mouth
    vent = sstep(0.38, 0.42, ax) * sstep(0.62, 0.58, ax) * sstep(0.79, 0.81, z) * sstep(1.01, 0.99, z) * sstep(-0.8, -0.86, y)
    d -= 0.012 * (0.5 + 0.5 * np.cos(z * math.tau / 0.04)) * vent
    cav += 0.8 * (0.5 + 0.5 * np.cos(z * math.tau / 0.04)) * vent
    # rivets along the seams
    th = np.arctan2(x, -y)
    for zk in (1.58, 0.82):
        for k in range(-9, 10):
            dist = np.hypot((th - k * 0.33) * 0.75, z - zk)
            d += 0.012 * np.exp(-((dist / 0.016) ** 2))
    for s in S:
        # a ring of bolts on each ear disc
        for k in range(8):
            a = k * math.tau / 8
            dist = np.hypot(y - 0.2 * math.cos(a), z - 1.2 - 0.2 * math.sin(a)) + 0.6 * np.abs(ax - 0.87)
            d += 0.012 * np.exp(-((dist / 0.018) ** 2)) * (x * s > 0)
    # brushed metal
    d += 0.0007 * vnoise(np.c_[x * 4, y * 90, z * 90], 51)


# ---------------------------------------------------------------------------- beast

def beast_parts(P):
    MZ = P.mouth_z
    parts = [
        ell("cranium", (0, 0.22, 1.5), (0.8, 0.86, 0.72)),
        ell("occiput", (0, 0.5, 1.45), (0.68, 0.58, 0.6)),
        ell("forehead", (0, -0.36, 1.52), (0.58, 0.42, 0.38)),
        ell_along("muzzle", (0, -0.5, 1.0), (0, -1.6, 0.88), 0.27, 0.22),
        ell_along("bridge", (0, -0.66, 1.22), (0, -1.6, 1.02), 0.12, 0.09),
        ell("nose", (0, -1.72, 0.99), (0.15, 0.11, 0.1)),
        ell_along("jawLow", (0, -0.45, 0.6), (0, -1.5, MZ - 0.1), 0.19, 0.1),
        ell("chin", (0, -1.4, MZ - 0.1), (0.13, 0.12, 0.08)),
        ell("neck", (0, 0.15, 0.35), (0.5, 0.48, 0.6)),
        ell("ruff", (0, 0.0, 0.62), (0.62, 0.55, 0.38)),
    ]
    for s in S:
        parts += [
            ell_along("brow", (0.08 * s, -0.82, 1.3), (0.56 * s, -0.6, 1.42), 0.13, 0.09),
            ell_along("jowl", (0.15 * s, -0.62, MZ + 0.08), (0.11 * s, -1.58, MZ + 0.05), 0.12, 0.09),
            ell("cheekFur", (0.5 * s, -0.36, 0.9), (0.27, 0.34, 0.3)),
            ell("noseWing", (0.08 * s, -1.68, 0.97), (0.07, 0.07, 0.06)),
            ell("temple", (0.66 * s, -0.2, 1.3), (0.22, 0.3, 0.28)),
        ]
        ear = leaf("ear", (0.27, 0.08, 0.6))
        orient(ear, (0.52 * s, 0.22, 2.0), (0.35 * s, 0.15, 1), (0.5 * s, -1, 0))
        parts.append(ear)
    return parts


def beast_detail(P, x, y, z, d, cav, groove):
    # fur: clumped strands running down the skull and back along the muzzle
    snout = sstep(-0.62, -0.85, y) * sstep(1.2, 1.05, z)
    down = vnoise(np.c_[x * 26, y * 26, z * 4.5], 61) + 0.5 * vnoise(np.c_[x * 55, y * 55, z * 9], 62)
    back = vnoise(np.c_[x * 30, y * 4.5, z * 30], 63) + 0.5 * vnoise(np.c_[x * 60, y * 9, z * 60], 64)
    n = down * (1 - snout) + back * snout
    nose = np.exp(-((x / 0.2) ** 2 + ((y + 1.72) / 0.14) ** 2 + ((z - 0.99) / 0.14) ** 2))
    lips = np.exp(-(((z - P.mouth_z) / 0.06) ** 2)) * sstep(-0.6, -0.8, y)
    m = np.clip(1 - nose * 1.5 - lips, 0, 1)
    d += 0.009 * n * m
    cav += np.clip(-n, 0, 1) * 0.7 * m
    # a leathery, pebbled nose pad
    f1, _, _ = voronoi(np.c_[x, y, z] / 0.018, 71)
    d -= 0.003 * np.exp(-((f1 / 0.15) ** 2)) * nose


# ---------------------------------------------------------------------------- skull

def skull_parts(P):
    MZ = P.mouth_z
    parts = [
        ell("cranium", (0, 0.16, 1.5), (0.8, 0.9, 0.82)),
        ell("occiput", (0, 0.48, 1.48), (0.68, 0.6, 0.62)),
        ell("forehead", (0, -0.45, 1.55), (0.6, 0.4, 0.42)),
        ell("maxilla", (0, -0.72, 0.84), (0.36, 0.32, 0.18)),
        ell("upperRidge", (0, -0.84, MZ + 0.06), (0.3, 0.14, 0.07)),
        ell("lowerRidge", (0, -0.8, MZ - 0.07), (0.28, 0.14, 0.07)),
        ell("chin", (0, -0.74, 0.4), (0.28, 0.22, 0.14)),
        ell("spine", (0, 0.24, 0.32), (0.2, 0.2, 0.5)),
        ell("glabella", (0, -0.86, 1.22), (0.12, 0.1, 0.1)),
        ell("noseBone", (0, -0.9, 1.08), (0.1, 0.1, 0.1)),
    ]
    for s in S:
        parts += [
            ell_along("brow", (0.06 * s, -0.86, 1.24), (0.5 * s, -0.7, 1.3), 0.11, 0.07),
            ell_along("zygo", (0.36 * s, -0.78, 0.98), (0.74 * s, -0.2, 1.0), 0.08, 0.07),
            ell("cheekbone", (0.46 * s, -0.68, 0.98), (0.18, 0.16, 0.14)),
            ell("temple", (0.66 * s, -0.2, 1.3), (0.18, 0.32, 0.3)),
            ell_along("mandible", (0.1 * s, -0.78, 0.42), (0.44 * s, -0.3, 0.52), 0.1, 0.09),
            ell_along("ramus", (0.46 * s, -0.3, 0.5), (0.5 * s, -0.1, 0.92), 0.08, 0.08),
        ]
    return parts


def skull_detail(P, x, y, z, d, cav, groove):
    # sutures: the wavy seams between the skull plates
    groove(np.abs(x) - 0.012 * np.sin(y * 38), 0.007, 0.01, sstep(1.8, 2.0, z) * sstep(-0.5, -0.2, y))
    groove(y + 0.05 - 0.4 * (z - 1.9) ** 2 - 0.012 * np.sin(x * 40), 0.007, 0.01, sstep(1.45, 1.7, z))
    groove(z - 1.32 - 0.25 * np.abs(y - 0.3) - 0.01 * np.sin(y * 42), 0.007, 0.008, sstep(0.55, 0.65, np.abs(x)))
    # a few hairline cracks
    f1, f2, cid = voronoi(np.c_[x, y, z] / 0.22, 81)
    crack = np.exp(-(((f2 - f1) / 0.025) ** 2)) * (cid > 0.82)
    d -= 0.007 * crack
    cav += crack


# ---------------------------------------------------------------------------- pumpkin

def pumpkin_parts(P):
    return [ell("pumpkin", (0, 0, 1.0), (1.12, 1.02, 0.94), seg=96, rings=64)]


def pumpkin_detail(P, x, y, z, d, cav, groove):
    th = np.arctan2(x, -y)
    r = np.hypot(x, y)
    lobes = 0.5 - 0.5 * np.cos(10 * th)       # 0 mid-lobe … 1 between lobes
    pole = sstep(0.15, 0.55, r)
    d -= 0.07 * lobes ** 2.5 * pole
    cav += np.clip(lobes ** 3 * pole * 1.5, 0, 1)
    d -= 0.12 * np.exp(-((r / 0.28) ** 2)) * sstep(1.55, 1.85, z)   # the dimple under the stem
    d += 0.0025 * vnoise(np.c_[th * 40, r * 5, z * 3], 91)          # striations along the lobes


def pumpkin_extras(P, bvh, mats):
    stem_m = gradient_material("Stem", rough=0.75, coat=0.1)
    hit = bvh.ray_cast(Vector((0, 0, 3)), Vector((0, 0, -1)))
    top = hit[0] if hit[0] else Vector((0, 0, 1.9))
    ctrl = [(0, 0, top.z - 0.08), (0.02, -0.02, top.z + 0.22), (0.1, 0.05, top.z + 0.38), (0.24, 0.12, top.z + 0.42)]
    st = sweep("stem", ctrl, 0.11, segs=32, ring=14, ridges=0.12, power=0.35)
    paint_along(st, (0.22, 0.28, 0.09), (0.42, 0.32, 0.16), ctrl[0], ctrl[3], rings=90)
    vine = curve_tube("vine", [(0.04, 0.0, top.z + 0.05), (-0.25, -0.1, top.z + 0.12), (-0.4, 0.05, top.z + 0.3), (-0.3, 0.2, top.z + 0.42), (-0.2, 0.12, top.z + 0.3)], 0.016, [1, 0.9, 0.7, 0.5, 0.3], 24)
    paint_along(vine, (0.2, 0.35, 0.08), (0.3, 0.45, 0.12), (0, 0, top.z), (-0.4, 0, top.z + 0.4))
    o = join([st, vine], "Extras")
    o.data.materials.clear()
    o.data.materials.append(stem_m)
    return o


# ---------------------------------------------------------------------------- frankenstein

def frank_parts(P):
    MZ = P.mouth_z
    parts = [
        ell("cranium", (0, 0.1, 1.5), (0.8, 0.88, 0.72)),
        box("flatTop", (0, 0.06, 1.9), (0.7, 0.78, 0.2)),
        ell("forehead", (0, -0.46, 1.62), (0.62, 0.4, 0.46)),
        ell_along("brow", (-0.56, -0.82, 1.32), (0.56, -0.82, 1.32), 0.1, 0.085),
        ell_along("bridge", (0, -0.9, 1.22), (0, -1.06, 0.96), 0.075, 0.075),
        ell("nose", (0, -1.08, 0.93), (0.1, 0.09, 0.08)),
        ell("muzzle", (0, -0.76, 0.82), (0.42, 0.36, 0.24)),
        ell("lipU", (0, -0.96, MZ + 0.042), (0.3, 0.12, 0.045)),
        ell("lipL", (0, -0.94, MZ - 0.048), (0.28, 0.12, 0.05)),
        ell("chin", (0, -0.84, 0.42), (0.34, 0.22, 0.16)),
        ell("neck", (0, 0.12, 0.3), (0.46, 0.44, 0.55)),
        ell("nape", (0, 0.42, 0.62), (0.44, 0.3, 0.4)),
    ]
    for s in S:
        parts += [
            ell("noseWing", (0.08 * s, -1.03, 0.9), (0.065, 0.065, 0.055)),
            ell("cheek", (0.5 * s, -0.66, 0.98), (0.24, 0.2, 0.14), rot=(0, 0.25 * s, 0)),
            ell("jaw", (0.46 * s, -0.44, 0.55), (0.26, 0.42, 0.24), rot=(0, 0, -0.2 * s)),
            ell("gonion", (0.56 * s, -0.04, 0.62), (0.17, 0.2, 0.2)),
            ell("ear", (0.84 * s, 0.08, 1.12), (0.08, 0.17, 0.24), rot=(0, 0, 0.25 * s)),
            ell("temple", (0.7 * s, -0.3, 1.24), (0.2, 0.28, 0.28)),
            ell_along("tendon", (0.5 * s, 0.1, 0.9), (0.12 * s, -0.36, 0.06), 0.1, 0.09),
        ]
    return parts


def frank_detail(P, x, y, z, d, cav, groove):
    front = sstep(-0.25, -0.6, y)
    # a stitched scar across the forehead and one down the cheek
    for pts, mask in (([(-0.5, 1.7), (-0.15, 1.78), (0.2, 1.72), (0.52, 1.8)], front), ([(0.42, 1.02), (0.5, 0.86), (0.48, 0.7)], front * (x > 0))):
        dist = poly_dist(x, z, pts)
        groove(dist, 0.01, 0.014, mask)
        # cross stitches every 0.07 along the scar
        for (ax_, az), (bx, bz) in zip(pts[:-1], pts[1:]):
            L = math.hypot(bx - ax_, bz - az)
            n = max(2, int(L / 0.07))
            for k in range(n + 1):
                t = k / n
                cx, cz = ax_ + (bx - ax_) * t, az + (bz - az) * t
                nx, nz = -(bz - az) / L, (bx - ax_) / L
                sd, _ = seg_dist(x, z, cx - nx * 0.035, cz - nz * 0.035, cx + nx * 0.035, cz + nz * 0.035)
                d += 0.008 * np.exp(-((sd / 0.007) ** 2)) * mask


def frank_extras(P, bvh, mats):
    parts = []
    for s in S:
        hit = bvh.ray_cast(Vector((1.5 * s, 0.05, 0.32)), Vector((-s, 0, 0)))
        p = hit[0] if hit[0] else Vector((0.45 * s, 0.05, 0.32))
        b = cyl("bolt", (p.x + 0.06 * s, p.y, p.z), 0.06, 0.24, rot=(0, math.pi / 2, 0), verts_n=24)
        nut = cyl("nut", (p.x + 0.16 * s, p.y, p.z), 0.095, 0.07, rot=(0, math.pi / 2, 0), verts_n=6)
        parts += [b, nut]
    o = join(parts, "Extras")
    o.data.materials.clear()
    o.data.materials.append(mats["metal"])
    return o


def robot_extras(P, bvh, mats):
    parts = []
    for s in S:
        ring = cyl("earLight", (0.88 * s, 0.0, 1.2), 0.12, 0.02, rot=(0, math.pi / 2, 0), verts_n=32)
        ring.data.materials.append(mats["glow"])
        parts.append(ring)
    rod = cyl("antenna", (0.0, 0.1, 2.35), 0.025, 0.3, verts_n=12)
    rod.data.materials.append(mats["metal"])
    tip = ell("antennaTip", (0.0, 0.1, 2.52), (0.06, 0.06, 0.06), seg=16, rings=12)
    tip.data.materials.append(mats["glow"])
    o = join(parts + [rod, tip], "Extras")
    return o


# ---------------------------------------------------------------------------- the catalogue

KINDS = {
    "ogre": dict(parts=ogre_parts),
    "demon": dict(
        parts=demon_parts, smile=0.4, lens=(0.46, 0.6, 0.032), wrap=1.2, curl=0.02, fang_x=0.24, lip_y=-1.06,
        eye_r=0.13, eye_x=0.3, eye_z=1.12, eye_tilt=0.42, eye_a=0.15, eye_b=0.044, eye_depth=0.85, sclera=(0.06, 0.02, 0.02),
        nostrils=[dict(x=0.06, z=0.89, scale=(0.03, 0.07, 0.02), rot=(-0.5, 0, 0.5), inset=0.03)],
        teeth="grin", detail=dict(hollows=1.4, lumps=0.6, forehead=0.6, frown=1.3, lids=1, crow=0.8, naso=1.2, lips=1, neck=1, scales=0, warts=0, veins=1.6, grain=1),
    ),
    "alien": dict(
        parts=alien_parts, extra_detail=alien_detail, mouth_z=0.66, smile=0.02, lens=(0.13, 0.4, 0.014), wrap=1.5, lens_y0=-0.83, lip_y=-0.9, front_y=-0.92,
        curl=0.0, jaw_angle=18.0, eye_r=0.2, eye_x=0.34, eye_z=1.18, eye_tilt=0.5, eye_a=0.27, eye_b=0.14, eye_depth=0.7, eye_style="black", eye_shape=(1.25, 0.75, 0.68),
        nostrils=[dict(x=0.028, z=0.86, scale=(0.012, 0.05, 0.02), rot=(-0.4, 0, 0.3), inset=0.02)], nose_z=0.86, brow_z=1.36,
        bag=((0, -0.68, -0.01), (0.13, 0.18, 0.07), -0.8), tongue=None, teeth=None,
        detail=dict(hollows=0, lumps=0.4, forehead=0, frown=0, lids=0.4, crow=0, naso=0, lips=0.4, neck=0.5, scales=0, warts=0, veins=1.8, grain=0.6),
    ),
    "robot": dict(
        parts=robot_parts, extra_detail=robot_detail, extras=robot_extras, smile=0.0, lens=(0.3, 0.5, 0.026), wrap=0.3, lens_y0=-0.95, teeth_y0=-0.92, lip_y=-0.96,
        curl=0.0, jaw_angle=22.0, fillet=0.03, smooth=2, eye_r=0.15, eye_x=0.3, eye_z=1.12, eye_tilt=0.0, eye_a=0.145, eye_b=0.145, eye_depth=0.6, eye_cut="round", eye_style="lens",
        sclera=(0.08, 0.08, 0.1), nostrils=[], tongue=None, teeth="grill", inside=(0.05, 0.05, 0.07),
        detail=dict(hollows=0, lumps=0, forehead=0, frown=0, lids=0, crow=0, naso=0, lips=0, neck=0, scales=0, warts=0, veins=0, grain=0),
    ),
    "beast": dict(
        parts=beast_parts, extra_detail=beast_detail, mouth_z=0.72, smile=0.0, lens=(0.26, 0.62, 0.032), wrap=10.0, lens_y0=-1.46, teeth_y0=-1.56, lip_y=-1.76,
        curl=0.02, fang_x=0.09, jaw_angle=18.0, eye_r=0.12, eye_x=0.36, eye_z=1.2, eye_tilt=0.25, eye_a=0.13, eye_b=0.06, eye_depth=0.8, eye_style="round",
        sclera=(0.6, 0.35, 0.05), nostrils=[dict(x=0.07, z=1.0, scale=(0.035, 0.06, 0.025), rot=(-0.2, 0, 0.4), inset=0.03)], nose_z=1.0, brow_z=1.36,
        bag=((0, -1.05, -0.02), (0.21, 0.62, 0.12), -1.6), tongue=((0, -1.02, -0.045), (0.13, 0.4, 0.045)), teeth="canines",
        detail=dict(hollows=0, lumps=0.6, forehead=0.3, frown=1, lids=1, crow=0.5, naso=0, lips=0.5, neck=0, scales=0, warts=0, veins=0, grain=0.7),
        dark=[((0, -1.72, 0.99), (0.2, 0.14, 0.14), 0.8), ((0, -1.1, 0.72), (0.3, 0.8, 0.05), 0.5), ((0, -0.2, 1.9), (0.8, 0.9, 0.5), 0.25)],
    ),
    "skull": dict(
        parts=skull_parts, extra_detail=skull_detail, smile=0.08, lens=(0.34, 0.55, 0.026), wrap=1.2, lens_y0=-0.85, teeth_y0=-0.865, lip_y=-0.95,
        curl=0.0, jaw_angle=24.0, eye_r=0.06, eye_x=0.3, eye_z=1.1, eye_tilt=0.1, eye_a=0.15, eye_b=0.13, eye_depth=2.6, eye_cut="socket", eye_style="glow",
        nostrils=[dict(x=0.035, z=0.97, scale=(0.045, 0.24, 0.1), rot=(0, -0.3, 0), inset=0.0, mirror_rot=True)], nose_z=0.97,
        bag=((0, -0.6, -0.02), (0.3, 0.32, 0.12), -0.75), tongue=None, teeth="blocks", inside=(0.08, 0.05, 0.05),
        detail=dict(hollows=0.5, lumps=0.5, forehead=0, frown=0, lids=0, crow=0, naso=0, lips=0, neck=0, scales=0, warts=0, veins=0, grain=1.5),
    ),
    "pumpkin": dict(
        parts=pumpkin_parts, extra_detail=pumpkin_detail, extras=pumpkin_extras, mouth_z=0.72, smile=0.55, lens=(0.58, 0.6, 0.075), wrap=0.9, lens_y0=-1.0, lip_y=-1.0,
        curl=0.0, jag=True, jaw_angle=14.0, fillet=0.02, smooth=2, eye_r=0.1, eye_x=0.38, eye_z=1.32, eye_tilt=0.25, eye_a=0.19, eye_depth=2.2, eye_cut="triangle", eye_style="glow",
        nostrils=[dict(x=0.0, z=1.04, tri=0.1, inset=0.0)], nose_z=1.04, brow_z=1.45,
        bag=((0, -0.55, 0.0), (0.55, 0.42, 0.2), -0.85), tongue=None, teeth=None, inside=(1.0, 0.5, 0.08), inside_glow=3.0,
        detail=dict(hollows=0, lumps=0.6, forehead=0, frown=0, lids=0, crow=0, naso=0, lips=0, neck=0, scales=0, warts=0.4, veins=0, grain=0.5),
    ),
    "frank": dict(
        parts=frank_parts, extra_detail=frank_detail, extras=frank_extras, smile=-0.05, lens=(0.3, 0.6, 0.024), wrap=1.4, teeth_y0=-0.97, lip_y=-1.08,
        curl=0.0, eye_r=0.13, eye_x=0.3, eye_z=1.12, eye_tilt=-0.06, eye_a=0.13, eye_b=0.05, eye_depth=0.85, eye_style="round", sclera=(0.85, 0.8, 0.62),
        nostrils=[dict(x=0.045, z=0.89, scale=(0.022, 0.05, 0.018), rot=(-0.5, 0, 0.2), inset=0.03)], teeth="flat",
        detail=dict(hollows=0.6, lumps=0.5, forehead=0.8, frown=0.8, lids=1, crow=0.6, naso=1, lips=1, neck=1, scales=0, warts=0.2, veins=0.8, grain=1),
    ),
}
