# U1 phase 4: the pirates' basic enemies, rigged and animated like the desert's (blender/rig.py).
#   skeleton  the cursed sailor (runner archetype): bones, a bandana, a cutlass; falls apart in bones
#   crab      the giant crab (colossus archetype): a hard shell in front, it charges sideways
#   gunner    the ghost gunner (shooter archetype): floats on the galleon's deck with a swivel gun
#   siren     (phase 5) a siren in the shallows, her tail behind her, who sings with arms open
#   bat       (phase 5) one giant bat, not rigged: the game flaps its wings (WingL, WingR) and
#             draws a swarm of them
# Models face -Y and stand at the origin. Each rigid part follows one bone (no deformation).
# Built in the "Enemies" scene of port.blend, exported to public/models/pirates/<type>.glb.
# Usage inside Blender, after helpers.py and rig.py: the MCP's safe mode allows no exec, no lambda,
# no `re` and no call through a variable, so the parts of rig.py and anims.py used here are sent
# inline in that form (mirror and gait below follow anims.py; build_rig's base_name without `re`).
import bpy

mat("Bone", (0.72, 0.67, 0.55), rough=0.8)
mat("BoneDark", (0.4, 0.35, 0.27), rough=0.9)
mat("Curse", (0.45, 1.0, 0.55), emit=(0.45, 1.0, 0.55), strength=9.0)
mat("Bandana", (0.45, 0.06, 0.05), rough=0.9)
mat("Breeches", (0.1, 0.13, 0.22), rough=0.95)
mat("Boot", (0.06, 0.04, 0.03), rough=0.7)
mat("Steel", (0.55, 0.57, 0.6), rough=0.3, metal=0.9)
mat("Brass", (0.62, 0.45, 0.16), rough=0.35, metal=0.85)
mat("Iron", (0.05, 0.05, 0.055), rough=0.55, metal=0.8)
mat("CrabShell", (0.42, 0.08, 0.04), rough=0.45, metal=0.1)
mat("CrabSpine", (0.6, 0.25, 0.1), rough=0.5)
mat("CrabBelly", (0.62, 0.45, 0.3), rough=0.8)
mat("CrabEye", (1.0, 0.85, 0.3), emit=(1.0, 0.8, 0.25), strength=10.0)
mat("Barnacle", (0.55, 0.55, 0.5), rough=1.0)
# the ghost's materials start with "Ghost": the game draws them see-through
mat("GhostCoat", (0.12, 0.35, 0.33), emit=(0.15, 0.5, 0.45), strength=0.6)
mat("GhostSkin", (0.55, 0.9, 0.85), emit=(0.4, 0.9, 0.8), strength=1.2)
mat("GhostHat", (0.03, 0.06, 0.06), emit=(0.05, 0.15, 0.13), strength=0.5)
mat("GhostEye", (0.7, 1.0, 0.95), emit=(0.6, 1.0, 0.9), strength=12.0)
mat("SirenSkin", (0.42, 0.55, 0.55), rough=0.6)
mat("SirenScale", (0.05, 0.3, 0.3), rough=0.35, metal=0.3)
mat("SirenFin", (0.1, 0.45, 0.4), rough=0.4)
mat("SirenHair", (0.06, 0.18, 0.08), rough=0.9)
mat("SirenShell", (0.85, 0.7, 0.75), rough=0.3, metal=0.2)
mat("SirenEye", (1.0, 0.45, 0.85), emit=(1.0, 0.4, 0.8), strength=12.0)
mat("BatFur", (0.06, 0.04, 0.04), rough=0.95)
mat("BatWing", (0.14, 0.06, 0.06), rough=0.8)
mat("BatEye", (1.0, 0.2, 0.15), emit=(1.0, 0.15, 0.1), strength=10.0)


