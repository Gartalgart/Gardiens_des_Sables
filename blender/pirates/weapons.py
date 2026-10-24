# U1 phase 3: the pirates' weapons, each with gloved hands in shirt sleeves.
#   Cutlass     (slot 1) a curved boarding sabre with a brass knuckle bow
#   Flintlock   (slot 2) a long single-shot pistol: hammer (F_Hammer, pivots), ramrod (F_Rod)
#   Blunderbuss (slot 3) two bell-mouthed barrels side by side, ramrod (B_Rod)
#   Cannon      (slot 4) a short bronze hand cannon on a wooden tiller
#   Musket      (slot 5) a long musket with a brass spyglass, ramrod (M_Rod)
#   Bomb        (G)      an iron ball with a burning fuse ("Spark")
# Axes as for the desert's weapons: the barrel points to +Y, up is +Z, the root at the right hand;
# "Sight" is on the eye line when aiming, "Muzzle" at the mouth. The left arm's objects share a
# prefix (FL_, BL_, CL_, ML_) so the game can move it as one piece.
# Built in its own scene and exported to public/models/pirates/<name>.glb.
# Usage inside Blender, after helpers.py and hands.py (the MCP's safe mode: send all three inline).
import bpy

OUT = MODELS + r"\pirates"

mat("Skin", (0.34, 0.22, 0.15), 0.8)
mat("Glove", (0.1, 0.055, 0.03), rough=0.75)
mat("Shirt", (0.42, 0.39, 0.33), rough=0.95)
mat("Iron", (0.05, 0.05, 0.055), rough=0.55, metal=0.8)
mat("Steel", (0.55, 0.57, 0.6), rough=0.3, metal=0.9)
mat("Brass", (0.62, 0.45, 0.16), rough=0.35, metal=0.85)
mat("Bronze", (0.45, 0.28, 0.12), rough=0.45, metal=0.8)
mat("Wood", (0.22, 0.12, 0.06), rough=0.8)
mat("DarkWood", (0.12, 0.06, 0.03), rough=0.8)
mat("Leather", (0.2, 0.1, 0.05), rough=0.85)
mat("Flint", (0.3, 0.3, 0.28), rough=0.7)
mat("Fuse", (0.25, 0.18, 0.1), rough=1.0)
mat("Bomb_Spark", (1.0, 0.55, 0.15), emit=(1.0, 0.5, 0.1), strength=12.0)

# fingerless leather gloves, white shirt sleeves rolled up in folds, a leather cuff at the wrist
GLOVED = {
    "palm": "Glove", "fingers": "Skin", "knuckles": "Glove", "tips": "Skin", "thumb": "Skin",
    "pad": "Glove", "web": "Glove", "arm": "Shirt", "wrap": "Shirt", "band": "Glove",
    "arm_size": (0.07, 0.064), "wrap_size": (0.082, 0.045, 0.076), "band_size": (0.072, 0.03, 0.066),
}


