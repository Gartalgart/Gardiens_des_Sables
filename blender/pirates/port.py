# U1 phase 2: the pirate port ("L'Île des pirates maudits"), built in blender/pirates/port.blend.
# Usage inside Blender, after helpers.py:
#   exec(open(r"<path>/blender/pirates/port.py").read())
# (with the Blender MCP in safe mode, exec/open are refused: send helpers.py and this file as one script)
#
# Layout, in game coordinates (three.js: X east, Y up, Z towards the sea):
# - cliffs all round the cove, a canyon path coming in from inland (north, Z < 0) and the
#   treasure cave dug into the north-west corner;
# - a ruined village on the beach: four houses you can walk into (one roofless, one with a
#   collapsed roof) and a solid tavern with a roof terrace reached by outside stairs;
# - a plank quay along the shore with two piers running out over the water;
# - a beached galleon in the shallows to the east: main deck reached by stairs from the beach,
#   a raised sterncastle above it (the hull is solid: the nav grid has a single floor per spot,
#   so a walkable hold under the deck could never be reached by enemies);
# - shallow water (Z 18..30) that slows bodies down, then deep water behind an invisible barrier.
#
# Naming, on top of the desert's (Ground and L_Deco* have no collision, SPAWN_n, BRAZIER_n,
# PLAYER_START empties):
# - C_* : collision only, never drawn (the solid volume under the quay planks, the barrier
#   along the deep water, the tall rails around the pier ends);
# - Z_Water_n : a shallow water zone, exported to level.json as a rectangle, neither drawn nor solid;
# - KEG_n : an empty where a powder keg stands (blown up by a shot, back at each wave).
# Collision meshes are axis-aligned boxes: the export keeps their bounding boxes only.
import bpy
import math
import random

random.seed(11)
LEVEL = get_coll("Level", clear=True)
PROPS = get_coll("Props", clear=True)

M = {
    "wood": mat("P_Wood", (0.2, 0.12, 0.07), 0.9),
    "plank": mat("P_Plank", (0.32, 0.22, 0.13), 0.9),
    "hull": mat("P_Hull", (0.17, 0.08, 0.05), 0.85),
    "rock": mat("P_Rock", (0.13, 0.15, 0.14), 1.0),
    "moss": mat("P_Moss", (0.09, 0.16, 0.08), 1.0),
    "plaster": mat("P_Plaster", (0.36, 0.33, 0.27), 0.95),
    "thatch": mat("P_Thatch", (0.28, 0.21, 0.1), 1.0),
    "rope": mat("P_Rope", (0.42, 0.33, 0.18), 1.0),
    "iron": mat("P_Iron", (0.06, 0.06, 0.07), 0.5, 0.8),
    "gold": mat("P_Gold", (0.85, 0.62, 0.15), 0.3, 1.0, emit=(0.6, 0.4, 0.05), strength=0.6),
    "canvas": mat("P_Canvas", (0.2, 0.18, 0.14), 1.0),  # dark: the lanterns light the sails up close
    "glass": mat("P_LanternGlass", (1.0, 0.7, 0.3), 0.4, emit=(1.0, 0.6, 0.2), strength=3.0),
    "fire": mat("Fire", (1.0, 0.45, 0.1), 0.5, emit=(1.0, 0.45, 0.08), strength=6.0),
    "keg": mat("P_Keg", (0.25, 0.13, 0.07), 0.9),
    "bone": mat("P_Bone", (0.72, 0.68, 0.58), 0.8),
    "glassg": mat("P_BottleGlass", (0.1, 0.25, 0.15), 0.2),
    "leaf": mat("P_Leaf", (0.08, 0.2, 0.08), 0.9),
    "sand": mat("P_Sand", (0.5, 0.45, 0.35), 1.0),
}
_n = [0]


def nm(base):
    _n[0] += 1
    return "%s_%d" % (base, _n[0])


def B(name, x0, x1, y0, y1, z0, z1, m, coll=None, rot=(0, 0, 0)):
    """Box from game-space bounds (X, Y up, Z towards the sea) -> Blender (x, -z, y)."""
    return box(nm(name), coll or LEVEL, (x1 - x0, z1 - z0, y1 - y0),
               ((x0 + x1) / 2, -(z0 + z1) / 2, (y0 + y1) / 2), m, rot=rot)


def C(x0, x1, y0, y1, z0, z1):
    """Collision only: drawn by nobody."""
    ob = B("C_Block", x0, x1, y0, y1, z0, z1, None)
    ob.display_type = "WIRE"
    return ob


