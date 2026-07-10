'use client';

/**
 * Kickoff Clash — CardModal
 *
 * The full-card overlay. Tapping any GameCard opens this: a dimmed scrim with a
 * large GameCard (size="full") on the left and the complete detail panel on the
 * right (stacked on a phone). The page never scrolls; the panel scrolls
 * internally if a bio runs long. Closes on backdrop tap, the close control, or
 * Escape.
 *
 * Detail content per variant:
 *   • Player     — position (long), archetype (+secondary), rating, rarity, nation,
 *                  durability, tags, strengths, weaknesses, quirk, bio.
 *   • Manager    — nation, philosophy, effect, trait pills.
 *   • Tactic     — category, effect, flavour, contradiction note.
 *   • Investment — ladder, tier, cost, Boardroom effect, flavour.
 */

import { useEffect, useState } from 'react';
import type { Card } from '../../lib/scoring';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard } from '../../lib/tactics';
import type { InvestmentCard } from '../../lib/economy';
import { getTacticById, tacticCapacity } from '../../lib/tactics';
import { contestsForCard, contestsForManager, contestsForTactic, CONTEST_META, type ContestKey } from '../../lib/contest-map';
import GameCard, { type GameCardModel } from './GameCard';
import { ContestIcons } from './ContestIcons';
import {
  PIXEL,
  RARITY_COLOR,
  POSITION_LABEL,
  DURABILITY_META,
  TACTIC_CAT_COLOR,
  INVESTMENT_META,
  eligiblePositions,
  positionChipVisual,
  fitnessMeter,
  formatCash,
  nationFlag,
  nationCode,
  managerTraitStyle,
  definingTraitsFor,
  roleBlurb,
  type ResolvedTrait,
} from './cardTokens';
import { deriveStats } from '../../lib/funnel';
import { conditionRecipe } from './portrait';

// Trait glyphs (✦ ➴ ⚑ …) sit outside the Silkscreen glyph set; render them in a
// Unicode-complete fallback stack so a symbol never renders as a blank tofu box.
const GLYPH_FONT = "'DejaVu Sans', 'Noto Sans Symbols', 'Segoe UI Symbol', sans-serif";

interface CardModalProps {
  model: GameCardModel | null;
  onClose: () => void;
}

