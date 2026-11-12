"""
Creature Voice Studio — procedural specimen model (Blender 4.5, headless).

Builds the app's 3D monster bust from primitives, sculpted by voxel remesh + smoothing + skin
noise, with a mouth that really opens (a hinge shape key), facial shape keys driven by the voice
engine's telemetry (jawOpen, mouthWide, mouthRound, snarl, browDown), separate eyes and tongue,
and DNA cosmetics (horns, tusks, antennae, visor + neck bolts, animal ears, collar). Bakes
ambient occlusion into vertex colours and exports one GLB for three.js.

Run:
  blender -b --factory-startup --python tools/blender/build_specimen.py -- public/models/specimen.glb [preview.png] [jaw]
"""
import bpy
import bmesh
import math
import sys
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "specimen.glb"
PREVIEW = argv[1] if len(argv) > 1 else None
PREVIEW_JAW = float(argv[2]) if len(argv) > 2 else 0.0

MOUTH_Z = 0.66          # centre height of the mouth line
SMILE = 0.42            # how much the mouth corners rise (z += SMILE * x^2)
PIVOT = Vector((0.0, 0.05, 0.86))   # jaw hinge (temporomandibular joint), axis = X
JAW_ANGLE = math.radians(30)
FILLET = 0.07           # crease fillet radius of the head sculpt


