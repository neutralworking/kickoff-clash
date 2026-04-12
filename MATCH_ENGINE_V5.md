Kickoff Clash — Match Engine v5: Active Card
Play
Status: Design Spec (Draft) Author: Luke + Claude Date: 2026-03-31 Replaces: v4
hand engine (passive resolution), v2 action cards (deprecated)

1. Design Intent
The match should feel like Balatro: you have a hand, you pick cards to play,
combinations score, and the quality of your deck determines what plays are available.
The XI is your hand. Committing cards to attack is “playing your hand.” Chemistry
connections are your “poker bonuses.” Manager cards (jokers) are passive modifiers.
The player makes one meaningful decision per increment: who attacks, who defends.
Two scoring axes drive in-match play: archetypes (what the card does) and roles (how
the card does it). Personality is a meta-layer — it shapes deckbuilding decisions
between matches but fires passively during them.
PvE: Unlimited time per deploy. Think as long as you want. The roguelike rewards good
decisions, not fast ones. PvP: 30-second timer per deploy. Pressure creates mistakes. If
the timer expires, your previous increment’s split is repeated automatically.

2. Match Structure
2.1 Timeline
Increment

Minute

Phase

Notes

1

15’

First half

No tactical subs allowed

2

30’

First half

No tactical subs allowed

—

HT

Half-time

Free sub/discard/formation change window

3

60’

Second half

Subs and discards available

4

75’

Second half

Subs and discards available

5

90’

Second half

Drama multiplier active

2.2 Match Resources
Resource

Starting

Replenish

Purpose

Subs

5

None

Swap bench card into XI (changes hand)

Discards

3

None

Toss bench cards, draw from remaining deck

Subs change your XI composition mid-match, altering available attack/defence
combos.
Discards cycle your bench, fishing for cards that unlock synergies when subbed in.
First half (increments 1–2): only injury subs allowed (preserves existing rule).
Half-time: free window to sub, discard, and change formation. No timer.
Second half (increments 3–5): subs and discards available between increments.
Formation changes are only allowed at half-time unless a special manager card
grants mid-match formation changes (see §6.2).

2.3 Deck Visibility
The remaining deck is fully visible during the match. The player can inspect:
Count of cards remaining in deck (shown as a number on a deck icon).
Full card list accessible via tap/expand — shows every undrawn card with
archetype, power, role.
Bench composition always visible at bottom of screen.
This is critical for informed discard decisions. “I have 4 cards left in deck, two are
Sprinters — worth discarding bench to fish for the Lightning Strike combo.” Hidden
information reduces agency; visible information rewards planning.

2.3 Match Setup (unchanged from v4)
1. Deal 18 cards from deck (shuffled, seeded).
2. Fill 11 formation slots by position eligibility + durability weighting → XI.

3. Remaining 7 → bench.
4. Undealt cards → remaining deck (draw pool for discards).

3. The Core Loop: Attack/Defend Split
3.1 Each Increment
┌─────────────────────────────────────────────┐
│

1. DEPLOY (30s timer)

│

│

• View XI (11 cards)

│

│

• Tap cards to commit to ATTACK

│

│

• Unselected cards auto-DEFEND

│

│

• Formation sets max attackers

│

• Synergy preview lights up in real-time│

│

│

│

│

2. RESOLVE (auto, ~5s animation)

│

│

• Attack score calculated

│

│

• Defence score calculated

│

│

• Goal chances derived

│

│

• Seeded roll → event

│

│

• Commentary + cascade animation

│

│

│

│

3. BETWEEN INCREMENTS (optional)

│

│

• Make subs (second half only)

│

│

• Discard from bench (second half only) │

│

• Fatigue check on Glass/Phoenix cards

│

└─────────────────────────────────────────────┘

3.2 Formation Attack Limits
The formation determines the maximum number of cards you can commit forward. This
makes formation choice a strategic decision about attacking ceiling vs defensive floor.
Max Attackers (Full

Min

Power)

Defenders

4-3-3

5

6

Balanced, versatile

4-4-2

4

7

Solid, classic

3-5-2

5

6

Midfield overload

Formation

Character

3-4-3

6

5

All-out attack, fragile

5-3-2

3

8

Defensive fortress

5-4-1

3

8

Ultra defensive, counter

4-2-3-1

5

6

Modern, flexible

4-1-2-1-2

5

6

Narrow, diamond
midfield

