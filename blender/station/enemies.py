# U2 phase 3: the station's basic enemies, rigged and animated like the others (blender/rig.py).
#   host      an infected crew member (runner build, slow): torn flight suit, grey skin, black
#             growths bursting from the chest and back; shambles, lunges with both hands
#   parasite  the face-hugger: a flat body on eight long finger-legs and a tail; scuttles, leaps,
#             and wraps itself round a face ("hold")
#   brute     the armoured brute (colossus build): a hunched dark hide, a bone carapace in front of
#             its head and shoulders, long arms with claws; charges head down
#   drone     (phase 4) the security drone, not rigged: four rotors (Rotor0..3, spun by the game), a
#             red eye (DEye) and a laser under it
#   crawler   (phase 4) the duct crawler: a long segmented body low on six legs, a curled tail
# Models face -Y and stand at the origin. Each rigid part follows one bone (no deformation).
# Built in the "Enemies" scene of station.blend, exported to public/models/station/<type>.glb.
# Usage inside Blender, after helpers.py and the parts of rig.py written below without `re` or
# lambdas (the MCP's safe mode): build_all().
import bpy
import math
from mathutils import Vector, Euler

FPS = 30

mat("HostSuit", (0.12, 0.11, 0.07), rough=0.95)
mat("HostSkin", (0.42, 0.44, 0.4), rough=0.7)
mat("HostVein", (0.12, 0.16, 0.1), rough=0.8)
mat("HostGrowth", (0.015, 0.018, 0.02), rough=0.2, metal=0.35)
mat("HostEye", (0.85, 0.95, 0.5), emit=(0.8, 0.95, 0.4), strength=5.0)
mat("HostBoot", (0.03, 0.03, 0.03), rough=0.7)
mat("ParaSkin", (0.55, 0.47, 0.36), rough=0.45)
mat("ParaDark", (0.3, 0.24, 0.17), rough=0.5)
mat("ParaSac", (0.62, 0.5, 0.42), rough=0.3)
mat("BruteHide", (0.04, 0.045, 0.05), rough=0.3, metal=0.3)
mat("BruteShell", (0.32, 0.28, 0.2), rough=0.4, metal=0.1)
mat("BruteClaw", (0.55, 0.5, 0.4), rough=0.35)
mat("BruteEye", (1.0, 0.4, 0.1), emit=(1.0, 0.35, 0.05), strength=8.0)
mat("BruteMaw", (0.35, 0.05, 0.05), rough=0.4)
mat("DroneBody", (0.2, 0.21, 0.22), rough=0.4, metal=0.6)
mat("DroneDark", (0.03, 0.03, 0.035), rough=0.5, metal=0.5)
mat("DroneStripe", (0.8, 0.55, 0.04), rough=0.6)
mat("DroneEye", (1.0, 0.1, 0.05), emit=(1.0, 0.08, 0.03), strength=6.0)
mat("CrawlerShell", (0.035, 0.03, 0.028), rough=0.25, metal=0.3)
mat("CrawlerBelly", (0.3, 0.26, 0.2), rough=0.6)
mat("CrawlerMaw", (0.4, 0.06, 0.05), rough=0.4)


def base_name(name):
    """'Part.001' -> 'Part' (rig.py does it with `re`)"""
    i = name.rfind(".")
    if i > 0 and name[i + 1:].isdigit():
        return name[:i]
    return name


