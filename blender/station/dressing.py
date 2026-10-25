# U2: the station's dressing in the style of "Alien" (1979), laid over the walls that station.py
# generated (RUNS, REGIONS, LIGHTS): ribbed tunnels with chamfered ceilings, conduits, junction boxes
# and status lights, a band of the district's colour along every room, sagging cables, torn ceiling
# panels spitting sparks, chains dripping in the reactor room, the infestation (black resin, nests
# of eggs: the parasites' spawn gates) and the client's effects (FX_Beacon_n, FX_Spark_n, FX_Drip_n,
# FX_Steam_n empties; see src/view/stationFx.js).
# Usage inside Blender: right after station.py, in the same script.
import bpy
import math
import random
from mathutils import Vector

random.seed(23)
_n[0] = 50000  # clear of the names of station.py
M["resin"] = mat("S_Resin", (0.018, 0.022, 0.026), 0.22, 0.35)
M["egg"] = mat("S_Egg", (0.075, 0.07, 0.045), 0.35, 0.1)
M["wet"] = mat("S_Wet", (0.01, 0.012, 0.014), 0.04, 0.2)
M["led_g"] = mat("S_LedGreen", (0.1, 1.0, 0.3), 0.4, emit=(0.1, 1.0, 0.3), strength=2.0)
M["led_r"] = mat("S_LedRed", (1.0, 0.1, 0.05), 0.4, emit=(1.0, 0.08, 0.03), strength=2.0)
fx = {"Beacon": [0], "Spark": [0], "Drip": [0], "Steam": [0]}


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


def on_wall(ax, face, sgn, v, y0, y1, depth, w, m, name="Greeble"):
    """a box against a wall (along X at z = face, or along Z at x = face), out by `depth` toward sgn"""
    f0, f1 = min(face, face + sgn * depth), max(face, face + sgn * depth)
    if ax == "x":
        return D(name, v - w, v + w, y0, y1, f0, f1, m)
    return D(name, f0, f1, y0, y1, v - w, v + w, m)


def free(ax, at, v, margin):
    for c0, c1, h0, h1, k in HOLES.get((ax, at), []):
        if c0 - margin < v < c1 + margin:
            return False
    return True


# ---------------------------------------------------------------- the walls
for ax, at, a, b, y0, y1, kind, side, zone in RUNS:
    if kind != "wall":
        continue
    face = at + side * T / 2
    h = y1 - 0.3
    length = b - a
    if zone in ("tunnel", "maint"):
        # ribs every 3 m, a foot of hazard paint under each
        v = a + 1.5
        while v < b - 0.5:
            if free(ax, at, v, 0.4):
                on_wall(ax, face, side, v, 0, h - (0.55 if zone == "tunnel" else 0.1), 0.16, 0.15, M["frame"], "WallRib")
                on_wall(ax, face, side, v, 0, 0.35, 0.24, 0.19, M["hazard"], "RibFoot")
            # the bay after it: junction boxes, conduits, a small screen, canisters
            u = v + 1.5 + random.uniform(-0.4, 0.4)
            if u < b - 0.8 and free(ax, at, u, 0.7):
                r = random.random()
                if r < 0.3:
                    w, hh, y = random.uniform(0.2, 0.32), random.uniform(0.25, 0.45), random.uniform(1.0, 2.0)
                    on_wall(ax, face, side, u, y, y + hh, 0.14, w, M["plate"], "JunctionBox")
                    on_wall(ax, face, side, u + w * 0.5, y + hh - 0.1, y + hh - 0.06, 0.15, 0.025, M["led_g" if random.random() < 0.6 else "led_r"], "Led")
                    on_wall(ax, face, side, u - w * 0.4, 0, y, 0.06, 0.03, M["pipe"], "Conduit")
                elif r < 0.55:
                    for k in range(random.randint(2, 4)):
                        on_wall(ax, face, side, u - 0.4 + k * 0.2, 0.1, h - 0.7, 0.1, 0.05, M["pipe" if k % 2 else "frame"], "Conduit")
                elif r < 0.75:
                    on_wall(ax, face, side, u, 1.1, 1.85, 0.08, 0.42, M["frame"], "WallPanel")
                    on_wall(ax, face, side, u - 0.08, 1.3, 1.7, 0.09, 0.22, M["screen"], "WallScreen")
                elif r < 0.9 and zone == "tunnel":
                    on_wall(ax, face, side, u, 0.3, 0.9, 0.25, 0.38, M["crate"], "Canister")
            v += 3
        # pipes along the upper wall, and in the main tunnels the chamfer under the ceiling
        if length > 2.5:
            for y, r in ((h - 0.75, 0.1), (h - 1.0, 0.07)) if zone == "tunnel" else ((h - 0.35, 0.08),):
                p = face + side * (r + 0.05)
                if ax == "x":
                    rod((a + 0.3, y, p), (b - 0.3, y, p), r, M["pipe"], 8)
                else:
                    rod((p, y, a + 0.3), (p, y, b - 0.3), r, M["pipe"], 8)
        if zone == "tunnel" and length > 1.5:
            c = face + side * 0.05
            if ax == "x":
                B("L_DecoChamfer", a, b, h - 0.45, h + 0.45, c - 0.45, c + 0.45, M["panel"], DECOR, rot=(45, 0, 0))
            else:
                B("L_DecoChamfer", c - 0.45, c + 0.45, h - 0.45, h + 0.45, a, b, M["panel"], DECOR, rot=(0, 45, 0))
        # red emergency strips here and there
        if zone == "tunnel" and length > 6:
            v = a + 4.5
            while v < b - 2:
                if free(ax, at, v, 0.8):
                    on_wall(ax, face, side, v, 2.45, 2.58, 0.05, 0.45, M["alarm"], "Alarm")
                v += 9
    elif zone in ACCENT and length > 1.5:
        # a district: a band of its colour along its walls
        on_wall(ax, face, side, (a + b) / 2, 2.0, 2.06, 0.04, length / 2 - 0.3, ACCENT[zone], "AccentBand")
        on_wall(ax, face, side, (a + b) / 2, 0, 0.3, 0.06, length / 2 - 0.2, M["frame"], "Skirting")