export default function CardModal({ model, onClose }: CardModalProps) {
  useEffect(() => {
    if (!model) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [model, onClose]);

  if (!model) return null;

  const accent =
    model.variant === 'player'
      ? RARITY_COLOR[model.card.rarity] ?? RARITY_COLOR.Common
      : model.variant === 'manager'
        ? 'var(--kit-red)'
        : model.variant === 'tactic'
          ? TACTIC_CAT_COLOR[model.tactic.category] ?? 'var(--gold)'
          : INVESTMENT_META[model.investment.ladder]?.accent ?? 'var(--gold)';

  return (
    <div
      className="absolute inset-0 scrim-fade"
      style={{
        background: 'rgba(0,0,0,0.66)',
        backdropFilter: 'blur(2px)',
        zIndex: 60,
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* DEDICATED CLOSE BACKDROP — a full-bleed dismiss layer UNDER the content. Any
          tap that is not on the card or the detail panel lands here and closes the
          overlay. Making the dismiss a real, full-size hit target (rather than
          relying on whatever scrim a near-fullscreen card leaves over) is the fix
          for "clicking outside doesn't reliably close" — every variant inherits it.
          A plain div (not a button) avoids a second focusable "Close" control; the
          × button and Escape are the labelled affordances. */}
      <div
        aria-hidden
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      />

      {/* Foreground content — pointer-events pass THROUGH the empty parts of this
          layer to the backdrop button; only the card and detail re-enable events. */}
      <div
        className="absolute inset-0 flex flex-col"
        style={{
          padding: 'max(env(safe-area-inset-top), 16px) 16px max(env(safe-area-inset-bottom), 16px)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        {/* Close control row — the hint + the × button (both re-enable events). */}
        <div className="flex items-center justify-between shrink-0" style={{ marginBottom: 10, pointerEvents: 'auto' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.8, color: 'var(--dust)' }}>
            TAP OUTSIDE TO CLOSE
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="active:scale-90"
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-sm)',
              border: '2px solid var(--ink-black)',
              background: 'var(--surface)',
              boxShadow: '0 3px 0 0 var(--ink-black)',
              color: 'var(--cream)',
              fontFamily: PIXEL,
              fontSize: 16,
              lineHeight: 1,
              transition: 'transform 0.12s ease',
            }}
          >
            {'×'}
          </button>
        </div>

        {/* Card + detail. Each re-enables pointer events; the gaps between/around
            them stay click-through, so a tap on empty space hits the backdrop. */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-start" style={{ gap: 14, pointerEvents: 'none' }}>
          <div
            className="hero-pop shrink-0"
            style={{
              // Player + tactic are the tall Pixel-Hero cards, so they blow up larger.
              width: model.variant === 'player' || model.variant === 'tactic' ? 208 : 172,
              maxWidth: model.variant === 'player' || model.variant === 'tactic' ? '62%' : '48%',
              pointerEvents: 'auto',
            }}
          >
            <GameCard model={model} size="full" />
          </div>

          <div
            className="w-full min-h-0 overflow-y-auto"
            style={{ maxWidth: 360, overscrollBehavior: 'contain', pointerEvents: 'auto' }}
          >
            {model.variant === 'player' ? (
              <PlayerDetail card={model.card} accent={accent} />
            ) : model.variant === 'manager' ? (
              <ManagerDetail manager={model.manager} />
            ) : model.variant === 'tactic' ? (
              <TacticDetail tactic={model.tactic} charges={model.charges} accent={accent} />
            ) : (
              <InvestmentDetail investment={model.investment} accent={accent} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared detail primitives
// ---------------------------------------------------------------------------

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="pixel-edge"
      style={{
        background: 'var(--surface)',
        border: '2px solid var(--ink-black)',
        borderRadius: 'var(--radius)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)' }}>{children}</span>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        minWidth: 0,
      }}
    >
      <Label>{label}</Label>
      <span style={{ fontFamily: PIXEL, fontSize: 10.5, color: color ?? 'var(--cream)', lineHeight: 1.15, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
        {value}
      </span>
    </div>
  );
}

/** The little "i" affordance — same visual language as the inspect pips on the
 *  team-select sheets / match pitch, so "this is tappable for info" reads as one
 *  vocabulary across the app. Inverts to the accent while its tip is open. */
function InfoPip({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: active ? 'var(--gold)' : 'var(--ink-black)',
        border: `1.5px solid ${active ? 'var(--ink-black)' : 'var(--line-white)'}`,
        color: active ? 'var(--ink-black)' : 'var(--line-white)',
        fontFamily: PIXEL,
        fontSize: 7,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      i
    </span>
  );
}

/** The inline explainer box a tapped ROLE/DURABILITY cell expands into — same
 *  pixel/glass language as the rest of the panel (hard dark fill, 1px tinted
 *  border, PIXEL kicker). Inline (not floating) so it can never be clipped or
 *  mis-anchored inside the modal's internal scroll. */
function TipBox({ heading, body, color }: { heading: string; body: string; color: string }) {
  return (
    <div
      className="chip-reveal"
      style={{
        background: 'rgba(0,0,0,0.45)',
        border: `1px solid ${color}`,
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        padding: '7px 9px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        textAlign: 'left',
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.8, color, lineHeight: 1 }}>{heading}</span>
      <span style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--cream-soft)' }}>{body}</span>
    </div>
  );
}

/** A StatCell that taps open an inline explainer. Spans the full stat-grid row so
 *  the value + the "i" pip + the expanded tip all have room. Tapping the cell (or
 *  its open tip) toggles; the parent's document listener closes on any other tap. */
function TapStatCell({
  label,
  value,
  color,
  open,
  onToggle,
  tipBody,
}: {
  label: string;
  value: string;
  color: string;
  open: boolean;
  onToggle: (e: React.MouseEvent) => void;
  tipBody: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${label}: ${value}. Tap for explanation.`}
      style={{
        gridColumn: '1 / -1',
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        minWidth: 0,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span className="flex items-center justify-between" style={{ gap: 6 }}>
        <Label>{label}</Label>
        <InfoPip active={open} />
      </span>
      <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 11, color, lineHeight: 1.1 }}>
        {value}
      </span>
      {open && <TipBox heading={value.toUpperCase()} body={tipBody} color={color} />}
    </button>
  );
}

/** A labelled contest row for the detail panel — the pixel badges plus a readable
 *  label list, so the modal teaches which of the six contests the card touches.
 *  Renders nothing for an empty list (identity managers / neutral tactics). */
function ContestRow({ heading, keys }: { heading: string; keys: ContestKey[] }) {
  if (!keys.length) return null;
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <Label>{heading}</Label>
      <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
        <ContestIcons keys={keys} full />
        <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.5, color: 'var(--cream-soft)', lineHeight: 1.3 }}>
          {keys.map((k) => CONTEST_META[k].label).join(' · ')}
        </span>
      </div>
    </div>
  );
}

function TagRow({ items, color, bg }: { items: string[]; color: string; bg: string }) {
  return (
    <div className="flex flex-wrap" style={{ gap: 5 }}>
      {items.map((t) => (
        <span
          key={t}
          style={{
            fontFamily: PIXEL,
            fontSize: 8.5,
            letterSpacing: 0.3,
            color,
            background: bg,
            border: `1px solid ${color}`,
            borderRadius: 'var(--radius-lg)',
            padding: '4px 7px',
            lineHeight: 1,
          }}
        >
          {t.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PLAYER detail
// ---------------------------------------------------------------------------

function PlayerDetail({ card, accent }: { card: Card; accent: string }) {
  // The ROLE (a real, evocative on-pitch identity — Inverted Winger, Regista) is
  // what the player reads; the scoring-internal `archetype`/`secondaryArchetype`
  // are engine plumbing and no longer surfaced on the expanded card.
  const role = card.tacticalRole ?? card.archetype;
  // Defining traits — the marquee "what this card DOES" list. Signature/legend
  // loadouts surface first; otherwise the seeded rarity-count pick.
  const traits = definingTraitsFor(card);

  // Tap-to-open explainers (mobile-first: no hover). Tapping a cell toggles its
  // tip; tapping ANYWHERE else closes it via a document-level listener that never
  // preventDefault/stopPropagation's — so a backdrop tap still closes the whole
  // modal and Escape stays untouched. Each trigger stopPropagation's its opening
  // tap so the same click doesn't instantly self-close. ROLE and DURABILITY both
  // carry an explainer, so the open-tip is a small union rather than a boolean.
  const [openTip, setOpenTip] = useState<'role' | 'durability' | null>(null);
  useEffect(() => {
    if (!openTip) return;
    const close = () => setOpenTip(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openTip]);
  const toggleTip = (tip: 'role' | 'durability') => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenTip((cur) => (cur === tip ? null : tip));
  };

  const stats = deriveStats(card);
  const dura = DURABILITY_META[card.durability] ?? DURABILITY_META.standard;

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {/* ── IDENTITY: name + the headline OVERALL, the retro FM-screen banner ── */}
      <Panel>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--cream)', lineHeight: 1.15 }}>{card.name}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 9, color: accent, letterSpacing: 0.5, flexShrink: 0 }}>
            {card.rarity.toUpperCase()}
          </span>
        </div>

        <div className="flex" style={{ gap: 10, alignItems: 'stretch' }}>
          <OverallBadge power={card.power} accent={accent} />
          <div className="flex flex-col" style={{ gap: 6, flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: 'rgba(0,0,0,0.28)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 8px',
                minWidth: 0,
              }}
            >
              <PositionChip pos={card.position} primary />
              <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 10, color: accent, letterSpacing: 0.3, lineHeight: 1.1 }}>
                {POSITION_LABEL[card.position] ?? card.position}
              </span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <StatCell label="ATK" value={String(stats.atk)} color="var(--line-white)" />
              <StatCell label="DEF" value={String(stats.def)} color="var(--line-white)" />
            </div>
          </div>
        </div>

        {/* Where they can operate — eligible pitch positions as pixel chips. */}
        <div className="flex flex-col" style={{ gap: 6 }}>
          <Label>CAN OPERATE</Label>
          <div className="flex flex-wrap" style={{ gap: 5 }}>
            {eligiblePositions(card.position).map((p, i) => (
              <PositionChip key={p} pos={p} primary={i === 0} />
            ))}
          </div>
        </div>

        {/* ROLE — the prominent, accent-coloured on-pitch identity; taps open a
            one-line explainer (Regista/Trequartista/etc. are real football roles). */}
        <TapStatCell
          label="ROLE"
          value={role}
          color={accent}
          open={openTip === 'role'}
          onToggle={toggleTip('role')}
          tipBody={roleBlurb(role)}
        />

        {/* HELPS WITH — which of the six contests this card feeds. */}
        <ContestRow heading="HELPS WITH" keys={contestsForCard(card)} />
      </Panel>

      {/* ── DOSSIER: the two-column BIO | ATTRIBUTES stat screen (the reference
          layout, rendered in the pixel house style) ── */}
      <Panel>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
          {/* LEFT — the BIO ledger (label : value rows, alternating for the dense
              tabular read). */}
          <div className="flex flex-col" style={{ gap: 6, minWidth: 0 }}>
            <Label>BIO</Label>
            <div className="flex flex-col" style={{ gap: 3 }}>
              <BioRow label="NATION" value={nationValue(card.nation)} alt />
              <BioRow label="CHARACTER" value={(card.personalityTheme ?? '—').toUpperCase()} color={accent} />
              <BioRow label="AKA" value={card.nickname ? `“${card.nickname}”` : '—'} alt />
              <BioRow label="GRADE" value={card.rarity.toUpperCase()} color={accent} />
            </div>
          </div>

          {/* RIGHT — the ATTRIBUTES column: the four pillars under evocative
              football labels, each a retro number + a crisp pixel bar (0–99). */}
          <div className="flex flex-col" style={{ gap: 6, minWidth: 0 }}>
            <Label>ATTRIBUTES</Label>
            <div className="flex flex-col" style={{ gap: 7 }}>
              {PILLAR_META.map((p) => (
                <AttrRow key={p.key} label={p.label} value={card.pillars?.[p.key] ?? 0} />
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {/* ── AVAILABILITY: the "100% MATCH FIT" analogue — legs, wear, apps, and the
          durability grade (all the "can this card play, and for how long" reads) ── */}
      <Panel>
        <Label>AVAILABILITY</Label>
        {typeof card.fitness === 'number' && <AvailabilityBar fitness={card.fitness} />}
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <ConditionCell condition={card.condition} />
          <StatCell label="APPS (RUN)" value={String(card.matchesPlayed ?? 0)} color="var(--line-white)" />
        </div>
        <TapStatCell
          label="DURABILITY"
          value={dura.label}
          color={dura.color}
          open={openTip === 'durability'}
          onToggle={toggleTip('durability')}
          tipBody={dura.blurb}
        />
      </Panel>

      {traits.length > 0 && <TraitsSection traits={traits} rarity={card.rarity} accent={accent} />}

      {card.abilityText && (
        <Panel>
          <Label>{(card.abilityName ?? 'Ability').toUpperCase()}</Label>
          <span style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--cream-soft)' }}>{card.abilityText}</span>
        </Panel>
      )}

      {(card.strengths?.length || card.weaknesses?.length) && (
        <Panel>
          {card.strengths && card.strengths.length > 0 && (
            <div className="flex flex-col" style={{ gap: 6 }}>
              <Label>STRENGTHS</Label>
              <TagRow items={card.strengths} color="var(--success)" bg="rgba(52,196,106,0.12)" />
            </div>
          )}
          {card.weaknesses && card.weaknesses.length > 0 && (
            <div className="flex flex-col" style={{ gap: 6 }}>
              <Label>WEAKNESSES</Label>
              <TagRow items={card.weaknesses} color="var(--danger)" bg="rgba(232,54,47,0.12)" />
            </div>
          )}
        </Panel>
      )}

      {card.tags && card.tags.length > 0 && (
        <Panel>
          <Label>TAGS</Label>
          <TagRow items={card.tags} color="var(--gold)" bg="rgba(245,197,66,0.1)" />
        </Panel>
      )}

      {card.bio && (
        <Panel>
          <p style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--cream-soft)', margin: 0 }}>{card.bio}</p>
        </Panel>
      )}
    </div>
  );
}

/**
 * The marquee Traits section — the place a player reads what a card actually DOES.
 * Each defining trait is glyph + label + one-line blurb, coloured by its kind.
 * Rarity lands as identity here: a Legendary fills this panel with 4 actions, a
 * Common with 1. Signature/legend traits sort first and carry a SIGNATURE badge.
 */
function TraitsSection({ traits, rarity, accent }: { traits: ResolvedTrait[]; rarity: string; accent: string }) {
  // Signature traits first, original order preserved within each group.
  const ordered = [...traits].sort((a, b) => Number(b.signature) - Number(a.signature));
  return (
    <Panel>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <Label>{ordered.length > 1 ? 'ACTIONS' : 'ACTION'}</Label>
        <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 0.5, color: accent, lineHeight: 1 }}>
          {rarity.toUpperCase()} · {ordered.length}
        </span>
      </div>
      <div className="flex flex-col" style={{ gap: 8 }}>
        {ordered.map((t, i) => (
          <TraitRow key={`${t.name}-${i}`} trait={t} />
        ))}
      </div>
    </Panel>
  );
}

/** One defining-trait row: a coloured pixel glyph badge, the label (+ signature
 *  marker), and the Marvel-Snap-voice blurb of what the action does. */
function TraitRow({ trait }: { trait: ResolvedTrait }) {
  const { color, bg } = trait.style;
  return (
    <div className="flex" style={{ gap: 9, alignItems: 'flex-start' }}>
      {/* Kind glyph badge — a hard chip in the trait's kind colour. The glyph is
          drawn in a Unicode-complete face (it falls outside the pixel font's set,
          which is why the on-card chips used to read blank). */}
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 26,
          height: 26,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: GLYPH_FONT,
          fontSize: 14,
          lineHeight: 1,
          color,
          background: bg,
          border: `1px solid ${color}`,
          borderRadius: 4,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.28)',
        }}
      >
        {trait.copy.glyph}
      </span>
      <div className="flex flex-col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
        <div className="flex items-center" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 10.5, color, letterSpacing: 0.3, lineHeight: 1.1 }}>
            {trait.copy.label.toUpperCase()}
          </span>
          {trait.signature && (
            <span
              style={{
                fontFamily: PIXEL,
                fontSize: 6.5,
                letterSpacing: 0.6,
                lineHeight: 1,
                color: 'var(--gold)',
                background: 'rgba(245,197,66,0.12)',
                border: '1px solid var(--gold)',
                borderRadius: 3,
                padding: '2px 4px',
              }}
            >
              SIGNATURE
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--cream-soft)' }}>{trait.copy.blurb}</span>
      </div>
    </div>
  );
}

/** A small pixel position chip — the player's own slot is filled (primary).
 *  Uses the same `positionChipVisual` resolver as the on-card face, so the
 *  grid/full card and this detail panel read as one visual language. */
function PositionChip({ pos, primary }: { pos: string; primary: boolean }) {
  const v = positionChipVisual(pos, primary);
  return (
    <span
      style={{
        fontFamily: PIXEL,
        fontSize: 9,
        letterSpacing: 0.4,
        lineHeight: 1,
        color: v.text,
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderRadius: 3,
        padding: '4px 6px',
        boxShadow: primary ? 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.3)' : undefined,
      }}
    >
      {pos}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PLAYER stat-screen primitives (the FM-style dossier). Every value derives from
// a real Card field — OVERALL is `power` (BRS), the attribute bars are the four
// `pillars`, ATK/DEF are `deriveStats`. No invented numbers.
// ---------------------------------------------------------------------------

/** The evocative football labels the four raw pillars render under. Purely a
 *  relabel — the number is the pillar value, untouched. */
const PILLAR_META: { key: 'technical' | 'tactical' | 'mental' | 'physical'; label: string }[] = [
  { key: 'technical', label: 'TECHNIQUE' },
  { key: 'tactical', label: 'VISION' },
  { key: 'mental', label: 'COMPOSURE' },
  { key: 'physical', label: 'PHYSICAL' },
];

/** Band colour for an attribute value (0–99) — strong green / solid gold / weak
 *  red, so a squad's shape reads at a glance the way an FM screen does. */
function attrBand(v: number): string {
  if (v >= 70) return 'var(--success)';
  if (v >= 45) return 'var(--gold)';
  return 'var(--danger)';
}

/** Nation display: real flag emoji where we have one, else the short code. */
function nationValue(nation?: string): string {
  const flag = nationFlag(nation);
  const code = nationCode(nation);
  if (flag) return code ? `${flag} ${code}` : flag;
  return code || '—';
}

/** The headline OVERALL rating — the retro FM banner number. `power` (BRS 52–95)
 *  is the card's overall; rendered big in --line-white (contrast law) inside an
 *  accent-tinted glass box (the frame is glass, the number is crisp). */
function OverallBadge({ power, accent }: { power: number; accent: string }) {
  return (
    <div
      style={{
        flexShrink: 0,
        width: 92,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: '8px 6px',
        background: 'rgba(0,0,0,0.35)',
        border: `2px solid ${accent}`,
        borderRadius: 'var(--radius-sm)',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), 0 0 12px -4px ${accent}`,
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 1, color: accent, lineHeight: 1 }}>OVERALL</span>
      <span style={{ fontFamily: PIXEL, fontSize: 40, color: 'var(--line-white)', lineHeight: 1 }}>{power}</span>
    </div>
  );
}

/** One BIO ledger row — a label:value pair, alternating fill for the dense table. */
function BioRow({ label, value, color, alt }: { label: string; value: string; color?: string; alt?: boolean }) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{
        gap: 6,
        background: alt ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '4px 6px',
        minWidth: 0,
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.5, color: 'var(--dust)', flexShrink: 0 }}>{label}</span>
      <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 8.5, color: color ?? 'var(--cream)', lineHeight: 1.2, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

