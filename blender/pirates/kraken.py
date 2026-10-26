# U1 phase 6: the Kraken, the pirates' boss, in three models.
#   kraken    the head: a great mantle with yellow eyes and a beak, arm stubs at its foot; it rises
#             out of the deep water between the piers (the boss entity)
#   tentacle  one tentacle on a chain of six bones; the game raises four of them along the shore
#   kraken_walk  the giant out of the water (its second health bar): the whole Kraken, 18 m tall,
#             walking on eight arms through the village (build_giant)
# Models face -Y and stand on the sea floor at the origin; each rigid part follows one bone.
# Built in the "Kraken" scene of port.blend, exported to public/models/pirates/<name>.glb.
# Usage inside Blender, after helpers.py and rig.py (the MCP's safe mode: send everything inline,
# with rig.py's base_name written without `re` and stash_tracks without a lambda).
import bpy
from mathutils import Quaternion

mat("KrakenSkin", (0.22, 0.04, 0.1), rough=0.45, metal=0.1)
mat("KrakenDark", (0.1, 0.02, 0.05), rough=0.5)
mat("KrakenBelly", (0.55, 0.3, 0.32), rough=0.6)
mat("KrakenSucker", (0.8, 0.55, 0.55), rough=0.5)
mat("KrakenEye", (1.0, 0.8, 0.2), emit=(1.0, 0.75, 0.15), strength=8.0)
mat("KrakenPupil", (0.01, 0.01, 0.01), rough=0.3)
mat("KrakenBeak", (0.08, 0.07, 0.06), rough=0.35, metal=0.2)

SEGS = 6  # tentacle segments
SEG = 0.9  # their length


def build_tentacle():
    M = bpy.data.materials
    c = get_coll("Kraken_Tentacle", clear=True)
    root = empty("Tentacle", c)
    bones, parts = [], {}
    for i in range(SEGS):
        w = 0.62 - i * 0.085
        z = SEG * i
        box("TSeg%d" % i, c, (w, w * 0.9, SEG * 1.02), (0, 0, z + SEG / 2), M["KrakenSkin"], root, taper=0.88)
        # two suckers on the inner side (-Y), getting smaller toward the tip
        for k, dz in enumerate((0.25, 0.65)):
            box("TSuck%d_%d" % (i, k), c, (w * 0.5, 0.05, 0.16), (0, -w * 0.45, z + dz), M["KrakenSucker"], root)
        bones.append(("T%d" % i, "T%d" % (i - 1) if i else None, (0, 0, z), (0, 0, z + SEG)))
        parts["TSeg%d" % i] = "T%d" % i
        parts["TSuck%d_0" % i] = parts["TSuck%d_1" % i] = "T%d" % i
    box("TTip", c, (0.14, 0.12, 0.5), (0, 0, SEG * SEGS + 0.22), M["KrakenSkin"], root, taper=0.2)
    parts["TTip"] = "T%d" % (SEGS - 1)
    return c, bones, parts


