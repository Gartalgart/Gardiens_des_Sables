// Player settings, saved in this browser.
import { t } from './i18n.js';

const KEY = 'gds-settings';

// A first guess at the graphics this machine can afford (a web portal's players come on anything,
// small Chromebooks included): low on 4 GB of memory or less, medium on 4 cores or less.
function guessQuality() {
  const mem = globalThis.navigator?.deviceMemory, cores = globalThis.navigator?.hardwareConcurrency;
  if (mem && mem <= 4) return 'low';
  // phones and tablets: a small, hot GPU behind a dense screen
  if (cores && cores <= 4 || globalThis.matchMedia?.('(pointer: coarse)').matches) return 'medium';
  return 'high';
}

export const DEFAULTS = {
  sensitivity: 1.0, // multiplier of the base mouse speed
  invertY: false,
  fov: 75,
  volMaster: 0.8,
  volSfx: 1.0,
  volMusic: 0.6,
  quality: guessQuality(), // low | medium | high
  // the game lowers the quality itself while the frame rate is poor, until the player picks one
  qualityAuto: true,
  showFps: false,
  showHealthNum: false, // the number next to the health bar, handy for debugging
  cameraShake: true,
  playerName: t('opt.defaultName'),
};

export const QUALITY = {
  low: { pixelRatio: 0.75, msaa: 0, shadowSize: 1024, shadows: true, bloom: false, fireLights: 3, particles: 0.5 },
  medium: { pixelRatio: 1.0, msaa: 2, shadowSize: 1024, shadows: true, bloom: true, fireLights: 4, particles: 0.75 },
  high: { pixelRatio: 1.5, msaa: 4, shadowSize: 2048, shadows: true, bloom: true, fireLights: 6, particles: 1 },
};
export const QUALITY_ORDER = ['low', 'medium', 'high'];

export const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
if (!QUALITY[settings.quality]) settings.quality = DEFAULTS.quality;

const listeners = new Set();
export function onSettingsChange(fn) { listeners.add(fn); fn(settings); }

export function updateSettings(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  for (const fn of listeners) fn(settings);
}
