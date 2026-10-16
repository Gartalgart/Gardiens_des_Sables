# Phase 10: the fire pot thrown with G. A small clay pot sealed with pitch, tied with rope, with a
# fuse whose tip glows (named "Spark", the game adds its sparks there).
# Usage inside Blender, after helpers.py:
#   exec(open(r"<path>/grenade.py").read())
import bpy


def build_grenade():
    coll = get_coll("Grenade", clear=True)
    clay = mat("Pot_Clay", (0.55, 0.27, 0.13), rough=0.9)
    clay_dark = mat("Pot_ClayDark", (0.32, 0.15, 0.07), rough=0.95)
    pitch = mat("Pot_Pitch", (0.05, 0.04, 0.03), rough=0.5)
    rope = mat("Pot_Rope", (0.62, 0.5, 0.3), rough=1.0)
    fuse = mat("Pot_Fuse", (0.2, 0.15, 0.1), rough=1.0)
    spark = mat("Pot_Spark", (1.0, 0.55, 0.15), emit=(1.0, 0.5, 0.1), strength=12.0)

    root = empty("Grenade", coll)
    # round belly, slightly squashed, with a painted band
    sphere("Pot_Body", coll, 0.1, (0, 0, 0), clay, root, scale=(1, 1, 0.88), subdiv=2)
    cyl("Pot_Band", coll, 0.101, 0.03, (0, 0, -0.005), clay_dark, root, verts=16)
    # neck and rim
    cyl("Pot_Neck", coll, 0.045, 0.05, (0, 0, 0.095), clay, root, verts=12, radius_top=0.038)
    cyl("Pot_Rim", coll, 0.05, 0.016, (0, 0, 0.122), clay_dark, root, verts=12)
    # pitch seal and rope tied around the neck
    cyl("Pot_Seal", coll, 0.04, 0.012, (0, 0, 0.133), pitch, root, verts=12)
    cyl("Pot_Rope", coll, 0.049, 0.014, (0, 0, 0.085), rope, root, verts=12)
    # a fuse leaning out of the seal, its tip burning
    cyl("Pot_Fuse", coll, 0.006, 0.07, (0.012, 0, 0.165), fuse, root, rot=(0, 20, 0), verts=6)
    sphere("Spark", coll, 0.012, (0.024, 0, 0.198), spark, root, subdiv=1)
    return coll


build_grenade()
solo("Grenade")