def smooth01(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def mouth_line(x):
    return MOUTH_Z + SMILE * x * x


def clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def activate(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def ell(name, loc, scl, rot=(0, 0, 0), seg=48, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = scl
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def apply_mod(o, kind, **kw):
    activate(o)
    m = o.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(m, k, v)
    bpy.ops.object.modifier_apply(modifier=m.name)
    return o


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def boolean(o, cutter, op="DIFFERENCE"):
    activate(o)
    m = o.modifiers.new("bool", "BOOLEAN")
    m.operation = op
    m.solver = "EXACT"
    m.object = cutter
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def material(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, coat=0.0, subsurface=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Subsurface Weight"].default_value = subsurface
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = emit_strength
    return m


def skin_material():
    m = material("Skin", (0.1, 0.32, 0.18), rough=0.48, coat=0.25, subsurface=0.1)
    nt = m.node_tree
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs[6].default_value = (0.1, 0.32, 0.18, 1)
    nt.links.new(ca.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], nt.nodes["Principled BSDF"].inputs["Base Color"])
    return m


def curve_tube(name, pts, radius, radii, resolution=24):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 6
    cu.resolution_u = resolution
    cu.use_fill_caps = True
    sp = cu.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for p, co, r in zip(sp.points, pts, radii):
        p.co = (*co, 1)
        p.radius = r
    sp.use_endpoint_u = True
    sp.order_u = 4
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    activate(o)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.active_object


# ---------------------------------------------------------------------------- the head and bust

def build_head():
    parts = [
        # cranium: tall and wide at the temples, a heavy brow shelf
        ell("cranium", (0, 0.12, 1.42), (0.92, 0.9, 0.84)),
        ell("crown", (0, 0.2, 1.86), (0.62, 0.66, 0.42)),
        ell("forehead", (0, -0.4, 1.5), (0.68, 0.48, 0.44)),
        ell("browL", (-0.34, -0.8, 1.36), (0.34, 0.17, 0.11), rot=(0.15, -0.42, 0)),
        ell("browR", (0.34, -0.8, 1.36), (0.34, 0.17, 0.11), rot=(0.15, 0.42, 0)),
        ell("templeL", (-0.72, -0.36, 1.24), (0.24, 0.3, 0.3)),
        ell("templeR", (0.72, -0.36, 1.24), (0.24, 0.3, 0.3)),
        # sockets: rims around the big eyes
        ell("lidL", (-0.36, -0.82, 1.1), (0.27, 0.12, 0.25)),
        ell("lidR", (0.36, -0.82, 1.1), (0.27, 0.12, 0.25)),
        # cheekbones and the snout
        ell("cheekL", (-0.6, -0.56, 0.93), (0.36, 0.34, 0.26), rot=(0, 0.3, 0)),
        ell("cheekR", (0.6, -0.56, 0.93), (0.36, 0.34, 0.26), rot=(0, -0.3, 0)),
        ell("snout", (0, -0.8, 0.86), (0.54, 0.38, 0.24)),
        ell("nose", (0, -1.08, 0.98), (0.2, 0.16, 0.13)),
        ell("noseBridge", (0, -0.98, 1.12), (0.11, 0.12, 0.14)),
        # lips around the mouth line
        ell("lipU", (0, -0.94, MOUTH_Z + 0.07), (0.5, 0.2, 0.07)),
        ell("lipL", (0, -0.9, MOUTH_Z - 0.08), (0.46, 0.2, 0.08)),
        # jaw: a broad, square, underbite chin
        ell("chin", (0, -0.72, 0.46), (0.5, 0.36, 0.22)),
        ell("jawL", (-0.48, -0.32, 0.56), (0.32, 0.46, 0.3), rot=(0, 0, -0.25)),
        ell("jawR", (0.48, -0.32, 0.56), (0.32, 0.46, 0.3), rot=(0, 0, 0.25)),
        # neck (the collar hides where it ends)
        ell("neck", (0, 0.12, 0.2), (0.46, 0.44, 0.5)),
        # pointed goblin ears
        ell("earL", (-0.98, 0.12, 1.3), (0.5, 0.075, 0.15), rot=(0.1, 0.62, 0.45)),
        ell("earR", (0.98, 0.12, 1.3), (0.5, 0.075, 0.15), rot=(0.1, -0.62, -0.45)),
    ]
    head = join(parts, "Head")
    apply_mod(head, "REMESH", mode="VOXEL", voxel_size=0.016)
    # morphological closing (dilate, re-voxelise, erode): fills the creases between the
    # primitives with soft fillets so the bust reads as one sculpted form, not stacked blobs,
    # while convex features (brow, nose, ears) keep their size
    apply_mod(head, "DISPLACE", direction="NORMAL", strength=FILLET, mid_level=0.0)
    apply_mod(head, "REMESH", mode="VOXEL", voxel_size=0.016)
    apply_mod(head, "SMOOTH", factor=0.6, iterations=3)
    apply_mod(head, "DISPLACE", direction="NORMAL", strength=-FILLET, mid_level=0.0)
    apply_mod(head, "REMESH", mode="VOXEL", voxel_size=0.016)
    apply_mod(head, "SMOOTH", factor=0.8, iterations=7)
    # skin: gentle lumps and fine pores
    tex = bpy.data.textures.new("lumps", "CLOUDS")
    tex.noise_scale = 0.22
    apply_mod(head, "DISPLACE", texture=tex, strength=0.018, mid_level=0.5)
    tex2 = bpy.data.textures.new("pores", "VORONOI")
    tex2.noise_scale = 0.045
    apply_mod(head, "DISPLACE", texture=tex2, strength=0.006, mid_level=0.5)
    apply_mod(head, "SMOOTH", factor=0.4, iterations=1)
    # end the neck cleanly
    bpy.ops.mesh.primitive_cube_add(size=6, location=(0, 0, -2.92))
    boolean(head, bpy.context.active_object)
    # nostrils
    for s in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.055, location=(0.075 * s, -1.2, 0.93))
        boolean(head, bpy.context.active_object)
    return head


def eye_positions(head):
    return [Vector((-0.36, -0.86, 1.1)), Vector((0.36, -0.86, 1.1))]


def cut_mouth_and_eyes(head, eyes):
    # the mouth: a thin, smiling, wrap-around lens
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1)
    c = bpy.context.active_object
    c.scale = (0.44, 0.6, 0.042)
    bpy.ops.object.transform_apply(scale=True)
    for v in c.data.vertices:
        x = v.co.x
        v.co.z += SMILE * x * x
        v.co.y += 1.1 * x * x
    c.location = (0, -1.02, MOUTH_Z)
    bpy.ops.object.transform_apply(location=True)
    boolean(head, c)
    for e in eyes:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=0.215, location=e)
        boolean(head, bpy.context.active_object)


def decimate(o, target_faces):
    n = len(o.data.polygons)
    if n > target_faces:
        apply_mod(o, "DECIMATE", decimate_type="COLLAPSE", ratio=target_faces / n)