def P(x, y, z):
    return (x, -z, y)


def post(x, z, y0, y1, r=0.13, m="wood", deco=True):
    cyl(nm("L_DecoPost" if deco else "Post"), LEVEL, r, y1 - y0, P(x, (y0 + y1) / 2, z), M[m], verts=6)


def lantern(i, x, y, z, hang=True):
    """Ship lantern: iron cage, glowing glass, a flame; its empty is the light (BRAZIER_i)."""
    B("L_DecoLanternCap", x - 0.16, x + 0.16, y + 0.22, y + 0.3, z - 0.16, z + 0.16, M["iron"])
    B("L_DecoLanternBase", x - 0.16, x + 0.16, y - 0.3, y - 0.24, z - 0.16, z + 0.16, M["iron"])
    B("L_DecoLanternGlass", x - 0.12, x + 0.12, y - 0.24, y + 0.22, z - 0.12, z + 0.12, M["glass"])
    cyl("L_DecoFire_lantern%d" % i, LEVEL, 0.07, 0.2, P(x, y - 0.05, z), M["fire"], verts=6, radius_top=0.01)
    if hang:
        B("L_DecoLanternHook", x - 0.02, x + 0.02, y + 0.3, y + 0.6, z - 0.02, z + 0.02, M["iron"])
    empty("BRAZIER_%d" % i, LEVEL, P(x, y, z))


def rock(x0, x1, y1, z0, z1, boulders=True):
    """Cliff mass: a solid box, its faces broken up by tilted decorative boulders."""
    B("Cliff", x0, x1, 0, y1, z0, z1, M["rock"])
    # boulders have no collision: they may stick out of the cliff by 0.4 m at most, so nobody
    # walks through one (a thin wall gets small ones)
    count = int((abs(x1 - x0) + abs(z1 - z0)) / 3) if boulders else 0
    for _ in range(count):
        s = min(random.uniform(1.2, 2.6), (min(x1 - x0, z1 - z0) / 2 + 0.4) / 1.3)
        x = random.uniform(min(x0 + s * 1.3 - 0.4, (x0 + x1) / 2), max(x1 - s * 1.3 + 0.4, (x0 + x1) / 2))
        z = random.uniform(min(z0 + s * 1.3 - 0.4, (z0 + z1) / 2), max(z1 - s * 1.3 + 0.4, (z0 + z1) / 2))
        y = random.uniform(0.3, y1 - 0.5)
        B("L_DecoRock", x - s, x + s, y - s * 0.6, y + s * 0.6, z - s, z + s, M["rock" if random.random() < 0.8 else "moss"],
          rot=(random.uniform(-25, 25), random.uniform(-25, 25), random.uniform(0, 90)))


# ---------------------------------------------------------------- ground
g = box("Ground", LEVEL, (160, 160, 0.02), (0, 0, -0.01), M["sand"])

# ---------------------------------------------------------------- cliffs, canyon, cave
H = 9
rock(-48, -42, H, -48, 31)  # west
rock(42, 48, H, -48, 31)  # east
rock(-48, 8, H, -48, -42)  # north, west of the canyon
rock(12, 48, H, -48, -42)  # north, east of the canyon
rock(6, 8, H, -56, -48)  # canyon walls
rock(12, 14, H, -56, -48)
rock(6, 14, H, -58, -56)  # canyon end (enemies come out of it)
# treasure cave in the north-west corner: a chamber reached by a short corridor
rock(-42, -26, 6, -42, -40, False)  # back
rock(-42, -40, 6, -40, -28, False)  # west
rock(-30, -26, 6, -40, -28, False)  # east
rock(-40, -33, 6, -32, -28, False)  # front, left of the entrance
B("CaveRoof", -40, -30, 4, 6, -40, -32, M["rock"])
B("CaveRoof", -33, -30, 3, 6, -32, -28, M["rock"])
# treasure: a chest, gold heaps, candles and bones
B("Chest", -36.6, -35.4, 0, 0.7, -39.6, -38.8, M["wood"])
B("L_DecoChestBand", -36.65, -35.35, 0.55, 0.62, -39.65, -38.75, M["iron"])
for x, z, s in ((-38.2, -38.5, 0.9), (-34.2, -38.8, 0.7), (-36.2, -36.8, 0.5), (-31.8, -35.2, 0.6)):
    cyl(nm("L_DecoGold"), LEVEL, s, s * 0.6, P(x, s * 0.3, z), M["gold"], verts=7, radius_top=0.05)
