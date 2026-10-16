# Phase 7 buildings: houses you can walk into, and a house with a roof terrace reached by outside stairs.
# Usage inside Blender (after helpers.py, inside a script that defines `brazier`-like helpers if needed):
#   exec(open(r"<path>/houses.py").read())
import bpy

T = 0.3  # wall thickness


def _wall_x(name, coll, x0, x1, y, z0, z1, m):
    """wall running along X at y, from x0 to x1, between heights z0 and z1"""
    if x1 - x0 > 0.01 and z1 - z0 > 0.01:
        box(name, coll, (x1 - x0, T, z1 - z0), ((x0 + x1) / 2, y, (z0 + z1) / 2), m)


def _wall_y(name, coll, y0, y1, x, z0, z1, m):
    if y1 - y0 > 0.01 and z1 - z0 > 0.01:
        box(name, coll, (T, y1 - y0, z1 - z0), (x, (y0 + y1) / 2, (z0 + z1) / 2), m)


def interior_house(prefix, coll, cx, cy, w, d, h, door, mat_walls, mat_roof, braz_index):
    """Hollow house: four walls, a door (side '+x' or '-x'), a window in the north wall, a roof
    slab, and some furniture plus a small brazier inside. Returns the brazier position."""
    M = bpy.data.materials
    x0, x1 = cx - w / 2, cx + w / 2
    y0, y1 = cy - d / 2, cy + d / 2
    k = [0]

    def nm(part):
        k[0] += 1
        return "%s_%s_%d" % (prefix, part, k[0])

    door_w, door_h = 1.7, 2.4
    win_w, win_lo, win_hi = 1.1, 1.2, 2.1
    # side walls (along Y): one of them has the door
    for side, x in (("+x", x1 - T / 2), ("-x", x0 + T / 2)):
        if door == side:
            _wall_y(nm("Wall"), coll, y0, cy - door_w / 2, x, 0, h, mat_walls)
            _wall_y(nm("Wall"), coll, cy + door_w / 2, y1, x, 0, h, mat_walls)
            _wall_y(nm("Lintel"), coll, cy - door_w / 2, cy + door_w / 2, x, door_h, h, mat_walls)
        else:
            _wall_y(nm("Wall"), coll, y0, y1, x, 0, h, mat_walls)
    # south wall plain, north wall with a window
    _wall_x(nm("Wall"), coll, x0 + T, x1 - T, y0 + T / 2, 0, h, mat_walls)
    yn = y1 - T / 2
    _wall_x(nm("Wall"), coll, x0 + T, cx - win_w / 2, yn, 0, h, mat_walls)
    _wall_x(nm("Wall"), coll, cx + win_w / 2, x1 - T, yn, 0, h, mat_walls)
    _wall_x(nm("Sill"), coll, cx - win_w / 2, cx + win_w / 2, yn, 0, win_lo, mat_walls)
    _wall_x(nm("Lintel"), coll, cx - win_w / 2, cx + win_w / 2, yn, win_hi, h, mat_walls)
    # roof slab with a small overhang, and a dark frame over the doorway
    box(nm("Roof"), coll, (w + 0.3, d + 0.3, 0.3), (cx, cy, h + 0.15), mat_roof)
    # furniture: table, bench, jars, shelf against the back wall, a rug (deco: no collision)
    back = -1 if door == "+x" else 1  # x direction of the wall opposite the door
    bx = cx + back * (w / 2 - T - 0.45)
    box(nm("Table"), coll, (1.3, 0.8, 0.75), (cx + back * 0.4, cy - 0.6, 0.375), M["Wood"])
    box(nm("Bench"), coll, (1.1, 0.35, 0.42), (cx + back * 0.4, cy - 1.35, 0.21), M["Wood"])
    box(nm("Shelf"), coll, (0.4, 1.6, 1.6), (bx, cy + 0.9, 0.8), M["Wood"])
    for j, (dx, dy) in enumerate(((0.6, 1.6), (-0.4, 1.9), (0.1, -1.9))):
        cyl(nm("Jar"), coll, 0.25, 0.7, (cx + dx * back, cy + dy * (d / 6.5), 0.35), M["Pottery"], verts=8, radius_top=0.15)
    box("L_DecoRug_%s_%d" % (prefix, braz_index), coll, (2.2, 1.6, 0.02), (cx, cy, 0.01), M["Cloth"])
    # small brazier in a corner, its empty marks the light
    bpos = (bx, cy - d / 2 + T + 0.6, 0.0)
    cyl(nm("BrazierStand"), coll, 0.08, 0.7, (bpos[0], bpos[1], 0.35), M["Bronze"], verts=6)
    cyl(nm("BrazierBowl"), coll, 0.3, 0.25, (bpos[0], bpos[1], 0.8), M["Bronze"], verts=8, radius_top=0.4)
    cyl("L_DecoFire_%s" % prefix, coll, 0.26, 0.4, (bpos[0], bpos[1], 1.12), M["Fire"], verts=6, radius_top=0.02)
    empty("BRAZIER_%d" % braz_index, coll, (bpos[0], bpos[1], 1.3))
    return bpos


def terrace_house(prefix, coll, house, roof_top, mat_steps, mat_parapet):
    """Outside stairs along the west wall of a solid house up to its roof, and a parapet around the roof."""
    x0 = house.location.x - house.dimensions.x / 2
    x1 = house.location.x + house.dimensions.x / 2
    y0 = house.location.y - house.dimensions.y / 2
    y1 = house.location.y + house.dimensions.y / 2
    n = int(round(roof_top / 0.45))
    rise = roof_top / n
    depth = min(0.6, (y1 - y0 - 0.2) / n)
    sw = 1.4  # stair width
    for i in range(n):
        hgt = rise * (i + 1)
        y = y0 + 0.1 + depth * (i + 0.5)
        box("%s_Step_%d" % (prefix, i), coll, (sw, depth, hgt), (x0 - sw / 2, y, hgt / 2), mat_steps)
    # parapet (0.7 m) on the roof edge, open where the stairs arrive (north end of the west edge)
    ph, pt = 0.7, 0.25
    z = roof_top + ph / 2
    box("%s_Parapet_N" % prefix, coll, (x1 - x0, pt, ph), ((x0 + x1) / 2, y1 - pt / 2, z), mat_parapet)
    box("%s_Parapet_S" % prefix, coll, (x1 - x0, pt, ph), ((x0 + x1) / 2, y0 + pt / 2, z), mat_parapet)
    box("%s_Parapet_E" % prefix, coll, (pt, y1 - y0 - 2 * pt, ph), (x1 - pt / 2, (y0 + y1) / 2, z), mat_parapet)
    gap = 1.8
    box("%s_Parapet_W" % prefix, coll, (pt, y1 - y0 - 2 * pt - gap, ph), (x0 + pt / 2, (y0 + pt + y1 - pt - gap) / 2, z), mat_parapet)
    return n
