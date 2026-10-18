import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
const UP_IMG = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff', '.bmp', '.gif']), UP_VID = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.3gp']), UP_MUS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus']);
app.put<{ Querystring: { folder?: string; name?: string }; Body: Buffer }>('/api/upload', { bodyLimit: 4 * 1024 * 1024 * 1024 }, async (req, reply) => {
  const name = path.basename(String(req.query.name ?? '')).replace(/[\\/:*?"<>|]/g, '_'); const ext = path.extname(name).toLowerCase();
  if (!name || name.startsWith('.')) return reply.code(400).send({ error: 'bad name', detail: 'שם קובץ לא תקין' });
  let folder = String(req.query.folder ?? 'auto');
  if (folder === 'auto') folder = UP_IMG.has(ext) ? 'photos' : UP_VID.has(ext) ? 'videos/greetings' : UP_MUS.has(ext) ? 'music' : '';
  if (!['photos', 'videos/greetings', 'music'].includes(folder) || !(UP_IMG.has(ext) || UP_VID.has(ext) || UP_MUS.has(ext))) return reply.code(415).send({ error: 'unsupported', detail: `סוג קובץ לא נתמך: ${ext || name}` });
  const dir = path.join(MEDIA_DIR, folder); fs.mkdirSync(dir, { recursive: true });
  let target = path.join(dir, name); for (let i = 2; fs.existsSync(target) && i < 1000; i++) target = path.join(dir, `${path.basename(name, ext)} (${i})${ext}`);
  fs.writeFileSync(target, req.body ?? Buffer.alloc(0));
  return { ok: true, relPath: path.relative(MEDIA_DIR, target).replace(/\\/g, '/') };
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
