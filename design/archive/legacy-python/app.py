import random, copy, json
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder=".")

# ── ENGINE (inline) ───────────────────────────────────────────
PHASES        = ["build_up","penetration","finishing","pressing","structure","resistance"]
FATIGUE_STEPS = ["Fresh","Tired","Fatigued","Exhausted"]
QUALITY_TIERS = [None,"Half Chance","Good Chance","Big Chance"]
XG_MAP        = {None:0,"Half Chance":0.10,"Good Chance":0.20,"Big Chance":0.35}
COMPETENCE_MODIFIER = {5:1.0,4:0.95,3:0.85,2:0.70,1:0.50,0:0.0}
FATIGUE_TICK_RATE   = {"GK":0.5,"CB":0.5,"LB_RB":1.0,"LWB_RWB":1.0,"DM":1.0,"CM":1.0,"AM":1.0,"LW_RW":1.0,"ST":1.0}
POSITION_WEIGHTS    = {
    "GK":[0.3,0.0,0.0,0.1,0.4,1.0],"CB":[0.5,0.1,0.0,0.3,1.0,0.8],
    "LB_RB":[0.6,0.5,0.1,0.6,0.7,0.6],"DM":[0.8,0.4,0.1,1.0,0.8,0.4],
    "CM":[0.8,0.7,0.2,0.7,0.6,0.3],"AM":[0.5,1.0,0.5,0.4,0.3,0.1],
    "LW_RW":[0.4,0.9,0.4,0.5,0.2,0.1],"ST":[0.2,0.6,1.0,0.6,0.1,0.0],
}
CLASSES_PRIM = {
    "Distributor":"build_up","Passer":"build_up","Dribbler":"penetration","Playmaker":"penetration",
    "Creator":"penetration","Visionary":"build_up","Finisher":"finishing","Clinical":"finishing",
    "Poacher":"finishing","Shooter":"finishing","Aerial":"finishing","Tackler":"pressing",
    "Interceptor":"pressing","Marker":"resistance","Blocker":"resistance","Sweeper":"structure",
    "Athlete":"pressing","Engine":"pressing","Strong":"resistance","Aggressive":"pressing",
    "Anchor":"structure","Roamer":"penetration","Leader":"build_up","Reader":"structure",
    "Risk_Taker":"penetration","Safe":"build_up","Direct":"penetration",
    "Crosser":"penetration","Entertainer":"penetration",
}
RARITY_RANGES = {
    "Common":{"primary":(4,7),"secondary":(2,5)},"Uncommon":{"primary":(6,10),"secondary":(4,8)},
    "Rare":{"primary":(9,13),"secondary":(6,10)},"Legendary":{"primary":(12,16),"secondary":(9,13)},
}
XP_CURVE = {2:200,3:300,4:400,5:500,6:650,7:800,8:950,9:1100,10:1300,
            11:1500,12:1700,13:1900,14:2100,15:2400,16:2700,17:3000,18:3400,19:3800,20:4200}
BASE_XP  = {"started_90":100,"started_sub45":70,"sub_on_45plus":50,"sub_on_sub45":30,
            "unused_sub":15,"not_featured":10}
AGE_CURVE = {(16,20):1.4,(21,26):1.0,(27,30):0.8,(31,33):0.6,(34,99):0.4}
FATIGUE_XP_MOD = {"Fresh":1.0,"Tired":0.85,"Fatigued":0.65,"Exhausted":0.40}
POTENTIAL_TIERS = {"Low":8,"Medium":13,"High":17,"Elite":20}
POTENTIAL_XP_APPROACH = {3:1.0,2:0.8,1:0.5,0:0.0}
TRAIT_UNLOCK_LEVELS = {3,6,9,12,15,18}
CLASS_UNLOCK_LEVELS = {5,10,15}

TRAIT_POOL = {
    "Distributor":["Sprays It Wide","Finds the Pocket","Long Diagonals"],
    "Passer":["Keeps It Simple","One-Touch Passing","Recycling Master"],
    "Dribbler":["Takes On His Man","Silky Close Control","Nutmeg King"],
    "Playmaker":["Unlocks Defences","Sees the Pass First","Dictates the Tempo"],
    "Creator":["Slips the Final Ball","Cuts Through Lines","The Key Pass"],
    "Visionary":["Hollywood Ball","Field Vision","The Switch"],
    "Finisher":["Clinical in Front of Goal","Left Foot Lethal","Composed Under Pressure"],
    "Clinical":["Ice Cold","One Touch Finish","Never Misses Big Chances"],
    "Poacher":["Hangs on the Shoulder","Poachers Touch","Right Place Right Time"],
    "Shooter":["Thunderous Strike","Curls One In","Long Range Specialist"],
    "Aerial":["Wins Everything in the Air","Powerful Header","Aerial Dominance"],
    "Tackler":["Wins the Ball Back","Biting Tackle","Hard but Fair"],
    "Interceptor":["Reads the Game","Cuts Off the Supply","Anticipates Everything"],
    "Marker":["Gets Tight","Man-Marker","Shadows His Man"],
    "Blocker":["Body on the Line","Last Ditch Block","Throws Himself at Everything"],
    "Sweeper":["Sweeps the Box","Covers Danger","Cleans Up"],
    "Athlete":["Burst of Pace","Covers Every Blade of Grass","Explosive"],
    "Engine":["Box to Box","Never Stops Running","Iron Lungs"],
    "Strong":["Holds the Ball Up","Hard to Knock Off It","Muscles Through"],
    "Aggressive":["Gets in Their Face","Sets the Tone","Intimidating"],
    "Anchor":["Screens the Back Four","Immovable","Holds Position"],
    "Roamer":["Pops Up Everywhere","Free Spirit","Comfortable Anywhere"],
    "Leader":["Organises the Wall","Commands the Area","Vocal Leader"],
    "Reader":["Always in Position","Reads Danger Early","Positional Master"],
    "Risk_Taker":["Gambles and Wins","Hollywood or Nothing","High Risk High Reward"],
    "Safe":["Keeps Possession","Patient Build","Never Gives It Away"],
    "Direct":["Gets at Them","Vertical Threat","No Nonsense"],
    "Crosser":["Gets Forward at Every Opportunity","Whips It In","Delivery Specialist"],
    "Entertainer":["Showboater","Tricks for Days","Crowd Pleaser"],
}
MULTICLASS_TRAITS = {
    ("Playmaker","Distributor"):"The Regista",
    ("Finisher","Clinical"):"Predator",
    ("Tackler","Aggressive"):"The Enforcer",
    ("Dribbler","Athlete"):"Bullet",
    ("Creator","Crosser"):"Wide Threat",
    ("Sweeper","Interceptor"):"The Read",
    ("Anchor","Interceptor"):"The Shield",
    ("Engine","Athlete"):"The Motor",
}