def mouth_weight(co):
    """Is this point inside the mouth cavity (the faces the lens cut)?"""
    x, y, z = co
    zl = mouth_line(x)
    yl = -1.02 + 1.1 * x * x
    return ((x / 0.46) ** 2 + ((y - yl) / 0.62) ** 2 + ((z - zl) / 0.047) ** 2) < 1.0


def hinge_weight(co):
    x, y, z = co
    w_z = smooth01(mouth_line(x) + 0.012, mouth_line(x) - 0.09, z)
    w_y = smooth01(0.3, -0.25, y)
    w_low = smooth01(-0.05, 0.3, z)
    w_x = smooth01(0.95, 0.6, abs(x))
    return w_z * w_y * w_low * w_x


def hinge(co, w, angle=JAW_ANGLE):
    r = Matrix.Rotation(angle * w, 4, "X")
    return PIVOT + (r @ (co - PIVOT))


def add_shape_keys(o):
    o.shape_key_add(name="Basis")
    base = [v.co.copy() for v in o.data.vertices]

    def key(name, fn):
        k = o.shape_key_add(name=name, from_mix=False)
        for i, co in enumerate(base):
            k.data[i].co = fn(co)

    key("jawOpen", lambda co: hinge(co, hinge_weight(co)))

    def wide(co):
        x, y, z = co
        front = smooth01(-0.35, -0.75, y)
        w = math.exp(-(((abs(x) - 0.42) ** 2) / 0.035 + ((z - mouth_line(x)) ** 2) / 0.03)) * front
        return co + Vector((math.copysign(0.09, x) * w, 0.03 * w, 0.045 * w))

    key("mouthWide", wide)

    def round_(co):
        x, y, z = co
        front = smooth01(-0.55, -0.9, y)
        w = math.exp(-((x * x) / 0.14 + ((z - MOUTH_Z) ** 2) / 0.035)) * front
        return co + Vector((-x * 0.4 * w, -0.11 * w, (MOUTH_Z - z) * 0.25 * w))

    key("mouthRound", round_)

    def snarl(co):
        x, y, z = co
        front = smooth01(-0.6, -0.95, y)
        lip = math.exp(-((x * x) / 0.08 + ((z - (mouth_line(x) + 0.08)) ** 2) / 0.006)) * front
        nose = math.exp(-((x * x) / 0.05 + ((z - 0.98) ** 2) / 0.02)) * front
        return co + Vector((0, 0.02 * nose, 0.07 * lip + 0.035 * nose))

    key("snarl", snarl)

    def brow(co):
        x, y, z = co
        front = smooth01(-0.55, -0.9, y)
        w = math.exp(-(((abs(x) - 0.28) ** 2) / 0.04 + ((z - 1.3) ** 2) / 0.012)) * front
        inner = smooth01(0.55, 0.1, abs(x))
        return co + Vector((-math.copysign(0.025, x) * w, -0.02 * w, -0.075 * w * (0.4 + 0.6 * inner)))

    key("browDown", brow)


def colour(o, inside_index):
    """Vertex colours: a belly-light gradient with mottled patches (multiplied by AO later)."""
    me = o.data
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for i, v in enumerate(me.vertices):
        x, y, z = v.co
        belly = smooth01(-0.2, -0.9, y) * smooth01(1.2, 0.3, z)
        top = smooth01(1.2, 2.1, z) * 0.25
        spots = max(0.0, noise.noise(v.co * 3.2) - 0.25) * 0.5
        warm = 0.06 * noise.noise(v.co * 1.3 + Vector((7, 1, 3)))
        l = 0.82 + 0.25 * belly - top - spots
        attr.data[i].color = (l + warm, l, l - warm * 0.5 + 0.03 * belly, 1)
    me.color_attributes.active_color = attr
    me.attributes.active_color = attr
    # mouth interior faces
    for p in me.polygons:
        if mouth_weight(p.center):
            p.material_index = inside_index


