# U2 phase 5: the Hive Queen and her egg sacs (blender/station/enemies.py has the rig helpers).
#   queen   the boss: a huge black alien clinging to the reactor column (radius 2.2 m, 7 m high) of
#           the reactor room. The origin is the column's axis and she faces -Y like every model, so
#           the game turns her round the column to face the player. A long crested head over a
#           ribbed torso, two great scything claws and two small inner arms, legs braced on the
#           floor and a second pair clamped round the column, a tail lying on the floor in front (it
#           rises and smashes down: the "attack"), and her egg-laying sac wound round the column.
#   eggsac  a cluster of three leathery eggs on a base of resin, 1.3 m high; it hatches parasites.
# Built in the "Enemies" scene of station.blend, exported to public/models/station/{queen,eggsac}.glb.
# Usage inside Blender (safe mode: sent inline): helpers.py, then base_name / build_rig / add_action
# / stash_tracks / export_animated from enemies.py, then this file, then build_queen_all().
import bpy
import math
from mathutils import Vector

FPS = 30

mat("QueenHide", (0.012, 0.014, 0.016), rough=0.18, metal=0.4)
mat("QueenRib", (0.06, 0.065, 0.07), rough=0.3, metal=0.3)
mat("QueenCrest", (0.025, 0.028, 0.032), rough=0.12, metal=0.5)
mat("QueenMaw", (0.3, 0.04, 0.04), rough=0.4)
mat("QueenTeeth", (0.62, 0.6, 0.52), rough=0.3)
mat("QueenSac", (0.38, 0.32, 0.22), rough=0.25)
mat("QueenVein", (0.12, 0.15, 0.08), rough=0.5)
mat("QueenAcid", (0.45, 1.0, 0.2), emit=(0.45, 1.0, 0.15), strength=2.5)
mat("EggShell", (0.42, 0.36, 0.25), rough=0.35)
mat("EggLip", (0.22, 0.12, 0.1), rough=0.4)
mat("EggResin", (0.02, 0.025, 0.025), rough=0.2, metal=0.3)


def limb(name, coll, a, b, w, d, material, parent, taper=1.0):
    """a box from point a to point b (its length along a-b), w wide and d deep"""
    a, b = Vector(a), Vector(b)
    ob = box(name, coll, (w, d, (b - a).length), (a + b) / 2, material, parent, taper=taper)
    ob.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
    return ob


# joints, shared by the boxes and the bones (x for the right side; the left mirrors it)
J = {
    "hip": (0, -3.0, 2.2), "chest": (0, -3.5, 4.4), "neck": (0, -4.3, 5.3), "head": (0, -6.6, 5.0),
    "shoulder": (1.25, -3.7, 4.7), "elbow": (2.1, -5.0, 3.7), "wrist": (2.2, -6.2, 5.3),
    "small": (0.55, -4.0, 3.9), "smallEnd": (0.6, -4.7, 3.3),
    "thigh": (1.1, -3.0, 2.3), "knee": (2.7, -3.4, 1.7), "foot": (3.0, -4.0, 0.0),
    "grip": (1.0, -2.6, 4.9), "gripEnd": (2.45, -0.4, 4.6),
    "tail": (0, -3.2, 1.6), "tailMid": (0, -4.9, 0.25), "tailEnd": (0, -8.0, 0.25),
}


def side(key, x):
    v = J[key]
    return (v[0] * x, v[1], v[2])


