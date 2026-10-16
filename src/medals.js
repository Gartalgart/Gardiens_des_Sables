// Halo-style medals: multi-kills (kills less than 4 s apart) and, in the arena, sprees.
const MULTI = ['', '', 'Double Kill', 'Triple Kill', 'Overkill', 'Killtacular', 'Killtrocity', 'Killimanjaro', 'Killtastrophe', 'Killpocalypse', 'Killionaire'];
const SPREE = { 5: 'Killing Spree', 10: 'Killing Frenzy', 15: 'Running Riot', 20: 'Rampage', 25: 'Untouchable', 30: 'Invincible' };

export const multiKillName = (count) => MULTI[Math.min(count, MULTI.length - 1)];
export const spreeName = (count) => SPREE[count] ?? null;
