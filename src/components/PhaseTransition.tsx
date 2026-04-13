'use client';

interface PhaseTransitionProps {
  children: React.ReactNode;
  phase: string;
}

export default function PhaseTransition({ children, phase }: PhaseTransitionProps) {
  return (
    <div
      key={phase}
      style={{
        animation: 'phase-fade-in 0.3s ease-out',
        minHeight: '100dvh',
      }}
    >
      {children}
      <style>{`
        @keyframes phase-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