# ---------------------------------------------------------------- the host
def build_host():
    M = bpy.data.materials
    c = get_coll("Enemy_Host", clear=True)
    root = empty("Host", c)
    # head bowed, jaw hanging open, glowing eyes sunk in grey skin, a vein across the brow
    box("HHead", c, (0.2, 0.22, 0.24), (0, -0.03, 1.66), M["HostSkin"], root)
    box("HJaw", c, (0.16, 0.12, 0.06), (0, -0.07, 1.52), M["HostVein"], root, rot=(18, 0, 0))
    box("HEyeL", c, (0.045, 0.02, 0.03), (-0.05, -0.14, 1.68), M["HostEye"], root)
    box("HEyeR", c, (0.045, 0.02, 0.03), (0.05, -0.14, 1.68), M["HostEye"], root)
    box("HBrow", c, (0.21, 0.04, 0.03), (0, -0.13, 1.73), M["HostVein"], root)
    box("HNeck", c, (0.1, 0.1, 0.1), (0, 0, 1.52), M["HostSkin"], root)
    # the torso in a torn flight suit; the chest split open, black growths and ribs coming out
    box("HTorso", c, (0.42, 0.24, 0.5), (0, 0, 1.25), M["HostSuit"], root)
    box("HCollar", c, (0.3, 0.26, 0.06), (0, 0, 1.49), M["HostSuit"], root)
    box("HWound", c, (0.2, 0.05, 0.24), (0, -0.12, 1.3), M["HostGrowth"], root)
    for i, (x, a) in enumerate(((-0.07, -25), (0.07, 25), (-0.04, -10), (0.05, 12))):
        box("HRib%d" % i, c, (0.025, 0.12, 0.025), (x, -0.17, 1.24 + i * 0.05), M["HostSkin"], root, rot=(0, a, 0))
    for i, (x, z, s) in enumerate(((0.05, 1.38, 0.13), (-0.08, 1.22, 0.1), (0.1, 1.1, 0.09))):
        sphere("HGrowth%d" % i, c, s, (x, 0.13, z), M["HostGrowth"], root, scale=(1, 0.7, 1.3))
    box("HSpine", c, (0.06, 0.08, 0.4), (0, 0.14, 1.24), M["HostGrowth"], root)
    box("HPelvis", c, (0.36, 0.22, 0.2), (0, 0, 0.93), M["HostSuit"], root)
    box("HBelt", c, (0.37, 0.23, 0.05), (0, 0, 1.02), M["HostBoot"], root)
    for side, x in (("L", -1), ("R", 1)):
        box("HUpper" + side, c, (0.11, 0.11, 0.32), (0.28 * x, 0, 1.3), M["HostSuit"], root)
        box("HFore" + side, c, (0.08, 0.08, 0.3), (0.28 * x, 0, 0.98), M["HostSkin"], root)
        box("HVein" + side, c, (0.02, 0.085, 0.22), (0.3 * x, 0, 1.0), M["HostVein"], root)
        box("HHand" + side, c, (0.09, 0.1, 0.12), (0.28 * x, -0.02, 0.78), M["HostSkin"], root)
        box("HClaw" + side, c, (0.08, 0.06, 0.08), (0.28 * x, -0.08, 0.7), M["HostVein"], root, taper=0.4)
        box("HThigh" + side, c, (0.15, 0.16, 0.42), (0.11 * x, 0, 0.68), M["HostSuit"], root)
        box("HShin" + side, c, (0.13, 0.13, 0.4), (0.11 * x, 0, 0.29), M["HostSuit"], root)
        box("HBoot" + side, c, (0.13, 0.24, 0.11), (0.11 * x, -0.03, 0.06), M["HostBoot"], root)
    bones = [
        ("Hips", None, (0, 0, 0.9), (0, 0, 1.0)),
        ("Spine", "Hips", (0, 0, 1.0), (0, 0, 1.5)),
        ("Head", "Spine", (0, 0, 1.52), (0, 0, 1.85)),
        ("UpperArm_L", "Spine", (-0.28, 0, 1.45), (-0.28, 0, 1.15)),
        ("ForeArm_L", "UpperArm_L", (-0.28, 0, 1.15), (-0.28, 0, 0.75)),
        ("UpperArm_R", "Spine", (0.28, 0, 1.45), (0.28, 0, 1.15)),
        ("ForeArm_R", "UpperArm_R", (0.28, 0, 1.15), (0.28, 0, 0.75)),
        ("Thigh_L", "Hips", (-0.11, 0, 0.88), (-0.11, 0, 0.49)),
        ("Shin_L", "Thigh_L", (-0.11, 0, 0.49), (-0.11, 0, 0.0)),
        ("Thigh_R", "Hips", (0.11, 0, 0.88), (0.11, 0, 0.49)),
        ("Shin_R", "Thigh_R", (0.11, 0, 0.49), (0.11, 0, 0.0)),
    ]
    parts = {"HHead": "Head", "HJaw": "Head", "HEyeL": "Head", "HEyeR": "Head", "HBrow": "Head",
             "HNeck": "Spine", "HTorso": "Spine", "HCollar": "Spine", "HWound": "Spine", "HSpine": "Spine",
             "HPelvis": "Hips", "HBelt": "Hips"}
    for i in range(4):
        parts["HRib%d" % i] = "Spine"
    for i in range(3):
        parts["HGrowth%d" % i] = "Spine"
    for s in "LR":
        parts.update({"HUpper" + s: "UpperArm_" + s, "HFore" + s: "ForeArm_" + s, "HVein" + s: "ForeArm_" + s,
                      "HHand" + s: "ForeArm_" + s, "HClaw" + s: "ForeArm_" + s,
                      "HThigh" + s: "Thigh_" + s, "HShin" + s: "Shin_" + s, "HBoot" + s: "Shin_" + s})
    return c, bones, parts