def build_queen():
    M = bpy.data.materials
    c = get_coll("Enemy_Queen", clear=True)
    root = empty("Queen", c)
    # the body out in front of the column: a heavy pelvis, a ribbed torso leaning out over the
    # room, ridged spines down the back
    limb("QPelvis", c, (0, -2.7, 1.6), J["hip"], 2.2, 1.6, M["QueenHide"], root)
    limb("QTorso", c, J["hip"], J["chest"], 2.0, 1.5, M["QueenHide"], root, taper=0.85)
    limb("QChest", c, (0, -3.9, 2.6), (0, -4.3, 4.3), 1.4, 0.4, M["QueenRib"], root)
    for i in range(6):
        t = i / 5
        y = -3.85 - 0.45 * t
        z = 2.5 + 1.8 * t
        limb("QRib%d" % i, c, (-1.05, y + 0.2, z), (1.05, y + 0.2, z), 0.14, 0.12, M["QueenRib"], root)
    for i in range(5):
        t = i / 4
        y = -2.35 - 0.6 * t
        z = 2.4 + 2.4 * t
        limb("QSpine%d" % i, c, (0, y, z), (0, y + 0.55, z + 0.25), 0.2, 0.3, M["QueenCrest"], root, taper=0.3)
    # the neck and a long skull reaching out, the crest a great fan sweeping back over the torso
    limb("QNeck", c, J["chest"], J["neck"], 0.8, 0.8, M["QueenRib"], root, taper=0.8)
    limb("QSkull", c, J["neck"], (0, -5.9, 5.15), 1.0, 0.8, M["QueenHide"], root, taper=0.8)
    limb("QSnout", c, (0, -5.8, 5.05), J["head"], 0.6, 0.55, M["QueenHide"], root, taper=0.7)
    limb("QCrest", c, (0, -5.4, 5.4), (0, -2.6, 6.6), 2.4, 0.16, M["QueenCrest"], root, taper=0.45)
    limb("QCrestRidge", c, (0, -5.5, 5.5), (0, -2.6, 6.75), 0.18, 0.4, M["QueenRib"], root, taper=0.4)
    for s_, x in (("L", -1), ("R", 1)):
        limb("QCrestHorn" + s_, c, (1.05 * x, -3.3, 6.1), (1.5 * x, -2.3, 6.6), 0.16, 0.2, M["QueenCrest"], root, taper=0.2)
        limb("QCrestEdge" + s_, c, (0.5 * x, -5.3, 5.5), (1.15 * x, -3.0, 6.25), 0.12, 0.12, M["QueenRib"], root)
    limb("QJaw", c, (0, -4.9, 4.75), (0, -6.4, 4.65), 0.5, 0.22, M["QueenHide"], root)
    limb("QMaw", c, (0, -5.0, 4.88), (0, -6.3, 4.85), 0.4, 0.12, M["QueenMaw"], root)
    for i in range(5):
        x = -0.18 + i * 0.09
        box("QTooth%d" % i, c, (0.05, 0.05, 0.2), (x, -6.55, 4.85), M["QueenTeeth"], root, taper=0.3)
    limb("QAcid", c, (0.06, -6.4, 4.6), (0.06, -6.5, 4.0), 0.08, 0.08, M["QueenAcid"], root, taper=0.3)
    for s_, x in (("L", -1), ("R", 1)):
        # the great claws, raised like a mantis, and two small arms under the chest
        box("QShoulder" + s_, c, (0.8, 0.8, 0.7), side("shoulder", x), M["QueenRib"], root)
        limb("QUpper" + s_, c, side("shoulder", x), side("elbow", x), 0.5, 0.5, M["QueenHide"], root)
        limb("QFore" + s_, c, side("elbow", x), side("wrist", x), 0.42, 0.42, M["QueenHide"], root, taper=0.8)
        w = side("wrist", x)
        limb("QScythe" + s_, c, w, (w[0], w[1] - 0.6, w[2] - 1.9), 0.12, 0.35, M["QueenCrest"], root, taper=0.15)
        limb("QSmall" + s_, c, side("small", x), side("smallEnd", x), 0.18, 0.18, M["QueenRib"], root)
        # legs braced on the floor, and a second pair clamped round the column
        limb("QThigh" + s_, c, side("thigh", x), side("knee", x), 0.6, 0.6, M["QueenHide"], root)
        limb("QShin" + s_, c, side("knee", x), side("foot", x), 0.42, 0.42, M["QueenHide"], root, taper=0.7)
        f = side("foot", x)
        box("QFoot" + s_, c, (0.6, 0.9, 0.16), (f[0], f[1] - 0.2, 0.08), M["QueenCrest"], root)
        limb("QGrip" + s_, c, side("grip", x), side("gripEnd", x), 0.4, 0.4, M["QueenHide"], root)
        g = side("gripEnd", x)
        limb("QGripClaw" + s_, c, g, (g[0] * 0.7, g[1] + 1.4, g[2] - 0.3), 0.22, 0.22, M["QueenCrest"], root, taper=0.3)
    # the tail: from the pelvis down to the floor in front, then along it, a blade at the end
    for i in range(4):
        a = Vector(J["tail"]).lerp(Vector(J["tailMid"]), i / 4)
        b = Vector(J["tail"]).lerp(Vector(J["tailMid"]), (i + 1) / 4)
        w = 0.6 - i * 0.08
        limb("QTailA%d" % i, c, a, b, w, w, M["QueenHide"], root)
    for i in range(5):
        a = Vector(J["tailMid"]).lerp(Vector(J["tailEnd"]), i / 5)
        b = Vector(J["tailMid"]).lerp(Vector(J["tailEnd"]), (i + 1) / 5)
        w = 0.32 - i * 0.045
        limb("QTailB%d" % i, c, a, b, w, w, M["QueenRib"], root)
    limb("QTailBlade", c, J["tailEnd"], (0, -9.0, 0.3), 0.07, 0.55, M["QueenCrest"], root, taper=0.2)
    # the egg sac: swollen segments wound round the column behind her, veined
    for i in range(10):
        a = math.radians(-125 + i * 27.8)
        r = 2.7
        s = 0.8 + 0.18 * math.sin(i * 1.3)
        sphere("QSac%d" % i, c, 1.0, (math.sin(a) * r, math.cos(a) * r, 1.15 + 0.25 * math.sin(i)), M["QueenSac"], root, scale=(s, s, s * 0.85), subdiv=2)
        box("QSacVein%d" % i, c, (0.07, 0.07, s * 1.6), (math.sin(a) * (r + s * 0.8), math.cos(a) * (r + s * 0.8), 1.15), M["QueenVein"], root, rot=(0, 0, -math.degrees(a)))
    bones = [
        ("Hips", None, (0, -2.7, 1.4), J["hip"]),
        ("Spine", "Hips", J["hip"], J["chest"]),
        ("Neck", "Spine", J["chest"], J["neck"]),
        ("Head", "Neck", J["neck"], J["head"]),
        ("Jaw", "Head", (0, -4.9, 4.75), (0, -6.4, 4.65)),
        ("TailA", "Hips", J["tail"], J["tailMid"]),
        ("TailB", "TailA", J["tailMid"], J["tailEnd"]),
        ("Sac", "Hips", (0, 0, 0.6), (0, 0, 1.6)),
    ]
    for s_, x in (("L", -1), ("R", 1)):
        bones += [
            ("UpperArm_" + s_, "Spine", side("shoulder", x), side("elbow", x)),
            ("ForeArm_" + s_, "UpperArm_" + s_, side("elbow", x), side("wrist", x)),
            ("Small_" + s_, "Spine", side("small", x), side("smallEnd", x)),
            ("Thigh_" + s_, "Hips", side("thigh", x), side("knee", x)),
            ("Shin_" + s_, "Thigh_" + s_, side("knee", x), side("foot", x)),
            ("Grip_" + s_, "Spine", side("grip", x), side("gripEnd", x)),
        ]
    parts = {"QPelvis": "Hips", "QTorso": "Spine", "QChest": "Spine", "QNeck": "Neck",
             "QSkull": "Head", "QSnout": "Head", "QCrest": "Head", "QCrestRidge": "Head", "QJaw": "Jaw",
             "QMaw": "Jaw", "QAcid": "Jaw", "QTailBlade": "TailB"}
    for i in range(6):
        parts["QRib%d" % i] = "Spine"
    for i in range(5):
        parts["QSpine%d" % i] = "Spine"
        parts["QTooth%d" % i] = "Head"
        parts["QTailB%d" % i] = "TailB"
    for i in range(4):
        parts["QTailA%d" % i] = "TailA"
    for i in range(10):
        parts["QSac%d" % i] = "Sac"
        parts["QSacVein%d" % i] = "Sac"
    for s_ in "LR":
        parts.update({"QCrestHorn" + s_: "Head", "QCrestEdge" + s_: "Head", "QShoulder" + s_: "UpperArm_" + s_,
                      "QUpper" + s_: "UpperArm_" + s_, "QFore" + s_: "ForeArm_" + s_, "QScythe" + s_: "ForeArm_" + s_,
                      "QSmall" + s_: "Small_" + s_, "QThigh" + s_: "Thigh_" + s_, "QShin" + s_: "Shin_" + s_,
                      "QFoot" + s_: "Shin_" + s_, "QGrip" + s_: "Grip_" + s_, "QGripClaw" + s_: "Grip_" + s_})
    return c, bones, parts


