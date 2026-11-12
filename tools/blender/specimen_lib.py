"""Helpers for the specimen build (Blender 4.5): numpy noise fields and mesh primitives."""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector


def smooth01(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------- numpy fields

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _hash(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h &= 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    h ^= h >> 16
    return (h & 0xFFFFFF) / float(0x1000000)


def vnoise(P, seed=0):
    """Smooth value noise in [-1, 1]."""
    p = np.floor(P)
    f = P - p
    i = p.astype(np.int64)
    u = f * f * (3 - 2 * f)
    out = np.zeros(len(P))
    for dx in (0, 1):
        wx = u[:, 0] if dx else 1 - u[:, 0]
        for dy in (0, 1):
            wy = u[:, 1] if dy else 1 - u[:, 1]
            for dz in (0, 1):
                wz = u[:, 2] if dz else 1 - u[:, 2]
                out += wx * wy * wz * _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out * 2 - 1


def fbm(P, octaves=4, seed=0):
    out = np.zeros(len(P))
    amp, norm = 1.0, 0.0
    for k in range(octaves):
        out += amp * vnoise(P * (2 ** k), seed + k * 17)
        norm += amp
        amp *= 0.5
    return out / norm


def voronoi(P, seed=0):
    """Distances to the nearest and second-nearest jittered cell point, and the cell id."""
    p = np.floor(P).astype(np.int64)
    f = P - np.floor(P)
    f1 = np.full(len(P), 9.0)
    f2 = np.full(len(P), 9.0)
    cid = np.zeros(len(P))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                cx, cy, cz = p[:, 0] + dx, p[:, 1] + dy, p[:, 2] + dz
                jx = _hash(cx, cy, cz, seed)
                jy = _hash(cx, cy, cz, seed + 1)
                jz = _hash(cx, cy, cz, seed + 2)
                d = np.sqrt((dx + jx - f[:, 0]) ** 2 + (dy + jy - f[:, 1]) ** 2 + (dz + jz - f[:, 2]) ** 2)
                closer = d < f1
                f2 = np.where(closer, f1, np.minimum(f2, d))
                cid = np.where(closer, _hash(cx, cy, cz, seed + 3), cid)
                f1 = np.where(closer, d, f1)
    return f1, f2, cid


def seg_dist(px, pz, ax, az, bx, bz):
    """Distance in a plane from points to a segment, and the position along it."""
    vx, vz = bx - ax, bz - az
    t = np.clip(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0.0, 1.0)
    return np.hypot(px - (ax + t * vx), pz - (az + t * vz)), t


def poly_dist(px, pz, pts):
    d = np.full(len(px), 9.0)
    for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
        d = np.minimum(d, seg_dist(px, pz, ax, az, bx, bz)[0])
    return d


def verts(o):
    me = o.data
    n = len(me.vertices)
    co = np.empty(n * 3)
    me.vertices.foreach_get("co", co)
    no = np.empty(n * 3)
    me.vertex_normals.foreach_get("vector", no)
    return co.reshape(-1, 3), no.reshape(-1, 3)


def set_verts(o, co):
    o.data.vertices.foreach_set("co", co.ravel())
    o.data.update()


# ---------------------------------------------------------------------------- blender helpers

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


def ell_along(name, a, b, width, height, seg=32, rings=20):
    """An ellipsoid stretched between two points (long axis a→b)."""
    a, b = Vector(a), Vector(b)
    o = ell(name, (0, 0, 0), (width, (b - a).length / 2, height), seg=seg, rings=rings)
    q = Vector((0, 1, 0)).rotation_difference((b - a).normalized())
    o.matrix_world = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
    activate(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def box(name, loc, half, rot=(0, 0, 0), bevel=0.0):
    """A box (half extents), optionally with rounded edges."""
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = half
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel > 0:
        apply_mod(o, "BEVEL", width=bevel, segments=4, limit_method="NONE")
    return o


def cyl(name, loc, r, depth, rot=(0, 0, 0), verts_n=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts_n, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
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


def gradient_material(name, rough=0.45, coat=0.3, metal=0.0):
    """A material whose colour is the mesh's 'Col' vertex colours."""
    m = material(name, (1, 1, 1), rough=rough, coat=coat, metal=metal)
    nt = m.node_tree
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "Col"
    nt.links.new(ca.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    return m


def paint_along(o, base, tip, axis_from, axis_to, rings=46):
    """Vertex colours from `base` to `tip` by distance from `axis_from` toward `axis_to`."""
    me = o.data
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    a, b = Vector(axis_from), Vector(axis_to)
    for i, v in enumerate(me.vertices):
        t = max(0.0, min(1.0, (v.co - a).dot(b - a) / (b - a).length_squared))
        t = t ** 1.4
        ring = 0.86 + 0.14 * math.sin(v.co.length * rings)
        attr.data[i].color = tuple(((1 - t) * base[k] + t * tip[k]) * ring for k in range(3)) + (1,)
    me.color_attributes.active_color = attr


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


def leaf(name, size, mat=None):
    """A pointed, cupped blade along +Z (base at z = -size.z), cupped toward -Y."""
    o = ell(name, (0, 0, 0), size, seg=40, rings=28)
    for v in o.data.vertices:
        t = min(1.0, max(0.0, (v.co.z / size[2] + 1) / 2))   # 0 base … 1 tip
        k = (1 - t) ** 0.85 * 0.95 + 0.05
        v.co.x *= k
        v.co.y = v.co.y * k - 0.45 * size[0] * max(0.0, 1 - (v.co.x / size[0]) ** 2) * math.sin(math.pi * t) * 0.6
    if mat:
        o.data.materials.append(mat)
    return o


def orient(o, loc, z_dir, y_hint):
    """Place an object so its local +Z points along z_dir and local -Y faces y_hint."""
    z = Vector(z_dir).normalized()
    x = Vector(y_hint).cross(z).normalized()
    y = z.cross(x)
    m = Matrix((x, -y, z)).transposed().to_4x4()
    m.translation = Vector(loc)
    o.matrix_world = m
    activate(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def sweep(name, ctrl, r0, segs=48, ring=18, ridges=0.0, power=0.85):
    """A tapered tube along a cubic Bézier with a sharp tip (parallel-transport frames)."""
    p0, p1, p2, p3 = [Vector(c) for c in ctrl]
    B = lambda t: (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3
    D = lambda t: (3 * (1 - t) ** 2 * (p1 - p0) + 6 * (1 - t) * t * (p2 - p1) + 3 * t * t * (p3 - p2)).normalized()
    bm = bmesh.new()
    nrm = D(0.0).orthogonal().normalized()
    rings = []
    for i in range(segs + 1):
        t = i / segs
        tn = D(min(t, 0.999))
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