# ---------------------------------------------------------------- the cursed sailor
def build_skeleton():
    M = bpy.data.materials
    c = get_coll("Enemy_Skeleton", clear=True)
    root = empty("Skeleton", c)
    # skull with a red bandana, glowing eyes, a loose jaw
    box("KSkull", c, (0.22, 0.24, 0.23), (0, -0.01, 1.69), M["Bone"], root)
    box("KJaw", c, (0.17, 0.15, 0.05), (0, -0.04, 1.55), M["BoneDark"], root)
    box("KEyeL", c, (0.05, 0.02, 0.04), (-0.05, -0.13, 1.7), M["Curse"], root)
    box("KEyeR", c, (0.05, 0.02, 0.04), (0.05, -0.13, 1.7), M["Curse"], root)
    box("KBandana", c, (0.245, 0.26, 0.07), (0, -0.01, 1.79), M["Bandana"], root)
    box("KKnot", c, (0.06, 0.12, 0.04), (0.05, 0.16, 1.76), M["Bandana"], root, rot=(30, 0, 0))
    box("KNeck", c, (0.05, 0.05, 0.08), (0, 0.01, 1.52), M["BoneDark"], root)
    # ribcage on a spine, a collarbone, and what is left of a shirt on the back
    box("KSpineCol", c, (0.05, 0.05, 0.44), (0, 0.06, 1.18), M["BoneDark"], root)
    for i, (z, w) in enumerate(((1.42, 0.36), (1.34, 0.36), (1.26, 0.34), (1.18, 0.3))):
        box("KRib%d" % i, c, (w, 0.2, 0.035), (0, 0.0, z), M["Bone"], root)
    box("KSternum", c, (0.05, 0.03, 0.3), (0, -0.1, 1.3), M["Bone"], root)
    box("KCollar", c, (0.5, 0.05, 0.04), (0, 0.0, 1.47), M["Bone"], root)
    box("KShirt", c, (0.38, 0.05, 0.32), (0, 0.11, 1.3), M["Bandana"], root)
    box("KPelvis", c, (0.32, 0.16, 0.12), (0, 0.0, 0.93), M["Bone"], root)
    box("KBreeches", c, (0.36, 0.22, 0.18), (0, 0.0, 0.88), M["Breeches"], root)
    box("KBelt", c, (0.37, 0.23, 0.04), (0, 0.0, 0.98), M["Boot"], root)
    for side, x in (("L", -1), ("R", 1)):
        sphere("KShoulder" + side, c, 0.045, (0.27 * x, 0, 1.45), M["Bone"], root)
        box("KUpper" + side, c, (0.045, 0.045, 0.3), (0.27 * x, 0, 1.3), M["Bone"], root)
        box("KFore" + side, c, (0.04, 0.04, 0.3), (0.27 * x, 0, 0.98), M["Bone"], root)
        box("KHand" + side, c, (0.07, 0.05, 0.09), (0.27 * x, -0.01, 0.79), M["BoneDark"], root)
        box("KLegCloth" + side, c, (0.14, 0.15, 0.2), (0.11 * x, 0, 0.76), M["Breeches"], root)
        box("KFemur" + side, c, (0.055, 0.055, 0.36), (0.11 * x, 0, 0.68), M["Bone"], root)
        sphere("KKnee" + side, c, 0.04, (0.11 * x, -0.02, 0.49), M["Bone"], root)
        box("KTibia" + side, c, (0.045, 0.045, 0.34), (0.11 * x, 0, 0.3), M["Bone"], root)
        box("KBoot" + side, c, (0.12, 0.24, 0.14), (0.11 * x, -0.03, 0.07), M["Boot"], root)
    # a notched cutlass in the right hand, pointing forward
    box("KGuard", c, (0.03, 0.03, 0.1), (0.27, -0.05, 0.79), M["Brass"], root)
    box("KBlade", c, (0.012, 0.6, 0.05), (0.27, -0.36, 0.8), M["Steel"], root, rot=(-6, 0, 0))
    bones = [
        ("Hips", None, (0, 0, 0.9), (0, 0, 1.0)),
        ("Spine", "Hips", (0, 0, 1.0), (0, 0, 1.5)),
        ("Head", "Spine", (0, 0, 1.52), (0, 0, 1.85)),
        ("UpperArm_L", "Spine", (-0.27, 0, 1.45), (-0.27, 0, 1.15)),
        ("ForeArm_L", "UpperArm_L", (-0.27, 0, 1.15), (-0.27, 0, 0.78)),
        ("UpperArm_R", "Spine", (0.27, 0, 1.45), (0.27, 0, 1.15)),
        ("ForeArm_R", "UpperArm_R", (0.27, 0, 1.15), (0.27, 0, 0.78)),
        ("Thigh_L", "Hips", (-0.11, 0, 0.88), (-0.11, 0, 0.49)),
        ("Shin_L", "Thigh_L", (-0.11, 0, 0.49), (-0.11, 0, 0.0)),
        ("Thigh_R", "Hips", (0.11, 0, 0.88), (0.11, 0, 0.49)),
        ("Shin_R", "Thigh_R", (0.11, 0, 0.49), (0.11, 0, 0.0)),
    ]
    parts = {"KPelvis": "Hips", "KBreeches": "Hips", "KBelt": "Hips",
             "KSpineCol": "Spine", "KSternum": "Spine", "KCollar": "Spine", "KShirt": "Spine",
             "KSkull": "Head", "KJaw": "Head", "KEyeL": "Head", "KEyeR": "Head", "KBandana": "Head", "KKnot": "Head",
             "KNeck": "Spine", "KGuard": "ForeArm_R", "KBlade": "ForeArm_R"}
    for i in range(4):
        parts["KRib%d" % i] = "Spine"
    for s in "LR":
        parts.update({"KShoulder" + s: "UpperArm_" + s, "KUpper" + s: "UpperArm_" + s, "KFore" + s: "ForeArm_" + s,
                      "KHand" + s: "ForeArm_" + s, "KLegCloth" + s: "Thigh_" + s, "KFemur" + s: "Thigh_" + s,
                      "KKnee" + s: "Shin_" + s, "KTibia" + s: "Shin_" + s, "KBoot" + s: "Shin_" + s})
    return c, bones, parts


