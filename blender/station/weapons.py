# U2 phase 2: the station's weapons, each with gloved hands in the sleeves of a flight suit.
#   Baton    (slot 1) an electric baton: rubber grip, steel shaft, two prongs with an arc (T_Coil)
#   Laser    (slot 2) a boxy laser pistol: three coils round the emitter glow with heat (X_Coil*)
#   Plasma   (slot 3) a pulse rifle with a carry handle; vents along the shroud glow (Q_Coil*)
#   Flamer   (slot 4) a flamethrower: nozzle with a pilot light (G_Pilot), fuel canister (G_Tank)
#   Railgun  (slot 5) two rails with coils between them (Y_Coil*), a scope, a power cell (Y_Cell)
#   Mine     (G)      a sticky mine: magnetic claws, a blinking light ("Led")
# Axes as for the other universes' weapons: the barrel points to +Y, up is +Z, the root at the right
# hand; "Sight" is on the eye line when aiming, "Muzzle" at the mouth. The left arm's objects share a
# prefix (XL_, QL_, GL_, YL_) so the game can move it as one piece.
# Built in the "Weapons" scene of station.blend, exported to public/models/station/<name>.glb.
# Usage inside Blender, after helpers.py and hands.py (the MCP's safe mode: send all three inline).
import bpy

OUT = MODELS + r"\station"

mat("Skin", (0.34, 0.22, 0.15), 0.8)
mat("Suit", (0.15, 0.14, 0.09), rough=0.95)
mat("SuitGlove", (0.025, 0.025, 0.03), rough=0.7)
mat("SuitCuff", (0.09, 0.09, 0.1), rough=0.8)
mat("GunMetal", (0.045, 0.05, 0.055), rough=0.45, metal=0.8)
mat("GunPlate", (0.17, 0.18, 0.19), rough=0.5, metal=0.6)
mat("Olive", (0.1, 0.11, 0.07), rough=0.7, metal=0.3)
mat("Rubber", (0.02, 0.02, 0.022), rough=0.9)
mat("WHazard", (0.8, 0.55, 0.04), rough=0.6)
mat("FuelRed", (0.35, 0.04, 0.03), rough=0.5, metal=0.3)
mat("LaserGlow", (1.0, 0.15, 0.08), emit=(1.0, 0.12, 0.05), strength=3.0)
mat("PlasmaGlow", (0.3, 1.0, 0.6), emit=(0.25, 1.0, 0.55), strength=3.0)
mat("RailGlow", (0.4, 0.75, 1.0), emit=(0.35, 0.7, 1.0), strength=3.0)
mat("ArcGlow", (0.6, 0.8, 1.0), emit=(0.55, 0.8, 1.0), strength=6.0)
mat("PilotGlow", (1.0, 0.55, 0.15), emit=(1.0, 0.5, 0.1), strength=8.0)
mat("DisplayGlow", (0.15, 0.95, 0.35), emit=(0.15, 0.95, 0.35), strength=2.0)
mat("MineLed", (1.0, 0.1, 0.05), emit=(1.0, 0.08, 0.03), strength=8.0)

# black gloves, olive flight-suit sleeves, a grey cuff at the wrist
SUIT = {
    "palm": "SuitGlove", "fingers": "SuitGlove", "knuckles": "SuitGlove", "tips": "SuitGlove", "thumb": "SuitGlove",
    "pad": "SuitGlove", "web": "SuitGlove", "arm": "Suit", "wrap": "Suit", "band": "SuitCuff",
    "arm_size": (0.075, 0.068), "wrap_size": (0.086, 0.05, 0.08), "band_size": (0.08, 0.035, 0.074),
}


def build_baton():
    coll = get_coll("Baton", clear=True)
    M = bpy.data.materials
    root = empty("Baton", coll)
    cyl("T_Grip", coll, 0.018, 0.14, (0, -0.07, 0), M["Rubber"], root, rot=(90, 0, 0), verts=8)
    cyl("T_Cap", coll, 0.021, 0.02, (0, -0.145, 0), M["GunMetal"], root, rot=(90, 0, 0), verts=8)
    cyl("T_Guard", coll, 0.028, 0.012, (0, 0.004, 0), M["GunMetal"], root, rot=(90, 0, 0), verts=10)
    box("T_Switch", coll, (0.01, 0.02, 0.012), (0, -0.02, 0.02), M["WHazard"], root)
    cyl("T_Shaft", coll, 0.012, 0.4, (0, 0.21, 0), M["GunPlate"], root, rot=(90, 0, 0), verts=8)
    for i, y in enumerate((0.1, 0.22, 0.34)):
        cyl("T_Ring%d" % i, coll, 0.015, 0.01, (0, y, 0), M["Rubber"], root, rot=(90, 0, 0), verts=8)
    cyl("T_Head", coll, 0.017, 0.03, (0, 0.42, 0), M["GunMetal"], root, rot=(90, 0, 0), verts=8)
    for x in (-0.012, 0.012):
        box("T_Prong", coll, (0.005, 0.06, 0.005), (x, 0.46, 0), M["GunPlate"], root)
    cyl("T_Coil", coll, 0.006, 0.04, (0, 0.47, 0), M["ArcGlow"], root, rot=(90, 0, 0), verts=6)
    empty("Tip", coll, (0, 0.5, 0), root)
    make_hand("TR_", coll, root, (0, -0.07, 0), (0, 90, 0), 1, (0.38, -0.7, 0.36), SUIT)
    return coll


