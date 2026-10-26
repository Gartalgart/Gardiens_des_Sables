// The web build as one zip, index.html at its root, ready for itch.io (and the CrazyGames
// Developer Portal): release/worldbreach-web.zip. Run with `npm run package` (it builds first).
// The zip is made by bsdtar, shipped with Windows 10+ and macOS (`tar -a` picks the format from the
// file name).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, readdirSync } from 'node:fs';

const OUT = 'release/worldbreach-web.zip';
const TAR = process.platform === 'win32' ? `${process.env.SystemRoot}\\System32\\tar.exe` : 'tar';

mkdirSync('release', { recursive: true });
rmSync(OUT, { force: true });
execFileSync(TAR, ['-a', '-c', '-f', OUT, '-C', 'dist', ...readdirSync('dist')], { stdio: 'inherit' });

const count = (dir) => readdirSync(dir, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? count(`${dir}/${e.name}`) : 1), 0);
console.log(`${OUT}: ${(statSync(OUT).size / 1e6).toFixed(1)} MB, ${count('dist')} files`);
