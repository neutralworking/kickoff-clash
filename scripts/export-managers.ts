/**
 * KC rebuild — export the manager roster + calibration set for the Python
 * balance reference. `src/engine/data/managers.ts` is the single source of
 * truth (law 4: managers ARE this data); `scripts/balance_sim.py --calibrate`
 * reads the emitted JSON so the two never drift by hand-copying.
 *
 *   npx tsx scripts/export-managers.ts   # rewrites scripts/managers_ref.json
 */

import { writeFileSync } from 'node:fs';
import { ALL_MANAGERS } from '../src/engine/data/managers';
import {
  CALIBRATION_OPPONENTS,
  CALIBRATION_TARGET,
  CALIBRATION_SUB_BATCHES,
  CALIBRATION_SEEDS,
} from '../src/engine/data/calibration';

const out = {
  managers: ALL_MANAGERS,
  calibration: {
    target: CALIBRATION_TARGET,
    subBatches: CALIBRATION_SUB_BATCHES,
    seeds: CALIBRATION_SEEDS,
    opponents: CALIBRATION_OPPONENTS,
  },
};

writeFileSync('scripts/managers_ref.json', JSON.stringify(out, null, 2) + '\n');
console.log(`wrote scripts/managers_ref.json (${ALL_MANAGERS.length} managers)`);
