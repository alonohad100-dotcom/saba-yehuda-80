/**
 * Storage audit: SQLite schema, migrations, data integrity, derivative files, versions, backups, kv, persistence across restarts,
 * corrupt show.json recovery, concurrent saves. Starts and stops its own server instances. Usage: node --import tsx scripts/audit-db.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { Show } from '../shared/model.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DB = path.join(ROOT, 'data', 'library.db'), SHOW = path.join(ROOT, 'data', 'show.json'), BACKUPS = path.join(ROOT, 'data', 'backups'), CACHE = path.join(ROOT, '.cache'), MEDIA = path.join(ROOT, 'media');
const base = 'http://127.0.0.1:4000'; const results: { name: string; ok: boolean; detail?: string }[] = []; let fails = 0;
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok, detail }); if (!ok) fails++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const j = async (p: string, init?: RequestInit): Promise<{ status: number; body: any }> => { const r = await fetch(base + p, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : {} }); return { status: r.status, body: await r.json().catch(() => null) }; };

let server: ReturnType<typeof spawn> | null = null;
async function startServer() { server = spawn(process.execPath, ['--import', 'tsx', '--no-warnings=ExperimentalWarning', 'server/index.ts'], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'production' }, stdio: 'ignore', windowsHide: true }); for (let i = 0; i < 60; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) return; } catch { /* not yet */ } await sleep(500); } throw new Error('server did not start'); }
function stopServer() { if (!server) return; try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { server.kill(); } server = null; }
async function withServer<T>(fn: () => Promise<T>): Promise<T> { await startServer(); try { return await fn(); } finally { stopServer(); await sleep(800); } }

