# Dressing of the pirate port (decor.glb): everything here is decoration, never collision, and is
# exported apart from the level so the map's collisions and navigation (level.json) stay as they are.
# Usage inside Blender (port.blend, scene "Scene"), after helpers.py:
#   exec(open(r"<path>/blender/pirates/decor.py").read())
# (with the Blender MCP in safe mode, send helpers.py and this file as one script)
#
# Rules, since nothing here stops a body: things on walkable ground hug a wall (0.1 m at most out
# of it) or stand out of reach (above 2 m, on the cliffs, out in the deep water); the client merges
# the meshes per material (src/view/worldView.js) and animates the L_DecoFire* flames.
# Coordinates are the game's (X east, Y up, Z towards the sea), as in port.py.
import bpy
import bmesh
import math
import random
from mathutils import Vector

random.seed(23)
DECOR = get_coll("Decor", clear=True)

M = {
    # shared with port.py (same values: mat() reuses the material by name)
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
    "canvas": mat("P_Canvas", (0.2, 0.18, 0.14), 1.0),
    "fire": mat("Fire", (1.0, 0.45, 0.1), 0.5, emit=(1.0, 0.45, 0.08), strength=6.0),
    "bone": mat("P_Bone", (0.72, 0.68, 0.58), 0.8),
    "leaf": mat("P_Leaf", (0.08, 0.2, 0.08), 0.9),
    # the dressing's own
    "stone": mat("P_Stone", (0.24, 0.23, 0.21), 0.95),
    "char": mat("P_Char", (0.04, 0.035, 0.03), 1.0),
    "shutter": mat("P_Shutter", (0.08, 0.17, 0.19), 0.85),
    "paper": mat("P_Paper", (0.55, 0.48, 0.33), 1.0),
    "red": mat("P_ClothRed", (0.42, 0.07, 0.05), 1.0),
    "linen": mat("P_ClothLinen", (0.5, 0.46, 0.36), 1.0),
    "blue": mat("P_ClothBlue", (0.09, 0.15, 0.3), 1.0),
    "flag": mat("P_Flag", (0.015, 0.015, 0.015), 1.0),
    "glow": mat("P_WindowGlow", (1.0, 0.62, 0.28), 0.6, emit=(1.0, 0.55, 0.2), strength=2.5),
    "dark": mat("P_Dark", (0.01, 0.01, 0.01), 1.0),
    "vine": mat("P_Vine", (0.05, 0.12, 0.04), 1.0),
    "grass": mat("P_Grass", (0.1, 0.17, 0.06), 1.0),
    "weed": mat("P_Seaweed", (0.04, 0.09, 0.05), 0.6),
    "fruit": mat("P_Fruit", (0.6, 0.25, 0.04), 0.7),
    "fish": mat("P_Fish", (0.35, 0.38, 0.4), 0.35, 0.3),
}
_n = [0]


def nm(base):
    _n[0] += 1
    return "L_Deco%s_%d" % (base, _n[0])


def P(x, y, z):
    return (x, -z, y)


def B(name, x0, x1, y0, y1, z0, z1, m, rot=(0, 0, 0)):
    """Box from game-space bounds; rot in Blender degrees (its Z turns around the game's Y)."""
    return box(nm(name), DECOR, (x1 - x0, z1 - z0, y1 - y0), ((x0 + x1) / 2, -(z0 + z1) / 2, (y0 + y1) / 2), M[m], rot=rot)


def beam(m, p0, p1, w, h, name="Beam"):
    """Box from p0 to p1 (not vertical): w across it horizontally, h across it in its vertical plane."""
    a = Vector(P(p0[0], p0[1], p0[2]))
    b = Vector(P(p1[0], p1[1], p1[2]))
    d = b - a
    ob = box(nm(name), DECOR, (d.length, w, h), (a + b) / 2, M[m])
    ob.rotation_euler = d.to_track_quat("X", "Z").to_euler()
    return ob


def rope(m, p0, p1, r, verts=6, name="Rope"):
    """Cylinder from p0 to p1."""
    a = Vector(P(p0[0], p0[1], p0[2]))
    b = Vector(P(p1[0], p1[1], p1[2]))
    d = b - a
    ob = cyl(nm(name), DECOR, r, d.length, (a + b) / 2, M[m], verts=verts)
    ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return ob


