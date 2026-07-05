'use client';

/**
 * KC rebuild — the Phase 5 shell (KC_REBUILD_PLAN_V1 §P5; NW-143).
 *
 * Runs the REBUILD game loop against src/engine/ only: the UI renders engine
 * state and the event log; it never computes game state. Ships on /rebuild in
 * parallel with the live game — the default flip is the last step of Phase 5,
 * gated on playtest sign-off.
 *
 * Phases: manager pick → fixture card → squad → match → post-match →
 * shop → (next fixture | summary). Autosaves at every phase boundary via the
 * engine's serialise layer; an in-progress match resumes at its fixture start.
 */

import { useMemo, useState } from 'react';
import type { RunState, CollectionState } from '../../engine/run';
import { createRun, serialiseRun, deserialiseRun } from '../../engine/run';
import { managerOffer, getManager, ALL_MANAGERS, type ManagerDef } from '../../engine/data/managers';
import type { EngineCard } from '../../engine/cards';
import type { MatchState } from '../../engine/match';
import ManagerPick from './ManagerPick';
import FixtureScreen from './FixtureScreen';
import SquadPick from './SquadPick';
import MatchScreen from './MatchScreen';
import RebuildPostMatch from './RebuildPostMatch';
import ShopScreen from './ShopScreen';
import RunSummary from './RunSummary';

const RUN_KEY = 'kc-rebuild-run';
const COLLECTION_KEY = 'kc-rebuild-collection';

export type RebuildPhase = 'manager' | 'fixture' | 'squad' | 'match' | 'postmatch' | 'shop' | 'summary';

/** Restore a saved run at first client render (the page mounts ssr:false). */
function restoreRun(): RunState | null {
  try {
    const saved = localStorage.getItem(RUN_KEY);
    return saved ? deserialiseRun(saved) : null;
  } catch {
    localStorage.removeItem(RUN_KEY);
    return null;
  }
}

function restoreCollection(): CollectionState {
  try {
    return JSON.parse(localStorage.getItem(COLLECTION_KEY) ?? '') as CollectionState;
  } catch {
    return { unlocked: [] };
  }
}

export default function RebuildShell() {
  const [run, setRun] = useState<RunState | null>(restoreRun);
  const [phase, setPhase] = useState<RebuildPhase>(() => {
    const restored = restoreRun();
    if (!restored) return 'manager';
    return restored.completed || !restored.alive ? 'summary' : restored.shop ? 'shop' : 'fixture';
  });
  const [seed, setSeed] = useState<number>(() => (Date.now() & 0x7fffffff) | 1);
  const [xi, setXi] = useState<EngineCard[]>([]);
  const [formation, setFormation] = useState<string | undefined>(undefined);
  const [lastMatch, setLastMatch] = useState<MatchState | null>(null);
  const [collection, setCollection] = useState<CollectionState>(restoreCollection);

  const persist = (next: RunState | null) => {
    setRun(next);
    if (next) localStorage.setItem(RUN_KEY, serialiseRun(next));
    else localStorage.removeItem(RUN_KEY);
  };
  const persistCollection = (next: CollectionState) => {
    setCollection(next);
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(next));
  };

  const offer = useMemo(() => managerOffer(seed), [seed]);
  const manager: ManagerDef | null = run ? getManager(run.managerId) ?? null : null;

  const startRun = (managerId: string) => {
    const fresh = createRun(seed, managerId, collection);
    persist(fresh);
    setPhase('fixture');
  };

  const newSeason = () => {
    persist(null);
    setLastMatch(null);
    setXi([]);
    setFormation(undefined);
    setSeed((Date.now() & 0x7fffffff) | 1);
    setPhase('manager');
  };

  return (
    <div className="kc-app-bg" style={{ minHeight: '100dvh', color: 'var(--cream)' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        {phase === 'manager' && <ManagerPick offer={offer} seed={seed} onPick={startRun} onReroll={() => setSeed((s) => (s * 48271) % 0x7fffffff || 1)} />}
        {phase === 'fixture' && run && manager && (
          <FixtureScreen run={run} manager={manager} onContinue={() => setPhase('squad')} onAbandon={newSeason} />
        )}
        {phase === 'squad' && run && manager && (
          <SquadPick
            run={run}
            manager={manager}
            onKickoff={(pickedXi, pickedFormation) => {
              setXi(pickedXi);
              setFormation(pickedFormation);
              setPhase('match');
            }}
            onBack={() => setPhase('fixture')}
          />
        )}
        {phase === 'match' && run && manager && (
          <MatchScreen
            run={run}
            manager={manager}
            xi={xi}
            formation={formation}
            onFullTime={(matchState, nextRun) => {
              setLastMatch(matchState);
              persist(nextRun);
              setPhase('postmatch');
            }}
          />
        )}
        {phase === 'postmatch' && run && manager && lastMatch && (
          <RebuildPostMatch
            run={run}
            manager={manager}
            xi={xi}
            match={lastMatch}
            onContinue={() => setPhase(run.completed || !run.alive ? 'summary' : run.shop ? 'shop' : 'fixture')}
          />
        )}
        {phase === 'shop' && run && manager && (
          <ShopScreen
            run={run}
            manager={manager}
            collection={collection}
            onUpdate={persist}
            onUpdateCollection={persistCollection}
            onDone={(next) => {
              persist(next);
              setPhase('fixture');
            }}
          />
        )}
        {phase === 'summary' && run && <RunSummary run={run} onNewSeason={newSeason} />}
      </div>
    </div>
  );
}

/** Shared pixel-frame panel used across the rebuild screens. */
export function RPanel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="glass-surface"
      style={{ borderRadius: 'var(--radius)', padding: 12, ...style }}
    >
      {children}
    </div>
  );
}

export function RButton({
  children,
  onClick,
  disabled,
  accent,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  accent?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="active:scale-95"
      style={{
        fontFamily: 'var(--font-pixel)',
        fontSize: 12,
        letterSpacing: 1,
        padding: '12px 16px',
        borderRadius: 'var(--radius)',
        border: '2px solid var(--ink-black)',
        background: accent ? 'linear-gradient(180deg, var(--amber), var(--amber-soft))' : 'var(--surface-raised)',
        color: accent ? 'var(--ink-black)' : 'var(--cream)',
        opacity: disabled ? 0.4 : 1,
        boxShadow: '0 3px 0 0 var(--ink-black)',
        cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export const PIXEL_FONT = 'var(--font-pixel)';