# Slot display-name → canonical position used by the engine
POS_TO_CANON = {
    "GK":"GK", "RB":"LB_RB", "LB":"LB_RB", "CB":"CB",
    "RWB":"LB_RB", "LWB":"LB_RB", "DM":"DM", "CM":"CM",
    "RM":"LW_RW", "LM":"LW_RW", "RW":"LW_RW", "LW":"LW_RW",
    "AM":"AM", "ST":"ST",
}

# Each slot: pos (display label), canon (engine slot), optional synergy_classes
# key_synergy: the formation's conditional bonus / penalty
FORMATION_CARDS = {
    "4-4-2": {
        "name":"4-4-2 — Flat","category":"Standard",
        "description":"Rigid classic. Excellent structure, decent coverage.",
        "bonuses":{"structure":10,"finishing":5},
        "slots":[
            {"pos":"GK", "canon":"GK"},
            {"pos":"LB", "canon":"LB_RB"},{"pos":"CB","canon":"CB"},{"pos":"CB","canon":"CB"},{"pos":"RB","canon":"LB_RB"},
            {"pos":"LM", "canon":"LW_RW"},{"pos":"CM","canon":"CM"},{"pos":"CM","canon":"CM"},{"pos":"RM","canon":"LW_RW"},
            {"pos":"ST", "canon":"ST","synergy_classes":["Finisher","Aerial","Poacher"]},{"pos":"ST","canon":"ST"},
        ],
        "key_synergy":{
            "label":"Target Forward",
            "desc":"ST with Finisher / Aerial / Poacher → +5 Penetration",
            "slots_with_synergy":["ST"],"required_classes":["Finisher","Aerial","Poacher"],"count":1,
            "effect":{"type":"phase_flat","phase":"penetration","value":5},
        },
    },
    "4-3-3": {
        "name":"4-3-3 — Holding","category":"Standard",
        "description":"Modern standard. High control, triangles everywhere.",
        "bonuses":{"build_up":15,"penetration":5},
        "slots":[
            {"pos":"GK","canon":"GK"},
            {"pos":"LB","canon":"LB_RB"},{"pos":"CB","canon":"CB"},{"pos":"CB","canon":"CB"},{"pos":"RB","canon":"LB_RB"},
            {"pos":"DM","canon":"DM","synergy_classes":["Anchor","Interceptor"]},
            {"pos":"CM","canon":"CM"},{"pos":"CM","canon":"CM"},
            {"pos":"LW","canon":"LW_RW"},{"pos":"ST","canon":"ST"},{"pos":"RW","canon":"LW_RW"},
        ],
        "key_synergy":{
            "label":"Pivot Anchor",
            "desc":"DM with Anchor / Interceptor / The Regista → +10 Build-Up",
            "slots_with_synergy":["DM"],"required_classes":["Anchor","Interceptor"],
            "required_traits":["The Regista","The Shield"],"count":1,
            "effect":{"type":"phase_flat","phase":"build_up","value":10},
        },
    },
    "4-2-3-1": {
        "name":"4-2-3-1 — Wide","category":"Creators",
        "description":"The pivot system. Sacrifices a striker for a playmaker.",
        "bonuses":{"build_up":10,"structure":10},
        "slots":[
            {"pos":"GK","canon":"GK"},
            {"pos":"RB","canon":"LB_RB"},{"pos":"CB","canon":"CB"},{"pos":"CB","canon":"CB"},{"pos":"LB","canon":"LB_RB"},
            {"pos":"DM","canon":"DM","synergy_classes":["Anchor","Interceptor","Passer"]},
            {"pos":"DM","canon":"DM","synergy_classes":["Aggressive","Tackler"]},
            {"pos":"RM","canon":"LW_RW"},
            {"pos":"AM","canon":"AM","synergy_classes":["Creator","Playmaker","Visionary"]},
            {"pos":"LM","canon":"LW_RW"},
            {"pos":"ST","canon":"ST"},
        ],
        "key_synergy":{
            "label":"Advanced Playmaker",
            "desc":"AM with Creator / Playmaker / Visionary → one Half-Chance upgraded to Good Chance per match",
            "slots_with_synergy":["AM"],"required_classes":["Creator","Playmaker","Visionary"],"count":1,
            "effect":{"type":"half_chance_upgrade_once"},
        },
    },
    "3-4-2-1": {
        "name":"3-4-2-1 — The Box","category":"Creators",
        "description":"Overloads the center with two 10s behind a striker.",
        "bonuses":{"penetration":20,"structure":-10},
        "slots":[
            {"pos":"GK","canon":"GK"},
            {"pos":"CB","canon":"CB"},{"pos":"CB","canon":"CB"},{"pos":"CB","canon":"CB"},
            {"pos":"LM","canon":"LW_RW"},{"pos":"CM","canon":"CM"},{"pos":"CM","canon":"CM"},{"pos":"RM","canon":"LW_RW"},
            {"pos":"AM","canon":"AM","synergy_classes":["Dribbler","Finisher","Creator"]},
            {"pos":"AM","canon":"AM","synergy_classes":["Dribbler","Finisher","Creator"]},
            {"pos":"ST","canon":"ST"},
        ],
        "key_synergy":{
            "label":"Inside Forwards",
            "desc":"Both AM slots with Dribbler / Finisher / Creator → Penetration ×1.10",
            "slots_with_synergy":["AM"],"required_classes":["Dribbler","Finisher","Creator"],"count":2,
            "effect":{"type":"phase_multiplier","phase":"penetration","value":1.10},
        },
    },
    "4-2-4": {
        "name":"4-2-4 — Attacking","category":"Aggressors",
        "description":"Pure chaos. Bypasses midfield. High risk, high reward.",
        "bonuses":{"finishing":20,"build_up":-15},
        "slots":[
            {"pos":"GK","canon":"GK"},
            {"pos":"LB","canon":"LB_RB"},{"pos":"CB","canon":"CB"},{"pos":"CB","canon":"CB"},{"pos":"RB","canon":"LB_RB"},
            {"pos":"CM","canon":"CM"},{"pos":"CM","canon":"CM"},
            {"pos":"LW","canon":"LW_RW","synergy_classes":["Dribbler","Crosser"]},
            {"pos":"ST","canon":"ST"},{"pos":"ST","canon":"ST"},
            {"pos":"RW","canon":"LW_RW","synergy_classes":["Dribbler","Crosser"]},
        ],
        "key_synergy":{
            "label":"Wide Threats",
            "desc":"Both wingers with Dribbler / Crosser → +8 Penetration",
            "slots_with_synergy":["LW","RW"],"required_classes":["Dribbler","Crosser"],"count":2,
            "effect":{"type":"phase_flat","phase":"penetration","value":8},
        },
    },
    "3-4-3-diamond": {
        "name":"3-4-3 — Diamond","category":"Aggressors",
        "description":"Aggressive possession. Demands elite tactical intelligence.",
        "bonuses":{"build_up":15,"penetration":15,"structure":-20},
        "slots":[
            {"pos":"GK","canon":"GK"},
            {"pos":"CB","canon":"CB"},
            {"pos":"CB","canon":"CB","synergy_classes":["Distributor","Passer","Visionary"]},
            {"pos":"CB","canon":"CB"},
            {"pos":"DM","canon":"DM"},
            {"pos":"LM","canon":"LW_RW"},{"pos":"RM","canon":"LW_RW"},
            {"pos":"AM","canon":"AM"},
            {"pos":"ST","canon":"ST"},{"pos":"ST","canon":"ST"},{"pos":"ST","canon":"ST"},
        ],
        "key_synergy":{
            "label":"Ball-Playing Defender",
            "desc":"Central CB without Distributor / Passer / Visionary → −10 Build-Up penalty",
            "slots_with_synergy":["CB"],"required_classes":["Distributor","Passer","Visionary"],"count":1,
            "penalty_if_missing":True,
            "effect":{"type":"phase_flat","phase":"build_up","value":-10},
        },
    },
    "5-3-2": {
        "name":"5-3-2 — Counter","category":"Block",
        "description":"Absorb pressure and strike. Good against high-control teams.",
        "bonuses":{"structure":25,"build_up":-10},
        "slots":[
            {"pos":"GK","canon":"GK"},
            {"pos":"LWB","canon":"LB_RB","synergy_classes":["Engine","Athlete","Crosser"]},
            {"pos":"CB","canon":"CB"},{"pos":"CB","canon":"CB"},{"pos":"CB","canon":"CB"},
            {"pos":"RWB","canon":"LB_RB","synergy_classes":["Engine","Athlete","Crosser"]},
            {"pos":"CM","canon":"CM"},{"pos":"CM","canon":"CM"},{"pos":"CM","canon":"CM"},
            {"pos":"ST","canon":"ST"},{"pos":"ST","canon":"ST"},
        ],
        "key_synergy":{
            "label":"Attacking Wingbacks",
            "desc":"Both WBs with Engine / Athlete / Crosser → +10 Penetration",
            "slots_with_synergy":["LWB","RWB"],"required_classes":["Engine","Athlete","Crosser"],"count":2,
            "effect":{"type":"phase_flat","phase":"penetration","value":10},
        },
    },
    "4-1-4-1": {
        "name":"4-1-4-1 — Low Block","category":"Block",
        "description":"Park the bus. Two banks of four with a screening midfielder.",
        "bonuses":{"resistance":30,"structure":30,"penetration":-20},
        "slots":[
            {"pos":"GK","canon":"GK"},
            {"pos":"LB","canon":"LB_RB"},{"pos":"CB","canon":"CB"},{"pos":"CB","canon":"CB"},{"pos":"RB","canon":"LB_RB"},
            {"pos":"DM","canon":"DM","synergy_classes":["Engine","Aggressive","Tackler"]},
            {"pos":"LM","canon":"LW_RW"},{"pos":"CM","canon":"CM"},{"pos":"CM","canon":"CM"},{"pos":"RM","canon":"LW_RW"},
            {"pos":"ST","canon":"ST"},
        ],
        "key_synergy":{
            "label":"Destroyer",
            "desc":"DM with Engine / Aggressive / Tackler → opponent Big Chances become Good Chances",
            "slots_with_synergy":["DM"],"required_classes":["Engine","Aggressive","Tackler"],"count":1,
            "effect":{"type":"downgrade_opponent_chances"},
        },
    },
}
DEFAULT_FORMATION = "4-1-4-1"

