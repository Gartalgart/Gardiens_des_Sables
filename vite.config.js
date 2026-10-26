import { defineConfig } from 'vite';

// Relative asset paths: the built game runs from any folder, as web portals (CrazyGames, itch.io)
// serve it from a sub-path inside an iframe.
export default defineConfig({
  base: './',
});