# ---------------------------------------------------------------- the giant crab
def build_crab():
    M = bpy.data.materials
    c = get_coll("Enemy_Crab", clear=True)
    root = empty("Crab", c)
    # wide shell with a spiked rim and barnacles, pale belly below, mouth plates in front
    box("CShell", c, (1.7, 1.25, 0.42), (0, 0.05, 0.92), M["CrabShell"], root, taper=0.78)
    box("CShellRim", c, (1.78, 1.3, 0.1), (0, 0.05, 0.74), M["CrabSpine"], root)
    box("CBelly", c, (1.45, 1.0, 0.25), (0, 0.05, 0.58), M["CrabBelly"], root)
    box("CMouth", c, (0.5, 0.1, 0.22), (0, -0.58, 0.68), M["CrabBelly"], root)
    for i, x in enumerate((-0.7, -0.35, 0.35, 0.7)):
        box("CSpike%d" % i, c, (0.12, 0.12, 0.16), (x, -0.6, 0.86), M["CrabSpine"], root, taper=0.2)
    for i, (x, y) in enumerate(((-0.3, 0.2), (0.25, 0.35), (0.45, -0.1), (-0.5, -0.15))):
        sphere("CBarnacle%d" % i, c, 0.07, (x, y, 1.13), M["Barnacle"], root, scale=(1, 1, 0.6))
    # eyes on stalks
    for side, x in (("L", -1), ("R", 1)):
        box("CStalk" + side, c, (0.05, 0.05, 0.3), (0.18 * x, -0.48, 1.22), M["CrabSpine"], root, rot=(-12, 0, 0))
        sphere("CEye" + side, c, 0.06, (0.18 * x, -0.52, 1.38), M["CrabEye"], root)
    # claws: an arm going forward, then the big pincer
    for side, x in (("L", -1), ("R", 1)):
        box("CArm" + side, c, (0.2, 0.55, 0.2), (0.78 * x, -0.75, 0.8), M["CrabShell"], root)
        box("CClaw" + side, c, (0.32, 0.5, 0.3), (0.8 * x, -1.25, 0.85), M["CrabShell"], root)
        box("CFinger" + side, c, (0.12, 0.42, 0.12), (0.72 * x, -1.6, 0.98), M["CrabSpine"], root, taper=0.5)
        box("CThumb" + side, c, (0.12, 0.34, 0.1), (0.72 * x, -1.55, 0.74), M["CrabSpine"], root, taper=0.5)
        # three legs a side: a segment out from the body and one down to the sand
        for name, y in (("F", -0.35), ("M", 0.05), ("B", 0.45)):
            box("CLeg%s%s" % (name, side), c, (0.6, 0.12, 0.12), (1.1 * x, y, 0.75), M["CrabShell"], root, rot=(0, 30 * x, 0))
            box("CFoot%s%s" % (name, side), c, (0.1, 0.1, 0.62), (1.4 * x, y, 0.32), M["CrabSpine"], root, taper=0.4)
    bones = [
        ("Hips", None, (0, 0, 0.6), (0, 0, 1.0)),
        ("Head", "Hips", (0, -0.5, 1.05), (0, -0.5, 1.4)),
        ("UpperArm_L", "Hips", (-0.7, -0.5, 0.8), (-0.78, -1.0, 0.8)),
        ("ForeArm_L", "UpperArm_L", (-0.78, -1.0, 0.8), (-0.78, -1.6, 0.85)),
        ("UpperArm_R", "Hips", (0.7, -0.5, 0.8), (0.78, -1.0, 0.8)),
        ("ForeArm_R", "UpperArm_R", (0.78, -1.0, 0.8), (0.78, -1.6, 0.85)),
    ]
    for name, y in (("F", -0.35), ("M", 0.05), ("B", 0.45)):
        for side, x in (("L", -1), ("R", 1)):
            bones.append(("Leg_%s_%s" % (name, side), "Hips", (0.8 * x, y, 0.75), (0.8 * x, y, 0.2)))
    parts = {"CShell": "Hips", "CShellRim": "Hips", "CBelly": "Hips", "CMouth": "Hips"}
    for i in range(4):
        parts["CSpike%d" % i] = "Hips"
        parts["CBarnacle%d" % i] = "Hips"
    for s in "LR":
        parts.update({"CStalk" + s: "Head", "CEye" + s: "Head", "CArm" + s: "UpperArm_" + s,
                      "CClaw" + s: "ForeArm_" + s, "CFinger" + s: "ForeArm_" + s, "CThumb" + s: "ForeArm_" + s})
        for name in "FMB":
            parts["CLeg%s%s" % (name, s)] = "Leg_%s_%s" % (name, s)
            parts["CFoot%s%s" % (name, s)] = "Leg_%s_%s" % (name, s)
    return c, bones, parts


