# Animation sets of the enemies, built with add_action() from rig.py.
# Conventions of the rigs (model facing -Y): on limbs pointing down, +X swings them backward and -X
# forward; on the spine and head, +X leans forward. Hips location is in bone space (Y = up).


def mirror(pose):
    """swap left and right bones (for the second half of a gait cycle)"""
    out = {}
    for k, v in pose.items():
        if k.endswith("_L"):
            out[k[:-2] + "_R"] = v
        elif k.endswith("_R"):
            out[k[:-2] + "_L"] = v
        else:
            out[k] = v
    return out


def gait(rig, name, period, thigh, shin, arm, fore, lean, bob, head=0, extra=None):
    """walk / run cycle: left leg forward at 0, right leg forward at half period"""
    a = {
        "Thigh_L": (-thigh, 0, 0), "Shin_L": (shin * 0.3, 0, 0),
        "Thigh_R": (thigh, 0, 0), "Shin_R": (shin, 0, 0),
        "UpperArm_L": (arm, 0, 0), "UpperArm_R": (-arm, 0, 0),
        "ForeArm_L": (-fore, 0, 0), "ForeArm_R": (-fore, 0, 0),
        "Spine": (lean, 0, 0), "Head": (head, 0, 0),
        "_loc_Hips": (0, 0, 0),
    }
    if extra:
        a.update(extra)
    up = dict(a)
    # passing pose: legs and arms through the middle, except limbs held in place by `extra`
    for k in ("Thigh_L", "Thigh_R", "UpperArm_L", "UpperArm_R"):
        up[k] = (extra or {}).get(k, (0, 0, 0))
    up["Shin_L"] = up["Shin_R"] = (shin * 0.6, 0, 0)
    up["_loc_Hips"] = (0, bob, 0)
    keys = [(0, a), (period * 0.25, up), (period * 0.5, mirror(a)), (period * 0.75, mirror(up)), (period, a)]
    return add_action(rig, name, keys)


def biped_actions(rig, p, heavy=False):
    """idle, walk, run, attack, stun, hit for two-legged enemies (jackal, colossus)"""
    k = 0.6 if heavy else 1.0  # the colossus moves its limbs less
    add_action(rig, p + "idle", [
        (0, {"Spine": (3, 0, 0), "Head": (0, 0, 0), "UpperArm_L": (2, 0, 0), "UpperArm_R": (2, 0, 0), "ForeArm_L": (-8, 0, 0), "ForeArm_R": (-8, 0, 0), "_loc_Hips": (0, 0, 0)}),
        (1.0, {"Spine": (6, 0, 0), "Head": (-5, 8, 0), "UpperArm_L": (-3, 0, 0), "UpperArm_R": (-3, 0, 0), "ForeArm_L": (-12, 0, 0), "ForeArm_R": (-12, 0, 0), "_loc_Hips": (0, -0.012, 0)}),
        (2.0, {"Spine": (3, 0, 0), "Head": (0, 0, 0), "UpperArm_L": (2, 0, 0), "UpperArm_R": (2, 0, 0), "ForeArm_L": (-8, 0, 0), "ForeArm_R": (-8, 0, 0), "_loc_Hips": (0, 0, 0)}),
    ])
    gait(rig, p + "walk", 1.0, 26 * k, 22 * k, 22 * k, 18, 6, 0.025)
    gait(rig, p + "run", 0.62 if not heavy else 0.8, 48 * k, 70 * k, 45 * k, 55, 20 if not heavy else 12, 0.05, head=-12)
    # melee: wind up over 0.4 s (the game stretches this part to the attack windup), strike, recover
    raise_ = {"UpperArm_L": (-150 * (0.9 if heavy else 1), 0, 0), "UpperArm_R": (-150 * (0.9 if heavy else 1), 0, 0),
              "ForeArm_L": (-25, 0, 0), "ForeArm_R": (-25, 0, 0), "Spine": (-12, 0, 0), "Head": (-5, 0, 0)}
    strike = {"UpperArm_L": (-35, 0, 0), "UpperArm_R": (-35, 0, 0), "ForeArm_L": (-10, 0, 0), "ForeArm_R": (-10, 0, 0),
              "Spine": (28, 0, 0), "Head": (10, 0, 0), "Thigh_L": (-20, 0, 0), "Shin_L": (25, 0, 0)}
    add_action(rig, p + "attack", [(0, {}), (0.4, raise_), (0.48, strike), (0.75, {"Spine": (8, 0, 0)})], loop=False)
    add_action(rig, p + "stun", [
        (0, {"Spine": (-14, 0, 8), "Head": (-12, 20, 0), "UpperArm_L": (12, 0, 0), "UpperArm_R": (12, 0, 0), "ForeArm_L": (-5, 0, 0), "ForeArm_R": (-5, 0, 0)}),
        (0.5, {"Spine": (-10, 0, -8), "Head": (-6, -20, 0), "UpperArm_L": (8, 0, 0), "UpperArm_R": (8, 0, 0), "ForeArm_L": (-12, 0, 0), "ForeArm_R": (-12, 0, 0)}),
        (1.0, {"Spine": (-14, 0, 8), "Head": (-12, 20, 0), "UpperArm_L": (12, 0, 0), "UpperArm_R": (12, 0, 0), "ForeArm_L": (-5, 0, 0), "ForeArm_R": (-5, 0, 0)}),
    ])
    # hit reaction, played on top of the current animation (additive in the game)
    add_action(rig, p + "hit", [(0, {}), (0.06, {"Spine": (-14, 0, 0), "Head": (-18, 0, 0)}), (0.25, {})], loop=False)


