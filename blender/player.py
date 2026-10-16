# The player as the other players see them in co-op: a desert guardian in linen with a blue
# head wrap, holding a rifle (or the khépesh). Rigid parts on the same bones as the enemies.
# Usage inside Blender: exec helpers.py, rig.py and anims.py first, then this file; it exports player.glb.
import bpy

M = bpy.data.materials
coll = get_coll("Player", clear=True)
root = empty("Player", coll)


def part(name, size, loc, material, rot=(0, 0, 0), taper=1.0):
    return box(name, coll, size, loc, M[material], parent=root, rot=rot, taper=taper)


# ---- body (facing -Y, standing at the origin, 1.85 m tall) ----
part("Kilt", (0.42, 0.28, 0.32), (0, 0, 0.86), "Linen", taper=1.12)
part("Belt", (0.44, 0.3, 0.08), (0, 0, 1.0), "Gold")
part("Torso", (0.44, 0.27, 0.48), (0, 0, 1.27), "Linen", taper=1.12)
part("Sash", (0.1, 0.29, 0.56), (0.02, 0, 1.25), "ClothBlue", rot=(0, 32, 0))
part("Collar", (0.36, 0.24, 0.05), (0, -0.01, 1.5), "Gold")
part("Cape", (0.4, 0.05, 0.62), (0, 0.16, 1.16), "ClothBlue", taper=1.2)
part("Neck", (0.12, 0.12, 0.08), (0, 0, 1.55), "Skin")
part("Head", (0.23, 0.25, 0.26), (0, -0.01, 1.69), "Skin")
part("Scarf", (0.25, 0.08, 0.11), (0, -0.12, 1.62), "Linen")
part("EyeBand", (0.235, 0.04, 0.035), (0, -0.13, 1.71), "Basalt")
part("Wrap", (0.29, 0.31, 0.12), (0, 0.01, 1.82), "ClothBlue")
part("WrapBand", (0.3, 0.32, 0.03), (0, 0.01, 1.77), "Gold")
part("WrapTail", (0.2, 0.06, 0.34), (0, 0.17, 1.62), "ClothBlue", taper=0.8)
for side, x in (("L", -1), ("R", 1)):
    part("Shoulder_" + side, (0.16, 0.2, 0.1), (0.27 * x, 0, 1.47), "Bronze")
    part("UpperArm_" + side, (0.12, 0.12, 0.3), (0.27 * x, 0, 1.3), "Linen")
    part("ForeArm_" + side, (0.105, 0.105, 0.26), (0.27 * x, 0, 1.0), "Skin")
    part("Bracer_" + side, (0.12, 0.12, 0.12), (0.27 * x, 0, 0.98), "Bronze")
    part("Hand_" + side, (0.1, 0.11, 0.1), (0.27 * x, 0, 0.82), "Skin")
    part("Thigh_" + side, (0.16, 0.17, 0.4), (0.11 * x, 0, 0.68), "Linen")
    part("Shin_" + side, (0.13, 0.14, 0.4), (0.11 * x, 0, 0.27), "Bandage")
    part("Sandal_" + side, (0.14, 0.24, 0.06), (0.11 * x, -0.04, 0.03), "Wood")

# ---- weapons: the rifle is held against the chest, the khépesh hangs from the right hand ----
part("GunBody", (0.07, 0.56, 0.11), (0.1, -0.36, 1.24), "Gunmetal")
part("GunBarrel", (0.035, 0.3, 0.035), (0.1, -0.78, 1.26), "Gunmetal")
part("GunStock", (0.06, 0.24, 0.12), (0.1, 0.0, 1.2), "Wood")
part("GunMag", (0.05, 0.08, 0.16), (0.1, -0.42, 1.12), "Gunmetal", rot=(-12, 0, 0))
part("SwordGrip", (0.045, 0.045, 0.16), (0.27, 0, 0.76), "Wood")
part("SwordBlade", (0.03, 0.08, 0.42), (0.27, 0, 0.47), "BladeBronze")
part("SwordHook", (0.03, 0.2, 0.08), (0.27, -0.07, 0.25), "BladeBronze", rot=(-35, 0, 0))