def build_kraken():
    M = bpy.data.materials
    c = get_coll("Kraken_Head", clear=True)
    root = empty("Kraken", c)
    # the body at the waterline, the tall mantle above it, ridges down its back
    box("KBody", c, (4.2, 3.6, 2.0), (0, 0.1, 1.4), M["KrakenSkin"], root, taper=0.85)
    box("KBelly", c, (3.0, 0.3, 1.4), (0, -1.6, 1.6), M["KrakenBelly"], root)
    box("KMantle", c, (3.6, 3.0, 3.0), (0, 0.3, 3.9), M["KrakenSkin"], root, taper=0.62)
    box("KMantleTop", c, (2.1, 1.8, 1.3), (0, 0.45, 5.9), M["KrakenSkin"], root, taper=0.45)
    for i, z in enumerate((3.2, 4.3, 5.4)):
        box("KRidge%d" % i, c, (0.25, 0.5, 0.5), (0, 1.55 - i * 0.25, z), M["KrakenDark"], root, taper=0.2)
    # two great yellow eyes with slit pupils, a hooked beak under them
    for side, x in (("L", -1), ("R", 1)):
        sphere("KEye" + side, c, 0.45, (1.05 * x, -1.35, 3.3), M["KrakenEye"], root, subdiv=2)
        box("KPupil" + side, c, (0.1, 0.06, 0.55), (1.05 * x, -1.79, 3.3), M["KrakenPupil"], root)
        box("KBrow" + side, c, (0.9, 0.3, 0.2), (1.05 * x, -1.4, 3.85), M["KrakenDark"], root, rot=(0, 15 * x, 0))
    box("KBeakTop", c, (0.7, 0.6, 0.45), (0, -1.75, 2.55), M["KrakenBeak"], root, taper=0.5)
    box("KBeakJaw", c, (0.55, 0.5, 0.3), (0, -1.7, 2.1), M["KrakenBeak"], root)
    # thick arm stubs around its foot, half under the water
    bones = [
        ("Hips", None, (0, 0, 0), (0, 0, 2.4)),
        ("Head", "Hips", (0, 0, 2.4), (0, 0, 6.5)),
        ("Jaw", "Head", (0, -1.4, 2.25), (0, -2.0, 2.25)),
    ]
    parts = {"KBody": "Hips", "KBelly": "Hips", "KMantle": "Head", "KMantleTop": "Head", "KBeakTop": "Head", "KBeakJaw": "Jaw"}
    for i in range(3):
        parts["KRidge%d" % i] = "Head"
    for s in "LR":
        parts["KEye" + s] = parts["KPupil" + s] = parts["KBrow" + s] = "Head"
    for i in range(6):
        a = math.radians(-150 + i * 60)
        x, y = math.cos(a), math.sin(a)
        box("KArm%d" % i, c, (0.7, 1.8, 0.6), (x * 2.4, y * 2.1, 0.5), M["KrakenSkin"], root,
                   rot=(0, 0, math.degrees(a) - 90), taper=0.6)
        bones.append(("Arm%d" % i, "Hips", (x * 1.7, y * 1.5, 0.5), (x * 3.2, y * 2.8, 0.5)))
        parts["KArm%d" % i] = "Arm%d" % i
    return c, bones, parts


def tpose(xs, zs=(0,) * SEGS):
    """a tentacle pose: each segment's bend forward (X) and sideways (Z), in degrees"""
    return {"T%d" % i: (xs[i], 0, zs[i]) for i in range(SEGS)}


def tentacle_actions(rig, p):
    """bones are stacked upward: +X bends a segment forward (-Y), Z sways it sideways"""
    sway_a = tpose((5, 8, 10, 6, 4, 8), (4, -6, 8, -8, 6, -4))
    sway_b = tpose((2, 4, 6, 10, 8, 4), (-4, 6, -8, 8, -6, 4))
    for name in ("idle", "walk", "run"):
        add_action(rig, p + name, [(0, sway_a), (1.5, sway_b), (3.0, sway_a)])
    # strike: reared back over 0.4 s (the game stretches it to the warning), slammed down forward
    rear = tpose((-10, -15, -20, -20, -15, -10))
    slam = tpose((22, 20, 20, 18, 14, 10))
    add_action(rig, p + "attack", [(0, sway_a), (0.4, rear), (0.48, slam), (0.75, slam), (1.1, sway_a)], loop=False)
    # grab: reaching out, then curling the tip around the player
    reach = tpose((15, 15, 15, 15, 12, 10))
    curl = tpose((12, 15, 20, 38, 45, 50))
    add_action(rig, p + "grab", [(0, sway_a), (0.4, reach), (0.6, curl)], loop=False)
    add_action(rig, p + "hold", [(0, curl), (0.4, tpose((14, 18, 24, 42, 50, 55))), (0.8, curl)])
    add_action(rig, p + "stun", [(0, tpose((0, -10, 10, -10, 10, -10))), (0.4, tpose((0, 10, -10, 10, -10, 10))), (0.8, tpose((0, -10, 10, -10, 10, -10)))])
    add_action(rig, p + "hit", [(0, {}), (0.05, tpose((-6, -8, -10, -10, -8, -6))), (0.25, {})], loop=False)


