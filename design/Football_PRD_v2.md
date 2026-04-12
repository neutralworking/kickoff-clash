# Football Balatrolike: Game Mechanics PRD

## 1. Overview
A single-player career simulation football management game with Balatro-like card synergy mechanics. Players build squad decks with player cards, apply manager skill cards each match turn, and grow players through transfers, youth development, and training. Core loop emphasizes numbers puzzles and tactical card combinations.

---

## 2. Season Structure & Progression

### 2.1 League System
- 10 teams per division with promotion/relegation each season.
- Each team plays 18 matches (2 vs. each opponent) per season.
- Two transfer windows: start of season and mid-season.

### 2.2 Squad Building Sources
- **Transfer Market:** Buy/sell/loan player cards (rarity-driven).
- **Youth Academy:** Separate youth pool; faster development than first-team.
- **Training Cards:** Consumables that improve first team or youth; youth receives higher growth efficiency.

### 2.3 Player Progression
- Players start with 1 class (youth), most have 2, elites can have 3–4.
- Each class grants integral attributes (Offensive, Defensive, Mental, Physical).
- Classes combine into archetypes with named effects and synergy traits.

---

## 3. Match Format (Core Loop)

### 3.1 Match Structure
- Matches resolve in **6 turns of 15 minutes** (0–15, 15–30, 30–45, 45–60, 60–75, 75–90).
- Each turn:
  1. Draw/use manager skill cards (global effects for that turn).
  2. Optionally adjust formation, tactics, or substitutions.
  3. Resolve the turn to generate chances and goals.

### 3.2 Base Team Scoring
- **Squad Base:** 11 players × Level + 1 manager × Level.
- **Example:** 11 players at Level 50 + manager at Level 50 = 600 base score.

### 3.3 Home/Away Modifier
- Home team receives **60%** of combined power, Away team receives **40%**.
- Away team suffers additional **Intimidating Crowd** morale debuff (e.g., -50 points).
- **Formula:** Combined total = Home score + Away score → Home gets 60%, Away gets 40%, then environmental effects applied.

### 3.4 Environmental Effects
- **Weather Traits** (e.g., Sunseeker): Specific players gain buffs on suitable weather days (+10 per player).
- **Captain Traits** (e.g., Inspiring Speaker): Negate/reduce negative environmental effects (e.g., recover 50% of morale debuff).

---

## 4. Player System: Classes, Attributes & Competence

### 4.1 Player Classes
Players have **1–4 classes**, each granting integral attributes:
- **Offensive:** Attacking ability, creativity in final third.
- **Defensive:** Structural integrity, resistance to attacks.
- **Mental:** Decision-making, concentration, leadership.
- **Physical:** Stamina, speed, strength.

Base class averages (across 25 classes):
- **Offensive:** 6.48
- **Defensive:** 4.60
- **Mental:** 6.20
- **Physical:** 6.12

### 4.2 Multi-class Archetypes
- Valid 2-class combinations form named archetypes (e.g., "Solid BPD" = Anchor + Ball-Playing Defender).
- Average 2-class player: ~47.6 total integral attributes.
- Frequency system (Common, Uncommon, Rare, Impossible) controls market availability and pack odds.

### 4.3 Position Competence
Players have competence ratings for each position:
- **Green:** Perfect position fit (no penalty, potential blueprint bonus).
- **Yellow:** Acceptable fit (small penalty, ~20% malus).
- **Red:** Out of position (large penalty, ~30% malus).

### 4.4 Competence Impact Formula
- **Green:** 100% player value.
- **Yellow:** 80% player value (-20% malus).
- **Red:** 70% player value (-30% malus).

---

## 5. Formation System & Blueprints

### 5.1 Formation Rules
Formations (e.g., 4-3-3, 3-5-2, 4-5-1) specify:
- Positional slots with their class/archetype requirements.
- Expected multi-class traits (e.g., "False 9" striker = movement + playmaking).

### 5.2 Blueprint Matching
- **Blueprint Match:** Player's class perfectly fits formation requirement → bonus (+20% value).
- **Blueprint Mismatch:** Player lacks required traits → malus (-20% value).
- **Positional Shift:** Players can swap positions if they have Green competence in the new slot (no penalty).