# ---------------------------------------------------------------- the ghost gunner
def build_gunner():
    M = bpy.data.materials
    c = get_coll("Enemy_Gunner", clear=True)
    root = empty("Gunner", c)
    # a long coat that fades into wisps instead of legs
    box("GCoat", c, (0.5, 0.34, 0.6), (0, 0.02, 1.2), M["GhostCoat"], root, taper=1.1)
    box("GSkirt", c, (0.56, 0.4, 0.5), (0, 0.04, 0.72), M["GhostCoat"], root, taper=1.15)
    box("GWisp0", c, (0.4, 0.3, 0.35), (0, 0.06, 0.35), M["GhostCoat"], root, taper=1.4)
    box("GWisp1", c, (0.18, 0.16, 0.3), (0.06, 0.1, 0.08), M["GhostCoat"], root, taper=2.0)
    box("GBelt", c, (0.52, 0.36, 0.06), (0, 0.02, 0.98), M["GhostHat"], root)
    box("GBuckle", c, (0.08, 0.02, 0.06), (0, -0.165, 0.98), M["Brass"], root)
    for i, z in enumerate((1.1, 1.22, 1.34)):
        box("GButton%d" % i, c, (0.03, 0.02, 0.03), (0.08, -0.175, z), M["Brass"], root)
    # pale face with burning eyes, a beard, and a tricorn hat
    box("GHead", c, (0.24, 0.24, 0.26), (0, -0.02, 1.68), M["GhostSkin"], root)
    box("GEyeL", c, (0.05, 0.02, 0.03), (-0.055, -0.145, 1.7), M["GhostEye"], root)
    box("GEyeR", c, (0.05, 0.02, 0.03), (0.055, -0.145, 1.7), M["GhostEye"], root)
    box("GBeard", c, (0.22, 0.1, 0.18), (0, -0.12, 1.52), M["GhostSkin"], root, taper=0.6)
    box("GHatBrim", c, (0.46, 0.42, 0.04), (0, -0.02, 1.82), M["GhostHat"], root)
    box("GHatCrown", c, (0.26, 0.26, 0.14), (0, -0.02, 1.9), M["GhostHat"], root)
    box("GHatFlapL", c, (0.04, 0.38, 0.12), (-0.21, -0.02, 1.87), M["GhostHat"], root, rot=(0, 25, 0))
    box("GHatFlapR", c, (0.04, 0.38, 0.12), (0.21, -0.02, 1.87), M["GhostHat"], root, rot=(0, -25, 0))
    box("GHatFlapB", c, (0.42, 0.04, 0.12), (0, 0.18, 1.87), M["GhostHat"], root, rot=(-25, 0, 0))
    for side, x in (("L", -1), ("R", 1)):
        box("GSleeve" + side, c, (0.13, 0.13, 0.32), (0.31 * x, 0, 1.3), M["GhostCoat"], root)
        box("GCuff" + side, c, (0.14, 0.14, 0.08), (0.31 * x, 0, 1.1), M["GhostHat"], root)
        box("GFore" + side, c, (0.1, 0.1, 0.26), (0.31 * x, 0, 0.97), M["GhostCoat"], root)
        box("GHand" + side, c, (0.08, 0.08, 0.08), (0.31 * x, -0.02, 0.82), M["GhostSkin"], root)
    # the swivel gun in his right hand: a stubby barrel pointing forward
    cyl("GGun", c, 0.07, 0.5, (0.31, -0.3, 0.84), M["Iron"], root, rot=(90, 0, 0), verts=10)
    cyl("GGunMouth", c, 0.085, 0.06, (0.31, -0.56, 0.84), M["Iron"], root, rot=(90, 0, 0), verts=10)
    cyl("GGunRing", c, 0.078, 0.04, (0.31, -0.1, 0.84), M["Brass"], root, rot=(90, 0, 0), verts=10)
    box("GGunHandle", c, (0.04, 0.2, 0.04), (0.31, 0.1, 0.84), M["Iron"], root)
    empty("Muzzle", c, (0.31, -0.6, 0.84), root)
    bones = [
        ("Hips", None, (0, 0, 0.9), (0, 0, 1.05)),
        ("Spine", "Hips", (0, 0, 1.05), (0, 0, 1.55)),
        ("Head", "Spine", (0, 0, 1.56), (0, 0, 1.95)),
        ("UpperArm_L", "Spine", (-0.31, 0, 1.45), (-0.31, 0, 1.1)),
        ("ForeArm_L", "UpperArm_L", (-0.31, 0, 1.1), (-0.31, 0, 0.8)),
        ("UpperArm_R", "Spine", (0.31, 0, 1.45), (0.31, 0, 1.1)),
        ("ForeArm_R", "UpperArm_R", (0.31, 0, 1.1), (0.31, 0, 0.8)),
    ]
    parts = {"GCoat": "Spine", "GBelt": "Hips", "GBuckle": "Hips", "GSkirt": "Hips", "GWisp0": "Hips", "GWisp1": "Hips",
             "GHead": "Head", "GEyeL": "Head", "GEyeR": "Head", "GBeard": "Head", "GHatBrim": "Head", "GHatCrown": "Head",
             "GHatFlapL": "Head", "GHatFlapR": "Head", "GHatFlapB": "Head",
             "GGun": "ForeArm_R", "GGunMouth": "ForeArm_R", "GGunRing": "ForeArm_R", "GGunHandle": "ForeArm_R"}
    for i in range(3):
        parts["GButton%d" % i] = "Spine"
    for s in "LR":
        parts.update({"GSleeve" + s: "UpperArm_" + s, "GCuff" + s: "UpperArm_" + s, "GFore" + s: "ForeArm_" + s, "GHand" + s: "ForeArm_" + s})
    return c, bones, parts


