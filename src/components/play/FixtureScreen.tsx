'use client';

/**
 * KC six-contest UI (NW-143) — the fixture card.
 *
 * Before the squad screen: what you're walking into. The opponent's posture
 * profile and shape, any challenge rule in force, the points target (the blind),
 * and the reward for clearing it. Read from the engine's FixtureSetup — the UI
 * computes nothing.
 */

import { type Contest, contestDials, type Manager, type RunState, type FixtureSetup, RUN_FIXTURES } from '../../engine-v2';
import { PPanel, PButton, Chip, Eyebrow, Meter, PIXEL, CONTEST_COLOR } from './ui';

const POSTURE_COLOR: Record<string, string> = { attack: 'var(--kit-red)', balanced: 'var(--gold)', defend: 'var(--kit-blue)' };

export default function FixtureScreen({
  run,
  manager,
  setup,
  onContinue,
  onAbandon,
}: {
  run: RunState;
  manager: Manager;
  setup: FixtureSetup;
  onContinue: () => void;
  onAbandon: () => void;
}) {
  const oppDials = contestDials(setup.opponent.cards);
  const topOpp = (Object.entries(oppDials) as [Contest, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const posture = setup.opponent.posture ?? 'balanced';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <Eyebrow color="var(--gold)">FIXTURE {setup.fixture} / {RUN_FIXTURES}</Eyebrow>
          <div style={{ fontFamily: PIXEL, fontSize: 18, color: 'var(--cream)', marginTop: 2 }}>{setup.boss ? 'BOSS FIXTURE' : 'LEAGUE FIXTURE'}</div>
        </div>
        <Chip color="var(--gold)">£{Math.floor(run.cash)} · Q{Math.round(run.quality)}</Chip>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* The stakes: the scoreline decides everything. */}
        <PPanel glow style={{ padding: 12 }}>
          <Eyebrow color="var(--gold)">WIN OR DRAW — A LOSS ENDS THE RUN</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <div style={{ fontFamily: PIXEL, fontSize: 26, color: 'var(--gold)' }}>W · D</div>
            <div style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)' }}>JUDGED ON GOALS, NOTHING ELSE</div>
          </div>
          <div style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--cream-soft)', marginTop: 6, lineHeight: 1.5 }}>
            A win banks the full purse (plus a bonus per goal); a draw survives on half. Cash buys deck quality — {manager.name}&apos;s win-con has to put goals on the board.
          </div>
        </PPanel>

        {/* Opponent profile. */}
        <PPanel style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Eyebrow>OPPONENT</Eyebrow>
            <div style={{ display: 'flex', gap: 5 }}>
              <Chip color={POSTURE_COLOR[posture]}>{posture.toUpperCase()}</Chip>
              <Chip>{setup.opponent.formation ?? '4-3-3'}</Chip>
            </div>
          </div>
          <div style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', marginTop: 8 }}>THEY LEAN ON</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
            {topOpp.length ? (
              topOpp.map(([c, n]) => (
                <Chip key={c} color={CONTEST_COLOR[c]}>
                  {c} +{n}
                </Chip>
              ))
            ) : (
              <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)' }}>a balanced, shapeless side</span>
            )}
          </div>
          {setup.boss && (
            <div style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--kit-red)', marginTop: 8, lineHeight: 1.5 }}>
              A committed side under its own manager — it defends with its card actions. Break it down.
            </div>
          )}
        </PPanel>

        {/* Challenge rule. */}
        {setup.challenge && (
          <PPanel style={{ padding: 12, border: '1px solid var(--kit-red)' }}>
            <Eyebrow color="var(--kit-red)">CHALLENGE · {setup.challenge.name.toUpperCase()}</Eyebrow>
            <div style={{ fontFamily: PIXEL, fontSize: 8.5, color: 'var(--cream-soft)', marginTop: 5, lineHeight: 1.5 }}>{setup.challenge.blurb}</div>
          </PPanel>
        )}

        {/* Your run so far. */}
        <PPanel style={{ padding: 12 }}>
          <Eyebrow>DECK STRENGTH</Eyebrow>
          <div style={{ marginTop: 6 }}>
            <Meter value={run.quality} max={60} color="var(--gold)" />
          </div>
          <div style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)', marginTop: 5 }}>
            Quality {Math.round(run.quality)} — invest cash in the shop to raise it.
          </div>
        </PPanel>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PButton accent onClick={onContinue}>PICK YOUR XI →</PButton>
        <PButton onClick={onAbandon} style={{ fontSize: 9, padding: '8px 12px' }}>ABANDON RUN</PButton>
      </div>
    </div>
  );
}
