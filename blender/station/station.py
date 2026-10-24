# U2 phase 1: the derelict space station ("Station spatiale infestée"), built in blender/station/station.blend.
# Usage inside Blender, after helpers.py:
#   exec(open(r"<path>/blender/station/station.py").read())
# (with the Blender MCP in safe mode, exec/open are refused: send helpers.py and this file as one script)
#
# Layout, in game coordinates (three.js: X east, Y up, Z south), everything indoors under ceilings:
# - the engine room in the middle (20 x 20 m, 8 m high) round the reactor column, joined by four
#   short spokes to a ring of corridors (5 m wide, 4 m high, portholes on the outside walls);
# - off the ring: the hydroponic greenhouse (north, glass roof), the hangar (south, a shuttle and the
#   bay door on the void), the observation deck (east, a glass wall on the planet) and a small
#   airlock chamber (west);
# - the two airlocks are D_Airlock_n doors worked by the LEVER_n levers: open, they pull bodies
#   towards the void (src/sim/sim.js).
# The nav grid has a single floor per (x, z) cell: no walkway over a room, every floor is at 0.
#
# Naming, on top of the desert's and the port's (L_Deco* no collision, C_* collision only, SPAWN_n,
# BRAZIER_n, KEG_n, PLAYER_START):
# - D_Airlock_n : an airlock's outer door, solid while closed, slid up by the client when open;
# - LEVER_n : the lever that works airlock n;
# - BRAZIER_n : a ceiling light; its tube in the Decor collection is L_DecoNeon_n (flickers with it);
# - KEG_n : an oxygen bottle (blows up when shot, like the port's powder kegs);
# - FX_Steam_n (Decor) : an empty where steam leaks from a pipe.
# Floors and every bit of dressing are in the Decor collection (decor.glb, no collision); the floor
# of the collisions is the ground plane at 0.
import bpy
import math
import random

random.seed(5)
LEVEL = get_coll("Level", clear=True)
DECOR = get_coll("Decor", clear=True)

M = {
    "plate": mat("S_Plate", (0.15, 0.16, 0.18), 0.55, 0.6),
    "panel": mat("S_Panel", (0.34, 0.35, 0.37), 0.6, 0.3),
    "frame": mat("S_Frame", (0.06, 0.065, 0.075), 0.45, 0.7),
    "grating": mat("S_Grating", (0.13, 0.13, 0.14), 0.5, 0.7),
    "deck": mat("S_Deck", (0.2, 0.21, 0.22), 0.6, 0.5),
    "hazard": mat("S_Hazard", (0.8, 0.55, 0.04), 0.6),
    "white": mat("S_White", (0.62, 0.64, 0.67), 0.4, 0.2),
    "crate": mat("S_Crate", (0.2, 0.23, 0.16), 0.7, 0.2),
    "pipe": mat("S_Pipe", (0.32, 0.2, 0.12), 0.4, 0.8),
    "cable": mat("S_Cable", (0.03, 0.03, 0.035), 0.7),
    "soil": mat("S_Soil", (0.08, 0.055, 0.04), 1.0),
    "leaf": mat("S_Leaf", (0.05, 0.2, 0.05), 0.8),
    "couch": mat("S_Couch", (0.3, 0.09, 0.06), 0.9),
    "glass": mat("S_Glass", (0.45, 0.6, 0.7), 0.05),
    "solar": mat("S_Solar", (0.03, 0.06, 0.16), 0.25, 0.6),
    "neon": mat("S_Neon", (0.85, 0.92, 1.0), 0.5, emit=(0.8, 0.9, 1.0), strength=3.0),
    "alarm": mat("S_Alarm", (1.0, 0.05, 0.03), 0.5, emit=(1.0, 0.04, 0.02), strength=2.0),
    "screen": mat("S_Screen", (0.05, 0.4, 0.15), 0.3, emit=(0.15, 0.95, 0.35), strength=0.8),  # green CRT phosphor
    "core": mat("S_Core", (0.2, 0.8, 1.0), 0.3, emit=(0.2, 0.75, 1.0), strength=1.2),
    "grow": mat("S_Grow", (1.0, 0.3, 0.8), 0.5, emit=(1.0, 0.25, 0.75), strength=1.5),
    "green": mat("S_GreenLight", (0.2, 1.0, 0.3), 0.5, emit=(0.2, 1.0, 0.3), strength=4.0),
}
_n = [0]


def nm(base):
    _n[0] += 1
    return "%s_%d" % (base, _n[0])