for x, z in ((-39.2, -34), (-31, -39)):
    sphere(nm("L_DecoSkull"), LEVEL, 0.14, P(x, 0.14, z), M["bone"], scale=(1, 1.1, 0.9))
lantern(1, -38.5, 1.6, -33.5, hang=False)
post(-38.5, -33.5, 0, 1.3, 0.05, "iron")
lantern(2, -31.5, 1.6, -38.8, hang=False)
post(-31.5, -38.8, 0, 1.3, 0.05, "iron")
empty("SPAWN_1", LEVEL, P(-35.5, 0, -35.5))
empty("KEG_1", LEVEL, P(-39, 0, -36.5))


# ---------------------------------------------------------------- village
T = 0.3  # wall thickness


# (the MCP's safe mode only calls functions by name, so one wall function takes the axis)
def wall(mm, h, ax, at, a, b, ya=0, yb=None):
    """a wall along X (ax 'x', at = its Z) or along Z (ax 'z', at = its X), from a to b"""
    yb = h if yb is None else yb
    if b - a <= 0.01 or yb - ya <= 0.01:
        return
    if ax == "x":
        B("Wall", a, b, ya, yb, at - T / 2, at + T / 2, mm)
    else:
        B("Wall", at - T / 2, at + T / 2, ya, yb, a, b, mm)


def house(cx, cz, w, d, h, door, roof="full", m="plaster"):
    """Walls around (cx, cz), a door (side 'n', 's', 'e', 'w' = -Z, +Z, +X, -X), a window in the
    wall opposite the door, and a roof slab: full, half (collapsed on one side) or none."""
    x0, x1, z0, z1 = cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2
    dw, dh = 1.6, 2.4
    mm = M[m]

    sides = {"n": ("x", z0 + T / 2, x0, x1), "s": ("x", z1 - T / 2, x0, x1),
             "w": ("z", x0 + T / 2, z0 + T, z1 - T), "e": ("z", x1 - T / 2, z0 + T, z1 - T)}
    opposite = {"n": "s", "s": "n", "e": "w", "w": "e"}[door]
    for side, (ax, at, a0, a1) in sides.items():
        mid = (a0 + a1) / 2
        if side == door:
            wall(mm, h, ax, at, a0, mid - dw / 2)
            wall(mm, h, ax, at, mid + dw / 2, a1)
            wall(mm, h, ax, at, mid - dw / 2, mid + dw / 2, dh, h)
        elif side == opposite:
            wall(mm, h, ax, at, a0, mid - 0.6)
            wall(mm, h, ax, at, mid + 0.6, a1)
            wall(mm, h, ax, at, mid - 0.6, mid + 0.6, 0, 1.1)
            wall(mm, h, ax, at, mid - 0.6, mid + 0.6, 2.0, h)
        else:
            wall(mm, h, ax, at, a0, a1)
    if roof == "full":
        B("Roof", x0 - 0.2, x1 + 0.2, h, h + 0.3, z0 - 0.2, z1 + 0.2, M["thatch"])
    elif roof == "half":
        B("Roof", x0 - 0.2, cx, h, h + 0.3, z0 - 0.2, z1 + 0.2, M["thatch"])
        # the other half hangs down inside, a slope of thatch and beams (decor)
        B("L_DecoFallenRoof", cx - 0.2, x1 - 0.6, h * 0.45, h * 0.45 + 0.25, z0 + 0.4, z1 - 0.4, M["thatch"], rot=(0, 32, 0))
        B("L_DecoBeam", cx - 0.2, x1 - 0.4, h * 0.6, h * 0.6 + 0.2, cz - 0.1, cz + 0.1, M["wood"], rot=(0, 25, 0))
    # a few planks of furniture inside
    B("Table", cx - 0.7, cx + 0.7, 0, 0.75, cz - 0.4, cz + 0.4, M["wood"])
    B("Crate", x0 + T + 0.1, x0 + T + 1.0, 0, 0.9, z0 + T + 0.1, z0 + T + 1.0, M["plank"])
    return (x0, x1, z0, z1)