MAX_ACTIVE_CARDS = 4

SKILL_CARDS = {
    "the_conductor":{"name":"The Conductor","category":"Possession","rarity":"Common",
        "effect_type":"phase_multiplier","phase":"build_up","target":"self","value":1.15,
        "description":"Build-Up +15% every turn"},
    "patience_is_a_virtue":{"name":"Patience is a Virtue","category":"Possession","rarity":"Uncommon",
        "effect_type":"possession_chance_bonus","possession_threshold":0.55,"bonus_rolls":1,
        "description":"Possession >55% → +1 chance roll"},
    "killer_instinct":{"name":"Killer Instinct","category":"Finishing","rarity":"Uncommon",
        "effect_type":"conversion_boost","chance_quality":"Big Chance","bonus":0.10,
        "description":"Big Chances +10% conversion"},
    "the_wall":{"name":"The Wall","category":"Defensive","rarity":"Common",
        "effect_type":"phase_multiplier","phase":"resistance","target":"self","value":1.15,
        "description":"Resistance +15% every turn"},
    "clinical":{"name":"Clinical","category":"Finishing","rarity":"Rare",
        "effect_type":"once_per_match_reroll","used":False,
        "description":"Once per match: re-roll one failed conversion"},
    "surgical":{"name":"Surgical","category":"Creation","rarity":"Rare",
        "effect_type":"half_chance_upgrade",
        "description":"Half Chances upgraded to Good Chances"},
    "press_fanatic":{"name":"Press Fanatic","category":"Pressing","rarity":"Common",
        "effect_type":"phase_multiplier","phase":"pressing","target":"self","value":1.20,
        "description":"Pressing +20% every turn"},
    "siege_mentality":{"name":"Siege Mentality","category":"Momentum","rarity":"Rare",
        "effect_type":"losing_team_boost","from_turn":3,"phases":["build_up","penetration"],"bonus":8,
        "description":"Losing after turn 3 → Build-Up & Penetration +8"},
    "the_opener":{"name":"The Opener","category":"Creation","rarity":"Uncommon",
        "effect_type":"first_chance_upgrade",
        "description":"First chance each turn upgraded one tier"},
    "late_show":{"name":"Late Show","category":"Finishing","rarity":"Rare",
        "effect_type":"late_turns_bonus_roll","from_turn":5,
        "description":"Turns 5–6: conversion rolls twice (better wins)"},
}

