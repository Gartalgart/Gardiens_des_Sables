# U1 phase 6: the Kraken, the pirates' boss, in two models.
#   kraken    the head: a great mantle with yellow eyes and a beak, arm stubs at its foot; it rises
#             out of the deep water between the piers (the boss entity)
#   tentacle  one tentacle on a chain of six bones; the game raises four of them along the shore
# Models face -Y and stand on the sea floor at the origin; each rigid part follows one bone.
# Built in the "Kraken" scene of port.blend, exported to public/models/pirates/<name>.glb.
# Usage inside Blender, after helpers.py and rig.py (the MCP's safe mode: send everything inline,
# with rig.py's base_name written without `re` and stash_tracks without a lambda).
import bpy

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