# ---------------------------------------------------------------- the siren
def build_siren():
    M = bpy.data.materials
    c = get_coll("Enemy_Siren", clear=True)
    root = empty("Siren", c)
    # a fish tail from the waist, curling back; its fin sticks out of the water behind her
    box("STail0", c, (0.36, 0.3, 0.36), (0, 0.02, 0.7), M["SirenScale"], root, taper=1.1)
    box("STail1", c, (0.3, 0.3, 0.3), (0, 0.18, 0.42), M["SirenScale"], root, rot=(25, 0, 0))
    box("STail2", c, (0.22, 0.34, 0.2), (0, 0.45, 0.28), M["SirenScale"], root, rot=(10, 0, 0))
    box("SFin", c, (0.56, 0.06, 0.3), (0, 0.72, 0.5), M["SirenFin"], root, rot=(55, 0, 0), taper=1.4)
    box("SFinL", c, (0.05, 0.25, 0.12), (-0.2, 0.05, 0.85), M["SirenFin"], root, rot=(0, -30, 0))
    box("SFinR", c, (0.05, 0.25, 0.12), (0.2, 0.05, 0.85), M["SirenFin"], root, rot=(0, 30, 0))
    # pale body with two shells, a head of seaweed hair, a crown of shells, glowing pink eyes
    box("STorso", c, (0.34, 0.22, 0.46), (0, 0.0, 1.15), M["SirenSkin"], root, taper=1.15)
    box("SShellL", c, (0.12, 0.05, 0.1), (-0.08, -0.115, 1.27), M["SirenShell"], root)
    box("SShellR", c, (0.12, 0.05, 0.1), (0.08, -0.115, 1.27), M["SirenShell"], root)
    box("SNeck", c, (0.08, 0.08, 0.08), (0, 0.0, 1.43), M["SirenSkin"], root)
    box("SHead", c, (0.2, 0.22, 0.25), (0, -0.01, 1.57), M["SirenSkin"], root)
    box("SEyeL", c, (0.045, 0.02, 0.025), (-0.05, -0.125, 1.59), M["SirenEye"], root)
    box("SEyeR", c, (0.045, 0.02, 0.025), (0.05, -0.125, 1.59), M["SirenEye"], root)
    box("SHairTop", c, (0.24, 0.26, 0.06), (0, 0.0, 1.71), M["SirenHair"], root)
    box("SHairBack", c, (0.28, 0.08, 0.7), (0, 0.13, 1.33), M["SirenHair"], root, taper=1.3)
    box("SHairL", c, (0.05, 0.12, 0.5), (-0.13, 0.02, 1.4), M["SirenHair"], root)
    box("SHairR", c, (0.05, 0.12, 0.5), (0.13, 0.02, 1.4), M["SirenHair"], root)
    for i, x in enumerate((-0.07, 0, 0.07)):
        box("SCrown%d" % i, c, (0.05, 0.03, 0.07), (x, -0.08, 1.76), M["SirenShell"], root, taper=0.3)
    for side, x in (("L", -1), ("R", 1)):
        box("SUpper" + side, c, (0.08, 0.08, 0.28), (0.24 * x, 0, 1.27), M["SirenSkin"], root)
        box("SFore" + side, c, (0.07, 0.07, 0.26), (0.24 * x, 0, 1.01), M["SirenSkin"], root)
        box("SHand" + side, c, (0.07, 0.05, 0.09), (0.24 * x, -0.01, 0.84), M["SirenSkin"], root)
        box("SClaw" + side, c, (0.07, 0.04, 0.07), (0.24 * x, -0.02, 0.76), M["SirenShell"], root, taper=0.3)
    bones = [
        ("Hips", None, (0, 0, 0.85), (0, 0, 1.0)),
        ("Spine", "Hips", (0, 0, 1.0), (0, 0, 1.45)),
        ("Head", "Spine", (0, 0, 1.47), (0, 0, 1.78)),
        ("UpperArm_L", "Spine", (-0.24, 0, 1.4), (-0.24, 0, 1.14)),
        ("ForeArm_L", "UpperArm_L", (-0.24, 0, 1.14), (-0.24, 0, 0.8)),
        ("UpperArm_R", "Spine", (0.24, 0, 1.4), (0.24, 0, 1.14)),
        ("ForeArm_R", "UpperArm_R", (0.24, 0, 1.14), (0.24, 0, 0.8)),
    ]
    parts = {"STail0": "Hips", "STail1": "Hips", "STail2": "Hips", "SFin": "Hips", "SFinL": "Hips", "SFinR": "Hips",
             "STorso": "Spine", "SShellL": "Spine", "SShellR": "Spine", "SNeck": "Spine",
             "SHead": "Head", "SEyeL": "Head", "SEyeR": "Head", "SHairTop": "Head", "SHairBack": "Head",
             "SHairL": "Head", "SHairR": "Head"}
    for i in range(3):
        parts["SCrown%d" % i] = "Head"
    for s in "LR":
        parts.update({"SUpper" + s: "UpperArm_" + s, "SFore" + s: "ForeArm_" + s, "SHand" + s: "ForeArm_" + s, "SClaw" + s: "ForeArm_" + s})
    return c, bones, parts


# ---------------------------------------------------------------- one giant bat
def build_bat():
    M = bpy.data.materials
    c = get_coll("Enemy_Bat", clear=True)
    root = empty("Bat", c)
    box("BBody", c, (0.13, 0.22, 0.11), (0, 0.0, 0), M["BatFur"], root)
    box("BHead", c, (0.1, 0.1, 0.09), (0, -0.14, 0.02), M["BatFur"], root)
    box("BEarL", c, (0.03, 0.02, 0.07), (-0.03, -0.14, 0.09), M["BatFur"], root, taper=0.3)
    box("BEarR", c, (0.03, 0.02, 0.07), (0.03, -0.14, 0.09), M["BatFur"], root, taper=0.3)
    box("BEyeL", c, (0.02, 0.01, 0.015), (-0.025, -0.19, 0.03), M["BatEye"], root)
    box("BEyeR", c, (0.02, 0.01, 0.015), (0.025, -0.19, 0.03), M["BatEye"], root)
    box("BFeet", c, (0.06, 0.05, 0.03), (0, 0.12, -0.05), M["BatFur"], root)
    # each wing on a pivot at the shoulder, its membrane in two pieces going out along X
    for side, x in (("L", -1), ("R", 1)):
        w = empty("Wing" + side, c, (0.06 * x, -0.02, 0.03), root)
        box("BWingIn" + side, c, (0.26, 0.18, 0.012), (0.13 * x, 0.02, 0), M["BatWing"], w)
        box("BWingOut" + side, c, (0.22, 0.14, 0.012), (0.36 * x, 0.06, 0), M["BatWing"], w)
        box("BFinger" + side, c, (0.46, 0.02, 0.02), (0.25 * x, -0.06, 0.005), M["BatFur"], w)
    return c


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