def B(name, x0, x1, y0, y1, z0, z1, m, coll=None, rot=(0, 0, 0)):
    """Box from game-space bounds (X, Y up, Z south) -> Blender (x, -z, y)."""
    return box(nm(name), coll or LEVEL, (x1 - x0, z1 - z0, y1 - y0),
               ((x0 + x1) / 2, -(z0 + z1) / 2, (y0 + y1) / 2), m, rot=rot)


def D(name, x0, x1, y0, y1, z0, z1, m, rot=(0, 0, 0)):
    """Dressing: no collision, exported to decor.glb."""
    return B("L_Deco" + name, x0, x1, y0, y1, z0, z1, m, DECOR, rot)


def C(x0, x1, y0, y1, z0, z1):
    """Collision only: drawn by nobody."""
    ob = B("C_Block", x0, x1, y0, y1, z0, z1, None)
    ob.display_type = "WIRE"
    return ob


def P(x, y, z):
    return (x, -z, y)


# ---------------------------------------------------------------- walls
T = 0.4  # wall thickness


def seg(ax, at, a, b, y0, y1, m):
    """a wall piece along X (ax 'x': at = its Z) or along Z (at = its X), from a to b"""
    if b - a <= 0.01 or y1 - y0 <= 0.01:
        return
    if ax == "x":
        B("Wall", a, b, y0, y1, at - T / 2, at + T / 2, m)
    else:
        B("Wall", at - T / 2, at + T / 2, y0, y1, a, b, m)


def glass(ax, at, c0, c1, h0, h1):
    """a window in a wall: an invisible pane stops bodies and shots, a tinted pane and a frame are drawn"""
    f, e = 0.12, T / 2 + 0.06
    if ax == "x":
        C(c0, c1, h0, h1, at - T / 2, at + T / 2)
        D("Glass", c0, c1, h0, h1, at - 0.02, at + 0.02, M["glass"])
        D("WinFrame", c0 - f, c1 + f, h0 - f, h0, at - e, at + e, M["frame"])
        D("WinFrame", c0 - f, c1 + f, h1, h1 + f, at - e, at + e, M["frame"])
        D("WinFrame", c0 - f, c0, h0, h1, at - e, at + e, M["frame"])
        D("WinFrame", c1, c1 + f, h0, h1, at - e, at + e, M["frame"])
    else:
        C(at - T / 2, at + T / 2, h0, h1, c0, c1)
        D("Glass", at - 0.02, at + 0.02, h0, h1, c0, c1, M["glass"])
        D("WinFrame", at - e, at + e, h0 - f, h0, c0 - f, c1 + f, M["frame"])
        D("WinFrame", at - e, at + e, h1, h1 + f, c0 - f, c1 + f, M["frame"])
        D("WinFrame", at - e, at + e, h0, h1, c0 - f, c0, M["frame"])
        D("WinFrame", at - e, at + e, h0, h1, c1, c1 + f, M["frame"])


def doorframe(ax, at, c0, c1, h):
    """a heavy frame with hazard stripes round an opening"""
    f, e = 0.25, T / 2 + 0.1
    if ax == "x":
        D("DoorFrame", c0 - f, c0, 0, h, at - e, at + e, M["hazard"])
        D("DoorFrame", c1, c1 + f, 0, h, at - e, at + e, M["hazard"])
        D("DoorFrame", c0 - f, c1 + f, h, h + f, at - e, at + e, M["frame"])
    else:
        D("DoorFrame", at - e, at + e, 0, h, c0 - f, c0, M["hazard"])
        D("DoorFrame", at - e, at + e, 0, h, c1, c1 + f, M["hazard"])
        D("DoorFrame", at - e, at + e, h, h + f, c0 - f, c1 + f, M["frame"])


def wall(ax, at, a, b, y0, y1, m, holes=None):
    """a wall from a to b with holes (c0, c1, h0, h1, kind): 'door' is left open, 'win' gets glass"""
    cur = a
    for h in sorted(holes or []):
        c0, c1, h0, h1, kind = h
        seg(ax, at, cur, c0, y0, y1, m)
        seg(ax, at, c0, c1, y0, h0, m)
        seg(ax, at, c0, c1, h1, y1, m)
        if kind == "win":
            glass(ax, at, c0, c1, h0, h1)
        if kind == "door":
            doorframe(ax, at, c0, c1, h1)
        cur = c1
    seg(ax, at, cur, b, y0, y1, m)


def floor(x0, x1, z0, z1, m):
    D("Floor", x0, x1, -0.1, 0, z0, z1, m)


def ceiling(x0, x1, y, z0, z1, m=None):
    B("Ceiling", x0, x1, y, y + 0.3, z0, z1, m or M["panel"])