/** One ATTRIBUTES row — label + retro number (--line-white) over a crisp pixel
 *  bar, banded by value. The bar is segmented (hard pixels, no gradient). */
function AttrRow({ label, value }: { label: string; value: number }) {
  const color = attrBand(value);
  return (
    <div className="flex flex-col" style={{ gap: 3, minWidth: 0 }}>
      <div className="flex items-baseline justify-between" style={{ gap: 6 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.4, color: 'var(--dust)' }}>{label}</span>
        <span style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--line-white)', lineHeight: 1 }}>{value}</span>
      </div>
      <PixelBar pct={value / 99} color={color} />
    </div>
  );
}

/** A crisp segmented pixel meter (0–1). Hard edges, one light source; no blur,
 *  no gradient — the pixel-interior law applied to a data widget. */
function PixelBar({ pct, color, segments = 10 }: { pct: number; color: string; segments?: number }) {
  const filled = Math.max(0, Math.min(segments, Math.round(pct * segments)));
  return (
    <div className="flex" style={{ gap: 1.5 }}>
      {Array.from({ length: segments }).map((_, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            height: 6,
            background: i < filled ? color : 'rgba(255,255,255,0.07)',
            boxShadow: i < filled
              ? 'inset 0 1px 0 rgba(255,255,255,0.35), 0 0 0 1px var(--ink-black)'
              : 'inset 0 0 0 1px rgba(0,0,0,0.4)',
          }}
        />
      ))}
    </div>
  );
}

