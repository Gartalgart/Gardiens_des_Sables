# Shared helpers for building the FPS assets in Blender.
# Usage inside Blender: exec(open(r"<path>/helpers.py").read())
import bpy
import bmesh
import math
from mathutils import Vector

PROJECT = r"C:\Users\rdenimal\Documents\dev_perso\myFirst_fps"
MODELS = PROJECT + r"\public\models"


def get_coll(name, clear=False):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    if clear:
        for ob in list(coll.all_objects):
            bpy.data.objects.remove(ob, do_unlink=True)
    return coll


def mat(name, color, rough=0.85, metal=0.0, emit=None, strength=4.0):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    else:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    m.diffuse_color = (*color, 1.0)
    return m


def _finish(ob, coll, material, parent, smooth=False):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    if material is not None:
        ob.data.materials.clear()
        ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.use_smooth = smooth
    if parent is not None:
        ob.parent = parent
    return ob


def _mesh_from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return bpy.data.objects.new(name, me)


def box(name, coll, size, loc=(0, 0, 0), material=None, parent=None, rot=(0, 0, 0), taper=1.0):
    """Box centred on loc. taper < 1 shrinks the top face (for pyramids / obelisks)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
        if v.co.z > 0 and taper != 1.0:
            v.co.x *= taper
            v.co.y *= taper
    ob = _mesh_from_bm(name, bm)
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    return _finish(ob, coll, material, parent)


def cyl(name, coll, radius, depth, loc=(0, 0, 0), material=None, parent=None, rot=(0, 0, 0),
        verts=10, radius_top=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=radius,
                          radius2=radius if radius_top is None else radius_top, depth=depth)
    ob = _mesh_from_bm(name, bm)
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    return _finish(ob, coll, material, parent)


def sphere(name, coll, radius, loc=(0, 0, 0), material=None, parent=None, scale=(1, 1, 1), subdiv=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    ob = _mesh_from_bm(name, bm)
    ob.location = loc
    ob.scale = scale
    return _finish(ob, coll, material, parent)


def empty(name, coll, loc=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.3
    ob.location = loc
    coll.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def export_coll(coll_name, filename):
    coll = bpy.data.collections[coll_name]
    coll.hide_viewport = False  # objects of a hidden collection cannot be selected, so they would not export
    bpy.ops.object.select_all(action="DESELECT")
    for ob in coll.all_objects:
        ob.hide_set(False)
        ob.select_set(True)
    path = MODELS + "\\" + filename
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_extras=True)
    bpy.ops.object.select_all(action="DESELECT")
    return path


def solo(coll_name):
    """Show only one asset collection in the viewport."""
    for c in bpy.context.scene.collection.children:
        c.hide_viewport = c.name != coll_name