def light(i, x, y, z, along="x"):
    """a ceiling neon at (x, y, z): the housing, the tube (flickers with its light) and the light's empty"""
    if along == "x":
        D("NeonHousing", x - 0.8, x + 0.8, y, y + 0.22, z - 0.16, z + 0.16, M["frame"])
        tube = B("L_DecoNeon", x - 0.7, x + 0.7, y - 0.07, y, z - 0.06, z + 0.06, M["neon"], DECOR)
    else:
        D("NeonHousing", x - 0.16, x + 0.16, y, y + 0.22, z - 0.8, z + 0.8, M["frame"])
        tube = B("L_DecoNeon", x - 0.06, x + 0.06, y - 0.07, y, z - 0.7, z + 0.7, M["neon"], DECOR)
    tube.name = "L_DecoNeon_%d" % i
    empty("BRAZIER_%d" % i, LEVEL, P(x, y - 0.15, z))


def pipe(x0, x1, y, z0, z1, r=0.12, m="pipe"):
    """a straight pipe between two points of the same height, along X or along Z"""
    if abs(x1 - x0) > abs(z1 - z0):
        cyl(nm("L_DecoPipe"), DECOR, r, abs(x1 - x0), P((x0 + x1) / 2, y, z0), M[m], rot=(0, 90, 0), verts=8)
    else:
        cyl(nm("L_DecoPipe"), DECOR, r, abs(z1 - z0), P(x0, y, (z0 + z1) / 2), M[m], rot=(90, 0, 0), verts=8)


def vpipe(x, z, y0, y1, r=0.15, m="pipe"):
    cyl(nm("L_DecoPipe"), DECOR, r, y1 - y0, P(x, (y0 + y1) / 2, z), M[m], verts=8)


def crate(x, z, s=1.4, y=0):
    B("Crate", x - s / 2, x + s / 2, y, y + s, z - s / 2, z + s / 2, M["crate"])
    D("CrateBand", x - s / 2 - 0.02, x + s / 2 + 0.02, y + s * 0.42, y + s * 0.58, z - s / 2 - 0.02, z + s / 2 + 0.02, M["frame"])


def console(x0, x1, z0, z1, facing):
    """a desk with a screen tilted toward 'facing' ('n', 's', 'e', 'w')"""
    B("Console", x0, x1, 0, 1.0, z0, z1, M["plate"])
    if facing in ("n", "s"):
        zz = z0 + 0.1 if facing == "n" else z1 - 0.1
        D("Screen", x0 + 0.15, x1 - 0.15, 1.0, 1.02, min(zz, (z0 + z1) / 2), max(zz, (z0 + z1) / 2), M["screen"])
        D("Monitor", x0 + 0.2, x1 - 0.2, 1.0, 1.8, (z0 + z1) / 2 - 0.05, (z0 + z1) / 2 + 0.05, M["frame"])
        D("MonitorScreen", x0 + 0.3, x1 - 0.3, 1.1, 1.7, (z0 + z1) / 2 + (-0.07 if facing == "n" else 0.05), (z0 + z1) / 2 + (-0.05 if facing == "n" else 0.07), M["screen"])
    else:
        xx = x0 + 0.1 if facing == "w" else x1 - 0.1
        D("Screen", min(xx, (x0 + x1) / 2), max(xx, (x0 + x1) / 2), 1.0, 1.02, z0 + 0.15, z1 - 0.15, M["screen"])
        D("Monitor", (x0 + x1) / 2 - 0.05, (x0 + x1) / 2 + 0.05, 1.0, 1.8, z0 + 0.2, z1 - 0.2, M["frame"])
        D("MonitorScreen", (x0 + x1) / 2 + (-0.07 if facing == "w" else 0.05), (x0 + x1) / 2 + (-0.05 if facing == "w" else 0.07), 1.1, 1.7, z0 + 0.3, z1 - 0.3, M["screen"])


# ---------------------------------------------------------------- the engine room (middle)
EH = 8
for ax, at in (("x", -10), ("x", 10), ("z", -10), ("z", 10)):
    wall(ax, at, -10.2, 10.2, 0, EH + 0.3, M["plate"], [(-2, 2, 0, 3, "door")])
ceiling(-10.2, 10.2, EH, -10.2, 10.2)
floor(-10, 10, -10, 10, M["deck"])
# the reactor: a column from floor to ceiling, glowing rings round it
cyl("Reactor", LEVEL, 2.4, EH, P(0, EH / 2, 0), M["plate"], verts=16)
for y in (1.2, 2.8, 4.4, 6.0):
    cyl(nm("L_DecoCoreRing"), DECOR, 2.55, 0.22, P(0, y, 0), M["core"], verts=16)
    cyl(nm("L_DecoCoreBand"), DECOR, 2.5, 0.5, P(0, y + 0.45, 0), M["frame"], verts=16)
