# The precision rifle (sniper), unlocked for the last wave: a long bolt-action with a bronze-ringed
# scope, a wooden stock and the bandaged first-person hands of the other weapons.
# Axes as for the other weapons: the barrel points to +Y, up is +Z; "Sight" is on the scope's axis
# (the eye line when aiming), "Muzzle" at the end of the brake.
# Usage inside Blender, after helpers.py and hands.py:
#   exec(open(r"<path>/sniper.py").read())
import bpy

# materials shared with the other weapons (same values as in rifle.glb)
mat("Gunmetal", (0.08, 0.085, 0.09), rough=0.4, metal=0.85)
mat("Wood", (0.22, 0.12, 0.06), rough=0.8)
mat("Bronze", (0.45, 0.28, 0.12), rough=0.45, metal=0.8)
mat("Gold", (0.85, 0.6, 0.2), rough=0.35, metal=0.9)
mat("ScopeLens", (0.25, 0.5, 0.75), rough=0.05, emit=(0.2, 0.45, 0.8), strength=0.6)


def build_sniper():
    coll = get_coll("Sniper", clear=True)
    M = bpy.data.materials
    gm, wood, bronze, gold, lens = M["Gunmetal"], M["Wood"], M["Bronze"], M["Gold"], M["ScopeLens"]
    root = empty("Sniper", coll)

    # body
    box("N_Receiver", coll, (0.05, 0.3, 0.07), (0, 0.06, 0.05), gm, root)
    box("N_Stock", coll, (0.045, 0.3, 0.1), (0, -0.24, 0.02), wood, root, taper=0.85)
    box("N_Cheek", coll, (0.04, 0.13, 0.03), (0, -0.2, 0.085), wood, root)
    box("N_ButtPad", coll, (0.048, 0.02, 0.11), (0, -0.395, 0.02), gm, root)
    box("N_Grip", coll, (0.034, 0.05, 0.1), (0, 0.0, -0.035), wood, root, rot=(-15, 0, 0))
    box("N_Trigger", coll, (0.008, 0.03, 0.03), (0, 0.04, -0.01), gm, root)
    box("N_Mag", coll, (0.03, 0.07, 0.06), (0, 0.13, -0.01), gm, root)
    box("N_Handguard", coll, (0.056, 0.38, 0.06), (0, 0.39, 0.04), wood, root)
    box("N_Band", coll, (0.06, 0.02, 0.064), (0, 0.55, 0.04), gold, root)
    # long barrel and its muzzle brake
    cyl("N_Barrel", coll, 0.013, 0.56, (0, 0.78, 0.055), gm, root, rot=(90, 0, 0), verts=10)
    cyl("N_Brake", coll, 0.02, 0.07, (0, 1.08, 0.055), gm, root, rot=(90, 0, 0), verts=8)
    # bolt handle on the right
    cyl("N_Bolt", coll, 0.007, 0.05, (0.045, 0.02, 0.07), gm, root, rot=(0, 90, 0), verts=6)
    sphere("N_BoltKnob", coll, 0.013, (0.072, 0.02, 0.07), bronze, root)

    # scope: tube, wider objective in front, eyepiece behind, bronze rings on two mounts
    Z = 0.135
    cyl("N_ScopeTube", coll, 0.021, 0.3, (0, 0.09, Z), gm, root, rot=(90, 0, 0), verts=14)
    cyl("N_ScopeFront", coll, 0.032, 0.08, (0, 0.27, Z), gm, root, rot=(90, 0, 0), verts=14, radius_top=0.022)
    cyl("N_ScopeEye", coll, 0.028, 0.06, (0, -0.09, Z), gm, root, rot=(90, 0, 0), verts=14, radius_top=0.021)
    cyl("N_Lens", coll, 0.029, 0.004, (0, 0.312, Z), lens, root, rot=(90, 0, 0), verts=14)
    for i, y in enumerate((0.02, 0.17)):
        box("N_Mount%d" % i, coll, (0.02, 0.025, 0.045), (0, y, 0.098), gm, root)
        cyl("N_Ring%d" % i, coll, 0.025, 0.016, (0, y, Z), bronze, root, rot=(90, 0, 0), verts=14)
    cyl("N_Turret", coll, 0.012, 0.02, (0, 0.1, Z + 0.028), bronze, root, verts=10)

    empty("Sight", coll, (0, 0, Z), root)
    empty("Muzzle", coll, (0, 1.12, 0.055), root)

    # hands, placed like the assault rifle's: right hand on the grip, left hand under the handguard
    make_hand("NR_", coll, root, (0, 0.0, -0.026), (-15, 0, 0), 1, (0.11, -0.25, -0.49))
    make_hand("NL_", coll, root, (0, 0.38, 0.05), (-90, 0, -90), -1, (-0.45, -0.2, -0.43))
    return coll


build_sniper()
