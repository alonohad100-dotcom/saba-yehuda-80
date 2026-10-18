import { DatabaseSync } from 'node:sqlite';
import { DB_FILE } from './paths.ts';
import type { Asset } from '../shared/model.ts';

let db: DatabaseSync;

/** Columns added after the first release; added with ALTER TABLE when missing so old libraries upgrade in place. */
const MIGRATIONS: [string, string][] = [
  ['dhash', 'TEXT'], ['sharpness', 'REAL'], ['entropy', 'REAL'], ['luma', 'REAL'], ['colorfulness', 'REAL'], ['quality', 'REAL'],
  ['face_count', 'INTEGER'], ['face_box', 'TEXT'], ['dup_group', 'TEXT'], ['burst_group', 'TEXT'], ['is_best', 'INTEGER'],
];

export function openDb(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(DB_FILE);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      rel_path TEXT NOT NULL,
      name TEXT NOT NULL,
      folder TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      mtime INTEGER NOT NULL,
      width INTEGER, height INTEGER, duration REAL,
      taken_at TEXT, year INTEGER, year_source TEXT NOT NULL DEFAULT 'mtime',
      portrait INTEGER, focal_x REAL, focal_y REAL,
      peaks TEXT, loudness_gain REAL,
      status TEXT NOT NULL DEFAULT 'processing', error TEXT,
      seen INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assets_path ON assets(rel_path);
    CREATE TABLE IF NOT EXISTS files (
      rel_path TEXT PRIMARY KEY,
      bytes INTEGER NOT NULL, mtime INTEGER NOT NULL, asset_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS show_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      saved_at INTEGER NOT NULL,
      label TEXT,
      slides INTEGER NOT NULL,
      seconds REAL NOT NULL,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  `);
  const cols = new Set((db.prepare(`PRAGMA table_info(assets)`).all() as { name: string }[]).map(r => r.name));
  for (const [col, type] of MIGRATIONS) if (!cols.has(col)) db.exec(`ALTER TABLE assets ADD COLUMN ${col} ${type}`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assets_dup ON assets(dup_group)`);
  return db;
}

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? undefined : (v as number));
function rowToAsset(r: Row): Asset {
  return {
    id: r.id as string, type: r.type as Asset['type'], relPath: r.rel_path as string, name: r.name as string, folder: r.folder as string,
    bytes: r.bytes as number, mtime: r.mtime as number,
    width: num(r.width), height: num(r.height), duration: num(r.duration),
    takenAt: (r.taken_at as string | null) ?? undefined, year: num(r.year), yearSource: r.year_source as Asset['yearSource'],
    portrait: r.portrait == null ? undefined : !!r.portrait,
    focal: r.focal_x == null ? undefined : [r.focal_x as number, r.focal_y as number],
    peaks: r.peaks ? JSON.parse(r.peaks as string) : undefined,
    loudnessGain: num(r.loudness_gain),
    status: r.status as Asset['status'], error: (r.error as string | null) ?? undefined,
    dhash: (r.dhash as string | null) ?? undefined, sharpness: num(r.sharpness), entropy: num(r.entropy), luma: num(r.luma), colorfulness: num(r.colorfulness), quality: num(r.quality),
    faceCount: num(r.face_count), faceBox: r.face_box ? JSON.parse(r.face_box as string) : undefined,
    dupGroup: (r.dup_group as string | null) ?? undefined, burstGroup: (r.burst_group as string | null) ?? undefined, isBest: r.is_best == null ? undefined : !!r.is_best,
  };
}

