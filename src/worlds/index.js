import { SABLES } from './sables.js';
import { PIRATES } from './pirates.js';
import { STATION } from './station.js';
import { localize } from '../i18n.js';

// Every universe of the game, in the order of the title screen, its texts in the player's language
// (the files write each text as a pair { en, fr }; RAW_WORLDS keeps both, for the tests).
export const RAW_WORLDS = { sables: SABLES, pirates: PIRATES, station: STATION };
export const WORLDS = localize(RAW_WORLDS);
export const DEFAULT_WORLD = 'sables';

// A world by id; an unknown id (an old save, a typo) falls back to the desert.
export function getWorld(id) {
  return WORLDS[id] ?? WORLDS[DEFAULT_WORLD];
}