house(-18, -14, 8, 6, 3.4, "e", "half")
house(-4, -25, 7, 6, 3.2, "s", "full")
house(28, -8, 7, 6, 3.0, "w", "none")
house(-30, -2, 6, 6, 3.2, "e", "full")
lantern(3, -13.4, 2.6, -13, hang=True)
lantern(4, -4, 2.5, -21.4, hang=True)
lantern(5, 24.2, 2.4, -8, hang=True)
lantern(6, -26.4, 2.5, -2, hang=True)

# tavern with a roof terrace: outside stairs along its west wall, a parapet round the roof.
# Solid, like the desert's terrace house: the nav grid has one floor per spot, so a room under
# the terrace would hide the terrace from the enemies' pathfinding.
tx0, tx1, tz0, tz1 = 9, 19, -26, -18
B("Tavern", tx0, tx1, 0, 3.6, tz0, tz1, M["plaster"])
B("Roof", tx0 - 0.2, tx1 + 0.2, 3.6, 3.9, tz0 - 0.2, tz1 + 0.2, M["thatch"])
B("L_DecoTavernDoor", 13.2, 14.8, 0, 2.4, tz1, tz1 + 0.05, M["wood"])
for wx in (11, 17):
    B("L_DecoTavernWindow", wx - 0.6, wx + 0.6, 1.2, 2.1, tz1, tz1 + 0.05, M["wood"])
roof_top = 3.9
n = 9
rise = roof_top / n
for i in range(n):
    hh = rise * (i + 1)
    z = tz1 - 0.2 - 0.75 * (i + 1)
    B("Step", tx0 - 2.6, tx0 - 0.2, 0, hh, z, z + 0.75, M["wood"])  # clear of the roof's overhang, wide enough for two
    # balustrade on the open side: stairs are entered from their foot only (bodies hugging their
    # side would otherwise be led up a slope they cannot climb, as on the desert temple's stairs)
    B("Balustrade", tx0 - 2.8, tx0 - 2.6, 0, hh + 1.0, z, z + 0.75, M["wood"])
pt, ph = 0.25, 0.8
B("Parapet", tx0, tx1, roof_top, roof_top + ph, tz0, tz0 + pt, M["plaster"])
B("Parapet", tx0, tx1, roof_top, roof_top + ph, tz1 - pt, tz1, M["plaster"])
B("Parapet", tx1 - pt, tx1, roof_top, roof_top + ph, tz0 + pt, tz1 - pt, M["plaster"])
B("Parapet", tx0, tx0 + pt, roof_top, roof_top + ph, tz0 + 2.6, tz1 - pt, M["plaster"])  # open where the stairs arrive
lantern(7, 14, 2.7, -17.6, hang=True)
lantern(8, tx1 - 0.6, roof_top + 1.4, tz0 + 0.6, hang=False)
post(tx1 - 0.6, tz0 + 0.6, roof_top, roof_top + 1.1, 0.05, "iron")
B("L_DecoSign", 16.2, 17.8, 2.6, 3.3, tz1 + 0.15, tz1 + 0.22, M["wood"])

# market stalls and clutter between the houses
for x, z in ((2, -10), (-10, -2), (8, 2)):
    B("Stall", x - 1.2, x + 1.2, 0, 0.9, z - 0.6, z + 0.6, M["plank"])
    post(x - 1.1, z - 0.5, 0.9, 2.4, 0.06)
    post(x + 1.1, z - 0.5, 0.9, 2.4, 0.06)
    B("L_DecoAwning", x - 1.4, x + 1.4, 2.4, 2.45, z - 1.0, z + 0.8, M["canvas"], rot=(12, 0, 0))
for x, z, s in ((-8, -12, 1.2), (-6.8, -12, 1.2), (-7.4, -12, 1.2), (20, -4, 1.4), (-22, 6, 1.2), (4, -32, 1.3)):
    B("Crate", x - s / 2, x + s / 2, 0, s, z - s / 2, z + s / 2, M["plank"])
B("Crate", -7.4 - 0.6, -7.4 + 0.6, 1.2, 2.4, -12.6, -11.4, M["plank"])
for x, z in ((-12, -6), (6, -10.5), (20, 6), (-26, -20), (30, -16), (-34, 8)):
    empty(nm("KEG"), LEVEL, P(x, 0, z))
# a well in the square
cyl("Well", LEVEL, 1.0, 0.9, P(-6, 0.45, -16), M["rock"], verts=10)
post(-6.8, -16, 0.9, 2.6, 0.07)
post(-5.2, -16, 0.9, 2.6, 0.07)
B("L_DecoWellBeam", -7, -5, 2.5, 2.65, -16.08, -15.92, M["wood"])