def bake_ao(o):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = 48
    me = o.data
    ao = me.color_attributes.new("AO", "FLOAT_COLOR", "POINT")
    me.color_attributes.active_color = ao
    activate(o)
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    col = me.color_attributes["Col"]
    for i in range(len(me.vertices)):
        a = ao.data[i].color[0]
        a = 0.45 + 0.55 * a
        c = col.data[i].color
        col.data[i].color = (c[0] * a, c[1] * a, c[2] * a, 1)
    me.color_attributes.remove(ao)
    me.color_attributes.active_color = me.color_attributes["Col"]


# ---------------------------------------------------------------------------- parts

def eyeball(name, center, mats):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=0.19, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    for m in mats:
        o.data.materials.append(m)
    # a slightly outward gaze, a big iris and a vertical slit pupil
    fwd = Vector((math.copysign(0.18, center.x), -1, 0.05)).normalized()
    for p in o.data.polygons:
        n = p.normal
        d = n.dot(fwd)
        side = n - fwd * d
        slit = abs(side.x) < 0.075 and d > 0.86
        p.material_index = 2 if slit else 1 if d > 0.72 else 0
    bpy.ops.object.shade_smooth()
    o.location = center
    return o


def eyelids(eyes):
    """Heavy upper lids (a menacing squint) and lower lids, joined into the head later."""
    parts = []
    for e in eyes:
        s = 1 if e.x > 0 else -1
        for upper in (True, False):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, radius=0.205, location=(0, 0, 0))
            lid = bpy.context.active_object
            bm = bmesh.new()
            bm.from_mesh(lid.data)
            cut = 0.115 if upper else -0.13
            gone = [f for f in bm.faces if (f.calc_center_median().z < cut) == upper]
            bmesh.ops.delete(bm, geom=gone, context="FACES")
            bm.to_mesh(lid.data)
            bm.free()
            apply_mod(lid, "SOLIDIFY", thickness=0.025, offset=1)
            # tilt the upper lids down toward the nose: an angry brow line
            lid.rotation_euler = (0.12 if upper else -0.15, 0, (-0.28 if upper else 0.08) * s)
            lid.location = e
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            parts.append(lid)
    return parts


def mouth_bag():
    """A smooth inner mouth behind the lips (normals inward)."""
    o = ell("MouthBag", (0, -0.66, MOUTH_Z - 0.02), (0.42, 0.38, 0.17), seg=40, rings=24)
    for v in o.data.vertices:
        v.co.z += SMILE * 0.6 * v.co.x ** 2
    # only the back and floor of the cavity: the front would hide the teeth
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().y < -0.8], context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    activate(o)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.flip_normals()
    bpy.ops.object.mode_set(mode="OBJECT")
    return o


