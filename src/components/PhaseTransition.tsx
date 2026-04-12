'use client';

import { useEffect, useState } from 'react';

interface PhaseTransitionProps {
  children: React.ReactNode;
  phase: string;
}

export default function PhaseTransition({ children, phase }: PhaseTransitionProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Reset on phase change, then fade in
    setVisible(false);
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(t);
  }, [phase]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease-out',
        minHeight: '100dvh',
      }}
    >
      {children}
    </div>
  );
}