Soft cap: You can always commit MORE than the max, but cards beyond it contribute at
diminished power (50% for max+1, 25% for max+2). This means going all-in is possible
but expensive. See §15 for full detail.

4. Scoring: Attack Resolution
4.1 Attack Score
attack_score = (
sum(attacker.power for each committed attacker)
+ attack_synergy_bonus
+ style_attack_bonus
+ dual_role_contributions
+ tactic_attack_bonus
+ manager_attack_bonus
) × chemistry_multiplier

Attack synergy bonus: Only synergies where ALL participating cards are committed to
attack fire as attack synergies. A “Lightning Strike” (two Sprinters) only fires if both
Sprinters are attacking.
Style attack bonus: Playing style rewards specific archetype combinations in attack:
Style

Attack Bonus Archetypes

Bonus per Match

Tiki-Taka

Controller, Passer, Creator

+15% per card

Gegenpressing

Engine, Destroyer, Sprinter

+15% per card

Counter-Attack

Cover, Sprinter, Striker

+15% per card

Direct Play

Target, Powerhouse, Passer

+15% per card

Total Football

Any archetype

+5% per card

4.2 Defence Score
defence_score = (
sum(defender.power for each defending card)
+ defence_synergy_bonus
+ dual_role_contributions
+ tactic_defence_bonus
+ manager_defence_bonus
) × defensive_chemistry_multiplier

Defence synergy bonus: Synergies where all participating cards are in defence fire
defensively.

4.3 Dual-Role Cards
Certain archetypes and roles contribute to BOTH attack and defence regardless of
where assigned. This is their key value — they’re never wasted.
Archetype /

Contribution When

Role

Attacking

Controller

Full attack power

30% of power added to attack score

Passer

Full attack power

25% of power added to attack score

Engine

Regista (role)

Libero (role)

Commander

70% to attack, 30% to
defence
Full attack power
Full attack power + attacker
boost
20% of power added to
defence

Contribution When Defending

70% to defence, 30% to attack
35% of power added to attack (long
pass)
20% of power added to attack

Full defence power

How this reads in practice:
A Regista sitting in defence still sprays passes forward → 35% of their power boosts
the attack. This means keeping them back isn’t purely defensive.

An Engine attacking contributes 70% power to attack and 30% to defence.
Defending, it’s the reverse. They’re always useful but placement matters — an
Engine attacking is a different proposition to one defending.
A Commander committed to attack still organises the defence → 20% defensive
contribution. Natural leadership.

4.4 Goal Resolution
your_attack_ratio

= your_attack_score / opponent_defence_baseline

your_goal_chance

= clamp(0.08 + (your_attack_ratio - 1.0) × 0.20, 0.03, 0.45)

their_attack_ratio

= opponent_attack_baseline / your_defence_score

their_goal_chance

= clamp(0.08 + (their_attack_ratio - 1.0) × 0.20, 0.03, 0.35)

0.08 base: ~8% chance of scoring even when evenly matched.
0.03 floor: You can never fully shut out an opponent (or be fully shut out).
0.45 ceiling (you), 0.35 ceiling (opponent): Player is slightly favoured to keep
agency feeling positive.
90th minute drama: Both chances ×1.3 at increment 5.
Opponent baselines scale by match number (existing opponent system):
Match

Opponent

Attack Baseline

Defence Baseline

1

FC Warm-Up

400

450

2

Dynamo Midtable

550

600

3

Real Ambition

700

750

4

AC Nightmare

850

900

5

The Invincibles

1000

1050

4.5 Situational Abilities
Individual card abilities (from tactical roles) are gated by assignment. A defensive
ability only fires when the card is defending. An attacking ability only fires when
attacking. This creates meaningful trade-offs: a card might be more valuable in defence
because of their ability, even if their raw power would help the attack.

Defensive abilities (only fire when card is DEFENDING):
Role / Ability

Effect

Stopper: Front Foot

+15% own power when defending (Destroyer)

Anchor: The Shield

Lowest-power defender gets +30%

Volante: Tackle & Go

-5% opponent goal chance

Torwart: Command

All CB-slot defenders get +5%

Sweeper Keeper: Sweep

Cover cards in defence get +10%

Zagueiro: Organise

Commander cards in defence get +10%

Last Ditch Tackle

15% chance to cancel an opponent goal (new)

Attacking abilities (only fire when card is ATTACKING):
Role / Ability

Effect