# ---------------------------------------------------------------- the parasite
def build_parasite():
    M = bpy.data.materials
    c = get_coll("Enemy_Parasite", clear=True)
    root = empty("Parasite", c)
    # a flat body with two air sacs on top, a ridge down the middle
    sphere("PBody", c, 1.0, (0, 0, 0.24), M["ParaSkin"], root, scale=(0.2, 0.26, 0.09), subdiv=2)
    for x in (-0.07, 0.07):
        sphere("PSac", c, 1.0, (x, 0.05, 0.3), M["ParaSac"], root, scale=(0.07, 0.11, 0.05), subdiv=2)
    box("PRidge", c, (0.03, 0.4, 0.03), (0, 0.0, 0.32), M["ParaDark"], root)
    box("PMouth", c, (0.08, 0.05, 0.05), (0, -0.05, 0.16), M["ParaDark"], root)
    # the tail, in segments thinning out behind
    for i in range(5):
        w = 0.07 - i * 0.011
        box("PTail%d" % i, c, (w, 0.14, w), (0, 0.3 + i * 0.13, 0.2 - i * 0.025), M["ParaSkin"], root)
    # eight finger-legs: a knuckle going out and up, a finger coming down to the floor
    for side, x in (("L", -1), ("R", 1)):
        for name, y in (("A", -0.17), ("B", -0.06), ("C", 0.05), ("D", 0.16)):
            box("PKnuckle%s%s" % (name, side), c, (0.22, 0.035, 0.035), (0.24 * x, y, 0.3), M["ParaSkin"], root, rot=(0, -35 * x, 0))
            box("PFinger%s%s" % (name, side), c, (0.03, 0.03, 0.3), (0.38 * x, y - 0.02, 0.17), M["ParaDark"], root, rot=(0, 18 * x, 0), taper=0.5)
    bones = [
        ("Hips", None, (0, 0, 0.15), (0, 0, 0.35)),
        ("Tail", "Hips", (0, 0.24, 0.2), (0, 0.9, 0.12)),
    ]
    for name, y in (("A", -0.17), ("B", -0.06), ("C", 0.05), ("D", 0.16)):
        for side, x in (("L", -1), ("R", 1)):
            bones.append(("Leg_%s_%s" % (name, side), "Hips", (0.14 * x, y, 0.3), (0.14 * x, y, 0.05)))
    parts = {"PBody": "Hips", "PSac": "Hips", "PRidge": "Hips", "PMouth": "Hips"}
    for i in range(5):
        parts["PTail%d" % i] = "Tail"
    for name in "ABCD":
        for s in "LR":
            parts["PKnuckle%s%s" % (name, s)] = "Leg_%s_%s" % (name, s)
            parts["PFinger%s%s" % (name, s)] = "Leg_%s_%s" % (name, s)
    return c, bones, parts


