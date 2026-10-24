# U2 phase 1, second pass: the station in the style of "Alien" (1979): ribbed corridors with
# chamfered ceilings, walls covered in boxes, conduits and status lights, cables sagging from the
# ceiling, chains dripping in the engine room, torn-down ceiling panels spitting sparks, puddles,
# and the infestation: black biomechanical resin spreading from the west airlock, nests of eggs.
# Usage inside Blender, after helpers.py and station.py (it adds to the Level and Decor collections).
# With the Blender MCP in safe mode, send helpers.py, the definitions of station.py and this file
# as one script.
#
# Empties for the client (src/view/stationFx.js): FX_Beacon_n (rotating beacon), FX_Spark_n (a
# cable spitting sparks), FX_Drip_n (water dripping from the ceiling).
import bpy
import math
import random
from mathutils import Vector

random.seed(23)
_n[0] = 5000  # clear of the names of station.py
M["resin"] = mat("S_Resin", (0.018, 0.022, 0.026), 0.22, 0.35)
M["egg"] = mat("S_Egg", (0.075, 0.07, 0.045), 0.35, 0.1)
M["wet"] = mat("S_Wet", (0.01, 0.012, 0.014), 0.04, 0.2)
M["led_g"] = mat("S_LedGreen", (0.1, 1.0, 0.3), 0.4, emit=(0.1, 1.0, 0.3), strength=2.0)
M["led_r"] = mat("S_LedRed", (1.0, 0.1, 0.05), 0.4, emit=(1.0, 0.08, 0.03), strength=2.0)
M["hole"] = mat("S_Void", (0.0, 0.0, 0.0), 1.0)
# CRT screens: green phosphor (src/view/surfaces.js draws lines of text into them)
M["screen"] = mat("S_Screen", (0.05, 0.4, 0.15), 0.3, emit=(0.15, 0.95, 0.35), strength=0.8)
fx = {"Beacon": [0], "Spark": [0], "Drip": [0]}


def fx_at(kind, x, y, z):
    fx[kind][0] += 1
    empty("FX_%s_%d" % (kind, fx[kind][0]), DECOR, P(x, y, z))


def rod(p0, p1, r, m, verts=6):
    """a cylinder between two game-space points"""
    a, b = Vector(P(*p0)), Vector(P(*p1))
    d = b - a
    ob = cyl(nm("L_DecoRod"), DECOR, r, d.length, (a + b) / 2, m, verts=verts)
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = d.to_track_quat("Z", "Y")
    return ob


def sag(p0, p1, drop, r=0.03, m=None, n=8):
    """a cable hanging between two points, sagging by `drop` in the middle"""
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - drop * 4 * t * (1 - t), p0[2] + (p1[2] - p0[2]) * t))
    for i in range(n):
        rod(pts[i], pts[i + 1], r, m or M["cable"])


def chain(x, z, y0, y1):
    """a chain hanging from the ceiling: links turned a quarter in turn"""
    y, k = y1, 0
    while y > y0:
        if k % 2:
            D("ChainLink", x - 0.012, x + 0.012, y - 0.14, y, z - 0.045, z + 0.045, M["frame"])
        else:
            D("ChainLink", x - 0.045, x + 0.045, y - 0.14, y, z - 0.012, z + 0.012, M["frame"])
        y -= 0.11
        k += 1


def free(v, holes, margin=0.45):
    for a, b in holes:
        if a - margin < v < b + margin:
            return False
    return True


def on_wall(ax, face, sgn, v, y0, y1, depth, w, m, name="Greeble"):
    """a box against a wall (along X at z = face, or along Z at x = face), sticking out by depth toward sgn"""
    f0, f1 = min(face, face + sgn * depth), max(face, face + sgn * depth)
    if ax == "x":
        return D(name, v - w, v + w, y0, y1, f0, f1, m)
    return D(name, f0, f1, y0, y1, v - w, v + w, m)


