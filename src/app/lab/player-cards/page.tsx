import PlayerCardLab from '@/components/player-cards/PlayerCardLab';
import refinement from './PlayerCardLabRefinement.module.css';

/**
 * Unlinked grooming route for the shared player-card anatomy.
 *
 * Entry: /lab/player-cards
 *
 * This lab deliberately does not replace GameCard, SquadScreen or the V7 pitch
 * renderers yet. It proves the mobile card family before production migration.
 */
export default function PlayerCardsLabPage() {
  return (
    <div className={refinement.refined}>
      <PlayerCardLab />
    </div>
  );
}