def teeth(mat):
    objs = []
    for up in (False, True):
        n = 10 if not up else 8
        for i in range(n):
            u = (i / (n - 1)) * 2 - 1
            x = u * (0.33 if not up else 0.28)
            zl = mouth_line(x)
            y = -1.02 + 1.1 * x * x + 0.1
            fang = (not up) and abs(abs(u) - 0.66) < 0.12
            h = 0.12 if fang else (0.05 if not up else 0.045)
            r = 0.042 if fang else 0.03
            bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=r, radius2=0.006, depth=h)
            t = bpy.context.active_object
            t.scale = (1, 0.7, 1)
            t.rotation_euler = (math.pi if not up else 0, 0, 0)
            t.location = (x, y, zl + (0.03 - h / 2 + 0.012 if not up else -0.03 + h / 2 - 0.012))
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            objs.append(t)
    o = join(objs, "Teeth")
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def tongue(mat):
    o = ell("Tongue", (0, -0.62, MOUTH_Z - 0.035), (0.24, 0.34, 0.07))
    for v in o.data.vertices:
        v.co.z += 0.12 * (v.co.y + 0.62) ** 2 * 0  # flat base
        if v.co.z > MOUTH_Z - 0.035:
            v.co.z -= 0.012 * math.exp(-(v.co.x ** 2) / 0.004)  # centre groove
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def gradient_material(name, rough=0.45, coat=0.3, metal=0.0):
    """A material whose colour is the mesh's 'Col' vertex colours."""
    m = material(name, (1, 1, 1), rough=rough, coat=coat, metal=metal)
    nt = m.node_tree
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "Col"
    nt.links.new(ca.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    return m


def paint_along(o, base, tip, axis_from, axis_to):
    """Vertex colours from `base` to `tip` by distance from `axis_from` toward `axis_to`."""
    me = o.data
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    a, b = Vector(axis_from), Vector(axis_to)
    for i, v in enumerate(me.vertices):
        t = max(0.0, min(1.0, (v.co - a).dot(b - a) / (b - a).length_squared))
        t = t ** 1.4
        ring = 0.9 + 0.1 * math.sin(v.co.length * 40)
        attr.data[i].color = tuple(((1 - t) * base[k] + t * tip[k]) * ring for k in range(3)) + (1,)
    me.color_attributes.active_color = attr


def sweep(name, ctrl, r0, segs=48, ring=18, ridges=0.0, power=0.85):
    """A tapered tube along a cubic Bézier with a sharp tip (parallel-transport frames)."""
    p0, p1, p2, p3 = [Vector(c) for c in ctrl]
    B = lambda t: (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3
    D = lambda t: (3 * (1 - t) ** 2 * (p1 - p0) + 6 * (1 - t) * t * (p2 - p1) + 3 * t * t * (p3 - p2)).normalized()
    bm = bmesh.new()
    tan = D(0.0)
    nrm = tan.orthogonal().normalized()
    rings = []
    for i in range(segs + 1):
        t = i / segs
        tn = D(min(t, 0.999))
        # parallel transport of the normal
        nrm = (nrm - tn * nrm.dot(tn)).normalized()
        bin_ = tn.cross(nrm)
        c = B(t)
        r = r0 * (1 - t) ** power * (1 + ridges * math.sin(t * 46) * (1 - t)) + 0.002
        if i == segs:
            rings.append([bm.verts.new(c)])
            break
        ring_v = []
        for j in range(ring):
            a = j / ring * math.tau
            ring_v.append(bm.verts.new(c + (nrm * math.cos(a) + bin_ * math.sin(a)) * r))
        rings.append(ring_v)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(ring):
            if len(b) == 1:
                bm.faces.new((a[j], a[(j + 1) % ring], b[0]))
            else:
                bm.faces.new((a[j], a[(j + 1) % ring], b[(j + 1) % ring], b[j]))
    bm.faces.new(list(reversed(rings[0])))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    activate(o)
    bpy.ops.object.shade_smooth()
    return o


def horns(mat):
    parts = []
    for s in (-1, 1):
        ctrl = [(0.36 * s, -0.28, 1.98), (0.62 * s, -0.5, 2.62), (1.32 * s, -0.12, 2.92), (1.42 * s, 0.42, 2.46)]
        o = sweep("horn", ctrl, 0.2, ridges=0.07)
        paint_along(o, (0.1, 0.06, 0.05), (0.9, 0.82, 0.66), ctrl[0], ctrl[3])
        parts.append(o)
    o = join(parts, "Horns")
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def tusks(mat):
    parts = []
    for s in (-1, 1):
        ctrl = [(0.3 * s, -0.9, 0.5), (0.33 * s, -1.06, 0.68), (0.43 * s, -1.12, 0.88), (0.5 * s, -1.04, 1.0)]
        parts.append(sweep("tusk", ctrl, 0.058, segs=24, ring=12, power=0.9))
    o = join(parts, "Tusks")
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def antennae(stalk_mat, bulb_mat):
    parts = []
    for s in (-1, 1):
        pts = [(0.22 * s, -0.12, 2.05), (0.36 * s, -0.25, 2.6), (0.58 * s, -0.55, 2.95), (0.72 * s, -0.78, 3.0)]
        st = curve_tube("stalk", pts, 0.035, [1.2, 0.9, 0.7, 0.6], 16)
        st.data.materials.append(stalk_mat)
        b = ell("bulb", (0.72 * s, -0.8, 3.0), (0.13, 0.13, 0.13), seg=24, rings=16)
        b.data.materials.append(bulb_mat)
        parts += [st, b]
    o = join(parts, "Antennae")
    bpy.ops.object.shade_smooth()
    return o


def visor(metal, glow):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.0, depth=0.3, location=(0, -0.12, 1.08))
    band = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(band.data)
    gone = [f for f in bm.faces if f.calc_center_median().y > -0.12 - 0.35 or abs(f.normal.z) > 0.9]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bm.to_mesh(band.data)
    bm.free()
    apply_mod(band, "SOLIDIFY", thickness=0.05, offset=1)
    band.data.materials.append(metal)
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.035, depth=0.06, location=(0, -0.12, 1.08))
    strip = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(strip.data)
    gone = [f for f in bm.faces if f.calc_center_median().y > -0.12 - 0.55 or abs(f.normal.z) > 0.9]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bm.to_mesh(strip.data)
    bm.free()
    strip.data.materials.append(glow)
    parts = [band, strip]
    for s in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.11, depth=0.5, location=(0.5 * s, 0.05, 0.28), rotation=(0, math.pi / 2, 0))
        b = bpy.context.active_object
        b.data.materials.append(metal)
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.17, depth=0.1, location=(0.76 * s, 0.05, 0.28), rotation=(0, math.pi / 2, 0))
        nut = bpy.context.active_object
        nut.data.materials.append(metal)
        parts += [b, nut]
    o = join(parts, "Visor")
    # smooth-by-angle sets sharp edges directly (shade_auto_smooth adds a modifier that the
    # glTF export, with export_apply=False, would drop, leaving the visor faceted)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    return o