def kraken_actions(rig, p):
    arms_a = {"Arm%d" % i: ((-1) ** i * 8, 0, (-1) ** i * 6) for i in range(6)}
    arms_b = {"Arm%d" % i: (-((-1) ** i) * 8, 0, -((-1) ** i) * 6) for i in range(6)}
    breathe_a = dict(arms_a, Head=(3, 0, 2), _loc_Hips=(0, 0, 0))
    breathe_b = dict(arms_b, Head=(-3, 0, -2), _loc_Hips=(0, 0.15, 0))
    for name in ("idle", "walk", "run"):
        add_action(rig, p + name, [(0, breathe_a), (2.0, breathe_b), (4.0, breathe_a)])
    # spit: reared back with the beak open for 0.4 s, then thrown forward
    add_action(rig, p + "cast", [
        (0, breathe_a),
        (0.4, dict(arms_b, Head=(-14, 0, 0), Jaw=(35, 0, 0), _loc_Hips=(0, 0.2, 0))),
        (0.5, dict(arms_a, Head=(12, 0, 0), Jaw=(40, 0, 0), _loc_Hips=(0, -0.1, 0))),
        (0.9, breathe_a),
    ], loop=False)
    add_action(rig, p + "attack", [(0, breathe_a), (0.4, dict(Head=(-10, 0, 0), Jaw=(30, 0, 0))), (0.6, breathe_a)], loop=False)
    add_action(rig, p + "stun", [(0, dict(Head=(0, 0, 6))), (0.5, dict(Head=(0, 0, -6))), (1.0, dict(Head=(0, 0, 6)))])
    add_action(rig, p + "hit", [(0, {}), (0.06, dict(Head=(-6, 0, 0), Jaw=(15, 0, 0))), (0.3, {})], loop=False)


def build_all(export=True):
    scene = bpy.data.scenes.get("Kraken") or bpy.data.scenes.new("Kraken")
    bpy.context.window.scene = scene
    c, bones, parts = build_tentacle()
    rig = build_rig(c.name, "Tentacle", "TentacleRig", bones, parts)
    tentacle_actions(rig, "tentacle_")
    c, bones, parts = build_kraken()
    rig = build_rig(c.name, "Kraken", "KrakenRig", bones, parts)
    kraken_actions(rig, "kraken_")
    if export:
        export_animated("Kraken_Tentacle", "TentacleRig", "tentacle_", r"pirates\tentacle.glb")
        export_animated("Kraken_Head", "KrakenRig", "kraken_", r"pirates\kraken.glb")
    build_giant(export)


# ---------------------------------------------------------------- the giant, out of the water
# Its second health bar: the whole Kraken at its game size (18 m), the mantle raised on eight arms
# that it walks on like a spider. Arm i leaves the hub at angle ARM_A[i] (0 = straight ahead, -Y,
# turning toward +X); arms 0 (front right) and 7 (front left) are the ones that strike.
ARMS = 8
ARM_A = [22.5 + 45 * i for i in range(ARMS)]
# each arm: the joints from the hub out to the tip lying on the ground, as (distance out, height)
ARM_JOINTS = [(2.6, 6.4), (5.6, 7.6), (7.8, 4.6), (8.6, 1.4), (10.0, 0.25)]
ARM_W = [1.5, 1.2, 0.9, 0.6]  # thickness of its four segments


def arm_dir(i):
    a = math.radians(ARM_A[i])
    return Vector((math.sin(a), -math.cos(a), 0))


def arm_point(i, k):
    d, z = ARM_JOINTS[k]
    return arm_dir(i) * d + Vector((0, 0, z))


def segment(name, c, a, b, w, material, root, taper=0.8):
    """a tapered box from point a to point b"""
    d = b - a
    ob = box(name, c, (w, w * 0.85, d.length * 1.04), (a + b) / 2, material, root, taper=taper)
    ob.rotation_euler = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
    return ob