# ---------------------------------------------------------------- the corridors
RF = RH  # ring ceiling
# walls of the ring seen from the corridor: axis, face, the way into the corridor, openings (and
# what stands against them: lockers, oxygen bottles, the lever), along-wall span
WALLS = [
    ("x", -RI - 0.2, -1, [(-2, 2)], (-RI, RI)),
    ("x", RI + 0.2, 1, [(-2, 2)], (-RI, RI)),
    ("z", -RI - 0.2, -1, [(-2, 2)], (-RI, RI)),
    ("z", RI + 0.2, 1, [(-2, 2)], (-RI, RI)),
    ("x", -RO + 0.2, 1, [(-17, -15), (-9, -5), (5, 9), (15, 17)], (-RO + 0.5, RO - 0.5)),
    ("x", RO - 0.2, -1, [(-18.2, -16.8), (-10, -6), (6, 10), (16.8, 18.2)], (-RO + 0.5, RO - 0.5)),
    ("z", -RO + 0.2, 1, [(-14, -11), (-12.2, -9.8), (-8, -5), (-1.5, 1.5), (3.3, 4.7), (5, 8), (10, 11), (11, 14)], (-RO + 0.5, RO - 0.5)),
    ("z", RO - 0.2, -1, [(-15, -12), (-11, -10), (-6, -2), (2, 6), (9.8, 12.2), (12, 15)], (-RO + 0.5, RO - 0.5)),
]
for ax, face, sgn, holes, (lo, hi) in WALLS:
    inner = abs(face) < 15
    # ribs every 4 m, in line with the ceiling's
    for v in range(-16, 17, 4):
        if lo <= v <= hi and free(v, holes, 0.3):
            on_wall(ax, face, sgn, v, 0, RF - (0.55 if inner else 0.25), 0.16, 0.16, M["frame"], "WallRib")
            on_wall(ax, face, sgn, v, 0, 0.35, 0.24, 0.2, M["hazard"], "RibFoot")
    # the bays between the ribs: junction boxes, conduits, status lights
    for v0 in range(-16, 16, 4):
        v = v0 + 2 + random.uniform(-0.6, 0.6)
        if not (lo + 0.6 <= v <= hi - 0.6) or not free(v, holes, 0.6):
            continue
        r = random.random()
        if r < 0.35:
            w, h, y = random.uniform(0.2, 0.35), random.uniform(0.25, 0.5), random.uniform(1.0, 2.2)
            on_wall(ax, face, sgn, v, y, y + h, 0.14, w, M["plate"], "JunctionBox")
            on_wall(ax, face, sgn, v + w * 0.5, y + h - 0.1, y + h - 0.06, 0.15, 0.025, M["led_g" if random.random() < 0.6 else "led_r"], "Led")
            # its conduit down to the floor
            on_wall(ax, face, sgn, v - w * 0.4, 0, y, 0.06, 0.03, M["pipe"], "Conduit")
        elif r < 0.6:
            for k in range(random.randint(2, 4)):
                on_wall(ax, face, sgn, v - 0.5 + k * 0.22, 0.1, RF - 0.6, 0.1, 0.05, M["pipe" if k % 2 else "frame"], "Conduit")
        elif r < 0.8:
            # a wall panel with a small green screen and buttons
            on_wall(ax, face, sgn, v, 1.1, 1.9, 0.08, 0.45, M["frame"], "WallPanel")
            on_wall(ax, face, sgn, v - 0.1, 1.35, 1.75, 0.09, 0.22, M["screen"], "WallScreen")
            for k in range(3):
                on_wall(ax, face, sgn, v + 0.3, 1.3 + k * 0.15, 1.38 + k * 0.15, 0.1, 0.04, M["led_r" if k == 0 else "led_g"], "Button")
        else:
            on_wall(ax, face, sgn, v, 0.4, 1.0, 0.25, 0.4, M["crate"], "Canister")
    # the chamfer between the inner walls and the ceiling
    if inner:
        if ax == "x":
            B("L_DecoChamfer", lo, hi, RF - 0.45, RF + 0.45, face - 0.45, face + 0.45, M["panel"], DECOR, rot=(45, 0, 0))
        else:
            B("L_DecoChamfer", face - 0.45, face + 0.45, RF - 0.45, RF + 0.45, lo, hi, M["panel"], DECOR, rot=(0, 45, 0))

# cables sagging across and along the corridors
for p0, p1, drop in (((-17.5, RF - 0.3, -15), (-15, RF - 0.3, -15.5), 0.9), ((-6, RF - 0.3, -18), (-2, RF - 0.3, -15), 0.7),
                     ((14.5, RF - 0.3, -4), (18.5, RF - 0.3, -3), 1.1), ((10, RF - 0.3, 15), (13, RF - 0.3, 18.5), 0.8),
                     ((-18.5, RF - 0.3, 9), (-15, RF - 0.3, 12), 1.0), ((2, RF - 0.3, 18.5), (7, RF - 0.3, 17), 0.6)):
    sag(p0, p1, drop)
    sag((p0[0] + 0.15, p0[1], p0[2] + 0.1), (p1[0] + 0.1, p1[1], p1[2] - 0.1), drop * 0.8, 0.02)