def leaf(name, loc, size, rot, mat):
    """A pointed, cupped ear blade."""
    o = ell(name, (0, 0, 0), (size[0], size[1], size[2]), seg=32, rings=24)
    for v in o.data.vertices:
        t = min(1.0, max(0.0, (v.co.z / size[2] + 1) / 2))   # 0 base … 1 tip
        k = (1 - t) ** 0.9 * 0.95 + 0.05
        v.co.x *= k
        v.co.y = v.co.y * k - 0.35 * size[0] * max(0.0, 1 - (v.co.x / size[0]) ** 2) * math.sin(math.pi * t) * 0.6
    o.rotation_euler = rot
    o.location = loc
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.materials.append(mat)
    return o


def animal_ears(fur, inner):
    parts = []
    for s in (-1, 1):
        parts.append(leaf("ear", (0.74 * s, 0.22, 2.12), (0.34, 0.12, 0.56), (0.15, -0.55 * s, 0), fur))
        parts.append(leaf("earIn", (0.74 * s - 0.02 * s, 0.13, 2.1), (0.22, 0.05, 0.42), (0.15, -0.55 * s, 0), inner))
    o = join(parts, "AnimalEars")
    bpy.ops.object.shade_smooth()
    return o


def collar(metal, glow):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.52, minor_radius=0.07, major_segments=72, minor_segments=16, location=(0, 0.1, 0.32))
    ring = bpy.context.active_object
    ring.data.materials.append(metal)
    parts = [ring]
    for i in range(8):
        a = math.pi * (0.25 + 0.5 * i / 7) + math.pi
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.045, location=(0.52 * math.cos(a), 0.1 + 0.52 * math.sin(a), 0.32))
        led = bpy.context.active_object
        led.location.y -= 0.075 * (1 if math.sin(a) < 0 else -1) * 0
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
    bpy.data.objects["Teeth"].data.shape_keys.key_blocks["jawOpen"].value = jaw
    show = set((argv[3] if len(argv) > 3 else "Horns,Tusks").split(","))
    for o in objects:
        if o.name in ("Horns", "Tusks", "Antennae", "Visor", "AnimalEars", "Collar"):
            o.hide_render = o.name not in show
    world = bpy.data.worlds.new("w")
    scn.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.93, 0.92, 0.95, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0.06))
    floor = bpy.context.active_object
    floor.data.materials.append(material("Floor", (0.9, 0.89, 0.92), rough=0.8))
    for name, loc, energy, size in (("key", (-3.5, -4.5, 5), 1800, 3), ("fill", (4.5, -3, 1.5), 500, 5), ("rim", (2, 4.5, 4), 1600, 2), ("rim2", (-3, 3.5, 2.5), 700, 2)):
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
    co.location = (-2.9, -7.8, 1.75)
    co.rotation_euler = (Vector((0, 0, 1.3)) - co.location).to_track_quat("-Z", "Y").to_euler()
    scn.collection.objects.link(co)
    scn.camera = co
    scn.render.resolution_x = 720
    scn.render.resolution_y = 900
    scn.cycles.samples = 96
    scn.cycles.use_denoising = True
    scn.render.film_transparent = False
    scn.view_settings.view_transform = "AgX"
    scn.view_settings.look = "AgX - Medium High Contrast"
    scn.render.filepath = bpy.path.abspath(path) if path.startswith("//") else __import__("os").path.abspath(path)
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------------------- main

