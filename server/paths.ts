import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** SY80_HOME moves media/, .cache/ and data/ elsewhere, so audit-upload can run on a throwaway copy. */
const HOME = process.env.SY80_HOME ? path.resolve(process.env.SY80_HOME) : ROOT;
export const MEDIA_DIR = path.join(HOME, 'media');
export const CACHE_DIR = path.join(HOME, '.cache');
export const DATA_DIR = path.join(HOME, 'data');
export const DIST_DIR = path.join(ROOT, 'dist');
export const SHOW_FILE = path.join(DATA_DIR, 'show.json');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const DB_FILE = path.join(DATA_DIR, 'library.db');

export function ensureDirs() {
  for (const d of [MEDIA_DIR, path.join(MEDIA_DIR, 'photos'), path.join(MEDIA_DIR, 'videos', 'greetings'), path.join(MEDIA_DIR, 'music'),
    CACHE_DIR, path.join(CACHE_DIR, 'img'), path.join(CACHE_DIR, 'vid'), path.join(CACHE_DIR, 'music'), DATA_DIR, BACKUP_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