# ── GAME STATE ────────────────────────────────────────────────
STATE = {}

def init_state():
    global STATE
    random.seed(None)
    h, a = make_squads()
    for p in h["players"]:
        setup_progression(p)
    starters = h["players"][:11]
    bench    = h["players"][11:]
    assignment = auto_assign_slots(starters, FORMATIONS[DEFAULT_FORMATION])
    for p in starters:
        if p["name"] in assignment:
            p["slot"] = assignment[p["name"]]
    STATE = {
        "squad":      h["players"],
        "squad_name": h["name"],
        "formation":  DEFAULT_FORMATION,
        "starters":   [p["name"] for p in starters],
        "bench":      [p["name"] for p in bench],
        "cards": {
            "the_conductor": copy.deepcopy(SKILL_CARDS["the_conductor"]),
            "patience_is_a_virtue": copy.deepcopy(SKILL_CARDS["patience_is_a_virtue"]),
            "killer_instinct": copy.deepcopy(SKILL_CARDS["killer_instinct"]),
            "the_wall": copy.deepcopy(SKILL_CARDS["the_wall"]),
        },
        "available_cards": {k: copy.deepcopy(v) for k, v in SKILL_CARDS.items()},
        "match": None,
        "season": {"matchday": 1, "results": [], "table": init_table()},
        "pending_events": [],
        "phase": "pre_match",
    }

def init_table():
    teams = ["FC Rosewood","Dynamo FC","United SC","City Athletic","Rovers FC",
             "Albion FC","Palace Town","The Wanderers","Harbour FC","Valley United"]
    return [{"name":t,"p":0,"w":0,"d":0,"l":0,"gf":0,"ga":0,"pts":0} for t in teams]

AGES       = {"Vasquez":22,"Hernandez":27,"Okafor":24,"Müller":19,"Santos":21,"Park":26,
              "Rossi":28,"Chen":22,"Diallo":20,"Martinez":23,"Al-Hassan":21,
              "Garcia":20,"O'Brien":23,"Nakamura":21,"Weber":25}
POTENTIALS = {"Vasquez":"Medium","Hernandez":"Medium","Okafor":"High","Müller":"High",
              "Santos":"Medium","Park":"Medium","Rossi":"High","Chen":"Medium",
              "Diallo":"Elite","Martinez":"High","Al-Hassan":"High",
              "Garcia":"Medium","O'Brien":"Medium","Nakamura":"High","Weber":"Low"}
START_XP   = {"Vasquez":380,"Hernandez":420,"Okafor":550,"Müller":700,"Santos":380,
              "Park":650,"Rossi":800,"Chen":400,"Diallo":720,"Martinez":700,"Al-Hassan":390,
              "Garcia":200,"O'Brien":280,"Nakamura":240,"Weber":260}

def setup_progression(p):
    name = p["name"]
    p["age"]           = AGES.get(name, 24)
    p["potential"]     = POTENTIALS.get(name, "Medium")
    p["potential_cap"] = POTENTIAL_TIERS[p["potential"]]
    p["xp"]            = START_XP.get(name, 200)
    p["xp_total"]      = p["xp"]
    p["traits"]        = p.get("traits", [])
    p["personality"]   = []

# ── ENGINE HELPERS ────────────────────────────────────────────
def auto_assign_slots(players, slots):
    """Greedily assign formation slots to players, favouring position matches."""
    remaining = list(slots)
    result    = {}
    unmatched = []
    for p in players:
        matched = False
        for i, s in enumerate(remaining):
            if p["position"] == s:
                result[p["name"]] = s
                remaining.pop(i)
                matched = True
                break
        if not matched:
            unmatched.append(p)
    for p in unmatched:
        if remaining:
            result[p["name"]] = remaining.pop(0)
    return result

def roll_d(n,d=6,dl=False):
    r=[random.randint(1,d) for _ in range(n)]
    if dl and len(r)>1: r.remove(min(r))
    return sum(r)
def sdice(s):
    s=max(1,round(s))
    if s<=4:  return roll_d(1)
    if s<=8:  return roll_d(2)
    if s<=12: return roll_d(3)
    if s<=16: return roll_d(4,dl=True)
    return roll_d(4)
def ps(players, ph):
    t=0
    for p in players:
        sl=p.get("slot",p["position"])
        if sl not in POSITION_WEIGHTS: continue
        t+=sdice(p["stats"].get(PHASES[ph],1)*POSITION_WEIGHTS[sl][ph]*COMPETENCE_MODIFIER[p["competence"].get(sl,0)])
    return t
def poss_fn(d):
    if d>=15: return 0.70
    if d>=8:  return 0.62
    if d>=-7: return 0.45+(d+7)/14*0.10
    if d>=-14:return 0.38
    return 0.30
def nc_fn(p):
    if p<=0.32: return 1 if random.random()<0.4 else 0
    if p<=0.44: return 1
    if p<=0.56: return 1 if random.random()<0.5 else 2
    if p<=0.65: return 2
    return 2 if random.random()<0.6 else 3
def qual_fn(d):
    if d>=10: return ("Big Chance",0.35)
    if d>=3:  return ("Good Chance",0.20)
    if d>=-2: return ("Half Chance",0.10)
    return (None,0)
def ct_fn(players):
    cls=[c for p in players for c in p["classes"]]
    if "Crosser" in cls and random.random()<0.35: return "Cross"
    if "Distributor" in cls and random.random()<0.25: return "Through Ball"
    if "Aerial" in cls and random.random()<0.20: return "Header"
    if "Athlete" in cls and random.random()<0.20: return "Counter"
    return "Open Play"
