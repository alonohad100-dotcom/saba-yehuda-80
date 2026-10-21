import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { mediaFolderFor, MEDIA_FOLDERS, type MediaFolder } from '../shared/media.ts';
import { ensureDirs, CACHE_DIR, DIST_DIR, MEDIA_DIR } from './paths.ts';
import { openDb, listAssets, patchAsset, listShowVersions, getShowVersion, labelShowVersion, kvGet, kvSet } from './db.ts';
import { loadShow, saveShow } from './show-store.ts';
import { runIngest, runAnalysis, progress, events } from './ingest/index.ts';
import { facesAvailable } from './ingest/faces.ts';

ensureDirs(); openDb();
const PORT = Number(process.env.PORT || 4000);
const PROD = process.env.NODE_ENV === 'production';
const app = Fastify({ logger: { level: 'warn' }, bodyLimit: 50 * 1024 * 1024 });
// Accept an empty body on JSON requests (POST /api/ingest, /api/analyze, restore) instead of Fastify's default 400.
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => { const s = body as string; if (!s) return done(null, undefined); try { done(null, JSON.parse(s)); } catch (e) { done(e as Error, undefined); } });

app.register(fastifyStatic, { root: CACHE_DIR, prefix: '/media/', decorateReply: false, cacheControl: true, maxAge: '7d', immutable: true, acceptRanges: true });

app.get('/api/health', async () => ({ ok: true, prod: PROD, mediaDir: MEDIA_DIR, assets: listAssets().length, ingest: { running: progress.running, phase: progress.phase }, faces: facesAvailable, version: process.env.npm_package_version ?? null }));

app.get('/api/assets', async () => listAssets());
app.patch<{ Params: { id: string }; Body: { year?: number; focal?: [number, number] } }>('/api/assets/:id', async (req, reply) => {
  const a = patchAsset(req.params.id, req.body ?? {}); if (!a) return reply.code(404).send({ error: 'not found' }); return a;
});

app.get('/api/show', async () => loadShow());
app.put<{ Body: unknown; Querystring: { label?: string } }>('/api/show', async (req, reply) => {
  try { return saveShow(req.body, req.query.label); }
  catch (e) { return reply.code(400).send({ error: 'invalid show', detail: (e as Error).message }); }
});
app.get('/api/show/versions', async () => listShowVersions());
app.get<{ Params: { id: string } }>('/api/show/versions/:id', async (req, reply) => { const j = getShowVersion(+req.params.id); if (!j) return reply.code(404).send({ error: 'not found' }); return JSON.parse(j); });
app.post<{ Params: { id: string } }>('/api/show/versions/:id/restore', async (req, reply) => { const j = getShowVersion(+req.params.id); if (!j) return reply.code(404).send({ error: 'not found' }); return saveShow(JSON.parse(j), `שוחזר מגרסה ${req.params.id}`); });
app.post<{ Params: { id: string }; Body: { label: string } }>('/api/show/versions/:id/label', async (req) => { labelShowVersion(+req.params.id, req.body.label); return { ok: true }; });

