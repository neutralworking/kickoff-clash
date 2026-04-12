# Football Balatro - Product Requirements Document

## Project Overview
A career-sim football management game with Balatro-like card synergy mechanics. Players build squad decks, apply manager "skill" cards each match-turn, and grow players through transfers, youth development, and training.

## Core Gameplay Loop

### Match Format
- **6 turns** of 15 minutes (0-15', 15-30', 30-45', 45-60', 60-75', 75-90')
- Each turn:
  1. Draw/select manager skill cards
  2. Adjust formation/tactics/subs (optional)
  3. Resolve turn via chip × mult calculation

### Turn Resolution (Per team)

#### Step 1: Build Up → Possession Points
```
Net Build Up = Team Build Up - Opponent Pressing
↓ (threshold table)
Possession Points (0-3)
```

#### Step 2: Creation vs Destruction → Chances
```
For each Possession Point:
  Chance Quality Score = Team Creation mult - Opponent Destruction mult
  ↓ (threshold table)
  Chance: Half (0.10 xG) / Good (0.20 xG) / Big (0.35 xG)
```

#### Step 3: Finishing vs Blocking → Goals
```
For each Chance:
  Goal Probability = Chance xG × (Team Finishing mult / Opponent Blocking mult)
  ↓ (capped 5%-50%)
  Roll for goal (probabilistic)
```

## Player Card System

### Attributes (6 total)
**Offensive:**
- Build Up: Possession retention, press resistance
- Creation: Vision, penetration, chance creation
- Finishing: Shot conversion, composure

**Defensive:**
- Pressing: Work rate, pressing triggers
- Destruction: Tackling, ball-winning
- Blocking: Positioning, denial

### Player Identity
- **Position**: GK, DR/DL, DC, DM, MC, AMR/AML, ST
- **Level**: 1-10 (early) or 1-100 (if scaling)
- **Classes**: 1-4 classes per player (youth: 1, squad: 2, star: 3, elite: 4)
  - Each class = stat bias + signature effect + optional tradeoff
- **Traits**: Position-specific effects (e.g., "Drops Deep" = +3 Build Up)

### Class System
Classes from `Player-Classes-Classes.csv`:
- Offensive: Striker, Finisher, Provider, Passer, Dribbler
- Defensive: Marker, Destroyer, Blocker, Harrier, Cover
- Mental: Leader, Creator, Schemer, Controller, Warrior
- Physical: Engine, Sprinter, Powerhouse, Ghost, Aerial

Multiclass pairings: Class 1 + Class 2 = Archetype (from `Player-Classes-Multiclasses.csv`)

## Match Engine Reference

### Attribute Scaling
```
Attribute value = (Level × Class modifier) + Trait bonuses
```

### Multiplier Calculation
```
Creation mult = 1 + (Total Team Creation / 20)
Finishing mult = 1 + (Total Team Finishing / 20)
Destruction mult = 1 + (Total Team Destruction / 20)
Blocking mult = 1 + (Total Team Blocking / 20)
```

### Possession Points Thresholds
| Net Build Up | Result |
|------------|--------|
| ≤0 | 0 PP |
| 1-5 | 1 PP |
| 6-12 | 2 PP |
| 13+ | 3 PP |

### Chance Quality Thresholds
| CQS Score | Result |
|-----------|--------|
| <0.5 | No chance |
| 0.5-1.4 | Half-chance (0.10) |
| 1.5-2.4 | Good chance (0.20) |
| 2.5+ | Big chance (0.35) |

## Season Structure

### Transfer Windows
1. **Pre-season**: Main rebuild (higher rarity, bigger budget)
2. **Mid-season**: Patching (limited pool, loans available)

### Youth Academy
- Separate youth pool
- Youth training: 2-3× more effective than first team
- Promotion: Unlocks in first team, locks slower growth
- Youth start with 1 class, unlock others via training/milestones

### Training Cards
- Consumables: Attribute Boost, Role Focus, Trait Unlock
- Scale with youth (×1.5 multiplier)
- Earned from: Milestones, end-of-season rewards, events

## UI/UX Requirements

### Match Simulation View
- Team selection dropdown
- Formation display
- Live turn-by-turn log
- Goal probability calculations
- Final score and xG

### Team Builder
- Squad roster (11 players + subs)
- Player stats display
- Formation setup
- Manager card selection

### Data Display
- Player card: Position, Level, Classes, Traits, Attributes
- Team summary: Totals, multipliers, key stats

## Technical Stack
- **Backend**: Python (calculations, logic)
- **Frontend**: HTML/CSS/JavaScript (basic UI)
- **Data**: JSON (players, teams, manager cards)
- **Development**: VS Code

## MVP Scope
1. Match simulation (2 teams, 6 turns)
2. Two team configs (Arsenal, PSG) with subs
3. ~10 manager cards
4. Basic UI for team selection, match display
5. xG and detailed calculation output

## Future Features (Post-MVP)
- Full career mode (10-team league, promotions/relegations)
- Transfer market
- Youth academy management
- Training system
- Multiple formations
- Tactical adjustments
- Player injuries/suspensions
- Weather/stadium effects
- Set pieces
- Trait synergies
- Multi-class interaction rules
