// Local leaderboard: top 10 scores per universe, mode and difficulty, kept in this browser.
const KEY = 'gds-scores';
const SIZE = 10;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

// the desert keeps its keys from before the other universes, so its scores are not lost
export function boardKey(world, mode, difficulty) {
  return world === 'sables' ? `${mode}-${difficulty}` : `${world}-${mode}-${difficulty}`;
}

export function topScores(world, mode, difficulty) {
  return load()[boardKey(world, mode, difficulty)] || [];
}

// Adds a result; returns its rank (0-based) or -1 when it did not make the top 10.
export function recordScore(world, mode, difficulty, entry) {
  const all = load();
  const key = boardKey(world, mode, difficulty);
  const list = all[key] || [];
  const row = { ...entry, date: new Date().toISOString().slice(0, 10), id: Math.random().toString(36).slice(2) };
  list.push(row);
  list.sort((a, b) => b.score - a.score);
  all[key] = list.slice(0, SIZE);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
  return all[key].findIndex((r) => r.id === row.id);
}