# a rowing boat upside down on the beach, a broken mast lying in the sand
B("Boat", -14, -9, 0, 0.8, 6.5, 8.3, M["hull"])
B("BrokenMast", 0, 9, 0, 0.6, 9.2, 9.8, M["wood"])

# ---------------------------------------------------------------- quay and piers (deck at 1.0 m)
QY = 1.0
C(-34, 14, 0, QY, 12, 18)  # the quay is solid under its planks
B("L_DecoQuayDeck", -34, 14, QY - 0.2, QY, 12, 18, M["plank"])
for x in range(-33, 14, 3):
    for z in (12.3, 17.7):
        post(x, z, -0.2, QY - 0.2, 0.15)
for x0, x1 in ((-26, -20), (-2, 4)):  # steps up from the sand
    B("QuayStep", x0, x1, 0, 0.5, 11.2, 12, M["plank"])
for (px0, px1) in ((-24, -21), (4, 7)):
    C(px0, px1, 0, QY, 18, 38)
    B("L_DecoPierDeck", px0, px1, QY - 0.2, QY, 18, 38, M["plank"])
    for z in range(19, 38, 3):
        post(px0 + 0.2, z, -0.6, QY - 0.2, 0.13)
        post(px1 - 0.2, z, -0.6, QY - 0.2, 0.13)
    # rails out over the deep water (tall invisible blocks, low wooden rails)
    for xa, xb in ((px0, px0 + 0.15), (px1 - 0.15, px1)):
        C(xa, xb, QY, QY + 2.2, 30, 38)
        B("L_DecoRail", xa, xb, QY + 0.9, QY + 1.0, 30, 38, M["wood"])
    C(px0, px1, QY, QY + 2.2, 37.85, 38)
    B("L_DecoRail", px0, px1, QY + 0.9, QY + 1.0, 37.85, 38, M["wood"])
    for z in (30, 34, 38):
        post(px0 + 0.07, z, QY, QY + 1.0, 0.06)
        post(px1 - 0.07, z, QY, QY + 1.0, 0.06)
    # bollards and coiled rope on the pier end
    cyl(nm("Bollard"), LEVEL, 0.2, 0.5, P(px0 + 0.5, QY + 0.25, 36.5), M["iron"], verts=8)
    cyl(nm("L_DecoRopeCoil"), LEVEL, 0.35, 0.12, P(px1 - 0.6, QY + 0.06, 35), M["rope"], verts=10)
lantern(9, -22.5, 2.6, 37.4, hang=False)
post(-22.5, 37.4, QY, 2.3, 0.05, "iron")
lantern(10, 5.5, 2.6, 37.4, hang=False)
post(5.5, 37.4, QY, 2.3, 0.05, "iron")
for i, x in enumerate((-28, -12, 0)):
    post(x, 12.4, QY, 3.2, 0.1)
    B("L_DecoArm", x - 0.05, x + 0.05, 3.1, 3.2, 12.4, 13.2, M["wood"])
    lantern(11 + i, x, 2.6, 13.1)
empty("KEG_99", LEVEL, P(-6, QY, 14.5))
# barrels and nets on the quay
for x, z in ((-31, 13), (-30.2, 13.2), (8, 16.8)):
    cyl(nm("Barrel"), LEVEL, 0.38, 1.0, P(x, QY + 0.5, z), M["wood"], verts=10)
B("L_DecoNet", -18, -15, QY + 0.01, QY + 0.04, 14, 16, M["rope"])