def build_laser():
    coll = get_coll("Laser", clear=True)
    M = bpy.data.materials
    root = empty("Laser", coll)
    box("X_Body", coll, (0.034, 0.2, 0.05), (0, 0.06, 0.055), M["GunPlate"], root)
    box("X_Rail", coll, (0.02, 0.16, 0.012), (0, 0.05, 0.086), M["GunMetal"], root)
    box("X_FrontSight", coll, (0.006, 0.01, 0.014), (0, 0.13, 0.095), M["GunMetal"], root)
    box("X_RearSight", coll, (0.02, 0.01, 0.014), (0, -0.015, 0.095), M["GunMetal"], root)
    cyl("X_Emitter", coll, 0.016, 0.07, (0, 0.19, 0.055), M["GunMetal"], root, rot=(90, 0, 0), verts=10)
    cyl("X_Lens", coll, 0.011, 0.006, (0, 0.226, 0.055), M["LaserGlow"], root, rot=(90, 0, 0), verts=10)
    for i, y in enumerate((0.135, 0.155, 0.175)):
        cyl("X_Coil%d" % i, coll, 0.021, 0.008, (0, y, 0.055), M["LaserGlow"], root, rot=(90, 0, 0), verts=10)
    box("X_Battery", coll, (0.026, 0.06, 0.035), (0, 0.085, 0.015), M["GunMetal"], root)
    box("X_BatteryStripe", coll, (0.027, 0.012, 0.036), (0, 0.085, 0.015), M["WHazard"], root)
    box("X_Grip", coll, (0.03, 0.045, 0.1), (0, -0.03, -0.015), M["Rubber"], root, rot=(-20, 0, 0))
    box("X_Guard", coll, (0.006, 0.05, 0.006), (0, 0.025, -0.012), M["GunMetal"], root)
    box("X_Trigger", coll, (0.005, 0.008, 0.024), (0, 0.025, 0.004), M["GunMetal"], root, rot=(15, 0, 0))
    empty("Sight", coll, (0, 0, 0.1), root)
    empty("Muzzle", coll, (0, 0.23, 0.055), root)
    make_hand("XR_", coll, root, (0, -0.025, -0.02), (-25, 0, 0), 1, (0.112, -0.365, -0.581), SUIT)
    make_hand("XL_", coll, root, (-0.014, -0.004, -0.04), (-25, 0, -18), -1, (-0.298, -0.38, -0.568), SUIT)
    return coll