for a in range(8):
    an = a / 8 * math.tau
    vpipe(math.cos(an) * 2.55, math.sin(an) * 2.55, 0, EH, 0.12, "frame")
# four generators in the corners, their pipes up into the ceiling
for sx in (-1, 1):
    for sz in (-1, 1):
        x, z = 6 * sx, 6 * sz
        B("Generator", x - 1.5, x + 1.5, 0, 2.6, z - 1.5, z + 1.5, M["plate"])
        D("GenTop", x - 1.2, x + 1.2, 2.6, 2.9, z - 1.2, z + 1.2, M["frame"])
        D("GenLight", x - 1.52, x + 1.52, 1.7, 1.85, z - 1.52, z + 1.52, M["core"])
        D("GenStripe", x - 1.53, x + 1.53, 0, 0.3, z - 1.53, z + 1.53, M["hazard"])
        vpipe(x - 0.6 * sx, z, 2.9, EH, 0.28)
        vpipe(x, z - 0.6 * sz, 2.9, EH, 0.2, "frame")
        # a duct from the generator to the reactor, under the ceiling
        pipe(x - 0.6 * sx, 0, 6.8, z, z, 0.22)
lightI = [0]


def L(x, y, z, along="x"):
    lightI[0] += 1
    light(lightI[0], x, y, z, along)


for sx in (-1, 1):
    for sz in (-1, 1):
        L(6 * sx, EH - 0.25, 6 * sz)
# consoles along the walls, between the doors and the generators
console(-9.6, -8.6, -3.8, -2.6, "e")
console(8.6, 9.6, 2.6, 3.8, "w")
console(2.6, 3.8, -9.6, -8.6, "s")
console(-3.8, -2.6, 8.6, 9.6, "n")
# cable bundles from the reactor to the walls, on the floor
D("FloorCable", 2.4, 9.8, 0, 0.12, -0.4, -0.2, M["cable"])
D("FloorCable", -9.8, -2.4, 0, 0.12, 0.2, 0.4, M["cable"])
empty("KEG_1", LEVEL, P(8.7, 0, 8.7))
empty("KEG_2", LEVEL, P(-8.7, 0, -8.7))
empty("SPAWN_1", LEVEL, P(-6, 0, 0))

# ---------------------------------------------------------------- spokes (engine room <-> ring)
# north and south spokes run along Z, east and west along X
wall("z", -2, -14, -10, 0, 4.3, M["panel"])
wall("z", 2, -14, -10, 0, 4.3, M["panel"])
wall("z", -2, 10, 14, 0, 4.3, M["panel"])
wall("z", 2, 10, 14, 0, 4.3, M["panel"])
wall("x", -2, -14, -10, 0, 4.3, M["panel"])
wall("x", 2, -14, -10, 0, 4.3, M["panel"])
wall("x", -2, 10, 14, 0, 4.3, M["panel"])
wall("x", 2, 10, 14, 0, 4.3, M["panel"])
ceiling(-2.2, 2.2, 4, -14, -10)
ceiling(-2.2, 2.2, 4, 10, 14)
ceiling(-14, -10, 4, -2.2, 2.2)
ceiling(10, 14, 4, -2.2, 2.2)
floor(-2, 2, -14, -10, M["grating"])
floor(-2, 2, 10, 14, M["grating"])
floor(-14, -10, -2, 2, M["grating"])
floor(10, 14, -2, 2, M["grating"])

# ---------------------------------------------------------------- the ring of corridors
RI, RO, RH = 14, 19, 4
for ax, at in (("x", -RI), ("x", RI), ("z", -RI), ("z", RI)):
    wall(ax, at, -RI - 0.2, RI + 0.2, 0, RH + 0.3, M["panel"], [(-2, 2, 0, 3, "door")])
W1, W2 = 1.2, 2.6  # porthole sill and top
wall("x", -RO, -RO - 0.2, RO + 0.2, 0, RH + 0.3, M["panel"],
     [(-17, -15, W1, W2, "win"), (-9, -5, 0, 3.2, "door"), (5, 9, 0, 3.2, "door"), (15, 17, W1, W2, "win")])
wall("x", RO, -RO - 0.2, RO + 0.2, 0, RH + 0.3, M["panel"],
     [(-18.2, -16.8, W1, W2, "win"), (-10, -6, 0, 3.4, "door"), (6, 10, 0, 3.4, "door"), (16.8, 18.2, W1, W2, "win")])
wall("z", -RO, -RO, RO, 0, RH + 0.3, M["panel"],
     [(-14, -11, W1, W2, "win"), (-8, -5, W1, W2, "win"), (-1.5, 1.5, 0, 3, "door"), (5, 8, W1, W2, "win"), (11, 14, W1, W2, "win")])
