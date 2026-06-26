'use client';

interface TitleScreenProps {
  onNewRun: () => void;
  onContinue?: () => void;
  hasExistingRun: boolean;
}

export default function TitleScreen({ onNewRun, onContinue, hasExistingRun }: TitleScreenProps) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen text-center px-6"
      style={{ background: 'var(--felt)' }}
    >
      {/* Title — Silkscreen pixel hero, sized to fit a phone without overflow */}
      <div className="mb-12">
        <h1
          className="uppercase leading-none"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(34px, 12vw, 56px)',
            color: 'var(--amber)',
            textShadow: '0 3px 0 var(--ink-black)',
          }}
        >
          KICKOFF
        </h1>
        <h1
          className="uppercase leading-none mt-2"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(34px, 12vw, 56px)',
            color: 'var(--cream)',
            textShadow: '0 3px 0 var(--ink-black)',
          }}
        >
          CLASH
        </h1>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onNewRun}
          className="w-full py-4 rounded-[var(--radius)] text-base uppercase tracking-wide transition-all hover:brightness-110 hover:scale-[1.03] active:scale-95"
          style={{
            fontFamily: 'var(--font-display)',
            background: `linear-gradient(135deg, var(--amber), var(--amber-soft))`,
            color: 'var(--cream)',
            border: '2px solid var(--ink-black)',
            boxShadow: '0 4px 0 0 var(--ink-black), 0 6px 18px var(--amber-glow)',
          }}
        >
          New Season
        </button>

        {hasExistingRun && onContinue && (
          <button
            onClick={onContinue}
            className="w-full py-4 rounded-[var(--radius)] text-base uppercase tracking-wide transition-all hover:brightness-110 hover:scale-[1.03] active:scale-95"
            style={{
              fontFamily: 'var(--font-display)',
              background: 'var(--surface)',
              color: 'var(--gold)',
              border: '2px solid var(--gold)',
              boxShadow: '0 4px 0 0 var(--ink-black), 0 4px 16px var(--gold-glow)',
            }}
          >
            Continue Run
          </button>
        )}
      </div>
    </div>
  );
}