// ---------- 1. schema (server stopped) ----------
const db = new DatabaseSync(DB, { readOnly: true });
const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map(r => r.name);
check('tables: assets, files, show_versions, kv', ['assets', 'files', 'show_versions', 'kv'].every(t => tables.includes(t)), tables.join(','));
const cols = (db.prepare(`PRAGMA table_info(assets)`).all() as { name: string }[]).map(r => r.name);
const needed = ['id', 'type', 'rel_path', 'name', 'folder', 'bytes', 'mtime', 'width', 'height', 'duration', 'taken_at', 'year', 'year_source', 'portrait', 'focal_x', 'focal_y', 'peaks', 'loudness_gain', 'status', 'error', 'seen', 'created_at', 'dhash', 'sharpness', 'entropy', 'luma', 'colorfulness', 'quality', 'face_count', 'face_box', 'dup_group', 'burst_group', 'is_best'];
check('assets has all 33 columns incl. migrated analysis columns', needed.every(c => cols.includes(c)), needed.filter(c => !cols.includes(c)).join(',') || 'all present');
const idx = (db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='assets'`).all() as { name: string }[]).map(r => r.name);
check('indexes on rel_path and dup_group', idx.includes('idx_assets_path') && idx.includes('idx_assets_dup'), idx.join(','));
check('journal mode is WAL', (db.prepare(`PRAGMA journal_mode`).get() as { journal_mode: string }).journal_mode === 'wal');
check('integrity_check ok', (db.prepare(`PRAGMA integrity_check`).get() as { integrity_check: string }).integrity_check === 'ok');
// ---------- 2. data integrity ----------
type Row = Record<string, any>;
const assets = db.prepare(`SELECT * FROM assets WHERE seen = 1`).all() as Row[]; const photos = assets.filter(a => a.type === 'photo'); const videos = assets.filter(a => a.type === 'video'); const music = assets.filter(a => a.type === 'music');
check('assets present (photos, videos, music)', photos.length > 0 && videos.length > 0 && music.length > 0, `${photos.length}/${videos.length}/${music.length}`);
const missingDeriv: string[] = [];
for (const a of assets) { if (a.status !== 'ready') continue; const need = a.type === 'photo' ? [`img/${a.id}.display.webp`, `img/${a.id}.thumb.webp`, `img/${a.id}.blur.webp`] : a.type === 'video' ? [`vid/${a.id}.1080.mp4`, `vid/${a.id}.poster.jpg`, `vid/${a.id}.thumb.webp`] : [`music/${a.id}.m4a`]; for (const f of need) if (!fs.existsSync(path.join(CACHE, f)) || fs.statSync(path.join(CACHE, f)).size === 0) missingDeriv.push(f); }
check('every ready asset has all derivative files on disk (non-empty)', missingDeriv.length === 0, missingDeriv.slice(0, 5).join(','));
const files = db.prepare(`SELECT * FROM files`).all() as Row[]; const stale = files.filter(f => !fs.existsSync(path.join(MEDIA, f.rel_path)));
check('files table maps only to existing media files', stale.length === 0, stale.map(f => f.rel_path).slice(0, 5).join(','));
check('every seen asset is referenced by a files row with the same id', assets.every(a => files.some(f => f.asset_id === a.id)), '');
check('all ready photos analysed (dhash, quality 0..1, luma, colorfulness)', photos.filter(p => p.status === 'ready').every(p => p.dhash && /^[0-9a-f]{16}$/.test(p.dhash) && p.quality >= 0 && p.quality <= 1 && p.luma != null && p.colorfulness != null));
check('dup/burst groups point at existing assets', photos.every(p => !p.dup_group || photos.some(q => q.id === p.dup_group)) && photos.every(p => !p.burst_group || photos.some(q => q.id === p.burst_group)));
const groups = new Map<string, Row[]>(); for (const p of photos) if (p.dup_group) (groups.get(p.dup_group) ?? groups.set(p.dup_group, []).get(p.dup_group)!).push(p);
check('exactly one is_best per duplicate group and it is the group id', [...groups.entries()].every(([g, ms]) => ms.filter(m => m.is_best === 1).length === 1 && ms.find(m => m.is_best === 1)!.id === g), `${groups.size} groups`);
check('year sources valid; years plausible', assets.every(a => ['exif', 'name', 'folder', 'mtime', 'manual'].includes(a.year_source) && (a.year == null || (a.year >= 1900 && a.year <= 2030))));
check('focal points within 0..100', assets.every(a => a.focal_x == null || (a.focal_x >= 0 && a.focal_x <= 100 && a.focal_y >= 0 && a.focal_y <= 100)));
check('videos have duration, dimensions, loudness gain; music has 512 peaks', videos.every(v => v.duration > 0 && v.width > 0 && v.loudness_gain != null) && music.every(m => JSON.parse(m.peaks).length === 512));
// ---------- 3. versions, show.json, backups ----------
const versions = db.prepare(`SELECT id, saved_at, label, slides, seconds, length(json) len, json FROM show_versions ORDER BY id DESC`).all() as Row[];
check('show_versions rows exist and all JSON validates against the Show schema', versions.length > 0 && versions.every(v => Show.safeParse(JSON.parse(v.json)).success), `${versions.length} versions`);
check('unlabelled versions pruned to ≤ 300', versions.filter(v => !v.label).length <= 300);
check('labelled versions kept (auto-create / audit labels present)', versions.some(v => v.label));
const showFile = JSON.parse(fs.readFileSync(SHOW, 'utf8')); check('data/show.json validates and equals the latest version row', Show.safeParse(showFile).success && JSON.stringify(showFile) === JSON.stringify(JSON.parse(versions[0].json)));
check('no leftover show.json.tmp (atomic write completed)', !fs.existsSync(SHOW + '.tmp'));
const backups = fs.readdirSync(BACKUPS).filter(f => f.startsWith('show.')).sort(); check('backups ≤ 200 and newest backup equals show.json', backups.length <= 200 && backups.length > 0 && fs.readFileSync(path.join(BACKUPS, backups[backups.length - 1]), 'utf8') === JSON.stringify(showFile, null, 2));
check('show.json references only existing assets (photo/video/music ids)', (() => { const ids = new Set(assets.map(a => a.id)); const used = showFile.chapters.flatMap((c: any) => [c.musicId, ...c.slides.flatMap((s: any) => [s.assetId, s.heroAssetId, ...(s.assetIds ?? []), ...(s.milestones?.map((m: any) => m.assetId) ?? []), ...(s.people?.map((p: any) => p.assetId) ?? []), ...(s.overlays?.filter((o: any) => o.kind === 'image').map((o: any) => o.assetId) ?? [])])]).filter(Boolean); return used.every((id: string) => ids.has(id)); })());
check('overlays/look/frame/captionStyle survive in the stored JSON', (() => { const s = showFile.chapters.flatMap((c: any) => c.slides).find((x: any) => x.overlays?.length); return !!s && !!s.look && !!s.captionStyle && s.overlays.every((o: any) => typeof o.x === 'number' && o.anim); })());
const kv = db.prepare(`SELECT k FROM kv`).all() as Row[]; check('kv store holds the auto-create options', kv.some(r => r.k === 'autoshow-options'), kv.map(r => r.k).join(','));
db.close();
// ---------- 4. migration idempotence ----------
{ const d2 = new DatabaseSync(DB); const before = (d2.prepare(`PRAGMA table_info(assets)`).all() as Row[]).length; const { openDb } = await import('../server/db.ts'); openDb(); const after = (d2.prepare(`PRAGMA table_info(assets)`).all() as Row[]).length; d2.close(); check('openDb() twice is idempotent (no duplicate columns, no error)', before === after); }
// ---------- 5. live server: persistence, concurrency, restart ----------
const before = await withServer(async () => {
  const s = (await j('/api/show')).body; const c0 = s.chapters[0]; const slide = c0.slides[0];
  // concurrent saves: 8 PUTs in flight, the last one wins and the file stays valid
  const puts = Array.from({ length: 8 }, (_, i) => j('/api/show', { method: 'PUT', body: JSON.stringify({ ...s, meta: { ...s.meta, subtitle: `concurrent-${i}` } }) }));
  const rs = await Promise.all(puts); check('8 concurrent PUT /api/show all succeed', rs.every(r => r.status === 200));
  const after = (await j('/api/show')).body; check('after concurrent saves the show is valid and carries one of the writes', Show.safeParse(after).success && /^concurrent-\d$/.test(after.meta.subtitle), after.meta.subtitle);
  // restore the original subtitle and add a marker overlay to prove persistence across restart
  const marked = { ...s, meta: { ...s.meta, subtitle: s.meta.subtitle } }; marked.chapters[0].slides[0] = { ...slide, notes: 'restart-marker-' + Date.now() };
  await j('/api/show?label=' + encodeURIComponent('audit-db'), { method: 'PUT', body: JSON.stringify(marked) });
  await j('/api/kv/audit-db', { method: 'PUT', body: JSON.stringify({ t: Date.now() }) });
  const labelled = (await j('/api/show/versions')).body[0]; await j(`/api/show/versions/${labelled.id}/label`, { method: 'POST', body: JSON.stringify({ label: 'audit-db-labelled' }) });
  return { notes: marked.chapters[0].slides[0].notes, versionId: labelled.id, maxId: Math.max(...(await j('/api/show/versions')).body.map((v: any) => v.id)) };
});
await withServer(async () => {
  const s = (await j('/api/show')).body; check('show persists across server restart (marker note present)', s.chapters[0].slides[0].notes === before.notes);
  const vs = (await j('/api/show/versions')).body; check('version history persists across restart with the label', vs.some((v: any) => v.id === before.versionId && v.label === 'audit-db-labelled'));
  check('kv persists across restart', (await j('/api/kv/audit-db')).body.value != null);
  const r = await j(`/api/show/versions/${before.versionId}/restore`, { method: 'POST' }); const maxAfter = Math.max(...(await j('/api/show/versions')).body.map((v: any) => v.id)); check('restore from history returns 200 and creates a new version row', r.status === 200 && maxAfter > before.maxId, `${before.maxId} → ${maxAfter}`);
  check('assets count stable across restart (cached ingest, nothing lost)', (await j('/api/health')).body.assets === assets.length);
});
// ---------- 6. corrupt show.json recovery ----------
const original = fs.readFileSync(SHOW, 'utf8'); fs.writeFileSync(SHOW, '{ this is not json', 'utf8');
await withServer(async () => {
  const s = (await j('/api/show')).body; check('corrupt show.json → server serves a valid default show instead of crashing', Show.safeParse(s).success && s.chapters.length >= 1);
  check('corrupt file moved aside as show.json.invalid-*', fs.readdirSync(path.dirname(SHOW)).some(f => f.startsWith('show.json.invalid-')));
});
fs.writeFileSync(SHOW, original, 'utf8'); for (const f of fs.readdirSync(path.dirname(SHOW))) if (f.startsWith('show.json.invalid-')) fs.unlinkSync(path.join(path.dirname(SHOW), f));
await withServer(async () => { const s = (await j('/api/show')).body; check('original show restored after the recovery test', JSON.stringify(s) === JSON.stringify(JSON.parse(original))); });

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n${results.length - fails}/${results.length} storage checks passed`);
process.exit(fails ? 1 : 0);