def queen_actions(rig, p):
    """breathing and swaying; acid spat with a lunge of the head; the tail raised high and smashed down
    in front; a roar with claws spread (her changes of phase); a heave of the sac as she lays"""
    claws = {"UpperArm_L": (-10, 0, 10), "UpperArm_R": (-10, 0, -10), "ForeArm_L": (15, 0, 0), "ForeArm_R": (15, 0, 0)}
    add_action(rig, p + "idle", [
        (0, dict(claws, Spine=(0, 0, 0), Head=(0, 0, 0), TailB=(0, 0, 4), _loc_Sac=(0, 0, 0))),
        (1.4, dict(claws, Spine=(-4, 0, 3), Head=(6, 10, 0), Jaw=(6, 0, 0), TailB=(0, 0, -4), _loc_Sac=(0, 0, 0.05))),
        (2.8, dict(claws, Spine=(0, 0, 0), Head=(0, 0, 0), TailB=(0, 0, 4), _loc_Sac=(0, 0, 0))),
    ])
    # the spit: head drawn back, jaw open, then thrust out
    add_action(rig, p + "cast", [
        (0, claws),
        (0.3, dict(claws, Spine=(-14, 0, 0), Neck=(-20, 0, 0), Head=(-12, 0, 0), Jaw=(25, 0, 0))),
        (0.42, dict(claws, Spine=(10, 0, 0), Neck=(18, 0, 0), Head=(6, 0, 0), Jaw=(35, 0, 0))),
        (0.8, claws),
    ], loop=False)
    # the tail slam: up and over, then down hard in front
    add_action(rig, p + "attack", [
        (0, claws),
        (0.32, dict(claws, TailA=(-70, 0, 0), TailB=(-40, 0, 0), Spine=(-10, 0, 0), _loc_Hips=(0, 0, 0.15))),
        (0.42, dict(claws, TailA=(10, 0, 0), TailB=(8, 0, 0), Spine=(12, 0, 0), _loc_Hips=(0, 0, -0.1))),
        (0.9, claws),
    ], loop=False)
    # the roar: head thrown up, claws spread wide, crest raised
    roar = {"Spine": (-16, 0, 0), "Neck": (-30, 0, 0), "Head": (-20, 0, 0), "Jaw": (40, 0, 0),
            "UpperArm_L": (-60, 0, 50), "UpperArm_R": (-60, 0, -50), "ForeArm_L": (40, 0, 0), "ForeArm_R": (40, 0, 0)}
    add_action(rig, p + "transform", [(0, claws), (0.4, roar), (1.6, dict(roar, Head=(-26, 8, 0))), (2.0, claws)], loop=False)
    # laying: the body heaves, the sac swells and slides
    add_action(rig, p + "lay", [
        (0, claws),
        (0.4, dict(claws, Spine=(8, 0, 0), _loc_Sac=(0, 0, 0.25), Head=(10, 0, 0))),
        (0.8, dict(claws, Spine=(-4, 0, 0), _loc_Sac=(0, 0, -0.1))),
        (1.2, claws),
    ], loop=False)
    add_action(rig, p + "hit", [(0, {}), (0.06, {"Spine": (-6, 0, 0), "Head": (-8, 0, 0)}), (0.3, {})], loop=False)


