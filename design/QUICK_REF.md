# Football Balatro - Quick Reference Guide

## Core Match Mechanics at a Glance

### The 3-Step Pipeline (Per Attacking Team Per Turn)

```
STEP 1: Build Up vs Pressing → Possession Points
        ↓
STEP 2: Creation vs Destruction → Chances (Half/Good/Big)
        ↓
STEP 3: Finishing vs Blocking → Goal Conversion (Probabilistic)
```

---

## Player Attributes (6 Total)

### Offensive
| Attribute | Impact | Example Range |
|-----------|--------|---|
| **Build Up** | Possession retention, press resistance | 8-16 |
| **Creation** | Vision, penetration, chance quality | 3-14 |
| **Finishing** | Shot conversion, composure | 0-16 |

### Defensive
| Attribute | Impact | Example Range |
|-----------|--------|---|
| **Pressing** | Work rate, pressing intensity | 6-13 |
| **Destruction** | Tackling, ball-winning | 2-14 |
| **Blocking** | Positioning, denial | 2-19 |

---

## Player Classes & Traits

### Classes (4 Categories)
**Offensive**: Striker, Finisher, Provider, Passer, Dribbler
**Defensive**: Marker, Destroyer, Blocker, Harrier, Cover
**Mental**: Leader, Creator, Schemer, Controller, Warrior
**Physical**: Engine, Sprinter, Powerhouse, Ghost, Aerial

### Trait Modifiers (Examples)
| Trait | Effect | Bonus |
|-------|--------|-------|
| Drops Deep | Increases Build Up | +3 |
| High Pressure | Increases Pressing | +2 |
| Creator | Increases Creation | +2 |
| Clinical | Increases Finishing | +2 |
| Positional | Increases Blocking | +2 |
| Warrior | Increases Destruction | +2 |

---

## Formations

### Standard Format: X-Y-Z
- **X** = Defenders (DC/DR/DL/etc.)
- **Y** = Midfielders (DM/MC/etc.)
- **Z** = Attackers (AM/ST/etc.)

### Arsenal: 4-3-3
```
GK: Aaron Ramsdale
DR: Ben White
DC: William Saliba  DC: (Second center back)
DL: Jurrien Timber
DM: Declan Rice
MC: Martin Ødegaard
AM: Oleksandr Zinchenko
RW: Bukayo Saka
ST: Kai Havertz
LW: Leandro Trossard
ST: Gabriel Martinelli
```

### PSG: 4-3-3
```
GK: Gianluigi Donnarumma
DR: Achraf Hakimi
DC: Marquinhos  DC: Danilo Pereira
DL: Nuno Mendes
DM: Vitinha
MC: Marco Verratti
RW: Ousmane Dembélé
ST: Kylian Mbappé
LW: Luis Enrique
ST: Lionel Messi
```

---

## Match Simulation - Detailed Walkthrough

### Turn Structure (6 Turns Total, 90 minutes)
| Turn | Time | Home Attack | Away Attack |
|------|------|-------------|-------------|
| 1 | 0-15' | Arsenal attacks PSG | PSG attacks Arsenal |
| 2 | 15-30' | Arsenal attacks PSG | PSG attacks Arsenal |
| 3 | 30-45' | Arsenal attacks PSG | PSG attacks Arsenal |
| 4 | 45-60' | Arsenal attacks PSG | PSG attacks Arsenal |
| 5 | 60-75' | Arsenal attacks PSG | PSG attacks Arsenal |
| 6 | 75-90' | Arsenal attacks PSG | PSG attacks Arsenal |

---

## Calculation Examples

### Example 1: Arsenal Turn 1 - Possession Points

```
Arsenal attacking PSG

Step 1: Build Up vs Pressing
  Arsenal Build Up:  119.8
  PSG Pressing:      102.5
  ─────────────────────────
  Net Build Up:      17.3

  17.3 > 13 → 3 Possession Points ✓
```

### Example 2: Arsenal Turn 1 - Chance Creation

```
Arsenal has 3 Possession Points

For each PP:
  Creation Multiplier (Arsenal) = 1 + (88 / 20) = 1 + 4.40 = 5.40... wait this is calculated differently:
  
  Actually: 
  Arsenal Creation Total = 88
  Arsenal Creation Mult = 1 + (88 / 20) = 5.40
  PSG Destruction Total = 69
  PSG Destruction Mult = 1 + (69 / 20) = 4.45
  
  Chance Quality Score = 5.40 - 4.45 + Random(-0.3 to 0.3)
                       = 0.95 + 0.08
                       = 1.03
  
  1.03 is in range 0.5-1.49 → Half-chance (0.10 xG) ✓
  
Result: 3 Possession Points → could be:
  - 3 Half-chances (0.10 xG each) = 0.30 xG total
  - 2 Good + 1 Half = 0.50 xG total
  - 1 Big + 2 Half = 0.55 xG total
  (depends on random rolls each PP)
```

### Example 3: Arsenal Turn 1 - Goal Conversion