export function listAssets(): Asset[] {
  const rows = openDb().prepare(`SELECT * FROM assets WHERE seen = 1 ORDER BY year, taken_at, name`).all() as Row[];
  return rows.map(rowToAsset);
}
export function getAsset(id: string): Asset | undefined {
  const r = openDb().prepare(`SELECT * FROM assets WHERE id = ?`).get(id) as Row | undefined;
  return r ? rowToAsset(r) : undefined;
}
/** Insert or refresh the ingest-level fields. Analysis fields are only written when the caller provides them. */
export function upsertAsset(a: Asset) {
  openDb().prepare(`INSERT INTO assets (id,type,rel_path,name,folder,bytes,mtime,width,height,duration,taken_at,year,year_source,portrait,focal_x,focal_y,peaks,loudness_gain,status,error,seen,created_at,
      dhash,sharpness,entropy,luma,colorfulness,quality,face_count,face_box,dup_group,burst_group,is_best)
    VALUES (@id,@type,@rel_path,@name,@folder,@bytes,@mtime,@width,@height,@duration,@taken_at,@year,@year_source,@portrait,@focal_x,@focal_y,@peaks,@loudness_gain,@status,@error,1,@created_at,
      @dhash,@sharpness,@entropy,@luma,@colorfulness,@quality,@face_count,@face_box,@dup_group,@burst_group,@is_best)
    ON CONFLICT(id) DO UPDATE SET type=excluded.type, rel_path=excluded.rel_path, name=excluded.name, folder=excluded.folder, bytes=excluded.bytes, mtime=excluded.mtime,
      width=excluded.width, height=excluded.height, duration=excluded.duration, taken_at=excluded.taken_at,
      year=CASE WHEN assets.year_source='manual' THEN assets.year ELSE excluded.year END,
      year_source=CASE WHEN assets.year_source='manual' THEN 'manual' ELSE excluded.year_source END,
      portrait=excluded.portrait,
      focal_x=COALESCE(assets.focal_x, excluded.focal_x), focal_y=COALESCE(assets.focal_y, excluded.focal_y),
      peaks=excluded.peaks, loudness_gain=excluded.loudness_gain, status=excluded.status, error=excluded.error, seen=1,
      dhash=COALESCE(excluded.dhash, assets.dhash), sharpness=COALESCE(excluded.sharpness, assets.sharpness), entropy=COALESCE(excluded.entropy, assets.entropy),
      luma=COALESCE(excluded.luma, assets.luma), colorfulness=COALESCE(excluded.colorfulness, assets.colorfulness), quality=COALESCE(excluded.quality, assets.quality),
      face_count=COALESCE(excluded.face_count, assets.face_count), face_box=COALESCE(excluded.face_box, assets.face_box),
      dup_group=COALESCE(excluded.dup_group, assets.dup_group), burst_group=COALESCE(excluded.burst_group, assets.burst_group), is_best=COALESCE(excluded.is_best, assets.is_best)`).run({
    '@id': a.id, '@type': a.type, '@rel_path': a.relPath, '@name': a.name, '@folder': a.folder, '@bytes': a.bytes, '@mtime': a.mtime,
    '@width': a.width ?? null, '@height': a.height ?? null, '@duration': a.duration ?? null, '@taken_at': a.takenAt ?? null, '@year': a.year ?? null,
    '@year_source': a.yearSource, '@portrait': a.portrait == null ? null : (a.portrait ? 1 : 0), '@focal_x': a.focal?.[0] ?? null, '@focal_y': a.focal?.[1] ?? null,
    '@peaks': a.peaks ? JSON.stringify(a.peaks) : null, '@loudness_gain': a.loudnessGain ?? null, '@status': a.status, '@error': a.error ?? null, '@created_at': Date.now(),
    '@dhash': a.dhash ?? null, '@sharpness': a.sharpness ?? null, '@entropy': a.entropy ?? null, '@luma': a.luma ?? null, '@colorfulness': a.colorfulness ?? null, '@quality': a.quality ?? null,
    '@face_count': a.faceCount ?? null, '@face_box': a.faceBox ? JSON.stringify(a.faceBox) : null, '@dup_group': a.dupGroup ?? null, '@burst_group': a.burstGroup ?? null, '@is_best': a.isBest == null ? null : (a.isBest ? 1 : 0),
  });
}
export function setAnalysis(id: string, f: { dhash: string; sharpness: number; entropy: number; luma: number; colorfulness: number; faceCount?: number; faceBox?: number[]; focal?: [number, number] }) {
  const d = openDb();
  d.prepare(`UPDATE assets SET dhash=?, sharpness=?, entropy=?, luma=?, colorfulness=?, face_count=COALESCE(?, face_count), face_box=COALESCE(?, face_box) WHERE id=?`)
    .run(f.dhash, f.sharpness, f.entropy, f.luma, f.colorfulness, f.faceCount ?? null, f.faceBox ? JSON.stringify(f.faceBox) : null, id);
  if (f.focal) d.prepare(`UPDATE assets SET focal_x=?, focal_y=? WHERE id=?`).run(f.focal[0], f.focal[1], id);
}
export function setGroups(rows: { id: string; quality: number; dupGroup: string; burstGroup: string; isBest: boolean }[]) {
  const d = openDb(); const st = d.prepare(`UPDATE assets SET quality=?, dup_group=?, burst_group=?, is_best=? WHERE id=?`);
  d.exec('BEGIN'); try { for (const r of rows) st.run(r.quality, r.dupGroup, r.burstGroup, r.isBest ? 1 : 0, r.id); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; }
}
export function photosNeedingAnalysis(): Asset[] {
  return (openDb().prepare(`SELECT * FROM assets WHERE seen = 1 AND type = 'photo' AND status = 'ready' AND dhash IS NULL`).all() as Row[]).map(rowToAsset);
}
export function patchAsset(id: string, patch: { year?: number; focal?: [number, number] }) {
  const d = openDb();
  if (patch.year != null) d.prepare(`UPDATE assets SET year = ?, year_source = 'manual' WHERE id = ?`).run(patch.year, id);
  if (patch.focal) d.prepare(`UPDATE assets SET focal_x = ?, focal_y = ? WHERE id = ?`).run(patch.focal[0], patch.focal[1], id);
  return getAsset(id);
}
export function fileRecord(relPath: string): { bytes: number; mtime: number; asset_id: string } | undefined {
  return openDb().prepare(`SELECT bytes, mtime, asset_id FROM files WHERE rel_path = ?`).get(relPath) as any;
}
export function setFileRecord(relPath: string, bytes: number, mtime: number, assetId: string) {
  openDb().prepare(`INSERT INTO files (rel_path, bytes, mtime, asset_id) VALUES (?,?,?,?) ON CONFLICT(rel_path) DO UPDATE SET bytes=excluded.bytes, mtime=excluded.mtime, asset_id=excluded.asset_id`).run(relPath, bytes, mtime, assetId);
}
export function markAllUnseen() { openDb().exec(`UPDATE assets SET seen = 0`); }
export function markSeen(id: string) { openDb().prepare(`UPDATE assets SET seen = 1 WHERE id = ?`).run(id); }
export function pruneUnseenFiles(existing: Set<string>) {
  const d = openDb(); const rows = d.prepare(`SELECT rel_path FROM files`).all() as { rel_path: string }[];
  const del = d.prepare(`DELETE FROM files WHERE rel_path = ?`);
  for (const r of rows) if (!existing.has(r.rel_path)) del.run(r.rel_path);
}

