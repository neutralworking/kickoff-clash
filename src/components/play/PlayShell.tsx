'use client';

/**
 * KC six-contest game loop (NW-143, P5) — the shell.
 *
 * Drives the engine-v2 run against the six-contest engine. The UI renders engine
 * output and the match event log; it NEVER computes game state (SYNERGY_MODEL §9)
 * — every transition calls an engine function (managerOffer, fixtureSetup,
 * resolveFixture, investCash) and stores what it returns.
 *
 * Phases: title → manager → fixture → squad → match → post-match → shop →
 * (next | summary). The run autosaves to localStorage at each boundary and
 * resumes on reload. This shell is the LIVE game (mounted at `/`); the
 * SCORING_V2 game is parked at `/classic`.
 */

import { useEffect, useMemo, useState } from 'react';
import TitleScreen from '../TitleScreen';
import {
  loadCards,
  createRun,
  managerOffer,
  fixtureSetup,
  resolveFixture,
  serializeRun,
  deserializeRun,
  MANAGERS_BY_ID,
  type KCCard,
  type KCCardJSON,
  type Manager,
  type RunState,
  type FixtureSetup,
  type MatchResult,
} from '../../engine-v2';
import { PIXEL } from './ui';
import ManagerPick from './ManagerPick';
import FixtureScreen from './FixtureScreen';
import SquadPick from './SquadPick';
import MatchScreen from './MatchScreen';
import PostMatch from './PostMatch';
import Shop from './Shop';
import RunSummary from './RunSummary';

const RUN_KEY = 'kc-v2-run';

type Phase = 'title' | 'manager' | 'fixture' | 'squad' | 'match' | 'postmatch' | 'shop' | 'summary';

function restore(): RunState | null {
  try {
    const s = localStorage.getItem(RUN_KEY);
    return s ? deserializeRun(s) : null;
  } catch {
    localStorage.removeItem(RUN_KEY);
    return null;
  }
}

export default function PlayShell() {
  const [pool, setPool] = useState<KCCard[] | null>(null);
  const [run, setRun] = useState<RunState | null>(() => restore());
  const [phase, setPhase] = useState<Phase>('title');
  const [seed, setSeed] = useState<number>(() => (Date.now() & 0x7fffffff) | 1);
  const [pending, setPending] = useState<{ run: RunState; result: MatchResult; setup: FixtureSetup } | null>(null);

  // load the card pool at first client render (async — the rest is lazy-init'd).
  // Derive the deploy basePath from our own path (we mount at `<basePath>/play`)
  // so the fetch is correct whether served at root or under /kickoff-clash.
  useEffect(() => {
    let live = true;
    // Mounted at `<basePath>/` or `<basePath>/play` — strip the route segment
    // and any trailing slash so the data fetch works at either mount point.
    const base = window.location.pathname.replace(/\/play\/?$/, '').replace(/\/$/, '');
    fetch(`${base}/data/kc_v2_cards.json`)
      .then((r) => r.json())
      .then((rows: KCCardJSON[]) => live && setPool(loadCards(rows)))
      .catch(() => live && setPool([]));
    return () => {
      live = false;
    };
  }, []);

  const persist = (next: RunState | null) => {
    setRun(next);
    if (next) localStorage.setItem(RUN_KEY, serializeRun(next));
    else localStorage.removeItem(RUN_KEY);
  };

  const offer = useMemo(() => managerOffer(seed), [seed]);
  const manager: Manager | null = run ? MANAGERS_BY_ID[run.managerId] ?? null : null;
  // The upcoming fixture, derived purely from the live run — always run.fixture+1.
  // Frozen into `pending` at kick-off so match/post-match read a stable value.
  const setup: FixtureSetup | null = useMemo(
    () => (run && pool && run.alive && !run.completed ? fixtureSetup(run, pool) : null),
    [run, pool]
  );

  const startRun = (m: Manager) => {
    persist(createRun(seed, m));
    setPhase('fixture');
  };

  const newRun = () => {
    persist(null);
    setPending(null);
    setSeed((Date.now() & 0x7fffffff) | 1);
    setPhase('manager');
  };

  const kickoff = (pickedXi: KCCard[]) => {
    if (!run || !setup) return;
    setPending({ ...resolveFixture(run, pickedXi, setup), setup }); // engine resolves; we replay its log
    setPhase('match');
  };

  const fullTime = () => {
    if (!pending) return;
    persist(pending.run);
    setPhase('postmatch');
  };

  const afterPostMatch = () => {
    if (!run) return;
    if (run.completed || !run.alive) setPhase('summary');
    else setPhase('shop');
  };

  const loading = pool === null;

  // The title gate (mirrors the classic shell): a saved run — alive or ended —
  // can be re-entered; New Season always starts clean.
  if (phase === 'title') {
    return (
      <TitleScreen
        onNewRun={newRun}
        onContinue={() => setPhase(run && (run.completed || !run.alive) ? 'summary' : 'fixture')}
        hasExistingRun={!!run}
        altLink={{ href: '/classic', label: '▸ Classic Engine (Scoring V2)' }}
      />
    );
  }

  return (
    <div className="kc-app-bg" style={{ minHeight: '100dvh', color: 'var(--cream)' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        {loading && (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', fontFamily: PIXEL, fontSize: 10, color: 'var(--dust)' }}>
            LOADING SQUAD DATA…
          </div>
        )}

        {!loading && phase === 'manager' && (
          <ManagerPick offer={offer} seed={seed} onPick={startRun} onReroll={() => setSeed((s) => (s * 48271) % 0x7fffffff || 1)} />
        )}

        {!loading && phase === 'fixture' && run && manager && setup && (
          <FixtureScreen run={run} manager={manager} setup={setup} onContinue={() => setPhase('squad')} onAbandon={newRun} />
        )}

        {!loading && phase === 'squad' && run && manager && setup && (
          <SquadPick run={run} manager={manager} setup={setup} onKickoff={kickoff} onBack={() => setPhase('fixture')} />
        )}

        {!loading && phase === 'match' && manager && pending && (
          <MatchScreen manager={manager} setup={pending.setup} result={pending.result} onFullTime={fullTime} />
        )}

        {!loading && phase === 'postmatch' && manager && pending && (
          <PostMatch manager={manager} setup={pending.setup} result={pending.result} run={pending.run} onContinue={afterPostMatch} />
        )}

        {!loading && phase === 'shop' && run && manager && (
          <Shop run={run} manager={manager} onDone={(next) => { persist(next); setPhase('fixture'); }} />
        )}

        {!loading && phase === 'summary' && run && manager && <RunSummary run={run} manager={manager} onNewRun={newRun} />}
      </div>
    </div>
  );
}