# ---------------------------------------------------------------- the brute
def build_brute():
    M = bpy.data.materials
    c = get_coll("Enemy_Brute", clear=True)
    root = empty("Brute", c)
    # a hunched torso, leaning forward; plates of bone along the back
    box("BTorso", c, (1.0, 0.8, 0.9), (0, 0.05, 1.65), M["BruteHide"], root, rot=(-18, 0, 0))
    box("BBelly", c, (0.8, 0.6, 0.4), (0, 0.05, 1.12), M["BruteHide"], root)
    for i in range(4):
        box("BBackPlate%d" % i, c, (0.6 - i * 0.08, 0.2, 0.08), (0, 0.42 + i * 0.03, 2.15 - i * 0.25), M["BruteShell"], root, rot=(-30, 0, 0))
    # the carapace: a wide plate of bone in front of the head and shoulders, ridged
    box("BShield", c, (1.25, 0.18, 0.95), (0, -0.5, 1.95), M["BruteShell"], root, rot=(12, 0, 0))
    for i, x in enumerate((-0.35, 0, 0.35)):
        box("BShieldRidge%d" % i, c, (0.08, 0.12, 0.85), (x, -0.6, 1.95), M["BruteClaw"], root, rot=(12, 0, 0))
    box("BShieldRim", c, (1.3, 0.22, 0.1), (0, -0.48, 2.45), M["BruteClaw"], root, rot=(12, 0, 0))
    # the head, low under the carapace: glowing eyes, a red maw
    box("BHead", c, (0.42, 0.45, 0.32), (0, -0.62, 1.4), M["BruteHide"], root)
    box("BMaw", c, (0.3, 0.08, 0.12), (0, -0.85, 1.32), M["BruteMaw"], root)
    for i, x in enumerate((-0.1, 0.1)):
        box("BEye%d" % i, c, (0.07, 0.03, 0.04), (x, -0.85, 1.47), M["BruteEye"], root)
        box("BTusk%d" % i, c, (0.04, 0.04, 0.16), (x * 1.3, -0.88, 1.22), M["BruteClaw"], root, taper=0.3)
    # long arms down to the floor, three claws each
    for side, x in (("L", -1), ("R", 1)):
        box("BShoulder" + side, c, (0.36, 0.4, 0.34), (0.62 * x, -0.15, 1.95), M["BruteShell"], root)
        box("BUpper" + side, c, (0.26, 0.28, 0.65), (0.7 * x, -0.2, 1.5), M["BruteHide"], root)
        box("BFore" + side, c, (0.24, 0.26, 0.7), (0.72 * x, -0.25, 0.85), M["BruteHide"], root)
        box("BFist" + side, c, (0.3, 0.32, 0.22), (0.72 * x, -0.28, 0.42), M["BruteShell"], root)
        for k in range(3):
            box("BClaw%s%d" % (side, k), c, (0.06, 0.06, 0.28), ((0.62 + k * 0.1) * x, -0.4, 0.25), M["BruteClaw"], root, rot=(25, 0, 0), taper=0.3)
        box("BThigh" + side, c, (0.32, 0.36, 0.55), (0.3 * x, 0.1, 0.78), M["BruteHide"], root)
        box("BShin" + side, c, (0.26, 0.28, 0.5), (0.3 * x, 0.15, 0.28), M["BruteHide"], root)
        box("BFoot" + side, c, (0.32, 0.45, 0.12), (0.3 * x, 0.0, 0.06), M["BruteShell"], root)
    bones = [
        ("Hips", None, (0, 0.1, 1.0), (0, 0.1, 1.2)),
        ("Spine", "Hips", (0, 0.1, 1.2), (0, -0.2, 2.2)),
        ("Head", "Spine", (0, -0.4, 1.5), (0, -0.8, 1.5)),
        ("UpperArm_L", "Spine", (-0.65, -0.15, 1.95), (-0.7, -0.2, 1.2)),
        ("ForeArm_L", "UpperArm_L", (-0.7, -0.2, 1.2), (-0.72, -0.28, 0.3)),
        ("UpperArm_R", "Spine", (0.65, -0.15, 1.95), (0.7, -0.2, 1.2)),
        ("ForeArm_R", "UpperArm_R", (0.7, -0.2, 1.2), (0.72, -0.28, 0.3)),
        ("Thigh_L", "Hips", (-0.3, 0.1, 1.05), (-0.3, 0.12, 0.55)),
        ("Shin_L", "Thigh_L", (-0.3, 0.12, 0.55), (-0.3, 0.1, 0.0)),
        ("Thigh_R", "Hips", (0.3, 0.1, 1.05), (0.3, 0.12, 0.55)),
        ("Shin_R", "Thigh_R", (0.3, 0.12, 0.55), (0.3, 0.1, 0.0)),
    ]
    parts = {"BTorso": "Spine", "BBelly": "Hips", "BShield": "Spine", "BShieldRim": "Spine",
             "BHead": "Head", "BMaw": "Head"}
    for i in range(4):
        parts["BBackPlate%d" % i] = "Spine"
    for i in range(3):
        parts["BShieldRidge%d" % i] = "Spine"
    for i in range(2):
        parts["BEye%d" % i] = "Head"
        parts["BTusk%d" % i] = "Head"
    for s in "LR":
        parts.update({"BShoulder" + s: "UpperArm_" + s, "BUpper" + s: "UpperArm_" + s, "BFore" + s: "ForeArm_" + s,
                      "BFist" + s: "ForeArm_" + s, "BThigh" + s: "Thigh_" + s, "BShin" + s: "Shin_" + s, "BFoot" + s: "Shin_" + s})
        for k in range(3):
            parts["BClaw%s%d" % (s, k)] = "ForeArm_" + s
    return c, bones, parts


# ---------------------------------------------------------------- the security drone
def build_drone():
    M = bpy.data.materials
    c = get_coll("Enemy_Drone", clear=True)
    root = empty("Drone", c)
    box("DBody", c, (0.46, 0.5, 0.22), (0, 0, 0.25), M["DroneBody"], root)
    box("DStripe", c, (0.47, 0.51, 0.05), (0, 0, 0.25), M["DroneStripe"], root)
    box("DDome", c, (0.3, 0.32, 0.1), (0, 0.02, 0.4), M["DroneDark"], root)
    box("DEyeRim", c, (0.16, 0.04, 0.14), (0, -0.26, 0.25), M["DroneDark"], root)
    box("DEye", c, (0.09, 0.02, 0.08), (0, -0.28, 0.25), M["DroneEye"], root)
    box("DGun", c, (0.05, 0.3, 0.05), (0, -0.15, 0.1), M["DroneDark"], root)
    box("DGunTip", c, (0.03, 0.04, 0.03), (0, -0.31, 0.1), M["DroneEye"], root)
    box("DAntenna", c, (0.015, 0.015, 0.2), (0.12, 0.15, 0.52), M["DroneDark"], root)
    for i, (x, y) in enumerate(((-0.34, -0.34), (0.34, -0.34), (-0.34, 0.34), (0.34, 0.34))):
        box("DArm%d" % i, c, (abs(x) * 1.2, 0.04, 0.04), (x * 0.55, y * 0.55, 0.32), M["DroneBody"], root, rot=(0, 0, 45 if x * y > 0 else -45))
        box("DPod%d" % i, c, (0.08, 0.08, 0.08), (x, y, 0.34), M["DroneDark"], root)
        r = empty("Rotor%d" % i, c, (x, y, 0.4), root)
        box("DBlade%da" % i, c, (0.3, 0.035, 0.008), (0, 0, 0), M["DroneDark"], r)
        box("DBlade%db" % i, c, (0.035, 0.3, 0.008), (0, 0, 0), M["DroneDark"], r)
    return c


