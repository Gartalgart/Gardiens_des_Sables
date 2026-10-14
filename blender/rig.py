# Rigs and animations of the enemies.
# Each rigid part of a model is parented to one bone (no deformation: the blocky look stays).
# Usage inside Blender (after helpers.py): exec(open(r"<path>/rig.py").read())
import bpy
import re
import math
from mathutils import Vector, Euler

FPS = 30


def base_name(name):
    return re.sub(r"\.\d+$", "", name)


def build_rig(coll_name, root_name, rig_name, bones, parts):
    """bones: [(name, parent, head, tail)] in world space (the model stands at the origin).
    parts: {base object name: bone name} — every mesh of the collection must be listed."""
    coll = bpy.data.collections[coll_name]
    root = bpy.data.objects[root_name]
    old = bpy.data.objects.get(rig_name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)

    arm_data = bpy.data.armatures.new(rig_name)
    rig = bpy.data.objects.new(rig_name, arm_data)
    coll.objects.link(rig)
    rig.parent = root
    bpy.context.view_layer.objects.active = rig
    for o in bpy.context.selected_objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones
    for name, parent, head, tail in bones:
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        b.roll = 0
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'

    # reparent every mesh to its bone, keeping it where it is
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    missing = [o.name for o in meshes if base_name(o.name) not in parts]
    if missing:
        raise ValueError("no bone for: %s" % missing)
    bpy.context.view_layer.update()
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = rig
        o.parent_type = 'BONE'
        o.parent_bone = parts[base_name(o.name)]
        bpy.context.view_layer.update()
        o.matrix_world = mw
    # the empties that used to hold the parts are no longer needed (muzzles and tips stay)
    for o in list(coll.all_objects):
        if o.type == 'EMPTY' and o is not root and not base_name(o.name).startswith(("Muzzle", "Tip")):
            bpy.data.objects.remove(o, do_unlink=True)
    return rig


def add_action(rig, name, keys, loop=True):
    """keys: [(time in seconds, {bone: (x, y, z) degrees, '_loc_Hips': (x, y, z)})].
    Bones missing from a key keep their rest pose there. Loops repeat the first key at the end."""
    act = bpy.data.actions.get(name)
    if act:
        bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    # every bone is keyed (rest pose when a key does not mention it), so actions never leak into each other
    bones = [pb.name for pb in rig.pose.bones]
    locs = sorted({b[5:] for _, pose in keys for b in pose if b.startswith("_loc_")} | {"Hips"})
    for t, pose in keys:
        f = 1 + round(t * FPS)
        for b in bones:
            pb = rig.pose.bones[b]
            pb.rotation_euler = Euler([math.radians(a) for a in pose.get(b, (0, 0, 0))])
            pb.keyframe_insert("rotation_euler", frame=f)
        for b in locs:
            pb = rig.pose.bones[b]
            pb.location = Vector(pose.get("_loc_" + b, (0, 0, 0)))
            pb.keyframe_insert("location", frame=f)
    # reset the pose so the next action starts from rest
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    act["loop"] = loop
    return act


def stash_tracks(rig, prefix):
    """one NLA track per action of this rig, named after the clip (prefix removed)"""
    ad = rig.animation_data or rig.animation_data_create()
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    for act in sorted((a for a in bpy.data.actions if a.name.startswith(prefix)), key=lambda a: a.name):
        tr = ad.nla_tracks.new()
        tr.name = act.name[len(prefix):]
        st = tr.strips.new(act.name, int(act.frame_range[0]), act)
        if hasattr(st, "action_slot") and st.action_slot is None and len(act.slots):
            st.action_slot = act.slots[0]
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)


def export_animated(coll_name, rig_name, prefix, filename):
    """Export an enemy with its clips. All rigs share bone names, so clips go through NLA tracks:
    the 'ACTIONS' mode would put every enemy's clips in every file."""
    stash_tracks(bpy.data.objects[rig_name], prefix)
    coll = bpy.data.collections[coll_name]
    coll.hide_viewport = False
    bpy.ops.object.select_all(action="DESELECT")
    for ob in coll.all_objects:
        ob.hide_set(False)
        ob.select_set(True)
    path = MODELS + "\\" + filename
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_force_sampling=True, export_def_bones=False)
    bpy.ops.object.select_all(action="DESELECT")
    return path