# ---------------------------------------------------------------- the beached galleon
GX0, GX1, GZ0, GZ1 = 16, 38, 16, 24  # hull footprint
DECK = 4.0  # top of the main deck
hz = 0.4  # hull plank thickness
B("Hull", GX0, GX1, 0, DECK - 0.4, GZ0, GZ1, M["hull"])  # solid, see the header
# pointed bow (decor) and the keel buried in the sand
B("L_DecoBow", GX0 - 3.2, GX0 + 0.2, 0.4, DECK - 0.4, GZ0 + 1.2, GZ1 - 1.2, M["hull"], rot=(0, 0, 0))
B("L_DecoBowTip", GX0 - 5, GX0 - 3, 1.5, DECK + 0.2, 19.5, 20.5, M["hull"])
B("L_DecoBowsprit", GX0 - 9, GX0 - 3, DECK + 0.6, DECK + 0.9, 19.85, 20.15, M["wood"], rot=(0, 0, -12))
# main deck and its bulwark (gap on the landward side where the stairs arrive)
B("Deck", GX0, GX1, DECK - 0.4, DECK, GZ0, GZ1, M["plank"])
BW = 1.0
B("Bulwark", GX0, 28, DECK, DECK + BW, GZ0, GZ0 + 0.25, M["hull"])
B("Bulwark", GX0, GX1, DECK, DECK + BW, GZ1 - 0.25, GZ1, M["hull"])
B("Bulwark", GX0, GX0 + 0.25, DECK, DECK + BW, GZ0 + 0.25, GZ1 - 0.25, M["hull"])
# stairs from the beach up along the landward hull side, rising west to the deck (gap X 28..32)
n = 9
for i in range(n):
    hh = DECK * (i + 1) / n
    x = 37.2 - 0.8 * (i + 1)
    B("ShipStep", x, x + 0.8, 0, hh, GZ0 - 2.0, GZ0, M["plank"])
    B("Balustrade", x, x + 0.8, 0, hh + 1.0, GZ0 - 2.2, GZ0 - 2.0, M["wood"])
B("ShipStepTop", 28.4, 30.0, 0, DECK, GZ0 - 2.0, GZ0, M["plank"])
# the raised sterncastle (east end), solid too; a cabin door painted on its front (decor)
SX = 32  # sterncastle starts here
TOP = DECK + 2.6
B("SternBlock", SX, GX1, DECK, TOP - 0.4, GZ0, GZ1, M["hull"])
B("L_DecoCabinDoor", SX - 0.05, SX, DECK, DECK + 2.0, GZ0 + 1.6, GZ0 + 3.2, M["wood"])
B("SternDeck", SX, GX1, TOP - 0.4, TOP, GZ0, GZ1, M["plank"])
B("SternRail", SX, GX1, TOP, TOP + 0.9, GZ0, GZ0 + 0.2, M["hull"])
B("SternRail", SX, GX1, TOP, TOP + 0.9, GZ1 - 0.2, GZ1, M["hull"])
B("SternRail", GX1 - 0.2, GX1, TOP, TOP + 0.9, GZ0 + 0.2, GZ1 - 0.2, M["hull"])
B("SternRail", SX, SX + 0.2, TOP, TOP + 0.9, GZ0 + 0.2, GZ1 - 2.2, M["hull"])
# stairs from the main deck up to the sterncastle, along the seaward bulwark
n = 6
for i in range(n):
    hh = DECK + (TOP - DECK) * (i + 1) / n
    x = SX - 0.8 * (n - i)
    B("SternStep", x, x + 0.8, DECK, hh, GZ1 - 2.0, GZ1 - 0.25, M["plank"])
    B("Balustrade", x, x + 0.8, DECK, hh + 1.0, GZ1 - 2.2, GZ1 - 2.0, M["hull"])
# the wheel, masts and rigging
cyl("Wheel", LEVEL, 0.5, 0.12, P(36, TOP + 1.0, 20), M["wood"], rot=(0, 90, 0), verts=8)
post(36, 20, TOP, TOP + 0.9, 0.08, deco=False)
for mx, mh in ((20.5, 14), (27, 16)):
    cyl(nm("Mast"), LEVEL, 0.3, mh, P(mx, DECK + mh / 2, 20), M["wood"], verts=8)
    B("L_DecoYard", mx - 0.15, mx + 0.15, DECK + mh * 0.7, DECK + mh * 0.7 + 0.25, 15, 25, M["wood"])
    B("L_DecoSail", mx - 0.05, mx + 0.05, DECK + mh * 0.35, DECK + mh * 0.68, 16.5, 22.5, M["canvas"], rot=(4, 0, 6))
cyl("L_DecoMastStump", LEVEL, 0.3, 3, P(35, TOP + 1.5, 20), M["wood"], verts=8)
# cannons along the deck and crates in the hold
for x, z0, z1 in ((19, GZ1 - 1.6, GZ1 - 0.3), (23, GZ1 - 1.6, GZ1 - 0.3), (22, GZ0 + 0.3, GZ0 + 1.6)):
    B("Cannon", x - 0.4, x + 0.4, DECK, DECK + 0.6, z0, z1, M["iron"])
for x, z in ((18.5, 18), (19.7, 18)):
    B("Crate", x - 0.6, x + 0.6, DECK, DECK + 1.2, z - 0.6, z + 0.6, M["plank"])