# the tunnels' ceilings: ribs across every 3 m, a cable tray down the middle
for name, x0, x1, z0, z1, h, zone in REGIONS:
    if zone not in ("tunnel", "maint"):
        continue
    along_x = x1 - x0 >= z1 - z0
    if along_x:
        for x in range(x0 + 1, x1, 3):
            D("Rib", x - 0.15, x + 0.15, h - 0.3, h, z0, z1, M["frame"])
        if zone == "tunnel":
            D("CableTray", x0, x1, h - 0.45, h - 0.35, (z0 + z1) / 2 + 0.6, (z0 + z1) / 2 + 1.1, M["cable"])
    else:
        for z in range(z0 + 1, z1, 3):
            D("Rib", x0, x1, h - 0.3, h, z - 0.15, z + 0.15, M["frame"])
        if zone == "tunnel":
            D("CableTray", (x0 + x1) / 2 + 0.6, (x0 + x1) / 2 + 1.1, h - 0.45, h - 0.35, z0, z1, M["cable"])

# ---------------------------------------------------------------- damage
# ceiling panels torn down: a black hole, the panel hanging from one edge, cables, sparks
for x, z, along in ((24, -30, "x"), (34, 20, "z"), (-24, 32, "x"), (-34, -20, "z"), (-14, 0, "x"), (2, 14, "z")):
    D("CeilingHole", x - 0.7, x + 0.7, TH - 0.02, TH - 0.005, z - 0.7, z + 0.7, M["hole"])
    if along == "z":
        B("L_DecoFallenPanel", x + 0.4, x + 0.5, TH - 1.2, TH - 0.05, z - 0.65, z + 0.65, M["panel"], DECOR, rot=(0, -25, 0))
    else:
        B("L_DecoFallenPanel", x - 0.65, x + 0.65, TH - 1.2, TH - 0.05, z + 0.4, z + 0.5, M["panel"], DECOR, rot=(25, 0, 0))
    for k in range(3):
        dx, dz = random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4)
        low = TH - random.uniform(0.8, 1.5)
        rod((x + dx, TH, z + dz), (x + dx * 1.3, low, z + dz * 1.3), 0.02, M["cable" if k else "pipe"])
        if k == 0:
            fx_at("Spark", x + dx * 1.3, low, z + dz * 1.3)