def build_cutlass():
    coll = get_coll("Cutlass", clear=True)
    M = bpy.data.materials
    root = empty("Cutlass", coll)
    # grip wrapped in leather, brass pommel, a wide guard plate and the knuckle bow below the hand
    cyl("C_Grip", coll, 0.016, 0.12, (0, -0.07, 0), M["Leather"], root, rot=(90, 0, 0), verts=8)
    for i, y in enumerate((-0.11, -0.07, -0.03)):
        cyl("C_GripRing%d" % i, coll, 0.018, 0.008, (0, y, 0), M["Brass"], root, rot=(90, 0, 0), verts=8)
    sphere("C_Pommel", coll, 0.024, (0, -0.14, 0.002), M["Brass"], root, scale=(1, 0.8, 1))
    box("C_Guard", coll, (0.05, 0.012, 0.11), (0, 0.0, -0.02), M["Brass"], root)
    box("C_Quillon", coll, (0.016, 0.03, 0.016), (0, 0.016, 0.04), M["Brass"], root, rot=(30, 0, 0))
    box("C_BowFront", coll, (0.012, 0.012, 0.05), (0, -0.002, -0.07), M["Brass"], root)
    box("C_Bow", coll, (0.012, 0.135, 0.012), (0, -0.07, -0.092), M["Brass"], root)
    box("C_BowBack", coll, (0.012, 0.012, 0.09), (0, -0.138, -0.05), M["Brass"], root, rot=(-20, 0, 0))
    # the blade: five pieces bending back toward the spine (+Z), the edge down, the last one a point
    y, z, a = 0.01, 0.0, 0.0
    pieces = ((0.13, 0.062), (0.13, 0.06), (0.12, 0.057), (0.1, 0.052), (0.08, 0.039))
    for i, (ln, h) in enumerate(pieces):
        last = i == len(pieces) - 1
        # the taper narrows the box's top (+Z), so the point is built upright and turned top forward
        size = (0.007, h, ln) if last else (0.007, ln, h)
        b = box("C_Blade%d" % i, coll, size, (0, 0, 0), M["Steel"], root, taper=0.2 if last else 1.0)
        b.rotation_euler = (math.radians(a - (90 if last else 0)), 0, 0)
        dy, dz = math.cos(math.radians(a)), math.sin(math.radians(a))
        b.location = (0, y + dy * ln / 2, z + dz * ln / 2 - 0.004)
        y += dy * ln
        z += dz * ln
        a += 4.5
    empty("Tip", coll, (0, y, z), root)
    make_hand("CR_", coll, root, (0, -0.07, 0), (0, 90, 0), 1, (0.38, -0.7, 0.36), GLOVED)
    return coll


def build_flintlock():
    coll = get_coll("Flintlock", clear=True)
    M = bpy.data.materials
    root = empty("Flintlock", coll)
    # long octagonal barrel, a brass ring at the mouth, the bead sight on top
    cyl("F_Barrel", coll, 0.014, 0.32, (0, 0.16, 0.062), M["Iron"], root, rot=(90, 0, 0), verts=8)
    cyl("F_Mouth", coll, 0.018, 0.02, (0, 0.315, 0.062), M["Brass"], root, rot=(90, 0, 0), verts=8)
    sphere("F_Bead", coll, 0.004, (0, 0.3, 0.078), M["Brass"], root)
    # wooden stock under the barrel, down to the curved grip and its brass butt cap
    box("F_Stock", coll, (0.03, 0.27, 0.03), (0, 0.13, 0.04), M["Wood"], root)
    box("F_Grip", coll, (0.03, 0.048, 0.11), (0, -0.03, -0.015), M["Wood"], root, rot=(-28, 0, 0))
    sphere("F_Butt", coll, 0.028, (0, -0.062, -0.07), M["Brass"], root, scale=(0.75, 1, 0.9))
    box("F_Breech", coll, (0.034, 0.06, 0.04), (0, -0.005, 0.055), M["Wood"], root)
    box("F_Guard", coll, (0.006, 0.06, 0.006), (0, 0.025, -0.012), M["Brass"], root)
    box("F_GuardFront", coll, (0.006, 0.006, 0.03), (0, 0.055, 0.003), M["Brass"], root)
    box("F_Trigger", coll, (0.005, 0.008, 0.024), (0, 0.025, 0.004), M["Iron"], root, rot=(15, 0, 0))
    # the lock on the right: plate, pan and frizzen, and the hammer holding its flint on a pivot
    box("F_Lock", coll, (0.006, 0.075, 0.03), (0.018, 0.005, 0.052), M["Iron"], root)
    box("F_Pan", coll, (0.012, 0.016, 0.006), (0.024, 0.03, 0.068), M["Brass"], root)
    box("F_Frizzen", coll, (0.008, 0.006, 0.026), (0.026, 0.036, 0.083), M["Iron"], root)
    hammer = empty("F_Hammer", coll, (0.025, -0.012, 0.058), root)
    box("F_HammerNeck", coll, (0.007, 0.012, 0.04), (0, 0.004, 0.018), M["Iron"], hammer, rot=(-25, 0, 0))
    box("F_HammerJaw", coll, (0.009, 0.016, 0.01), (0, 0.016, 0.036), M["Iron"], hammer)
    box("F_FlintStone", coll, (0.008, 0.01, 0.008), (0, 0.028, 0.034), M["Flint"], hammer)
    # the ramrod under the barrel
    cyl("F_Rod", coll, 0.004, 0.26, (0, 0.17, 0.026), M["DarkWood"], root, rot=(90, 0, 0), verts=6)
    empty("Sight", coll, (0, 0, 0.082), root)
    empty("Muzzle", coll, (0, 0.33, 0.062), root)
    # right hand on the grip, left hand under the right one, as on the desert pistol
    make_hand("FR_", coll, root, (0, -0.025, -0.02), (-25, 0, 0), 1, (0.112, -0.365, -0.581), GLOVED)
    make_hand("FL_", coll, root, (-0.014, -0.004, -0.04), (-25, 0, -18), -1, (-0.298, -0.38, -0.568), GLOVED)
    return coll


