// Upload audit on a throwaway copy: starts its own production server with SY80_HOME = a temp folder on port 4100, so the real media/,
// data/ and show are never touched. Covers the upload route (types, sub-folders, path safety, repeats, name clashes, a large streamed file,
// no half-written files left), open-folder validation, the queued rescan, and the editor: the empty state's buttons, the "הוסף" menu,
// the file and folder pickers, a drop on the preview (not only the library) that must not navigate away, a real folder drag from the OS
// (CDP drag with a directory), the progress card under a throttled upload, and folder names dating the photos. Needs `npm run build`.
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const PORT = 4100, base = `http://127.0.0.1:${PORT}`; const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let fails = 0; const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) fails++; };
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'sy80-upload-')), SRC = path.join(HOME, 'src'), MEDIA = path.join(HOME, 'media');
const at = (...p) => fs.existsSync(path.join(MEDIA, ...p));

// ---------- source files, outside media/ ----------
// every test photo different in content and structure, so none merge as one asset or hide as a near-duplicate
const jpg = (r, g, b) => { const blocks = Array.from({ length: 9 }, (_, i) => { const v = (r * 7 + g * 13 + b * 29 + i * 71) % 256; return `<rect x="${(i % 3) * 213}" y="${Math.floor(i / 3) * 160}" width="213" height="160" fill="rgb(${v},${(v * 3) % 256},${(v * 5) % 256})"/>`; }).join('');
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">${blocks}<circle cx="${(r * 2) % 640}" cy="${(g * 2) % 480}" r="${60 + (b % 90)}" fill="rgb(${b},${r},${g})"/></svg>`)).jpeg().toBuffer(); };
const wav = () => { const n = 4000, b = Buffer.alloc(44 + n); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44); return b; };
const put = async (rel, data) => { const f = path.join(SRC, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const loose = [await put('loose/p1.jpg', await jpg(200, 60, 60)), await put('loose/p2.jpg', await jpg(60, 200, 60)), await put('loose/notes.txt', 'x'), await put('loose/Thumbs.db', 'x'), await put('loose/._p3.jpg', 'x')];
await put('tree/1966 חתונה/w1.jpg', await jpg(60, 60, 200)); await put('tree/1966 חתונה/ים/w2.jpg', await jpg(200, 200, 60)); await put('tree/1966 חתונה/desktop.ini', 'x');
await put('drag/שנות ה-70/d1.jpg', await jpg(120, 30, 160)); await put('drag/שנות ה-70/d2.jpg', await jpg(30, 160, 120)); await put('drag/שנות ה-70/song.wav', wav());
const noise = Buffer.alloc(3000 * 2000 * 3); for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 256; // incompressible, so the JPEG is several MB
const big = await put('big/big.jpg', await sharp(noise, { raw: { width: 3000, height: 2000, channels: 3 } }).jpeg({ quality: 97 }).toBuffer());

// ---------- server ----------
const server = spawn(process.execPath, ['--import', 'tsx', '--no-warnings=ExperimentalWarning', 'server/index.ts'], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), SY80_HOME: HOME }, stdio: 'ignore', windowsHide: true });
let up = false; for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(base + '/api/health')).ok; } catch { await sleep(500); } }
const health = up ? await (await fetch(base + '/api/health')).json() : {};
check('server: starts on a throwaway SY80_HOME', up && path.resolve(health.mediaDir) === path.resolve(MEDIA), health.mediaDir);
const idle = async () => { for (let i = 0; i < 240; i++) { const s = await (await fetch(base + '/api/ingest/status')).json(); if (!s.running) return s; await sleep(500); } return null; };
await idle();
const kv = (k, v) => fetch(`${base}/api/kv/${k}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
await kv('guide-seen', true);

const browser = await puppeteer.launch({ executablePath: exe, headless: true });
const issues = [];
const p = await browser.newPage(); await p.setViewport({ width: 1600, height: 900 });
p.on('pageerror', e => issues.push(e.message)); p.on('console', m => { if (m.type() === 'error') issues.push('console: ' + m.text()); });
await p.goto(base + '/edit', { waitUntil: 'networkidle0' }); await sleep(600);

// ---------- empty state and menu ----------
const emptyBtns = await p.$$eval('.lib-empty-state .add-ways .btn', bs => bs.map(b => b.textContent.trim()));
check('empty library: "choose files" and "choose a folder" buttons', emptyBtns.some(t => t.includes('בחרו קבצים')) && emptyBtns.some(t => t.includes('תיקייה')), emptyBtns.join(' | '));
check('empty library: the Explorer route and scan sit in a collapsed section', await p.$eval('.lib-empty-state .manual-way', d => !d.open && d.querySelectorAll('.btn').length === 2));
await p.click('.lib-add > .btn'); await sleep(150);
const items = await p.$$eval('.lib-add .menu [role=menuitem]', bs => bs.map(b => b.textContent.trim()));
check('"הוסף" menu: files, whole folder, open in Explorer', items.length === 3, items.join(' | '));
await p.keyboard.press('Escape'); await sleep(100);
check('"הוסף" menu: Escape closes it', !(await p.$('.lib-add .menu')));

// ---------- the route ----------
const up1 = (name, data, sub = '', folder = 'auto') => fetch(`${base}/api/upload?folder=${folder}&name=${encodeURIComponent(name)}&sub=${encodeURIComponent(sub)}&size=${data.length}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: data }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
const a1 = await jpg(10, 10, 10), a2 = await jpg(240, 240, 240);
let r = await up1('a.jpg', a1); check('route: a photo goes to media/photos', r.status === 200 && r.body.relPath === 'photos/a.jpg' && !r.body.skipped, JSON.stringify(r.body));
r = await up1('a.jpg', a1); check('route: the same file again is skipped, not duplicated', r.body?.skipped === true && !at('photos', 'a (2).jpg'));
r = await up1('a.jpg', a2); check('route: a different file with the same name gets " (2)"', r.body?.relPath === 'photos/a (2).jpg');
const same = Buffer.from(a1); same[same.length - 3] ^= 1; // same name and size, one byte different
r = await up1('a.jpg', same); check('route: same name and size but different bytes is still kept (" (3)")', r.body?.relPath === 'photos/a (3).jpg' && !r.body.skipped, JSON.stringify(r.body));
r = await up1('a.jpg', a2); check('route: a repeat of the " (2)" file is recognised, not stored as " (4)"', r.body?.skipped === true && r.body.relPath === 'photos/a (2).jpg');
r = await up1('x.jpg', await jpg(33, 140, 77), '1980 טיול/בוקר'); check('route: sub-folders are kept under photos', r.body?.relPath === 'photos/1980 טיול/בוקר/x.jpg' && at('photos', '1980 טיול', 'בוקר', 'x.jpg'));
r = await up1('e.jpg', await jpg(150, 20, 220), '../../../evil'); check('route: ".." in the folder cannot leave media/photos', r.status === 200 && r.body.relPath === 'photos/evil/e.jpg' && !fs.existsSync(path.join(HOME, 'evil')), JSON.stringify(r.body));
r = await up1('../../hack.jpg', await jpg(5, 99, 180)); check('route: ".." in the name is reduced to the file name', r.body?.relPath === 'photos/hack.jpg');
r = await up1('נועה.mp4', Buffer.from('not really a video'), 'x/y'); check('route: videos go flat to videos/greetings (folder ignored)', r.body?.relPath === 'videos/greetings/נועה.mp4');
r = await up1('notes.txt', Buffer.from('x')); check('route: unsupported type → 415', r.status === 415);
r = await up1('', Buffer.from('x')); check('route: empty name → 400', r.status === 400);
const huge = Buffer.alloc(80 * 1024 * 1024, 7); r = await up1('huge.mov', huge);
check('route: an 80 MB file is streamed to disk intact', r.status === 200 && fs.statSync(path.join(MEDIA, 'videos', 'greetings', 'huge.mov')).size === huge.length);
fs.rmSync(path.join(MEDIA, 'videos', 'greetings', 'huge.mov')); fs.rmSync(path.join(MEDIA, 'videos', 'greetings', 'נועה.mp4')); // not real videos: keep them out of the scan
const parts = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.part')) parts.push(f); } }; walk(MEDIA);
check('route: no half-written .part files left behind', parts.length === 0, parts.join(','));
r = await fetch(base + '/api/open-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: '../..' }) });
check('open-folder: anything but the three media folders → 400', r.status === 400);

// ---------- file picker ----------
const toasts = []; await p.exposeFunction('__toast', t => toasts.push(t));
await p.evaluate(() => new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('toast')) window.__toast(n.textContent); }).observe(document.body, { childList: true, subtree: true }));
const viaChooser = async (item, paths) => { await p.click('.lib-add > .btn'); await sleep(100); const [ch] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), p.evaluate(i => document.querySelectorAll('.lib-add .menu [role=menuitem]')[i].click(), item)]); await ch.accept(paths); };
await viaChooser(0, loose);
for (let i = 0; i < 40 && !(at('photos', 'p1.jpg') && at('photos', 'p2.jpg') && toasts.some(t => t.includes('הועתקו'))); i++) await sleep(150);
check('file picker: the photos are copied into media/photos', at('photos', 'p1.jpg') && at('photos', 'p2.jpg'));
check('file picker: .txt, Thumbs.db and "._" files are skipped and counted', !at('photos', '._p3.jpg') && toasts.some(t => t.includes('2 קבצים הועתקו') && t.includes('3 קבצים שאינם מדיה דולגו')), toasts.join(' / '));
check('file picker: the scan dialog opens', !!(await p.$('dialog[open]')));
await p.keyboard.press('Escape'); await sleep(200);