Poacher: Box Presence

+15% goal chance when 2+ attackers committed

Winger: Touchline

+20% own power in wide slot

Extremo: Jet Heels

+20% own power (Sprinter only)

Inverted Winger: Cut
Inside
Prima Punta: Target Man
Seconda Punta: Between
Lines
Clinical Finish

+15% own power (Dribbler/Striker)
+20% own power (Target), Passers get +10%
+10% own power in AM/CF slot
Doubles this card’s contribution if exactly 1 attacker
committed (new)

Dual abilities (fire regardless of assignment, but effect changes):
Role / Ability

When Attacking

Trequartista: Moment

30% chance: own power

of Genius

doubled

When Defending
30% chance: +15% to defence

Regista: Metronome

Enganche: The Hook

Libero: Surgical Pass
Mezzala: Half-Space

+5% to all attack synergy

+5% to all synergy bonuses

bonuses

(both sides)

Best attacker gets +25%,

Best attacker gets +15%

self -10%

(reduced)

All attackers get +10%

All attackers get +5%
(reduced)

+15% in CM slot

+10% in CM slot

Tuttocampista: Box to

+3% per unique archetype

+3% per unique archetype in

Box

attacking

XI

Fantasista: Magic

+15% own power (Creator)

+10% own power (Creator)

Both Lateral + Winger get

Lateral gets +10%, Winger

+15%

unaffected

Controller attackers get

Controller defenders get

+10%

+10%

Run

Lateral: Overlap

Metodista: Tempo

Fluidificante: Surge

+10% self, +10% nearest
attacker

+10% self only

Design note: The player sees ability text on each card. During deploy, tapping a card to
commit it to attack should flash its ability and whether it activates in that position. A
greyed-out ability = “this fires if you put me in defence instead.” This is the information
layer that makes the deploy decision rich without adding cognitive load — it’s right there
on the card.

5. Chemistry in Attack vs Defence
5.1 Positional Chemistry
Synergies now fire contextually based on where the participating cards are deployed.
Attack synergies (all participants committed to attack):
Synergy

Trigger

Attack Bonus

Lightning Strike

2× Sprinter attacking

+15% combined power

Double Trouble

2× Striker attacking

+15% combined power

Creative Spark

2× Creator attacking

+20% combined power

Skill Show

2× Dribbler attacking

+15% combined power

Aerial Dominance

2× Target attacking

+20% combined power

Passing Carousel

2× Passer attacking

+15% combined power

Defence synergies (all participants defending):
Synergy

Trigger

Defence Bonus

Brick Wall

2× Destroyer defending

+25% combined power

Fortress

2× Cover defending

+20% combined power

Chain of Command

2× Commander defending

+20% combined power

Puppet Masters

2× Controller defending

+15% combined power

Cross synergies (participants split across attack and defence):
Synergy

Trigger

Counter

Destroyer defending + Sprinter

Punch

attacking

The Link
Pressing
Trap
Shield &
Sword

Bonus
Sprinter gets +25% power

Creator/Passer defending + Striker

Striker gets +20% (the through

attacking

ball)

Engine defending + Engine attacking

Cover defending + any attacking

Both get +15% to their
respective sides
Cover gets +15%, attacker gets
+10%

Design note: Cross synergies are the most interesting because they reward splitting
specific pairs, creating tension with the instinct to stack your best cards together.

5.2 Role Combos (Tier 2)
Existing role combos (The Pirlo-Barella, Shield & Sword, etc.) still fire but now respect
positioning:

Both in attack → combo bonus applies to attack score.
Both in defence → combo bonus applies to defence score.
Split → the combo generates a cross synergy (bonus to both sides, reduced by
30%).

5.3 Personality Resonance (Tier 3) — Passive Meta-Layer
Personality themes are calculated once at match start based on XI composition. They
do not change with the attack/defend split. They appear as a flat line item in the
cascade. The player does not think about personality during deploy — they think about it
during deckbuilding and squad selection between matches.
This is a deliberate design separation:
Archetypes + Roles → active in-match decisions (what to attack/defend with)
Personality → passive between-match decisions (who to draft, who to keep)

Theme

General

Captain

Maestro

Catalyst

Professor

Resonance
Name

Trigger

Chain of

3+

Command

Generals

Siege

3+

Mentality

Captains

Silk

3+
Maestros

Passive Effect (whole match)

+10% total XI power (both sides)

