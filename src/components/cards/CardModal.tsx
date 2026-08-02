'use client';

import type { GameCardModel } from './GameCard';
import LegacyCardModal from './LegacyCardModal';
import PlayerDossier, { collectionPlayerDossier } from '../player-cards/PlayerDossier';

interface CardModalProps {
  model: GameCardModel | null;
  onClose: () => void;
}

/**
 * Shared inspection entry point.
 *
 * Player cards use the groomed full-screen dossier. The other card families keep
 * their existing inspector until their own migrations are designed.
 */
export default function CardModal({ model, onClose }: CardModalProps) {
  if (model?.variant === 'player') {
    return <PlayerDossier data={collectionPlayerDossier(model.card)} onClose={onClose} />;
  }

  return <LegacyCardModal model={model} onClose={onClose} />;
}