// ---------- folder picker ----------
await viaChooser(1, [path.join(SRC, 'tree', '1966 חתונה')]);
for (let i = 0; i < 40 && !at('photos', '1966 חתונה', 'ים', 'w2.jpg'); i++) await sleep(150);
check('folder picker: the folder and its sub-folders are kept', at('photos', '1966 חתונה', 'w1.jpg') && at('photos', '1966 חתונה', 'ים', 'w2.jpg'));
check('folder picker: desktop.ini is not copied', !at('photos', '1966 חתונה', 'desktop.ini'));
await p.keyboard.press('Escape'); await sleep(200);

// ---------- drop on the preview (synthetic) ----------
const dropped = (await jpg(90, 90, 20)).toString('base64');
const overlayShown = await p.evaluate(async (b64) => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bin], 'dropped.jpg', { type: 'image/jpeg' }));
  const t = document.querySelector('.panel.preview'); const ev = (type) => t.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
  ev('dragenter'); ev('dragover'); await new Promise(r => setTimeout(r, 80)); const shown = !!document.querySelector('.drop-overlay');
  const prevented = !t.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); return { shown, prevented };
}, dropped);
for (let i = 0; i < 40 && !at('photos', 'dropped.jpg'); i++) await sleep(150);
check('drop anywhere: the overlay appears over the editor', overlayShown.shown);
check('drop anywhere: a photo dropped on the preview is copied, the page stays on /edit', overlayShown.prevented && at('photos', 'dropped.jpg') && p.url().endsWith('/edit'));
check('drop anywhere: the overlay goes away after the drop', !(await p.$('.drop-overlay')));
await p.keyboard.press('Escape'); await sleep(200);