# ceiling panels torn down: a black hole in the ceiling, the panel hanging from one edge, cables
# dangling out of it, one of them spitting sparks
for x, z, along in ((-16.5, -4, "z"), (16.5, -6, "z"), (4, 16.5, "x"), (-10, -16.5, "x")):
    D("CeilingHole", x - 0.7, x + 0.7, RF - 0.02, RF - 0.005, z - 0.7, z + 0.7, M["hole"])
    if along == "z":
        B("L_DecoFallenPanel", x - 0.05 + 0.45, x + 0.05 + 0.45, RF - 1.25, RF - 0.05, z - 0.65, z + 0.65, M["panel"], DECOR, rot=(0, -25, 0))
    else:
        B("L_DecoFallenPanel", x - 0.65, x + 0.65, RF - 1.25, RF - 0.05, z - 0.05 + 0.45, z + 0.05 + 0.45, M["panel"], DECOR, rot=(25, 0, 0))
    for k in range(3):
        dx, dz = random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4)
        low = RF - random.uniform(0.8, 1.6)
        rod((x + dx, RF, z + dz), (x + dx * 1.3, low, z + dz * 1.3), 0.02, M["cable" if k else "pipe"])
        if k == 0:
            fx_at("Spark", x + dx * 1.3, low, z + dz * 1.3)

# beacons under the ceilings
for x, y, z in ((-C0, RF - 0.15, -8), (C0, RF - 0.15, 8), (8, RF - 0.15, -C0), (-8, RF - 0.15, C0),
                (0, 10 - 0.15, 39), (-8.6, 8 - 0.15, 8.6), (-22, 3.5 - 0.15, 1.6)):
    fx_at("Beacon", x, y, z)

# ---------------------------------------------------------------- the engine room: chains and water
for x, z, y0 in ((-3.6, -5.2, 2.6), (-4.4, -5.6, 3.6), (4.8, -3.4, 1.8), (3.2, 4.6, 2.9), (-5.2, 3.6, 3.3), (5.4, 5.0, 4.2)):
    chain(x, z, y0, EH)
    D("ChainHook", x - 0.06, x + 0.06, y0 - 0.12, y0, z - 0.06, z + 0.06, M["frame"])
for x, z in ((-3.6, -5.2), (4.8, -3.4), (3.2, 4.6)):
    fx_at("Drip", x, EH - 0.1, z)
    cyl(nm("L_DecoPuddle"), DECOR, random.uniform(0.6, 1.0), 0.01, P(x, 0.006, z), M["wet"], verts=12)
fx_at("Spark", -9.1, 1.6, -3.2)  # the console by the west door
sag((-9.8, 6.5, -6), (-9.8, 6.2, 6), 2.2, 0.04)
sag((9.8, 7.2, -4), (5, 7.6, -9.8), 1.5, 0.04)

# ---------------------------------------------------------------- the infestation
def ribs_up(ax, face, sgn, v, h, width=0.5):
    """a column of black resin climbing a wall: a ribbed spine with a tube on either side"""
    y = 0
    while y < h:
        s = width * (0.8 + 0.3 * math.sin(y * 3.1 + v))
        if ax == "x":
            sphere(nm("L_DecoResin"), DECOR, 1.0, P(v + random.uniform(-0.05, 0.05), y, face + sgn * 0.08), M["resin"], scale=(s, 0.12, 0.07))
        else:
            sphere(nm("L_DecoResin"), DECOR, 1.0, P(face + sgn * 0.08, y, v + random.uniform(-0.05, 0.05)), M["resin"], scale=(0.12, s, 0.07))
        y += 0.17
    for k in (-1, 1):
        if ax == "x":
            rod((v + k * width * 0.7, 0, face + sgn * 0.1), (v + k * width * 0.55, h, face + sgn * 0.06), 0.05, M["resin"])
        else:
            rod((face + sgn * 0.1, 0, v + k * width * 0.7), (face + sgn * 0.06, h, v + k * width * 0.55), 0.05, M["resin"])