def build_eggsac():
    M = bpy.data.materials
    c = get_coll("Enemy_EggSac", clear=True)
    root = empty("EggSac", c)
    box("EResin", c, (1.3, 1.3, 0.25), (0, 0, 0.12), M["EggResin"], root, taper=0.6)
    for i, (x, y, s) in enumerate(((0, 0, 0.42), (0.38, 0.22, 0.32), (-0.34, 0.26, 0.3))):
        sphere("EEgg%d" % i, c, 1.0, (x, y, 0.3 + s * 1.1), M["EggShell"], root, scale=(s, s, s * 1.35), subdiv=2)
        box("ELip%d" % i, c, (s * 0.9, s * 0.9, 0.06), (x, y, 0.3 + s * 2.4), M["EggLip"], root, taper=0.5)
    for i in range(4):
        a = i * math.pi / 2 + 0.4
        box("ETendril%d" % i, c, (0.07, 0.75, 0.07), (math.cos(a) * 0.55, math.sin(a) * 0.55, 0.3), M["EggResin"], root, rot=(30, 0, math.degrees(a) + 90))
    bones = [("Hips", None, (0, 0, 0), (0, 0, 0.6)), ("Top", "Hips", (0, 0, 0.6), (0, 0, 1.3))]
    parts = {"EResin": "Hips"}
    for i in range(3):
        parts["EEgg%d" % i] = "Top"
        parts["ELip%d" % i] = "Top"
    for i in range(4):
        parts["ETendril%d" % i] = "Hips"
    return c, bones, parts


def eggsac_actions(rig, p):
    """the eggs breathe; hit, they shudder"""
    add_action(rig, p + "idle", [(0, {"_loc_Top": (0, 0, 0)}), (0.9, {"Top": (3, 0, 2), "_loc_Top": (0, 0, 0.05)}), (1.8, {"_loc_Top": (0, 0, 0)})])
    add_action(rig, p + "hit", [(0, {}), (0.05, {"Top": (-10, 6, 0)}), (0.2, {"Top": (6, -4, 0)}), (0.35, {})], loop=False)


def build_queen_all(export=True):
    scene = bpy.data.scenes.get("Enemies") or bpy.data.scenes.new("Enemies")
    bpy.context.window.scene = scene
    c, bones, parts = build_queen()
    rig = build_rig(c.name, "Queen", "QueenRig", bones, parts)
    queen_actions(rig, "queen_")
    c, bones, parts = build_eggsac()
    rig = build_rig(c.name, "EggSac", "EggSacRig", bones, parts)
    eggsac_actions(rig, "eggsac_")
    if export:
        export_animated("Enemy_Queen", "QueenRig", "queen_", r"station\queen.glb")
        export_animated("Enemy_EggSac", "EggSacRig", "eggsac_", r"station\eggsac.glb")