def build_blunderbuss():
    coll = get_coll("Blunderbuss", clear=True)
    M = bpy.data.materials
    root = empty("Blunderbuss", coll)
    # two barrels side by side, flaring into bells at the mouth, a brass rib between them
    for i, x in enumerate((-0.019, 0.019)):
        cyl("B_Barrel%d" % i, coll, 0.017, 0.52, (x, 0.34, 0.062), M["Bronze"], root, rot=(90, 0, 0), verts=10)
        cyl("B_Bell%d" % i, coll, 0.018, 0.11, (x, 0.655, 0.062), M["Bronze"], root, rot=(-90, 0, 0), verts=10, radius_top=0.036)
        cyl("B_Band%d" % i, coll, 0.02, 0.016, (x, 0.2, 0.062), M["Brass"], root, rot=(90, 0, 0), verts=10)
    box("B_Rib", coll, (0.008, 0.5, 0.012), (0, 0.33, 0.082), M["Brass"], root)
    # the wooden stock: forend under the barrels, the wrist and a heavy butt
    box("B_Forend", coll, (0.06, 0.4, 0.035), (0, 0.27, 0.035), M["Wood"], root)
    box("B_Breech", coll, (0.07, 0.1, 0.06), (0, 0.04, 0.05), M["Wood"], root)
    box("B_Wrist", coll, (0.04, 0.12, 0.05), (0, -0.07, 0.02), M["Wood"], root, rot=(-12, 0, 0))
    box("B_Butt", coll, (0.048, 0.24, 0.11), (0, -0.24, -0.01), M["Wood"], root, taper=0.8)
    box("B_ButtPlate", coll, (0.05, 0.012, 0.115), (0, -0.362, -0.01), M["Brass"], root)
    box("B_Guard", coll, (0.008, 0.08, 0.008), (0, 0.0, -0.028), M["Brass"], root)
    box("B_Trigger", coll, (0.006, 0.01, 0.026), (0, 0.0, -0.008), M["Iron"], root, rot=(15, 0, 0))
    # two locks, one per barrel
    for i, x in enumerate((-0.037, 0.037)):
        box("B_Lock%d" % i, coll, (0.006, 0.08, 0.03), (x, 0.05, 0.055), M["Iron"], root)
        box("B_Hammer%d" % i, coll, (0.008, 0.014, 0.034), (x * 1.1, 0.02, 0.08), M["Iron"], root, rot=(-25, 0, 0))
    cyl("B_Rod", coll, 0.005, 0.38, (0, 0.28, 0.012), M["DarkWood"], root, rot=(90, 0, 0), verts=6)
    empty("Sight", coll, (0, 0, 0.094), root)
    empty("Muzzle", coll, (0, 0.72, 0.062), root)
    # right hand on the wrist, left hand under the forend, like the desert shotgun
    make_hand("BR_", coll, root, (0, -0.03, -0.02), (-20, 0, 0), 1, (0.1, -0.166, -0.49), GLOVED)
    make_hand("BL_", coll, root, (0, 0.33, 0.02), (-90, 0, -90), -1, (-0.5, -0.12, -0.36), GLOVED)
    return coll


