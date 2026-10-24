import { SABLES } from './sables.js';
import { PIRATES } from './pirates.js';

// Every universe of the game, in the order of the title screen.
export const WORLDS = { sables: SABLES, pirates: PIRATES };
export const DEFAULT_WORLD = 'sables';

// A world by id; an unknown id (an old save, a typo) falls back to the desert.
export function getWorld(id) {
  return WORLDS[id] ?? WORLDS[DEFAULT_WORLD];
}