def blob(x, y, z, s):
    sphere(nm("L_DecoResinBlob"), DECOR, s, P(x, y, z), M["resin"], scale=(1, random.uniform(0.6, 1.2), random.uniform(0.4, 0.8)))


def nest(x0, x1, z0, z1, eggs):
    """a mound of resin (solid) and leathery eggs on it, the top of each split in four"""
    B("Nest", x0, x1, 0, 0.25, z0, z1, M["resin"])
    for k in range(eggs):
        x, z = random.uniform(x0 + 0.3, x1 - 0.3), random.uniform(z0 + 0.3, z1 - 0.3)
        h = random.uniform(0.75, 0.95)
        sphere(nm("L_DecoEgg"), DECOR, 1.0, P(x, 0.25 + h * 0.5, z), M["egg"], scale=(0.32, 0.32, h * 0.5), subdiv=2)
        for a in (0, 90):
            B("L_DecoEggSlit", x - 0.17, x + 0.17, 0.25 + h - 0.05, 0.25 + h + 0.01, z - 0.012, z + 0.012, M["resin"], DECOR, rot=(0, 0, a + 45))
        blob(x, 0.25, z, 0.35)


# the west airlock: where it came in; the chamber is covered, the corridor round it too
AXm = (AX0 + AX1) / 2
for v in (-24, -23, -22, -21, -20):
    ribs_up("x", -AZ + 0.2, 1, v + 0.3, AH - 0.1, 0.35)
    ribs_up("x", AZ - 0.2, -1, v, AH - 0.1, 0.35)
for z in (-6.5, -9.5, 6.5, 9.5, 15.5):
    ribs_up("z", -RO + 0.2, 1, z, RH - 0.3)
# blobs along the foot and the top of the corridor's walls, and the chamber's
for k in range(26):
    y = random.choice((0.0, RH - 0.1))
    if k % 3 == 0:
        blob(random.uniform(AX0 + 0.4, AX1 - 0.4), y, random.choice((-AZ + 0.3, AZ - 0.3)), random.uniform(0.2, 0.4))
    else:
        blob(random.choice((-RO + 0.3, -RI - 0.3)), y, random.uniform(-10, 10), random.uniform(0.25, 0.5))
sag((-24, AH - 0.1, -2), (-20, AH - 0.1, 2), 0.8, 0.07, M["resin"])
sag((-18.6, RH - 0.1, -9), (-15, RH - 0.1, -4), 1.2, 0.06, M["resin"])
sag((-18.6, RH - 0.1, 5), (-14.6, RH - 0.1, 9), 0.9, 0.06, M["resin"])
# the greenhouse: the back wall overgrown, a nest along the west wall
for x in (-10.5, -7, -2.5, 2, 6.5, 10.5):
    ribs_up("x", GZ0 + 0.2, 1, x, GH - 0.2, 0.55)
for k in range(14):
    blob(random.uniform(-12.5, 12.5), 0, random.uniform(-33.7, -32.5), random.uniform(0.3, 0.7))
nest(-12.75, -11.6, -30.6, -27.4, 5)
fx_at("Drip", -3, GH - 0.35, -32.5)
fx_at("Drip", 7, GH - 0.35, -21)
cyl(nm("L_DecoPuddle"), DECOR, 0.8, 0.01, P(7, 0.006, -21), M["wet"], verts=12)
# the engine room's north-west corner and the hangar's
for v in (-9.2, -7.6, -6):
    ribs_up("x", -10 + 0.2, 1, v, EH - 0.3, 0.45)
ribs_up("z", -10 + 0.2, 1, -8.2, EH - 0.3, 0.45)
ribs_up("z", -10 + 0.2, 1, -6.4, EH - 0.3, 0.45)
nest(-15.75, -13.7, 19.5, 22.2, 6)
for z in (20, 21.6):
    ribs_up("z", -HX + 0.2, 1, z, HH - 0.5, 0.5)
for x in (-15, -13.5):
    ribs_up("x", HZ0 + 0.2, 1, x, HH - 0.5, 0.5)
# more steam
for x, y, z in ((-9.5, 6.4, 0), (C0, 3.35, -RO + 0.4), (-12, 3.5, RO - 0.4)):
    empty(nm("FX_Steam_x"), DECOR, P(x, y, z))
print("decor objects:", len(DECOR.all_objects), "fx:", {k: v[0] for k, v in fx.items()})
