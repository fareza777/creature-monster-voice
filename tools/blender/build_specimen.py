"""
Creature Voice Studio — procedural specimen heads (Blender 4.5, headless).

Sculpts one creature head (tools/blender/kinds.py: ogre, demon, alien, robot, beast, skull,
pumpkin, frank) from primitives fused by voxel remeshing, displaces its skin detail on a
high-resolution sculpt (wrinkles, furrows, lid creases, scales, fur, panel seams, sutures, ribs,
stitches, pores) and bakes it onto a light game mesh as a tangent-space normal map and a neutral
detail map (cavities, occlusion, mottling) that the app tints with the DNA colour.

Every head keeps the app's API: the shape keys the voice engine drives (jawOpen, mouthWide,
mouthRound, snarl, browDown), separate eyes, teeth (the lower row rides the jaw) and tongue, an
optional static `Extras` node, and the DNA cosmetics (horns, tusks, antennae, visor + bolts,
animal ears, collar). One GLB per head for three.js.

Run:
  blender -b --factory-startup --python tools/blender/build_specimen.py -- out.glb [preview.png] [jaw] [cosmetics] kind=<name>
"""
import math
import os
import sys
from types import SimpleNamespace

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kinds import BASE, KINDS  # noqa: E402
from specimen_lib import (  # noqa: E402
    activate, apply_mod, boolean, clean, curve_tube, ell, fbm, gradient_material, join, leaf, material, orient,
    paint_along, poly_dist, seg_dist, set_verts, smooth01, sstep, sweep, verts, vnoise, voronoi,
)

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OPTS = dict(a.split("=", 1) for a in argv if "=" in a)
POS = [a for a in argv if "=" not in a]
OUT = POS[0] if POS else "specimen.glb"
PREVIEW = POS[1] if len(POS) > 1 else None
PREVIEW_JAW = float(POS[2]) if len(POS) > 2 else 0.0
PREVIEW_SHOW = set((POS[3] if len(POS) > 3 else "").split(","))
KIND = OPTS.get("kind", "ogre")
FAST = OPTS.get("fast") == "1"

P = SimpleNamespace(**{**BASE, **KINDS[KIND]})
P.detail = {**BASE["detail"], **KINDS[KIND].get("detail", {})}
P.pivot = Vector(P.pivot)
P.jaw = math.radians(P.jaw_angle)
P.extra_detail = KINDS[KIND].get("extra_detail")
P.extras = KINDS[KIND].get("extras")

VOXEL = 0.0068          # sculpt resolution for the skin detail
GAME_FACES = 15000      # head budget in triangles (before the mouth bag)
TEX = 1024 if FAST else 2048
TEX_DETAIL = 1024
PREVIEW_TINT = dict(ogre=(0.09, 0.36, 0.16), demon=(0.5, 0.06, 0.08), alien=(0.5, 0.56, 0.56), robot=(0.62, 0.64, 0.7), beast=(0.32, 0.2, 0.11), skull=(0.86, 0.82, 0.72), pumpkin=(0.92, 0.36, 0.05), frank=(0.42, 0.55, 0.38))


def mouth_line(x):
    return P.mouth_z + P.smile * x * x


def lens_y(x):
    return P.lens_y0 + P.wrap * x * x


def teeth_y(x):
    return P.teeth_y0 + P.wrap * x * x


def lip_curl(x):
    """The upper lip lifts over each canine (a snarl in the resting face)."""
    return P.curl * math.exp(-(((abs(x) - P.fang_x) / 0.08) ** 2))


def jag(x, upper):
    """A carved jack-o'-lantern grin: two square teeth hang from the top, one rises below."""
    if not P.jag:
        return 0.0
    bump = lambda t, w: math.exp(-((t / w) ** 6))
    return 0.08 * bump(abs(x) - 0.2, 0.06) if upper else 0.07 * bump(x, 0.07)


# ---------------------------------------------------------------------------- the base form