### 5.3 Blueprint Bonus/Malus Formula
- **Match:** Player score × 1.20 (+20%).
- **Mismatch:** Player score × 0.80 (-20%).
- **No Blueprint Effect:** Player score × 1.00 (neutral).

---

## 6. Manager System & Skill Cards

### 6.1 Manager Profiles
Managers have class profiles that determine available skill cards:
- **Tactico:** Formation cards that provide global buffs to all players.
- **Motivator:** Shout cards that boost team morale.

### 6.2 Skill Cards (Collectibles)
- Cards are purchasable or earned via packs after matches.
- **Formation Card (Tactico):** Apply formation change, global +5% efficiency boost to all 11 players.
- **Shout Card (Motivator):** Instant morale boost, global +10% buff to all players for one turn.

### 6.3 Card Timing
- Cards are played each turn (15-minute interval).
- Effects apply immediately to the team's score for that turn's chance generation.

### 6.4 Card Effect Formula
- **Global Buff:** Player Score × (1 + Buff %) for all players on team.
- **Stacking:** Multiple cards in same turn stack additively (e.g., +5% + +10% = +15% total).

---

## 7. Match Resolution: xG & Goal Scoring

### 7.1 Attribute Breakdown
Team score is divided into functional attributes:
- **Creativity:** 40% of total score (Mental + offensive elements; drives chance creation).
- **Defence:** 30% of total score (structural integrity; resists opponent chances).
- **Finishing:** 10% of total score (conversion ability; modifies goal probability).
- **Remaining:** 20% (unused in goal calculation; reserved for future mechanics).

### 7.2 Expected Goals Calculation

**Step 1 – Raw xG:**
```
Raw xG = Max(0, (Team Creativity – Opponent Defence))
```
- Floored at 0 (cannot be negative).
- Represents chance quality/volume without conversion skill.

**Step 2 – Finishing Modifier:**
```
Finishing Modifier = (Team Finishing Pool / 50)
```
- Normalizes finishing ability (e.g., 50 → 1.0x, 71.5 → 1.43x).

**Step 3 – Effective xG:**
```
Effective xG = Raw xG × Finishing Modifier
```
- Final probability of scoring in that turn.
- Typically 0.00–1.00+ per 15-minute turn.

### 7.3 Goal Resolution (Dice Roll)
- Roll a random float from 0.00 to 1.00.
- **Goal if:** `Roll < Effective xG`.
- Lower rolls represent "hitting the target" within the probability window.
- **No Goal if:** `Roll ≥ Effective xG`.

---

## 8. Example Game Summary

A match between Home and Away teams with 11 level 50 players each and a level 50 manager:

### Setup
- **Base Score:** 600 per team (550 players + 50 manager).
- **Home/Away Split:** Home receives 60% → +120; Away receives 40% → -120.
- **Environmental Debuff:** Away team receives -50 morale (Intimidating Crowd).
- **Tactical Adjustments:** Home has False 9 mismatch (-10) and out-of-position LB (-15); Away has winger blueprint matches (+20).
- **Turn 1 Scores:** Home 715, Away 495.

### Turn 1 Outcome (0–15 min)
- **Home:** Raw xG 0.070 × Finish Mod 1.43 = Effective 0.100 → Roll 0.254 → Miss.
- **Away:** Raw xG 0.160 × Finish Mod 0.99 = Effective 0.158 → Roll 0.031 → Goal.
- **Result:** 0–1 Away after 15 minutes.

### Turn 2 Adjustments (15–30 min)
- Home manager plays Formation Card (3-5-2 Tactico): +27.5 total (+5% all 11 players), fixes LB position (+15 recovery).
- Away manager plays Shout Card (Motivator): +55 total (+10% all 11 players).
- **New Scores:** Home 757.5, Away 550.
- xG calculations continue with updated power levels.

This example demonstrates how position competence, blueprint matching, manager cards, and dice rolls combine to determine match outcomes.

---

## 9. Key Mechanics Summary

