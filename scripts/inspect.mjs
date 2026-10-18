// Headless inspection: screenshots + console errors for /edit, /show, /presenter. Usage: node scripts/inspect.mjs <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'inspect-out'; fs.mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const base = 'http://127.0.0.1:4000';
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1600,900', '--lang=he-IL', '--mute-audio'] });
const errors = [];
async function page(url, w = 1600, h = 900) {
  const p = await browser.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) errors.push(`[${url}] console.${m.type()}: ${m.text()}`); });
  p.on('pageerror', e => errors.push(`[${url}] pageerror: ${e.message}`));
  p.on('requestfailed', r => errors.push(`[${url}] request failed: ${r.url()} ${r.failure()?.errorText}`));
  p.on('response', r => { if (r.status() >= 400) errors.push(`[${url}] HTTP ${r.status()} ${r.url()}`); });
  await p.goto(base + url, { waitUntil: 'networkidle0', timeout: 30000 }); return p;
}
const shot = (p, name) => p.screenshot({ path: path.join(out, name + '.png') });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- editor ----
const ed = await page('/edit');
await sleep(1200); await shot(ed, '01-editor');
const info = await ed.evaluate(() => ({ title: document.title, slides: document.querySelectorAll('.slide').length, assets: document.querySelectorAll('.asset').length, chapters: document.querySelectorAll('.ch-head').length, checks: [...document.querySelectorAll('.check')].map(c => c.textContent) }));
console.log('editor:', JSON.stringify(info));
// select first library asset, add to chapter, then open inspector for it
await ed.click('.asset'); await sleep(200); await ed.click('.lib-foot .btn.primary'); await sleep(600);
const after = await ed.evaluate(() => ({ slides: document.querySelectorAll('.slide').length, selected: document.querySelectorAll('.slide.sel').length, insp: document.querySelector('.insp-title')?.textContent }));
console.log('after add:', JSON.stringify(after));
await shot(ed, '02-editor-selected');
// type a caption and check autosave + preview update
await ed.click('.insp textarea'); await ed.keyboard.type('תמונה ראשונה לבדיקה');
await sleep(1500);
const saved = await ed.evaluate(async () => { const r = await fetch('/api/show').then(r => r.json()); return { savestate: document.querySelector('.savestate')?.textContent, serverCaption: r.chapters.flatMap(c => c.slides).find(s => s.type === 'photo')?.caption, previewCaption: document.querySelector('.stage .cap .tx')?.textContent }; });
console.log('autosave:', JSON.stringify(saved));
// open dialogs
for (const [i, label] of [['ingest', 'ספרייה'], ['versions', 'גרסאות'], ['help', '?']]) { /* via store */ }
await ed.evaluate(() => { const b = [...document.querySelectorAll('.topbar .btn')].find(b => b.textContent.includes('ספרייה')); b?.click(); }); await sleep(600); await shot(ed, '03-ingest-dialog');
await ed.keyboard.press('Escape'); await sleep(300);
await ed.evaluate(() => { const b = [...document.querySelectorAll('.topbar .btn')].find(b => b.textContent.includes('גרסאות')); b?.click(); }); await sleep(600); await shot(ed, '04-versions-dialog');
await ed.keyboard.press('Escape'); await sleep(300);
await ed.evaluate(() => { const b = [...document.querySelectorAll('.topbar .btn')]; b.find(x => x.querySelector('svg.lucide-settings'))?.click(); }); await sleep(500); await shot(ed, '05-settings-dialog');
await ed.keyboard.press('Escape'); await sleep(300);
// chapter inspector
await ed.click('.ch-head'); await sleep(400); await shot(ed, '06-chapter-inspector');
// add a bunch of slides via multi-select + Enter (select 6 assets with ctrl)
await ed.evaluate(() => document.querySelectorAll('.asset')[1].click());
for (let i = 2; i < 8; i++) { await ed.evaluate((i) => { const all = document.querySelectorAll('.asset'); const el = all[i % all.length]; el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); }, i); }
await ed.click('.lib-foot .btn.primary'); await sleep(600);
// video asset: filter videos and add
await ed.evaluate(() => [...document.querySelectorAll('.chip')].find(c => c.textContent === 'ברכות')?.click()); await sleep(300);
await ed.evaluate(() => document.querySelectorAll('.asset')[0].click()); await ed.click('.lib-foot .btn.primary'); await sleep(500);
await ed.evaluate(() => [...document.querySelectorAll('.chip')].find(c => c.textContent === 'הכל')?.click()); await sleep(300);
// collage: select 4 photos
await ed.evaluate(() => { const a = document.querySelectorAll('.asset'); const n = a.length; a[10 % n].click(); for (const i of [11, 12, 13]) a[i % n].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); });
await ed.evaluate(() => [...document.querySelectorAll('.lib-foot .btn')].find(b => b.textContent.includes('קולאז'))?.click()); await sleep(600);
// set music on first chapter via chapter inspector
await ed.click('.ch-head'); await sleep(300);
await ed.evaluate(() => { const sel = document.querySelector('.insp select'); if (sel && sel.options.length > 1) { sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change', { bubbles: true })); } }); await sleep(800);
await shot(ed, '07-editor-populated');
const pop = await ed.evaluate(() => ({ slides: document.querySelectorAll('.slide').length, total: document.querySelector('.topbar .pill b')?.textContent, music: document.querySelector('.ch-head .music')?.textContent, wave: !!document.querySelector('.wave canvas') }));
console.log('populated:', JSON.stringify(pop));
// undo twice
await ed.keyboard.down('Control'); await ed.keyboard.press('z'); await ed.keyboard.press('z'); await ed.keyboard.up('Control'); await sleep(400);
console.log('after undo x2 slides:', await ed.evaluate(() => document.querySelectorAll('.slide').length));
await ed.keyboard.down('Control'); await ed.keyboard.press('y'); await ed.keyboard.press('y'); await ed.keyboard.up('Control'); await sleep(1200);
console.log('after redo x2 slides:', await ed.evaluate(() => document.querySelectorAll('.slide').length));
// select a photo slide and set focal by clicking preview
await ed.evaluate(() => { const s = [...document.querySelectorAll('.slide')].find(x => x.querySelector('.ty')?.textContent === 'תמונה'); s?.click(); }); await sleep(400);
const st = await ed.$('.stage'); const bb = await st.boundingBox(); await ed.mouse.click(bb.x + bb.width * 0.3, bb.y + bb.height * 0.4); await sleep(500);
console.log('focal:', await ed.evaluate(() => document.querySelector('.stage .hint')?.textContent));
await shot(ed, '08-editor-photo-focal');
await sleep(1500);

// ---- show ----
const sh = await page('/show', 1600, 900);
await sleep(800); await shot(sh, '10-show-startgate');
await sh.click('.startgate .btn'); await sleep(2500); await shot(sh, '11-show-slide1');
const list = await sh.evaluate(() => document.querySelectorAll('.layer .sl').length); console.log('show layers with slides:', list);
for (let i = 2; i <= 7; i++) { await sh.keyboard.press('ArrowRight'); await sleep(2200); await shot(sh, `1${i}-show-slide${i}`); const t = await sh.evaluate(() => ({ cls: document.querySelector('.layer[style*="z-index: 2"] .sl')?.className, hud: document.querySelector('.hud')?.textContent, video: (() => { const v = document.querySelector('video'); return v ? { paused: v.paused, t: v.currentTime, dur: v.duration, src: v.currentSrc.split('/').pop() } : null; })() })); console.log(`slide ${i}:`, JSON.stringify(t)); }
await sh.keyboard.press('b'); await sleep(700); await shot(sh, '18-show-black'); await sh.keyboard.press('b');
await sh.keyboard.press('End'); await sleep(3500); await shot(sh, '19-show-last');

// ---- presenter (same browser profile → BroadcastChannel works) ----
const pr = await page('/presenter', 1400, 800); await sleep(800);
await sh.bringToFront(); await sh.keyboard.press('Home'); await sleep(1500);
await pr.bringToFront(); await sleep(800); await shot(pr, '20-presenter');
console.log('presenter:', await pr.evaluate(() => ({ cur: document.querySelector('.pr-stage .sl')?.className, notes: document.querySelector('.pr-notes')?.textContent, k: [...document.querySelectorAll('.pr-k .v')].map(x => x.textContent) })));
await pr.evaluate(() => [...document.querySelectorAll('.pr-controls .btn')].find(b => b.textContent.includes('הבא'))?.click()); await sleep(1500);
console.log('after presenter next, show idx:', await sh.evaluate(() => document.querySelector('.hud .num')?.textContent));

console.log('\n=== console/network issues (' + errors.length + ') ===');
for (const e of [...new Set(errors)].slice(0, 40)) console.log(e);
await browser.close();
