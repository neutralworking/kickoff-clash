'use client';

interface TitleScreenProps {
  onNewRun: () => void;
  onContinue?: () => void;
  hasExistingRun: boolean;
}

export default function TitleScreen({ onNewRun, onContinue, hasExistingRun }: TitleScreenProps) {
  return (
    <div
      className="kc-app-bg flex flex-col items-center justify-center text-center px-6 relative overflow-hidden"
      style={{ height: '100dvh' }}
    >
      {/* Crest plate — a glass panel behind the pixel wordmark so the hero reads
          as engraved on lit glass. The title text itself stays pure pixel. */}
      <div
        className="glass-surface depth-2 relative mb-9 overflow-hidden"
        style={{
          borderRadius: 'var(--radius-lg)',
          padding: '26px 30px 30px',
        }}
      >
        {/* Title — Silkscreen pixel hero, sized to fit a phone without overflow.
            Pixel content: never blurred, hard --ink-black drop shadow intact. */}
        <h1
          className="uppercase leading-none relative"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(34px, 12vw, 56px)',
            color: 'var(--amber)',
            textShadow: '0 3px 0 var(--ink-black)',
            zIndex: 2,
          }}
        >
          KICKOFF
        </h1>
        <h1
          className="uppercase leading-none mt-2 relative"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(34px, 12vw, 56px)',
            color: 'var(--cream)',
            textShadow: '0 3px 0 var(--ink-black)',
            zIndex: 2,
          }}
        >
          CLASH
        </h1>
      </div>

      {/* Buttons — glass CTAs with sheen, depth and a tight accent glow. The
          amber primary keeps its kit gradient; glass framing adds the gloss. */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onNewRun}
          className="sheen-strong glow-edge w-full py-4 transition-all hover:brightness-110 active:scale-[0.97] relative overflow-hidden"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            borderRadius: 'var(--radius)',
            background: 'linear-gradient(135deg, var(--amber), var(--amber-soft))',
            color: 'var(--line-white)',
            border: '2px solid var(--ink-black)',
            boxShadow:
              'inset 0 1px 0 0 var(--glass-highlight), 0 4px 0 0 var(--ink-black), var(--depth-2)',
            ['--glow' as string]: 'var(--amber-glow)',
          }}
        >
          New Season
        </button>

        {hasExistingRun && onContinue && (
          <button
            onClick={onContinue}
            className="glass-raised sheen w-full py-4 transition-all hover:brightness-110 active:scale-[0.97] relative overflow-hidden"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              borderRadius: 'var(--radius)',
              color: 'var(--gold)',
              boxShadow:
                'inset 0 1px 0 0 var(--glass-highlight), 0 4px 0 0 var(--ink-black), var(--depth-2)',
            }}
          >
            Continue Run
          </button>
        )}

      </div>
    </div>
  );
}
