// Removes the generated demo material and the derived data so the app starts from a clean slate.
// Reversible: everything is MOVED to .trash/<timestamp>/ inside the project (git-ignored); delete that folder when you are sure.
// Usage: node scripts/clean-data.mjs            (stop the server first)
//        node scripts/clean-data.mjs --all-media  also moves media/photos, media/videos/greetings and media/music (your real files!)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const TRASH = path.join(ROOT, '.trash', stamp);
const all = process.argv.includes('--all-media');
const moved = [];
function move(rel) {
  const src = path.join(ROOT, rel); if (!fs.existsSync(src)) return;
  const dst = path.join(TRASH, rel); fs.mkdirSync(path.dirname(dst), { recursive: true });
  try { fs.renameSync(src, dst); } catch { fs.cpSync(src, dst, { recursive: true }); fs.rmSync(src, { recursive: true, force: true }); }
  moved.push(rel);
}
function moveChildren(rel, filter = () => true) { const dir = path.join(ROOT, rel); if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir)) if (filter(e)) move(path.join(rel, e)); }

// sample media written by scripts/sample-media.ts
move('media/sample-photos');
moveChildren('media/music', n => /\(דוגמה\)/.test(n));
if (all) { moveChildren('media/photos'); moveChildren('media/videos/greetings'); moveChildren('media/music'); }
// derived data: all regenerable from media/ by a scan (the show itself is NOT touched unless --all-media)
moveChildren('.cache');
for (const f of ['data/library.db', 'data/library.db-wal', 'data/library.db-shm']) move(f);
moveChildren('data/backups');
if (all) move('data/show.json');

const greetings = fs.existsSync(path.join(ROOT, 'media/videos/greetings')) ? fs.readdirSync(path.join(ROOT, 'media/videos/greetings')) : [];
console.log(moved.length ? `moved ${moved.length} items to ${path.relative(ROOT, TRASH)}:\n  ${moved.join('\n  ')}` : 'nothing to clean');
if (!all && greetings.length) console.log(`\nleft in place (real or sample greetings cannot be told apart): media/videos/greetings/ (${greetings.length} files). Delete the sample ones by hand or run with --all-media.`);
console.log('\nNext: start the server (npm start) and press "סרוק את media/" in the editor to rebuild the catalogue from media/.');