lantern(14, 24, DECK + 2.0, 20)
B("L_DecoLanternRope", 23.98, 24.02, DECK + 2.6, DECK + 6, 19.98, 20.02, M["rope"])
lantern(15, 30, 5.6, 23.4, hang=False)
post(30, 23.4, DECK, DECK + 1.3, 0.05, "iron")
lantern(16, 37, TOP + 1.4, 17)
post(37, 17, TOP, TOP + 1.1, 0.05, "iron")
empty("SPAWN_2", LEVEL, P(24, DECK, 20))  # the cursed crew on deck
empty("KEG_98", LEVEL, P(34, TOP, 22))
empty("KEG_97", LEVEL, P(29, DECK, 17))

# ---------------------------------------------------------------- the sea
# shallow water slows bodies down; behind Z 30, deep water nobody can walk into
zone = B("Z_Water", -42, 42, 0, 0.5, 18, 31, None)
zone.display_type = "WIRE"
for xa, xb in ((-42, -24), (-21, 4), (7, 42)):
    C(xa, xb, 0, 3, 30, 31)
# rocks sticking out of the shallows, posts of an old jetty
for x, z, s in ((-36, 24, 1.4), (-10, 27, 1.0), (12, 25, 0.9), (40, 27, 1.6)):
    B("SeaRock", x - s, x + s, 0, s * 1.2, z - s, z + s, M["rock"])
for z in (20, 23, 26, 29):
    post(-14, z, -0.5, 1.6, 0.14, deco=False)

# ---------------------------------------------------------------- canyon, spawns, start
lantern(17, 10, 2.6, -41)
post(10, -41, 0, 3.0, 0.08)
empty("SPAWN_3", LEVEL, P(10, 0, -52))
empty("SPAWN_4", LEVEL, P(-39.5, 0, 20.5))  # out of the sea, west (clear of the sea rock)
empty("SPAWN_5", LEVEL, P(36, 0, -36))
empty("SPAWN_6", LEVEL, P(-38, 0, -10))
empty("PLAYER_START", LEVEL, P(-6, 0, 4))
# number the kegs 1..n (no lambda: the MCP's safe mode refuses them)
keg_names = sorted([o.name for o in LEVEL.all_objects if o.type == "EMPTY" and o.name.startswith("KEG")])
kegs = [bpy.data.objects[k] for k in keg_names]
for i, o in enumerate(kegs):
    o.name = "KEG_tmp%d" % i
for i, o in enumerate(kegs):
    o.name = "KEG_%d" % (i + 1)
print("level objects:", len(LEVEL.all_objects))


# ---------------------------------------------------------------- props (scattered by the client)
# Each prop is an empty at the origin with its parts as children; src/view/propsView.js
# instances them over the open sand (see PROPS in src/worlds/pirates.js).
def prop(name):
    return empty(name, PROPS, (0, 0, 0))


r = prop("Prop_Rope")  # a coil of rope
for i in range(3):
    cyl(nm("RopeTurn"), PROPS, 0.32 - i * 0.07, 0.07, (0, 0, 0.035 + i * 0.06), M["rope"], parent=r, verts=10, radius_top=0.3 - i * 0.07)
b = prop("Prop_Bottle")  # rum bottles, one lying down
cyl(nm("Bottle"), PROPS, 0.06, 0.24, (0, 0, 0.12), M["glassg"], parent=b, verts=6)
cyl(nm("BottleNeck"), PROPS, 0.025, 0.1, (0, 0, 0.29), M["glassg"], parent=b, verts=6)
cyl(nm("Bottle"), PROPS, 0.06, 0.24, (0.22, 0.1, 0.06), M["glassg"], parent=b, verts=6, rot=(90, 0, 30))
p = prop("Prop_Planks")  # broken planks washed up
for i, (x, y, a) in enumerate(((0, 0, 10), (0.3, 0.25, -25), (-0.2, 0.35, 60))):
    box(nm("Plank"), PROPS, (1.4 - i * 0.3, 0.22, 0.05), (x, y, 0.025 + i * 0.05), M["plank"], parent=p, rot=(0, 0, a))
s = prop("Prop_Skull")  # a sailor's skull and bones
sphere(nm("Skull"), PROPS, 0.12, (0, 0, 0.1), M["bone"], parent=s, scale=(1, 1.15, 0.9))
for a in (20, 75):
    cyl(nm("Bone"), PROPS, 0.025, 0.42, (0.25, 0.05, 0.03), M["bone"], parent=s, verts=5, rot=(90, 0, a))