def upg_fn(l):
    idx=QUALITY_TIERS.index(l) if l in QUALITY_TIERS else 0
    n=QUALITY_TIERS[min(idx+1,3)]; return(n,XG_MAP[n])
def amods_fn(v,ph,tgt,cards,ss=None,t=None):
    for c in cards.values():
        et=c.get("effect_type","")
        if et=="phase_multiplier" and c.get("phase")==ph and c.get("target")==tgt: v*=c["value"]
        if et=="losing_team_boost" and tgt=="self" and ss and t:
            if t>=c["from_turn"] and ss["self"]<ss["opponent"] and ph in c["phases"]: v+=c["bonus"]
        if et=="winning_structure_boost" and tgt=="self" and ss:
            if ss["self"]>ss["opponent"] and ph==c["phase"]: v*=(1+c["bonus_pct"])
    return max(0,v)
def mchances_fn(ch,cards,t):
    out=list(ch); ou=False
    for i,(ct,(l,x)) in enumerate(out):
        for c in cards.values():
            et=c.get("effect_type","")
            if et=="chance_type_upgrade" and ct==c.get("chance_type"): l,x=upg_fn(l)
            if et=="half_chance_upgrade" and l=="Half Chance": l,x="Good Chance",0.20
            if et=="first_chance_upgrade" and i==0 and not ou: l,x=upg_fn(l);ou=True
        out[i]=(ct,(l,x))
    return out
def crate_fn(fin,res,l,cards,t):
    b={"Big Chance":0.40,"Good Chance":0.22,"Half Chance":0.09}.get(l,0)
    r=b+((fin-res)/10)*0.05
    for c in cards.values():
        if c.get("effect_type")=="conversion_boost" and l==c.get("chance_quality"): r+=c["bonus"]
        if c.get("effect_type")=="late_turns_bonus_roll" and t>=c["from_turn"]: r=1-(1-r)**2
    return max(0.02,min(0.92,r))
def tick_fat_fn(players):
    for p in players:
        p["_ft"]=p.get("_ft",0)+FATIGUE_TICK_RATE.get(p.get("slot",p["position"]),1.0)
        if p["_ft"]>=4:
            i=FATIGUE_STEPS.index(p["fatigue"])
            if i<3: p["fatigue"]=FATIGUE_STEPS[i+1]
            p["_ft"]=0

def mkplayer(name,slot,classes,rarity,level,ov=None):
    rng=RARITY_RANGES[rarity]; pr=CLASSES_PRIM.get(classes[0],"build_up")
    stats={ph:(random.randint(*rng["primary"]) if ph==pr else random.randint(1,max(1,rng["secondary"][0]-1))) for ph in PHASES}
    if ov: stats.update(ov)
    comp={pos:0 for pos in POSITION_WEIGHTS}; comp[slot]=5
    return {"name":name,"position":slot,"slot":slot,"classes":list(classes),"rarity":rarity,
            "level":level,"stats":stats,"competence":comp,"fatigue":"Fresh","_ft":0,
            "traits":[],"personality":[],"xp":0,"xp_total":0,
            "age":24,"potential":"Medium","potential_cap":13}

def make_squads():
    h={"name":"FC Rosewood","players":[
        # ── Starters ──
        mkplayer("Vasquez","GK",["Blocker"],"Uncommon",8,{"resistance":11,"structure":8}),
        mkplayer("Hernandez","CB",["Sweeper","Interceptor"],"Uncommon",8,{"structure":12,"resistance":9}),
        mkplayer("Okafor","CB",["Anchor","Tackler"],"Rare",9,{"structure":13,"pressing":10}),
        mkplayer("Müller","LB_RB",["Engine","Athlete"],"Common",6,{"pressing":9,"build_up":7}),
        mkplayer("Santos","LB_RB",["Dribbler","Crosser"],"Uncommon",7,{"penetration":10,"build_up":6}),
        mkplayer("Park","DM",["Anchor","Interceptor"],"Rare",10,{"structure":13,"pressing":11}),
        mkplayer("Rossi","CM",["Playmaker","Distributor"],"Rare",11,{"build_up":13,"penetration":11}),
        mkplayer("Chen","CM",["Engine","Passer"],"Uncommon",8,{"build_up":10,"pressing":9}),
        mkplayer("Diallo","LW_RW",["Dribbler","Athlete"],"Uncommon",8,{"penetration":11,"pressing":8}),
        mkplayer("Martinez","ST",["Finisher","Clinical"],"Rare",9,{"finishing":12,"penetration":8}),
        mkplayer("Al-Hassan","LW_RW",["Creator","Crosser"],"Uncommon",7,{"penetration":10,"build_up":7}),
        # ── Bench ──
        mkplayer("Garcia","ST",["Finisher"],"Common",5,{"finishing":8,"penetration":5}),
        mkplayer("O'Brien","CM",["Passer","Engine"],"Common",6,{"build_up":7,"pressing":6}),
        mkplayer("Nakamura","LW_RW",["Dribbler"],"Common",5,{"penetration":8,"pressing":5}),
        mkplayer("Weber","CB",["Marker","Blocker"],"Common",6,{"resistance":8,"structure":8}),
    ]}
    a={"name":"Dynamo FC","players":[
        mkplayer("Petrov","GK",["Blocker"],"Common",6,{"resistance":9,"structure":7}),
        mkplayer("Kowalski","CB",["Sweeper","Strong"],"Common",7,{"structure":10,"resistance":8}),
        mkplayer("Ndidi","CB",["Tackler","Marker"],"Uncommon",8,{"pressing":10,"structure":9}),
        mkplayer("Fernandez","LB_RB",["Engine"],"Common",5,{"pressing":7,"build_up":6}),
        mkplayer("Yilmaz","LB_RB",["Athlete"],"Common",6,{"pressing":8,"penetration":7}),
        mkplayer("Balogun","DM",["Aggressive","Tackler"],"Common",7,{"pressing":10,"structure":7}),
        mkplayer("Moreira","CM",["Passer","Visionary"],"Uncommon",8,{"build_up":10,"penetration":8}),
        mkplayer("Kato","CM",["Distributor"],"Common",7,{"build_up":9,"penetration":7}),
        mkplayer("Ramos","LW_RW",["Dribbler"],"Common",7,{"penetration":9}),
        mkplayer("Volkov","ST",["Finisher","Shooter"],"Uncommon",8,{"finishing":11,"penetration":8}),
        mkplayer("Ibrahim","LW_RW",["Crosser","Athlete"],"Common",6,{"penetration":9,"pressing":7}),
    ]}
    return h, a