wall("z", RO, -RO, RO, 0, RH + 0.3, M["panel"],
     [(-15, -12, W1, W2, "win"), (-6, -2, 0, 3.2, "door"), (2, 6, 0, 3.2, "door"), (12, 15, W1, W2, "win")])
ceiling(-RO - 0.2, RO + 0.2, RH, -RO - 0.2, -RI)
ceiling(-RO - 0.2, RO + 0.2, RH, RI, RO + 0.2)
ceiling(-RO - 0.2, -RI, RH, -RI, RI)
ceiling(RI, RO + 0.2, RH, -RI, RI)
floor(-RO, RO, -RO, -RI, M["grating"])
floor(-RO, RO, RI, RO, M["grating"])
floor(-RO, -RI, -RI, RI, M["grating"])
floor(RI, RO, -RI, RI, M["grating"])
# ribs across the ceiling every 4 m, a cable tray down the middle, two pipes along the outer wall
for v in range(-16, 17, 4):
    D("Rib", v - 0.15, v + 0.15, RH - 0.3, RH, -RO, -RI, M["frame"])
    D("Rib", v - 0.15, v + 0.15, RH - 0.3, RH, RI, RO, M["frame"])
    if abs(v) < RI:
        D("Rib", -RO, -RI, RH - 0.3, RH, v - 0.15, v + 0.15, M["frame"])
        D("Rib", RI, RO, RH - 0.3, RH, v - 0.15, v + 0.15, M["frame"])
C0 = (RI + RO) / 2
D("CableTray", -RO, RO, RH - 0.45, RH - 0.35, -C0 - 0.3, -C0 + 0.3, M["cable"])
D("CableTray", -RO, RO, RH - 0.45, RH - 0.35, C0 - 0.3, C0 + 0.3, M["cable"])
D("CableTray", -C0 - 0.3, -C0 + 0.3, RH - 0.45, RH - 0.35, -RI, RI, M["cable"])
D("CableTray", C0 - 0.3, C0 + 0.3, RH - 0.45, RH - 0.35, -RI, RI, M["cable"])
for y, r in ((3.35, 0.12), (3.65, 0.09)):
    pipe(-RO + 0.4, RO - 0.4, y, -RO + 0.35, -RO + 0.35, r)
    pipe(-RO + 0.4, RO - 0.4, y, RO - 0.35, RO - 0.35, r)
    pipe(-RO + 0.35, -RO + 0.35, y, -RO + 0.4, RO - 0.4, r)
    pipe(RO - 0.35, RO - 0.35, y, -RO + 0.4, RO - 0.4, r)
# red emergency strips on the ring side of the inner walls
for v in (-11, -6, 6, 11):
    e = RI + 0.2
    D("Alarm", v - 0.5, v + 0.5, 2.9, 3.05, -e - 0.06, -e, M["alarm"])
    D("Alarm", v - 0.5, v + 0.5, 2.9, 3.05, e, e + 0.06, M["alarm"])
    D("Alarm", -e - 0.06, -e, 2.9, 3.05, v - 0.5, v + 0.5, M["alarm"])
    D("Alarm", e, e + 0.06, 2.9, 3.05, v - 0.5, v + 0.5, M["alarm"])
for x, z in ((-C0, -C0), (C0, -C0), (-C0, C0), (C0, C0)):
    L(x, RH - 0.5, z)
for x, z, al in ((0, -C0, "x"), (0, C0, "x"), (-C0, 0, "z"), (C0, 0, "z")):
    L(x, RH - 0.5, z, al)
# wall lockers and cabinets in the corners (solid), O2 bottles
for x, z in ((-17.9, -11), (17.9, 11)):
    B("Locker", x - 0.5, x + 0.5, 0, 2.2, z - 1.2, z + 1.2, M["plate"])
    D("LockerLine", x - 0.52, x + 0.52, 1.1, 1.14, z - 1.2, z + 1.2, M["frame"])
empty("KEG_3", LEVEL, P(18.2, 0, -10.5))
empty("KEG_4", LEVEL, P(-18.2, 0, 10.5))
empty("SPAWN_2", LEVEL, P(-16.5, 0, 16.5))
empty("SPAWN_3", LEVEL, P(16.5, 0, -16.5))
for i, (x, y, z) in enumerate(((-RO + 0.4, 3.35, -8), (RO - 0.4, 3.35, 9), (5, 3.35, -RO + 0.4))):
    empty("FX_Steam_%d" % (i + 1), DECOR, P(x, y, z))