# ---------------------------------------------------------------- the duct crawler
def build_crawler():
    M = bpy.data.materials
    c = get_coll("Enemy_Crawler", clear=True)
    root = empty("Crawler", c)
    # a long blind head with a red maw and mandibles, three plated segments, a tail curling up
    box("CrHead", c, (0.26, 0.4, 0.18), (0, -0.55, 0.32), M["CrawlerShell"], root, rot=(-8, 0, 0))
    box("CrMaw", c, (0.16, 0.06, 0.08), (0, -0.76, 0.26), M["CrawlerMaw"], root)
    for x in (-0.07, 0.07):
        box("CrMandible", c, (0.03, 0.14, 0.03), (x, -0.8, 0.22), M["CrawlerBelly"], root, rot=(0, 0, 20 if x > 0 else -20))
    for i, (y, w) in enumerate(((-0.25, 0.34), (0.05, 0.38), (0.35, 0.32))):
        box("CrSeg%d" % i, c, (w, 0.3, 0.2), (0, y, 0.3), M["CrawlerShell"], root)
        box("CrBelly%d" % i, c, (w * 0.8, 0.28, 0.06), (0, y, 0.18), M["CrawlerBelly"], root)
        box("CrSpine%d" % i, c, (0.05, 0.2, 0.08), (0, y, 0.43), M["CrawlerBelly"], root)
    for i in range(4):
        box("CrTail%d" % i, c, (0.12 - i * 0.02, 0.18, 0.1 - i * 0.015), (0, 0.6 + i * 0.15, 0.32 + i * i * 0.05), M["CrawlerShell"], root, rot=(-i * 18, 0, 0))
    box("CrSting", c, (0.03, 0.03, 0.18), (0, 1.12, 0.78), M["CrawlerBelly"], root, rot=(-30, 0, 0))
    for side, x in (("L", -1), ("R", 1)):
        for name, y in (("F", -0.25), ("M", 0.05), ("B", 0.35)):
            box("CrLeg%s%s" % (name, side), c, (0.32, 0.04, 0.04), (0.3 * x, y, 0.38), M["CrawlerShell"], root, rot=(0, -30 * x, 0))
            box("CrFoot%s%s" % (name, side), c, (0.03, 0.03, 0.36), (0.46 * x, y, 0.18), M["CrawlerBelly"], root, rot=(0, 12 * x, 0))
    bones = [
        ("Hips", None, (0, 0.05, 0.2), (0, 0.05, 0.4)),
        ("Head", "Hips", (0, -0.35, 0.3), (0, -0.8, 0.3)),
        ("Tail", "Hips", (0, 0.5, 0.3), (0, 1.2, 0.8)),
    ]
    for name, y in (("F", -0.25), ("M", 0.05), ("B", 0.35)):
        for side, x in (("L", -1), ("R", 1)):
            bones.append(("Leg_%s_%s" % (name, side), "Hips", (0.2 * x, y, 0.4), (0.2 * x, y, 0.0)))
    parts = {"CrHead": "Head", "CrMaw": "Head", "CrMandible": "Head", "CrSting": "Tail"}
    for i in range(3):
        parts["CrSeg%d" % i] = "Hips"
        parts["CrBelly%d" % i] = "Hips"
        parts["CrSpine%d" % i] = "Hips"
    for i in range(4):
        parts["CrTail%d" % i] = "Tail"
    for name in "FMB":
        for s in "LR":
            parts["CrLeg%s%s" % (name, s)] = "Leg_%s_%s" % (name, s)
            parts["CrFoot%s%s" % (name, s)] = "Leg_%s_%s" % (name, s)
    return c, bones, parts


# ---------------------------------------------------------------- rigging (rig.py, safe-mode form)
def build_rig(coll_name, root_name, rig_name, bones, parts):
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
    return rig


def add_action(rig, name, keys, loop=True):
    act = bpy.data.actions.get(name)
    if act:
        bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    bones = [pb.name for pb in rig.pose.bones]
    locs = {"Hips"}
    for t, pose in keys:
        for b in pose:
            if b.startswith("_loc_"):
                locs.add(b[5:])
    for t, pose in keys:
        f = 1 + round(t * FPS)
        for b in bones:
            pb = rig.pose.bones[b]
            pb.rotation_euler = Euler([math.radians(a) for a in pose.get(b, (0, 0, 0))])
            pb.keyframe_insert("rotation_euler", frame=f)
        for b in sorted(locs):
            pb = rig.pose.bones[b]
            pb.location = Vector(pose.get("_loc_" + b, (0, 0, 0)))
            pb.keyframe_insert("location", frame=f)
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    act["loop"] = loop
    return act