export function saveShowVersion(json: string, slides: number, seconds: number, label?: string) {
  const d = openDb();
  d.prepare(`INSERT INTO show_versions (saved_at, label, slides, seconds, json) VALUES (?,?,?,?,?)`).run(Date.now(), label ?? null, slides, seconds, json);
  d.exec(`DELETE FROM show_versions WHERE label IS NULL AND id NOT IN (SELECT id FROM show_versions WHERE label IS NULL ORDER BY id DESC LIMIT 300)`);
}
export function listShowVersions(limit = 100) {
  return openDb().prepare(`SELECT id, saved_at, label, slides, seconds FROM show_versions ORDER BY id DESC LIMIT ?`).all(limit) as { id: number; saved_at: number; label: string | null; slides: number; seconds: number }[];
}
export function getShowVersion(id: number): string | undefined {
  const r = openDb().prepare(`SELECT json FROM show_versions WHERE id = ?`).get(id) as { json: string } | undefined; return r?.json;
}
export function labelShowVersion(id: number, label: string) { openDb().prepare(`UPDATE show_versions SET label = ? WHERE id = ?`).run(label, id); }
export function kvGet(k: string): string | undefined { const r = openDb().prepare(`SELECT v FROM kv WHERE k = ?`).get(k) as { v: string } | undefined; return r?.v; }
export function kvSet(k: string, v: string) { openDb().prepare(`INSERT INTO kv (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(k, v); }