def runner_extra(rig, p):
    # leap: crouch, then fly with knees tucked and claws forward (0.5 s, matched to the leap in the game)
    crouch = {"Thigh_L": (-35, 0, 0), "Thigh_R": (-35, 0, 0), "Shin_L": (65, 0, 0), "Shin_R": (65, 0, 0),
              "Spine": (30, 0, 0), "UpperArm_L": (35, 0, 0), "UpperArm_R": (35, 0, 0), "_loc_Hips": (0, -0.12, 0)}
    fly = {"Thigh_L": (-75, 0, 0), "Thigh_R": (-60, 0, 0), "Shin_L": (100, 0, 0), "Shin_R": (90, 0, 0),
           "Spine": (25, 0, 0), "Head": (-20, 0, 0), "UpperArm_L": (-115, 0, 0), "UpperArm_R": (-115, 0, 0),
           "ForeArm_L": (-15, 0, 0), "ForeArm_R": (-15, 0, 0)}
    add_action(rig, p + "leap", [(0, crouch), (0.12, fly), (0.5, fly)], loop=False)


def tank_extra(rig, p):
    # charge wind-up: head down, pawing the ground with the right foot
    low = {"Spine": (28, 0, 0), "Head": (12, 0, 0), "UpperArm_L": (25, 0, 0), "UpperArm_R": (25, 0, 0),
           "ForeArm_L": (-20, 0, 0), "ForeArm_R": (-20, 0, 0), "_loc_Hips": (0, -0.1, 0)}
    paw = dict(low, **{"Thigh_R": (-30, 0, 0), "Shin_R": (40, 0, 0)})
    back = dict(low, **{"Thigh_R": (25, 0, 0), "Shin_R": (20, 0, 0)})
    add_action(rig, p + "chargeWind", [(0, low), (0.2, paw), (0.4, back), (0.65, low)], loop=False)
    gait(rig, p + "charge", 0.5, 50, 75, 20, 30, 35, 0.06, head=-25,
         extra={"UpperArm_L": (-55, 0, 0), "UpperArm_R": (-55, 0, 0)})