# cables sagging from the tunnel ceilings
for p0, p1, drop in (((14, TH - 0.3, -31), (18, TH - 0.3, -29), 0.8), ((33, TH - 0.3, 14), (35, TH - 0.3, 19), 0.9),
                     ((-18, TH - 0.3, 31), (-14, TH - 0.3, 33), 0.7), ((-35, TH - 0.3, -14), (-33, TH - 0.3, -10.5), 1.0),
                     ((-1.5, TH - 0.3, -15), (1.5, TH - 0.3, -11), 0.8)):
    sag(p0, p1, drop)
    sag((p0[0] + 0.15, p0[1], p0[2] + 0.1), (p1[0] + 0.1, p1[1], p1[2] - 0.1), drop * 0.8, 0.02)


# ---------------------------------------------------------------- the reactor room: chains and water
def chain(x, z, y0, y1):
    y, k = y1, 0
    while y > y0:
        if k % 2:
            D("ChainLink", x - 0.012, x + 0.012, y - 0.14, y, z - 0.045, z + 0.045, M["frame"])
        else:
            D("ChainLink", x - 0.045, x + 0.045, y - 0.14, y, z - 0.012, z + 0.012, M["frame"])
        y -= 0.11
        k += 1


for x, z, y0 in ((-3.4, -4.4, 2.6), (3.6, -3.2, 1.8), (3.2, 4.0, 2.9), (-4.2, 3.0, 3.6)):
    chain(x, z, y0, 7.0)
    D("ChainHook", x - 0.06, x + 0.06, y0 - 0.12, y0, z - 0.06, z + 0.06, M["frame"])
for x, y, z in ((-3.4, 6.9, -4.4), (3.2, 6.9, 4.0), (19, MH - 0.1, 18), (-21, MH - 0.1, 22), (-3, 5.2, -38), (-34, TH - 0.1, 22)):
    fx_at("Drip", x, y, z)
    cyl(nm("L_DecoPuddle"), DECOR, random.uniform(0.5, 0.9), 0.01, P(x, 0.006, z), M["wet"], verts=12)


# ---------------------------------------------------------------- the infestation
def blob(x, y, z, s):
    sphere(nm("L_DecoResinBlob"), DECOR, s, P(x, y, z), M["resin"], scale=(1, random.uniform(0.6, 1.2), random.uniform(0.4, 0.8)))


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


# the nests, where the parasites hatch (spawn gates 3, 9 and 10)
nest(-11.7, -10.3, -35.5, -31, 5)
nest(-35.7, -34.3, -31.7, -30.3, 4)
nest(34.3, 35.7, 32.3, 33.7, 4)
# resin spreading from them, along the walls of the shafts, round the west airlock and the labs
infested = 0
for ax, at, a, b, y0, y1, kind, side, zone in RUNS:
    if kind != "wall":
        continue
    near_west = (ax == "z" and at <= -32) or (ax == "x" and a <= -32 and at > -12)
    if zone == "maint" or near_west or zone == "airlock":
        face = at + side * T / 2
        v = a + random.uniform(1.0, 2.5)
        while v < b - 0.8:
            if free(ax, at, v, 0.8) and random.random() < 0.55:
                ribs_up(ax, face, side, v, y1 - 0.5, random.uniform(0.35, 0.55))
                blob(at + side * 0.4 if ax == "z" else v, 0, v if ax == "z" else at + side * 0.4, random.uniform(0.25, 0.45))
                infested += 1
            v += random.uniform(2.5, 4.5)
for x, z in ((-11.4, -37.5), (-10.8, -28), (-34.8, -29), (34.8, 31), (35.2, 29)):
    blob(x, 0, z, random.uniform(0.35, 0.6))

# ---------------------------------------------------------------- the client's effects
# rotating beacons at the main tunnels' bends, the perimeter's corners, the hangar and the airlock
for x, y, z in ((4, TH - 0.15, -18), (-4, TH - 0.15, 18), (18, TH - 0.15, 0), (-18, TH - 0.15, -4),
                (34, TH - 0.15, -30), (34, TH - 0.15, 32), (-34, TH - 0.15, 32), (-34, TH - 0.15, -30),
                (0, 8.85, 42), (-47, 3.05, 1.5)):
    fx_at("Beacon", x, y, z)
# steam leaking from the pipes
for x, y, z in ((14.4, TH - 1.1, -1.8), (-30, TH - 1.1, -5.6), (35.6, TH - 1.1, 0 - 15), (-35.6, TH - 1.1, 15), (6, 6.4, -8.6), (20, TH - 1.1, -29.6)):
    fx_at("Steam", x, y, z)
print("decor:", len(DECOR.all_objects), "resin columns:", infested, "fx:", {k: v[0] for k, v in fx.items()})
