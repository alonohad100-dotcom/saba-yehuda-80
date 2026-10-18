// Headless audit of the auto-create feature: wizard steps, apply, invariants on the saved show, locks + regenerate, replace-similar, fill chapter, layouts.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2] || 'inspect-auto'; fs.mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const base = 'http://127.0.0.1:4000'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const p = await browser.newPage(); await p.setViewport({ width: 1920, height: 1080 });
const issues = []; p.on('pageerror', e => issues.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') issues.push('console: ' + m.text()); }); p.on('response', r => { if (r.status() >= 400) issues.push(`HTTP ${r.status()} ${r.url()}`); });
const shot = n => p.screenshot({ path: path.join(out, n + '.png') });
const click = async (text, sel = 'button') => { const ok = await p.evaluate((t, s) => { const b = [...document.querySelectorAll(s)].find(x => x.textContent.trim().includes(t)); if (b) { b.click(); return true; } return false; }, text, sel); if (!ok) issues.push('button not found: ' + text); return ok; };
const results = {};

await p.goto(base + '/edit', { waitUntil: 'networkidle0' }); await sleep(800);
results.before = await p.evaluate(() => ({ chapters: document.querySelectorAll('.ch-head').length, slides: document.querySelectorAll('.slide').length }));
// --- wizard ---
await click('צור אוטומטית'); await sleep(900); await shot('auto-1-source');
results.step1 = await p.evaluate(() => ({ dialog: !!document.querySelector('dialog.wiz'), folders: document.querySelectorAll('.tree-node').length, pool: [...document.querySelectorAll('.poolbox .v')].map(x => x.textContent) }));
await click('המשך'); await sleep(600); await shot('auto-2-shape');
results.step2 = await p.evaluate(() => ({ estimate: [...document.querySelectorAll('.poolbox .v')].map(x => x.textContent) }));
// set 18 minutes, many collages
await p.evaluate(() => { const r = document.querySelector('dialog.wiz input[type=range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '18'); r.dispatchEvent(new Event('input', { bubbles: true })); });
await click('הרבה'); await sleep(400);
await click('צור תצוגה מקדימה'); await sleep(1500); await shot('auto-3-preview');
results.step3 = await p.evaluate(() => ({ pills: [...document.querySelectorAll('dialog.wiz .pill')].map(x => x.textContent), strip: document.querySelectorAll('.strip-item').length, chapters: document.querySelectorAll('dialog.wiz tbody tr').length, warnings: [...document.querySelectorAll('dialog.wiz .check.warn')].map(x => x.textContent), dropped: document.querySelectorAll('.drop-item').length }));
const seedBefore = await p.evaluate(() => [...document.querySelectorAll('dialog.wiz .btn')].find(b => b.textContent.includes('צור מחדש'))?.textContent);
await click('צור מחדש'); await sleep(1200);
results.regen = { before: seedBefore, after: await p.evaluate(() => [...document.querySelectorAll('dialog.wiz .btn')].find(b => b.textContent.includes('צור מחדש'))?.textContent) };
await click('המשך'); await sleep(500); await shot('auto-4-apply');
await click('החלף את המצגת'); await sleep(2500); await shot('auto-5-applied');
results.applied = await p.evaluate(() => ({ chapters: [...document.querySelectorAll('.ch-head .t')].map(x => x.textContent), slides: document.querySelectorAll('.slide').length, autoBadges: document.querySelectorAll('.slide .autob').length, total: document.querySelector('.topbar .pill b')?.textContent, checks: [...document.querySelectorAll('.check')].map(c => c.textContent).slice(0, 8) }));
// invariants on the saved show (from the server after autosave)
await sleep(1500);
const saved = await fetch(base + '/api/show').then(r => r.json()); const assets = await fetch(base + '/api/assets').then(r => r.json()); const byId = Object.fromEntries(assets.map(a => [a.id, a]));
const ids = (s) => s.type === 'photo' || s.type === 'video' ? [s.assetId] : s.type === 'chapter' ? (s.heroAssetId ? [s.heroAssetId] : []) : s.assetIds ?? (s.milestones?.map(m => m.assetId) ?? s.people?.map(x => x.assetId) ?? []).filter(Boolean);
const photoUses = saved.chapters.flatMap(c => c.slides.filter(s => !['timeline', 'names'].includes(s.type)).flatMap(ids)).filter(id => byId[id]?.type === 'photo');
const dupGroupsUsed = photoUses.map(id => byId[id].dupGroup ?? id);
const layouts = saved.chapters.flatMap(c => c.slides).filter(s => s.type === 'collage').map(s => s.layout);
let adjacentSame = 0, adjacentVideos = 0; for (const c of saved.chapters) for (let i = 1; i < c.slides.length; i++) { if (c.slides[i].type === 'collage' && c.slides[i - 1].type === 'collage') adjacentSame++; if (c.title !== 'ברכות' && c.slides[i].type === 'video' && c.slides[i - 1].type === 'video') adjacentVideos++; }
results.invariants = { photoUses: photoUses.length, uniquePhotos: new Set(photoUses).size, uniqueDupGroups: new Set(dupGroupsUsed).size, layouts, adjacentCollages: adjacentSame, adjacentVideos, greetings: saved.chapters.flatMap(c => c.slides).filter(s => s.type === 'video' && byId[s.assetId]?.relPath.startsWith('videos/greetings/')).length, allAutoTagged: saved.chapters.flatMap(c => c.slides).every(s => s.auto), lowQualityUsed: photoUses.filter(id => byId[id].quality < 0.3).map(id => byId[id].name) };
// undo reverts in one step
await p.keyboard.down('Control'); await p.keyboard.press('z'); await p.keyboard.up('Control'); await sleep(600);
results.undo = await p.evaluate(() => ({ chapters: document.querySelectorAll('.ch-head').length, slides: document.querySelectorAll('.slide').length }));
await p.keyboard.down('Control'); await p.keyboard.press('y'); await p.keyboard.up('Control'); await sleep(1500);
results.redo = await p.evaluate(() => ({ chapters: document.querySelectorAll('.ch-head').length, slides: document.querySelectorAll('.slide').length }));
// --- lock a photo slide, regenerate with a new seed, verify it survives ---
const lockedId = await p.evaluate(() => { const s = [...document.querySelectorAll('.slide')].find(x => x.querySelector('.ty')?.textContent === 'תמונה'); s?.click(); return s?.closest('[data-id]')?.dataset.id || null; });
await sleep(500); await click('נעל'); await sleep(400);
const lockedTitle = await p.evaluate(() => document.querySelector('.slide.sel .cap')?.textContent || document.querySelector('.insp-title')?.textContent);
const lockedAsset = await p.evaluate(() => document.querySelector('.slide.sel img')?.getAttribute('src'));
results.lock = { lockBadge: await p.evaluate(() => !!document.querySelector('.slide.sel .lock')), lockedAsset };
await click('צור אוטומטית'); await sleep(700); await click('המשך'); await sleep(300); await click('צור תצוגה מקדימה'); await sleep(1200); await click('צור מחדש'); await sleep(1000); await click('המשך'); await sleep(300); await click('החלף את המצגת'); await sleep(2500);
results.lockKept = await p.evaluate((src) => ({ stillThere: !![...document.querySelectorAll('.slide img')].find(i => i.getAttribute('src') === src), locks: document.querySelectorAll('.slide .lock').length }), lockedAsset);
await shot('auto-6-after-regenerate');
// --- replace with similar: free a photo by deleting one slide, then ask its neighbour for a similar unused photo ---
const freed = await p.evaluate(() => { const ph = [...document.querySelectorAll('.slide')].filter(x => x.querySelector('.ty')?.textContent === 'תמונה' && !x.querySelector('.lock')); const s = ph[ph.length - 1]; s?.click(); return s?.querySelector('img')?.getAttribute('src')?.split('/').pop(); }); await sleep(300);
await p.keyboard.press('Delete'); await sleep(500);
await p.evaluate(() => { const ph = [...document.querySelectorAll('.slide')].filter(x => x.querySelector('.ty')?.textContent === 'תמונה' && !x.querySelector('.lock')); ph[ph.length - 1]?.click(); }); await sleep(400);
const beforeSrc = await p.evaluate(() => document.querySelector('.slide.sel img')?.getAttribute('src'));
await click('תמונה דומה'); await sleep(700);
results.replaceSimilar = { freed, before: beforeSrc?.split('/').pop(), after: (await p.evaluate(() => document.querySelector('.slide.sel img')?.getAttribute('src')))?.split('/').pop(), toast: await p.evaluate(() => document.querySelector('.toast')?.textContent) };
// --- collage layout picker ---
await p.evaluate(() => { const s = [...document.querySelectorAll('.slide')].find(x => x.querySelector('.ty')?.textContent === 'קולאז׳'); s?.click(); }); await sleep(500); await shot('auto-7-collage-inspector');
results.layoutPicker = await p.evaluate(() => ({ buttons: document.querySelectorAll('.layout-pick button').length, enabled: document.querySelectorAll('.layout-pick button:not([disabled])').length, pressed: document.querySelector('.layout-pick button[aria-pressed="true"] span')?.textContent }));
await p.evaluate(() => { const b = [...document.querySelectorAll('.layout-pick button:not([disabled])')].find(x => x.getAttribute('aria-pressed') !== 'true'); b?.click(); }); await sleep(500);
results.layoutChanged = await p.evaluate(() => document.querySelector('.layout-pick button[aria-pressed="true"] span')?.textContent);
// --- fill a chapter ---
await p.evaluate(() => document.querySelectorAll('.ch-head')[2]?.click()); await sleep(400);
const chTitle = await p.evaluate(() => document.querySelector('.ch-head.sel .t')?.textContent); const chSlidesBefore = await p.evaluate(() => document.querySelectorAll('.ch-head.sel')[0]?.parentElement.querySelectorAll('.slide').length);
await click('מלא את הפרק אוטומטית'); await sleep(700); await shot('auto-8-fill'); await click('המשך'); await sleep(300); await click('צור תצוגה מקדימה'); await sleep(1200); await click('המשך'); await sleep(300); await click('מלא את הפרק'); await sleep(2000);
results.fill = { chapter: chTitle, before: chSlidesBefore, after: await p.evaluate((t) => { const h = [...document.querySelectorAll('.ch-head')].find(x => x.querySelector('.t')?.textContent === t); return h ? h.parentElement.querySelectorAll('.slide').length : null; }, chTitle), titleKept: await p.evaluate((t) => [...document.querySelectorAll('.ch-head .t')].some(x => x.textContent === t), chTitle) };
// --- library duplicates filter ---
await p.evaluate(() => { const sel = [...document.querySelectorAll('.lib-tools select')][1]; const opt = [...sel.options].find(o => o.textContent.includes('הנכדים')); if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); } }); await sleep(500);
results.library = await p.evaluate(() => ({ dupChip: [...document.querySelectorAll('.chip')].find(c => c.textContent.includes('כפילויות'))?.textContent, visible: document.querySelectorAll('.asset').length, dupBadges: [...document.querySelectorAll('.asset .dupn')].map(x => x.textContent), blurBadges: document.querySelectorAll('.asset .blur').length }));
await click('כפילויות מוסתרות', '.chip'); await sleep(400); results.libraryShowingDups = await p.evaluate(() => document.querySelectorAll('.asset').length); await shot('auto-9-library-dups');
// --- show: screenshot each collage layout present ---
const show2 = await fetch(base + '/api/show').then(r => r.json()); const seen = new Set();
for (const c of show2.chapters) for (const s of c.slides) { if (s.type !== 'collage' || seen.has(s.layout)) continue; seen.add(s.layout); const q = await browser.newPage(); await q.setViewport({ width: 1920, height: 1080 }); await q.goto(`${base}/show?from=${s.id}`, { waitUntil: 'networkidle0' }); await q.click('.startgate .btn'); await sleep(3800); await q.screenshot({ path: path.join(out, `layout-${s.layout}.png`) }); await q.close(); }
results.layoutShots = [...seen];
console.log(JSON.stringify(results, null, 1));
console.log('issues:', issues.length ? issues : 'none');
await browser.close();
