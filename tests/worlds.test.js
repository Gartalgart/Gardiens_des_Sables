import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { WORLDS } from '../src/worlds/index.js';

// Every universe has an interface of its own (see CLAUDE.md): a complete `hud`, a font and an
// accent no other universe uses, and the texts the HUD reads in its own words.
const HUD_KEYS = ['font', 'accent', 'accentDim', 'accentHi', 'ink', 'inkDim', 'line', 'panel', 'button', 'health', 'grenade', 'map'];
const TEXT_KEYS = ['meleeName', 'grenadeName', 'grenadeHelp', 'killsLabel', 'guards', 'tips', 'bossName', 'victory'];
const worlds = Object.values(WORLDS);

describe('universe interfaces', () => {
  for (const w of worlds) {
    it(`${w.id} has a complete hud and its texts`, () => {
      for (const k of HUD_KEYS) expect(w.hud?.[k], `hud.${k}`).toBeTruthy();
      expect(w.hud.button).toHaveLength(3);
      expect(w.hud.health).toHaveLength(2);
      expect(w.hud.grenade).toHaveLength(2);
      expect(w.hud.map.wall).toHaveLength(3);
      for (const k of TEXT_KEYS) expect(w.texts?.[k], `texts.${k}`).toBeTruthy();
    });
  }

  it('no two universes share a font or an accent', () => {
    for (const k of ['font', 'accent']) {
      const values = worlds.map((w) => w.hud[k]);
      expect(new Set(values).size, k).toBe(values.length);
    }
  });

  it("every universe's font is loaded by the page", () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    for (const w of worlds) {
      const family = w.hud.font.match(/"([^"]+)"/)?.[1] ?? w.hud.font.split(',')[0];
      expect(html, family).toContain(`family=${family.trim().replace(/ /g, '+')}`);
    }
  });
});
