'use client';

/**
 * Kickoff Clash — Roster Canvas (design_handoff_player_cards "Player Cards").
 *
 * The full-roster / collection view: every owned card on the FULL portrait-card
 * chassis, grouped by class (Finishers → Creators → Engines → Controllers →
 * Destroyers → Walls → Keepers) and, within each class, ordered by rarity
 * (Legendary → Common) then ATK+DEF. Each section leads with a class-coloured
 * header + count + a Playfair blurb; each card wears a "RARITY · CLASS" eyebrow
 * and rises in with a staggered `cardRise`.
 *
 * Renders as CONTENT (no own scroll / no fixed viewport) so it slots inside the
 * SquadGallery scroller. Mobile-first: cards clamp to a phone-safe width so the
 * flex-wrap never introduces horizontal page-scroll.
 */

import type { Card } from '../lib/scoring';
import { deriveStats } from '../lib/funnel';
import { classOfCard, type PlayerClass } from '../lib/contest-map';
import GameCard from './cards/GameCard';
import { handoffClassColor, handoffTier } from './cards/cardTokens';

const HEAVY = "var(--font-heavy, 'Archivo Black', sans-serif)";
const BODY = "var(--font-body, 'DM Sans', sans-serif)";
const FLAVOUR = "var(--font-flavour, 'Playfair Display', serif)";

interface Section {
  key: PlayerClass | 'GK';
  label: string;
  blurb: string;
}

// Section order + copy, verbatim from the mock's renderRoster().
const SECTIONS: Section[] = [
  { key: 'Finisher', label: 'FINISHERS', blurb: 'Goals win matches. These win goals.' },
  { key: 'Creator', label: 'CREATORS', blurb: 'The final ball — chances from nothing.' },
  { key: 'Engine', label: 'ENGINES', blurb: 'Box to box, first whistle to last.' },
  { key: 'Controller', label: 'CONTROLLERS', blurb: 'Tempo, shape, and the pass that dictates.' },
  { key: 'Destroyer', label: 'DESTROYERS', blurb: 'Win it back. Break it up. Set the tone.' },
  { key: 'Wall', label: 'WALLS', blurb: 'The back line holds or the run ends.' },
  { key: 'GK', label: 'KEEPERS', blurb: 'Last line of defence.' },
];

const RARITY_RANK: Record<string, number> = { Legendary: 3, Epic: 2, Rare: 1, Common: 0 };

/** A card's group key — keepers (GK slot) group separately from the Wall class. */
function groupKey(card: Card): PlayerClass | 'GK' {
  return card.position === 'GK' ? 'GK' : classOfCard(card);
}

interface RosterCanvasProps {
  cards: Card[];
  onInspect: (card: Card) => void;
  /** Header eyebrow context (e.g. "SQUAD"). */
  title?: string;
}

export default function RosterCanvas({ cards, onInspect, title = 'SQUAD' }: RosterCanvasProps) {
  return (
    <section
      style={{
        minHeight: '100%',
        background: 'radial-gradient(ellipse at 50% 4%, #191022 0%, #0d0910 46%, #060406 100%)',
        padding: '26px 16px 88px',
      }}
    >
      <div style={{ maxWidth: 1260, margin: '0 auto' }}>
        {/* Header block */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ fontFamily: BODY, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold, #f5c542)', marginBottom: 9 }}>
            Kickoff Clash · {title} · {cards.length} Cards
          </div>
          <h1 style={{ fontFamily: HEAVY, fontSize: 'clamp(30px, 9vw, 54px)', color: 'var(--cream, #f2ead6)', margin: '0 0 10px', lineHeight: 1 }}>
            The Full Roster
          </h1>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: 'var(--cream-soft, #c9bb95)', maxWidth: 820, lineHeight: 1.6, margin: 0 }}>
            Every portrait, on the full-detail chassis — class disc, stacked position badges, framed pitch window, name &amp;
            archetype, ability rows, match-fit bar and the ATK / DEF corner discs. Grouped by class; within each,{' '}
            <strong style={{ color: 'var(--cream, #f2ead6)' }}>rarity leads</strong> (Legendary → Common).
          </p>
        </div>

        {/* Class sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {SECTIONS.map((section) => {
            const group = cards
              .filter((c) => groupKey(c) === section.key)
              .sort((a, b) => {
                const rr = (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0);
                if (rr) return rr;
                const sa = deriveStats(a);
                const sb = deriveStats(b);
                return sb.atk + sb.def - (sa.atk + sa.def);
              });
            if (!group.length) return null;
            const col = handoffClassColor(section.key === 'GK' ? 'Wall' : section.key);
            return (
              <div key={section.key}>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18, borderBottom: `1px solid ${col}33`, paddingBottom: 10 }}>
                  <span style={{ fontFamily: HEAVY, fontSize: 'clamp(16px, 5vw, 23px)', color: col, letterSpacing: '0.03em' }}>{section.label}</span>
                  <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--dust, #9a8b6a)' }}>{group.length}</span>
                  <span style={{ fontFamily: FLAVOUR, fontStyle: 'italic', fontSize: 12.5, color: 'var(--dust, #9a8b6a)', marginLeft: 'auto', textAlign: 'right' }}>{section.blurb}</span>
                </div>

                {/* Card wrap */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '26px 18px', justifyContent: 'flex-start' }}>
                  {group.map((card, i) => {
                    const tier = handoffTier(card.rarity);
                    return (
                      <div
                        key={card.id}
                        className="card-rise"
                        style={{ width: 'min(224px, 100%)', display: 'flex', flexDirection: 'column', gap: 7, animationDelay: `${Math.min(i, 16) * 55}ms` }}
                      >
                        <div style={{ fontFamily: BODY, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: tier.label, paddingLeft: 2 }}>
                          {card.rarity} · {section.key === 'GK' ? 'Keeper' : section.key}
                        </div>
                        <GameCard model={{ variant: 'player', card }} size="full" onClick={() => onInspect(card)} ariaLabel={`Inspect ${card.name}`} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