/** The "100% MATCH FIT" analogue — a bold match-fitness bar with a status word,
 *  banded by the fitness percentage. */
function AvailabilityBar({ fitness }: { fitness: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(fitness)));
  const { color } = fitnessMeter(fitness);
  const status = pct >= 75 ? 'MATCH FIT' : pct >= 50 ? 'TIRING' : 'JADED';
  return (
    <div className="flex flex-col" style={{ gap: 5 }}>
      <div className="flex items-baseline justify-between" style={{ gap: 6 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.6, color }}>{`${pct}% ${status}`}</span>
        <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.5, color: 'var(--dust)' }}>MATCH FITNESS</span>
      </div>
      <div
        style={{
          position: 'relative',
          height: 12,
          background: 'rgba(0,0,0,0.4)',
          border: '1.5px solid var(--ink-black)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '0 auto 0 0',
            width: `${pct}%`,
            background: color,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 0 rgba(0,0,0,0.3)',
          }}
        />
      </div>
    </div>
  );
}

/** The wear-condition chip cell — reuses the card face's `conditionRecipe` so the
 *  wear grade reads the same word/colour here as the stamp on the card. */
function ConditionCell({ condition }: { condition?: string }) {
  const rec = conditionRecipe(condition);
  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        minWidth: 0,
      }}
    >
      <Label>CONDITION</Label>
      <span style={{ fontFamily: PIXEL, fontSize: 10.5, color: rec.cc, lineHeight: 1.1 }}>{rec.label}</span>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '4px 8px',
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.5, color: 'var(--dust)' }}>{label}</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--cream)', lineHeight: 1 }}>{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// MANAGER detail
// ---------------------------------------------------------------------------

