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
      {/* Title */}
      <div className="mb-4">
        <h1
          className="text-7xl tracking-tight uppercase leading-none"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <span style={{ color: 'var(--amber)' }}>KICKOFF</span>
        </h1>
        <h1
          className="text-7xl tracking-tight uppercase leading-none mt-1"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}
        >
          CLASH
        </h1>
      </div>

      {/* Tagline */}
      <p
        className="text-base mb-12"
        style={{
          fontFamily: 'var(--font-flavour)',
          fontStyle: 'italic',
          color: 'var(--dust)',
        }}
      >
        Build your squad. Play your cards. Win the season.
      </p>

      {/* Buttons */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onNewRun}
          className="w-full py-4 rounded-[var(--radius)] text-lg font-bold uppercase tracking-wide transition-all hover:brightness-110 hover:scale-[1.03] active:scale-95"
          style={{
            fontFamily: 'var(--font-display)',
            background: `linear-gradient(135deg, var(--amber), var(--amber-soft))`,
            color: 'var(--cream)',
            boxShadow: '0 4px 20px var(--amber-glow)',
          }}
        >
          New Season
        </button>

        {hasExistingRun && onContinue && (
          <button
            onClick={onContinue}
            className="w-full py-4 rounded-[var(--radius)] text-lg font-bold uppercase tracking-wide transition-all hover:brightness-110 hover:scale-[1.03] active:scale-95"
            style={{
              fontFamily: 'var(--font-display)',
              background: 'var(--leather)',
              color: 'var(--gold)',
              border: '2px solid var(--gold)',
              boxShadow: '0 4px 16px var(--gold-glow)',
            }}
          >
            Continue Run
          </button>
        )}
      </div>
    </div>
  );
}