def stash_tracks(rig, prefix):
    ad = rig.animation_data or rig.animation_data_create()
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    for name in sorted([a.name for a in bpy.data.actions if a.name.startswith(prefix)]):
        act = bpy.data.actions[name]
        tr = ad.nla_tracks.new()
        tr.name = name[len(prefix):]
        st = tr.strips.new(name, int(act.frame_range[0]), act)
        if hasattr(st, "action_slot") and st.action_slot is None and len(act.slots):
            st.action_slot = act.slots[0]
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)


def export_animated(coll_name, rig_name, prefix, filename):
    stash_tracks(bpy.data.objects[rig_name], prefix)
    coll = bpy.data.collections[coll_name]
    bpy.ops.object.select_all(action="DESELECT")
    for ob in coll.all_objects:
        ob.hide_set(False)
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=MODELS + "\\" + filename, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_force_sampling=True, export_def_bones=False, use_active_scene=True)
    bpy.ops.object.select_all(action="DESELECT")


def export_static(coll_name, filename):
    """a model without a rig (the drone: the game spins its rotors)"""
    bpy.ops.object.select_all(action="DESELECT")
    for ob in bpy.data.collections[coll_name].all_objects:
        ob.hide_set(False)
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=MODELS + "\\" + filename, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, use_active_scene=True)
    bpy.ops.object.select_all(action="DESELECT")


# ---------------------------------------------------------------- animations
def mirror(pose):
    out = {}
    for k, v in pose.items():
        if k.endswith("_L"):
            out[k[:-2] + "_R"] = v
        elif k.endswith("_R"):
            out[k[:-2] + "_L"] = v
        else:
            out[k] = v
    return out


def held(pose, extra, up):
    out = mirror(pose)
    for k, v in (extra or {}).items():
        if k in up:
            out[k] = v
    return out


def gait(rig, name, period, thigh, shin, arm, fore, lean, bob, head=0, extra=None):
    a = {
        "Thigh_L": (-thigh, 0, 0), "Shin_L": (shin * 0.3, 0, 0),
        "Thigh_R": (thigh, 0, 0), "Shin_R": (shin, 0, 0),
        "UpperArm_L": (arm, 0, 0), "UpperArm_R": (-arm, 0, 0),
        "ForeArm_L": (-fore, 0, 0), "ForeArm_R": (-fore, 0, 0),
        "Spine": (lean, 0, 0), "Head": (head, 0, 0),
        "_loc_Hips": (0, 0, 0),
    }
    if extra:
        a.update(extra)
    up = dict(a)
    for k in ("Thigh_L", "Thigh_R", "UpperArm_L", "UpperArm_R"):
        up[k] = (extra or {}).get(k, (0, 0, 0))
    up["Shin_L"] = up["Shin_R"] = (shin * 0.6, 0, 0)
    up["_loc_Hips"] = (0, bob, 0)
    keys = [(0, a), (period * 0.25, up), (period * 0.5, held(a, extra, up)), (period * 0.75, held(up, extra, up)), (period, a)]
    return add_action(rig, name, keys)


def host_actions(rig, p):
    """a shamble: head lolling to one side, arms half raised toward the prey, a limp"""
    reach = {"UpperArm_L": (-55, 0, 8), "UpperArm_R": (-45, 0, -8), "ForeArm_L": (-20, 0, 0), "ForeArm_R": (-30, 0, 0), "Head": (12, 0, 18)}
    add_action(rig, p + "idle", [
        (0, dict(reach, Spine=(14, 0, 4), _loc_Hips=(0, 0, 0))),
        (0.7, dict(reach, Spine=(18, 0, -3), Head=(20, 0, -14), _loc_Hips=(0, -0.02, 0))),
        (0.85, dict(reach, Spine=(10, 6, 0), Head=(-10, 30, 25), _loc_Hips=(0, -0.02, 0))),  # a twitch
        (1.6, dict(reach, Spine=(14, 0, 4), _loc_Hips=(0, 0, 0))),
    ])
    gait(rig, p + "walk", 1.3, 22, 30, 0, 10, 16, 0.03, head=10, extra=reach)
    gait(rig, p + "run", 0.9, 34, 45, 0, 15, 22, 0.05, head=6, extra=reach)
    # the lunge: both hands drawn back for 0.4 s, then thrown forward at the face
    back = {"UpperArm_L": (-20, 0, 25), "UpperArm_R": (-20, 0, -25), "ForeArm_L": (-60, 0, 0), "ForeArm_R": (-60, 0, 0), "Spine": (-8, 0, 0), "Head": (-15, 0, 0)}
    grab = {"UpperArm_L": (-95, 0, 5), "UpperArm_R": (-95, 0, -5), "ForeArm_L": (-5, 0, 0), "ForeArm_R": (-5, 0, 0), "Spine": (28, 0, 0), "Head": (5, 0, 0),
            "Thigh_L": (-25, 0, 0), "Shin_L": (25, 0, 0)}
    add_action(rig, p + "attack", [(0, reach), (0.4, back), (0.48, grab), (0.8, dict(reach, Spine=(16, 0, 0)))], loop=False)
    stun_a = {"Spine": (-14, 0, 10), "Head": (-20, 25, 15), "UpperArm_L": (15, 0, 0), "UpperArm_R": (15, 0, 0)}
    stun_b = {"Spine": (-8, 0, -10), "Head": (-8, -25, -15), "UpperArm_L": (8, 0, 0), "UpperArm_R": (8, 0, 0)}
    add_action(rig, p + "stun", [(0, stun_a), (0.4, stun_b), (0.8, stun_a)])
    add_action(rig, p + "hit", [(0, {}), (0.06, {"Spine": (-16, 0, 0), "Head": (-25, 0, 0)}), (0.25, {})], loop=False)


