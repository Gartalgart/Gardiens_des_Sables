// The game's language, English or French, picked once when the page loads (changing it reloads).
// Every text the player reads is written as a pair { en, fr }: in the universes' files
// (src/worlds/*.js, resolved by localize) and in the interface's own dictionary (src/strings.js,
// read with t). Pure: also runs in Node (the co-op server speaks its machine's language).
import { STRINGS } from './strings.js';

export const LANGS = ['en', 'fr'];
const KEY = 'gds-lang';

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {}
  // the player's own language when the game speaks it, English otherwise
  const nav = String(globalThis.navigator?.language ?? '').slice(0, 2).toLowerCase();
  return LANGS.includes(nav) ? nav : 'en';
}

export const lang = detect();
// for numbers: 12 345 in French, 12,345 in English
export const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
export const num = (n) => n.toLocaleString(locale);

export function setLang(l) {
  if (!LANGS.includes(l) || l === lang) return;
  try { localStorage.setItem(KEY, l); } catch {}
  location.reload();
}

// a text in both languages: { en: '…', fr: '…' } (a string or an array of strings each)
export const isPair = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === 2 && 'en' in v && 'fr' in v;

// A copy of a universe (or any plain data) with every pair replaced by the current language's text.
export function localize(v, l = lang) {
  if (isPair(v)) return v[l];
  if (Array.isArray(v)) return v.map((x) => localize(x, l));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, localize(x, l)]));
  return v;
}

// An interface text by key, its {name} slots filled from vars. An unknown key shows itself, so a
// missing text is seen at once (and tests/i18n.test.js lists them).
export function t(key, vars = {}, l = lang) {
  const s = STRINGS[key]?.[l];
  if (s === undefined) return key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// 1st, 2nd, 3rd… / 1er, 2e, 3e…
export function ordinal(n, l = lang) {
  if (l === 'fr') return `${n}${n === 1 ? 'er' : 'e'}`;
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}

// The page's own texts: elements marked data-t (text), data-t-html (text with markup),
// data-t-title and data-t-placeholder, templates included.
export function translatePage(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of root.querySelectorAll('[data-t-html]')) el.innerHTML = t(el.dataset.tHtml);
  for (const el of root.querySelectorAll('[data-t-title]')) el.title = t(el.dataset.tTitle);
  for (const el of root.querySelectorAll('[data-t-placeholder]')) el.placeholder = t(el.dataset.tPlaceholder);
  for (const tpl of root.querySelectorAll('template')) translatePage(tpl.content);
}
