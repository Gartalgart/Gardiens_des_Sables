# Export the level collision data (boxes, spawns, braziers, player start) to public/models/level.json.
# The simulation (browser or Node server) reads this instead of parsing level.glb.
# Run inside Blender after changing the Level collection, alongside the level.glb export.
import bpy
import json

coll = bpy.data.collections["Level"]
dg = bpy.context.evaluated_depsgraph_get()
boxes, spawns, braziers, start = [], [], [], None


def to3(v):  # Blender Z-up -> glTF / three.js Y-up
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


for o in coll.all_objects:
    if o.type == 'EMPTY':
        p = to3(o.matrix_world.translation)
        if o.name.startswith("SPAWN_"):
            spawns.append((o.name, p))
        elif o.name.startswith("BRAZIER_"):
            braziers.append((o.name, p))
        elif o.name == "PLAYER_START":
            start = p
        continue
    # same rule as the client: the ground plane and L_Deco* meshes have no collision
    if o.type != 'MESH' or o.name == "Ground" or o.name.startswith("L_Deco"):
        continue
    me = o.evaluated_get(dg).to_mesh()
    ws = [o.matrix_world @ v.co for v in me.vertices]
    o.evaluated_get(dg).to_mesh_clear()
    mn = [min(w.x for w in ws), min(w.z for w in ws), min(-w.y for w in ws)]
    mx = [max(w.x for w in ws), max(w.z for w in ws), max(-w.y for w in ws)]
    boxes.append([round(c, 4) for c in mn + mx])


def key(e):
    return int(e[0].split("_")[1])


data = {
    "boxes": boxes,
    "spawns": [p for _, p in sorted(spawns, key=key)],
    "braziers": [p for _, p in sorted(braziers, key=key)],
    "playerStart": start,
}
path = bpy.path.abspath("//../public/models/level.json")
with open(path, "w") as f:
    json.dump(data, f, separators=(",", ":"))
print("level.json:", len(boxes), "boxes,", len(data["spawns"]), "spawns,", len(data["braziers"]), "braziers")