c = prop("Prop_Crab")  # an empty crab shell
sphere(nm("Shell"), PROPS, 0.18, (0, 0, 0.06), mat("P_CrabShell", (0.45, 0.12, 0.06), 0.7), parent=c, scale=(1.3, 1, 0.45))
pa = prop("Prop_Palm")  # a leaning palm tree (along the cliffs)
for i in range(6):
    cyl(nm("Trunk"), PROPS, 0.22 - i * 0.02, 1.3, (0.25 * i, 0, 0.65 + 1.25 * i), M["wood"], parent=pa, verts=7, rot=(0, 11, 0))
for k in range(7):
    a = k / 7 * math.tau
    box(nm("Frond"), PROPS, (2.2, 0.5, 0.05), (1.5 + math.cos(a) * 1.0, math.sin(a) * 1.0, 7.6), M["leaf"], parent=pa,
        rot=(0, 25, math.degrees(a)))
# more ground clutter, added with the map's dressing (decor.py)
random.seed(31)
grass = mat("P_Grass", (0.1, 0.17, 0.06), 1.0)
g = prop("Prop_Grass")  # a tuft of beach grass
for k in range(7):
    a = k / 7 * 360 + random.uniform(-20, 20)
    h = random.uniform(0.3, 0.6)
    box(nm("Blade"), PROPS, (0.08, 0.02, h), (math.cos(math.radians(a)) * 0.08, math.sin(math.radians(a)) * 0.08, h / 2), grass,
        parent=g, rot=(random.uniform(-25, 25), random.uniform(-25, 25), a), taper=0.1)
s = prop("Prop_Shells")  # shells and a starfish
for k in range(3):
    sphere(nm("Shell"), PROPS, 0.05, (random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3), 0.015), mat("P_Shell", (0.6, 0.47, 0.42), 0.6),
           parent=s, scale=(1.2, 1, 0.35))
for k in range(5):
    a = k / 5 * 360
    box(nm("Arm"), PROPS, (0.14, 0.04, 0.02), (0.25 + math.cos(math.radians(a)) * 0.07, 0.1 + math.sin(math.radians(a)) * 0.07, 0.01),
        mat("P_Starfish", (0.6, 0.2, 0.08), 0.9), parent=s, rot=(0, 0, a), taper=0.5)
d = prop("Prop_Driftwood")  # a bleached log and a branch
drift = mat("P_Driftwood", (0.3, 0.27, 0.22), 1.0)
cyl(nm("Log"), PROPS, 0.12, 1.6, (0, 0, 0.1), drift, parent=d, rot=(0, 88, 0), verts=7, radius_top=0.08)
cyl(nm("Branch"), PROPS, 0.04, 0.7, (0.3, 0.25, 0.08), drift, parent=d, rot=(0, 85, 50), verts=5, radius_top=0.02)
c = prop("Prop_Cannonballs")  # a pyramid of balls
for (x, y, z) in ((-0.12, -0.12, 0.12), (0.12, -0.12, 0.12), (-0.12, 0.12, 0.12), (0.12, 0.12, 0.12), (0, 0, 0.29)):
    sphere(nm("Ball"), PROPS, 0.12, (x, y, z), M["iron"], parent=c)
b = prop("Prop_BrokenBarrel")  # a stove-in barrel on its side, staves around
cyl(nm("Barrel"), PROPS, 0.33, 0.85, (0, 0, 0.33), M["wood"], parent=b, rot=(90, 0, 0), verts=10)
cyl(nm("Hoop"), PROPS, 0.345, 0.05, (0, 0.3, 0.33), M["iron"], parent=b, rot=(90, 0, 0), verts=10)
for k in range(3):
    box(nm("Stave"), PROPS, (0.6, 0.09, 0.03), (0.6 + k * 0.1, random.uniform(-0.4, 0.4), 0.015), M["wood"], parent=b,
        rot=(0, 0, random.uniform(0, 180)))
u = prop("Prop_Bush")  # a low bush along the cliffs
for k in range(5):
    sphere(nm("Leaves"), PROPS, random.uniform(0.35, 0.6), (random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4), 0.3), M["leaf"],
           parent=u, scale=(1, 1, random.uniform(0.6, 0.9)))
print("props:", [o.name for o in PROPS.objects if o.type == "EMPTY"])