def build_plasma():
    coll = get_coll("Plasma", clear=True)
    M = bpy.data.materials
    root = empty("Plasma", coll)
    box("Q_Receiver", coll, (0.055, 0.36, 0.07), (0, 0.12, 0.06), M["Olive"], root)
    box("Q_Shroud", coll, (0.05, 0.26, 0.05), (0, 0.42, 0.065), M["GunMetal"], root)
    cyl("Q_Barrel", coll, 0.012, 0.08, (0, 0.585, 0.065), M["GunMetal"], root, rot=(90, 0, 0), verts=8)
    for i, y in enumerate((0.34, 0.4, 0.46, 0.52)):
        box("Q_Coil%d" % i, coll, (0.054, 0.03, 0.012), (0, y, 0.07), M["PlasmaGlow"], root)
    cyl("Q_Chamber", coll, 0.022, 0.2, (0, 0.36, 0.015), M["GunPlate"], root, rot=(90, 0, 0), verts=10)
    cyl("Q_ChamberCap", coll, 0.024, 0.015, (0, 0.465, 0.015), M["GunMetal"], root, rot=(90, 0, 0), verts=10)
    box("Q_Handle", coll, (0.012, 0.2, 0.012), (0, 0.12, 0.135), M["GunMetal"], root)
    for y in (0.03, 0.21):
        box("Q_HandlePost", coll, (0.012, 0.014, 0.04), (0, y, 0.11), M["GunMetal"], root)
    box("Q_FrontSight", coll, (0.006, 0.01, 0.03), (0, 0.5, 0.1), M["GunMetal"], root)
    box("Q_Display", coll, (0.03, 0.03, 0.004), (0, 0.01, 0.097), M["DisplayGlow"], root)
    box("Q_Grip", coll, (0.032, 0.045, 0.1), (0, -0.03, -0.02), M["Rubber"], root, rot=(-20, 0, 0))
    box("Q_Guard", coll, (0.008, 0.07, 0.008), (0, 0.01, -0.025), M["GunMetal"], root)
    box("Q_Trigger", coll, (0.006, 0.01, 0.026), (0, 0.01, -0.005), M["GunMetal"], root, rot=(15, 0, 0))
    box("Q_Stock", coll, (0.04, 0.22, 0.05), (0, -0.19, 0.045), M["GunMetal"], root)
    box("Q_Butt", coll, (0.045, 0.02, 0.1), (0, -0.3, 0.025), M["Rubber"], root)
    empty("Sight", coll, (0, 0, 0.128), root)
    empty("Muzzle", coll, (0, 0.63, 0.065), root)
    make_hand("QR_", coll, root, (0, -0.03, -0.02), (-20, 0, 0), 1, (0.1, -0.166, -0.49), SUIT)
    make_hand("QL_", coll, root, (0, 0.33, -0.005), (-90, 0, -90), -1, (-0.5, -0.12, -0.36), SUIT)
    return coll


def build_flamer():
    coll = get_coll("Flamer", clear=True)
    M = bpy.data.materials
    root = empty("Flamer", coll)
    box("G_Body", coll, (0.06, 0.3, 0.075), (0, 0.1, 0.06), M["GunPlate"], root)
    box("G_BodyStripe", coll, (0.062, 0.04, 0.077), (0, 0.2, 0.06), M["WHazard"], root)
    cyl("G_Nozzle", coll, 0.018, 0.34, (0, 0.42, 0.075), M["GunMetal"], root, rot=(90, 0, 0), verts=10)
    cyl("G_NozzleTip", coll, 0.022, 0.04, (0, 0.6, 0.075), M["GunMetal"], root, rot=(-90, 0, 0), verts=10, radius_top=0.028)
    box("G_Shield", coll, (0.052, 0.18, 0.052), (0, 0.4, 0.075), M["Rubber"], root)
    for y in (0.34, 0.38, 0.42, 0.46):
        box("G_ShieldSlot", coll, (0.054, 0.012, 0.03), (0, y, 0.075), M["GunMetal"], root)
    box("G_PilotArm", coll, (0.008, 0.04, 0.008), (0, 0.585, 0.045), M["GunMetal"], root)
    sphere("G_Pilot", coll, 0.009, (0, 0.607, 0.045), M["PilotGlow"], root)
    cyl("G_Tank", coll, 0.038, 0.2, (0, 0.17, -0.005), M["FuelRed"], root, rot=(90, 0, 0), verts=12)
    for y in (0.08, 0.26):
        cyl("G_TankCap", coll, 0.04, 0.012, (0, y, -0.005), M["GunMetal"], root, rot=(90, 0, 0), verts=12)
    cyl("G_Hose", coll, 0.007, 0.16, (0.03, 0.3, 0.03), M["Rubber"], root, rot=(70, 0, 0), verts=6)
    box("G_Grip", coll, (0.032, 0.045, 0.1), (0, -0.03, -0.02), M["Rubber"], root, rot=(-20, 0, 0))
    box("G_Guard", coll, (0.008, 0.07, 0.008), (0, 0.01, -0.025), M["GunMetal"], root)
    box("G_Trigger", coll, (0.006, 0.01, 0.026), (0, 0.01, -0.005), M["GunMetal"], root, rot=(15, 0, 0))
    box("G_FrontGrip", coll, (0.03, 0.04, 0.11), (0, 0.33, -0.01), M["Rubber"], root, rot=(-10, 0, 0))
    box("G_Stock", coll, (0.04, 0.18, 0.05), (0, -0.16, 0.05), M["GunMetal"], root)
    box("G_Rail", coll, (0.016, 0.14, 0.01), (0, 0.06, 0.103), M["GunMetal"], root)
    empty("Sight", coll, (0, 0, 0.115), root)
    empty("Muzzle", coll, (0, 0.62, 0.075), root)
    make_hand("GR_", coll, root, (0, -0.03, -0.02), (-20, 0, 0), 1, (0.1, -0.166, -0.49), SUIT)
    make_hand("GL_", coll, root, (0, 0.33, -0.03), (-10, 0, 0), -1, (-0.42, -0.02, -0.5), SUIT)
    return coll


