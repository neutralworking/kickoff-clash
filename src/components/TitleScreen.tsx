'use client';

interface TitleScreenProps {
  onNewRun: () => void;
  onContinue?: () => void;
  hasExistingRun: boolean;
}

export default function TitleScreen({ onNewRun, onContinue, hasExistingRun }: TitleScreenProps) {
  const canonicalUrl = 'https://kickoff.neutralworking.com';

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen text-center px-6 py-10"
      style={{ position: 'relative' }}
    >
      {/* Wordmark — KICKOFF (red) over CLASH (cream), heavy drop shadow */}
      <div className="mb-2">
        <h1
          className="display"
          style={{
            fontSize: 'clamp(72px, 17vw, 160px)',
            color: 'var(--clash-red-hi)',
            textShadow: '6px 6px 0 rgba(0,0,0,0.6)',
            lineHeight: 0.85,
          }}
        >
          KICKOFF
        </h1>
        <h1
          className="display"
          style={{
            fontSize: 'clamp(72px, 17vw, 160px)',
            color: 'var(--cream)',
            textShadow: '6px 6px 0 rgba(0,0,0,0.6)',
            lineHeight: 0.85,
            marginTop: -8,
          }}
        >
          CLASH
        </h1>
      </div>

      {/* Tagline — Caveat flavour quote */}
      <p
        className="flavour"
        style={{
          fontSize: 'clamp(20px, 3vw, 28px)',
          color: 'var(--amber-hi)',
          marginTop: 18,
          maxWidth: 720,
        }}
      >
        Build your squad. Play your cards. Win the season.
      </p>

      {/* Buttons — chunky drop-shadow Balatro-style */}
      <div className="flex flex-col gap-4 w-full max-w-sm" style={{ marginTop: 36 }}>
        <button
          onClick={onNewRun}
          className="w-full transition-all hover:brightness-110 active:translate-y-1 active:shadow-none"
          style={{
            padding: '18px 56px',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-arcade)',
            fontSize: 'clamp(22px, 3vw, 32px)',
            letterSpacing: '0.1em',
            color: '#1a0f08',
            background: 'linear-gradient(180deg, var(--gold-hi), var(--amber))',
            borderRadius: 'var(--r-lg)',
            boxShadow: '0 8px 0 rgba(0,0,0,0.5), 0 0 40px var(--gold-glow)',
          }}
        >
          ▶ NEW SEASON
        </button>

        {hasExistingRun && onContinue && (
          <button
            onClick={onContinue}
            className="w-full transition-all hover:brightness-110 active:translate-y-1 active:shadow-none"
            style={{
              padding: '14px 40px',
              border: '2px solid var(--gold)',
              cursor: 'pointer',
              fontFamily: 'var(--font-arcade)',
              fontSize: 'clamp(16px, 2.2vw, 22px)',
              letterSpacing: '0.1em',
              color: 'var(--cream)',
              background: 'rgba(212,160,53,0.15)',
              borderRadius: 'var(--r)',
              boxShadow: '0 6px 0 rgba(0,0,0,0.5)',
            }}
          >
            CONTINUE RUN
          </button>
        )}
      </div>

      {/* Canonical home — small chip, low chrome */}
      <div
        className="mt-10 px-4 py-3"
        style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(245,197,66,0.18)',
          borderRadius: 'var(--r-sm)',
        }}
      >
        <div
          className="text-[10px] uppercase"
          style={{ color: 'var(--dust)', letterSpacing: '0.2em' }}
        >
          Canonical Home
        </div>
        <a
          href={canonicalUrl}
          className="text-sm underline underline-offset-4"
          style={{ color: 'var(--gold-hi)' }}
        >
          kickoff.neutralworking.com
        </a>
      </div>
    </div>
  );
}
