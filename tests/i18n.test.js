import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { STRINGS } from '../src/strings.js';
import { LANGS, isPair, localize, t, ordinal } from '../src/i18n.js';
import { RAW_WORLDS } from '../src/worlds/index.js';
import { UPGRADES } from '../src/sim/progression.js';

// The game speaks English and French (see src/i18n.js): every text the player reads exists in both.
const slots = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// every source the player's texts can come from: the page and the game's code
const sources = [readFileSync(new URL('../index.html', import.meta.url), 'utf8')];
(function read(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
    if (e.isDirectory()) read(p);
    else if (e.name.endsWith('.js') && e.name !== 'strings.js') sources.push(readFileSync(p, 'utf8'));
  }
})(new URL('../src/', import.meta.url));
const code = sources.join('\n');

describe('interface texts (src/strings.js)', () => {
  it('every text is written in every language, with the same slots', () => {
    for (const [key, v] of Object.entries(STRINGS)) {
      for (const l of LANGS) expect(v[l], `${key}.${l}`).toBeTruthy();
      expect(slots(v.fr), key).toEqual(slots(v.en));
    }
  });

  it('every key the code or the page asks for exists', () => {
    const keys = new Set(Object.keys(STRINGS));
    const asked = [
      ...[...code.matchAll(/\bt\(\s*'([\w.]+)'/g)].map((m) => m[1]),
      ...[...code.matchAll(/\bt\([^)]*\?\s*'([\w.]+)'\s*:\s*'([\w.]+)'/g)].flatMap((m) => [m[1], m[2]]),
      ...[...code.matchAll(/data-t(?:-html|-title|-placeholder)?="([\w.]+)"/g)].map((m) => m[1]),
    ];
    expect(asked.length).toBeGreaterThan(100);
    expect(asked.filter((k) => !keys.has(k))).toEqual([]);
  });

  it('no text is left unused (the upgrade cards are asked for by their id)', () => {
    const unused = Object.keys(STRINGS).filter((k) => !k.startsWith('up.') && !code.includes(`'${k}'`) && !code.includes(`"${k}"`));
    expect(unused).toEqual([]);
    for (const u of UPGRADES) {
      expect(STRINGS[`up.${u.id}`], u.id).toBeTruthy();
      expect(STRINGS[`up.${u.id}.desc`], u.id).toBeTruthy();
    }
  });

  it('fills slots and counts in each language', () => {
    expect(t('sim.wave', { n: 3 }, 'en')).toBe('Wave 3');
    expect(t('sim.wave', { n: 3 }, 'fr')).toBe('Vague 3');
    expect(t('no.such.key')).toBe('no.such.key');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map((n) => ordinal(n, 'en'))).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
    expect([1, 2, 10].map((n) => ordinal(n, 'fr'))).toEqual(['1er', '2e', '10e']);
  });
});

describe('universe texts (src/worlds/*.js)', () => {
  const pairOk = (v) => isPair(v) && LANGS.every((l) => (Array.isArray(v[l]) ? v[l].length && v[l].every(Boolean) : !!v[l]));
  // every leaf of the texts block is a pair (modes are a group of them)
  const leaves = (o, path) => Object.entries(o).flatMap(([k, v]) =>
    isPair(v) || typeof v !== 'object' ? [[`${path}.${k}`, v]] : leaves(v, `${path}.${k}`));

  for (const w of Object.values(RAW_WORLDS)) {
    it(`${w.id} names itself, its weapons and every text in both languages`, () => {
      for (const k of ['name', 'title', 'lede']) expect(pairOk(w[k]), `${w.id}.${k}`).toBe(true);
      for (const wp of w.weapons) {
        expect(pairOk(wp.name), `${wp.id}.name`).toBe(true);
        expect(pairOk(wp.short), `${wp.id}.short`).toBe(true);
      }
      for (const [path, v] of leaves(w.texts, `${w.id}.texts`)) expect(pairOk(v), path).toBe(true);
    });
  }

  it('the two languages really differ where words are concerned', () => {
    const en = localize(RAW_WORLDS, 'en'), fr = localize(RAW_WORLDS, 'fr');
    expect(en.sables.texts.victory).not.toBe(fr.sables.texts.victory);
    expect(en.station.weapons[0].name).toBe('STUN BATON');
    expect(fr.station.weapons[0].name).toBe('MATRAQUE ÉLECTRIQUE');
  });
});