function ManagerDetail({ manager }: { manager: JokerCard }) {
  const flag = nationFlag(manager.nation);
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <Panel>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--cream)', lineHeight: 1.15 }}>{manager.name}</span>
          {manager.nation && (
            <span style={{ fontSize: 11, color: 'var(--dust)', flexShrink: 0, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              {flag && <span style={{ fontSize: 14 }}>{flag}</span>}
              {manager.nation}
            </span>
          )}
        </div>
        <p
          style={{
            fontFamily: 'var(--font-flavour, serif)',
            fontStyle: 'italic',
            fontSize: 13,
            lineHeight: 1.4,
            color: 'var(--dust)',
            margin: 0,
          }}
        >
          {'“'}{manager.philosophy}{'”'}
        </p>
      </Panel>

      <Panel>
        <Label>EFFECT</Label>
        <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--cream)' }}>{manager.effect}</span>
        {/* Only the four contest-reworked gaffers name a contest — omitted otherwise. */}
        <ContestRow heading="RAISES" keys={contestsForManager(manager.id)} />
      </Panel>

      <Panel>
        <Label>TRAITS</Label>
        {/* Each trait tag is coloured BY MEANING (defensive-blue, attacking-red, …)
            so the modal matches the grid card and a gaffer's identity reads at a
            glance rather than every tag being the same kit-red. */}
        <div className="flex flex-wrap" style={{ gap: 5 }}>
          {manager.traits.map((t) => {
            const s = managerTraitStyle(t);
            return (
              <span
                key={t}
                style={{
                  fontFamily: PIXEL,
                  fontSize: 8.5,
                  letterSpacing: 0.3,
                  color: s.color,
                  background: s.bg,
                  border: `1px solid ${s.color}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '4px 7px',
                  lineHeight: 1,
                }}
              >
                {t.toUpperCase()}
              </span>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TACTIC detail
// ---------------------------------------------------------------------------

function TacticDetail({ tactic, charges, accent }: { tactic: TacticCard; charges?: number; accent: string }) {
  const contradicts = tactic.contradicts ? getTacticById(tactic.contradicts) : null;
  const capacity = tacticCapacity(tactic);
  const filled = charges == null ? capacity : Math.max(0, Math.min(capacity, charges));
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <Panel>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--cream)', lineHeight: 1.15 }}>{tactic.name}</span>
          <span
            style={{
              fontFamily: PIXEL,
              fontSize: 8,
              letterSpacing: 0.5,
              color: 'var(--ink-black)',
              background: accent,
              borderRadius: 3,
              padding: '4px 6px',
              flexShrink: 0,
            }}
          >
            {tactic.category.toUpperCase()}
          </span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
          <StatCell label="RARITY" value={tactic.rarity.toUpperCase()} color={accent} />
          <StatCell label="CHARGES" value={`${filled} / ${capacity}`} color="var(--gold)" />
        </div>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <Label>EFFECT</Label>
          <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--cream-soft)' }}>{tactic.effect}</span>
        </div>
        {/* RAISES — which contest(s) this call lifts (a neutral/enemy-debuff play shows none). */}
        <ContestRow heading="RAISES" keys={contestsForTactic(tactic.id)} />
      </Panel>

      <Panel>
        <p
          style={{
            fontFamily: 'var(--font-flavour, serif)',
            fontStyle: 'italic',
            fontSize: 12.5,
            lineHeight: 1.45,
            color: 'var(--dust)',
            margin: 0,
          }}
        >
          {tactic.flavour}
        </p>
        {contradicts && (
          <span style={{ fontSize: 10.5, color: 'var(--danger)', lineHeight: 1.35 }}>
            The opposite play to <b style={{ color: 'var(--cream)' }}>{contradicts.name}</b>.
          </span>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// INVESTMENT detail (Boardroom)
// ---------------------------------------------------------------------------

const INVESTMENT_FLAVOUR: Record<string, string> = {
  stadium: 'Bricks and roar. Every result pays a little more.',
  academy: 'The future is grown, not bought.',
  boxoffice: 'Give them goals and they will pay at the gate.',
};

function InvestmentDetail({ investment, accent }: { investment: InvestmentCard; accent: string }) {
  const meta = INVESTMENT_META[investment.ladder] ?? INVESTMENT_META.stadium;
  const ladderLabel =
    investment.ladder === 'stadium'
      ? 'Stadium Expansion'
      : investment.ladder === 'academy'
        ? 'Youth Academy'
        : 'Box Office';
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <Panel>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--cream)', lineHeight: 1.15 }}>{investment.name}</span>
          <span
            style={{
              fontFamily: PIXEL,
              fontSize: 8,
              letterSpacing: 0.5,
              color: 'var(--ink-black)',
              background: accent,
              borderRadius: 3,
              padding: '4px 6px',
              flexShrink: 0,
            }}
          >
            {meta.tab}
          </span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
          <StatCell label="LADDER" value={ladderLabel} color={accent} />
          <StatCell label="COST" value={formatCash(investment.cost)} color="var(--gold)" />
          {investment.ladder !== 'boxoffice' && (
            <StatCell label="TIER" value={String(investment.tier)} />
          )}
          <StatCell label="TYPE" value={meta.kicker} />
        </div>
      </Panel>

      <Panel>
        <Label>BOARDROOM EFFECT</Label>
        <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--cream-soft)' }}>{investment.description}</span>
      </Panel>

      <Panel>
        <p
          style={{
            fontFamily: 'var(--font-flavour, serif)',
            fontStyle: 'italic',
            fontSize: 12.5,
            lineHeight: 1.45,
            color: 'var(--dust)',
            margin: 0,
          }}
        >
          {'“'}{INVESTMENT_FLAVOUR[investment.ladder] ?? ''}{'”'}
        </p>
        <span style={{ fontSize: 10.5, color: 'var(--gold)', lineHeight: 1.35 }}>
          One-time unlock. Consumed on purchase.
        </span>
      </Panel>
    </div>
  );
}
