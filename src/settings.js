// Player settings, saved in this browser.
const KEY = 'gds-settings';

export const DEFAULTS = {
  sensitivity: 1.0, // multiplier of the base mouse speed
  invertY: false,
  fov: 75,
  volMaster: 0.8,
  volSfx: 1.0,
  volMusic: 0.6,
  quality: 'high', // low | medium | high
  showFps: false,
  cameraShake: true,
};

export const QUALITY = {
  low: { label: 'Basse', pixelRatio: 0.75, shadowSize: 1024, shadows: true, bloom: false, fireLights: 3, particles: 0.5 },
  medium: { label: 'Moyenne', pixelRatio: 1.0, shadowSize: 1024, shadows: true, bloom: true, fireLights: 4, particles: 0.75 },
  high: { label: 'Haute', pixelRatio: 1.5, shadowSize: 2048, shadows: true, bloom: true, fireLights: 6, particles: 1 },
};

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