def build_walker():
    M = bpy.data.materials
    c = get_coll("Kraken_Walker", clear=True)
    root = empty("KrakenWalker", c)
    # the hub the arms leave from, the mantle towering over it, ridges down its back
    box("WBody", c, (6.4, 6.0, 3.4), (0, 0.2, 7.0), M["KrakenSkin"], root, taper=0.9)
    box("WBelly", c, (4.6, 0.4, 2.4), (0, -2.85, 6.9), M["KrakenBelly"], root)
    box("WMantle", c, (6.0, 5.4, 6.0), (0, 0.6, 11.6), M["KrakenSkin"], root, taper=0.62)
    box("WMantleTop", c, (3.6, 3.2, 2.6), (0, 0.9, 15.6), M["KrakenSkin"], root, taper=0.45)
    box("WMantleTip", c, (1.6, 1.4, 1.2), (0, 1.0, 17.4), M["KrakenSkin"], root, taper=0.3)
    for i, z in enumerate((10.0, 12.2, 14.4)):
        box("WRidge%d" % i, c, (0.45, 0.9, 0.9), (0, 3.4 - i * 0.55, z), M["KrakenDark"], root, taper=0.2)
    # the great yellow eyes with slit pupils under heavy brows, the hooked beak under them
    for side, x in (("L", -1), ("R", 1)):
        sphere("WEye" + side, c, 0.8, (1.85 * x, -2.75, 9.4), M["KrakenEye"], root, subdiv=2)
        box("WPupil" + side, c, (0.18, 0.1, 1.0), (1.85 * x, -3.53, 9.4), M["KrakenPupil"], root)
        box("WBrow" + side, c, (1.6, 0.5, 0.35), (1.85 * x, -2.95, 10.4), M["KrakenDark"], root, rot=(0, 15 * x, 0))
    box("WBeakTop", c, (1.2, 1.0, 0.8), (0, -3.25, 7.4), M["KrakenBeak"], root, taper=0.5)
    box("WBeakJaw", c, (0.95, 0.85, 0.5), (0, -3.15, 6.6), M["KrakenBeak"], root)
    bones = [
        ("Hips", None, (0, 0, 5.4), (0, 0, 8.6)),
        ("Head", "Hips", (0, 0, 8.6), (0, 0, 18.0)),
        ("Jaw", "Head", (0, -2.6, 6.9), (0, -3.6, 6.9)),
    ]
    parts = {"WBody": "Hips", "WBelly": "Hips", "WBeakJaw": "Jaw"}
    for n in ("WMantle", "WMantleTop", "WMantleTip", "WBeakTop"):
        parts[n] = "Head"
    for i in range(3):
        parts["WRidge%d" % i] = "Head"
    for s in "LR":
        parts["WEye" + s] = parts["WPupil" + s] = parts["WBrow" + s] = "Head"
    # the arms: four segments each, suckers on their underside
    for i in range(ARMS):
        for k in range(4):
            a, b = arm_point(i, k), arm_point(i, k + 1)
            n = "WArm%d_%d" % (i, k)
            segment(n, c, a, b, ARM_W[k], M["KrakenSkin"], root)
            bone = "Arm%d_%d" % (i, k)
            bones.append((bone, "Hips" if k == 0 else "Arm%d_%d" % (i, k - 1), tuple(a), tuple(b)))
            parts[n] = bone
            for j, u in enumerate((0.3, 0.7)):
                p = a.lerp(b, u) - Vector((0, 0, ARM_W[k] * 0.45))
                sn = "WSuck%d_%d_%d" % (i, k, j)
                box(sn, c, (ARM_W[k] * 0.45, ARM_W[k] * 0.45, 0.12), p, M["KrakenSucker"], root)
                parts[sn] = bone
    return c, bones, parts


def arm_pose(rig, i, lifts, swing=0.0):
    """pose of arm i: lifts[k] bends segment k up (degrees, + raises the tip) in the arm's own plane;
    swing turns the whole arm round the vertical at the shoulder (degrees, + = counterclockwise
    seen from above). Returned as {bone: euler degrees}, in each bone's own rest frame."""
    h = arm_dir(i).cross(Vector((0, 0, 1)))  # rotating round it raises the arm
    out = {}
    for k, lift in enumerate(lifts):
        name = "Arm%d_%d" % (i, k)
        to_local = rig.data.bones[name].matrix_local.to_3x3().inverted()
        q = Quaternion(to_local @ h, math.radians(lift))
        if k == 0 and swing:
            q = Quaternion(to_local @ Vector((0, 0, 1)), math.radians(swing)) @ q
        out[name] = tuple(math.degrees(a) for a in q.to_euler("XYZ"))
    return out


def ahead(i, deg):
    """a swing of arm i that moves its tip toward the front (-Y) by about deg degrees"""
    return -deg if math.sin(math.radians(ARM_A[i])) > 0 else deg


