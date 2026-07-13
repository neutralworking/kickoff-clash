'use client';

/**
 * Kickoff Clash — ContestMeters: the shared PROJECTED-CONTEST readout (v4 squad
 * handoff, direction 1a "Dual Bars" + the Match variant). One component, two
 * screens: the team-selection hero and the in-match header, both fed by the REAL
 * engine forecast (evaluateSplit → MatchForecast), never a re-derived weight table.
 *
 *   • ATK meter (amber) — your attack v their defence, signed edge.
 *   • DEF meter (blue)  — your defence v their attack, signed edge.
 *   • NET + a Δ-vs-balanced badge (▲/▼): how the current intent moves the net.
 *
 * Bars animate their width (expo-out ~450ms) whenever the squad / intent changes —
 * the "impact" feedback. Glass module frame, pixel numbers.
 */

import { PIXEL } from './cards/cardTokens';
import { HERO } from './cards/portrait';

const EXPO_OUT = 'cubic-bezier(0.22,1,0.36,1)';
const ATK_FILL = 'linear-gradient(90deg, #b23a1a, #e8621a)';
const DEF_FILL = 'linear-gradient(90deg, #274e86, #3d7bd6)';

export interface ContestForecast {
  yourAttack: number;
  yourDefence: number;
  oppAttack: number;
  oppDefence: number;
  attackEdge: number;
  defendEdge: number;
  net: number;
}

function pct(you: number, opp: number): string {
  const a = Math.max(0, you);
  const b = Math.max(0, opp);
  const t = a + b;
  return `${t <= 0 ? 50 : Math.round((a / t) * 100)}%`;
}
const sgn = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const edgeCol = (n: number) => (n > 0 ? '#3ba55d' : n < 0 ? '#e0605a' : HERO.creamMuted);

function Meter({ tag, tagColor, fill, you, opp, edge, height }: {
  tag: string; tagColor: string; fill: string; you: number; opp: number; edge: number; height: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ fontFamily: PIXEL, fontSize: 8, color: tagColor, width: 26 }}>{tag}</span>
      <div style={{ flex: 1, position: 'relative', height, borderRadius: 6, background: '#241c10', border: '1px solid #0b0703', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: pct(you, opp), background: fill, transition: `width 0.45s ${EXPO_OUT}` }} />
        <span style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', fontFamily: PIXEL, fontSize: 11, color: '#fff', textShadow: '0 1px 2px #000' }}>{you}</span>
        <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontFamily: PIXEL, fontSize: 8, color: HERO.creamBody }}>v {opp}</span>
      </div>
      <span style={{ fontFamily: PIXEL, fontSize: 10, color: edgeCol(edge), width: 34, textAlign: 'right' }}>{sgn(edge)}</span>
    </div>
  );
}

/** Δ-vs-balanced badge: ▲/▼ + magnitude (empty at 0). */
function deltaStr(d: number): string {
  if (d === 0) return '';
  return d > 0 ? `▲${d}` : `▼${Math.abs(d)}`;
}

/**
 * The team-selection HERO variant: a titled glass module with the NET readout
 * top-right and the two meters beneath. `null` forecast → a muted placeholder
 * (the XI isn't full yet) rather than broken bars.
 */
export function ContestHero({ forecast, deltaVsBalanced, oppName }: {
  forecast: ContestForecast | null;
  deltaVsBalanced: number;
  oppName: string;
}) {
  return (
    <div
      className="glass-surface"
      style={{ borderRadius: 'var(--radius)', border: '1px solid rgba(232,178,60,0.22)', padding: '11px 13px', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1.5, color: HERO.creamMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          PROJECTED CONTEST · vs {oppName.toUpperCase()}
        </span>
        {forecast ? (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 7, color: HERO.creamMuted }}>NET</span>
            <span style={{ fontFamily: PIXEL, fontSize: 17, color: forecast.net >= 0 ? HERO.cream : '#e0605a', textShadow: '0 2px 0 #0b0703' }}>{sgn(forecast.net)}</span>
            <span style={{ fontFamily: PIXEL, fontSize: 9, color: edgeCol(deltaVsBalanced) }}>{deltaStr(deltaVsBalanced)}</span>
          </span>
        ) : (
          <span style={{ fontFamily: PIXEL, fontSize: 8, color: HERO.creamMuted }}>FILL YOUR XI</span>
        )}
      </div>
      {forecast ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Meter tag="ATK" tagColor="#ff8f6a" fill={ATK_FILL} you={forecast.yourAttack} opp={forecast.oppDefence} edge={forecast.attackEdge} height={20} />
          <Meter tag="DEF" tagColor="#8fb6ff" fill={DEF_FILL} you={forecast.yourDefence} opp={forecast.oppAttack} edge={forecast.defendEdge} height={20} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <PlaceholderBar tag="ATK" tagColor="#ff8f6a" />
          <PlaceholderBar tag="DEF" tagColor="#8fb6ff" />
        </div>
      )}
    </div>
  );
}

function PlaceholderBar({ tag, tagColor }: { tag: string; tagColor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ fontFamily: PIXEL, fontSize: 8, color: tagColor, width: 26, opacity: 0.6 }}>{tag}</span>
      <div style={{ flex: 1, height: 20, borderRadius: 6, background: '#241c10', border: '1px solid #0b0703' }} />
      <span style={{ width: 34 }} />
    </div>
  );
}

/**
 * The in-match variant: no title, condensed, NET in a bordered column at the
 * right end. Same live forecast, same animated meters.
 */
export function ContestMatch({ forecast, deltaVsBalanced }: {
  forecast: ContestForecast;
  deltaVsBalanced?: number;
}) {
  return (
    <div
      className="glass-surface"
      style={{ borderRadius: 'var(--radius)', border: '1px solid rgba(232,178,60,0.22)', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
        <Meter tag="ATK" tagColor="#ff8f6a" fill={ATK_FILL} you={forecast.yourAttack} opp={forecast.oppDefence} edge={forecast.attackEdge} height={18} />
        <Meter tag="DEF" tagColor="#8fb6ff" fill={DEF_FILL} you={forecast.yourDefence} opp={forecast.oppAttack} edge={forecast.defendEdge} height={18} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderLeft: '1px solid rgba(154,139,115,0.25)', paddingLeft: 12, flexShrink: 0 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 7, color: HERO.creamMuted }}>NET</span>
        <span style={{ fontFamily: PIXEL, fontSize: 20, color: forecast.net >= 0 ? HERO.cream : '#e0605a', textShadow: '0 2px 0 #0b0703' }}>{sgn(forecast.net)}</span>
        {typeof deltaVsBalanced === 'number' && deltaVsBalanced !== 0 && (
          <span style={{ fontFamily: PIXEL, fontSize: 8, color: edgeCol(deltaVsBalanced) }}>{deltaStr(deltaVsBalanced)}</span>
        )}
      </div>
    </div>
  );
}