def skeleton_actions(rig, p):
    """the jackal's set (biped_actions + runner_extra), the cutlass held forward in every clip"""
    blade = {"UpperArm_R": (-25, 0, 0), "ForeArm_R": (-30, 0, 0)}
    add_action(rig, p + "idle", [
        (0, dict(blade, Spine=(3, 0, 0), UpperArm_L=(2, 0, 0), ForeArm_L=(-8, 0, 0), _loc_Hips=(0, 0, 0))),
        (1.0, dict(blade, Spine=(6, 0, 0), Head=(-5, 10, 4), UpperArm_L=(-3, 0, 0), ForeArm_L=(-14, 0, 0), _loc_Hips=(0, -0.015, 0))),
        (2.0, dict(blade, Spine=(3, 0, 0), UpperArm_L=(2, 0, 0), ForeArm_L=(-8, 0, 0), _loc_Hips=(0, 0, 0))),
    ])
    gait(rig, p + "walk", 1.0, 26, 22, 22, 18, 6, 0.025, extra=blade)
    gait(rig, p + "run", 0.62, 48, 70, 45, 55, 20, 0.05, head=-10, extra={"UpperArm_R": (-40, 0, 0), "ForeArm_R": (-35, 0, 0)})
    # a cut: the cutlass raised over the shoulder for 0.4 s, then brought down
    raise_ = {"UpperArm_R": (-160, 0, -20), "ForeArm_R": (-40, 0, 0), "UpperArm_L": (-30, 0, 0), "Spine": (-12, 10, 0), "Head": (-5, 0, 0)}
    strike = {"UpperArm_R": (-30, 0, 15), "ForeArm_R": (-10, 0, 0), "UpperArm_L": (20, 0, 0), "Spine": (25, -15, 0), "Head": (10, 0, 0),
              "Thigh_L": (-20, 0, 0), "Shin_L": (25, 0, 0)}
    add_action(rig, p + "attack", [(0, blade), (0.4, raise_), (0.48, strike), (0.75, dict(blade, Spine=(8, 0, 0)))], loop=False)
    stun_a = {"Spine": (-14, 0, 8), "Head": (-12, 25, 10), "UpperArm_L": (12, 0, 0), "UpperArm_R": (12, 0, 0), "ForeArm_L": (-5, 0, 0), "ForeArm_R": (-5, 0, 0)}
    stun_b = {"Spine": (-10, 0, -8), "Head": (-6, -25, -10), "UpperArm_L": (8, 0, 0), "UpperArm_R": (8, 0, 0), "ForeArm_L": (-12, 0, 0), "ForeArm_R": (-12, 0, 0)}
    add_action(rig, p + "stun", [(0, stun_a), (0.5, stun_b), (1.0, stun_a)])
    add_action(rig, p + "hit", [(0, {}), (0.06, {"Spine": (-14, 0, 0), "Head": (-20, 0, 0)}), (0.25, {})], loop=False)
    # the lunge (leap): crouch, then thrown forward with the blade first
    crouch = {"Thigh_L": (-35, 0, 0), "Thigh_R": (-35, 0, 0), "Shin_L": (65, 0, 0), "Shin_R": (65, 0, 0),
              "Spine": (30, 0, 0), "UpperArm_R": (-60, 0, 0), "_loc_Hips": (0, -0.12, 0)}
    fly = {"Thigh_L": (-70, 0, 0), "Thigh_R": (-40, 0, 0), "Shin_L": (90, 0, 0), "Shin_R": (70, 0, 0),
           "Spine": (25, 0, 0), "Head": (-20, 0, 0), "UpperArm_R": (-95, 0, 0), "ForeArm_R": (-5, 0, 0), "UpperArm_L": (30, 0, 0)}
    add_action(rig, p + "leap", [(0, crouch), (0.12, fly), (0.5, fly)], loop=False)


