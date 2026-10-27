// The CrazyGames SDK v3 (https://docs.crazygames.com/sdk/intro/): loading and gameplay events,
// midgame ads and the platform's mute setting. The SDK script is only fetched when the game runs on
// a CrazyGames domain, or locally with ?crazygames in the address (the SDK then fakes its ads);
// anywhere else (itch.io, the dev server) every call below does nothing.

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const WANTED = /(^|\.)crazygames\.[a-z.]+$/.test(location.hostname) || new URLSearchParams(location.search).has('crazygames');

let sdk = null; // window.CrazyGames.SDK once it is ready
let playing = false;
let adOn = false;

export const portal = {
  muted: false, // the platform asks for silence: it wins over the volume options
  onMute: null, // called when `muted` changes

  // Loads and starts the SDK; never fails and never waits more than a few seconds, so a blocked
  // script (an ad blocker) only leaves the game without the portal.
  async init() {
    if (!WANTED) return;
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SDK_URL;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
        setTimeout(() => reject(new Error('timeout')), 6000);
      });
      const SDK = window.CrazyGames?.SDK;
      await Promise.race([SDK.init(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))]);
      if (SDK.environment === 'disabled') return;
      sdk = SDK;
      const apply = (s) => {
        if (!!s?.muteAudio === portal.muted) return;
        portal.muted = !!s?.muteAudio;
        portal.onMute?.(portal.muted);
      };
      apply(sdk.game.settings);
      sdk.game.addSettingsChangeListener(apply);
      sdk.game.loadingStart();
    } catch (e) {
      console.warn('CrazyGames SDK unavailable', e);
    }
  },

  loadingDone() { sdk?.game.loadingStop(); },

  // true while the player is actually playing (not in a menu, the pause screen or an ad)
  setPlaying(on) {
    if (!sdk || on === playing) return;
    playing = on;
    if (on) sdk.game.gameplayStart();
    else sdk.game.gameplayStop();
  },

  // A midgame ad at a natural break. `pause` is called only if an ad really starts, `resume` when it
  // is over; the SDK itself turns away requests closer than 3 minutes apart (adCooldown).
  midgameAd(pause, resume) {
    if (!sdk || adOn) return;
    sdk.ad.requestAd('midgame', {
      adStarted: () => { adOn = true; pause(); },
      adFinished: () => { if (adOn) { adOn = false; resume(); } },
      adError: () => { if (adOn) { adOn = false; resume(); } },
    });
  },

  // a rare moment of joy (a boss down, a won game), as the SDK asks
  happy() { sdk?.game.happytime(); },
};