def caster_actions(rig, p, float_amp=0.0, heavy=False):
    """legless enemies (priest, pharaoh): the robe sways, the right arm holds the staff / scepter"""
    a = 0.7 if heavy else 1.0
    bob = lambda d: (0, d, 0)
    add_action(rig, p + "idle", [
        (0, {"Spine": (2, 0, 0), "UpperArm_L": (-4, 0, 0), "ForeArm_L": (-10, 0, 0), "UpperArm_R": (-12, 0, 0), "_loc_Hips": bob(0)}),
        (1.5, {"Spine": (5, 4, 0), "Head": (-4, -8, 0), "UpperArm_L": (2, 0, 0), "ForeArm_L": (-16, 0, 0), "UpperArm_R": (-16, 0, 0), "_loc_Hips": bob(float_amp)}),
        (3.0, {"Spine": (2, 0, 0), "UpperArm_L": (-4, 0, 0), "ForeArm_L": (-10, 0, 0), "UpperArm_R": (-12, 0, 0), "_loc_Hips": bob(0)}),
    ])
    sway = lambda s, d: {"Hips": (6, 0, 4 * s), "Spine": (8, 0, -4 * s), "Head": (-6, 0, 2 * s),
                          "UpperArm_L": (14 * s * a, 0, 0), "ForeArm_L": (-14, 0, 0), "UpperArm_R": (-14, 0, 0), "_loc_Hips": bob(d)}
    add_action(rig, p + "walk", [(0, sway(1, 0)), (0.5, sway(-1, float_amp * 0.5 + 0.02)), (1.0, sway(1, 0))])
    add_action(rig, p + "run", [(0, sway(1, 0)), (0.35, sway(-1, float_amp * 0.5 + 0.04)), (0.7, sway(1, 0))])
    # cast: raise the staff / scepter over the windup, then thrust it at the target
    add_action(rig, p + "cast", [
        (0, {}),
        (0.4, {"UpperArm_R": (-125, 0, 0), "ForeArm_R": (-35, 0, 0), "Spine": (-8, 0, 0), "Head": (-6, 0, 0), "UpperArm_L": (-30, 0, 0)}),
        (0.48, {"UpperArm_R": (-70, 0, 0), "ForeArm_R": (-10, 0, 0), "Spine": (12, 0, 0), "UpperArm_L": (-20, 0, 0)}),
        (0.8, {"UpperArm_R": (-15, 0, 0)}),
    ], loop=False)
    # melee: a swing of the staff / scepter
    add_action(rig, p + "attack", [
        (0, {}),
        (0.4, {"UpperArm_R": (-150, 0, 0), "ForeArm_R": (-20, 0, 0), "Spine": (-12, 0, 0)}),
        (0.48, {"UpperArm_R": (-30, 0, 0), "ForeArm_R": (-5, 0, 0), "Spine": (25, 0, 0), "Head": (8, 0, 0)}),
        (0.75, {"Spine": (6, 0, 0)}),
    ], loop=False)
    add_action(rig, p + "stun", [
        (0, {"Spine": (-12, 0, 8), "Head": (-10, 18, 0), "UpperArm_L": (10, 0, 0), "UpperArm_R": (10, 0, 0)}),
        (0.5, {"Spine": (-8, 0, -8), "Head": (-6, -18, 0), "UpperArm_L": (6, 0, 0), "UpperArm_R": (6, 0, 0)}),
        (1.0, {"Spine": (-12, 0, 8), "Head": (-10, 18, 0), "UpperArm_L": (10, 0, 0), "UpperArm_R": (10, 0, 0)}),
    ])
    add_action(rig, p + "hit", [(0, {}), (0.06, {"Spine": (-12, 0, 0), "Head": (-16, 0, 0)}), (0.25, {})], loop=False)