# ── TURN RESOLUTION ───────────────────────────────────────────
def resolve_turn(match_state, home_players, away_players, home_cards, turn_num):
    scr = match_state["score"]
    cs  = match_state["card_state"]
    ssh = {"self":scr["home"],"opponent":scr["away"]}
    ssa = {"self":scr["away"],"opponent":scr["home"]}
    events = []
    times  = ["0–15","15–30","30–45","45–60","60–75","75–90"]
    t = turn_num

    hbu = amods_fn(ps(home_players,0),"build_up","self",home_cards,ssh,t)
    aps = ps(away_players,3)
    hp  = poss_fn(hbu - aps)
    ap  = 1.0 - hp

    hn = nc_fn(hp); an = nc_fn(ap)
    for c in home_cards.values():
        if c.get("effect_type")=="possession_chance_bonus" and hp>=c["possession_threshold"]: hn+=c["bonus_rolls"]

    hpen = amods_fn(ps(home_players,1),"penetration","self",home_cards,ssh,t)
    astr = ps(away_players,4)
    apen = ps(away_players,1)
    hstr = ps(home_players,4)

    hraw=[]
    for _ in range(int(hn)):
        d=hpen-astr+random.randint(-8,8); q=qual_fn(d)
        if q[0]: hraw.append((ct_fn(home_players),q))
    araw=[]
    for _ in range(int(an)):
        d=apen-hstr+random.randint(-8,8); q=qual_fn(d)
        if q[0]: araw.append((ct_fn(away_players),q))

    hch = mchances_fn(hraw, home_cards, t)
    ach = list(araw)

    hfin = ps(home_players,2)
    ares = amods_fn(ps(away_players,5),"resistance","self",{},ssa,t)
    afin = ps(away_players,2)
    hres = amods_fn(ps(home_players,5),"resistance","self",home_cards,ssh,t)

    for ct2,(l,x) in hch:
        r = crate_fn(hfin,ares,l,home_cards,t)
        hit = random.random()<r
        if not hit and "clinical" in home_cards and not cs.get("clinical"):
            hit = random.random()<r
            if hit:
                cs["clinical"]=True
                events.append({"type":"card_trigger","text":"✨ Clinical fired!","team":"home"})
        if hit:
            scr["home"]+=1
            scorer = random.choice([p for p in home_players if p["slot"] in ["ST","AM","LW_RW","CM"]])
            events.append({"type":"goal","text":f"⚽ GOAL! {scorer['name']}","detail":f"{ct2} / {l}","team":"home","rate":round(r,2)})
        else:
            outcome = random.choice(["Saved","Wide","Off target","Blocked"])
            events.append({"type":"miss","text":f"{ct2} / {l}","detail":outcome,"team":"home","rate":round(r,2)})

    for ct2,(l,x) in ach:
        r = crate_fn(afin,hres,l,{},t)
        hit = random.random()<r
        if hit:
            scr["away"]+=1
            scorer = random.choice([p for p in away_players if p["slot"] in ["ST","AM","LW_RW","CM"]])
            events.append({"type":"goal","text":f"⚽ GOAL! {scorer['name']}","detail":f"{ct2} / {l}","team":"away","rate":round(r,2)})
        else:
            outcome = random.choice(["Saved","Wide","Off target","Blocked"])
            events.append({"type":"miss","text":f"{ct2} / {l}","detail":outcome,"team":"away","rate":round(r,2)})

    # Bookings
    for p in home_players + away_players:
        base = 0.08+(0.05 if "Aggressive" in p["classes"] else 0)+(0.03 if t>=4 else 0)
        if random.random()<base*0.3:
            events.append({"type":"booking","text":f"🟨 {p['name']} booked","team":"both"})
            break

    tick_fat_fn(home_players)
    tick_fat_fn(away_players)

    if not events:
        events.append({"type":"quiet","text":"Quiet turn — no clear chances","team":"both"})

    return {
        "turn": t,
        "time": times[t-1],
        "possession": {"home": round(hp,2), "away": round(ap,2)},
        "events": events,
        "score": dict(scr),
    }

# ── XP / LEVEL-UP ─────────────────────────────────────────────
def get_age_mod(age):
    for (lo,hi),m in AGE_CURVE.items():
        if lo<=age<=hi: return m
    return 0.4
def pot_mod_fn(p):
    gap=p["potential_cap"]-p["level"]
    return POTENTIAL_XP_APPROACH.get(min(gap,3),1.0)
def earn_xp_fn(player, role="started_90", spec=False, bonus=0):
    if player["level"]>=player["potential_cap"]: return 0
    base=BASE_XP.get(role,10); am=get_age_mod(player["age"])
    fm=FATIGUE_XP_MOD.get(player["fatigue"],1.0); sm=1.5 if spec else 1.0
    pm=pot_mod_fn(player)
    return int(base*am*fm*sm*pm+bonus)
def get_trait_opts_fn(player, n=3):
    owned=set(player.get("traits",[])); pool=[]
    for cls in player.get("classes",[]):
        for tr in TRAIT_POOL.get(cls,[]):
            if tr not in owned: pool.append({"type":"ability","trait":tr,"source":cls})
    for (c1,c2),tr in MULTICLASS_TRAITS.items():
        if c1 in player["classes"] and c2 in player["classes"] and tr not in owned:
            pool.append({"type":"multiclass","trait":tr,"source":f"{c1}+{c2}"})
    if len(pool)<2:
        for fb in ["Works Hard","Good Attitude","Reliable"]:
            if fb not in owned: pool.append({"type":"fallback","trait":fb,"source":"Generic"})
    random.shuffle(pool); return pool[:n]
def get_class_opts_fn(player, n=3):
    cur=set(player.get("classes",[])); opts=[c for c in TRAIT_POOL if c not in cur]
    random.shuffle(opts); return [{"class":c,"primary":CLASSES_PRIM.get(c,"?")} for c in opts[:n]]