# ---------------------------------------------------------------- the hydroponic greenhouse (north)
GX, GZ0, GZ1, GH = 13, -34, -RO, 6
seg("x", -RO, -GX, GX, RH + 0.3, GH + 0.3, M["panel"])  # above the ring's wall
wall("z", -GX, GZ0, GZ1, 0, GH + 0.3, M["panel"], [(-31, -27, 1.0, 4.6, "win"), (-25, -21, 1.0, 4.6, "win")])
wall("z", GX, GZ0, GZ1, 0, GH + 0.3, M["panel"], [(-31, -27, 1.0, 4.6, "win"), (-25, -21, 1.0, 4.6, "win")])
wall("x", GZ0, -GX - 0.2, GX + 0.2, 0, GH + 0.3, M["panel"], [(-9, -4, 1.0, 4.6, "win"), (4, 9, 1.0, 4.6, "win")])
# a glass roof: invisible slab, tinted panes, a grid of beams
C(-GX, GX, GH, GH + 0.3, GZ0, GZ1)
D("Glass", -GX, GX, GH + 0.1, GH + 0.14, GZ0, GZ1, M["glass"])
for x in range(-GX, GX + 1, 13 // 2):
    D("RoofBeam", x - 0.15, x + 0.15, GH - 0.3, GH + 0.3, GZ0, GZ1, M["frame"])
for z in range(GZ0, GZ1 + 1, 3):
    D("RoofBeam", -GX, GX, GH - 0.2, GH + 0.3, z - 0.12, z + 0.12, M["frame"])
floor(-GX, GX, GZ0, GZ1, M["deck"])
# four beds of plants under pink grow lights
for x in (-9, -3, 3, 9):
    B("Bed", x - 1, x + 1, 0, 0.9, -31, -23, M["plate"])
    D("Soil", x - 0.9, x + 0.9, 0.9, 0.96, -30.9, -23.1, M["soil"])
    for z in range(-30, -23):
        for dx in (-0.45, 0.45):
            h = random.uniform(0.5, 1.1)
            cyl(nm("L_DecoStalk"), DECOR, 0.03, h, P(x + dx, 0.95 + h / 2, z + 0.5), M["leaf"], verts=4)
            sphere(nm("L_DecoLeaves"), DECOR, random.uniform(0.22, 0.38), P(x + dx, 0.95 + h, z + 0.5), M["leaf"],
                   scale=(1, 1, random.uniform(0.6, 1.0)))
    D("GrowLight", x - 0.6, x + 0.6, 2.7, 2.8, -30.5, -23.5, M["grow"])
    D("GrowHousing", x - 0.7, x + 0.7, 2.8, 2.95, -30.6, -23.4, M["frame"])
    for z in (-30, -24):
        D("Wire", x - 0.02, x + 0.02, 2.95, GH - 0.3, z - 0.02, z + 0.02, M["cable"])
    pipe(x, x, 0.6, -31, -23, 0.06, "frame")  # the irrigation line along the bed
for x in (-6, 6):
    L(x, GH - 0.45, -27, "z")
empty("KEG_5", LEVEL, P(-12.2, 0, -21.5))
empty("SPAWN_4", LEVEL, P(0, 0, -32.5))
# water tanks along the back wall
for x in (-11, 11):
    cyl(nm("WaterTank"), LEVEL, 0.7, 2.4, P(x, 1.2, -32.8), M["white"], verts=12)

# ---------------------------------------------------------------- the hangar (south) and its bay door
HX, HZ0, HZ1, HH = 16, RO, 42, 10
seg("x", RO, -HX, HX, RH + 0.3, HH + 0.3, M["plate"])
wall("z", -HX, HZ0, HZ1, 0, HH + 0.3, M["plate"], [(25, 29, 6.5, 8.5, "win"), (33, 37, 6.5, 8.5, "win")])
wall("z", HX, HZ0, HZ1, 0, HH + 0.3, M["plate"], [(25, 29, 6.5, 8.5, "win"), (33, 37, 6.5, 8.5, "win")])
BD = 6  # half width of the bay door, its height
wall("x", HZ1, -HX - 0.2, HX + 0.2, 0, HH + 0.3, M["plate"], [(-BD, BD, 0, BD, "door")])
B("Door", -BD, BD, 0, BD, HZ1 - 0.15, HZ1 + 0.15, M["hazard"]).name = "D_Airlock_1"
ceiling(-HX - 0.2, HX + 0.2, HH, HZ0, HZ1 + 0.2, M["plate"])
floor(-HX, HX, HZ0, HZ1, M["deck"])
for z in (39.6, 40.4, 41.2):
    D("FloorStripe", -BD, BD, 0, 0.012, z, z + 0.4, M["hazard"])
for x in (-BD - 0.6, BD + 0.6):
    sphere(nm("L_DecoBeacon"), DECOR, 0.22, P(x, BD + 0.6, HZ1 - 0.4), M["alarm"], scale=(1, 1, 0.7))
# the ceiling: girders and a crane rail
for z in range(22, 42, 5):
    D("Girder", -HX, HX, HH - 0.7, HH, z - 0.25, z + 0.25, M["frame"])
D("CraneRail", -HX, HX, HH - 1.2, HH - 0.7, 30.8, 31.2, M["hazard"])
D("CraneHook", -1.3, -0.7, 4.5, HH - 1.2, 30.9, 31.1, M["cable"])
D("CraneHookBlock", -1.6, -0.4, 4.0, 4.5, 30.7, 31.3, M["hazard"])
for x, z in ((-9, 25), (9, 25), (-9, 36), (9, 36)):
    L(x, HH - 3, z)  # hung low on rods, or the floor stays dark
    for dx in (-0.6, 0.6):
        D("Rod", x + dx - 0.02, x + dx + 0.02, HH - 2.78, HH - 0.7, z - 0.02, z + 0.02, M["cable"])
# the shuttle on its skids: a solid hull, wings low enough to stop bodies, a cockpit facing the bay door
SX0, SX1, SZ0, SZ1 = -13, -7, 23, 36
B("Shuttle", SX0, SX1, 0, 3.6, SZ0, SZ1, M["white"])
B("ShuttleWing", -15.4, -4.6, 1.6, 1.9, 28, 33, M["white"])
D("ShuttleNose", SX0 + 0.5, SX1 - 0.5, 0.4, 3.0, SZ1, SZ1 + 2.5, M["white"])
D("Cockpit", SX0 + 1.0, SX1 - 1.0, 2.0, 2.9, SZ1 + 1.6, SZ1 + 2.55, M["screen"])
D("ShuttleStripe", SX0 - 0.02, SX1 + 0.02, 2.2, 2.5, SZ0, SZ1, M["hazard"])
D("ShuttleRoof", SX0 + 0.6, SX1 - 0.6, 3.6, 4.1, SZ0 + 1, SZ1 - 1, M["plate"])
for x in (SX0 + 0.6, SX1 - 0.6):
    D("Engine", x - 0.7, x + 0.7, 0.8, 2.6, SZ0 - 1.2, SZ0, M["frame"])
    D("EngineGlow", x - 0.5, x + 0.5, 1.0, 2.4, SZ0 - 1.25, SZ0 - 1.2, M["core"])
D("Ramp", SX0 + 1.5, SX1 - 1.5, 0, 0.25, SZ0 - 2.8, SZ0, M["plate"], rot=(-6, 0, 0))
# cargo on the east side, a fuel cart, O2 bottles
for x, z, y, s in ((10, 30, 0, 1.5), (11.6, 30, 0, 1.5), (10.8, 30.3, 1.5, 1.4), (12.5, 36.5, 0, 1.6),
                   (8.5, 24.5, 0, 1.3), (-2, 39, 0, 1.2), (13.2, 22, 0, 1.4), (13.2, 23.5, 0, 1.4)):
    crate(x, z, s, y)
B("Cart", 3, 6, 0, 1.2, 33, 35, M["hazard"])
D("CartTank", 3.2, 5.8, 1.2, 2.0, 33.3, 34.7, M["white"])
empty("KEG_6", LEVEL, P(14.6, 0, 27))
empty("KEG_7", LEVEL, P(14.6, 0, 39))
empty("KEG_8", LEVEL, P(-14.6, 0, 40))
empty("SPAWN_5", LEVEL, P(0, 0, 29))
# the lever of the bay door, on the east wall, and its panel
empty("LEVER_1", LEVEL, P(HX - 0.35, 1.3, 24))
D("LeverPanel", HX - 0.26, HX - 0.2, 0.8, 1.9, 23.4, 24.6, M["frame"])
D("LeverSign", HX - 0.28, HX - 0.26, 2.0, 2.3, 23.4, 24.6, M["hazard"])
empty("FX_Steam_4", DECOR, P(HX - 0.4, 8, 32))

# ---------------------------------------------------------------- the observation deck (east)
OX0, OX1, OZ, OH = RO, 32, 9, 5
seg("z", RO, -OZ, OZ, RH + 0.3, OH + 0.3, M["panel"])
wall("x", -OZ, OX0, OX1 + 0.2, 0, OH + 0.3, M["panel"], [(24, 28, 1.2, 3.8, "win")])
wall("x", OZ, OX0, OX1 + 0.2, 0, OH + 0.3, M["panel"], [(24, 28, 1.2, 3.8, "win")])
wall("z", OX1, -OZ, OZ, 0, OH + 0.3, M["panel"], [(-8, -3, 0.8, 4.4, "win"), (-2.5, 2.5, 0.8, 4.4, "win"), (3, 8, 0.8, 4.4, "win")])
ceiling(OX0, OX1 + 0.2, OH, -OZ - 0.2, OZ + 0.2)
floor(OX0, OX1, -OZ, OZ, M["couch"])
for z0, z1 in ((-7, -3), (3, 7)):
    B("Couch", 28, 29.4, 0, 0.5, z0, z1, M["couch"])
    D("CouchBack", 28.9, 29.4, 0.5, 1.1, z0, z1, M["couch"])
B("Table", 24.2, 25.8, 0, 0.7, -1, 1, M["plate"])
D("TableTop", 24.1, 25.9, 0.7, 0.75, -1.1, 1.1, M["frame"])
D("TableScreen", 24.5, 25.5, 0.75, 0.76, -0.6, 0.6, M["screen"])
console(20, 22.5, -8.6, -7.6, "s")
console(20, 22.5, 7.6, 8.6, "n")
for z in (-5, 5):
    L(25.5, OH - 0.25, z)
empty("KEG_9", LEVEL, P(31.2, 0, -8.2))
empty("PLAYER_START", LEVEL, P(22.5, 0, 0))

# ---------------------------------------------------------------- the airlock chamber (west)
AX0, AX1, AZ, AH = -25, -RO, 2.5, 3.5
wall("x", -AZ, AX0 - 0.2, AX1, 0, AH + 0.3, M["plate"])
wall("x", AZ, AX0 - 0.2, AX1, 0, AH + 0.3, M["plate"])
wall("z", AX0, -AZ, AZ, 0, AH + 0.3, M["plate"], [(-1.5, 1.5, 0, 3, "door")])
B("Door", AX0 - 0.15, AX0 + 0.15, 0, 3, -1.5, 1.5, M["hazard"]).name = "D_Airlock_2"
ceiling(AX0 - 0.2, AX1, AH, -AZ - 0.2, AZ + 0.2, M["plate"])
floor(AX0, AX1, -AZ, AZ, M["grating"])
for x in (-23.5, -21.5):
    D("FloorStripe", x, x + 0.5, 0, 0.012, -AZ, AZ, M["hazard"])
for z in (-1.9, 1.9):
    sphere(nm("L_DecoBeacon"), DECOR, 0.18, P(AX0 + 0.35, 3.2, z), M["alarm"], scale=(1, 1, 0.7))
# suits hanging in lockers along the chamber walls (dressing only)
for x in (-23.8, -22.6, -21.4):
    D("SuitLocker", x - 0.5, x + 0.5, 0.3, 2.6, -AZ + 0.2, -AZ + 0.45, M["frame"])
    D("Suit", x - 0.3, x + 0.3, 0.6, 2.0, -AZ + 0.3, -AZ + 0.55, M["white"])
L(-22, AH - 0.2, 0, "z")
empty("SPAWN_6", LEVEL, P(-22.5, 0, 0))
empty("LEVER_2", LEVEL, P(-RO + 0.35, 1.3, 4))
D("LeverPanel", -RO + 0.2, -RO + 0.26, 0.8, 1.9, 3.4, 4.6, M["frame"])
D("LeverSign", -RO + 0.26, -RO + 0.28, 2.0, 2.3, 3.4, 4.6, M["hazard"])

# ---------------------------------------------------------------- outside: seen through the windows
# a solar array east of the observation deck, a mast and dish north of the greenhouse
D("Truss", 34, 70, 2.3, 2.7, -0.2, 0.2, M["frame"])
for x in range(38, 70, 8):
    for z0, z1 in ((-9, -0.6), (0.6, 9)):
        D("SolarPanel", x - 3.5, x + 3.5, 2.45, 2.55, z0, z1, M["solar"])
        D("SolarRib", x - 3.5, x + 3.5, 2.4, 2.6, (z0 + z1) / 2 - 0.05, (z0 + z1) / 2 + 0.05, M["frame"])
D("Mast", -0.3, 0.3, 0, 22, -48, -47.4, M["frame"])
sphere("L_DecoDish", DECOR, 3.0, P(0, 20, -47.7), M["white"], scale=(1, 0.35, 1))
sphere("L_DecoMastLight", DECOR, 0.3, P(0, 22.3, -47.7), M["alarm"])
print("level objects:", len(LEVEL.all_objects), "decor objects:", len(DECOR.all_objects), "lights:", lightI[0])