def walker_actions(rig, p):
    rest = [0, 0, 0, 0]
    lifted = [16, -6, -10, -4]  # the tip off the ground, the arm folded a little
    def pose(**extra):
        d = {}
        for i in range(ARMS):
            d.update(arm_pose(rig, i, extra.get("lifts", {}).get(i, rest), extra.get("swing", {}).get(i, 0)))
        d.update(extra.get("bones", {}))
        return d

    def breathe(sign):
        lifts = {i: [sign * (2 if i % 2 else -2), 0, 0, sign * 3] for i in range(ARMS)}
        return pose(lifts=lifts, bones={"Head": (sign * 2, 0, sign * 1.5), "_loc_Hips": (0, 0.12 * (sign + 1), 0)})

    add_action(rig, p + "idle", [(0, breathe(-1)), (2.0, breathe(1)), (4.0, breathe(-1))])
    add_action(rig, p + "stun", [(0, breathe(-1)), (0.5, pose(bones={"Head": (0, 0, 5)})), (1.0, pose(bones={"Head": (0, 0, -5)})), (1.5, breathe(-1))])
    # walk: the even arms and the odd ones by turns, like a spider; 2 s a cycle at 2.4 m/s
    A, B = range(0, ARMS, 2), range(1, ARMS, 2)
    S = 9

    def step(front, back, lift_front=None, lift_back=None, bob=0.0, head=0.0):
        sw, li = {}, {}
        for group, s, lf in ((A, front, lift_front), (B, back, lift_back)):
            for i in group:
                sw[i] = ahead(i, s)
                if lf:
                    li[i] = lf
        return pose(swing=sw, lifts=li, bones={"_loc_Hips": (0, bob, 0), "Head": (head, 0, 0)})

    walk = [
        (0.0, step(S, -S)),
        (0.5, step(0, 0, None, lifted, 0.35, 2)),
        (1.0, step(-S, S)),
        (1.5, step(0, 0, lifted, None, 0.35, 2)),
        (2.0, step(S, -S)),
    ]
    add_action(rig, p + "walk", walk)
    add_action(rig, p + "run", walk)
    # slam (the game's 'strike'): the front-left arm reared high, brought down at 0.4 s
    add_action(rig, p + "attack", [
        (0, pose()),
        (0.3, pose(lifts={7: [70, 30, 10, 0]}, swing={7: ahead(7, 12)}, bones={"Head": (-6, 0, 0)})),
        (0.4, pose(lifts={7: [-8, -12, 8, 6]}, swing={7: ahead(7, 12)}, bones={"Head": (6, 0, 0)})),
        (0.75, pose(lifts={7: [-8, -12, 8, 6]}, swing={7: ahead(7, 12)})),
        (1.2, pose()),
    ], loop=False)
    # sweep: the front-right arm swung low from its side across the front, at 0.4 s
    add_action(rig, p + "sweep", [
        (0, pose()),
        (0.32, pose(lifts={0: [22, -10, -6, 0]}, swing={0: -ahead(0, 35)})),
        (0.4, pose(lifts={0: [4, -18, -2, 0]}, swing={0: ahead(0, 20)})),
        (0.6, pose(lifts={0: [10, -14, -4, 0]}, swing={0: ahead(0, 75)})),
        (1.1, pose()),
    ], loop=False)
    # grab: the front-left arm reaches out low and curls at 0.4 s, then holds its catch up by the beak
    curl = [55, 40, 45, 50]
    add_action(rig, p + "grab", [
        (0, pose()),
        (0.3, pose(lifts={7: [-4, 10, 4, -6]}, swing={7: ahead(7, 18)})),
        (0.4, pose(lifts={7: [-2, 14, 22, 30]}, swing={7: ahead(7, 18)})),
        (0.6, pose(lifts={7: [20, 30, 34, 40]}, swing={7: ahead(7, 22)})),
    ], loop=False)
    add_action(rig, p + "hold", [
        (0, pose(lifts={7: curl}, swing={7: ahead(7, 24)}, bones={"Jaw": (30, 0, 0)})),
        (0.5, pose(lifts={7: [c + 6 for c in curl]}, swing={7: ahead(7, 24)}, bones={"Jaw": (12, 0, 0), "Head": (4, 0, 0)})),
        (1.0, pose(lifts={7: curl}, swing={7: ahead(7, 24)}, bones={"Jaw": (30, 0, 0)})),
    ])
    # spit: reared back with the beak open for 0.4 s, then thrown forward
    add_action(rig, p + "cast", [
        (0, pose()),
        (0.4, pose(bones={"Head": (-12, 0, 0), "Jaw": (35, 0, 0), "_loc_Hips": (0, 0.4, 0)})),
        (0.5, pose(bones={"Head": (10, 0, 0), "Jaw": (40, 0, 0)})),
        (0.9, pose()),
    ], loop=False)
    add_action(rig, p + "hit", [(0, {}), (0.06, {"Head": (-4, 0, 0), "Jaw": (12, 0, 0)}), (0.3, {})], loop=False)


def build_giant(export=True):
    win = bpy.context.window or (bpy.context.window_manager.windows[0] if bpy.context.window_manager.windows else None)
    scene = bpy.data.scenes.get("Kraken") or bpy.data.scenes.new("Kraken")
    if win:
        win.scene = scene
    c, bones, parts = build_walker()
    rig = build_rig(c.name, "KrakenWalker", "KrakenWalkerRig", bones, parts)
    walker_actions(rig, "kwalk_")
    if export:
        return export_animated("Kraken_Walker", "KrakenWalkerRig", "kwalk_", r"pirates\kraken_walk.glb")