def lerp3(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def line(p0, p1, sag, r=0.015):
    """A sagging rope in two spans; returns its lowest point."""
    mid = lerp3(p0, p1, 0.5)
    mid = (mid[0], mid[1] - sag, mid[2])
    rope("rope", p0, mid, r, 4)
    rope("rope", mid, p1, r, 4)
    return mid


def gable(xa, xb, z0, z1, y0, y1, m):
    """Triangular gable wall across Z (z0..z1, from y0 up to the ridge y1), from xa to xb."""
    bm = bmesh.new()
    vs = []
    for x in (xa, xb):
        for (z, y) in ((z0, y0), (z1, y0), ((z0 + z1) / 2, y1)):
            vs.append(bm.verts.new(P(x, y, z)))
    bm.faces.new((vs[0], vs[1], vs[2]))
    bm.faces.new((vs[5], vs[4], vs[3]))
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((vs[i], vs[j], vs[j + 3], vs[i + 3]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    name = nm("Gable")
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    DECOR.objects.link(ob)
    ob.data.materials.append(M[m])
    return ob


def flame(x, y, z, s=1.0):
    cyl("L_DecoFire_d%d" % _n[0], DECOR, 0.07 * s, 0.22 * s, P(x, y, z), M["fire"], verts=6, radius_top=0.01)
    _n[0] += 1


def torch(x, y, z, ox, oz):
    """A torch on a wall: its foot at (x, y, z), leaning out along (ox, oz)."""
    top = (x + ox * 0.25, y + 0.55, z + oz * 0.25)
    rope("wood", (x, y, z), top, 0.04, 5)
    cyl(nm("TorchHead"), DECOR, 0.07, 0.14, P(top[0], top[1] + 0.05, top[2]), M["char"], verts=6)
    flame(top[0], top[1] + 0.22, top[2], 1.3)


def skull(x, y, z, s=1.0):
    sphere(nm("Skull"), DECOR, 0.13 * s, P(x, y, z), M["bone"], scale=(1, 1.15, 0.95))
    B("Jaw", x - 0.06 * s, x + 0.06 * s, y - 0.16 * s, y - 0.09 * s, z - 0.06 * s, z + 0.06 * s, "bone")


def flag(x0, x1, y0, y1, z):
    """A black flag in the X-Y plane with a skull and crossbones on both faces."""
    B("Flag", x0, x1, y0, y1, z - 0.02, z + 0.02, "flag", rot=(0, 0, 0))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + 0.08
    for side in (-1, 1):
        zz = z + side * 0.03
        sphere(nm("FlagSkull"), DECOR, 0.16, P(cx, cy + 0.06, zz), M["bone"], scale=(1, 0.2, 1.05))
        beam("bone", (cx - 0.3, cy - 0.3, zz), (cx + 0.3, cy - 0.05, zz), 0.02, 0.06)
        beam("bone", (cx - 0.3, cy - 0.05, zz), (cx + 0.3, cy - 0.3, zz), 0.02, 0.06)


# ---------------------------------------------------------------- houses
T = 0.3  # wall thickness (port.py)


def fpt(H, side, a, y, o):
    """Point on the outer face of a house wall: a along the wall, y up, o out of it (negative: in)."""
    x0, x1, z0, z1 = H
    if side == "n":
        return (a, y, z0 - o)
    if side == "s":
        return (a, y, z1 + o)
    if side == "w":
        return (x0 - o, y, a)
    return (x1 + o, y, a)


def fbox(H, side, a, b, y0, y1, o0, o1, m, tilt=0):
    """Box on a wall face: a..b along it, y0..y1 up, o0..o1 out of it."""
    x0, x1, z0, z1 = H
    if side == "n":
        return B("Face", a, b, y0, y1, z0 - o1, z0 - o0, m, rot=(0, tilt, 0))
    if side == "s":
        return B("Face", a, b, y0, y1, z1 + o0, z1 + o1, m, rot=(0, tilt, 0))
    if side == "w":
        return B("Face", x0 - o1, x0 - o0, y0, y1, a, b, m, rot=(tilt, 0, 0))
    return B("Face", x1 + o0, x1 + o1, y0, y1, a, b, m, rot=(tilt, 0, 0))


def fbeam(H, side, a0, y0, a1, y1, o, m):
    return beam(m, fpt(H, side, a0, y0, o), fpt(H, side, a1, y1, o), 0.06, 0.14)


def framing(H, side, h, holes, plinth=True):
    """Half-timbering on one outer wall: stone plinth, sill and top plates, corner posts, studs and
    braces, all clear of the openings (holes: (lo, hi) along the wall)."""
    x0, x1, z0, z1 = H
    a0, a1 = (x0, x1) if side in ("n", "s") else (z0, z1)
    segs = [(a0 - 0.08, a1 + 0.08)]
    for (lo, hi, top) in holes:
        if top < 1.0:  # a door: plinth and sill stop at it
            out = []
            for (s0, s1) in segs:
                if s1 <= lo or s0 >= hi:
                    out.append((s0, s1))
                else:
                    if s0 < lo:
                        out.append((s0, lo))
                    if s1 > hi:
                        out.append((hi, s1))
            segs = out
    for (s0, s1) in segs:
        if plinth:
            fbox(H, side, s0, s1, 0, 0.5, 0, 0.08, "stone")
        fbox(H, side, s0, s1, 0.5, 0.66, 0, 0.06, "wood")
    fbox(H, side, a0 - 0.05, a1 + 0.05, h - 0.22, h, 0, 0.07, "wood")
    fbox(H, side, a0 - 0.08, a0 + 0.16, 0, h, 0, 0.09, "wood")
    fbox(H, side, a1 - 0.16, a1 + 0.08, 0, h, 0, 0.09, "wood")
    n = max(2, int((a1 - a0) / 1.3))
    studs = [a0 + 0.08]
    for k in range(1, n):
        s = a0 + (a1 - a0) * k / n
        clear = True
        for (lo, hi, top) in holes:
            if lo - 0.25 < s < hi + 0.25:
                clear = False
        if clear:
            fbox(H, side, s - 0.08, s + 0.08, 0.66, h - 0.22, 0, 0.06, "wood")
            studs.append(s)
    studs.append(a1 - 0.08)
    # braces in the end panels when no opening is in them
    for (p, q) in ((studs[0], studs[1]), (studs[-1], studs[-2])):
        clear = True
        for (lo, hi, top) in holes:
            if min(p, q) - 0.1 < hi and max(p, q) + 0.1 > lo:
                clear = False
        if clear and abs(q - p) > 0.6:
            fbeam(H, side, p, 0.7, q, h - 0.26, 0.03, "wood")
    # a rail at mid height on the walls without openings
    if not holes:
        fbox(H, side, a0, a1, 1.45, 1.57, 0, 0.05, "wood")


def window(H, side, mid, y0=1.1, y1=2.0, glass=False, askew=0):
    fbox(H, side, mid - 0.72, mid - 0.6, y0 - 0.1, y1 + 0.1, 0, 0.08, "wood")
    fbox(H, side, mid + 0.6, mid + 0.72, y0 - 0.1, y1 + 0.1, 0, 0.08, "wood")
    fbox(H, side, mid - 0.75, mid + 0.75, y1, y1 + 0.13, 0, 0.09, "wood")
    fbox(H, side, mid - 0.78, mid + 0.78, y0 - 0.12, y0, 0, 0.2, "wood")
    fbox(H, side, mid - 1.32, mid - 0.74, y0, y1, 0.08, 0.12, "shutter")
    fbox(H, side, mid + 0.74, mid + 1.32, y0 - askew * 0.01, y1 - askew * 0.01, 0.08, 0.12, "shutter", tilt=askew)
    if glass:
        fbox(H, side, mid - 0.6, mid + 0.6, y0, y1, 0.04, 0.06, "glow")
        fbox(H, side, mid - 0.03, mid + 0.03, y0, y1, 0.06, 0.09, "wood")
        fbox(H, side, mid - 0.6, mid + 0.6, (y0 + y1) / 2 - 0.03, (y0 + y1) / 2 + 0.03, 0.06, 0.09, "wood")


def doorway(H, side, mid, h=2.4):
    fbox(H, side, mid - 0.94, mid - 0.8, 0, h + 0.1, 0, 0.09, "wood")
    fbox(H, side, mid + 0.8, mid + 0.94, 0, h + 0.1, 0, 0.09, "wood")
    fbox(H, side, mid - 0.98, mid + 0.98, h, h + 0.24, 0, 0.11, "wood")
    fbox(H, side, mid - 0.9, mid + 0.9, 0, 0.05, 0, 0.4, "stone")


def pitched(xa, xb, z0, z1, eave, gables, chimney=None):
    """A thatched gable roof along X over z0..z1 (eaves 0.45 m out), on the house's flat roof slab."""
    cz = (z0 + z1) / 2
    ridge = eave + (z1 - z0) / 2 * 0.62 + 0.25
    for ze in (z0 - 0.45, z1 + 0.45):
        beam("thatch", ((xa + xb) / 2, eave - 0.05, ze), ((xa + xb) / 2, ridge, cz), xb - xa, 0.24, "RoofSlope")
        # a fringe of loose thatch along the eaves
        B("Eave", xa, xb, eave - 0.2, eave - 0.02, ze - 0.06, ze + 0.06, "thatch")
    B("Ridge", xa - 0.1, xb + 0.1, ridge - 0.02, ridge + 0.2, cz - 0.16, cz + 0.16, "wood")
    for (gx, out) in gables:
        gable(gx, gx + 0.25 * out, z0, z1, eave, ridge - 0.05, "plaster")
        # a king post and a collar beam on the gable, a little out of it
        px = gx + 0.27 * out if out > 0 else gx + 0.25 * out - 0.02
        B("KingPost", px - 0.03, px + 0.03, eave, ridge - 0.15, cz - 0.08, cz + 0.08, "wood")
        B("Collar", px - 0.03, px + 0.03, eave + 0.05, eave + 0.17, z0 + 0.1, z1 - 0.1, "wood")
    if chimney is not None:
        x, z = chimney
        B("Chimney", x - 0.35, x + 0.35, eave - 0.2, ridge + 0.75, z - 0.35, z + 0.35, "stone")
        B("ChimneyCap", x - 0.43, x + 0.43, ridge + 0.75, ridge + 0.88, z - 0.43, z + 0.43, "stone")
        B("ChimneyHole", x - 0.22, x + 0.22, ridge + 0.82, ridge + 0.9, z - 0.22, z + 0.22, "dark")
    return ridge


def shelf(H, side, mid, y=1.6):
    fbox(H, side, mid - 1.0, mid + 1.0, y - 0.05, y, -T - 0.28, -T, "plank")
    for k in (-0.7, 0.7):
        fbox(H, side, mid + k - 0.03, mid + k + 0.03, y - 0.3, y - 0.05, -T - 0.2, -T, "wood")
    for k in range(5):
        a = mid - 0.8 + k * 0.38 + random.uniform(-0.05, 0.05)
        p = fpt(H, side, a, y, -T - 0.14)
        if k % 2:
            cyl(nm("Jar"), DECOR, 0.09, 0.22, P(p[0], y + 0.11, p[2]), M["plaster"], verts=7, radius_top=0.06)
        else:
            cyl(nm("ShelfBottle"), DECOR, 0.05, 0.22, P(p[0], y + 0.11, p[2]), M["weed"], verts=6)


def house(cx, cz, w, d, h, door, roof, chimney=False, poster=False):
    x0, x1, z0, z1 = cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2
    H = (x0, x1, z0, z1)
    opp = {"n": "s", "s": "n", "e": "w", "w": "e"}[door]
    for side in ("n", "s", "e", "w"):
        a0, a1 = (x0, x1) if side in ("n", "s") else (z0, z1)
        mid = (a0 + a1) / 2
        holes = []
        if side == door:
            holes.append((mid - 0.8, mid + 0.8, 0))
        if side == opp:
            holes.append((mid - 0.6, mid + 0.6, 1.1))
        framing(H, side, h, holes)
        if side == door:
            doorway(H, side, mid)
        if side == opp:
            window(H, side, mid, askew=random.choice((0, 9, -12)))
    # inside: a shelf on the first plain wall
    plain = [s for s in ("n", "e", "s", "w") if s != door and s != opp]
    sa0, sa1 = (x0, x1) if plain[0] in ("n", "s") else (z0, z1)
    shelf(H, plain[0], (sa0 + sa1) / 2)
    if poster:
        side = plain[1]
        pa0, pa1 = (x0, x1) if side in ("n", "s") else (z0, z1)
        pm = (pa0 + pa1) / 2
        fbox(H, side, pm + 0.3, pm + 0.72, 1.3, 1.85, 0.06, 0.075, "paper", tilt=4)
        fbox(H, side, pm - 0.9, pm - 0.5, 1.4, 1.9, 0.06, 0.075, "paper", tilt=-6)
    eave = h + 0.3
    if roof == "full":
        pitched(x0 - 0.45, x1 + 0.45, z0, z1, eave, ((x0, 1), (x1, -1)),
                (x1 - 1.1, cz + 0.9) if chimney else None)
    elif roof == "half":
        # the west half keeps its roof, the east half shows its broken rafters
        ridge = pitched(x0 - 0.45, cx + 0.2, z0, z1, eave, ((x0, 1),))
        x = cx + 0.7
        k = 0
        while x < x1:
            for (ze, f) in ((z0 - 0.3, (1.0, 0.5, 0.8, 0.3)[k % 4]), (z1 + 0.3, (0.4, 0.9, 0.25, 0.7)[k % 4])):
                end = lerp3((x, eave - 0.1, ze), (x, ridge - 0.1, cz), f)
                beam("wood", (x, eave - 0.1, ze), end, 0.12, 0.14, "Rafter")
            x += 0.95
            k += 1
        beam("char", (cx + 0.2, ridge, cz), (cx + 2.2, ridge - 1.1, cz + 0.4), 0.16, 0.16, "BrokenRidge")
    else:
        # roofless: jagged wall tops and charred beams
        for side in ("n", "s", "e", "w"):
            a0, a1 = (x0, x1) if side in ("n", "s") else (z0, z1)
            a = a0 + random.uniform(0.2, 0.8)
            while a < a1 - 0.6:
                ln = random.uniform(0.5, 1.6)
                fbox(H, side, a, min(a + ln, a1 - 0.05), h, h + random.uniform(0.15, 0.7), -T, 0, "plaster")
                a += ln + random.uniform(0.4, 1.4)
        beam("char", (x0 + 1.6, h + 0.08, z0 + 0.05), (x0 + 1.6, h + 0.08, z1 - 0.05), 0.2, 0.2, "CharBeam")
        beam("char", (x1 - 2.2, h + 0.1, z0 + 0.05), (x1 - 2.6, h - 0.1, z1 - 0.05), 0.18, 0.18, "CharBeam")
        beam("char", (x0 + 0.45, h - 0.2, z0 + 0.45), (x0 + 2.8, 0.15, z0 + 0.45), 0.18, 0.18, "FallenBeam")
        B("Soot", x0 + T, x1 - T, h - 0.9, h - 0.02, z0 + T, z0 + T + 0.02, "char")


house(-18, -14, 8, 6, 3.4, "e", "half", poster=True)
house(-4, -25, 7, 6, 3.2, "s", "full", chimney=True)
house(28, -8, 7, 6, 3.0, "w", "none", poster=True)
house(-30, -2, 6, 6, 3.2, "e", "full", chimney=True)

# ---------------------------------------------------------------- the tavern
TH = (9, 19, -26, -18)
framing(TH, "s", 3.6, [(13.2, 14.8, 0), (10.4, 11.6, 1.2), (16.4, 17.6, 1.2)])
framing(TH, "e", 3.6, [(-24.1, -22.9, 1.2), (-21.1, -19.9, 1.2)])
framing(TH, "n", 3.6, [(11.4, 12.6, 1.2), (15.4, 16.6, 1.2)])
doorway(TH, "s", 14.0)
for wx in (11, 17):
    window(TH, "s", wx, 1.2, 2.1, glass=True)
for wz in (-23.5, -20.5):
    window(TH, "e", wz, 1.2, 2.1, glass=True)
for wx in (12, 16):
    window(TH, "n", wx, 1.2, 2.1, glass=True)
# an awning over the door on two brackets
beam("plank", (14, 3.05, -17.98), (14, 2.7, -16.8), 2.6, 0.07, "Awning")
for bx in (12.9, 15.1):
    beam("wood", (bx, 2.15, -17.98), (bx, 2.85, -16.95), 0.08, 0.08, "Bracket")
# a hanging sign on an iron arm, out of reach above the street
fbox(TH, "s", 11.96, 12.04, 3.0, 3.08, 0, 1.15, "iron")
beam("iron", (12, 2.5, -17.98), (12, 3.0, -17.2), 0.04, 0.04, "SignStrut")
for zz in (-17.4, -16.95):
    B("SignChain", 11.99, 12.01, 2.85, 3.0, zz - 0.01, zz + 0.01, "iron")
B("SignBoard", 11.97, 12.03, 2.3, 2.85, -17.55, -16.8, "wood")
sphere(nm("SignMug"), DECOR, 0.13, P(12, 2.58, -17.18), M["gold"], scale=(0.4, 1, 1))
# wooden coping on the terrace parapets, and the crew's flag on the roof
for (a, b, c, d) in ((9, 19, -18.3, -17.95), (9, 19, -26.05, -25.7), (18.7, 19.05, -25.7, -18.3), (8.95, 9.3, -23.4, -18.3)):
    B("Coping", a, b, 4.7, 4.78, c, d, "wood")
cyl(nm("FlagPole"), DECOR, 0.07, 6.6, P(18.45, 3.9 + 3.3, -25.4), M["wood"], verts=7)
sphere(nm("PoleKnob"), DECOR, 0.1, P(18.45, 10.55, -25.4), M["gold"])
flag(18.52, 20.3, 9.1, 10.2, -25.4)

# ---------------------------------------------------------------- laundry lines between the houses
for (p0, p1) in (((-14.0, 3.3, -17.0), (-7.5, 3.1, -22.0)), ((-27.0, 3.1, -5.0), (-22.0, 3.3, -11.0)),
                 ((24.5, 2.95, -11.0), (19.0, 3.6, -18.0))):
    mid = line(p0, p1, 0.35)
    dx, dz = p1[0] - p0[0], p1[2] - p0[2]
    ln = math.hypot(dx, dz)
    dx, dz = dx / ln, dz / ln
    for k, t in enumerate((0.22, 0.36, 0.5, 0.64, 0.8)):
        q = lerp3(p0, mid, t * 2) if t <= 0.5 else lerp3(mid, p1, t * 2 - 1)
        wdt = random.uniform(0.35, 0.6)
        hgt = random.uniform(0.35, 0.6)
        beam(("red", "linen", "blue", "linen", "red")[k], (q[0] - dx * wdt / 2, q[1] - 0.03 - hgt / 2, q[2] - dz * wdt / 2),
             (q[0] + dx * wdt / 2, q[1] - 0.03 - hgt / 2, q[2] + dz * wdt / 2), 0.02, hgt, "Cloth")

# ---------------------------------------------------------------- the well, the stalls, the beach
for zs in (-16.95, -15.05):
    beam("thatch", (-6, 2.72, zs), (-6, 3.25, -16), 2.3, 0.08, "WellRoof")
rope("rope", (-6, 2.5, -16), (-6, 1.35, -16), 0.015, 4)
cyl(nm("Bucket"), DECOR, 0.15, 0.26, P(-6, 1.2, -16), M["wood"], verts=8, radius_top=0.17)
B("WellCrank", -5.2, -4.9, 2.55, 2.6, -16.03, -15.97, "iron")
cyl(nm("WellRim"), DECOR, 1.05, 0.12, P(-6, 0.92, -16), M["stone"], verts=10)

for (sx, sz, kind) in ((2, -10, 0), (-10, -2, 1), (8, 2, 2)):
    top = 0.9
    if kind == 0:  # fruit
        for bx in (-0.65, 0.05):
            cyl(nm("Basket"), DECOR, 0.28, 0.22, P(sx + bx, top + 0.11, sz), M["rope"], verts=8, radius_top=0.33)
            for k in range(5):
                sphere(nm("Fruit"), DECOR, 0.08, P(sx + bx + random.uniform(-0.15, 0.15), top + 0.25, sz + random.uniform(-0.15, 0.15)), M["fruit"])
        cyl(nm("Keglet"), DECOR, 0.2, 0.45, P(sx + 0.75, top + 0.22, sz), M["wood"], verts=8)
    elif kind == 1:  # fish
        B("FishBoard", sx - 1.0, sx + 0.6, top, top + 0.04, sz - 0.4, sz + 0.4, "plank")
        for k in range(6):
            sphere(nm("FishLaid"), DECOR, 0.12, P(sx - 0.8 + k * 0.25, top + 0.07, sz + random.uniform(-0.15, 0.15)), M["fish"], scale=(0.6, 2.2, 0.4))
        B("Scale", sx + 0.7, sx + 1.0, top, top + 0.3, sz - 0.15, sz + 0.15, "iron")
    else:  # rum and rope
        for k in range(5):
            cyl(nm("RumBottle"), DECOR, 0.06, 0.26, P(sx - 0.9 + k * 0.2, top + 0.13, sz - 0.2), M["weed"], verts=6)
        cyl(nm("StallRope"), DECOR, 0.3, 0.14, P(sx + 0.5, top + 0.07, sz + 0.1), M["rope"], verts=10)
    # goods hanging from the awning's front edge, above head height
    for k in range(3):
        rope("rope", (sx - 0.8 + k * 0.8, 2.32, sz - 0.9), (sx - 0.8 + k * 0.8, 2.12, sz - 0.9), 0.01, 4)
        sphere(nm("Hanging"), DECOR, 0.1, P(sx - 0.8 + k * 0.8, 2.02, sz - 0.9), M["fish" if kind == 1 else "linen"], scale=(0.5, 0.5, 1.4))

# the upside-down boat: a keel and ribs; the broken mast rounded, its torn sail in the sand
B("Keel", -14.3, -8.7, 0.8, 0.92, 7.33, 7.47, "wood")
for bx in (-13, -11.5, -10):
    B("Rib", bx - 0.05, bx + 0.05, 0.05, 0.84, 6.45, 8.35, "wood")
rope("wood", (0, 0.3, 9.5), (9, 0.3, 9.5), 0.33, 8)
B("TornSail", 2.5, 6.5, 0.0, 0.03, 9.9, 11.6, "canvas", rot=(0, 0, 6))
rope("wood", (5, 0.12, 9.9), (7.5, 0.12, 12.5), 0.1, 6)

# the quay: planking on its faces
for y in (0.05, 0.33, 0.61):
    B("QuayFront", -34, 14, y, y + 0.22, 18.0, 18.06, "plank")
for (a, b) in ((-34, -26), (-20, -2), (4, 14)):
    B("QuayBack", a, b, 0.5, 0.8, 11.94, 12.0, "plank")
B("QuayEnd", -34.06, -34, 0, 0.8, 12, 18, "plank")
B("QuayEnd", 14, 14.06, 0, 0.8, 12, 18, "plank")

# the piers: X braces between their posts, stringers under the deck, ropes to the moored boats
for (px0, px1) in ((-24, -21), (4, 7)):
    for z in range(19, 38, 3):
        beam("wood", (px0 + 0.2, -0.3, z), (px1 - 0.2, 0.7, z), 0.08, 0.14, "Brace")
        beam("wood", (px0 + 0.2, 0.7, z), (px1 - 0.2, -0.3, z), 0.08, 0.14, "Brace")
    for x in (px0 + 0.15, px1 - 0.15):
        B("Stringer", x - 0.1, x + 0.1, 0.55, 0.78, 18, 38, "wood")


def boat(x, z, y=0.42):
    """A rowing boat afloat, along Z."""
    B("BoatBottom", x - 0.45, x + 0.45, y - 0.25, y - 0.1, z - 1.5, z + 1.5, "hull")
    for s in (-1, 1):
        B("BoatSide", x + s * 0.55 - 0.06, x + s * 0.55 + 0.06, y - 0.22, y + 0.3, z - 1.5, z + 1.6, "hull", rot=(0, s * 8, 0))
        B("BoatRail", x + s * 0.6 - 0.05, x + s * 0.6 + 0.05, y + 0.28, y + 0.34, z - 1.5, z + 1.6, "wood")
    B("Transom", x - 0.6, x + 0.6, y - 0.22, y + 0.32, z + 1.55, z + 1.65, "hull")
    B("BoatBow", x - 0.42, x + 0.42, y - 0.2, y + 0.34, z - 1.95, z - 1.35, "hull", rot=(0, 0, 45))
    for zz in (z - 0.5, z + 0.7):
        B("Thwart", x - 0.55, x + 0.55, y + 0.08, y + 0.14, zz - 0.15, zz + 0.15, "plank")
    beam("wood", (x - 0.9, y + 0.3, z + 0.1), (x + 0.6, y + 0.18, z - 0.6), 0.06, 0.05, "Oar")
    B("OarBlade", x - 1.25, x - 0.85, y + 0.28, y + 0.32, z + 0.05, z + 0.3, "wood")


boat(-26.6, 34.5)
line((-26.6, 0.75, 32.6), (-23.8, 1.0, 31.0), 0.25, 0.02)
boat(9.7, 33.2)
line((9.7, 0.75, 31.3), (6.8, 1.0, 31.0), 0.25, 0.02)
boat(-9.0, 36.5)

# buoys out in the deep water
for (x, z) in ((-32, 36), (17, 41), (-3, 44), (34, 34)):
    cyl(nm("Buoy"), DECOR, 0.32, 0.8, P(x, 0.4, z), M["red"], verts=8, radius_top=0.22)
    cyl(nm("BuoyBand"), DECOR, 0.3, 0.15, P(x, 0.55, z), M["linen"], verts=8)
    rope("iron", (x, 0.8, z), (x, 1.6, z), 0.03, 4)

# ---------------------------------------------------------------- the galleon
GX0, GX1, GZ0, GZ1, DECK, TOP = 16, 38, 16, 24, 4.0, 6.6
# wales and a weedy waterline along the hull
for y in (1.1, 2.05, 3.35):
    B("Wale", GX0, GX1, y, y + 0.15, GZ1, GZ1 + 0.1, "wood")
    B("Wale", GX0, 28.3, y, y + 0.15, GZ0 - 0.1, GZ0, "wood")
B("Waterline", GX0, GX1, 0, 0.6, GZ1, GZ1 + 0.06, "weed")
B("Waterline", 12.9, GX0, 0, 0.55, 22.8, 22.86, "weed")
# gunports with their lids raised and a cannon's muzzle in each
for (x, face) in ((18.5, 1), (21.5, 1), (24.5, 1), (27.5, 1), (30.5, 1), (34.5, 1), (18.5, -1), (21.5, -1), (24.5, -1)):
    zf = GZ1 if face > 0 else GZ0
    B("Gunport", x - 0.36, x + 0.36, 2.3, 2.95, min(zf, zf + face * 0.04), max(zf, zf + face * 0.04), "dark")
    beam("hull", (x, 2.98, zf + face * 0.03), (x, 3.3, zf + face * 0.6), 0.78, 0.06, "PortLid")
    rope("iron", (x, 2.6, zf - face * 0.1), (x, 2.6, zf + face * 0.75), 0.12, 8)
# a hole in the seaward side, its planks broken outwards
B("Breach", 29.2, 30.8, 0.75, 1.85, GZ1, GZ1 + 0.03, "dark")
for k in range(4):
    beam("hull", (29.2 + k * 0.45, 1.85 - k * 0.1, GZ1 + 0.02), (29.4 + k * 0.4, 1.2, GZ1 + 0.35), 0.06, 0.18, "BrokenPlank")
# the stern: windows lit from inside, a gallery, gilding, the rudder and a big stern lantern
for z in (18.0, 20.0, 22.0):
    B("SternWindow", GX1, GX1 + 0.05, 4.7, 5.6, z - 0.45, z + 0.45, "glow")
    B("SternMullion", GX1 + 0.05, GX1 + 0.09, 4.7, 5.6, z - 0.03, z + 0.03, "wood")
    B("SternFrame", GX1, GX1 + 0.1, 4.6, 4.7, z - 0.5, z + 0.5, "wood")
    B("SternFrame", GX1, GX1 + 0.1, 5.6, 5.7, z - 0.5, z + 0.5, "wood")
B("Gallery", GX1, GX1 + 0.55, 4.3, 4.5, 16.6, 23.4, "wood")
B("GalleryRoof", GX1, GX1 + 0.55, 5.85, 6.0, 16.6, 23.4, "wood")
for z in (16.7, 19.0, 21.0, 23.3):
    B("GalleryPost", GX1 + 0.45, GX1 + 0.55, 4.5, 5.85, z - 0.05, z + 0.05, "wood")
B("Gilding", GX1, GX1 + 0.08, 6.22, 6.42, 16.2, 23.8, "gold")
B("Rudder", GX1, GX1 + 0.45, 0, 3.4, 19.85, 20.15, "hull")
for y in (0.8, 1.8, 2.8):
    B("Pintle", GX1 - 0.05, GX1 + 0.48, y, y + 0.1, 19.82, 20.18, "iron")
beam("iron", (GX1 - 0.1, 7.3, 20), (GX1 + 0.5, 7.7, 20), 0.06, 0.06, "LanternArm")
cyl(nm("SternLantern"), DECOR, 0.24, 0.6, P(GX1 + 0.55, 7.35, 20), M["glow"], verts=8)
cyl(nm("SternLanternCap"), DECOR, 0.3, 0.2, P(GX1 + 0.55, 7.75, 20), M["iron"], verts=8, radius_top=0.05)
# the figurehead under the bowsprit
beam("bone", (11.6, 2.4, 20), (11.0, 3.6, 20), 0.36, 0.3, "Figurehead")
sphere(nm("FigureheadHead"), DECOR, 0.24, P(10.85, 3.95, 20), M["bone"], scale=(1, 0.9, 1.1))
beam("gold", (11.3, 3.2, 19.75), (10.9, 3.5, 19.5), 0.08, 0.08, "FigureheadArm")
beam("gold", (11.3, 3.2, 20.25), (10.9, 3.5, 20.5), 0.08, 0.08, "FigureheadArm")
# the anchor hanging off the seaward bow
B("AnchorShank", 16.9, 17.1, 1.0, 3.2, 24.12, 24.3, "iron")
B("AnchorStock", 16.4, 17.6, 2.95, 3.1, 24.12, 24.3, "iron")
beam("iron", (17, 1.0, 24.21), (16.35, 1.7, 24.21), 0.14, 0.12, "AnchorArm")
beam("iron", (17, 1.0, 24.21), (17.65, 1.7, 24.21), 0.14, 0.12, "AnchorArm")
rope("iron", (17, 3.2, 24.21), (17.3, 3.95, 24.05), 0.05, 5)
# deck: hatch grating, belaying rail, coils
B("Hatch", 23.1, 25.1, DECK, DECK + 0.08, 18.8, 21.2, "wood")
for k in range(5):
    B("Grating", 23.2 + k * 0.4, 23.28 + k * 0.4, DECK + 0.08, DECK + 0.1, 18.9, 21.1, "dark")
B("PinRail", GX0 + 0.3, 27.5, DECK + 0.8, DECK + 0.9, GZ1 - 0.45, GZ1 - 0.25, "wood")
for k in range(10):
    rope("wood", (GX0 + 0.8 + k * 1.1, DECK + 0.65, GZ1 - 0.35), (GX0 + 0.8 + k * 1.1, DECK + 1.05, GZ1 - 0.35), 0.03, 4)
cyl(nm("DeckCoil"), DECOR, 0.36, 0.1, P(30.6, DECK + 0.05, 22.9), M["rope"], verts=10)
cyl(nm("DeckCoil"), DECOR, 0.3, 0.1, P(36.5, TOP + 0.05, 23.0), M["rope"], verts=10)
# masts: top yards, tattered topsails, a crow's nest, shrouds with ratlines, stays and flags
for (mx, mh) in ((20.5, 14), (27, 16)):
    yt = DECK + mh * 0.9
    B("TopYard", mx - 0.12, mx + 0.12, yt, yt + 0.2, 16.5, 23.5, "wood")
    B("TopSail", mx - 0.04, mx + 0.04, DECK + mh * 0.72, yt - 0.05, 16.9, 19.5, "canvas", rot=(4, 0, 0))
    B("TopSail", mx - 0.04, mx + 0.04, DECK + mh * 0.76, yt - 0.05, 20.5, 23.1, "canvas", rot=(-3, 0, 0))
    ytop = DECK + mh * 0.68
    for zb in (GZ0 + 0.12, GZ1 - 0.12):
        zt = 20 - 0.25 if zb < 20 else 20 + 0.25
        feet = []
        for dx in (-1.3, 0.0, 1.3):
            rope("rope", (mx + dx, DECK + 1.0, zb), (mx, ytop, zt), 0.03, 4, "Shroud")
            feet.append((mx + dx, DECK + 1.0, zb))
        for k in range(1, 14):
            t = k / 14
            a = lerp3(feet[0], (mx, ytop, zt), t)
            b = lerp3(feet[2], (mx, ytop, zt), t)
            rope("rope", a, b, 0.015, 3, "Ratline")
cyl(nm("CrowsNest"), DECOR, 0.85, 0.75, P(27, DECK + 16 * 0.8 + 0.3, 20), M["wood"], verts=10)
cyl(nm("CrowsFloor"), DECOR, 1.0, 0.12, P(27, DECK + 16 * 0.8 - 0.1, 20), M["wood"], verts=10)
rope("rope", (8.2, 4.9, 20), (20.5, 4 + 14 * 0.95, 20), 0.035, 4, "Stay")
rope("rope", (27, 4 + 16 * 0.95, 20), (20.5, 5.0, 20), 0.035, 4, "Stay")
for zs in (16.3, 23.7):
    rope("rope", (27, 4 + 16 * 0.9, 20), (37.6, 7.4, zs), 0.03, 4, "Backstay")
cyl(nm("FlagStaff"), DECOR, 0.05, 1.8, P(27, 4 + 16 + 0.9, 20), M["wood"], verts=6)
flag(27.06, 28.7, 20.8, 21.75, 20)
B("Pennant", 20.55, 22.8, 4 + 14 + 0.1, 4 + 14 + 0.35, 19.98, 20.02, "red", rot=(0, 3, 0))
cyl(nm("FlagStaff"), DECOR, 0.04, 1.0, P(20.5, 4 + 14 + 0.3, 20), M["wood"], verts=6)

# ---------------------------------------------------------------- the treasure cave
for k in range(16):
    x, z = random.uniform(-39.6, -30.4), random.uniform(-39.6, -32.4)
    ln = random.uniform(0.4, 1.3)
    cyl(nm("Stalactite"), DECOR, 0.01, ln, P(x, 4.0 - ln / 2, z), M["rock"], verts=6, radius_top=random.uniform(0.12, 0.26))
for k in range(5):
    x, z = random.uniform(-32.7, -30.3), random.uniform(-31.7, -28.3)
    cyl(nm("Stalactite"), DECOR, 0.01, 0.35, P(x, 3.0 - 0.175, z), M["rock"], verts=6, radius_top=0.12)
for k in range(45):
    a = random.uniform(0, math.tau)
    r = random.uniform(0.3, 2.2)
    x, z = -36 + math.cos(a) * r, -38.2 + math.sin(a) * r * 0.6
    cyl(nm("Coin"), DECOR, 0.05, 0.012, P(x, 0.01, z), M["gold"], verts=8, rot=(random.uniform(-20, 20), random.uniform(-20, 20), 0))
# an open chest in the corner, brimming
B("Chest2", -33.6, -32.6, 0, 0.55, -39.75, -39.05, "wood")
B("Chest2Band", -33.65, -32.55, 0.4, 0.46, -39.8, -39.0, "iron")
sphere(nm("Chest2Gold"), DECOR, 0.42, P(-33.1, 0.55, -39.4), M["gold"], scale=(1.1, 0.75, 0.35))
B("Chest2Lid", -33.6, -32.6, 0.55, 1.1, -39.98, -39.82, "wood", rot=(-15, 0, 0))
for (x, z) in ((-39.4, -30.5), (-39.5, -37.5), (-30.6, -33.5), (-34.5, -39.6)):
    cyl(nm("Candle"), DECOR, 0.04, 0.22, P(x, 0.11, z), M["bone"], verts=6)
    flame(x, 0.3, z, 0.5)
# a sailor who never left
skull(-40.2, 0.55, -30.6)
beam("bone", (-40.3, 0.15, -30.4), (-39.6, 0.08, -29.6), 0.18, 0.08, "Ribs")
rope("bone", (-39.7, 0.05, -29.8), (-39.0, 0.05, -29.5), 0.03, 4)
rope("bone", (-39.6, 0.05, -29.4), (-38.9, 0.05, -29.0), 0.03, 4)
# a timber frame and torches at the entrance
B("CavePost", -33.0, -32.78, 0, 2.95, -28.35, -28.0, "wood")
B("CavePost", -30.22, -30.0, 0, 2.95, -28.35, -28.0, "wood")
B("CaveLintel", -33.15, -29.85, 2.75, 3.0, -28.4, -27.95, "wood")
torch(-33.25, 1.45, -27.9, 0, 1)
torch(-29.75, 1.45, -27.9, 0, 1)
skull(-31.5, 3.45, -27.86)
beam("bone", (-31.9, 3.15, -27.85), (-31.1, 3.75, -27.85), 0.03, 0.07, "CrossBone")
beam("bone", (-31.9, 3.75, -27.85), (-31.1, 3.15, -27.85), 0.03, 0.07, "CrossBone")

# ---------------------------------------------------------------- the canyon gate
B("GatePost", 8.0, 8.3, 0, 4.6, -42.4, -42.05, "wood")
B("GatePost", 11.7, 12.0, 0, 4.6, -42.4, -42.05, "wood")
B("GateLintel", 7.7, 12.3, 4.3, 4.65, -42.45, -41.95, "wood")
beam("wood", (8.3, 3.4, -42.2), (9.1, 4.3, -42.2), 0.1, 0.14, "GateBrace")
beam("wood", (11.7, 3.4, -42.2), (10.9, 4.3, -42.2), 0.1, 0.14, "GateBrace")
for x in (8.5, 10.0, 11.5):
    cyl(nm("Spike"), DECOR, 0.04, 0.7, P(x, 4.65 + 0.35, -42.2), M["wood"], verts=5, radius_top=0.01)
    skull(x, 5.05, -42.2, 0.9)
torch(8.35, 1.9, -41.95, 0.4, 1)
torch(11.65, 1.9, -41.95, -0.4, 1)
B("Warning", 8.3, 9.3, 2.0, 2.5, -41.95, -41.9, "paper", rot=(0, 5, 0))
# a gibbet cage hanging from the lintel, its prisoner long gone
rope("iron", (10, 4.3, -42.2), (10, 4.0, -42.2), 0.02, 4)
cyl(nm("CageTop"), DECOR, 0.38, 0.06, P(10, 3.98, -42.2), M["iron"], verts=8)
cyl(nm("CageFloor"), DECOR, 0.38, 0.06, P(10, 3.1, -42.2), M["iron"], verts=8)
for k in range(8):
    a = k / 8 * math.tau
    B("CageBar", 10 + math.cos(a) * 0.36 - 0.015, 10 + math.cos(a) * 0.36 + 0.015, 3.1, 3.98,
      -42.2 + math.sin(a) * 0.36 - 0.015, -42.2 + math.sin(a) * 0.36 + 0.015, "iron")
skull(10, 3.3, -42.2, 0.9)

# ---------------------------------------------------------------- the cliffs
# grassy tops, palms and bushes up there, vines hanging down the faces
for (x0, x1, z0, z1) in ((-48, -42, -48, 31), (42, 48, -48, 31), (-48, 8, -48, -42), (12, 48, -48, -42),
                         (6, 8, -58, -48), (12, 14, -58, -48)):
    B("CliffGrass", x0 - 0.15, x1 + 0.15, 9.0, 9.12, z0 - 0.15, z1 + 0.15, "grass")


def palm(x, y0, z, h, lx, lz):
    px, py, pz = x, y0, z
    for i in range(6):
        t = (i + 1) / 6
        nx, ny, nz = x + lx * h * t * t, y0 + h * t, z + lz * h * t * t
        rope("wood", (px, py, pz), (nx, ny, nz), 0.21 - 0.018 * i, 7, "PalmTrunk")
        px, py, pz = nx, ny, nz
    for k in range(8):
        a = k / 8 * math.tau + random.uniform(-0.2, 0.2)
        ln = random.uniform(2.0, 2.9)
        mid = (px + math.cos(a) * ln * 0.5, py + 0.35, pz + math.sin(a) * ln * 0.5)
        end = (px + math.cos(a) * ln, py - 0.7, pz + math.sin(a) * ln)
        beam("leaf", (px, py, pz), mid, 0.6, 0.04, "Frond")
        beam("leaf", mid, end, 0.45, 0.04, "Frond")
    for k in range(3):
        sphere(nm("Coconut"), DECOR, 0.13, P(px + math.cos(k * 2.1) * 0.2, py - 0.2, pz + math.sin(k * 2.1) * 0.2), M["wood"])


def bush(x, y, z, s):
    for k in range(4):
        sphere(nm("Bush"), DECOR, s * random.uniform(0.5, 0.8),
               P(x + random.uniform(-s, s) * 0.6, y + s * 0.3, z + random.uniform(-s, s) * 0.6), M["leaf"],
               scale=(1, 1, random.uniform(0.6, 0.9)))


for z in (-36, -22, -8, 6, 20, 28):
    palm(-45 + random.uniform(-1, 1), 9.1, z, random.uniform(5, 7.5), 0.25, random.uniform(-0.1, 0.1))
for z in (-30, -14, 2, 16, 27):
    palm(45 + random.uniform(-1, 1), 9.1, z, random.uniform(5, 7.5), -0.25, random.uniform(-0.1, 0.1))
for x in (-38, -20, -4, 22, 36):
    palm(x, 9.1, -45 + random.uniform(-1, 1), random.uniform(5, 7.5), random.uniform(-0.1, 0.1), 0.25)
for k in range(40):
    side = k % 4
    if side == 0:
        x, z = random.uniform(-47, -43), random.uniform(-46, 30)
    elif side == 1:
        x, z = random.uniform(43, 47), random.uniform(-46, 30)
    else:
        x, z = random.uniform(-46, 46), random.uniform(-47, -43)
        if 6 < x < 14:
            continue
    bush(x, 9.1, z, random.uniform(0.5, 1.0))

for k in range(70):
    face = k % 4
    ln = random.uniform(2.0, 5.5)
    y0 = 9.0 - ln
    if face == 0:  # west face
        z = random.uniform(-40, 30)
        B("Vine", -42.0, -41.93, y0, 9.05, z - 0.12, z + 0.12, "vine")
        sphere(nm("VineLeaves"), DECOR, 0.3, P(-41.95, y0 + random.uniform(0, ln), z), M["leaf"], scale=(0.3, 1, 1))
    elif face == 1:  # east face
        z = random.uniform(-40, 30)
        B("Vine", 41.93, 42.0, y0, 9.05, z - 0.12, z + 0.12, "vine")
        sphere(nm("VineLeaves"), DECOR, 0.3, P(41.95, y0 + random.uniform(0, ln), z), M["leaf"], scale=(0.3, 1, 1))
    else:  # north faces, either side of the canyon (none behind the cave)
        x = random.uniform(-24, 40)
        if 7 < x < 13:
            continue
        B("Vine", x - 0.12, x + 0.12, y0, 9.05, -42.0, -41.93, "vine")
        sphere(nm("VineLeaves"), DECOR, 0.3, P(x, y0 + random.uniform(0, ln), -41.95), M["leaf"], scale=(1, 0.3, 1))

# nets drying against the west cliff, out of everybody's way
for z in (5.0, 8.0, 11.0):
    B("NetPole", -41.95, -41.75, 0, 2.3, z - 0.08, z + 0.08, "wood")
B("DryingNet", -41.98, -41.94, 0.4, 2.2, 5, 11, "rope")
for k in range(5):
    z = 5.6 + k * 1.1
    sphere(nm("NetFloat"), DECOR, 0.08, P(-41.88, 2.15, z), M["red"])

# ---------------------------------------------------------------- the sea
# boulders and weed round the rocks in the shallows (inside their collision boxes)
for (x, z, s) in ((-36, 24, 1.4), (-10, 27, 1.0), (12, 25, 0.9), (40, 27, 1.6)):
    for k in range(3):
        bs = s * random.uniform(0.55, 0.8)
        bx, bz = x + random.uniform(-s, s) * 0.35, z + random.uniform(-s, s) * 0.35
        B("SeaBoulder", bx - bs, bx + bs, 0, s * 1.2 + random.uniform(-0.2, 0.25), bz - bs, bz + bs,
          "rock" if k else "moss", rot=(random.uniform(-12, 12), random.uniform(-12, 12), random.uniform(0, 90)))
    B("RockWeed", x - s - 0.02, x + s + 0.02, 0.2, 0.55, z - s - 0.02, z + s + 0.02, "weed")
# sea stacks out in the deep water
for (x, z, s, h) in ((-38, 40, 3.0, 7), (31, 45, 4.0, 9), (-14, 50, 2.5, 5), (46, 36, 3.0, 8), (-48, 50, 4, 11)):
    for k in range(4):
        bs = s * (1 - k * 0.2)
        B("SeaStack", x - bs, x + bs, k * h / 4 - 0.5, (k + 1) * h / 4 + 0.3, z - bs, z + bs, "rock",
          rot=(random.uniform(-8, 8), random.uniform(-8, 8), random.uniform(0, 90)))
    B("StackTop", x - s * 0.4, x + s * 0.4, h + 0.25, h + 0.45, z - s * 0.4, z + s * 0.4, "grass", rot=(0, 0, random.uniform(0, 90)))
# an old wreck half sunk beyond the bay
B("WreckHull", -34, -21, -1.2, 2.0, 50, 56, "hull", rot=(10, -6, 18))
B("WreckDeck", -32, -23, 1.6, 1.9, 51, 55, "plank", rot=(10, -6, 18))
for k in range(6):
    x = -31 + k * 1.6
    beam("hull", (x, 0.2, 50.2), (x + 0.4, 3.2, 49.2), 0.25, 0.2, "WreckRib")
rope("wood", (-27, 1.5, 53), (-22, 9, 54.5), 0.28, 7, "WreckMast")
B("WreckYard", -24.5, -23.5, 7.2, 7.4, 51.5, 57, "wood", rot=(0, 25, 10))
B("WreckSail", -24, -23.9, 3.5, 7.0, 53, 56, "canvas", rot=(12, 20, 0))
print("decor objects:", len(DECOR.all_objects))
