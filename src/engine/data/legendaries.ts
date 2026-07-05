/**
 * KC rebuild engine — hand-authored Legendary signature loadouts (SM §5).
 *
 * The live pool carries exactly 5 Legendary cards; each gets a bespoke,
 * build-locked signature pair, merged OVER the generated assignment by
 * scripts/regenerate_cards.ts. Signatures are still template-stamped (QA
 * reviews templates, law 3) — the hand-authoring is the combination + the
 * name. Between them the five tile all ten coverage contexts, so the
 * Legendary band clears every coverage minimum. PROVISIONAL exemplars: the
 * full legendary redesign is a separate design ticket; this file is its
 * landing pad.
 */

export interface LegendarySignature {
  cardId: number;
  /** [templateId, signature display name] pairs, stamped at Legendary tier. */
  traits: [string, string][];
}

export const LEGENDARY_SIGNATURES: LegendarySignature[] = [
  {
    // Carlos Moreno — WD Dribbler "Fullback": the marauding outlet.
    cardId: 91,
    traits: [
      ['break-runner', 'El Huracán'],
      ['iron-lungs', 'Ninety-Minute Motor'],
    ],
  },
  {
    // Diego Andersen — DM Creator "Regista": the metronome capstone.
    cardId: 285,
    traits: [
      ['tempo-dictator', 'The Conductor'],
      ['momentum-banker', 'Compound Interest'],
    ],
  },
  {
    // Sven Maldano — WF Creator "Inverted Winger": the late-show talisman.
    cardId: 378,
    traits: [
      ['comeback-spark', 'Never Beaten'],
      ['showstopper', 'Lights On Late'],
    ],
  },
  {
    // Mateo Belmonte — AM Striker "Trequartista": the dead-ball artist.
    cardId: 422,
    traits: [
      ['dead-ball-specialist', 'Postage Stamp'],
      ['big-game-bonus', 'Occasion Player'],
    ],
  },
  {
    // Florian Drobny — WF Creator "Inverted Winger": the counter outlet who
    // thrives when the team sits deep, and the killer off the bench.
    cardId: 466,
    traits: [
      ['line-holder', 'The Outlet'],
      ['impact-sub', 'Board Goes Up'],
    ],
  },
];