def boss_extra(rig, p):
    # shockwave: both arms raised over 0.8 s (the slam windup), slammed down, recover
    up = {"UpperArm_L": (-165, 0, 0), "UpperArm_R": (-165, 0, 0), "ForeArm_L": (-20, 0, 0), "ForeArm_R": (-20, 0, 0),
          "Spine": (-14, 0, 0), "Head": (-10, 0, 0), "_loc_Hips": (0, 0.25, 0)}
    down = {"UpperArm_L": (-25, 0, 0), "UpperArm_R": (-25, 0, 0), "ForeArm_L": (-5, 0, 0), "ForeArm_R": (-5, 0, 0),
            "Spine": (32, 0, 0), "Head": (12, 0, 0), "_loc_Hips": (0, -0.3, 0)}
    add_action(rig, p + "slam", [(0, {}), (0.8, up), (0.9, down), (1.4, {"Spine": (6, 0, 0)})], loop=False)


def mummy_actions(rig, p):
    biped_actions(rig, p)
    # shamble with both arms held forward, the classic mummy walk
    arms = {"UpperArm_L": (-80, 0, 0), "UpperArm_R": (-80, 0, 0), "ForeArm_L": (-10, 0, 0), "ForeArm_R": (-10, 0, 0)}
    gait(rig, p + "walk", 1.1, 20, 16, 0, 0, 10, 0.02, head=6, extra=arms)
    gait(rig, p + "run", 0.7, 38, 50, 0, 0, 22, 0.04, head=-8, extra=arms)
    # priming: arms flung wide, back arched — the game makes it shake and glow, then it blows up
    spread = {"UpperArm_L": (-40, 0, 75), "UpperArm_R": (-40, 0, -75), "ForeArm_L": (-20, 0, 0), "ForeArm_R": (-20, 0, 0),
              "Spine": (-22, 0, 0), "Head": (-28, 0, 0), "_loc_Hips": (0, 0.05, 0)}
    add_action(rig, p + "prime", [(0, {}), (0.3, spread), (1.0, spread)], loop=False)


def scarab_actions(rig, p):
    """legs are vertical bones: rotation around Y swings them forward / back (tripod gait)"""
    a = {"Leg_F_L": (0, 28, 0), "Leg_M_R": (0, -28, 0), "Leg_B_L": (0, 28, 0),
         "Leg_F_R": (0, 28, 0), "Leg_M_L": (0, -28, 0), "Leg_B_R": (0, 28, 0), "_loc_Hips": (0, 0, 0)}
    b = {k: (0, -v[1], 0) for k, v in a.items() if k.startswith("Leg")}
    b["_loc_Hips"] = (0, 0.025, 0)
    add_action(rig, p + "run", [(0, a), (0.12, b), (0.24, a)])
    add_action(rig, p + "walk", [(0, a), (0.2, b), (0.4, a)])
    add_action(rig, p + "idle", [(0, {"Hips": (2, 0, 0)}), (0.8, {"Hips": (-3, 0, 0), "Leg_F_L": (0, 8, 0), "Leg_F_R": (0, -8, 0)}), (1.6, {"Hips": (2, 0, 0)})])
    add_action(rig, p + "attack", [(0, {}), (0.4, {"Hips": (-25, 0, 0), "_loc_Hips": (0, 0.06, 0)}), (0.48, {"Hips": (20, 0, 0)}), (0.7, {})], loop=False)
    add_action(rig, p + "stun", [(0, {"Hips": (0, 0, 10)}), (0.3, {"Hips": (0, 0, -10)}), (0.6, {"Hips": (0, 0, 10)})])
    add_action(rig, p + "hit", [(0, {}), (0.05, {"Hips": (-20, 0, 0)}), (0.2, {})], loop=False)


def boss_transform(rig, p):
    """phase 2: the pharaoh rises, arms flung wide, head thrown back (2 s)"""
    wide = {"UpperArm_L": (-150, 0, 40), "UpperArm_R": (-150, 0, -40), "ForeArm_L": (-15, 0, 0), "ForeArm_R": (-15, 0, 0),
            "Spine": (-18, 0, 0), "Head": (-30, 0, 0), "_loc_Hips": (0, 0.45, 0)}
    add_action(rig, p + "transform", [(0, {}), (0.6, wide), (1.6, wide), (2.0, {"_loc_Hips": (0, 0.1, 0)})], loop=False)
