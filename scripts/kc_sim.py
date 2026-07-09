"""
Kickoff Clash v2 — quantitative pass #1.
Model per CARD_SYSTEM_V2 §2 (six contests, three mirror-pairs) and §4 (tilts).
Question: do +2 natural / +1 stretch tilts hold against the ATT/DEF stack —
i.e. committed builds separate, mono-stacks stay bounded by stat-drag, and the
STOP wall grinds draws with set pieces as its costed escape hatch.
"""
import numpy as np
from collections import defaultdict

rng = np.random.default_rng(7)

# ---- Role map (§3.1) : (name, pos, contest, tilt)  N=natural S=stretch ------
ROLES = [
 ("Marshal","GK","STOP","N"),("Sweeper Keeper","GK","STOP","N"),
 ("Shotstopper","GK","STOP","N"),("Distributor","GK","KEEP","S"),
 ("Centrale","CD","STOP","N"),("Colossus","CD","STOP","N"),
 ("Progressor","CD","KEEP","S"),("Sweeper","CD","BREAK","N"),("Stopper","CD","PRESS","S"),
 ("Fullback","WD","STOP","S"),("Auxiliary Centre-Back","WD","STOP","N"),
 ("Wing-back","WD","PRESS","S"),("Invertido","WD","KEEP","S"),
 ("Regista","DM","CREATE","N"),("Pivote","DM","KEEP","N"),("Anchor","DM","BREAK","N"),
 ("Interceptor","DM","BREAK","N"),("Water-Carrier","DM","BREAK","S"),
 ("Volante","DM","BREAK","N"),("Segundo Volante","DM","CREATE","S"),
 ("Playmaker","CM","CREATE","N"),("Metodista","CM","KEEP","N"),("Mediano","CM","BREAK","N"),
 ("Mezzala","CM","FINISH","S"),("Tuttocampista","CM","PRESS","N"),
 ("Ball Winner","CM","BREAK","N"),("Carrilero","CM","PRESS","N"),
 ("Touchline Winger","WM","CREATE","N"),("Tornante","WM","PRESS","N"),
 ("False Winger","WM","KEEP","S"),("Wide Cover","WM","BREAK","N"),
 ("Trequartista","AM","CREATE","N"),("Enganche","AM","CREATE","N"),
 ("Incursore","AM","FINISH","N"),("Mediapunta","AM","KEEP","N"),
 ("Shadow Striker","AM","FINISH","N"),
 ("Inverted Winger","WF","FINISH","N"),("Advanced Winger","WF","CREATE","N"),
 ("Wide Playmaker","WF","CREATE","N"),("Wide Target Forward","WF","FINISH","N"),
 ("Prima Punta","CF","FINISH","N"),("Falso Nove","CF","CREATE","S"),
 ("Spearhead","CF","PRESS","S"),("Target Forward","CF","KEEP","S"),
 ("Seconda Punta","CF","CREATE","S"),
]
CONTESTS = ["KEEP","PRESS","CREATE","BREAK","FINISH","STOP"]
MIRROR = {"KEEP":"PRESS","PRESS":"KEEP","CREATE":"BREAK","BREAK":"CREATE",
          "FINISH":"STOP","STOP":"FINISH"}
DEF_POS = {"GK","CD","WD"}   # who counts to the back line (STOP = mean back-line DEF)

# ---- Role-correlated stat profiles (§4.1) : contest -> (ATT mu,sd, DEF mu,sd)
# attacking contests print ATT-high/DEF-low; defensive contests the inverse;
# KEEP sits balanced. These approximate the Chief Scout primary_model signal.
PROFILE = {
 "FINISH": (72,10, 34,9),
 "CREATE": (66,10, 38,9),
 "KEEP":   (52,11, 52,11),
 "PRESS":  (42,10, 62,10),
 "BREAK":  (40,10, 63,10),
 "STOP":   (32,9,  68,10),
}
def _clip(x): return float(np.clip(x, 1, 99))

class Card:
    __slots__=("role","pos","contest","tilt","att","def_")
    def __init__(self, role, pos, contest, tilt, stat_boost=0.0):
        mu_a,sd_a,mu_d,sd_d = PROFILE[contest]
        self.role=role; self.pos=pos; self.contest=contest
        self.tilt = (2 if tilt=="N" else 1)
        self.att  = _clip(rng.normal(mu_a,sd_a)+stat_boost)
        self.def_ = _clip(rng.normal(mu_d,sd_d)+stat_boost)

# roles indexed by position and by (position,contest)
BY_POS=defaultdict(list); BY_POS_CON=defaultdict(list)
for n,p,c,t in ROLES:
    BY_POS[p].append((n,p,c,t)); BY_POS_CON[(p,c)].append((n,p,c,t))