def stat_gain_fn(player):
    gains={}
    for cls in player.get("classes",[]):
        pr=CLASSES_PRIM.get(cls)
        if pr and pr!="all":
            player["stats"][pr]=min(20,player["stats"].get(pr,1)+1); gains[pr]=gains.get(pr,0)+1
    return gains
def do_levelup_fn(player):
    evts=[]
    while True:
        cl=player["level"]
        if cl>=20 or cl>=player["potential_cap"]: break
        need=XP_CURVE.get(cl+1,99999)
        if player["xp"]<need: break
        player["xp"]-=need; player["level"]+=1; nl=player["level"]
        g=stat_gain_fn(player)
        evts.append({"type":"level_up","player":player["name"],"new_level":nl,"stat_gains":g})
        if nl in TRAIT_UNLOCK_LEVELS:
            evts.append({"type":"trait_unlock","player":player["name"],"level":nl,
                         "options":get_trait_opts_fn(player)})
        if nl in CLASS_UNLOCK_LEVELS:
            evts.append({"type":"class_upgrade","player":player["name"],"level":nl,
                         "options":get_class_opts_fn(player)})
    return evts

# ── ROUTES ────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/api/init", methods=["POST"])
def api_init():
    init_state()
    return jsonify({"ok": True, "state": get_client_state()})

@app.route("/api/state", methods=["GET"])
def api_state():
    if not STATE:
        init_state()
    return jsonify(get_client_state())

@app.route("/api/start_match", methods=["POST"])
def api_start_match():
    _, away = make_squads()
    matchday = STATE["season"]["matchday"]
    # Pick opponent from table rotation
    opp_names = [t["name"] for t in STATE["season"]["table"] if t["name"] != STATE["squad_name"]]
    opp_idx   = (matchday - 1) % len(opp_names)
    away["name"] = opp_names[opp_idx]

    STATE["match"] = {
        "opponent":          away,
        "score":             {"home": 0, "away": 0},
        "turn":              0,
        "log":               [],
        "complete":          False,
        "card_state":        {"clinical": False, "lms": False},
        "subs_used":         0,
        "original_starters": list(STATE["starters"]),
        "subbed_on":         [],
        "subbed_off":        [],
    }
    STATE["phase"] = "in_match"
    return jsonify({"ok": True, "opponent": away["name"], "state": get_client_state()})

@app.route("/api/resolve_turn", methods=["POST"])
def api_resolve_turn():
    m = STATE["match"]
    if m["complete"] or m["turn"] >= 6:
        return jsonify({"error": "Match already complete"}), 400

    m["turn"] += 1
    starter_names = set(STATE["starters"])
    home_players  = [p for p in STATE["squad"] if p["name"] in starter_names]
    turn_result = resolve_turn(
        m,
        home_players,
        m["opponent"]["players"],
        STATE["cards"],
        m["turn"]
    )
    m["log"].append(turn_result)

    if m["turn"] >= 6:
        m["complete"] = True
        STATE["phase"] = "post_match"
        # Update season table
        scr = m["score"]
        for row in STATE["season"]["table"]:
            if row["name"] == STATE["squad_name"]:
                row["p"]+=1; row["gf"]+=scr["home"]; row["ga"]+=scr["away"]
                if scr["home"]>scr["away"]: row["w"]+=1; row["pts"]+=3
                elif scr["home"]==scr["away"]: row["d"]+=1; row["pts"]+=1
                else: row["l"]+=1
        STATE["season"]["results"].append({"matchday":STATE["season"]["matchday"],
            "opponent":m["opponent"]["name"],"score":dict(scr)})
        STATE["season"]["matchday"] += 1

    return jsonify({"ok": True, "turn_result": turn_result, "complete": m["complete"], "state": get_client_state()})

@app.route("/api/post_match", methods=["POST"])
def api_post_match():
    m = STATE.get("match") or {}
    orig     = set(m.get("original_starters", STATE["starters"]))
    sub_on   = set(m.get("subbed_on",  []))
    sub_off  = set(m.get("subbed_off", []))
    xp_report = []
    all_events = []
    for p in STATE["squad"]:
        if p["name"] in orig and p["name"] not in sub_off:
            role = "started_90"
        elif p["name"] in orig:
            role = "started_sub45"
        elif p["name"] in sub_on:
            role = "sub_on_45plus"
        else:
            role = "unused_sub"
        spec   = p.get("specialised_training") is not None
        bonus  = p.pop("_tactic_bonus", 0)
        xp     = earn_xp_fn(p, role, spec, bonus)
        p["xp"] += xp
        p["xp_total"] = p.get("xp_total", 0) + xp
        p["specialised_training"] = None
        evts   = do_levelup_fn(p)
        all_events.extend(evts)
        nxt    = XP_CURVE.get(p["level"]+1, None)
        xp_report.append({
            "name": p["name"], "slot": p["slot"], "xp_earned": xp,
            "level": p["level"], "xp": p["xp"], "xp_next": nxt,
            "fatigue": p["fatigue"], "role": role,
        })
    # Separate out prompts
    prompts = [e for e in all_events if e["type"] in ("trait_unlock","class_upgrade")]
    auto    = [e for e in all_events if e["type"] == "level_up"]
    if prompts:
        STATE["pending_events"] = prompts
        STATE["phase"] = "levelup"
    else:
        STATE["phase"] = "pre_match"
        recover_fatigue()
    return jsonify({"ok": True, "xp_report": xp_report, "level_ups": auto, "prompts": prompts, "state": get_client_state()})

@app.route("/api/apply_training", methods=["POST"])
def api_apply_training():
    data   = request.json
    choice = data.get("choice")
    summary = []
    if choice == "fitness":
        for p in STATE["squad"]:
            old = p["fatigue"]
            i   = FATIGUE_STEPS.index(p["fatigue"])
            if i > 0:
                p["fatigue"] = FATIGUE_STEPS[i - 1]
                summary.append({"name": p["name"], "from": old, "to": p["fatigue"]})
        if not summary:
            summary.append({"note": "All players already Fresh — no fatigue recovered."})
    elif choice == "tactics":
        for p in STATE["squad"]:
            p["_tactic_bonus"] = 15
        summary.append({"note": f"All {len(STATE['squad'])} players will earn +15 bonus XP after the match."})
    elif choice in ("finishing", "pressing", "build_up"):
        best = max(STATE["squad"], key=lambda p: p["stats"].get(choice, 0))
        best["specialised_training"] = choice
        summary.append({"name": best["name"], "stat": choice,
                         "value": best["stats"].get(choice, 0),
                         "note": f"{best['name']} selected for specialised {choice.replace('_',' ')} work — 1.5× XP multiplier."})
    return jsonify({"ok": True, "choice": choice, "summary": summary, "state": get_client_state()})

