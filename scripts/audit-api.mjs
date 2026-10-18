// Exercises every HTTP route of the server, including error paths. Usage: node scripts/audit-api.mjs
const base = 'http://127.0.0.1:4000'; const results = []; let fails = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) fails++; };
const j = async (path, init) => { const r = await fetch(base + path, { headers: { 'Content-Type': 'application/json' }, ...init }); let body = null; const t = await r.text(); try { body = JSON.parse(t); } catch { body = t; } return { status: r.status, body, headers: r.headers }; };

// health
const h = await j('/api/health'); check('GET /api/health 200 + shape', h.status === 200 && h.body.ok === true && typeof h.body.assets === 'number' && 'ingest' in h.body, JSON.stringify(h.body));
// assets
const a = await j('/api/assets'); check('GET /api/assets 200 array', a.status === 200 && Array.isArray(a.body) && a.body.length > 0, `${a.body.length} assets`);
const photo = a.body.find(x => x.type === 'photo'), video = a.body.find(x => x.type === 'video'), music = a.body.find(x => x.type === 'music');
check('asset model: photo has analysis fields', photo && photo.dhash && typeof photo.quality === 'number' && photo.dupGroup && 'isBest' in photo && photo.width && photo.year, JSON.stringify(Object.keys(photo ?? {})));
check('asset model: video has duration/poster fields', video && video.duration > 0 && typeof video.portrait === 'boolean' && typeof video.loudnessGain === 'number', JSON.stringify(video));
check('asset model: music has peaks', music && Array.isArray(music.peaks) && music.peaks.length === 512 && music.duration > 0, `peaks ${music?.peaks?.length}`);
// patch asset: year + focal, then verify, then restore
const before = photo.year; const p1 = await j(`/api/assets/${photo.id}`, { method: 'PATCH', body: JSON.stringify({ year: 1999, focal: [12, 34] }) });
check('PATCH /api/assets/:id updates year(manual) + focal', p1.status === 200 && p1.body.year === 1999 && p1.body.yearSource === 'manual' && p1.body.focal[0] === 12, JSON.stringify({ y: p1.body.year, src: p1.body.yearSource, f: p1.body.focal }));
const p404 = await j('/api/assets/nope', { method: 'PATCH', body: JSON.stringify({ year: 2000 }) }); check('PATCH unknown asset → 404', p404.status === 404);
await j(`/api/assets/${photo.id}`, { method: 'PATCH', body: JSON.stringify({ year: before }) });
// derivatives + range
for (const [name, path] of [['display webp', `/media/img/${photo.id}.display.webp`], ['thumb webp', `/media/img/${photo.id}.thumb.webp`], ['blur webp', `/media/img/${photo.id}.blur.webp`], ['video mp4', `/media/vid/${video.id}.1080.mp4`], ['poster jpg', `/media/vid/${video.id}.poster.jpg`], ['poster thumb', `/media/vid/${video.id}.thumb.webp`], ['music m4a', `/media/music/${music.id}.m4a`]]) { const r = await fetch(base + path); check(`GET ${name} 200 + cache headers`, r.status === 200 && /max-age/.test(r.headers.get('cache-control') || ''), `${r.status} ${r.headers.get('content-type')} ${r.headers.get('cache-control')}`); }
const rr = await fetch(base + `/media/vid/${video.id}.1080.mp4`, { headers: { Range: 'bytes=100-199' } }); check('video Range request → 206 with Content-Range', rr.status === 206 && /bytes 100-199/.test(rr.headers.get('content-range') || ''), `${rr.status} ${rr.headers.get('content-range')}`);
const m404 = await fetch(base + '/media/img/none.webp'); check('missing derivative → 404', m404.status === 404);
// show
const s = await j('/api/show'); check('GET /api/show 200 + schema', s.status === 200 && s.body.version === 1 && Array.isArray(s.body.chapters) && s.body.settings && s.body.meta?.language === 'he', `${s.body.chapters?.length} chapters`);
const bad = await j('/api/show', { method: 'PUT', body: JSON.stringify({ version: 2, chapters: 'x' }) }); check('PUT invalid show → 400 with detail', bad.status === 400 && bad.body.error === 'invalid show' && bad.body.detail, String(bad.body.detail).slice(0, 80));
const bad2 = await j('/api/show', { method: 'PUT', body: JSON.stringify({ ...s.body, chapters: [{ id: 'c', title: 't', slides: [{ id: 'x', type: 'photo' }] }] }) }); check('PUT show with slide missing required field → 400', bad2.status === 400);
const vBefore = Math.max(...(await j('/api/show/versions')).body.map(v => v.id)); // the route returns at most 100 rows, so compare ids, not counts
const okPut = await j('/api/show?label=' + encodeURIComponent('audit'), { method: 'PUT', body: JSON.stringify(s.body) }); check('PUT valid show → 200 echo', okPut.status === 200 && okPut.body.chapters.length === s.body.chapters.length);
const vs = await j('/api/show/versions'); check('GET versions lists the labelled save', vs.status === 200 && vs.body[0].id > vBefore && vs.body[0].label === 'audit' && typeof vs.body[0].seconds === 'number', JSON.stringify(vs.body[0]));
const v1 = await j(`/api/show/versions/${vs.body[0].id}`); check('GET versions/:id returns the show json', v1.status === 200 && v1.body.version === 1);
check('GET versions/999999 → 404', (await j('/api/show/versions/999999')).status === 404);
const lab = await j(`/api/show/versions/${vs.body[0].id}/label`, { method: 'POST', body: JSON.stringify({ label: 'audit-2' }) }); check('POST versions/:id/label', lab.status === 200 && (await j('/api/show/versions')).body[0].label === 'audit-2');
const rs = await j(`/api/show/versions/${vs.body[0].id}/restore`, { method: 'POST' }); { const top = (await j('/api/show/versions')).body[0]; check('POST versions/:id/restore → 200 + new version row', rs.status === 200 && top.id > vs.body[0].id && /שוחזר/.test(top.label || ''), JSON.stringify({ id: top.id, label: top.label })); }
check('POST restore unknown → 404', (await j('/api/show/versions/999999/restore', { method: 'POST' })).status === 404);
// kv
const kv1 = await j('/api/kv/audit-key', { method: 'PUT', body: JSON.stringify({ a: 1, he: 'עברית' }) }); const kv2 = await j('/api/kv/audit-key'); check('PUT/GET /api/kv/:key round trip (unicode)', kv1.status === 200 && kv2.body.value && JSON.parse(kv2.body.value).he === 'עברית');
check('GET /api/kv/missing → value null', (await j('/api/kv/definitely-missing')).body.value === null);
// ingest / analyze / groups / events
const st = await j('/api/ingest/status'); check('GET /api/ingest/status shape', st.status === 200 && 'running' in st.body && 'phase' in st.body && Array.isArray(st.body.warnings) && Array.isArray(st.body.log));
const g = await j('/api/groups'); check('GET /api/groups: dup groups with >1 members', g.status === 200 && Array.isArray(g.body) && g.body.every(x => x.members.length > 1 && x.members.includes(x.best)), `${g.body.length} groups`);
const an = await j('/api/analyze', { method: 'POST' }); check('POST /api/analyze → counts (incremental: 0 analysed)', an.status === 200 && an.body.analysed === 0 && typeof an.body.dupGroups === 'number' && typeof an.body.faces === 'boolean', JSON.stringify(an.body));
const ing = await j('/api/ingest', { method: 'POST' }); check('POST /api/ingest starts and returns progress', ing.status === 200 && 'phase' in ing.body);
// SSE: connect, read first event, close
const sse = await new Promise(async (resolve) => { const ctrl = new AbortController(); const t = setTimeout(() => { ctrl.abort(); resolve('timeout'); }, 4000); try { const r = await fetch(base + '/api/ingest/events', { signal: ctrl.signal }); const reader = r.body.getReader(); const { value } = await reader.read(); clearTimeout(t); ctrl.abort(); resolve(r.headers.get('content-type') + ' | ' + new TextDecoder().decode(value).slice(0, 60)); } catch (e) { resolve('error ' + e.message); } });
check('GET /api/ingest/events is text/event-stream with a first progress event', /text\/event-stream/.test(sse) && /event: progress/.test(sse), sse);
await new Promise(r => setTimeout(r, 1500)); // let the ingest re-run finish
const conflict = await (async () => { const st2 = await j('/api/ingest/status'); return st2.body.running ? await j('/api/analyze', { method: 'POST' }) : { status: 'skipped' }; })(); check('POST /api/analyze while ingest runs → 409 (or skipped if ingest already finished)', conflict.status === 409 || conflict.status === 'skipped', String(conflict.status));
// static + SPA fallback
for (const path of ['/', '/edit', '/show', '/presenter', '/show?from=abc', '/some/deep/route']) { const r = await fetch(base + path); const t = await r.text(); check(`GET ${path} → 200 index.html`, r.status === 200 && /<div id="root">/.test(t) && /<html lang="he" dir="rtl">/.test(t), `${r.status}`); }
check('GET /api/unknown → 404 json', (await j('/api/unknown')).status === 404);
const idx = await fetch(base + '/'); const html = await idx.text(); const js = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1]; const css = /href="(\/assets\/[^"]+\.css)"/.exec(html)?.[1];
check('built assets referenced by index are served', js && css && (await fetch(base + js)).status === 200 && (await fetch(base + css)).status === 200, `${js} ${css}`);
const font = /url\((\/assets\/[^)]+\.woff2)\)/.exec(await (await fetch(base + css)).text())?.[1]; check('self-hosted font file served', font && (await fetch(base + font)).status === 200, font);
// backups on disk
import fs from 'node:fs'; const backups = fs.readdirSync('data/backups').filter(f => f.startsWith('show.')); check('data/backups has rolling JSON backups (≤ 200)', backups.length > 0 && backups.length <= 200, `${backups.length}`);
check('data/show.json parses and matches API', JSON.parse(fs.readFileSync('data/show.json', 'utf8')).chapters.length === (await j('/api/show')).body.chapters.length);

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