BONES = [
    ("Hips", None, (0, 0, 0.95), (0, 0, 1.05)),
    ("Spine", "Hips", (0, 0, 1.05), (0, 0, 1.52)),
    ("Head", "Spine", (0, 0, 1.55), (0, 0, 1.9)),
    ("UpperArm_L", "Spine", (-0.27, 0, 1.45), (-0.27, 0, 1.15)),
    ("ForeArm_L", "UpperArm_L", (-0.27, 0, 1.15), (-0.27, 0, 0.78)),
    ("UpperArm_R", "Spine", (0.27, 0, 1.45), (0.27, 0, 1.15)),
    ("ForeArm_R", "UpperArm_R", (0.27, 0, 1.15), (0.27, 0, 0.78)),
    ("Thigh_L", "Hips", (-0.11, 0, 0.9), (-0.11, 0, 0.48)),
    ("Shin_L", "Thigh_L", (-0.11, 0, 0.48), (-0.11, 0, 0.0)),
    ("Thigh_R", "Hips", (0.11, 0, 0.9), (0.11, 0, 0.48)),
    ("Shin_R", "Thigh_R", (0.11, 0, 0.48), (0.11, 0, 0.0)),
]
PARTS = {
    "Kilt": "Hips", "Belt": "Hips",
    "Torso": "Spine", "Sash": "Spine", "Collar": "Spine", "Cape": "Spine", "Neck": "Spine",
    "GunBody": "Spine", "GunBarrel": "Spine", "GunStock": "Spine", "GunMag": "Spine",
    "Head": "Head", "Scarf": "Head", "EyeBand": "Head", "Wrap": "Head", "WrapBand": "Head", "WrapTail": "Head",
    "SwordGrip": "ForeArm_R", "SwordBlade": "ForeArm_R", "SwordHook": "ForeArm_R",
}
for side in "LR":
    PARTS.update({
        "Shoulder_" + side: "UpperArm_" + side, "UpperArm_" + side: "UpperArm_" + side,
        "ForeArm_" + side: "ForeArm_" + side, "Bracer_" + side: "ForeArm_" + side, "Hand_" + side: "ForeArm_" + side,
        "Thigh_" + side: "Thigh_" + side, "Shin_" + side: "Shin_" + side, "Sandal_" + side: "Shin_" + side,
    })
rig = build_rig("Player", "Player", "PlayerRig", BONES, PARTS)

# ---- animations: arms raised to the rifle in every clip but "down" ----
HOLD = {"UpperArm_R": (-28, 0, -8), "ForeArm_R": (-62, 0, 0), "UpperArm_L": (-58, 0, -32), "ForeArm_L": (-42, 0, 0)}
P = "player_"
add_action(rig, P + "idle", [
    (0, dict(HOLD, Spine=(2, 0, 0), _loc_Hips=(0, 0, 0))),
    (1.2, dict(HOLD, Spine=(5, 0, 0), Head=(-4, 6, 0), _loc_Hips=(0, -0.012, 0))),
    (2.4, dict(HOLD, Spine=(2, 0, 0), _loc_Hips=(0, 0, 0))),
])
gait(rig, P + "walk", 1.0, 26, 22, 0, 0, 4, 0.025, extra=HOLD)
gait(rig, P + "run", 0.66, 46, 68, 0, 0, 14, 0.05, head=-8, extra=HOLD)
# down: lying on the back, an arm raised for help, breathing
lying = {"Hips": (-84, 0, 0), "_loc_Hips": (0, -0.8, 0), "Head": (30, 15, 0), "Thigh_L": (-12, 0, 6), "Shin_L": (20, 0, 0),
         "Thigh_R": (-4, 0, -4), "UpperArm_R": (-150, 0, 10), "ForeArm_R": (-20, 0, 0), "UpperArm_L": (-10, 0, -20)}
lying2 = dict(lying, Spine=(-4, 0, 0), UpperArm_R=(-140, 0, 18), Head=(26, 20, 0))
add_action(rig, P + "down", [(0, lying), (1.0, lying2), (2.0, lying)])
# khépesh in hand: the same clips with the right arm low, blade forward
SWORD = {"UpperArm_R": (-20, 0, -6), "ForeArm_R": (-70, 0, 0), "UpperArm_L": (8, 0, -6), "ForeArm_L": (-25, 0, 0)}
add_action(rig, P + "idle_sword", [
    (0, dict(SWORD, Spine=(2, 0, 0))),
    (1.2, dict(SWORD, Spine=(5, 0, 0), Head=(-4, 6, 0), _loc_Hips=(0, -0.012, 0))),
    (2.4, dict(SWORD, Spine=(2, 0, 0))),
])
gait(rig, P + "run_sword", 0.66, 46, 68, 0, 0, 14, 0.05, head=-8, extra=SWORD)
# a slash, played on top of the clip (additive in the game)
add_action(rig, P + "slash", [(0, {}), (0.1, {"UpperArm_R": (-60, 0, 30), "Spine": (0, 0, -20)}),
                              (0.22, {"UpperArm_R": (10, 0, -30), "Spine": (0, 0, 25)}), (0.38, {})], loop=False)
print(export_animated("Player", "PlayerRig", P, "player.glb"))