def crab_actions(rig, p):
    """legs are vertical bones: a turn around Y swings them (tripod gait, as the scarab's);
    claws are bones pointing forward: -X raises them, +X lowers them"""
    a = {"Leg_F_L": (0, 22, 0), "Leg_M_R": (0, -22, 0), "Leg_B_L": (0, 22, 0),
         "Leg_F_R": (0, 22, 0), "Leg_M_L": (0, -22, 0), "Leg_B_R": (0, 22, 0), "_loc_Hips": (0, 0, 0)}
    b = {}
    for k, v in a.items():
        if k.startswith("Leg"):
            b[k] = (0, -v[1], 0)
    b["_loc_Hips"] = (0, 0.04, 0)
    claws = {"UpperArm_L": (-8, 0, 0), "UpperArm_R": (-8, 0, 0)}
    add_action(rig, p + "walk", [(0, dict(a, **claws)), (0.3, dict(b, **claws)), (0.6, dict(a, **claws))])
    add_action(rig, p + "run", [(0, dict(a, **claws)), (0.18, dict(b, **claws)), (0.36, dict(a, **claws))])
    # sideways charge: the legs scramble fast, the claws held up and wide
    wide = {"UpperArm_L": (25, -20, 0), "UpperArm_R": (25, 20, 0), "ForeArm_L": (20, 0, 0), "ForeArm_R": (20, 0, 0)}
    add_action(rig, p + "charge", [(0, dict(a, **wide)), (0.12, dict(b, **wide)), (0.24, dict(a, **wide))])
    add_action(rig, p + "idle", [
        (0, {"Hips": (2, 0, 0), "UpperArm_L": (-5, 0, 0), "UpperArm_R": (-5, 0, 0)}),
        (1.0, {"Hips": (-2, 0, 2), "Head": (8, 10, 0), "UpperArm_L": (8, 0, 0), "UpperArm_R": (0, 0, 0), "ForeArm_L": (10, 0, 0)}),
        (2.0, {"Hips": (2, 0, 0), "UpperArm_L": (-5, 0, 0), "UpperArm_R": (-5, 0, 0)}),
    ])
    # claw strike: both claws raised high over 0.4 s, then slammed down
    up = {"UpperArm_L": (55, 0, 0), "UpperArm_R": (55, 0, 0), "ForeArm_L": (35, 0, 0), "ForeArm_R": (35, 0, 0), "Hips": (-8, 0, 0)}
    down = {"UpperArm_L": (-25, 0, 0), "UpperArm_R": (-25, 0, 0), "ForeArm_L": (-10, 0, 0), "ForeArm_R": (-10, 0, 0), "Hips": (8, 0, 0), "_loc_Hips": (0, -0.08, 0)}
    add_action(rig, p + "attack", [(0, {}), (0.4, up), (0.48, down), (0.75, {})], loop=False)
    # charge wind-up: crouched low, the claws clacking
    low = {"_loc_Hips": (0, -0.15, 0), "Hips": (6, 0, 0), "UpperArm_L": (15, 0, 0), "UpperArm_R": (15, 0, 0)}
    clack = dict(low, ForeArm_L=(25, 0, 0), ForeArm_R=(25, 0, 0))
    add_action(rig, p + "chargeWind", [(0, low), (0.15, clack), (0.3, low), (0.45, clack), (0.65, low)], loop=False)
    add_action(rig, p + "stun", [(0, {"Hips": (0, 0, 10), "Head": (0, 0, 15)}), (0.4, {"Hips": (0, 0, -10), "Head": (0, 0, -15)}), (0.8, {"Hips": (0, 0, 10), "Head": (0, 0, 15)})])
    add_action(rig, p + "hit", [(0, {}), (0.05, {"Hips": (-10, 0, 0)}), (0.2, {})], loop=False)


def gunner_actions(rig, p):
    """the priest's set (caster_actions) on a floating ghost; the gun points forward from the hand,
    so the arm raised by 45 degrees aims it 45 degrees up, to lob a ball"""
    add_action(rig, p + "idle", [
        (0, {"Spine": (2, 0, 0), "UpperArm_L": (-4, 0, 0), "ForeArm_L": (-10, 0, 0), "UpperArm_R": (-30, 0, 0), "_loc_Hips": (0, 0, 0)}),
        (1.5, {"Spine": (5, 4, 0), "Head": (-4, -8, 0), "UpperArm_L": (2, 0, 0), "ForeArm_L": (-16, 0, 0), "UpperArm_R": (-34, 0, 0), "_loc_Hips": (0, 0.08, 0)}),
        (3.0, {"Spine": (2, 0, 0), "UpperArm_L": (-4, 0, 0), "ForeArm_L": (-10, 0, 0), "UpperArm_R": (-30, 0, 0), "_loc_Hips": (0, 0, 0)}),
    ])
    sway_a = {"Hips": (6, 0, 4), "Spine": (8, 0, -4), "Head": (-6, 0, 2), "UpperArm_L": (14, 0, 0), "ForeArm_L": (-14, 0, 0), "UpperArm_R": (-30, 0, 0), "_loc_Hips": (0, 0, 0)}
    sway_b = {"Hips": (6, 0, -4), "Spine": (8, 0, 4), "Head": (-6, 0, -2), "UpperArm_L": (-14, 0, 0), "ForeArm_L": (-14, 0, 0), "UpperArm_R": (-30, 0, 0), "_loc_Hips": (0, 0.06, 0)}
    add_action(rig, p + "walk", [(0, sway_a), (0.6, sway_b), (1.2, sway_a)])
    add_action(rig, p + "run", [(0, sway_a), (0.4, sway_b), (0.8, sway_a)])
    # lob: the left hand steadies the gun while it is raised to 45 degrees, then the recoil throws it up
    aim = {"UpperArm_R": (-45, 0, 0), "ForeArm_R": (0, 0, 0), "UpperArm_L": (-55, 0, -35), "ForeArm_L": (-50, 0, 0), "Spine": (-10, 0, 0), "Head": (-8, 0, 0)}
    kick = {"UpperArm_R": (-75, 0, 0), "ForeArm_R": (-10, 0, 0), "UpperArm_L": (-45, 0, -30), "ForeArm_L": (-35, 0, 0), "Spine": (-22, 0, 0), "Head": (-12, 0, 0)}
    add_action(rig, p + "cast", [(0, {"UpperArm_R": (-30, 0, 0)}), (0.4, aim), (0.46, kick), (0.9, {"UpperArm_R": (-40, 0, 0)})], loop=False)
    add_action(rig, p + "attack", [
        (0, {"UpperArm_R": (-30, 0, 0)}),
        (0.4, {"UpperArm_R": (-150, 0, 0), "ForeArm_R": (-20, 0, 0), "Spine": (-12, 0, 0)}),
        (0.48, {"UpperArm_R": (-30, 0, 0), "ForeArm_R": (-5, 0, 0), "Spine": (25, 0, 0), "Head": (8, 0, 0)}),
        (0.75, {"Spine": (6, 0, 0), "UpperArm_R": (-30, 0, 0)}),
    ], loop=False)
    add_action(rig, p + "stun", [
        (0, {"Spine": (-12, 0, 8), "Head": (-10, 18, 0), "UpperArm_L": (10, 0, 0), "UpperArm_R": (10, 0, 0)}),
        (0.5, {"Spine": (-8, 0, -8), "Head": (-6, -18, 0), "UpperArm_L": (6, 0, 0), "UpperArm_R": (6, 0, 0)}),
        (1.0, {"Spine": (-12, 0, 8), "Head": (-10, 18, 0), "UpperArm_L": (10, 0, 0), "UpperArm_R": (10, 0, 0)}),
    ])
    add_action(rig, p + "hit", [(0, {}), (0.06, {"Spine": (-12, 0, 0), "Head": (-16, 0, 0)}), (0.25, {})], loop=False)


