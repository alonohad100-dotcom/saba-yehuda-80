import fs from 'node:fs';
import path from 'node:path';
import { SHOW_FILE, BACKUP_DIR } from './paths.ts';
import { Show, defaultShow, slideSeconds, type Show as ShowT } from '../shared/model.ts';
import { saveShowVersion, listAssets } from './db.ts';

let cached: ShowT | null = null;

export function loadShow(): ShowT {
  if (cached) return cached;
  if (fs.existsSync(SHOW_FILE)) {
    try { cached = Show.parse(JSON.parse(fs.readFileSync(SHOW_FILE, 'utf8'))); return cached; }
    catch (e) { console.error('[show] show.json is invalid, moving it aside:', (e as Error).message); fs.renameSync(SHOW_FILE, SHOW_FILE + '.invalid-' + Date.now()); }
  }
  cached = defaultShow(); writeAtomic(cached); return cached;
}

function writeAtomic(show: ShowT) {
  const json = JSON.stringify(show, null, 2);
  const tmp = SHOW_FILE + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, SHOW_FILE);
  return json;
}

export function saveShow(input: unknown, label?: string): ShowT {
  const show = Show.parse(input);
  const json = writeAtomic(show);
  // rolling file backups (last 200) + DB version history
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(BACKUP_DIR, `show.${stamp}.json`), json, 'utf8');
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('show.')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 200))) fs.unlinkSync(path.join(BACKUP_DIR, f));
  const assets = Object.fromEntries(listAssets().map(a => [a.id, a]));
  const slides = show.chapters.reduce((n, c) => n + c.slides.length, 0);
  const seconds = show.chapters.reduce((t, c) => t + c.slides.reduce((u, s) => u + slideSeconds(s, c, show.settings, assets), 0), 0);
  saveShowVersion(json, slides, seconds, label);
  cached = show;
  return show;
}