+20% defence score

+15% attack score

Chaos

3+

Random ±20% to attack (rolled at match

Factor

Catalysts

start, fixed for duration)

System

3+

Player

Professors

+12% total XI power (both sides)

5.4 Perfect Dressing Room (Tier 4) — Passive Meta-Layer
All 5 personality themes represented in XI → ×1.5 multiplier to both attack and
defence scores for the entire match. Calculated once at match start.
Reduced from ×2.0 to ×1.5 because in v5, this bonus stacks with active chemistry
from archetype/role synergies. At ×2.0 it would dominate; at ×1.5 it’s a strong reward for
diverse drafting without making the active decisions irrelevant.

Design note: Perfect Dressing Room should be the aspirational deckbuilding goal — “I
need one more Professor to complete the set.” It’s the equivalent of a Balatro
achievement unlock that passively buffs your run. You build toward it across multiple
shop phases, not during a match.

6. Manager Cards (Jokers)
Jokers remain passive modifiers but now interact with the attack/defence split.

6.1 Existing Jokers (Updated)
Joker

Effect

The Dinosaur

+30 to attack per Target/Powerhouse committed to attack

The Professor

+25 to attack per Controller/Passer committed to attack

The Mourinho

+50 to defence per Destroyer/Cover in defence

The Gambler

Glass/Phoenix cards contribute +40 to whichever side

Youth Developer

+20 to attack per Common card committed to attack

The Hairdryer

+80 to attack if Captain personality in XI

Chemistry Set

Each synergy triggered gives +20 (attack or defence)

Scout’s Eye

+1 discard per match

6.2 New Jokers
Joker

Rarity

The Pragmatist

Common

The Entertainer

Common

Counter-Punch
Artist
Dressing Room

Uncommon

Effect
+15 defence per card defending beyond the
formation minimum
+20 attack per card attacking, but -10 defence per
card
+40 attack if you committed ≤3 attackers (reward
defence)
Cross synergies give +50% bonus instead of

Leader

Uncommon

The Rotator

Uncommon

The Fox in the
Box
The Mercato
The Inverted
Pyramid
The ShapeShifter

Rare

standard
Subs cost 0 resources (unlimited subs, still 5 per
match)
If exactly 1 attacker committed, that card gets ×2
power

Rare

+2 discards per match

Rare

Formation max attackers +2 (can overcommit)

Rare

The Tinker

Uncommon

Perfect Game

Legendary

Allows formation change at any between-increment
window, not just HT
Allows one free formation change per match (at any
point)
If you win without conceding, double all match
rewards

Joker pool target: 20+ total (8 existing + 12+ new). Expanded over time.
Formation change rules:
By default, formation can only change at half-time.
The Shape-Shifter joker unlocks formation changes at any between-increment
window.
The Tinker gives one free mid-match formation change (consumed on use).
Changing formation re-evaluates slot eligibility for the current XI but does not force
subs.

7. Tactics Cards (Updated)
Tactic cards now explicitly modify attack or defence baselines.

7.1 Attacking Tactics
Tactic

Effect

High Line

+15% attack score, opponent gets +10% attack (risky)

Press High

+20% attack if Engine/Destroyer in XI, else +5 flat

Wing Play

+10% attack per Dribbler/Sprinter committed to attack

Narrow Shape

+10% attack per Controller/Passer committed to attack

7.2 Defensive Tactics
Tactic

Effect

Low Block

+20% defence score, -10% attack score

Sit Deep

+15% defence, cumulative -5% attack per increment

Fortress

+25% defence at 15’, fading to 0% by 90’

7.3 Specialist Tactics
Tactic

Effect
+25 flat attack bonus in any increment where opponent scored

Counter Attack

last

Possession Game
Set Piece

+5% cumulative attack bonus per increment (rewards patience)
+15 attack per Target/Commander in XI

Specialists
Dark Arts

+20 attack flat, -10% opponent attack, 15% red card risk

Youth Policy

+20 attack per Common rarity card committed to attack

8. Opponent AI
8.1 Opponent Styles
Each opponent has a style that determines how their attack/defence baseline shifts per
increment.
Style

Behaviour

Passive

Flat baselines, no adaptation

Balanced

Even split, slight increase in attack if losing

Attacking

Higher attack baseline (+20%), lower defence (-10%)

Counter

Low attack early, +30% attack in increments after conceding

Adaptive