// ---------- a real folder drag from the OS (CDP) ----------
const cdp = await p.createCDPSession(); const box = await (await p.$('.panel.preview')).boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2;
const data = { items: [], files: [path.join(SRC, 'drag', 'שנות ה-70')], dragOperationsMask: 1 };
for (const type of ['dragEnter', 'dragOver', 'drop']) { await cdp.send('Input.dispatchDragEvent', { type, x, y, data }); await sleep(60); }
for (let i = 0; i < 60 && !(at('photos', 'שנות ה-70', 'd2.jpg') && at('music', 'song.wav')); i++) await sleep(150);
check('folder drag: photos keep the dropped folder\'s name', at('photos', 'שנות ה-70', 'd1.jpg') && at('photos', 'שנות ה-70', 'd2.jpg'));
check('folder drag: music inside the folder goes to media/music', at('music', 'song.wav'));
await p.keyboard.press('Escape'); await sleep(200);

// ---------- progress card on a slow upload ----------
await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: 1.5 * 1024 * 1024 });
await viaChooser(0, [big]); let card = null;
for (let i = 0; i < 40 && !card; i++) { await sleep(100); card = await p.evaluate(() => { const c = document.querySelector('.upload-card'); if (!c) return null; const w = parseFloat(c.querySelector('.uc-bar i').style.width); return { w, text: c.textContent }; }); }
await sleep(1200); const card2 = await p.evaluate(() => { const c = document.querySelector('.upload-card .uc-bar i'); return c ? parseFloat(c.style.width) : null; });
check('progress card: shows while copying, with file count and size', !!card && /1 \/ 1|0 \/ 1/.test(card.text) && /MB/.test(card.text), card?.text);
check('progress card: the bar advances', card2 != null && card != null && card2 > card.w, `${card?.w}% → ${card2}%`);
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
for (let i = 0; i < 100 && (await p.$('.upload-card')); i++) await sleep(150);
check('progress card: gone when the copy is done', !(await p.$('.upload-card')) && at('photos', 'big.jpg') && fs.statSync(path.join(MEDIA, 'photos', 'big.jpg')).size === fs.statSync(big).size);

// ---------- the scan picks everything up ----------
await sleep(500); await idle(); await sleep(300); await idle();
const assets = await (await fetch(base + '/api/assets')).json(); const byName = n => assets.find(a => a.name === n);
const expected = ['p1.jpg', 'p2.jpg', 'w1.jpg', 'w2.jpg', 'dropped.jpg', 'd1.jpg', 'd2.jpg', 'big.jpg', 'song.wav', 'a.jpg', 'x.jpg'];
const missing = expected.filter(n => !byName(n));
check('scan: every uploaded file is in the library (queued rescans included)', missing.length === 0, missing.join(',') || `${assets.length} assets`);
check('scan: "1966 חתונה" dates its photos 1966, from the folder name', byName('w1.jpg')?.year === 1966 && byName('w2.jpg')?.year === 1966 && byName('w1.jpg')?.yearSource === 'folder');
check('scan: "שנות ה-70" dates its photos to the seventies', byName('d1.jpg')?.year >= 1970 && byName('d1.jpg')?.year <= 1979);
await p.keyboard.press('Escape'); await p.reload({ waitUntil: 'networkidle0' }); await sleep(800);
check('editor: the library shows the new media', (await p.$$('.lib .asset')).length >= 9);
check('no page errors or console errors', issues.length === 0, issues.slice(0, 3).join(' / '));

await browser.close();
try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { server.kill(); }
await sleep(800); try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* the OS may still hold a file; it is in the temp folder */ }
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail && !x.ok ? `  [${x.detail}]` : ''}`);
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