@app.route("/api/apply_choice", methods=["POST"])
def api_apply_choice():
    data       = request.json
    player_name= data.get("player")
    choice_type= data.get("choice_type")  # trait | class
    value      = data.get("value")

    player = next((p for p in STATE["squad"] if p["name"]==player_name), None)
    if not player:
        return jsonify({"error": "Player not found"}), 404

    if choice_type == "trait":
        player.setdefault("traits",[]).append(value)
    elif choice_type == "class":
        player.setdefault("classes",[]).append(value)
        pr = CLASSES_PRIM.get(value,"build_up")
        if pr != "all": player["stats"][pr] = min(20, player["stats"].get(pr,1)+2)

    # Remove resolved prompt
    STATE["pending_events"] = [e for e in STATE["pending_events"]
                                if not (e["player"]==player_name and
                                        ((e["type"]=="trait_unlock" and choice_type=="trait") or
                                         (e["type"]=="class_upgrade" and choice_type=="class")))]
    if not STATE["pending_events"]:
        STATE["phase"] = "pre_match"
        recover_fatigue()

    return jsonify({"ok": True, "state": get_client_state()})

@app.route("/api/toggle_card", methods=["POST"])
def api_toggle_card():
    data    = request.json
    card_id = data.get("card_id")
    if card_id in STATE["cards"]:
        del STATE["cards"][card_id]
    elif card_id in STATE["available_cards"]:
        if len(STATE["cards"]) >= MAX_ACTIVE_CARDS:
            return jsonify({"ok": False, "error": "max_cards", "state": get_client_state()})
        STATE["cards"][card_id] = copy.deepcopy(STATE["available_cards"][card_id])
    return jsonify({"ok": True, "state": get_client_state()})

@app.route("/api/set_formation", methods=["POST"])
def api_set_formation():
    data = request.json
    formation = data.get("formation")
    if formation not in FORMATIONS:
        return jsonify({"error": "Unknown formation"}), 400
    STATE["formation"] = formation
    starter_players = [p for p in STATE["squad"] if p["name"] in set(STATE["starters"])]
    assignment = auto_assign_slots(starter_players, FORMATIONS[formation])
    for p in starter_players:
        if p["name"] in assignment:
            p["slot"] = assignment[p["name"]]
    return jsonify({"ok": True, "state": get_client_state()})

@app.route("/api/swap_players", methods=["POST"])
def api_swap_players():
    """Swap a starter and a bench player (pre-match lineup editing)."""
    data         = request.json
    starter_name = data.get("starter")
    bench_name   = data.get("bench")
    if starter_name not in STATE["starters"]:
        return jsonify({"error": "Not a starter"}), 400
    if bench_name not in STATE["bench"]:
        return jsonify({"error": "Not on bench"}), 400
    sp = next(p for p in STATE["squad"] if p["name"] == starter_name)
    bp = next(p for p in STATE["squad"] if p["name"] == bench_name)
    bp["slot"] = sp["slot"]
    sp["slot"] = sp["position"]
    idx = STATE["starters"].index(starter_name)
    STATE["starters"][idx] = bench_name
    STATE["bench"].remove(bench_name)
    STATE["bench"].append(starter_name)
    return jsonify({"ok": True, "state": get_client_state()})

@app.route("/api/make_sub", methods=["POST"])
def api_make_sub():
    m = STATE.get("match")
    if not m or m["complete"]:
        return jsonify({"error": "No active match"}), 400
    if m["subs_used"] >= 3:
        return jsonify({"error": "No substitutions remaining"}), 400
    data     = request.json
    off_name = data.get("off")
    on_name  = data.get("on")
    if off_name not in STATE["starters"]:
        return jsonify({"error": "Player not on pitch"}), 400
    if on_name not in STATE["bench"]:
        return jsonify({"error": "Player not on bench"}), 400
    off_p = next(p for p in STATE["squad"] if p["name"] == off_name)
    on_p  = next(p for p in STATE["squad"] if p["name"] == on_name)
    on_p["slot"] = off_p["slot"]
    idx = STATE["starters"].index(off_name)
    STATE["starters"][idx] = on_name
    STATE["bench"].remove(on_name)
    STATE["bench"].append(off_name)
    m["subbed_off"].append(off_name)
    m["subbed_on"].append(on_name)
    m["subs_used"] += 1
    m["log"].append({
        "type":   "sub_event",
        "turn":   m["turn"],
        "text":   f"🔄 {on_name} on for {off_name}",
        "team":   "home",
    })
    return jsonify({"ok": True, "state": get_client_state()})

def recover_fatigue():
    for p in STATE["squad"]:
        i = FATIGUE_STEPS.index(p["fatigue"])
        if i > 0: p["fatigue"] = FATIGUE_STEPS[i-1]

def get_client_state():
    m = STATE.get("match")
    return {
        "phase":      STATE.get("phase","pre_match"),
        "squad":      STATE.get("squad",[]),
        "squad_name": STATE.get("squad_name",""),
        "formation":  STATE.get("formation", DEFAULT_FORMATION),
        "starters":   STATE.get("starters",[]),
        "bench":      STATE.get("bench",[]),
        "cards":      list(STATE.get("cards",{}).keys()),
        "card_details": STATE.get("cards",{}),
        "available_cards": STATE.get("available_cards",{}),
        "max_cards":  MAX_ACTIVE_CARDS,
        "match": {
            "opponent":   m["opponent"]["name"] if m else None,
            "score":      m["score"] if m else None,
            "turn":       m["turn"] if m else 0,
            "log":        m["log"] if m else [],
            "complete":   m["complete"] if m else False,
            "card_state": m["card_state"] if m else {},
            "subs_used":  m["subs_used"] if m else 0,
        } if m else None,
        "season":   STATE.get("season",{}),
        "pending_events": STATE.get("pending_events",[]),
    }

if __name__ == "__main__":
    init_state()
    app.run(debug=False, port=5055)