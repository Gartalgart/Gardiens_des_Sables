// Plays the built game the way a web portal shows it: from a sub-path, in a sandboxed iframe of
// another origin, at the sizes CrazyGames uses. http://localhost:4180 is the portal page; the
// iframe loads dist/ from http://127.0.0.1:4180/games/gardiens/ (another host name is another
// origin), so any absolute path in the build breaks here.
// Run `npm run build`, then `npm run portal:test` and open http://localhost:4180.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = 4180;
const GAME = '/games/gardiens/';
const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

const FRAME = `<!doctype html>
<html><head><meta charset="UTF-8"><title>Portal test</title>
<style>
  body { margin: 0; padding: 16px; background: #1b1d22; color: #ddd; font: 14px system-ui, sans-serif; }
  button { margin-right: 6px; }
  iframe { display: block; margin-top: 12px; border: 0; background: #000; }
</style></head><body>
  <button data-size="800x450">Mobile 800×450</button>
  <button data-size="1080x607">Tablette 1080×607</button>
  <button data-size="1280x720">Desktop 1280×720</button>
  <iframe id="game" src="http://127.0.0.1:${PORT}${GAME}" width="800" height="450"
    allow="autoplay; fullscreen; gamepad"
    sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups"></iframe>
<script>
  for (const b of document.querySelectorAll('button')) b.onclick = () => {
    const [w, h] = b.dataset.size.split('x');
    Object.assign(document.getElementById('game'), { width: w, height: h });
  };
</script>
</body></html>`;

async function serveDist(req, res) {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(GAME.length));
  const file = (rel && normalize(rel).replace(/^[\\/]+/, '')) || 'index.html';
  try {
    const body = await readFile(join(DIST, file));
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}

createServer((req, res) => {
  if (req.url.startsWith(GAME)) return serveDist(req, res);
  if (req.url === '/') return res.writeHead(200, { 'Content-Type': 'text/html' }).end(FRAME);
  res.writeHead(404).end();
}).listen(PORT);
console.log(`Portal test: http://localhost:${PORT} (game served under ${GAME})`);
