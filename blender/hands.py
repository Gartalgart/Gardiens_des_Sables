# First-person hands and forearms, added to each weapon collection so they export with the weapon.
# Usage inside Blender (after helpers.py): exec(open(r"<path>/hands.py").read())
import bpy
import math
from mathutils import Vector, Euler, Matrix

mat("Skin", (0.34, 0.22, 0.15), 0.8)
mat("Linen", (0.6, 0.54, 0.42), 0.95)

# What each part of the hand and arm is made of, and how thick the sleeve is. The desert's are
# bandaged with a gold bracelet; a universe can pass its own (the pirates: gloves and shirt sleeves).
BANDAGED = {
    "palm": "Linen", "fingers": "Skin", "knuckles": "Linen", "tips": "Skin", "thumb": "Skin",
    "pad": "Linen", "web": "Linen", "arm": "Skin", "wrap": "Linen", "band": "Gold",
    "arm_size": (0.058, 0.052), "wrap_size": (0.064, 0.05, 0.058), "band_size": (0.066, 0.022, 0.06),
}


def _part(builder, name, coll, parent, *args, **kw):
    ob = builder(name, coll, *args, parent=parent, **kw)
    return ob


def make_hand(prefix, coll, root, loc, rot_deg, side, elbow, look=None):
    """A blocky hand closed around a grip whose axis is the hand's local Z.
    side = 1 for the right hand, -1 for the left (mirrored). loc / rot_deg place the hand in the
    weapon's space; the forearm runs from the wrist to `elbow` (weapon space), out of the screen.
    look: materials and sleeve sizes (BANDAGED by default)."""
    L = look or BANDAGED
    mats = bpy.data.materials
    s = side
    hand = empty(prefix + "Hand", coll, loc, root)
    hand.rotation_euler = Euler([math.radians(a) for a in rot_deg])
    # palm on the outer side of the grip, fingers curled over the front, fingertips on the inner side
    box(prefix + "Palm", coll, (0.022, 0.074, 0.086), (0.03 * s, -0.008, -0.01), mats[L["palm"]], hand)
    box(prefix + "Fingers", coll, (0.056, 0.026, 0.078), (0.006 * s, 0.033, -0.012), mats[L["fingers"]], hand)
    box(prefix + "Knuckles", coll, (0.06, 0.03, 0.012), (0.006 * s, 0.03, -0.058), mats[L["knuckles"]], hand)
    box(prefix + "Tips", coll, (0.014, 0.034, 0.072), (-0.026 * s, 0.018, -0.012), mats[L["tips"]], hand)
    box(prefix + "Thumb", coll, (0.016, 0.054, 0.018), (-0.024 * s, 0.006, 0.04), mats[L["thumb"]], hand)
    box(prefix + "ThumbPad", coll, (0.022, 0.034, 0.032), (-0.012 * s, -0.022, 0.03), mats[L["pad"]], hand)
    box(prefix + "Web", coll, (0.044, 0.024, 0.044), (0.012 * s, -0.03, 0.028), mats[L["web"]], hand)
    wrist_local = Vector((0.03 * s, -0.052, -0.05))

    # forearm: from the wrist (in weapon space) to the elbow, with three wraps (or sleeve folds)
    # and a bracelet (or cuff) at the wrist
    bpy.context.view_layer.update()
    wrist = hand.matrix_local @ wrist_local
    d = Vector(elbow) - wrist
    length = d.length
    q = Vector((0, -1, 0)).rotation_difference(d.normalized())
    rot = q.to_euler()
    mid = wrist + d * 0.5
    aw, ah = L["arm_size"]
    arm = box(prefix + "Forearm", coll, (aw, length, ah), (0, 0, 0), mats[L["arm"]], root, taper=1.0)
    arm.location = mid
    arm.rotation_euler = rot
    for i, f in enumerate((0.12, 0.38, 0.62)):
        p = wrist + d * f
        b = box(prefix + "Wrap%d" % i, coll, L["wrap_size"], (0, 0, 0), mats[L["wrap"]], root)
        b.location = p
        b.rotation_euler = rot
    br = box(prefix + "Bracelet", coll, L["band_size"], (0, 0, 0), mats[L["band"]], root)
    br.location = wrist + d * 0.03
    br.rotation_euler = rot
    return hand