Mirrors your split — if you go heavy attack, they go heavy defence

8.2 Opponent Cards (Visual Flavour)
Opponents don’t play cards mechanically, but the commentary references their “plays”
for narrative texture. The opponent build data (star player, synergies, weakness) feeds
the commentary engine.

8.3 Weakness Exploitation
Each opponent has a weaknessArchetype . If you commit 2+ cards of that archetype to
attack, your attack score gets +15% bonus. Telegraphed in the opponent preview before
the match — rewards building toward specific counters.

9. Durability in the New System
9.1 Fatigue Model (Updated)
Glass and Phoenix cards now fatigue based on how often they attack, not just how
long they’re on the pitch.
Attack Fatigue

Defence Fatigue

Shatter Risk (post-

Risk

Risk

match)

Glass

15% per attack

5% per increment

20%

Phoenix

12% per attack

3% per increment

30% (but resurrects)

Fragile

0%

0%

0% (10% injury instead)

Standard

0%

0%

0%

Iron

0%

0%

0%

Titanium

0%

0%

0%

Durability

Design note: This creates an interesting tension — Glass cards are often high-power, so
you want to attack with them, but each attack risks fatigue. Do you commit your Glass
Striker every increment or save them for the decisive moment?

9.2 Injured Cards
Injured cards can still defend (reduced to 50% power) but cannot be committed to
attack. This makes injury subs more urgent and meaningful.

10. UI Sketch
10.1 Deploy Phase (Main Interaction)
┌──────────────────────────────────────────┐
│

15' vs Dynamo Midtable

0-0

│

│

│

│

╔══════════════════════════════════╗

│

║

│

║

│

║

│

╠══════════════════════════════════╣

│

║

│

╠══════════════════════════════════╣

│

║

║

│

│

║

[Card] [Card] [Card] [Card]

║

│

│

║

[Card] [Card] [Card] [Card]

║

│

│

║

(remaining cards, dimmed)

║

│

│

╚══════════════════════════════════╝

ATTACK ZONE

│

║

│

[Card] [Card] [Card]

║

│

(tapped cards glow gold)

║

│

PITCH LINE

│

║

DEFEND ZONE

│
│

│

│

│

│

Synergies:

│

Attack: 342

Lightning Strike (+15%)
|

│

Defence: 456

│

│

│
▶ KICK OFF

│

[

]

│

┌──────┐ ┌──────┐ ┌──────┐

│

│Bench1│ │Bench2│ │Bench3│ ...

│

└──────┘ └──────┘ └──────┘

│
│
│
│

└──────────────────────────────────────────┘

Tap a card in the defend zone to commit it to attack (slides up).
Tap an attacking card to pull it back to defence (slides down).
Ability text on each card shows active (lit) or inactive (greyed) based on current

assignment. A Stopper’s “Last Ditch Tackle” greys out when committed to attack.
Synergy preview updates in real-time as you move cards.
Attack/Defence scores update live so you can see the impact.
Bench visible at bottom for sub planning.
Deck icon (bottom-right) shows remaining card count. Tap to expand full deck list.
No timer in PvE. In PvP, a 30s countdown bar appears at top.

10.2 Resolution Phase (Auto-animation)
┌──────────────────────────────────────────┐
│

15'

│

│

│

│

YOUR ATTACK: 342

│

│

├─ Base power: 220

│

│

├─ Lightning Strike: +33

│

│

├─ Gegenpressing bonus: +44

│

│

├─ Regista long pass: +25

│

│

├─ Silk (3× Maestro): +15%

│

└─ Manager (The Dinosaur): +20

│

│

│
│

│

vs OPPONENT DEFENCE: 450

│

│

Goal chance: 12%

│

│

│

│

GOAL! 15' — Thunderbolt into

│

│

the top corner! The Lightning

│

│

Strike synergy pays off!

│

│

│

│

YOUR DEFENCE: 456

│

│

vs OPPONENT ATTACK: 400

│

│

Concede chance: 6%

│

│

Saved — cleared off the line.

│
│

│
│

[

▶ NEXT: 30'

]

│

└──────────────────────────────────────────┘

The cascade scrolls Balatro-style: base → synergies → style → manager → total.

11. Data Migration Notes

11.1 Character Data Fix
The kc_characters.json model field uses display names (Fullback, Enforcer, Leader,
etc.) while the chemistry/scoring system expects archetype IDs (Controller,
Commander, Creator, etc.). The transform.ts mapping must be audited to ensure all
500 characters correctly resolve to the 13 core archetypes used by the synergy engine.