def build_cannon():
    coll = get_coll("Cannon", clear=True)
    M = bpy.data.materials
    root = empty("Cannon", coll)
    Z = 0.09
    # the bronze barrel: thick at the breech, a swell at the mouth, reinforcing rings, the cascabel
    cyl("H_Barrel", coll, 0.05, 0.42, (0, 0.25, Z), M["Bronze"], root, rot=(-90, 0, 0), verts=14, radius_top=0.042)
    cyl("H_Swell", coll, 0.054, 0.05, (0, 0.47, Z), M["Bronze"], root, rot=(-90, 0, 0), verts=14, radius_top=0.05)
    cyl("H_Bore", coll, 0.032, 0.006, (0, 0.496, Z), M["Iron"], root, rot=(90, 0, 0), verts=14)
    for i, (y, r) in enumerate(((0.07, 0.056), (0.2, 0.052), (0.36, 0.048))):
        cyl("H_Ring%d" % i, coll, r, 0.018, (0, y, Z), M["Brass"], root, rot=(90, 0, 0), verts=14)
    sphere("H_Cascabel", coll, 0.03, (0, 0.03, Z), M["Bronze"], root)
    box("H_Notch", coll, (0.02, 0.012, 0.012), (0, 0.06, Z + 0.058), M["Brass"], root)
    sphere("H_Ember", coll, 0.006, (0, 0.08, Z + 0.05), M["Bomb_Spark"], root)
    # the tiller: an iron strap holds the barrel on a wooden stock, a grip for the right hand
    box("H_Bed", coll, (0.07, 0.36, 0.04), (0, 0.24, Z - 0.06), M["Wood"], root)
    for i, y in enumerate((0.12, 0.33)):
        box("H_Strap%d" % i, coll, (0.11, 0.025, 0.012), (0, y, Z - 0.03), M["Iron"], root)
    box("H_Tiller", coll, (0.05, 0.28, 0.06), (0, -0.12, 0.0), M["Wood"], root, rot=(8, 0, 0))
    box("H_Grip", coll, (0.036, 0.05, 0.1), (0, -0.03, -0.03), M["Wood"], root, rot=(-15, 0, 0))
    box("H_Trigger", coll, (0.006, 0.012, 0.03), (0, 0.02, -0.01), M["Iron"], root, rot=(15, 0, 0))
    box("H_Guard", coll, (0.008, 0.07, 0.008), (0, 0.02, -0.03), M["Iron"], root)
    empty("Sight", coll, (0, 0, Z + 0.066), root)
    empty("Muzzle", coll, (0, 0.5, Z), root)
    make_hand("HR_", coll, root, (0, -0.03, -0.026), (-15, 0, 0), 1, (0.11, -0.3, -0.52), GLOVED)
    make_hand("CL_", coll, root, (0, 0.3, Z - 0.075), (-90, 0, -90), -1, (-0.5, -0.05, -0.4), GLOVED)
    return coll