def main():
    clean()
    skin = skin_material()
    inside = material("MouthInside", (0.28, 0.03, 0.06), rough=0.35, coat=0.6)
    tooth = material("Teeth", (0.95, 0.92, 0.82), rough=0.25, coat=0.5)
    sclera = material("Sclera", (0.97, 0.96, 0.9), rough=0.15, coat=1.0)
    iris = material("Iris", (1.0, 0.55, 0.05), rough=0.2, emit=(1.0, 0.45, 0.0), emit_strength=0.6, coat=1.0)
    pupil = material("Pupil", (0.01, 0.01, 0.01), rough=0.1, coat=1.0)
    tongue_m = material("Tongue", (0.75, 0.15, 0.25), rough=0.4, subsurface=0.2)
    horn_m = gradient_material("Horn", rough=0.38, coat=0.45)
    metal = material("Metal", (0.8, 0.82, 0.86), rough=0.22, metal=1.0)
    glow = material("Glow", (0.2, 1.0, 0.6), rough=0.3, emit=(0.2, 1.0, 0.6), emit_strength=4)
    bulb = material("Bulb", (0.6, 0.3, 1.0), rough=0.2, emit=(0.6, 0.3, 1.0), emit_strength=5)
    fur = material("Fur", (0.45, 0.32, 0.22), rough=0.9)
    ear_in = material("EarInner", (0.95, 0.6, 0.62), rough=0.6, subsurface=0.2)

    head = build_head()
    eyes = eye_positions(head)
    decimate(head, 30000)
    cut_mouth_and_eyes(head, eyes)
    head.data.materials.append(skin)
    head.data.materials.append(inside)
    lids = eyelids(eyes)
    for l in lids:
        l.data.materials.append(skin)
    bag = mouth_bag()
    bag.data.materials.append(inside)
    head = join([head, *lids, bag], "Head")
    decimate(head, 24000)
    activate(head)
    bpy.ops.object.shade_smooth()
    colour(head, 1)
    bake_ao(head)
    add_shape_keys(head)

    eye_l = eyeball("EyeL", eyes[0], [sclera, iris, pupil])
    eye_r = eyeball("EyeR", eyes[1], [sclera, iris, pupil])
    t = teeth(tooth)
    # the lower teeth ride the jaw: give the teeth the same hinge shape key
    t.shape_key_add(name="Basis")
    k = t.shape_key_add(name="jawOpen", from_mix=False)
    for i, v in enumerate(t.data.vertices):
        w = 1.0 if v.co.z < mouth_line(v.co.x) else 0.0
        k.data[i].co = hinge(v.co, w)
    tg = tongue(tongue_m)
    hn = horns(horn_m)
    tk = tusks(tooth)
    an = antennae(metal, bulb)
    vz = visor(metal, glow)
    ea = animal_ears(fur, ear_in)
    cl = collar(metal, glow)
    objs = [head, eye_l, eye_r, t, tg, hn, tk, an, vz, ea, cl]
    head["pivot"] = [PIVOT.x, PIVOT.z, -PIVOT.y]   # glTF (Y up) coordinates
    head["jawAngle"] = JAW_ANGLE
    head["mouth"] = [0.0, MOUTH_Z, 0.98]
    for o in objs:
        print(f"{o.name}: {len(o.data.polygons)} faces")

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
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
        export_lights=False,
        export_cameras=False,
    )
    print("exported", OUT)
    if PREVIEW:
        preview(PREVIEW, objs, PREVIEW_JAW)
        print("preview", PREVIEW)


main()