def parasite_actions(rig, p):
    """the legs are vertical bones like the crab's: a turn round Y swings them, round X/Z spreads them"""
    a, b = {}, {}
    for name, k in (("A", 1), ("B", -1), ("C", 1), ("D", -1)):
        a["Leg_%s_L" % name] = (0, 25 * k, 0)
        a["Leg_%s_R" % name] = (0, -25 * k, 0)
        b["Leg_%s_L" % name] = (0, -25 * k, 0)
        b["Leg_%s_R" % name] = (0, 25 * k, 0)
    a["Tail"] = (0, 0, 15)
    b["Tail"] = (0, 0, -15)
    b["_loc_Hips"] = (0, 0.03, 0)
    add_action(rig, p + "walk", [(0, a), (0.14, b), (0.28, a)])
    add_action(rig, p + "run", [(0, a), (0.09, b), (0.18, a)])
    add_action(rig, p + "idle", [(0, {"Tail": (8, 0, 20)}), (0.8, {"Tail": (-5, 0, -20), "_loc_Hips": (0, 0.02, 0)}), (1.6, {"Tail": (8, 0, 20)})])
    # the leap: crouched, then every finger spread wide, the tail straight out behind
    spread, crouch = {}, {"_loc_Hips": (0, -0.08, 0), "Tail": (25, 0, 0)}
    for name in "ABCD":
        spread["Leg_%s_L" % name] = (0, 0, -70)
        spread["Leg_%s_R" % name] = (0, 0, 70)
    spread["Tail"] = (-20, 0, 0)
    add_action(rig, p + "leap", [(0, crouch), (0.1, spread), (0.5, spread)], loop=False)
    # on a face: the fingers wrapped round the head, the tail round the neck, squeezing
    wrap, squeeze = {"Tail": (60, 0, 30)}, {"Tail": (70, 0, 40), "_loc_Hips": (0, 0.02, 0)}
    for name in "ABCD":
        wrap["Leg_%s_L" % name] = (0, 0, 55)
        wrap["Leg_%s_R" % name] = (0, 0, -55)
        squeeze["Leg_%s_L" % name] = (0, 0, 65)
        squeeze["Leg_%s_R" % name] = (0, 0, -65)
    add_action(rig, p + "hold", [(0, wrap), (0.3, squeeze), (0.6, wrap)])
    add_action(rig, p + "attack", [(0, {}), (0.08, {"Leg_A_L": (0, 0, -40), "Leg_A_R": (0, 0, 40), "Tail": (30, 0, 0)}), (0.2, {})], loop=False)
    add_action(rig, p + "stun", [(0, {"Hips": (0, 0, 20)}), (0.2, {"Hips": (0, 0, -20)}), (0.4, {"Hips": (0, 0, 20)})])
    add_action(rig, p + "hit", [(0, {}), (0.05, {"Hips": (-15, 0, 0)}), (0.2, {})], loop=False)