def build_musket():
    """[5] the long musket with a brass spyglass on top, for the last wave"""
    coll = get_coll("Musket", clear=True)
    M = bpy.data.materials
    root = empty("Musket", coll)
    # a long iron barrel held to the stock by brass bands, the mouth ringed in brass
    cyl("M_Barrel", coll, 0.014, 0.9, (0, 0.62, 0.06), M["Iron"], root, rot=(90, 0, 0), verts=8)
    cyl("M_Mouth", coll, 0.018, 0.025, (0, 1.07, 0.06), M["Brass"], root, rot=(90, 0, 0), verts=8)
    box("M_Forend", coll, (0.04, 0.72, 0.035), (0, 0.5, 0.035), M["Wood"], root)
    for i, y in enumerate((0.3, 0.6, 0.85)):
        box("M_Band%d" % i, coll, (0.046, 0.018, 0.06), (0, y, 0.045), M["Brass"], root)
    box("M_Breech", coll, (0.05, 0.12, 0.06), (0, 0.06, 0.045), M["Wood"], root)
    box("M_Wrist", coll, (0.036, 0.12, 0.05), (0, -0.07, 0.015), M["Wood"], root, rot=(-12, 0, 0))
    box("M_Butt", coll, (0.044, 0.26, 0.1), (0, -0.25, -0.015), M["Wood"], root, taper=0.8)
    box("M_ButtPlate", coll, (0.046, 0.012, 0.105), (0, -0.382, -0.015), M["Brass"], root)
    box("M_Guard", coll, (0.008, 0.08, 0.008), (0, 0.0, -0.022), M["Brass"], root)
    box("M_Trigger", coll, (0.006, 0.01, 0.024), (0, 0.0, -0.004), M["Iron"], root, rot=(15, 0, 0))
    box("M_Lock", coll, (0.006, 0.08, 0.03), (0.026, 0.06, 0.05), M["Iron"], root)
    box("M_Hammer", coll, (0.008, 0.014, 0.034), (0.03, 0.03, 0.075), M["Iron"], root, rot=(-25, 0, 0))
    # the spyglass: a brass tube on two mounts, wider at the front, a lens at each end
    Z = 0.125
    cyl("M_Glass", coll, 0.018, 0.34, (0, 0.2, Z), M["Brass"], root, rot=(90, 0, 0), verts=12)
    cyl("M_GlassFront", coll, 0.026, 0.07, (0, 0.4, Z), M["Brass"], root, rot=(-90, 0, 0), verts=12, radius_top=0.03)
    cyl("M_GlassEye", coll, 0.022, 0.04, (0, 0.01, Z), M["DarkWood"], root, rot=(90, 0, 0), verts=12)
    for i, y in enumerate((0.12, 0.3)):
        box("M_Mount%d" % i, coll, (0.016, 0.02, 0.05), (0, y, 0.09), M["Iron"], root)
    cyl("M_Rod", coll, 0.004, 0.7, (0, 0.5, 0.012), M["DarkWood"], root, rot=(90, 0, 0), verts=6)
    empty("Sight", coll, (0, 0, Z), root)
    empty("Muzzle", coll, (0, 1.09, 0.06), root)
    make_hand("MR_", coll, root, (0, -0.03, -0.02), (-20, 0, 0), 1, (0.1, -0.166, -0.49), GLOVED)
    make_hand("ML_", coll, root, (0, 0.42, 0.015), (-90, 0, -90), -1, (-0.45, -0.2, -0.43), GLOVED)
    return coll


def build_bomb():
    coll = get_coll("Bomb", clear=True)
    M = bpy.data.materials
    root = empty("Grenade", coll)
    sphere("Bomb_Body", coll, 0.1, (0, 0, 0), M["Iron"], root, subdiv=2)
    cyl("Bomb_Neck", coll, 0.03, 0.035, (0, 0, 0.1), M["Brass"], root, verts=10)
    # a fuse curling out of the neck, its tip burning
    cyl("Bomb_Fuse0", coll, 0.006, 0.05, (0.006, 0, 0.135), M["Fuse"], root, rot=(0, 15, 0), verts=6)
    cyl("Bomb_Fuse1", coll, 0.006, 0.04, (0.024, 0, 0.165), M["Fuse"], root, rot=(0, 45, 0), verts=6)
    sphere("Spark", coll, 0.012, (0.04, 0, 0.18), M["Bomb_Spark"], root, subdiv=1)
    return coll


def export_weapon(coll, filename):
    coll.hide_viewport = False
    bpy.ops.object.select_all(action="DESELECT")
    for ob in coll.all_objects:
        ob.hide_set(False)
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT + "\\" + filename, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, use_active_scene=True)


def build_all(export=True):
    scene = bpy.data.scenes.get("Weapons") or bpy.data.scenes.new("Weapons")
    bpy.context.window.scene = scene
    built = [(build_cutlass(), "cutlass.glb"), (build_flintlock(), "flintlock.glb"),
             (build_blunderbuss(), "blunderbuss.glb"), (build_cannon(), "cannon.glb"), (build_musket(), "musket.glb"),
             (build_bomb(), "bomb.glb")]
    # side by side for a look
    for i, (c, _) in enumerate(built):
        bpy.data.objects[c.name if c.name != "Bomb" else "Grenade"].location.x = i * 0.6
    if export:
        for c, f in built:
            bpy.data.objects[c.name if c.name != "Bomb" else "Grenade"].location.x = 0
            export_weapon(c, f)
    return built
