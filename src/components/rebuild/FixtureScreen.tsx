'use client';

/**
 * The fixture card (SM §8): opponent posture profile, challenge rule, and
 * reward — all visible BEFORE selection. Boss fixtures are marked.
 */

import type { RunState } from '../../engine/run';
import { fixturePreview } from '../../engine/run';
import { getArchetype } from '../../engine/data/opponents';
import { REWARD_BASE, REWARD_PER_FIXTURE } from '../../engine/data/economy';
import type { ManagerDef } from '../../engine/data/managers';
import { RButton, RPanel, PIXEL_FONT } from './RebuildShell';
import { Chip } from './ManagerPick';

export default function FixtureScreen({
  run,
  manager,
  onContinue,
  onAbandon,
}: {
  run: RunState;
  manager: ManagerDef;
  onContinue: () => void;
  onAbandon: () => void;
}) {
  const { fixture, rule, target } = fixturePreview(run);
  const archetype = getArchetype(fixture.archetypeId);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <header className="flex items-center justify-between" style={{ marginTop: 8 }}>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 11, color: 'var(--dust)' }}>
          FIXTURE {run.fixture}/9 · {manager.name.toUpperCase()}
        </div>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 11, color: 'var(--gold)' }}>£{run.cash}</div>
      </header>

      <RPanel>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: 'var(--dust)', letterSpacing: 1 }}>
          {fixture.boss ? 'BOSS FIXTURE' : 'NEXT OPPONENT'}
        </div>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 15, color: fixture.boss ? 'var(--kit-red)' : 'var(--cream)', marginTop: 6 }}>
          {archetype.name.toUpperCase()}
        </div>
        <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
          <Chip label={archetype.posture.toUpperCase()} />
          <Chip label={`ATTACK ${fixture.baseCharge}`} dim />
          <Chip label={`DEFENCE ${fixture.windowThreshold}`} dim />
          {archetype.shifts && <Chip label="SHIFTS POSTURE" color="var(--kit-blue)" />}
        </div>
      </RPanel>

      <RPanel>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: 'var(--dust)', letterSpacing: 1 }}>POINTS TARGET</div>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 22, color: 'var(--gold)', marginTop: 4 }}>{target.toFixed(1)}</div>
        <div style={{ fontSize: 11, color: 'var(--dust)', marginTop: 2 }}>
          Win pays £{REWARD_BASE + run.fixture * REWARD_PER_FIXTURE}+ (goals, surplus and clauses on top).
        </div>
      </RPanel>

      {rule && (
        <RPanel style={{ borderColor: rule.severity === 2 ? 'var(--kit-red)' : undefined }}>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: rule.severity === 2 ? 'var(--kit-red)' : 'var(--dust)', letterSpacing: 1 }}>
            CHALLENGE RULE{rule.severity === 2 ? ' · SEVERE' : ''}
          </div>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 12, color: 'var(--cream)', marginTop: 6 }}>{rule.name.toUpperCase()}</div>
          <p style={{ fontSize: 12, color: 'var(--cream-soft)', marginTop: 4, lineHeight: 1.4 }}>{rule.effect}</p>
        </RPanel>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16 }}>
        <RButton accent onClick={onContinue}>
          PICK YOUR XI →
        </RButton>
        <RButton onClick={onAbandon} style={{ opacity: 0.7 }}>
          ABANDON RUN
        </RButton>
      </div>
    </div>
  );
}
