# Phase 5 enemies: the kamikaze mummy and the climbing scarab.
# Usage inside Blender (after helpers.py): exec(open(r"<path>/enemies2.py").read())
import bpy
import math

mat("Bandage", (0.5, 0.45, 0.33), 0.95)
mat("BandageDark", (0.3, 0.26, 0.19), 0.95)
mat("GlowGreen", (0.45, 1.0, 0.3), 0.5, 0.0, (0.45, 1.0, 0.3), 9.0)
mat("ShellTeal", (0.02, 0.12, 0.1), 0.25, 0.9)
mat("ShellEdge", (0.1, 0.45, 0.35), 0.3, 0.8)
mat("ChitinDark", (0.03, 0.03, 0.035), 0.6, 0.2)
mat("EyeTeal", (0.3, 1.0, 0.85), 0.5, 0.0, (0.3, 1.0, 0.85), 10.0)


def build_mummy():
    M = bpy.data.materials
    c = get_coll("Enemy_Mummy", clear=True)
    root = empty("Mummy", c)
    # torso wrapped in bandages, the glowing core shows through a gap in the chest
    box("MBody", c, (0.5, 0.32, 0.62), (0, 0.0, 1.06), M["Bandage"], root, taper=1.1)
    for i, z in enumerate((0.84, 1.0, 1.16, 1.3)):
        box("MWrap%d" % i, c, (0.53, 0.34, 0.045), (0, 0.0, z), M["BandageDark"], root, rot=(0, (-1) ** i * 6, 0))
    box("MCore", c, (0.16, 0.04, 0.16), (0.04, -0.165, 1.1), M["GlowGreen"], root)
    box("MPelvis", c, (0.42, 0.28, 0.2), (0, 0.01, 0.7), M["BandageDark"], root)
    box("MSkull", c, (0.26, 0.26, 0.3), (0, -0.03, 1.55), M["Bandage"], root)
    box("MSkullWrap", c, (0.28, 0.28, 0.05), (0, -0.03, 1.6), M["BandageDark"], root, rot=(8, 0, 0))
    box("MEyeL", c, (0.05, 0.02, 0.03), (-0.06, -0.165, 1.56), M["GlowGreen"], root)
    box("MEyeR", c, (0.05, 0.02, 0.03), (0.06, -0.165, 1.56), M["GlowGreen"], root)
    box("MJaw", c, (0.2, 0.2, 0.06), (0, -0.05, 1.41), M["BandageDark"], root)
    for side, x in (("L", -1), ("R", 1)):
        box("MUpper" + side, c, (0.12, 0.12, 0.34), (0.3 * x, 0, 1.18), M["Bandage"], root)
        box("MFore" + side, c, (0.11, 0.11, 0.3), (0.3 * x, -0.02, 0.86), M["Bandage"], root)
        box("MHand" + side, c, (0.1, 0.08, 0.1), (0.3 * x, -0.03, 0.66), M["BandageDark"], root)
        box("MRag" + side, c, (0.03, 0.02, 0.22), (0.33 * x, 0.05, 0.92), M["BandageDark"], root, rot=(10, 0, 0))
        box("MThigh" + side, c, (0.15, 0.16, 0.34), (0.11 * x, 0.01, 0.45), M["Bandage"], root)
        box("MShin" + side, c, (0.13, 0.13, 0.26), (0.11 * x, 0.02, 0.15), M["Bandage"], root)
        box("MFoot" + side, c, (0.13, 0.22, 0.06), (0.11 * x, -0.03, 0.03), M["BandageDark"], root)
    return c


def build_scarab():
    M = bpy.data.materials
    c = get_coll("Enemy_Scarab", clear=True)
    root = empty("Scarab", c)
    box("SShell", c, (0.38, 0.46, 0.18), (0, 0.04, 0.26), M["ShellTeal"], root, taper=0.75)
    box("SShellSeam", c, (0.012, 0.46, 0.02), (0, 0.04, 0.355), M["ShellEdge"], root)
    box("SBelly", c, (0.3, 0.4, 0.08), (0, 0.04, 0.16), M["ChitinDark"], root)
    box("SThorax", c, (0.3, 0.14, 0.14), (0, -0.24, 0.24), M["ShellEdge"], root, taper=0.85)
    box("SHead", c, (0.2, 0.12, 0.1), (0, -0.36, 0.22), M["ChitinDark"], root)
    box("SEyeL", c, (0.04, 0.02, 0.03), (-0.06, -0.42, 0.24), M["EyeTeal"], root)
    box("SEyeR", c, (0.04, 0.02, 0.03), (0.06, -0.42, 0.24), M["EyeTeal"], root)
    for side, x in (("L", -1), ("R", 1)):
        box("SMandible" + side, c, (0.03, 0.12, 0.03), (0.05 * x, -0.47, 0.2), M["ChitinDark"], root, rot=(0, 0, 22 * x))
        for name, y in (("F", -0.18), ("M", 0.02), ("B", 0.2)):
            # each leg: a thigh going out and a shin going down to the ground
            box("SLeg%s%s" % (name, side), c, (0.2, 0.035, 0.035), (0.24 * x, y, 0.2), M["ChitinDark"], root, rot=(0, -25 * x, 0))
            box("SFoot%s%s" % (name, side), c, (0.03, 0.03, 0.17), (0.36 * x, y, 0.08), M["ChitinDark"], root)
    return c