# 4-3-3 slot template: which positions fill the XI
FORMATION = ["GK","CD","CD","WD","WD","DM","CM","CM","WF","CF","WF"]

def pick_role_for(pos, target, quality):
    """Pick a role for this slot. If target contest exists at this position,
    take it (commitment); else take the position's natural defensive/base role."""
    cand = BY_POS_CON.get((pos,target))
    if cand:
        r = cand[rng.integers(len(cand))]
    else:
        r = BY_POS[pos][rng.integers(len(BY_POS[pos]))]
    return Card(*r[:4], stat_boost=quality)

def build_xi(strategy, quality=0.0):
    xi=[]
    for pos in FORMATION:
        if strategy=="random":
            r=BY_POS[pos][rng.integers(len(BY_POS[pos]))]
            xi.append(Card(*r[:4], stat_boost=quality))
        else:  # "mono:CONTEST"
            xi.append(pick_role_for(pos, strategy.split(":")[1], quality))
    return xi

def build_stopbus(quality=0.0):
    """§7.1 costed wall: give up one back-line defender to a possession-winning
    carrier (KEEP tilt, mid stats -> lowers back-line DEF, raises KEEP) and one
    attacker slot to a taker (no tilt). Only this build unlocks set pieces."""
    xi=build_xi("mono:STOP", quality)
    wd=[c for c in xi if c.pos=="WD"][0]          # carrier: ex-defender, now KEEP
    wd.contest="KEEP"; wd.tilt=2
    mu_a,sd_a,mu_d,sd_d=PROFILE["KEEP"]
    wd.att=_clip(rng.normal(mu_a,sd_a)+quality); wd.def_=_clip(rng.normal(mu_d,sd_d)+quality)
    wf=[c for c in xi if c.pos=="WF"][0]           # taker: specialist, no tilt
    wf.tilt=0
    if STOPBUS_HARD:                               # steeper §7.1 cost: -2nd defender
        cd=[c for c in xi if c.pos=="CD"][0]       # a CB pushed into a BREAK screen role
        cd.contest="BREAK"; cd.tilt=2
        ma,sa,md,sd=PROFILE["BREAK"]
        cd.att=_clip(rng.normal(ma,sa)+quality); cd.def_=_clip(rng.normal(md,sd)+quality)
    return xi

def team_tilts(xi):
    t={c:0 for c in CONTESTS}
    for c in xi: t[c.contest]+=c.tilt
    return t
def backline_def(xi):
    d=[c.def_ for c in xi if c.pos in DEF_POS]
    return np.mean(d) if d else 40.0
def top_att(xi,k=3):
    return np.mean(sorted((c.att for c in xi),reverse=True)[:k])
def top_def(xi,k=4):  # aerial DEF for set pieces
    return np.mean(sorted((c.def_ for c in xi),reverse=True)[:k])

# ---- match constants (mid-vs-mid ~1.4/side) --------------------------------
# CREATE sets shot VOLUME (chances made); FINISH sets CONVERSION (chances taken).
# STOP is the mean-back-line DEF term in the conversion formula; BREAK suppresses volume.
BASE=36; TILT_PP=3.0; BACKLINE_COEF=0.6; STOPBUS_HARD=True
VOL_BASE=1.15; VOL_SLIDE=0.05
KEEP_K=4.0
SP_BASE=0.10

def resolve_side(att_tilts, att_xi, def_tilts, def_xi, poss, carrier, taker):
    goals=0
    bldef=backline_def(def_xi); att=top_att(att_xi)
    conv=np.clip(BASE+BACKLINE_COEF*(att-bldef)+TILT_PP*(att_tilts["FINISH"]-def_tilts["STOP"]),3,95)
    shot_rate=np.clip(VOL_BASE+VOL_SLIDE*(att_tilts["CREATE"]-def_tilts["BREAK"]),0.2,2.4)
    for _ in range(poss):
        for _ in range(rng.poisson(shot_rate)):
            if rng.random()*100<=conv: goals+=1
    # set pieces (§7): per-round dead-ball roll, possession-scaled, carrier-boosted,
    # needs a taker in the XI; the chance is DEF-keyed (aerial), not ATT.
    if taker:
        sp_conv=np.clip(BASE+BACKLINE_COEF*(top_def(att_xi)-bldef),3,95)
        p_dead=np.clip(SP_BASE*(poss/3.0)*(1.7 if carrier else 1.0),0,0.6)
        for _ in range(6):
            if rng.random()<p_dead and rng.random()*100<=sp_conv: goals+=1
    return goals

def sim_match(home, away, h_sp=(False,False), a_sp=(False,False)):
    ht=team_tilts(home); at=team_tilts(away)
    net=(ht["KEEP"]-at["PRESS"])-(at["KEEP"]-ht["PRESS"])
    h_poss=int(np.clip(round(3+net/KEEP_K),2,4)); a_poss=6-h_poss
    hg=resolve_side(ht,home,at,away,h_poss,*h_sp)
    ag=resolve_side(at,away,ht,home,a_poss,*a_sp)
    return hg,ag