| Mechanic | Formula | Example |
|---|---|---|
| **Level Scoring** | 11 × Player Level + Manager Level | 11 × 50 + 50 = 600 |
| **Home/Away Split** | (Home+Away) × 60% / 40% | 1200 total → Home 720, Away 480 |
| **Position Competence** | Base × (0.70 to 1.00) | Green 100%, Yellow 80%, Red 70% |
| **Blueprint Bonus/Malus** | Base × (0.80 to 1.20) | Match +20%, Mismatch -20% |
| **Skill Card Buff** | Base × (1 + Buff %) | Tactico +5%, Motivator +10% |
| **Attribute Pools** | Total Score × (0.40/0.30/0.10) | Creativity/Defence/Finishing |
| **Raw xG** | Max(0, Creativity – Opp Defence) | 286 – 148.5 = 137.5 |
| **Finishing Modifier** | Finishing Pool / 50 | 71.5 / 50 = 1.43x |
| **Effective xG** | Raw xG × Finishing Modifier | 0.070 × 1.43 = 0.100 |
| **Goal Resolution** | Roll < Effective xG | Roll 0.031 < 0.158 = Goal |

---

## 10. Player Classes (Current Roster)

```json
{
  "player_classes": [
    {
      "class_name": "Anchor",
      "attributes": {
        "offensive": 3,
        "defensive": 10,
        "mental": 5,
        "physical": 5
      },
      "total": 23,
      "description": "Defensive stronghold; excellent at resisting attacks."
    },
    {
      "class_name": "Ball-Playing Defender",
      "attributes": {
        "offensive": 5,
        "defensive": 9,
        "mental": 6,
        "physical": 5
      },
      "total": 25,
      "description": "Technical defender who can play out from the back."
    },
    {
      "class_name": "Box-to-Box",
      "attributes": {
        "offensive": 6,
        "defensive": 5,
        "mental": 6,
        "physical": 8
      },
      "total": 25,
      "description": "Complete midfielder; strong both offensively and defensively."
    },
    {
      "class_name": "Carrier",
      "attributes": {
        "offensive": 7,
        "defensive": 4,
        "mental": 5,
        "physical": 7
      },
      "total": 23,
      "description": "Aggressive midfielder who drives play forward."
    },
    {
      "class_name": "Classic 10",
      "attributes": {
        "offensive": 10,
        "defensive": 2,
        "mental": 7,
        "physical": 4
      },
      "total": 23,
      "description": "Pure attacking midfielder; creates chances."
    },
    {
      "class_name": "Colossus",
      "attributes": {
        "offensive": 3,
        "defensive": 9,
        "mental": 4,
        "physical": 9
      },
      "total": 25,
      "description": "Physically dominant defender."
    },
    {
      "class_name": "Complete Forward",
      "attributes": {
        "offensive": 8,
        "defensive": 5,
        "mental": 5,
        "physical": 7
      },
      "total": 25,
      "description": "Well-rounded striker; finishes and presses."
    },
    {
      "class_name": "Defensive Midfielder",
      "attributes": {
        "offensive": 3,
        "defensive": 8,
        "mental": 8,
        "physical": 5
      },
      "total": 24,
      "description": "Sits deep to protect the back line."
    },
    {
      "class_name": "Deep Lying Playmaker",
      "attributes": {
        "offensive": 4,
        "defensive": 5,
        "mental": 9,
        "physical": 5
      },
      "total": 23,
      "description": "Quarterback from deep; orchestrates play."
    },
    {
      "class_name": "Dribbler",
      "attributes": {
        "offensive": 9,
        "defensive": 3,
        "mental": 4,
        "physical": 7
      },
      "total": 23,
      "description": "Ball carrier; takes on defenders."
    },
    {
      "class_name": "Dynamic Attacker",
      "attributes": {
        "offensive": 9,
        "defensive": 3,
        "mental": 5,
        "physical": 6
      },
      "total": 23,
      "description": "High-energy forward; direct play style."
    },
    {
      "class_name": "Engine",
      "attributes": {
        "offensive": 4,
        "defensive": 5,
        "mental": 7,
        "physical": 8
      },
      "total": 24,
      "description": "High work rate; tireless running."
    },
    {
      "class_name": "False 9",
      "attributes": {
        "offensive": 9,
        "defensive": 2,
        "mental": 8,
        "physical": 4
      },
      "total": 23,
      "description": "Striker who drops deep; creates and finishes."
    },
    {
      "class_name": "Finisher",
      "attributes": {
        "offensive": 10,
        "defensive": 2,
        "mental": 4,
        "physical": 7
      },
      "total": 23,
      "description": "Elite goalscorer; converts chances."
    },
    {
      "class_name": "Inside Forward",
      "attributes": {
        "offensive": 9,
        "defensive": 2,
        "mental": 6,
        "physical": 6
      },
      "total": 23,
      "description": "Winger who cuts inside; scores and assists."
    },
    {
      "class_name": "Inverted Winger",
      "attributes": {
        "offensive": 8,
        "defensive": 2,
        "mental": 6,
        "physical": 7
      },
      "total": 23,
      "description": "Flank player who cuts inside naturally."
    },
    {
      "class_name": "Playmaker",
      "attributes": {
        "offensive": 7,
        "defensive": 3,
        "mental": 9,
        "physical": 4
      },
      "total": 23,
      "description": "Primary ball distributor; high creativity."
    },
    {
      "class_name": "Poacher",
      "attributes": {
        "offensive": 10,
        "defensive": 1,
        "mental": 5,
        "physical": 7
      },
      "total": 23,
      "description": "Pure striker; penalty box specialist."
    },
    {
      "class_name": "Pressing Forward",
      "attributes": {
        "offensive": 6,
        "defensive": 4,
        "mental": 6,
        "physical": 7
      },
      "total": 23,
      "description": "Aggressive forward; wins ball in transition."
    },
    {
      "class_name": "Regista",
      "attributes": {
        "offensive": 3,
        "defensive": 5,
        "mental": 10,
        "physical": 5
      },
      "total": 23,
      "description": "Deep playmaker; tempo-setter."
    },
    {
      "class_name": "Shadow Striker",
      "attributes": {
        "offensive": 9,
        "defensive": 2,
        "mental": 6,
        "physical": 6
      },
      "total": 23,
      "description": "Attacking midfielder in striker role."
    },
    {
      "class_name": "Spider",
      "attributes": {
        "offensive": 5,
        "defensive": 7,
        "mental": 5,
        "physical": 6
      },
      "total": 23,
      "description": "Technical fullback; excellent coverage."
    },
    {
      "class_name": "Sweeper Keeper",
      "attributes": {
        "offensive": 2,
        "defensive": 9,
        "mental": 6,
        "physical": 6
      },
      "total": 23,
      "description": "Goalkeeper who sweeps; plays with feet."
    },
    {
      "class_name": "Wide Creator",
      "attributes": {
        "offensive": 8,
        "defensive": 3,
        "mental": 7,
        "physical": 5
      },
      "total": 23,
      "description": "Winger focused on creating chances."
    },
    {
      "class_name": "Wide Midfielder",
      "attributes": {
        "offensive": 5,
        "defensive": 5,
        "mental": 6,
        "physical": 7
      },
      "total": 23,
      "description": "Balanced wide player; two-way threat."
    }
  ]
}
```

---

## 11. Manager Classes (Current Profiles)

```json
{
  "manager_classes": [
    {
      "manager_class": "Tactico",
      "available_cards": [
        {
          "card_name": "Formation Change",
          "effect": "Apply formation shift; global +5% efficiency to all 11 players.",
          "turn_cost": 1,
          "cooldown": 1
        }
      ],
      "description": "Tactical specialist; adjusts shape and maximizes player-formation synergy."
    },
    {
      "manager_class": "Motivator",
      "available_cards": [
        {
          "card_name": "Shout",
          "effect": "Instant morale boost; global +10% buff to all 11 players for one turn.",
          "turn_cost": 1,
          "cooldown": 1
        }
      ],
      "description": "Man-manager; rallies team spirit and psychological edge."
    }
  ]
}
```

---

## 12. Future Considerations

- Expanded manager class profiles and card variety.
- Injury system and player fatigue tracking.
- Trait synergies between multi-class combinations.
- Signature abilities triggered at specific match moments (chance creation, shot resolution, etc.).
- Youth development curves and academy investment ROI.
- Market fluctuations and player value changes.
- Advanced formation blueprints and role-specific attribute weighting.