app.post('/api/ingest', async () => { void runIngest(); return progress; });
app.post('/api/analyze', async (_req, reply) => { if (progress.running) return reply.code(409).send({ error: 'ingest running' }); progress.running = true; try { return await runAnalysis(); } finally { progress.running = false; events.emit('event', { type: 'done', data: progress }); } });
app.get('/api/groups', async () => {
  const groups: Record<string, { best: string; members: string[] }> = {};
  for (const a of listAssets()) { if (a.type !== 'photo' || !a.dupGroup) continue; (groups[a.dupGroup] ??= { best: a.dupGroup, members: [] }).members.push(a.id); }
  return Object.values(groups).filter(g => g.members.length > 1);
});
// Files dropped on the library: raw body → media/<folder>/<name>; the client runs a scan afterwards.
// Uploads are streamed to disk rather than buffered: one WhatsApp video can be several GB.
app.addContentTypeParser('application/octet-stream', (_req, payload, done) => done(null, payload));
/** One path segment, safe on Windows: no separators, reserved characters, or leading/trailing dots and spaces (so no ".."). */
const cleanSegment = (s: string) => s.replace(/[\x00-\x1f\\/:*?"<>|]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '');
app.put<{ Querystring: { folder?: string; name?: string; sub?: string }; Body: Readable }>('/api/upload', async (req, reply) => {
  const name = cleanSegment(path.basename(String(req.query.name ?? '')));
  if (!name) return reply.code(400).send({ error: 'bad name', detail: 'שם קובץ לא תקין' });
  const kind = mediaFolderFor(name); const ext = path.extname(name);
  const folder = String(req.query.folder ?? 'auto') === 'auto' ? kind : String(req.query.folder);
  if (!kind || !MEDIA_FOLDERS.includes(folder as MediaFolder)) return reply.code(415).send({ error: 'unsupported', detail: `סוג קובץ לא נתמך: ${ext || name}` });
  // Photos keep the folders they came in (a folder name like "1966 חתונה" dates the photos); greetings and music stay flat.
  const sub = folder === 'photos' ? String(req.query.sub ?? '').split(/[\\/]+/).map(cleanSegment).filter(Boolean).slice(0, 8) : [];
  const base = path.join(MEDIA_DIR, folder!), dir = path.join(base, ...sub);
  if (dir !== base && !dir.startsWith(base + path.sep)) return reply.code(400).send({ error: 'bad folder', detail: 'תיקייה לא תקינה' });
  fs.mkdirSync(dir, { recursive: true });
  const relOf = (p: string) => path.relative(MEDIA_DIR, p).split(path.sep).join('/');
  const part = path.join(dir, `.upload-${crypto.randomUUID()}.part`); // the scan skips dot-files, so a half-written file is never ingested
  const h = crypto.createHash('sha1');
  try { await pipeline(req.body, async function* (src) { for await (const c of src) { h.update(c); yield c; } }, fs.createWriteStream(part)); } catch (e) { fs.rmSync(part, { force: true }); throw e; }
  const digest = h.digest('hex'), size = fs.statSync(part).size;
  const sameAs = async (f: string) => { if (fs.statSync(f).size !== size) return false; const fh = crypto.createHash('sha1'); for await (const c of fs.createReadStream(f)) fh.update(c); return fh.digest('hex') === digest; };
  // The same file uploaded twice is kept once (also as "x (2).jpg" from an earlier clash); a different file with the same name gets " (2)".
  let target = path.join(dir, name);
  for (let i = 2; fs.existsSync(target) && i < 1000; i++) {
    if (await sameAs(target)) { fs.rmSync(part, { force: true }); return { ok: true, relPath: relOf(target), skipped: true }; }
    target = path.join(dir, `${path.basename(name, ext)} (${i})${ext}`);
  }
  fs.renameSync(part, target);
  return { ok: true, relPath: relOf(target), skipped: false };
});
// "Open in Explorer" from the library: the app is local, so it can show where the files go.
app.post<{ Body: { folder?: string } | undefined }>('/api/open-folder', async (req, reply) => {
  const folder = String(req.body?.folder ?? '');
  if (folder && !MEDIA_FOLDERS.includes(folder as MediaFolder)) return reply.code(400).send({ error: 'bad folder', detail: 'תיקייה לא תקינה' });
  const dir = path.join(MEDIA_DIR, folder); fs.mkdirSync(dir, { recursive: true });
  spawn(process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true, dir };
});
app.get<{ Params: { key: string } }>('/api/kv/:key', async (req) => ({ key: req.params.key, value: kvGet(req.params.key) ?? null }));
app.put<{ Params: { key: string }; Body: unknown }>('/api/kv/:key', async (req) => { kvSet(req.params.key, JSON.stringify(req.body)); return { ok: true }; });
app.get('/api/ingest/status', async () => progress);
app.get('/api/ingest/events', (req, reply) => {
  reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (ev: { type: string; data: unknown }) => reply.raw.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
  send({ type: 'progress', data: progress });
  events.on('event', send);
  const ping = setInterval(() => reply.raw.write(': ping\n\n'), 15000);
  req.raw.on('close', () => { events.off('event', send); clearInterval(ping); });
});

if (PROD && fs.existsSync(DIST_DIR)) {
  app.register(fastifyStatic, { root: DIST_DIR, prefix: '/', decorateReply: true, cacheControl: true, maxAge: '1h' });
  app.setNotFoundHandler((req, reply) => { if (req.url.startsWith('/api/') || req.url.startsWith('/media/')) return reply.code(404).send({ error: 'not found' }); return reply.type('text/html').send(fs.readFileSync(path.join(DIST_DIR, 'index.html'))); });
}

app.listen({ port: PORT, host: '127.0.0.1' }).then(async () => {
  console.log(`[server] http://127.0.0.1:${PORT}  (${PROD ? 'production' : 'dev'}) · media: ${MEDIA_DIR}`);
  void runIngest().then(p => console.log(`[ingest] ${p.phase}: ${p.photos} photos, ${p.videos} videos, ${p.music} music, ${p.warnings.length} warnings`));
  if (process.argv.includes('--open')) openKiosk(`http://127.0.0.1:${PORT}/show`);
});

function openKiosk(url: string) {
  const candidates = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
  const exe = candidates.find(c => fs.existsSync(c));
  if (exe) spawn(exe, ['--kiosk', '--autoplay-policy=no-user-gesture-required', '--disable-infobars', '--noerrdialogs', `--user-data-dir=${path.join(CACHE_DIR, 'chrome-profile')}`, url], { detached: true, stdio: 'ignore' }).unref();
  else spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
}