def build_railgun():
    coll = get_coll("Railgun", clear=True)
    M = bpy.data.materials
    root = empty("Railgun", coll)
    box("Y_Body", coll, (0.07, 0.4, 0.09), (0, 0.08, 0.06), M["GunMetal"], root)
    for x in (-0.024, 0.024):
        box("Y_Rail", coll, (0.012, 0.62, 0.032), (x, 0.55, 0.07), M["GunPlate"], root)
    for i, y in enumerate((0.32, 0.42, 0.52, 0.62, 0.72)):
        box("Y_Coil%d" % i, coll, (0.034, 0.03, 0.024), (0, y, 0.07), M["RailGlow"], root)
    for y in (0.29, 0.85):
        box("Y_Brace", coll, (0.064, 0.02, 0.05), (0, y, 0.07), M["GunMetal"], root)
    box("Y_Cell", coll, (0.05, 0.12, 0.05), (0, 0.12, -0.005), M["GunPlate"], root)
    box("Y_CellLight", coll, (0.052, 0.02, 0.01), (0, 0.12, 0.012), M["RailGlow"], root)
    box("Y_Scope", coll, (0.032, 0.15, 0.036), (0, 0.08, 0.135), M["GunMetal"], root)
    cyl("Y_ScopeLens", coll, 0.013, 0.004, (0, 0.157, 0.135), M["RailGlow"], root, rot=(90, 0, 0), verts=10)
    for y in (0.03, 0.13):
        box("Y_ScopeMount", coll, (0.014, 0.016, 0.03), (0, y, 0.11), M["GunMetal"], root)
    box("Y_Grip", coll, (0.032, 0.045, 0.1), (0, -0.03, -0.02), M["Rubber"], root, rot=(-20, 0, 0))
    box("Y_Guard", coll, (0.008, 0.07, 0.008), (0, 0.01, -0.025), M["GunMetal"], root)
    box("Y_Trigger", coll, (0.006, 0.01, 0.026), (0, 0.01, -0.005), M["GunMetal"], root, rot=(15, 0, 0))
    box("Y_Stock", coll, (0.045, 0.24, 0.08), (0, -0.22, 0.03), M["GunMetal"], root, taper=0.85)
    box("Y_Butt", coll, (0.05, 0.02, 0.1), (0, -0.345, 0.025), M["Rubber"], root)
    empty("Sight", coll, (0, 0, 0.135), root)
    empty("Muzzle", coll, (0, 0.87, 0.07), root)
    make_hand("YR_", coll, root, (0, -0.03, -0.02), (-20, 0, 0), 1, (0.1, -0.166, -0.49), SUIT)
    make_hand("YL_", coll, root, (0, 0.42, 0.02), (-90, 0, -90), -1, (-0.45, -0.2, -0.43), SUIT)
    return coll


def build_mine():
    coll = get_coll("Mine", clear=True)
    M = bpy.data.materials
    root = empty("Grenade", coll)
    cyl("Mine_Body", coll, 0.065, 0.03, (0, 0, 0.015), M["GunMetal"], root, verts=12)
    cyl("Mine_Cap", coll, 0.042, 0.014, (0, 0, 0.036), M["WHazard"], root, verts=12)
    sphere("Led", coll, 0.009, (0, 0, 0.045), M["MineLed"], root)
    for a in range(4):
        b = box("Mine_Claw%d" % a, coll, (0.03, 0.012, 0.012), (0, 0, 0.004), M["GunPlate"], root)
        b.rotation_euler = (0, 0, math.radians(a * 90 + 45))
        b.location = (math.cos(math.radians(a * 90 + 45)) * 0.07, math.sin(math.radians(a * 90 + 45)) * 0.07, 0.004)
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
    built = [(build_baton(), "baton.glb", "Baton"), (build_laser(), "laser.glb", "Laser"), (build_plasma(), "plasma.glb", "Plasma"),
             (build_flamer(), "flamer.glb", "Flamer"), (build_railgun(), "railgun.glb", "Railgun"), (build_mine(), "mine.glb", "Grenade")]
    for i, (c, _, r) in enumerate(built):
        bpy.data.objects[r].location.x = i * 0.6
    if export:
        for c, f, r in built:
            bpy.data.objects[r].location.x = 0
            export_weapon(c, f)
    return built
