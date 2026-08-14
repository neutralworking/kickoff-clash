'use client';

import { V8_RUN_PLAYER_POOL } from '../game-v8/roster';
import GameCard from './cards/GameCard';
import { PIXEL } from './cards/cardTokens';

interface TitleScreenProps {
  onNewRun: () => void;
  onContinue?: () => void;
  hasExistingRun: boolean;
}

const HERO_CARDS = [
  V8_RUN_PLAYER_POOL[10],
  V8_RUN_PLAYER_POOL[0],
  V8_RUN_PLAYER_POOL[20],
].filter((card): card is (typeof V8_RUN_PLAYER_POOL)[number] => Boolean(card));

export default function TitleScreen({ onNewRun, onContinue, hasExistingRun }: TitleScreenProps) {
  return (
    <main
      className="flex flex-col items-center text-center relative overflow-hidden"
      style={{
        height: '100dvh',
        padding: 'max(env(safe-area-inset-top), 18px) 20px max(env(safe-area-inset-bottom), 16px)',
        background:
          'radial-gradient(ellipse at 50% 34%, rgba(210,155,47,0.19) 0%, rgba(7,21,12,0.42) 34%, transparent 63%), linear-gradient(180deg, #07110a 0%, #020704 100%)',
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          opacity: 0.32,
          backgroundImage:
            'linear-gradient(rgba(217,170,72,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(217,170,72,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'linear-gradient(180deg, black, transparent 78%)',
          WebkitMaskImage: 'linear-gradient(180deg, black, transparent 78%)',
        }}
      />

      <header className="relative shrink-0" style={{ zIndex: 3 }}>
        <div className="flex items-center justify-center" style={{ gap: 9 }}>
          <span style={{ width: 30, height: 1, background: 'linear-gradient(90deg, transparent, var(--gold))' }} />
          <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 2, color: 'var(--gold)' }}>
            FOOTBALL CARD ROGUELIKE
          </span>
          <span style={{ width: 30, height: 1, background: 'linear-gradient(90deg, var(--gold), transparent)' }} />
        </div>

        <h1
          className="uppercase leading-none"
          style={{
            marginTop: 13,
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(38px, 12vw, 58px)',
            letterSpacing: -1,
            color: 'var(--cream)',
            textShadow: '0 4px 0 var(--ink-black), 0 0 24px rgba(217,170,72,0.22)',
          }}
        >
          KICKOFF
          <span className="block" style={{ marginTop: 4, color: 'var(--gold)' }}>CLASH</span>
        </h1>
      </header>

      <section
        aria-label="V8 player cards"
        className="relative w-full flex-1 min-h-0"
        style={{ maxWidth: 390, minHeight: 168, marginTop: 8, zIndex: 2 }}
      >
        <div
          aria-hidden="true"
          className="absolute"
          style={{
            left: '50%',
            bottom: 5,
            width: '82%',
            height: '42%',
            transform: 'translateX(-50%) perspective(160px) rotateX(56deg)',
            border: '1px solid rgba(217,170,72,0.35)',
            borderRadius: '50%',
            boxShadow: '0 0 28px rgba(217,170,72,0.12), inset 0 0 24px rgba(217,170,72,0.08)',
          }}
        />

        {HERO_CARDS.map((card, index) => {
          const side = index - 1;
          return (
            <div
              key={card.id}
              className="absolute"
              style={{
                width: 'clamp(102px, 29vw, 126px)',
                left: `calc(50% + ${side * 78}px)`,
                top: side === 0 ? 2 : 20,
                transform: `translateX(-50%) rotate(${side * 8}deg)`,
                transformOrigin: '50% 90%',
                zIndex: side === 0 ? 3 : 2,
                filter: side === 0 ? 'none' : 'brightness(0.74) saturate(0.84)',
                pointerEvents: 'none',
              }}
            >
              <GameCard model={{ variant: 'player', card }} ariaLabel={card.name} />
            </div>
          );
        })}
      </section>

      <div className="relative shrink-0 w-full" style={{ maxWidth: 330, zIndex: 3 }}>
        <p style={{ fontFamily: PIXEL, fontSize: 11, lineHeight: 1.55, letterSpacing: 0.7, color: 'var(--cream)' }}>
          BUILD AN XI. WIN THE CUP.
        </p>
        <p style={{ marginTop: 5, fontSize: 11.5, lineHeight: 1.4, color: 'var(--dust)' }}>
          Sign icons. Choose your shape. Make every Action count.
        </p>

        <div className="flex flex-col" style={{ gap: 9, marginTop: 15 }}>
          <button
            onClick={onNewRun}
            className="sheen-strong glow-edge w-full active:scale-[0.98] relative overflow-hidden"
            style={{
              height: 52,
              fontFamily: PIXEL,
              fontSize: 13,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              borderRadius: 'var(--radius)',
              background: 'linear-gradient(180deg, var(--gold) 0%, #c8901f 100%)',
              color: 'var(--ink-black)',
              border: '2px solid var(--ink-black)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 0 var(--ink-black), 0 0 18px var(--gold-glow)',
              ['--glow' as string]: 'var(--gold-glow)',
            }}
          >
            New Season {'→'}
          </button>

          {hasExistingRun && onContinue && (
            <button
              onClick={onContinue}
              className="glass-raised sheen w-full active:scale-[0.98] relative overflow-hidden"
              style={{
                height: 46,
                fontFamily: PIXEL,
                fontSize: 11,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                borderRadius: 'var(--radius)',
                color: 'var(--cream)',
                border: '1px solid rgba(217,170,72,0.48)',
                boxShadow: 'inset 0 1px 0 var(--glass-highlight), 0 3px 0 var(--ink-black)',
              }}
            >
              Continue Run
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