11.2 Power Range
Current range: 71–95 (avg 81). With 11 cards, team totals cluster around 880–900. This
is too compressed for meaningful attack/defence splits.
Recommendation: Widen to 50–99 with a flatter distribution. Common cards: 50–65.
Uncommon: 60–80. Rare: 75–95. This gives more room for chemistry to matter relative
to raw power.

11.3 New Fields on Card
interface Card {
// ... existing fields ...
attackContribution: number;

// 0–1, how much power goes to attack when committed

defenceContribution: number;

// 0–1, how much power goes to defence when defending

dualRoleAttack: number;

// 0–1, attack contribution when DEFENDING (e.g., Regista 0.3

dualRoleDefence: number;

// 0–1, defence contribution when ATTACKING (e.g., Commander

}

These can be derived from archetype at transform time — no need to store percharacter.

12. Balance Targets
Metric
Match duration
Decisions per match
Win rate vs Match 1 (good
deck)
Win rate vs Match 5 (good

Target
2–3
minutes

Rationale
Roguelike pacing, 5 matches per run

8–12

5 deploy + 2–3 subs + 1–2 discards

~85%

Warm-up should feel winnable

~40%

Final boss should feel hard

deck)
Chemistry contribution to
score
Dual-role impact

Goals per match (average)
Optimal attack split (most
matches)

15–30%
5–15%
2.5
combined
3–4 cards

Meaningful but not dominant over card
quality
Noticeable, rewards knowledge

Enough events to feel dramatic

Going all-in should be rare and risky

13. Implementation Priority
Phase 1: Core Loop
1. Attack/defend card assignment UI (tap to commit)
2. Split scoring (attack score + defence score)
3. Goal resolution against opponent baselines
4. Cascade animation

Phase 2: Chemistry & Abilities
5. Positional synergy detection (attack/defence/cross)
6. Live synergy preview during deploy phase
7. Dual-role contributions
8. Situational ability gating (§4.5 — abilities activate/deactivate based on assignment)

Phase 3: Resource Management
9. Subs in second half
10. Bench discards + draw from remaining deck (deck visible)
11. Fatigue on Glass/Phoenix attackers
12. Formation change at half-time

Phase 4: Polish

13. New jokers (attack/defence aware, formation-change jokers)
14. Updated tactic cards
15. Opponent weakness exploitation
16. Expanded joker pool
17. Passive personality resonance at match start

14. Resolved Decisions
Question

Decision

Timer

PvE: unlimited. PvP: 30 seconds, auto-repeat last split on expiry.

Deck visibility

Fully visible — card count and full list accessible during match.

Formation

Allowed at half-time by default. Manager cards (Shape-Shifter, Tinker)

changes

unlock mid-match changes.

Momentum

No. Adds complexity without improving the core decision.

Card abilities

Situational — abilities gate on attack/defend assignment (see §4.5).

Personality

Passive meta-layer. Calculated once at match start. Not part of deploy

in-match

decisions.

15. Resolved (Round 2)
Question
Attack
limits
Discard
timing

Decision
Soft cap with
diminishing
returns
Immediate

Implementation Note
Cards beyond formation max contribute at 50% power.
Allows overcommitting with a cost.
Discard → draw → sub in same window. Enables fishing
combos in one action sequence.

PvP

Simultaneous

Both players pick, both reveal, both resolve. No reactive

deploy

reveal

play, rewards reads.

Cross

Visible in

All synergies (including cross) listed in a collection

synergy

visibility
Engine
split
math

codex

screen. Players can build toward them deliberately.
Engine attacking = 70% attack, 30% defence. Engine

70/30 to
assigned side

defending = 70% defence, 30% attack. Rewards correct
placement.

Soft Cap Detail
When committing attackers beyond the formation’s max:
Cards 1 to max:

100% power contribution

Cards max+1:

50% power contribution

Cards max+2:

25% power contribution (if Inverted Pyramid joker)

Example: 4-4-2 has max 4 attackers. Committing a 5th attacker (power 80) adds 40 to
attack score instead of 80. The trade-off is real but not prohibitive — sometimes the
synergy unlocked by that 5th card is worth the diminished raw power.
The Inverted Pyramid joker raises the formation max by 2, meaning those extra cards
contribute at full power instead of diminished.