def base_form():
    head = join(P.parts(P), "Head")
    apply_mod(head, "REMESH", mode="VOXEL", voxel_size=0.016)
    # morphological closing (dilate, re-voxelise, erode): soft fillets between the forms
    apply_mod(head, "DISPLACE", direction="NORMAL", strength=P.fillet, mid_level=0.0)
    apply_mod(head, "REMESH", mode="VOXEL", voxel_size=0.016)
    apply_mod(head, "SMOOTH", factor=0.6, iterations=max(1, P.smooth // 2))
    apply_mod(head, "DISPLACE", direction="NORMAL", strength=-P.fillet, mid_level=0.0)
    apply_mod(head, "REMESH", mode="VOXEL", voxel_size=0.016)
    apply_mod(head, "SMOOTH", factor=0.8, iterations=P.smooth)
    bpy.ops.mesh.primitive_cube_add(size=6, location=(0, 0, -2.92))
    boolean(head, bpy.context.active_object)
    apply_mod(head, "REMESH", mode="VOXEL", voxel_size=VOXEL)
    return head


# ---------------------------------------------------------------------------- skin detail

def eye_frame(px, pz, s):
    """Eye-local coordinates: u along the slanted almond (outward), v across it (up)."""
    c, sn = math.cos(P.eye_tilt), math.sin(P.eye_tilt)
    dx, dz = (px - P.eye_x * s) * s, pz - P.eye_z
    return dx * c + dz * sn, -dx * sn + dz * c


def detail(Pa):
    """Displacement along the normal (sculpt + skin) and a cavity amount, from positions."""
    W = P.detail
    x, y, z = Pa[:, 0], Pa[:, 1], Pa[:, 2]
    ax = np.abs(x)
    front = sstep(-0.25, -0.6, y)
    d = np.zeros(len(Pa))
    cav = np.zeros(len(Pa))

    def groove(dist, w, depth, mask):
        g = np.exp(-(dist / w) ** 2) * mask
        d[:] -= depth * g
        cav[:] += g * np.minimum(1.0, depth / 0.008)

    if W["hollows"]:
        d -= W["hollows"] * 0.035 * np.exp(-(((ax - 0.48) / 0.14) ** 2 + ((z - 0.8) / 0.1) ** 2)) * front
        d -= W["hollows"] * 0.03 * np.exp(-(((ax - 0.66) / 0.12) ** 2 + ((z - 1.32) / 0.14) ** 2 + ((y + 0.25) / 0.25) ** 2))
    if W["lumps"]:
        d += W["lumps"] * 0.012 * fbm(Pa * 3.2, 3, 1)
    if W["forehead"]:
        fm = sstep(0.5, 0.26, ax) * front * sstep(1.44, 1.5, z) * sstep(1.86, 1.76, z) * W["forehead"]
        for k in range(4):
            zk = 1.5 + 0.068 * k + 0.16 * x * x + 0.012 * vnoise(np.c_[x * 6, np.full_like(x, k), z * 0], 3)
            brk = np.clip(0.55 + 0.6 * vnoise(np.c_[x * 7 + k * 3.1, z * 0, z * 0], 5), 0, 1)
            groove(z - zk, 0.011, 0.011 * (1 - 0.12 * k), fm * brk)
    if W["frown"]:
        gm = sstep(-0.62, -0.8, y) * sstep(1.17, 1.22, z) * sstep(1.46, 1.38, z) * W["frown"]
        for s in (-1, 1):
            groove(x - s * (0.045 + 0.05 * (z - 1.2)), 0.011, 0.016, gm)
        groove(z - 1.155 - 0.4 * x * x, 0.01, 0.008, sstep(0.16, 0.08, ax) * sstep(-0.85, -0.95, y) * W["frown"])
    for s in (-1, 1):
        u, v = eye_frame(x, z, s)
        side = front * sstep(0.0, 0.15, x * s)
        a, b = P.eye_a, P.eye_b
        if W["lids"]:
            e_up = np.sqrt((u / (a + 0.06)) ** 2 + (v / (b + 0.065)) ** 2)
            groove((e_up - 1) * (b + 0.065), 0.011, 0.014 * W["lids"], side * sstep(-0.02, 0.03, v))
            d += 0.01 * W["lids"] * sstep(1.0, 0.75, e_up) * side * sstep(0.0, 0.05, v)
            for bb, depth in ((b + 0.09, 0.011), (b + 0.14, 0.007)):
                e_lo = np.sqrt((u / (a + 0.06 + bb * 0.3)) ** 2 + (v / bb) ** 2)
                groove((e_lo - 1) * bb, 0.012, depth * W["lids"], side * sstep(0.02, -0.04, v))
        if W["crow"]:
            for ang in (-0.45, -0.1, 0.25):
                ux, vz = math.cos(ang), math.sin(ang)
                dist, t = seg_dist(u, v, a + 0.05, 0.0, a + 0.05 + 0.13 * ux, 0.13 * vz)
                groove(dist, 0.008, 0.007 * (1 - t * 0.7) * W["crow"], side * sstep(a + 0.02, a + 0.06, u))
        if W["naso"]:
            pts = [(0.15 * s, P.nose_z - 0.01), (0.27 * s, P.nose_z - 0.09), (0.4 * s, P.nose_z - 0.21), (0.5 * s, P.mouth_z - 0.04)]
            groove(poly_dist(x, z, pts), 0.02, 0.02 * W["naso"], front)
            mc = P.lens[0] - 0.01
            groove(poly_dist(x, z, [(mc * s, mouth_line(mc) + 0.02), ((mc + 0.07) * s, mouth_line(mc) - 0.1)]), 0.012, 0.01 * W["naso"], front)
    if W["lips"]:
        lm = sstep(P.lens[0] - 0.02, P.lens[0] - 0.1, ax) * sstep(P.lip_y + 0.24, P.lip_y + 0.18, y) * np.exp(-(((z - (P.mouth_z + P.smile * x * x)) / 0.07) ** 2)) * W["lips"]
        d -= 0.0028 * (0.5 + 0.5 * np.cos(x * 150)) * lm
        cav += 0.4 * (0.5 + 0.5 * np.cos(x * 150)) * lm
    if W["neck"]:
        nm = sstep(0.36, 0.15, ax) * sstep(-0.15, -0.35, y) * W["neck"]
        for zk in (0.3, 0.41):
            groove(z - zk - 0.12 * x * x, 0.012, 0.01, nm)
    sm = np.clip(sstep(1.62, 1.9, z) + sstep(0.05, 0.45, y) * sstep(0.3, 0.7, z), 0, 1) * sstep(-0.78, -0.45, y)
    if W["scales"]:
        f1, f2, _ = voronoi(Pa / 0.075, 11)
        border = f2 - f1
        crack = np.exp(-(border / 0.07) ** 2)
        d -= 0.01 * crack * sm * W["scales"]
        d += 0.006 * sstep(0.0, 0.5, border) * sm * W["scales"]
        cav += 0.9 * crack * sm * W["scales"]
    if W["warts"]:
        w1, _, wid = voronoi(Pa / 0.12, 23)
        d += W["warts"] * 0.012 * sstep(0.28, 0.0, w1) * (wid > 0.72) * front * (1 - sm * W["scales"])
    if W["veins"]:
        vm = np.clip(sstep(0.48, 0.62, ax) * sstep(1.0, 1.15, z) * sstep(1.7, 1.5, z) + sstep(0.25, 0.4, ax) * sstep(0.2, 0.35, z) * sstep(0.85, 0.6, z), 0, 1)
        if KIND == "alien":
            vm = np.clip(vm + sstep(1.5, 1.9, z), 0, 1)
        ridge = 1 - np.abs(vnoise(Pa * 5.5, 31))
        d += W["veins"] * 0.0045 * sstep(0.9, 0.985, ridge) * vm
    if P.extra_detail:
        P.extra_detail(P, x, y, z, d, cav, groove)
    if W["grain"]:
        d += W["grain"] * 0.0016 * fbm(Pa * 48, 2, 41)
    return d, np.clip(cav, 0, 1)


def sculpt_detail(head):
    co, no = verts(head)
    d, _ = detail(co)
    set_verts(head, co + no * d[:, None])


# ---------------------------------------------------------------------------- openings

def surface_y(bvh, x, z):
    hit = bvh.ray_cast(Vector((x, -4, z)), Vector((0, 1, 0)))
    return hit[0].y if hit[0] else -0.8


def surface_hit(bvh, origin, toward):
    o, t = Vector(origin), Vector(toward)
    hit = bvh.ray_cast(o, (t - o).normalized())
    return (hit[0], hit[1]) if hit[0] else (t, (o - t).normalized())


def prism(name, pts, y0, y1):
    """A prism through y0..y1 over a polygon in the (x, z) plane."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in pts]
    b = [bm.verts.new((x, y1, z)) for x, z in pts]
    n = len(pts)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return o


def triangle(cx, cz, size, tilt):
    c, s = math.cos(tilt), math.sin(tilt)
    pts = [(0, size), (-size * 0.95, -size * 0.55), (size * 0.95, -size * 0.55)]
    return [(cx + px * c + pz * s, cz - px * s + pz * c) for px, pz in pts]


def cut_openings(head, bvh):
    eyes = []
    for s in (-1, 1):
        sy = surface_y(bvh, P.eye_x * s, P.eye_z)
        c = Vector((P.eye_x * s, sy + P.eye_r * P.eye_depth, P.eye_z))
        eyes.append(c)
        if P.eye_cut == "triangle":
            boolean(head, prism("eyeCut", triangle(c.x, c.z, P.eye_a, -P.eye_tilt * s), sy - 0.4, sy + 0.32))
        else:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1)
            a = bpy.context.active_object
            if P.eye_cut == "socket":
                a.scale = (P.eye_a, 0.45, P.eye_b)
                a.location = (c.x, sy + 0.1, c.z)
            else:
                a.scale = (P.eye_a, 0.32, P.eye_b)
                a.location = (c.x, c.y - 0.22, c.z + 0.01)
            a.rotation_euler = (0, P.eye_tilt * s, 0)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            boolean(head, a)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=P.eye_r + 0.008, location=c)
        boolean(head, bpy.context.active_object)
    # the mouth: a thin, wrap-around lens (curled over the canines, or carved in a jagged grin)
    sx, sy_, sz = P.lens
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1)
    cu = bpy.context.active_object
    cu.scale = (sx, sy_, sz)
    bpy.ops.object.transform_apply(scale=True)
    for v in cu.data.vertices:
        x = v.co.x
        k = abs(v.co.z / sz) ** 0.5
        if v.co.z > 0:
            v.co.z += lip_curl(x) * k - jag(x, True) * k
        else:
            v.co.z += jag(x, False) * k
        v.co.z += P.smile * x * x
        v.co.y += P.wrap * x * x
    cu.location = (0, P.lens_y0, P.mouth_z)
    bpy.ops.object.transform_apply(location=True)
    boolean(head, cu)
    # nostrils (or a carved / bony nose hole)
    for n in P.nostrils:
        for s in ((0,) if n["x"] == 0 else (-1, 1)):
            x = n["x"] * (s or 1)
            p, _ = surface_hit(bvh, (x, -3.0, n["z"]), (x, 0.0, n["z"]))
            if "tri" in n:
                boolean(head, prism("noseCut", triangle(x, n["z"], n["tri"], 0.0), p.y - 0.3, p.y + 0.25))
                continue
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1)
            o = bpy.context.active_object
            o.scale = n["scale"]
            rx, ry, rz = n["rot"]
            o.rotation_euler = (rx, ry * (s if n.get("mirror_rot") else 1), rz * s)
            o.location = (p.x, p.y + n["inset"], p.z - 0.005)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            boolean(head, o)
    return eyes


def mouth_weight(co):
    """Is this point inside the mouth cavity (the faces the lens cut)?"""
    x, y, z = co
    sx, sy, sz = P.lens
    curl = lip_curl(x)
    zl = mouth_line(x) + 0.5 * curl
    return ((x / (sx + 0.02)) ** 2 + ((y - lens_y(x)) / sy) ** 2 + ((z - zl) / (sz + 0.005 + 0.5 * curl + jag(x, True))) ** 2) < 1.0


# ---------------------------------------------------------------------------- colour + bake

def skin_colours(hi):
    """Neutral detail colours on the sculpt (the app tints them): occlusion, cavities, mottling,
    a paler underside, a warm flush around the eyes, nose and lips."""
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = 24 if FAST else 40
    me = hi.data
    ao = me.color_attributes.new("AO", "FLOAT_COLOR", "POINT")
    me.color_attributes.active_color = ao
    activate(hi)
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    n = len(me.vertices)
    a = np.empty(n * 4)
    ao.data.foreach_get("color", a)
    occ = a.reshape(-1, 4)[:, 0]
    me.color_attributes.remove(ao)
    co, _ = verts(hi)
    _, cav = detail(co)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    front = sstep(-0.25, -0.6, y)
    under = sstep(-0.2, -0.85, y) * sstep(1.0, 0.4, z) * 0.16
    top = sstep(1.45, 2.1, z) * 0.2 + sstep(0.15, 0.7, y) * 0.1
    mott = 0.1 * fbm(co * 4.5, 3, 7) + 0.05 * fbm(co * 14, 2, 9)
    if KIND == "robot":
        under, top, mott = under * 0.3, top * 0.4, mott * 0.25
    lum = (0.78 + under - top + mott) * (0.38 + 0.62 * occ ** 1.5) * (1 - 0.55 * cav)
    for c, r, amt in P.dark:
        lum *= 1 - amt * np.exp(-(((x - c[0]) / r[0]) ** 2 + ((y - c[1]) / r[1]) ** 2 + ((z - c[2]) / r[2]) ** 2))
    flush = np.zeros(n)
    if KIND not in ("robot", "skull", "pumpkin"):
        for s in (-1, 1):
            u, v = eye_frame(x, z, s)
            flush += np.exp(-((u / 0.3) ** 2 + (v / 0.2) ** 2)) * front
        flush += np.exp(-((x / 0.22) ** 2 + ((z - P.nose_z + 0.03) / 0.1) ** 2)) * front
        flush += np.exp(-((x / 0.45) ** 2 + ((z - (P.mouth_z + P.smile * x * x)) / 0.08) ** 2)) * front
    flush = np.clip(flush, 0, 1) * 0.35
    r_ = lum * (1 + 0.25 * flush)
    g_ = lum * (1 - 0.12 * flush)
    b_ = lum * (1 - 0.1 * flush)
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    col.data.foreach_set("color", np.c_[r_, g_, b_, np.ones(n)].clip(0, 1).ravel())
    me.color_attributes.active_color = col
    m = bpy.data.materials.new("HiCol")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_name = "Col"
    em = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(at.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    me.materials.clear()
    me.materials.append(m)


def game_mesh(hi):
    lo = hi.copy()
    lo.data = hi.data.copy()
    lo.name = "Head"
    bpy.context.collection.objects.link(lo)
    tris = sum(len(p.vertices) - 2 for p in lo.data.polygons)
    apply_mod(lo, "DECIMATE", decimate_type="COLLAPSE", ratio=GAME_FACES / tris)
    for name in [c.name for c in lo.data.color_attributes]:
        lo.data.color_attributes.remove(lo.data.color_attributes[name])
    activate(lo)
    bpy.ops.object.shade_smooth()
    # UVs: chart on a heavily smoothed proxy (smooth normals give a few large islands instead of
    # thousands of slivers), carry its seams over and unwrap the real surface along them
    proxy = lo.copy()
    proxy.data = lo.data.copy()
    bpy.context.collection.objects.link(proxy)
    apply_mod(proxy, "SMOOTH", factor=1.0, iterations=80)
    activate(proxy)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    bm = bmesh.new()
    bm.from_mesh(proxy.data)
    uvl = bm.loops.layers.uv.active
    seams = np.zeros(len(bm.edges), dtype=bool)
    bm.edges.index_update()
    for e in bm.edges:
        if len(e.link_loops) != 2:
            continue
        l1, l2 = e.link_loops
        a1, b1 = l1[uvl].uv, l1.link_loop_next[uvl].uv
        a2, b2 = l2.link_loop_next[uvl].uv, l2[uvl].uv
        seams[e.index] = (a1 - a2).length > 1e-5 or (b1 - b2).length > 1e-5
    bm.free()
    bpy.data.objects.remove(proxy, do_unlink=True)
    lo.data.edges.foreach_set("use_seam", seams)
    activate(lo)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.unwrap(method="CONFORMAL", margin=0.004)
    bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    print(f"uv seams: {int(seams.sum())} edges")
    return lo


def bake_maps(hi, lo):
    scn = bpy.context.scene
    scn.cycles.samples = 4
    img_n = bpy.data.images.new("SkinNormal", TEX, TEX, alpha=False)
    img_n.colorspace_settings.name = "Non-Color"
    img_c = bpy.data.images.new("SkinDetail", TEX_DETAIL, TEX_DETAIL, alpha=False)
    m = bpy.data.materials.new("BakeTarget")
    m.use_nodes = True
    tex = m.node_tree.nodes.new("ShaderNodeTexImage")
    m.node_tree.nodes.active = tex
    lo.data.materials.clear()
    lo.data.materials.append(m)
    bpy.ops.object.select_all(action="DESELECT")
    hi.select_set(True)
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    kw = dict(use_selected_to_active=True, cage_extrusion=0.03, max_ray_distance=0.08, margin=16)
    tex.image = img_n
    bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", **kw)
    tex.image = img_c
    bpy.ops.object.bake(type="EMIT", **kw)
    for img in (img_n, img_c):
        img.file_format = "PNG"
        if PREVIEW:
            img.filepath_raw = os.path.join(os.path.dirname(os.path.abspath(PREVIEW)), f"{KIND}_{img.name}.png")
            img.save()
        img.pack()
    skin = bpy.data.materials.new("Skin")
    skin.use_nodes = True
    nt = skin.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["Coat Weight"].default_value = 0.1
    tc = nt.nodes.new("ShaderNodeTexImage")
    tc.image = img_c
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = img_n
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tc.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    lo.data.materials.clear()
    lo.data.materials.append(skin)
    bpy.data.materials.remove(m)
    return skin


# ---------------------------------------------------------------------------- shape keys

def hinge_weight(co):
    x, y, z = co
    w_z = smooth01(mouth_line(x) + 0.012, mouth_line(x) - 0.09, z)
    w_y = smooth01(0.3, -0.25, y)
    w_low = smooth01(-0.05, 0.32, z)
    w_x = smooth01(0.95, 0.62, abs(x))
    return w_z * w_y * w_low * w_x


def hinge(co, w):
    r = Matrix.Rotation(P.jaw * w, 4, "X")
    return P.pivot + (r @ (co - P.pivot))


def add_shape_keys(o):
    o.shape_key_add(name="Basis")
    base = [v.co.copy() for v in o.data.vertices]

    def key(name, fn):
        k = o.shape_key_add(name=name, from_mix=False)
        for i, co in enumerate(base):
            k.data[i].co = fn(co)

    key("jawOpen", lambda co: hinge(co, hinge_weight(co)))
    cx = P.lens[0] * 0.95
    cy, cz = lens_y(cx), mouth_line(cx)

    def wide(co):
        x, y, z = co
        w = math.exp(-(((abs(x) - cx) ** 2) / 0.03 + ((y - cy) ** 2) / 0.06 + ((z - cz) ** 2) / 0.03))
        return co + Vector((math.copysign(0.07, x) * w, 0.03 * w, 0.035 * w))

    key("mouthWide", wide)

    def round_(co):
        x, y, z = co
        front = smooth01(P.lip_y + 0.55, P.lip_y + 0.2, y)
        w = math.exp(-((x * x) / (0.32 * P.lens[0]) + ((z - P.mouth_z) ** 2) / 0.035)) * front
        return co + Vector((-x * 0.38 * w, -0.1 * w, (P.mouth_z - z) * 0.25 * w))

    key("mouthRound", round_)

    def snarl(co):
        x, y, z = co
        front = smooth01(P.lip_y + 0.5, P.lip_y + 0.15, y)
        lip = math.exp(-(((abs(x) - P.fang_x) ** 2) / 0.03 + ((z - (mouth_line(x) + 0.075)) ** 2) / 0.005)) * front
        nose = math.exp(-((x * x) / 0.05 + ((z - P.nose_z) ** 2) / 0.02)) * front
        return co + Vector((0, 0.02 * nose, 0.06 * lip + 0.03 * nose))

    key("snarl", snarl)

    def brow(co):
        x, y, z = co
        front = smooth01(P.front_y + 0.45, P.front_y + 0.1, y)
        w = math.exp(-(((abs(x) - 0.26) ** 2) / 0.04 + ((z - P.brow_z) ** 2) / 0.012)) * front
        inner = smooth01(0.55, 0.1, abs(x))
        return co + Vector((-math.copysign(0.02, x) * w, -0.02 * w, -0.06 * w * (0.4 + 0.6 * inner)))

    key("browDown", brow)


# ---------------------------------------------------------------------------- parts

def eyeball(name, center, mats):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=56, ring_count=40, radius=P.eye_r, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    for m in mats:
        o.data.materials.append(m)
    fwd = Vector((math.copysign(0.16, center.x), -1, 0.13)).normalized()
    side_ax = fwd.cross(Vector((0, 0, 1))).normalized()
    for p in o.data.polygons:
        nrm = p.normal
        d = nrm.dot(fwd)
        across = abs(nrm.dot(side_ax))
        if P.eye_style == "black":
            idx = 2
        elif P.eye_style == "glow":
            idx = 1
        elif P.eye_style == "lens":
            idx = 2 if d > 0.93 else 1 if d > 0.35 else 0
        elif P.eye_style == "round":
            idx = 2 if d > 0.9 else 1 if d > 0.62 else 0
        else:
            slit = across < 0.1 * max(0.0, (d - 0.66) / 0.34) ** 0.5 and d > 0.68
            idx = 2 if slit else 1 if d > 0.28 else 0
        p.material_index = idx
    bpy.ops.object.shade_smooth()
    # almond-shaped eyeballs (alien): squash the sphere and slant it with the lids
    sx, sy, sz = P.eye_shape
    if (sx, sy, sz) != (1, 1, 1):
        s = 1 if center.x > 0 else -1
        m = Matrix.Rotation(P.eye_tilt * s, 4, "Y") @ Matrix.Diagonal((sx, sy, sz, 1))
        o.data.transform(m)
    o.location = center
    return o


def mouth_bag():
    """A smooth inner mouth behind the lips (normals inward)."""
    (cx, cy, dz), scl, cut = P.bag
    o = ell("MouthBag", (cx, cy, P.mouth_z + dz), scl, seg=40, rings=24)
    for v in o.data.vertices:
        v.co.z += P.smile * 0.6 * v.co.x ** 2
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().y < cut], context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    activate(o)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.flip_normals()
    bpy.ops.object.mode_set(mode="OBJECT")
    return o


def tooth(x, z_root, y, length, radius, down, curve=0.0, tip=0.004, sides=14, flat=0.72):
    """A curved, slightly flattened cone from the gum line."""
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius, radius2=tip, depth=length, end_fill_type="NGON")
    t = bpy.context.active_object
    for v in t.data.vertices:
        k = (v.co.z + length / 2) / length    # 0 root … 1 tip
        v.co.y = v.co.y * flat + curve * k * k
    t.rotation_euler = (math.pi if down else 0, 0, 0)
    t.location = (x, y, z_root + (-length / 2 if down else length / 2))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return t


def row(n, half, z_off, y_off, h, r, down, **kw):
    out = []
    for i in range(n):
        u = (i / (n - 1)) * 2 - 1
        x = u * half
        out.append(tooth(x, mouth_line(x) + z_off + (lip_curl(x) if down else 0), teeth_y(x) + y_off, h(u) if callable(h) else h, r(u) if callable(r) else r, down, **kw))
    return out


def teeth(mat):
    style = P.teeth
    lower, upper = [], []
    if style == "fangs":
        n = 12
        for i in range(n):
            u = (i / (n - 1)) * 2 - 1
            x = u * 0.34
            fang = abs(abs(u) - 0.8) < 0.1
            lower.append(tooth(x, mouth_line(x) - 0.03, teeth_y(x), 0.09 if fang else 0.045 + 0.01 * (1 - abs(u)), 0.03 if fang else 0.022, False, curve=-0.015 if fang else 0.0))
        for i in range(8):
            u = (i / 7) * 2 - 1
            x = u * 0.36
            if abs(abs(x) - P.fang_x) < 0.035:
                continue
            upper.append(tooth(x, mouth_line(x) + 0.035 + lip_curl(x), teeth_y(x), 0.06, 0.023, True))
        for s in (-1, 1):
            x = P.fang_x * s
            upper.append(tooth(x, mouth_line(x) + 0.03 + lip_curl(x), teeth_y(x) - 0.075, 0.17, 0.034, True, curve=0.13))
    elif style == "grin":
        lower = row(16, 0.4, -0.026, 0.0, 0.05, 0.018, False)
        upper = row(16, 0.42, 0.028, 0.0, lambda u: 0.055 + 0.02 * (1 - abs(u)), 0.019, True)
        for s in (-1, 1):
            x = P.fang_x * s
            upper.append(tooth(x, mouth_line(x) + 0.03 + lip_curl(x), teeth_y(x) - 0.04, 0.13, 0.03, True, curve=0.05))
    elif style == "canines":
        lower = row(12, 0.2, -0.026, 0.02, 0.045, 0.02, False)
        upper = row(12, 0.22, 0.028, 0.02, 0.05, 0.021, True)
        for s in (-1, 1):
            x = P.fang_x * s
            upper.append(tooth(x, mouth_line(x) + 0.03, teeth_y(x) - 0.03, 0.17, 0.035, True, curve=0.05))
            x = (P.fang_x + 0.04) * s
            lower.append(tooth(x, mouth_line(x) - 0.03, teeth_y(x) - 0.02, 0.12, 0.03, False, curve=-0.03))
    elif style == "blocks":
        lower = row(10, 0.27, -0.06, 0.0, 0.085, 0.032, False, tip=0.026, sides=6, flat=0.8)
        upper = row(10, 0.29, 0.065, 0.0, 0.09, 0.034, True, tip=0.028, sides=6, flat=0.8)
    elif style == "flat":
        lower = row(8, 0.2, -0.022, 0.01, 0.04, 0.024, False, tip=0.02, sides=8, flat=0.6)
        upper = row(8, 0.22, 0.024, 0.0, 0.045, 0.026, True, tip=0.022, sides=8, flat=0.6)
    elif style == "grill":
        lower = row(9, 0.24, -0.03, 0.02, 0.05, 0.012, False, tip=0.012, sides=8, flat=1.0)
        upper = row(9, 0.24, 0.03, 0.02, 0.05, 0.012, True, tip=0.012, sides=8, flat=1.0)
    else:
        return None
    for t in lower:
        vg = t.vertex_groups.new(name="lower")
        vg.add(list(range(len(t.data.vertices))), 1.0, "REPLACE")
    o = join(lower + upper, "Teeth")
    o.data.materials.clear()
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    o.shape_key_add(name="Basis")
    k = o.shape_key_add(name="jawOpen", from_mix=False)
    gi = o.vertex_groups["lower"].index if "lower" in o.vertex_groups else -1
    for i, v in enumerate(o.data.vertices):
        w = 1.0 if any(g.group == gi for g in v.groups) else 0.0
        k.data[i].co = hinge(v.co, w)
    o.vertex_groups.clear()
    return o


def tongue(mat):
    if not P.tongue:
        return None
    (cx, cy, dz), scl = P.tongue
    o = ell("Tongue", (cx, cy, P.mouth_z + dz), scl)
    for v in o.data.vertices:
        if v.co.z > P.mouth_z + dz:
            v.co.z -= 0.012 * math.exp(-(v.co.x ** 2) / 0.004)
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def horns(mat, bvh):
    parts = []
    for s in (-1, 1):
        p, _ = surface_hit(bvh, (0.42 * s, -0.5, 3.0), (0.3 * s, -0.2, 1.6))
        p = p + Vector((0, 0.02, -0.06))
        ctrl = [tuple(p), tuple(p + Vector((0.24 * s, -0.22, 0.62))), tuple(p + Vector((0.95 * s, 0.14, 0.94))), tuple(p + Vector((1.06 * s, 0.7, 0.5)))]
        o = sweep("horn", ctrl, 0.19, ridges=0.08)
        paint_along(o, (0.09, 0.055, 0.045), (0.88, 0.8, 0.64), ctrl[0], ctrl[3])
        parts.append(o)
    o = join(parts, "Horns")
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def tusks(mat, bvh):
    parts = []
    for s in (-1, 1):
        cx = P.lens[0] * 0.8 * s
        p, _ = surface_hit(bvh, (cx, -3.0, P.mouth_z - 0.12), (cx, 0.0, P.mouth_z - 0.12))
        p = p + Vector((0, 0.05, 0))
        ctrl = [tuple(p), tuple(p + Vector((0.03 * s, -0.11, 0.11))), tuple(p + Vector((0.09 * s, -0.14, 0.24))), tuple(p + Vector((0.14 * s, -0.08, 0.31)))]
        parts.append(sweep("tusk", ctrl, 0.05, segs=24, ring=12, power=0.9))
    o = join(parts, "Tusks")
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def antennae(stalk_mat, bulb_mat, bvh):
    parts = []
    for s in (-1, 1):
        p, _ = surface_hit(bvh, (0.25 * s, -0.2, 3.5), (0.2 * s, -0.1, 1.6))
        p = p + Vector((0, 0, -0.04))
        pts = [tuple(p), tuple(p + Vector((0.14 * s, -0.13, 0.55))), tuple(p + Vector((0.36 * s, -0.43, 0.9))), tuple(p + Vector((0.5 * s, -0.66, 0.95)))]
        st = curve_tube("stalk", pts, 0.032, [1.2, 0.9, 0.7, 0.6], 16)
        st.data.materials.append(stalk_mat)
        b = ell("bulb", pts[3], (0.12, 0.12, 0.12), seg=24, rings=16)
        b.data.materials.append(bulb_mat)
        parts += [st, b]
    o = join(parts, "Antennae")
    bpy.ops.object.shade_smooth()
    return o


def visor(metal, glow, bvh):
    sy = surface_y(bvh, 0.0, P.eye_z)
    r = max(0.9, -sy + 0.08)
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=r, depth=0.28, location=(0, -0.1, P.eye_z))
    band = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(band.data)
    gone = [f for f in bm.faces if f.calc_center_median().y > -0.1 - 0.35 * r or abs(f.normal.z) > 0.9]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bm.to_mesh(band.data)
    bm.free()
    apply_mod(band, "SOLIDIFY", thickness=0.05, offset=1)
    band.data.materials.append(metal)
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=r + 0.035, depth=0.06, location=(0, -0.1, P.eye_z))
    strip = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(strip.data)
    gone = [f for f in bm.faces if f.calc_center_median().y > -0.1 - 0.55 * r or abs(f.normal.z) > 0.9]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bm.to_mesh(strip.data)
    bm.free()
    strip.data.materials.append(glow)
    parts = [band, strip]
    for s in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.1, depth=0.5, location=(0.5 * s, 0.05, 0.3), rotation=(0, math.pi / 2, 0))
        b = bpy.context.active_object
        b.data.materials.append(metal)
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.16, depth=0.1, location=(0.76 * s, 0.05, 0.3), rotation=(0, math.pi / 2, 0))
        nut = bpy.context.active_object
        nut.data.materials.append(metal)
        parts += [b, nut]
    o = join(parts, "Visor")
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    return o


def animal_ears(fur, inner, bvh):
    parts = []
    for s in (-1, 1):
        p, _ = surface_hit(bvh, (0.85 * s, 0.2, 3.5), (0.4 * s, 0.15, 1.5))
        base = p + Vector((0, 0, 0.38))
        outer = leaf("ear", (0.32, 0.11, 0.5), fur)
        orient(outer, base, (0.45 * s, 0.1, 1), (0.3 * s, -1, 0))
        inn = leaf("earIn", (0.2, 0.05, 0.38), inner)
        orient(inn, base + Vector((0, -0.07, -0.02)), (0.45 * s, 0.1, 1), (0.3 * s, -1, 0))
        parts += [outer, inn]
    o = join(parts, "AnimalEars")
    bpy.ops.object.shade_smooth()
    return o


def collar(metal, glow):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.54, minor_radius=0.07, major_segments=72, minor_segments=16, location=(0, 0.1, 0.34))
    ring = bpy.context.active_object
    ring.data.materials.append(metal)
    parts = [ring]
    for i in range(8):
        a = math.pi * (0.25 + 0.5 * i / 7) + math.pi
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.045, location=(0.54 * math.cos(a), 0.1 + 0.54 * math.sin(a), 0.34))
        led = bpy.context.active_object
        led.data.materials.append(glow)
        parts.append(led)
    o = join(parts, "Collar")
    bpy.ops.object.shade_smooth()
    return o


# ---------------------------------------------------------------------------- preview render

def preview(path, objects, jaw):
    scn = bpy.context.scene
    head = bpy.data.objects["Head"]
    head.data.shape_keys.key_blocks["jawOpen"].value = jaw
    if "Teeth" in bpy.data.objects:
        bpy.data.objects["Teeth"].data.shape_keys.key_blocks["jawOpen"].value = jaw
    for o in objects:
        if o.name in ("Horns", "Tusks", "Antennae", "Visor", "AnimalEars", "Collar"):
            o.hide_render = o.name not in PREVIEW_SHOW
    skin = bpy.data.materials["Skin"]
    nt = skin.node_tree
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and n.image.name == "SkinDetail")
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs[7].default_value = (*PREVIEW_TINT.get(KIND, (0.5, 0.5, 0.5)), 1)
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    nt.links.new(mix.outputs[2], nt.nodes["Principled BSDF"].inputs["Base Color"])
    if KIND == "robot":
        nt.nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.9
        nt.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.3
    world = bpy.data.worlds.new("w")
    scn.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.93, 0.92, 0.95, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0.0))
    bpy.context.active_object.data.materials.append(material("Floor", (0.9, 0.89, 0.92), rough=0.8))
    for name, loc, energy, size in (("key", (-3.5, -4.5, 5), 1800, 3), ("fill", (4.5, -3, 1.5), 450, 5), ("rim", (2, 4.5, 4), 1700, 2), ("rim2", (-3, 3.5, 2.5), 700, 2)):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = energy
        ld.size = size
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 1.2)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scn.collection.objects.link(lo)
    cam = bpy.data.cameras.new("cam")
    cam.lens = 62
    co = bpy.data.objects.new("cam", cam)
    scn.collection.objects.link(co)
    scn.camera = co
    scn.render.resolution_x = 540
    scn.render.resolution_y = 675
    scn.cycles.samples = 32 if FAST else 64
    scn.cycles.use_denoising = True
    scn.view_settings.view_transform = "AgX"
    scn.view_settings.look = "AgX - Medium High Contrast"
    for yaw, suffix in ((-0.5, ""), (0.0, "_front")):
        co.location = (8.3 * math.sin(yaw), -8.3 * math.cos(yaw), 1.9)
        co.rotation_euler = (Vector((0, 0, 1.25)) - co.location).to_track_quat("-Z", "Y").to_euler()
        scn.render.filepath = os.path.abspath(path).replace(".png", suffix + ".png")
        bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------------------- main

def main():
    clean()
    inside = material("MouthInside", P.inside, rough=0.35, coat=0.6, emit=P.inside if P.inside_glow else None, emit_strength=P.inside_glow)
    tooth_m = material("Teeth", (0.93, 0.88, 0.74) if KIND != "robot" else (0.7, 0.72, 0.76), rough=0.28, coat=0.5, metal=0.9 if KIND == "robot" else 0.0)
    sclera = material("Sclera", P.sclera, rough=0.15, coat=1.0)
    iris = material("Iris", P.iris, rough=0.2, emit=(1.0, 0.45, 0.0), emit_strength=0.6, coat=1.0)
    pupil = material("Pupil", (0.01, 0.01, 0.012), rough=0.08, coat=1.0)
    tongue_m = material("Tongue", (0.62, 0.12, 0.2), rough=0.4, subsurface=0.2)
    horn_m = gradient_material("Horn", rough=0.38, coat=0.45)
    metal = material("Metal", (0.8, 0.82, 0.86), rough=0.22, metal=1.0)
    glow = material("Glow", (0.2, 1.0, 0.6), rough=0.3, emit=(0.2, 1.0, 0.6), emit_strength=4)
    bulb = material("Bulb", (0.6, 0.3, 1.0), rough=0.2, emit=(0.6, 0.3, 1.0), emit_strength=5)
    fur = material("Fur", (0.45, 0.32, 0.22), rough=0.9)
    ear_in = material("EarInner", (0.95, 0.6, 0.62), rough=0.6, subsurface=0.2)

    hi = base_form()
    hi.name = "Sculpt"
    sculpt_detail(hi)
    print(f"{KIND} sculpt: {len(hi.data.polygons)} faces")
    bvh = BVHTree.FromObject(hi, bpy.context.evaluated_depsgraph_get())
    eyes = cut_openings(hi, bvh)
    activate(hi)
    bpy.ops.object.shade_smooth()
    skin_colours(hi)
    head = game_mesh(hi)
    bake_maps(hi, head)
    bpy.data.objects.remove(hi, do_unlink=True)
    head.data.materials.append(inside)
    for p in head.data.polygons:
        if mouth_weight(p.center):
            p.material_index = 1
    bag = mouth_bag()
    bag.data.materials.append(inside)
    head = join([head, bag], "Head")
    head.data.validate()
    activate(head)
    bpy.ops.object.shade_smooth()
    add_shape_keys(head)

    objs = [head, eyeball("EyeL", eyes[0], [sclera, iris, pupil]), eyeball("EyeR", eyes[1], [sclera, iris, pupil])]
    for part in (teeth(tooth_m), tongue(tongue_m)):
        if part:
            objs.append(part)
    if P.extras:
        objs.append(P.extras(P, bvh, dict(metal=metal, glow=glow)))
    objs += [horns(horn_m, bvh), tusks(tooth_m, bvh), antennae(metal, bulb, bvh), visor(metal, glow, bvh), animal_ears(fur, ear_in, bvh), collar(metal, glow)]
    head["pivot"] = [P.pivot.x, P.pivot.z, -P.pivot.y]   # glTF (Y up) coordinates
    head["jawAngle"] = P.jaw
    head["kind"] = KIND
    total = 0
    for o in objs:
        print(f"{o.name}: {len(o.data.polygons)} faces")
        total += len(o.data.polygons)
    print(f"total: {total} faces")

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_morph=True,
        export_morph_normal=True,
        export_vertex_color="ACTIVE",
        export_extras=True,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_image_quality=90,
        export_lights=False,
        export_cameras=False,
    )
    print("exported", OUT, f"{os.path.getsize(OUT) / 1e6:.2f} MB")
    if PREVIEW:
        preview(PREVIEW, objs, PREVIEW_JAW)
        print("preview", PREVIEW)


main()