def brute_actions(rig, p):
    """the colossus' set: a heavy gait on its knuckles, both fists smashing down, head lowered to charge"""
    knuckles = {"UpperArm_L": (-10, 0, 0), "UpperArm_R": (-10, 0, 0)}
    add_action(rig, p + "idle", [
        (0, dict(knuckles, Spine=(4, 0, 0), _loc_Hips=(0, 0, 0))),
        (1.2, dict(knuckles, Spine=(8, 0, 3), Head=(5, 8, 0), _loc_Hips=(0, -0.04, 0))),
        (2.4, dict(knuckles, Spine=(4, 0, 0), _loc_Hips=(0, 0, 0))),
    ])
    gait(rig, p + "walk", 1.4, 18, 22, 22, 8, 10, 0.05)
    gait(rig, p + "run", 0.85, 30, 38, 38, 12, 18, 0.08, head=8)
    # both fists raised over the carapace, then brought down
    up = {"UpperArm_L": (-150, 0, 15), "UpperArm_R": (-150, 0, -15), "ForeArm_L": (-30, 0, 0), "ForeArm_R": (-30, 0, 0), "Spine": (-15, 0, 0)}
    down = {"UpperArm_L": (-40, 0, 0), "UpperArm_R": (-40, 0, 0), "ForeArm_L": (-5, 0, 0), "ForeArm_R": (-5, 0, 0), "Spine": (28, 0, 0), "_loc_Hips": (0, -0.12, 0)}
    add_action(rig, p + "attack", [(0, knuckles), (0.45, up), (0.53, down), (0.85, knuckles)], loop=False)
    # the charge: head and carapace lowered, legs pounding
    low = {"Spine": (30, 0, 0), "Head": (10, 0, 0), "UpperArm_L": (20, 0, 10), "UpperArm_R": (20, 0, -10), "_loc_Hips": (0, -0.12, 0)}
    add_action(rig, p + "chargeWind", [(0, knuckles), (0.3, low), (0.45, dict(low, Head=(-10, 0, 0))), (0.75, low)], loop=False)
    run_a = dict(low, Thigh_L=(-40, 0, 0), Thigh_R=(30, 0, 0), Shin_R=(40, 0, 0))
    run_b = dict(low, Thigh_L=(30, 0, 0), Thigh_R=(-40, 0, 0), Shin_L=(40, 0, 0), _loc_Hips=(0, -0.05, 0))
    add_action(rig, p + "charge", [(0, run_a), (0.18, run_b), (0.36, run_a)])
    add_action(rig, p + "stun", [(0, {"Spine": (-10, 0, 8), "Head": (-10, 20, 0)}), (0.5, {"Spine": (-6, 0, -8), "Head": (-6, -20, 0)}), (1.0, {"Spine": (-10, 0, 8), "Head": (-10, 20, 0)})])
    add_action(rig, p + "hit", [(0, {}), (0.06, {"Spine": (-10, 0, 0)}), (0.25, {})], loop=False)


def crawler_actions(rig, p):
    """a fast tripod scuttle (the crab's), the head darting forward to bite, the tail lashing"""
    a = {"Leg_F_L": (0, 25, 0), "Leg_M_R": (0, -25, 0), "Leg_B_L": (0, 25, 0),
         "Leg_F_R": (0, 25, 0), "Leg_M_L": (0, -25, 0), "Leg_B_R": (0, 25, 0), "Tail": (0, 0, 10), "_loc_Hips": (0, 0, 0)}
    b = {}
    for k, v in a.items():
        if k.startswith("Leg"):
            b[k] = (0, -v[1], 0)
    b["Tail"] = (0, 0, -10)
    b["_loc_Hips"] = (0, 0.03, 0)
    add_action(rig, p + "walk", [(0, a), (0.2, b), (0.4, a)])
    add_action(rig, p + "run", [(0, a), (0.11, b), (0.22, a)])
    add_action(rig, p + "idle", [(0, {"Head": (0, 10, 0), "Tail": (10, 0, 0)}), (0.6, {"Head": (5, -10, 0), "Tail": (-10, 0, 0)}), (1.2, {"Head": (0, 10, 0), "Tail": (10, 0, 0)})])
    add_action(rig, p + "attack", [(0, {}), (0.1, {"Head": (-20, 0, 0), "_loc_Hips": (0, -0.05, 0)}), (0.15, {"Head": (15, 0, 0), "Tail": (35, 0, 0)}), (0.4, {})], loop=False)
    add_action(rig, p + "leap", [(0, {"Head": (-15, 0, 0), "Tail": (30, 0, 0)}), (0.4, {"Head": (10, 0, 0), "Tail": (-20, 0, 0)})], loop=False)
    add_action(rig, p + "stun", [(0, {"Hips": (0, 0, 15)}), (0.3, {"Hips": (0, 0, -15)}), (0.6, {"Hips": (0, 0, 15)})])
    add_action(rig, p + "hit", [(0, {}), (0.05, {"Hips": (-12, 0, 0)}), (0.2, {})], loop=False)


def build_all(export=True):
    scene = bpy.data.scenes.get("Enemies") or bpy.data.scenes.new("Enemies")
    bpy.context.window.scene = scene
    c, bones, parts = build_host()
    rig = build_rig(c.name, "Host", "HostRig", bones, parts)
    host_actions(rig, "host_")
    c, bones, parts = build_parasite()
    rig = build_rig(c.name, "Parasite", "ParasiteRig", bones, parts)
    parasite_actions(rig, "parasite_")
    c, bones, parts = build_brute()
    rig = build_rig(c.name, "Brute", "BruteRig", bones, parts)
    brute_actions(rig, "brute_")
    build_drone()
    c, bones, parts = build_crawler()
    rig = build_rig(c.name, "Crawler", "CrawlerRig", bones, parts)
    crawler_actions(rig, "crawler_")
    if export:
        export_animated("Enemy_Crawler", "CrawlerRig", "crawler_", r"station\crawler.glb")
        export_static("Enemy_Drone", r"station\drone.glb")
        export_animated("Enemy_Host", "HostRig", "host_", r"station\host.glb")
        export_animated("Enemy_Parasite", "ParasiteRig", "parasite_", r"station\parasite.glb")
        export_animated("Enemy_Brute", "BruteRig", "brute_", r"station\brute.glb")