```
Arsenal created: 1 Good chance (0.20 xG), 2 Half-chances (0.10 xG each)

For each chance:
  Good chance (0.20 xG):
    Arsenal Finishing Mult = 1 + (77 / 20) = 4.85
    PSG Blocking Mult = 1 + (82 / 20) = 5.10
    
    Goal Probability = 0.20 × (4.85 / 5.10)
                     = 0.20 × 0.95
                     = 0.19 (19% chance)
    
    Random roll = 0.223
    0.223 > 0.19 → ❌ MISS
  
  Half-chance #1 (0.10 xG):
    Goal Probability = 0.10 × (4.85 / 5.10) = 0.09 (9% chance)
    Random roll = 0.736
    0.736 > 0.09 → ❌ MISS
  
  Half-chance #2 (0.10 xG):
    Goal Probability = 0.10 × (4.85 / 5.10) = 0.09 (9% chance)
    Random roll = 0.677
    0.677 > 0.09 → ❌ MISS

Result: 3 chances, 0 goals, 0.40 xG ✓
```

---

## Team Stat Calculation Formula

### Total Attribute
```
Team [Attribute] = SUM(player.[attribute] for each player in starting XI)

Example:
  Arsenal Creation Total = Ramsdale(3) + White(4) + Saliba(3) + Timber(5) 
                          + Rice(6) + Ødegaard(13) + Zinchenko(7) + Saka(10) 
                          + Havertz(8) + Trossard(9) + Martinelli(7)
                          = 88
```

### Multiplier
```
Multiplier = 1 + (Total Attribute / 20)

Example:
  Arsenal Creation Mult = 1 + (88 / 20) = 1 + 4.4 = 5.4
```

---

## Arsenal vs PSG - Key Matchup Stats

| Stat | Arsenal | PSG | Winner |
|------|---------|-----|--------|
| Build Up | 119.8 | 110.9 | Arsenal (+8.9) |
| Creation | 88 | 93 | PSG (+5) |
| Finishing | 77 | 83 | PSG (+6) |
| Pressing | 87.2 | 102.5 | PSG (+15.3) |
| Destruction | 69 | 60 | Arsenal (+9) |
| Blocking | 82 | 71 | Arsenal (+11) |

### Tactical Profile

**Arsenal**: Possession dominance + Strong defense
- Higher Build Up → More possession points
- High Blocking → Better defensive conversion
- Lower Pressing → Vulnerable to counter-attacks
- Lower Finishing → Must create volume

**PSG**: Aggressive pressing + Elite finishing
- High Pressing → Reduces opponent possession
- High Finishing × Messi/Mbappé → Elite conversion
- Lower Blocking → Vulnerable to sustained pressure
- Lower Destruction → Can't win back ball consistently

---

## Manager Cards

### Arsenal
| Card | Effect | Bonus | Use Case |
|------|--------|-------|----------|
| High Press | +Pressing | +8 | Suffocate PSG in midfield |
| Defensive Shape | +Blocking | +4 | Shore up defense late |
| Creative Burst | +Creation | +5 | Unlock chance-making |

### PSG
| Card | Effect | Bonus | Use Case |
|------|--------|-------|----------|
| Counter Attack | +Finishing | +6 | Capitalize on transitions |
| Pressing Trap | +Destruction | +5 | Win ball back quickly |
| Creative Freedom | +Creation | +6 | Unlock Messi/Verratti |

---

## MVP Features Checklist

- [x] Match simulation (6 turns, both teams)
- [x] Two complete team configs (Arsenal, PSG)
- [x] 26 real player cards with attributes
- [x] Manager cards (3 per team)
- [x] Calculation engine (Build Up → Creation → Finishing)
- [x] xG tracking and output
- [x] Web UI (team display, match simulator, results)
- [x] Python backend (classes, methods, calculations)
- [x] JSON data structure (players, teams)
- [x] Documentation (PRD, README, Quick Ref)

---

## Quick Debug Checklist

When testing:
1. Do team attribute totals match the sum of starting XI?
2. Are multipliers calculated as 1 + (total / 20)?
3. Does Net Build Up threshold table work correctly?
4. Are chances created per Possession Point?
5. Is goal probability bounded to 5%-50%?
6. Are xG values tracked per chance type?
7. Is match log accurate after 6 turns?

---

## File Dependencies

```
index.html
  ├─ No external dependencies (hardcoded team data)
  └─ Can be opened directly in browser

match_engine.py
  ├─ Requires: teams.json, players.json
  ├─ No external libraries (standard Python)
  └─ Run from terminal with Python 3.6+

teams.json
  ├─ Contains: Arsenal + PSG teams
  ├─ References: Player objects (duplicated from players.json)
  └─ Used by: match_engine.py, index.html (hardcoded version)

players.json
  ├─ Contains: 26 player card definitions
  ├─ Used by: match_engine.py, teams.json
  └─ Future: Expand for full player pool
```

---

## Next Development Priorities

1. **Flask Backend**: Connect Python engine to HTML UI
2. **Formation System**: Position penalties for misplaced players
3. **League Mode**: 10-team divisions, promotion/relegation
4. **Transfer Market**: Buy/sell/loan mechanics
5. **Youth Academy**: Youth development and training
6. **Class Synergies**: Multi-class bonuses (Striker + Sprinter = pace bonus)
7. **Trait Trees**: Unlock new traits through milestones
8. **Set Pieces**: Corners, free kicks, penalties
9. **Difficulty Modes**: Easy/Normal/Hard opponent AI
10. **Save/Load**: Career progression persistence

---

**Status**: MVP complete and ready for expansion. All core systems implemented.