def siren_actions(rig, p):
    """the priest's set without walking: she sways in the water; the song is a loop, arms open"""
    sway_a = {"Hips": (0, 0, 4), "Spine": (5, 0, -3), "Head": (-3, 5, 0), "UpperArm_L": (-8, 0, 8), "UpperArm_R": (-8, 0, -8),
              "ForeArm_L": (-20, 0, 0), "ForeArm_R": (-20, 0, 0), "_loc_Hips": (0, 0, 0)}
    sway_b = {"Hips": (0, 0, -4), "Spine": (5, 0, 3), "Head": (-3, -5, 0), "UpperArm_L": (-14, 0, 10), "UpperArm_R": (-14, 0, -10),
              "ForeArm_L": (-25, 0, 0), "ForeArm_R": (-25, 0, 0), "_loc_Hips": (0, 0.04, 0)}
    for name in ("idle", "walk", "run"):
        add_action(rig, p + name, [(0, sway_a), (1.2, sway_b), (2.4, sway_a)])
    open_a = {"UpperArm_L": (-60, 0, 40), "UpperArm_R": (-60, 0, -40), "ForeArm_L": (-25, 0, 0), "ForeArm_R": (-25, 0, 0),
              "Spine": (-8, 0, 5), "Head": (-18, 8, 0), "_loc_Hips": (0, 0.05, 0)}
    open_b = {"UpperArm_L": (-75, 0, 50), "UpperArm_R": (-75, 0, -50), "ForeArm_L": (-15, 0, 0), "ForeArm_R": (-15, 0, 0),
              "Spine": (-12, 0, -5), "Head": (-24, -8, 0), "_loc_Hips": (0, 0.1, 0)}
    add_action(rig, p + "sing", [(0, open_a), (1.0, open_b), (2.0, open_a)])
    add_action(rig, p + "attack", [
        (0, {}),
        (0.4, {"UpperArm_R": (-150, 0, -20), "ForeArm_R": (-30, 0, 0), "Spine": (-12, 0, 0), "Head": (-10, 0, 0)}),
        (0.48, {"UpperArm_R": (-30, 0, 10), "ForeArm_R": (-5, 0, 0), "Spine": (25, 0, 0), "Head": (10, 0, 0)}),
        (0.75, {"Spine": (6, 0, 0)}),
    ], loop=False)
    add_action(rig, p + "stun", [
        (0, {"Spine": (-12, 0, 8), "Head": (-10, 18, 0), "UpperArm_L": (10, 0, 0), "UpperArm_R": (10, 0, 0)}),
        (0.5, {"Spine": (-8, 0, -8), "Head": (-6, -18, 0), "UpperArm_L": (6, 0, 0), "UpperArm_R": (6, 0, 0)}),
        (1.0, {"Spine": (-12, 0, 8), "Head": (-10, 18, 0), "UpperArm_L": (10, 0, 0), "UpperArm_R": (10, 0, 0)}),
    ])
    add_action(rig, p + "hit", [(0, {}), (0.06, {"Spine": (-12, 0, 0), "Head": (-16, 0, 0)}), (0.25, {})], loop=False)


def build_all(export=True):
    scene = bpy.data.scenes.get("Enemies") or bpy.data.scenes.new("Enemies")
    bpy.context.window.scene = scene
    # written out one by one: the safe mode forbids calling the builders through a loop variable
    c, bones, parts = build_skeleton()
    rig = build_rig(c.name, "Skeleton", "SkeletonRig", bones, parts)
    skeleton_actions(rig, "skeleton_")
    c, bones, parts = build_crab()
    rig = build_rig(c.name, "Crab", "CrabRig", bones, parts)
    crab_actions(rig, "crab_")
    c, bones, parts = build_gunner()
    rig = build_rig(c.name, "Gunner", "GunnerRig", bones, parts)
    gunner_actions(rig, "gunner_")
    c, bones, parts = build_siren()
    rig = build_rig(c.name, "Siren", "SirenRig", bones, parts)
    siren_actions(rig, "siren_")
    build_bat()
    if export:
        export_animated("Enemy_Skeleton", "SkeletonRig", "skeleton_", r"pirates\skeleton.glb")
        export_animated("Enemy_Crab", "CrabRig", "crab_", r"pirates\crab.glb")
        export_animated("Enemy_Gunner", "GunnerRig", "gunner_", r"pirates\gunner.glb")
        export_animated("Enemy_Siren", "SirenRig", "siren_", r"pirates\siren.glb")
        export_coll("Enemy_Bat", r"pirates\bat.glb")
