// Local leaderboard: top 10 scores per mode and difficulty, kept in this browser.
const KEY = 'gds-scores';
const SIZE = 10;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function boardKey(mode, difficulty) { return `${mode}-${difficulty}`; }

export function topScores(mode, difficulty) {
  return load()[boardKey(mode, difficulty)] || [];
}

// Adds a result; returns its rank (0-based) or -1 when it did not make the top 10.
export function recordScore(mode, difficulty, entry) {
  const all = load();
  const key = boardKey(mode, difficulty);
  const list = all[key] || [];
  const row = { ...entry, date: new Date().toISOString().slice(0, 10), id: Math.random().toString(36).slice(2) };
  list.push(row);
  list.sort((a, b) => b.score - a.score);
  all[key] = list.slice(0, SIZE);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
  return all[key].findIndex((r) => r.id === row.id);
}