# ---------------------------------------------------------------------------
if __name__=="__main__":
    N=6000
    print("=== A. mid-vs-mid calibration (both random, equal quality) ===")
    gh=ga=0; draws=0
    for _ in range(N):
        h=build_xi("random"); a=build_xi("random")
        x,y=sim_match(h,a); gh+=x; ga+=y; draws+=(x==y)
    print(f"avg goals home {gh/N:.2f}  away {ga/N:.2f}  draw% {100*draws/N:.0f}")


    print("\n=== census: max achievable tilt per contest in 4-3-3 ===")
    for c in CONTESTS:
        best=0
        for _ in range(4000):
            xi=build_xi(f"mono:{c}")
            best=max(best, team_tilts(xi)[c])
        # also modal
        vals=[team_tilts(build_xi(f'mono:{c}'))[c] for _ in range(3000)]
        print(f"{c:7s} max {best:2d}  median {int(np.median(vals)):2d}  (+pts on its dial: median {int(np.median(vals))} tilts)")


    # ---- builder dispatch: pure bus gets NO set pieces; stopbus pays §7.1 ----
    STRATS=["random","mono:CREATE","mono:FINISH","mono:KEEP",
            "mono:PRESS","mono:BREAK","mono:STOP","stopbus"]
    def mk(strat, q=0.0):
        return build_stopbus(q) if strat=="stopbus" else build_xi(strat, q)
    def sp_for(s): return (True,True) if s=="stopbus" else (False,False)

    print("\n=== A. calibration recheck ===")
    gh=ga=0;dr=0;N2=4000
    for _ in range(N2):
        x,y=sim_match(build_xi("random"),build_xi("random")); gh+=x;ga+=y;dr+=x==y
    print(f"avg goals/side {gh/N2:.2f}/{ga/N2:.2f}  draw% {100*dr/N2:.0f}")

    print("\n=== C. committed round-robin, pts/g (pure bus vs costed stopbus) ===")
    print("row=my build, col=opp.  AVG = mean over the committed field")
    print(f"{'':11s}"+"".join(f"{s.split(':')[-1][:4]:>6}" for s in STRATS)+"   AVG")
    M=1200
    for s in STRATS:
        row=[]
        for o in STRATS:
            w=d=0
            for _ in range(M):
                x,y=sim_match(mk(s),mk(o),h_sp=sp_for(s),a_sp=sp_for(o)); w+=x>y; d+=x==y
            row.append((3*w+d)/M)
        print(f"{s:11s}"+"".join(f"{v:6.2f}" for v in row)+f"   {np.mean(row):.2f}")

    print("\n=== D. economy season: §4.2 draw-pays-less + compounding ===")
    print("W=3 money, D=1 (reduced), L=0.3; money buys quality (compounds).")
    print("survive = cumulative pts stay above a rising relegation bar (1/fixture).")
    print("reports: median survival fixture, mean cumulative MONEY, late-season pts/g.")
    MONEY={"W":3.0,"D":1.0,"L":0.3}; K_MONEY=0.6; RAMP=1.9; MAXFX=14
    def season(strat, trials=1500):
        surv=[]; money=[]; late=[]  # late = pts in fixtures 8+
        for _ in range(trials):
            q=0.0; cum_pts=0.0; cum_money=0.0; latepts=[]; died=MAXFX+1
            for fx in range(1,MAXFX+1):
                oq=RAMP*fx
                ostrat="random" if fx<3 else np.random.choice(
                    ["mono:FINISH","mono:CREATE","mono:BREAK","stopbus"])
                x,y=sim_match(mk(strat,q),mk(ostrat,oq),h_sp=sp_for(strat),a_sp=sp_for(ostrat))
                res="W" if x>y else ("D" if x==y else "L"); pts=3 if x>y else (1 if x==y else 0)
                cum_pts+=pts; cum_money+=MONEY[res]; q+=MONEY[res]*K_MONEY
                if fx>=8: latepts.append(pts)
                if cum_pts < 1.0*fx:          # below relegation line -> run ends
                    died=fx; break
            surv.append(died); money.append(cum_money)
            late.append(np.mean(latepts) if latepts else 0.0)
        return np.median(surv), np.mean(money), np.mean(late)
    print(f"{'build':11s}{'med surv':>9}{'cum money':>11}{'late pts/g':>12}")
    res={}
    for s in STRATS:
        ms,mm,lp=season(s); res[s]=(ms,mm,lp)
        print(f"{s:11s}{ms:9.1f}{mm:11.1f}{lp:12.2f}")
    import json; json.dump(res, open("econ.json","w"))
