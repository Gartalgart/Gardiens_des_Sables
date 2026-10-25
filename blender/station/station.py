# U2: the derelict space station ("Station spatiale infestée"), a network of tunnels, built in
# blender/station/station.blend. Then blender/station/dressing.py dresses it (send both as one
# script: the MCP's safe mode allows no exec, no open, no lambda).
# Usage inside Blender, after helpers.py: this file, then dressing.py.
#
# Level design (U2 rework, from research on corridor and horror level design: loops so fights can
# move round, the corridor/arena rhythm, a few distinct districts, readable turns and thresholds):
# - three loops: round the reactor, through the main tunnels and the maintenance shafts, and the
#   perimeter tunnel that joins the four districts;
# - main tunnels 4 m wide and 3.6 m high, bent once or twice so sight lines stay short; maintenance
#   shafts 2 m wide (the brutes do not fit, parasites and crawlers flank through them);
# - five districts with their own light colour: the reactor (circular arena, cyan), the greenhouse
#   (glass roof, magenta), the hangar (the one big arena, amber), the crew quarters (bunks and mess,
#   tight rooms, warm) and the labs (glass partitions, green), plus a west airlock chamber;
# - every threshold between two spaces is a bulkhead frame with hazard stripes and the colour of the
#   room beyond.
# Walls, ceilings and lintels come from a 1 m grid of walkable cells: a wall wherever a walkable cell
# meets the void, a lintel wherever two walkable cells have different ceilings. The nav grid has a
# single floor per cell: every floor is at 0, nothing is built over anything.
#
# Naming (src/sim/level.js, scripts/level-json-from-glb.mjs): L_Deco* no collision, C_* collision
# only, D_Airlock_n doors, SPAWN_n, BRAZIER_n (light; its tube L_DecoNeon_n), KEG_n (oxygen bottle),
# LEVER_n, VENT_n (duct crawlers), PLAYER_START; FX_* empties in the Decor collection.
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
    "screen": mat("S_Screen", (0.05, 0.4, 0.15), 0.3, emit=(0.15, 0.95, 0.35), strength=0.8),
    "core": mat("S_Core", (0.2, 0.8, 1.0), 0.3, emit=(0.2, 0.75, 1.0), strength=1.2),
    "grow": mat("S_Grow", (1.0, 0.3, 0.8), 0.5, emit=(1.0, 0.25, 0.75), strength=1.5),
    "hole": mat("S_Void", (0.0, 0.0, 0.0), 1.0),
}
# the colour of each district, on the strips over its thresholds and along its walls
ACCENT = {
    "core": mat("S_AccCore", (0.2, 0.8, 1.0), 0.4, emit=(0.15, 0.7, 1.0), strength=1.6),
    "hydro": mat("S_AccHydro", (1.0, 0.3, 0.8), 0.4, emit=(1.0, 0.2, 0.7), strength=1.6),
    "hangar": mat("S_AccHangar", (1.0, 0.6, 0.1), 0.4, emit=(1.0, 0.55, 0.08), strength=1.6),
    "crew": mat("S_AccCrew", (1.0, 0.45, 0.2), 0.4, emit=(1.0, 0.4, 0.15), strength=1.6),
    "labs": mat("S_AccLabs", (0.3, 1.0, 0.6), 0.4, emit=(0.25, 1.0, 0.55), strength=1.6),
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


# ---------------------------------------------------------------- the plan
TH, MH = 3.6, 2.8  # ceilings of the main tunnels and the maintenance shafts
# (name, x0, x1, z0, z1, ceiling, district)
REGIONS = [
    ("core", -9, 9, -9, 9, 7.0, "core"),
    ("hydro", -12, 12, -40, -26, 5.5, "hydro"),
    ("hangar", -13, 13, 26, 44, 9.0, "hangar"),
    ("crew", 28, 44, -10, 10, 3.4, "crew"),
    ("labs", -44, -28, -10, 10, 3.4, "labs"),
    ("airlock", -50, -44, -2, 2, 3.2, "airlock"),
    # main tunnels from the reactor, each bent on the way
    ("tn", -2, 2, -20, -9, TH, "tunnel"), ("tn", -2, 6, -20, -16, TH, "tunnel"), ("tn", 2, 6, -26, -16, TH, "tunnel"),
    ("ts", -2, 2, 9, 20, TH, "tunnel"), ("ts", -6, 2, 16, 20, TH, "tunnel"), ("ts", -6, -2, 16, 26, TH, "tunnel"),
    ("te", 9, 20, -2, 2, TH, "tunnel"), ("te", 16, 20, -2, 6, TH, "tunnel"), ("te", 16, 28, 2, 6, TH, "tunnel"),
    ("tw", -20, -9, -2, 2, TH, "tunnel"), ("tw", -20, -16, -6, 2, TH, "tunnel"), ("tw", -28, -16, -6, -2, TH, "tunnel"),
    # the perimeter loop between the districts
    ("ne", 12, 36, -32, -28, TH, "tunnel"), ("ne", 32, 36, -32, -10, TH, "tunnel"),
    ("se", 32, 36, 10, 34, TH, "tunnel"), ("se", 13, 36, 30, 34, TH, "tunnel"),
    ("sw", -36, -13, 30, 34, TH, "tunnel"), ("sw", -36, -32, 10, 34, TH, "tunnel"),
    ("nw", -36, -32, -32, -10, TH, "tunnel"), ("nw", -36, -12, -32, -28, TH, "tunnel"),
    # maintenance shafts: shortcuts from the main tunnels' bends to the perimeter
    ("mne", 6, 22, -19, -17, MH, "maint"), ("mne", 20, 22, -28, -17, MH, "maint"),
    ("mse", 18, 20, 6, 30, MH, "maint"),
    ("msw", -22, -6, 17, 19, MH, "maint"), ("msw", -22, -20, 19, 30, MH, "maint"),
    ("mnw", -20, -18, -28, -6, MH, "maint"),
]
WALL_MAT = {"core": "plate", "hydro": "panel", "hangar": "plate", "crew": "panel", "labs": "white",
            "airlock": "plate", "tunnel": "panel", "maint": "plate"}
FLOOR_MAT = {"core": "deck", "hydro": "deck", "hangar": "deck", "crew": "couch", "labs": "white",
             "airlock": "grating", "tunnel": "grating", "maint": "grating"}

# openings cut in the generated walls: (line, at) -> [(from, to, bottom, top, kind)]; a line 'x' runs
# along X at z = at, a line 'z' along Z at x = at; kind 'win' (glass) or 'open' (an airlock's door)
PH0, PH1 = 1.2, 2.4  # portholes
HOLES = {
    ("x", 44): [(-5, 5, 0, 6, "open")],  # the hangar's bay door
    ("z", -50): [(-1.5, 1.5, 0, 3, "open")],  # the west airlock's outer door
    ("z", 44): [(-4, 4, 0.9, 2.8, "win")],  # the mess's window on the planet
    ("x", -40): [(-8, -3, 1.0, 4.4, "win"), (3, 8, 1.0, 4.4, "win")],  # the greenhouse's back wall
    ("z", 36): [(-26, -24, PH0, PH1, "win"), (-18, -16, PH0, PH1, "win"), (16, 18, PH0, PH1, "win"), (24, 26, PH0, PH1, "win")],
    ("z", -36): [(-26, -24, PH0, PH1, "win"), (-18, -16, PH0, PH1, "win"), (16, 18, PH0, PH1, "win"), (24, 26, PH0, PH1, "win")],
    ("x", -32): [(-29, -27, PH0, PH1, "win"), (-22, -20, PH0, PH1, "win"), (20, 22, PH0, PH1, "win"), (27, 29, PH0, PH1, "win")],
    ("x", 34): [(-29, -27, PH0, PH1, "win"), (-22, -20, PH0, PH1, "win"), (20, 22, PH0, PH1, "win"), (27, 29, PH0, PH1, "win")],
    ("z", 13): [(37, 41, 6.0, 8.0, "win")],
    ("z", -13): [(37, 41, 6.0, 8.0, "win")],
}
# walls inside the rooms: (line, at, from, to, height, district, openings as above, kind 'door' too)
PARTITIONS = [
    ("x", -6, 28, 44, 3.4, "crew", [(39, 42, 0, 2.4, "door")]),
    ("x", 7, 28, 44, 3.4, "crew", [(39, 42, 0, 2.4, "door")]),
    ("x", -7, -44, -28, 3.4, "labs", [(-42, -39, 0, 2.4, "door"), (-35, -30, 1.0, 2.4, "win")]),
    ("x", 6, -44, -28, 3.4, "labs", [(-42, -39, 0, 2.4, "door"), (-35, -30, 1.0, 2.4, "win")]),
]

# walkable cells: (i, j) -> [ceiling, district], cell (i, j) covering x in [i, i+1], z in [j, j+1]
CELLS = {}
for name, x0, x1, z0, z1, h, zone in REGIONS:
    for i in range(x0, x1):
        for j in range(z0, z1):
            c = CELLS.get((i, j))
            if c is None or h > c[0]:
                CELLS[(i, j)] = [h, zone]

# ---------------------------------------------------------------- walls from the grid
T = 0.4  # wall thickness
RUNS = []  # every generated wall: (line, at, a, b, bottom, top, kind, side toward the walkable cell, district)


def seg(ax, at, a, b, y0, y1, m, name="Wall"):
    if b - a <= 0.01 or y1 - y0 <= 0.01:
        return
    if ax == "x":
        B(name, a, b, y0, y1, at - T / 2, at + T / 2, m)
    else:
        B(name, at - T / 2, at + T / 2, y0, y1, a, b, m)


def glass(ax, at, c0, c1, h0, h1):
    """a window: an invisible pane stops bodies and shots, a tinted pane and a frame are drawn"""
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


def frame(ax, at, c0, c1, h, zone):
    """a bulkhead frame round an opening: hazard posts, a dark beam, the district's colour on top"""
    f, e = 0.3, T / 2 + 0.12
    if ax == "x":
        D("Bulkhead", c0, c0 + f, 0, h, at - e, at + e, M["hazard"])
        D("Bulkhead", c1 - f, c1, 0, h, at - e, at + e, M["hazard"])
        D("BulkheadTop", c0, c1, h - 0.25, h, at - e, at + e, M["frame"])
        if zone in ACCENT:
            D("Accent", c0 + f, c1 - f, h - 0.33, h - 0.25, at - e - 0.02, at + e + 0.02, ACCENT[zone])
    else:
        D("Bulkhead", at - e, at + e, 0, h, c0, c0 + f, M["hazard"])
        D("Bulkhead", at - e, at + e, 0, h, c1 - f, c1, M["hazard"])
        D("BulkheadTop", at - e, at + e, h - 0.25, h, c0, c1, M["frame"])
        if zone in ACCENT:
            D("Accent", at - e - 0.02, at + e + 0.02, h - 0.33, h - 0.25, c0 + f, c1 - f, ACCENT[zone])


def build_run(ax, at, a, b, y0, y1, m, kind, side, zone):
    """one straight wall (or lintel) with the openings of its line cut out"""
    RUNS.append((ax, at, a, b, y0, y1, kind, side, zone))
    if kind == "wall":
        a, b = a - T / 2, b + T / 2  # closes the corners
    cur = a
    for c0, c1, h0, h1, k in sorted(HOLES.get((ax, at), [])):
        if c1 <= a or c0 >= b or h0 >= y1:
            continue
        seg(ax, at, cur, c0, y0, y1, m)
        seg(ax, at, c0, c1, y0, max(y0, h0), m)
        seg(ax, at, c0, c1, h1, y1, m)
        if k == "win":
            glass(ax, at, c0, c1, h0, h1)
        cur = c1
    seg(ax, at, cur, b, y0, y1, m)


def edge(a, b):
    """what stands between two cells (either may be None): ('wall', 0, top, district, side) or
    ('lintel', bottom, top, district of the taller one, district of the lower one) or None"""
    if a and b:
        if abs(a[0] - b[0]) < 0.01:
            return None
        hi = a if a[0] > b[0] else b
        lo = b if hi is a else a
        return ("lintel", lo[0], hi[0] + 0.3, hi[1], lo[1])
    if a or b:
        c = a or b
        return ("wall", 0, c[0] + 0.3, c[1], 1 if b else -1)
    return None


xs = [k[0] for k in CELLS]
zs = [k[1] for k in CELLS]
X0, X1, Z0, Z1 = min(xs), max(xs) + 1, min(zs), max(zs) + 1
EDGES = []
for ln in ("z", "x"):
    for at in range(X0 if ln == "z" else Z0, (X1 if ln == "z" else Z1) + 1):
        cur = None  # the run being extended: [start, end, info]
        for t in range((Z0 if ln == "z" else X0) - 1, (Z1 if ln == "z" else X1) + 1):
            if ln == "z":
                info = edge(CELLS.get((at - 1, t)), CELLS.get((at, t)))
            else:
                info = edge(CELLS.get((t, at - 1)), CELLS.get((t, at)))
            if cur and info == cur[2]:
                cur[1] = t + 1
                continue
            if cur:
                EDGES.append((ln, at, cur[0], cur[1], cur[2]))
            cur = [t, t + 1, info] if info else None
        if cur:
            EDGES.append((ln, at, cur[0], cur[1], cur[2]))
for ln, at, a, b, info in EDGES:
    if info[0] == "wall":
        build_run(ln, at, a, b, info[1], info[2], M[WALL_MAT[info[3]]], "wall", info[4], info[3])
    else:
        build_run(ln, at, a, b, info[1], info[2], M[WALL_MAT[info[3]]], "lintel", 0, info[3])
        frame(ln, at, a, b, info[1], info[3])

for ln, at, a, b, h, zone, holes in PARTITIONS:
    m = M[WALL_MAT[zone]]
    cur = a
    for c0, c1, h0, h1, k in sorted(holes):
        seg(ln, at, cur, c0, 0, h, m)
        seg(ln, at, c0, c1, 0, h0, m)
        seg(ln, at, c0, c1, h1, h, m)
        if k == "win":
            glass(ln, at, c0, c1, h0, h1)
        if k == "door":
            frame(ln, at, c0, c1, h1, zone)
        cur = c1
    seg(ln, at, cur, b, 0, h, m)

# ceilings and floors, region by region (the greenhouse's ceiling is a glass roof)
for name, x0, x1, z0, z1, h, zone in REGIONS:
    D("Floor", x0, x1, -0.1, 0, z0, z1, M[FLOOR_MAT[zone]])
    if zone == "hydro":
        C(x0, x1, h, h + 0.3, z0, z1)
        D("Glass", x0, x1, h + 0.1, h + 0.14, z0, z1, M["glass"])
        for x in range(x0, x1 + 1, 4):
            D("RoofBeam", x - 0.15, x + 0.15, h - 0.3, h + 0.3, z0, z1, M["frame"])
        for z in range(z0, z1 + 1, 3):
            D("RoofBeam", x0, x1, h - 0.2, h + 0.3, z - 0.12, z + 0.12, M["frame"])
    else:
        B("Ceiling", x0 - 0.2, x1 + 0.2, h, h + 0.3, z0 - 0.2, z1 + 0.2, M["plate" if zone in ("maint", "hangar", "core") else "panel"])

# ---------------------------------------------------------------- lights
LIGHTS = []


def light_at(x, y, z, along="x", force=False):
    for lx, ly, lz, la in LIGHTS:
        if not force and abs(lx - x) + abs(lz - z) < 3.5:
            return
    LIGHTS.append((x, y, z, along))


for x, y, z in ((-5.5, 6.65, -5.5), (5.5, 6.65, -5.5), (-5.5, 6.65, 5.5), (5.5, 6.65, 5.5),
                (-6, 5.05, -33), (6, 5.05, -33),
                (-8, 6.2, 30), (8, 6.2, 30), (-8, 6.2, 39), (8, 6.2, 39),
                (32, 3.05, 0), (40, 3.05, 0), (36, 3.05, -8), (36, 3.05, 8.5),
                (-36, 3.05, 0), (-36, 3.05, -8.5), (-36, 3.05, 8), (-47, 2.85, 0)):
    light_at(x, y, z, force=True)
for name, x0, x1, z0, z1, h, zone in REGIONS:
    if zone not in ("tunnel", "maint"):
        continue
    step = 7 if zone == "tunnel" else 6
    if x1 - x0 >= z1 - z0:
        n = max(1, round((x1 - x0) / step))
        for k in range(n):
            light_at(x0 + (k + 0.5) * (x1 - x0) / n, h - 0.35, (z0 + z1) / 2, "x")
    else:
        n = max(1, round((z1 - z0) / step))
        for k in range(n):
            light_at((x0 + x1) / 2, h - 0.35, z0 + (k + 0.5) * (z1 - z0) / n, "z")
for i, (x, y, z, along) in enumerate(LIGHTS):
    if along == "x":
        D("NeonHousing", x - 0.8, x + 0.8, y, y + 0.22, z - 0.16, z + 0.16, M["frame"])
        tube = B("Neon", x - 0.7, x + 0.7, y - 0.07, y, z - 0.06, z + 0.06, M["neon"], DECOR)
    else:
        D("NeonHousing", x - 0.16, x + 0.16, y, y + 0.22, z - 0.8, z + 0.8, M["frame"])
        tube = B("Neon", x - 0.06, x + 0.06, y - 0.07, y, z - 0.7, z + 0.7, M["neon"], DECOR)
    tube.name = "L_DecoNeon_%d" % (i + 1)
    empty("BRAZIER_%d" % (i + 1), LEVEL, P(x, y - 0.15, z))
# the hangar's lights hang on rods from its high ceiling
for x, z in ((-8, 30), (8, 30), (-8, 39), (8, 39)):
    for dx in (-0.6, 0.6):
        D("Rod", x + dx - 0.02, x + dx + 0.02, 6.42, 9.0, z - 0.02, z + 0.02, M["cable"])


# ---------------------------------------------------------------- furniture and machines
def crate(x, z, s=1.4, y=0):
    B("Crate", x - s / 2, x + s / 2, y, y + s, z - s / 2, z + s / 2, M["crate"])
    D("CrateBand", x - s / 2 - 0.02, x + s / 2 + 0.02, y + s * 0.42, y + s * 0.58, z - s / 2 - 0.02, z + s / 2 + 0.02, M["frame"])


def vpipe(x, z, y0, y1, r=0.15, m="pipe"):
    cyl(nm("L_DecoPipe"), DECOR, r, y1 - y0, P(x, (y0 + y1) / 2, z), M[m], verts=8)


def console(x0, x1, z0, z1, screen_side):
    """a desk; its monitor faces the side given ('n', 's', 'e', 'w')"""
    B("Console", x0, x1, 0, 1.0, z0, z1, M["plate"])
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    if screen_side in ("n", "s"):
        D("Monitor", x0 + 0.2, x1 - 0.2, 1.0, 1.8, cz - 0.05, cz + 0.05, M["frame"])
        d = -0.07 if screen_side == "n" else 0.05
        D("MonitorScreen", x0 + 0.3, x1 - 0.3, 1.1, 1.7, cz + d, cz + d + 0.02, M["screen"])
    else:
        D("Monitor", cx - 0.05, cx + 0.05, 1.0, 1.8, z0 + 0.2, z1 - 0.2, M["frame"])
        d = -0.07 if screen_side == "w" else 0.05
        D("MonitorScreen", cx + d, cx + d + 0.02, 1.1, 1.7, z0 + 0.3, z1 - 0.3, M["screen"])


# the reactor: a column from floor to ceiling, glowing rings, four generators round it
cyl("Reactor", LEVEL, 2.2, 7.0, P(0, 3.5, 0), M["plate"], verts=16)
for y in (1.2, 2.8, 4.4, 6.0):
    cyl(nm("L_DecoCoreRing"), DECOR, 2.35, 0.22, P(0, y, 0), M["core"], verts=16)
    cyl(nm("L_DecoCoreBand"), DECOR, 2.3, 0.5, P(0, y + 0.45, 0), M["frame"], verts=16)
for a in range(8):
    an = a / 8 * math.tau
    vpipe(math.cos(an) * 2.35, math.sin(an) * 2.35, 0, 7.0, 0.12, "frame")
for sx in (-1, 1):
    for sz in (-1, 1):
        x, z = 5.5 * sx, 5.5 * sz
        B("Generator", x - 1.3, x + 1.3, 0, 2.4, z - 1.3, z + 1.3, M["plate"])
        D("GenTop", x - 1.0, x + 1.0, 2.4, 2.7, z - 1.0, z + 1.0, M["frame"])
        D("GenLight", x - 1.32, x + 1.32, 1.6, 1.75, z - 1.32, z + 1.32, M["core"])
        D("GenStripe", x - 1.33, x + 1.33, 0, 0.3, z - 1.33, z + 1.33, M["hazard"])
        vpipe(x, z, 2.7, 7.0, 0.25)
console(-8.6, -7.6, 3.2, 4.4, "e")
console(7.6, 8.6, -4.4, -3.2, "w")
# the greenhouse: four beds of plants under pink grow lights, water tanks at the back
for x in (-9, -4.5, 4.5, 9):
    B("Bed", x - 0.8, x + 0.8, 0, 0.9, -37, -29, M["plate"])
    D("Soil", x - 0.7, x + 0.7, 0.9, 0.96, -36.9, -29.1, M["soil"])
    for z in range(-36, -29):
        for dx in (-0.35, 0.35):
            h = random.uniform(0.5, 1.1)
            cyl(nm("L_DecoStalk"), DECOR, 0.03, h, P(x + dx, 0.95 + h / 2, z + 0.5), M["leaf"], verts=4)
            sphere(nm("L_DecoLeaves"), DECOR, random.uniform(0.2, 0.34), P(x + dx, 0.95 + h, z + 0.5), M["leaf"],
                   scale=(1, 1, random.uniform(0.6, 1.0)))
    D("GrowLight", x - 0.5, x + 0.5, 2.7, 2.8, -36.5, -29.5, M["grow"])
    D("GrowHousing", x - 0.6, x + 0.6, 2.8, 2.95, -36.6, -29.4, M["frame"])
    for z in (-36, -30):
        D("Wire", x - 0.02, x + 0.02, 2.95, 5.2, z - 0.02, z + 0.02, M["cable"])
for x in (-11, 11):
    cyl(nm("WaterTank"), LEVEL, 0.6, 2.4, P(x, 1.2, -39), M["white"], verts=12)
# the hangar: the shuttle on its skids, cargo, a fuel cart
B("Shuttle", -11, -5, 0, 3.4, 30, 41, M["white"])
B("ShuttleWing", -12.6, -3.4, 1.6, 1.9, 34, 38, M["white"])
D("ShuttleNose", -10.5, -5.5, 0.4, 2.9, 41, 43.2, M["white"])
D("Cockpit", -10, -6, 2.0, 2.8, 42.2, 43.15, M["screen"])
D("ShuttleStripe", -11.02, -4.98, 2.1, 2.4, 30, 41, M["hazard"])
for x in (-10.4, -5.6):
    D("Engine", x - 0.6, x + 0.6, 0.8, 2.5, 28.8, 30, M["frame"])
    D("EngineGlow", x - 0.45, x + 0.45, 1.0, 2.3, 28.75, 28.8, M["core"])
for x, z, y, s in ((8, 32, 0, 1.4), (9.5, 32, 0, 1.4), (8.75, 32.2, 1.4, 1.3), (10.5, 38, 0, 1.6), (2, 41.5, 0, 1.2), (11.2, 28.5, 0, 1.2)):
    crate(x, z, s, y)
B("Cart", 2, 5, 0, 1.2, 35, 37, M["hazard"])
D("CartTank", 2.2, 4.8, 1.2, 2.0, 35.3, 36.7, M["white"])
for z in (41.2, 42, 42.8):
    D("FloorStripe", -5, 5, 0, 0.012, z, z + 0.4, M["hazard"])
B("Door", -5, 5, 0, 6, 43.85, 44.15, M["hazard"]).name = "D_Airlock_1"
empty("LEVER_1", LEVEL, P(12.65, 1.3, 36))
D("LeverPanel", 12.74, 12.8, 0.8, 1.9, 35.4, 36.6, M["frame"])
D("LeverSign", 12.72, 12.74, 2.0, 2.3, 35.4, 36.6, M["hazard"])
# the crew quarters: a mess with two long tables, bunk rooms either side, lockers
for z0, z1 in ((-4, -3), (3, 4)):
    B("MessTable", 31, 38, 0, 0.75, z0, z1, M["plate"])
for z in (-9.85, 9.0):
    for x0 in (28.3, 37.0, 40.5):
        B("Bunk", x0, x0 + 2, 0, 1.6, z, z + 0.85, M["plate"])
        D("Mattress", x0 + 0.05, x0 + 1.95, 0.5, 0.62, z + 0.05, z + 0.8, M["couch"])
        D("Mattress", x0 + 0.05, x0 + 1.95, 1.4, 1.52, z + 0.05, z + 0.8, M["couch"])
for z in (-5.2, 4.4):
    B("Locker", 43.0, 43.8, 0, 2.2, z - 0.6, z + 0.6, M["plate"])
console(28.4, 29.4, -2.5, -1.3, "e")
# the labs: benches in the hall, cryo tubes in the north lab, beds in the infirmary
B("Bench", -38, -33, 0, 0.95, 1.6, 2.6, M["white"])
D("BenchTop", -38.05, -32.95, 0.95, 1.0, 1.55, 2.65, M["frame"])
for x in (-42.6, -29.6):
    cyl(nm("Cryo"), LEVEL, 0.55, 2.2, P(x, 1.1, -8.6), M["frame"], verts=10)
    cyl(nm("L_DecoCryoGlass"), DECOR, 0.48, 1.6, P(x, 1.2, -8.6), M["screen"], verts=10)
for x0 in (-43.4, -31.0):
    B("MedBed", x0, x0 + 2, 0, 0.8, 8.4, 9.7, M["white"])
console(-43.6, -42.6, -5.5, -4.3, "e")
console(-29.4, -28.4, 2.6, 3.8, "w")
empty("LEVER_2", LEVEL, P(-43.65, 1.3, 4))
D("LeverPanel", -43.8, -43.74, 0.8, 1.9, 3.4, 4.6, M["frame"])
D("LeverSign", -43.74, -43.72, 2.0, 2.3, 3.4, 4.6, M["hazard"])
# the airlock chamber
B("Door", -50.15, -49.85, 0, 3, -1.5, 1.5, M["hazard"]).name = "D_Airlock_2"
for x in (-48.5, -46.5):
    D("FloorStripe", x, x + 0.5, 0, 0.012, -2, 2, M["hazard"])
for x in (-48.6, -47.4, -46.2):
    D("SuitLocker", x - 0.5, x + 0.5, 0.3, 2.6, -1.8, -1.55, M["frame"])
    D("Suit", x - 0.3, x + 0.3, 0.6, 2.0, -1.7, -1.45, M["white"])

# ---------------------------------------------------------------- gameplay
# spawn gates (src/worlds/station.js spawnGates says which kind comes through which):
# 1-2 the hangar (the shuttle, the cargo), 3 the greenhouse's back, 4 the north lab, 5 the north
# bunks, 6 the reactor, 7-10 the perimeter's corners (drone docks, nests)
for i, (x, z) in enumerate(((-2, 36), (9, 41), (0, -38), (-40, -8.5), (36, -8), (-7.5, 0),
                            (34, -30), (-34, 32), (-33.5, -29), (33.5, 31))):
    empty("SPAWN_%d" % (i + 1), LEVEL, P(x, 0, z))
empty("PLAYER_START", LEVEL, P(34, 0, 0))
for i, (x, z) in enumerate(((7.8, 7.8), (-7.8, -7.8), (11.2, -26.8), (12.2, 28.2), (-12.2, 42.6),
                            (43.3, 6.3), (-43.3, 5.5), (35.3, -31.3), (-35.3, 33.3), (17.2, -1.2))):
    empty("KEG_%d" % (i + 1), LEVEL, P(x, 0, z))
# vents in the ceilings of the shafts and tunnels
VENTS = [(12, MH - 0.08, -18), (21, MH - 0.08, -24), (19, MH - 0.08, 12), (19, MH - 0.08, 24),
         (-12, MH - 0.08, 18), (-21, MH - 0.08, 25), (-19, MH - 0.08, -12), (-19, MH - 0.08, -22),
         (13, TH - 0.08, -1.2), (-13, TH - 0.08, 1.2), (0.8, TH - 0.08, -13), (-0.8, TH - 0.08, 13), (5, 6.92, -2)]
for i, (x, y, z) in enumerate(VENTS):
    empty("VENT_%d" % (i + 1), LEVEL, P(x, y, z))
    D("Vent", x - 0.5, x + 0.5, y + 0.02, y + 0.06, z - 0.35, z + 0.35, M["frame"])
    for k in range(5):
        D("VentSlat", x - 0.45, x + 0.45, y, y + 0.02, z - 0.3 + k * 0.14, z - 0.26 + k * 0.14, M["hole"])

# outside, seen through the windows: a solar array east of the mess, a mast north of the greenhouse
D("Truss", 46, 80, 2.3, 2.7, -0.2, 0.2, M["frame"])
for x in range(50, 80, 8):
    for z0, z1 in ((-9, -0.6), (0.6, 9)):
        D("SolarPanel", x - 3.5, x + 3.5, 2.45, 2.55, z0, z1, M["solar"])
        D("SolarRib", x - 3.5, x + 3.5, 2.4, 2.6, (z0 + z1) / 2 - 0.05, (z0 + z1) / 2 + 0.05, M["frame"])
D("Mast", -0.3, 0.3, 0, 22, -54, -53.4, M["frame"])
sphere("L_DecoDish", DECOR, 3.0, P(0, 20, -53.7), M["white"], scale=(1, 0.35, 1))
sphere("L_DecoMastLight", DECOR, 0.3, P(0, 22.3, -53.7), M["alarm"])
print("level:", len(LEVEL.all_objects), "decor:", len(DECOR.all_objects), "lights:", len(LIGHTS), "walls:", len(RUNS))
