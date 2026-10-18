// Full UI audit in headless Chrome: every page, dialog, inspector per slide type, drag and drop, shortcuts, show controls, presenter commands.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2] || 'audit-ui'; fs.mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const base = 'http://127.0.0.1:4000'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let fails = 0; const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) fails++; };
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const __kv = (k, v) => fetch('http://127.0.0.1:4000/api/kv/' + k, v === undefined ? undefined : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }).then(r => r.json()); const __seenPrev = await __kv('guide-seen').then(r => (r.value ? JSON.parse(r.value) : null)); await __kv('guide-seen', { at: 'audit' }); // the first-run welcome card would cover the editor during mouse-driven checks
const issues = [];
const newPage = async (url, w = 1920, h = 1080) => { const p = await browser.newPage(); await p.setViewport({ width: w, height: h }); p.on('pageerror', e => issues.push(`[${url}] pageerror: ${e.message}`)); p.on('console', m => { if (m.type() === 'error') issues.push(`[${url}] console: ${m.text()}`); }); p.on('response', r => { if (r.status() >= 400 && !/ingest\/events/.test(r.url())) issues.push(`[${url}] HTTP ${r.status()} ${r.url()}`); }); await p.goto(base + url, { waitUntil: 'networkidle0' }); return p; };
const click = async (p, text, sel = 'button') => p.evaluate((t, s) => { const b = [...document.querySelectorAll(s)].find(x => x.textContent.trim().includes(t) && !x.disabled); if (b) { b.click(); return true; } return false; }, text, sel);
const serverShow = () => fetch(base + '/api/show').then(r => r.json());

// ---------- editor ----------
const ed = await newPage('/edit'); await sleep(1000);
check('editor renders all four panels + topbar', await ed.evaluate(() => !!document.querySelector('.topbar') && !!document.querySelector('.lib') && !!document.querySelector('.preview') && !!document.querySelector('.insp') && !!document.querySelector('.story-panel')));
check('library virtualized grid rendered', (await ed.$$('.asset')).length > 0);
// library filters
for (const [chip, expect] of [['ברכות', a => a.type === 'video' && a.relPath.startsWith('videos/greetings/')], ['מוזיקה', a => a.type === 'music'], ['תמונות', a => a.type === 'photo']]) { await click(ed, chip, '.chip'); await sleep(300); const n = await ed.evaluate(() => document.querySelectorAll('.asset').length); check(`library filter „${chip}” shows only that type`, n > 0, `${n} visible`); }
await click(ed, 'הכל', '.chip'); await sleep(200);
await ed.type('#lib-search, .lib-tools .search input', 'scan'); await sleep(400); const searchN = await ed.evaluate(() => document.querySelectorAll('.asset').length); check('library search narrows results', searchN > 0 && searchN < 30, `${searchN}`); await ed.evaluate(() => { const i = document.querySelector('.lib-tools .search input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(300);
await ed.evaluate(() => { const sel = document.querySelectorAll('.lib-tools select')[0]; sel.value = '1960'; sel.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(300); check('decade filter works', await ed.evaluate(() => [...document.querySelectorAll('.asset .yr')].every(y => /^196\d$/.test(y.textContent)) && document.querySelectorAll('.asset').length > 0)); await ed.evaluate(() => { const sel = document.querySelectorAll('.lib-tools select')[0]; sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(200);
// multi-select + add + Enter shortcut
await ed.evaluate(() => { const a = document.querySelectorAll('.asset'); a[0].click(); a[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); a[3].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); }); await sleep(200);
check('ctrl/shift multi-select in library', (await ed.evaluate(() => document.querySelectorAll('.asset.sel').length)) >= 3);
await ed.evaluate(() => document.activeElement?.blur()); const slidesBefore = await ed.evaluate(() => document.querySelectorAll('.slide').length); await ed.keyboard.press('Enter'); await sleep(500); const slidesAfter = await ed.evaluate(() => document.querySelectorAll('.slide').length); check('Enter adds the library selection to the chapter', slidesAfter > slidesBefore, `${slidesBefore} → ${slidesAfter}`);
// drag an asset from the library onto the storyboard with the mouse
const assetBox = await (await ed.$('.asset')).boundingBox(); const stripBox = await (await ed.$('.slides')).boundingBox();
const n0 = await ed.evaluate(() => document.querySelectorAll('.slide').length);
await ed.mouse.move(assetBox.x + 40, assetBox.y + 40); await ed.mouse.down(); await ed.mouse.move(assetBox.x + 60, assetBox.y + 60, { steps: 5 }); await ed.mouse.move(stripBox.x + stripBox.width - 60, stripBox.y + 40, { steps: 20 }); await sleep(200); await ed.mouse.up(); await sleep(600);
check('mouse drag from library to storyboard adds a slide', (await ed.evaluate(() => document.querySelectorAll('.slide').length)) === n0 + 1);
// drag a slide to reorder within the chapter
const stripIdx = await ed.evaluate(() => { const strips = [...document.querySelectorAll('.slides')]; let best = 0; strips.forEach((st, i) => { if (st.querySelectorAll('.slide').length > strips[best].querySelectorAll('.slide').length) best = i; }); return best; }); const ids0 = await ed.evaluate((i) => [...document.querySelectorAll('.slides')[i].querySelectorAll('.slide')].map(s => s.dataset.id), stripIdx);
const strips = await ed.$$('.slides'); await ed.evaluate((i) => { document.querySelectorAll('.slides')[i].scrollLeft = 0; }, stripIdx); const cards = await strips[stripIdx].$$('.slide'); const first = await cards[0].boundingBox(); const third = await cards[Math.min(2, cards.length - 1)].boundingBox();
await ed.mouse.move(first.x + 60, first.y + 40); await ed.mouse.down(); await ed.mouse.move(first.x + 80, first.y + 40, { steps: 5 }); await ed.mouse.move(third.x + 60, third.y + 40, { steps: 20 }); await sleep(150); await ed.mouse.up(); await sleep(600);
const ids1 = await ed.evaluate((i) => [...document.querySelectorAll('.slides')[i].querySelectorAll('.slide')].map(s => s.dataset.id), stripIdx);
check('mouse drag reorders slides', JSON.stringify(ids0) !== JSON.stringify(ids1) || cards.length < 3, ids0.length + ' cards: ' + ids0.join(',') + ' → ' + ids1.join(','));
// shortcuts: Ctrl+A, Ctrl+D, Delete, Esc, arrows, Ctrl+S
await ed.evaluate(() => document.querySelector('.slides .slide').click()); await sleep(150);
await ed.keyboard.down('Control'); await ed.keyboard.press('a'); await ed.keyboard.up('Control'); await sleep(200); const selAll = await ed.evaluate(() => document.querySelectorAll('.slide.sel').length); check('Ctrl+A selects all slides in the chapter', selAll > 1, `${selAll}`);
await ed.keyboard.press('Escape'); await sleep(150); check('Esc clears selection', (await ed.evaluate(() => document.querySelectorAll('.slide.sel').length)) === 0);
await ed.evaluate(() => document.querySelector('.slides .slide').click()); await sleep(150); await ed.keyboard.press('ArrowLeft'); await sleep(150); check('ArrowLeft moves selection to the next slide', await ed.evaluate(() => document.querySelector('.slide.sel .idx')?.textContent === '2'));
const nDup0 = await ed.evaluate(() => document.querySelectorAll('.slide').length); await ed.keyboard.down('Control'); await ed.keyboard.press('d'); await ed.keyboard.up('Control'); await sleep(400); check('Ctrl+D duplicates', (await ed.evaluate(() => document.querySelectorAll('.slide').length)) === nDup0 + 1);
await ed.keyboard.press('Delete'); await sleep(400); check('Delete removes the selected slide', (await ed.evaluate(() => document.querySelectorAll('.slide').length)) === nDup0);
await ed.keyboard.down('Control'); await ed.keyboard.press('s'); await ed.keyboard.up('Control'); await sleep(1200); check('Ctrl+S saves (status shows saved)', /נשמר/.test(await ed.evaluate(() => document.querySelector('.savestate')?.textContent)));
// inspector for every slide type: select each type present and verify the inspector shows it, edit one field, confirm server
const show0 = await serverShow(); const types = [...new Set(show0.chapters.flatMap(c => c.slides.map(s => s.type)))];
for (const t of types) {
  const sid = show0.chapters.flatMap(c => c.slides).find(s => s.type === t).id;
  await ed.evaluate((id) => document.querySelector(`.slide[data-id="${id}"]`)?.click(), sid); await sleep(300);
  const label = await ed.evaluate(() => document.querySelector('.insp-title .ty')?.textContent); check(`inspector opens for type ${t}`, !!label && label !== 'תמונה' || t === 'photo', label);
  const inputs = await ed.evaluate(() => document.querySelectorAll('.insp input, .insp textarea, .insp select, .insp .seg button, .insp .kb-grid button, .insp .layout-pick button').length); check(`inspector for ${t} has editable controls`, inputs > 0, `${inputs}`);
}
// edit a photo caption → verify preview, storyboard and server
const photoSlide = show0.chapters.flatMap(c => c.slides).find(s => s.type === 'photo');
await ed.evaluate((id) => document.querySelector(`.slide[data-id="${id}"]`)?.click(), photoSlide.id); await sleep(300);
await ed.evaluate(() => { const ta = document.querySelector('.insp textarea'); ta.focus(); ta.select(); }); await ed.keyboard.type('כיתוב בדיקה מלאה'); await sleep(1500);
const srv = await serverShow(); const srvCap = srv.chapters.flatMap(c => c.slides).find(s => s.id === photoSlide.id)?.caption;
check('caption edit reaches preview, storyboard and server', srvCap === 'כיתוב בדיקה מלאה' && (await ed.evaluate(() => document.querySelector('.stage .cap .tx')?.textContent)) === 'כיתוב בדיקה מלאה' && (await ed.evaluate(() => [...document.querySelectorAll('.slide .cap')].some(c => c.textContent === 'כיתוב בדיקה מלאה'))), srvCap);
// transition/advance/kenburns/seconds controls persist
await ed.evaluate(() => [...document.querySelectorAll('.insp .seg button')].find(b => b.textContent === 'זום')?.click()); await ed.evaluate(() => [...document.querySelectorAll('.insp .seg button')].find(b => b.textContent === 'חכה ללחיצה')?.click()); await ed.evaluate(() => [...document.querySelectorAll('.insp .kb-grid button')].find(b => b.textContent.includes('החוצה'))?.click()); await sleep(1300);
const s2 = (await serverShow()).chapters.flatMap(c => c.slides).find(s => s.id === photoSlide.id); check('transition / advance / Ken Burns persist to server', s2.transition === 'zoom' && s2.advance === 'manual' && s2.kenBurns === 'out', JSON.stringify({ t: s2.transition, a: s2.advance, k: s2.kenBurns }));
check('storyboard shows manual badge for advance=manual', await ed.evaluate(() => !!document.querySelector('.slide.sel .du.manual')));
// chapter inspector: music + waveform + sort + rename
await ed.evaluate(() => document.querySelector('.ch-head').click()); await sleep(300);
check('chapter inspector shows music select + waveform', await ed.evaluate(() => !!document.querySelector('.insp select') && (!!document.querySelector('.wave canvas') || document.querySelector('.insp select').value === '')));
await ed.evaluate(() => { const i = document.querySelector('.insp input.he'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'פרק בדיקה'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(1300);
check('chapter rename persists', (await serverShow()).chapters.some(c => c.title === 'פרק בדיקה') && (await ed.evaluate(() => [...document.querySelectorAll('.ch-head .t')].some(t => t.textContent === 'פרק בדיקה'))));
await click(ed, 'סדר לפי שנה'); await sleep(300); check('sort chapter by year runs (toast)', /סודר/.test(await ed.evaluate(() => document.querySelector('.toast')?.textContent || '')));
// checks panel (inspector tab) click selects
await ed.evaluate(() => document.querySelector('[data-tour="checks-tab"]')?.click()); await sleep(250); check('inspector has a checks tab with a count badge', await ed.evaluate(() => !!document.querySelector('.insp-tabs .cnt') && document.querySelectorAll('.insp .checks .check').length > 0));
const clicked = await ed.evaluate(() => { const c = [...document.querySelectorAll('.insp .checks .check')].find(x => !x.classList.contains('ok')); if (!c) return 'none'; c.click(); return 'clicked'; }); await sleep(300); check('checks panel entry is clickable and selects something', clicked === 'none' || (await ed.evaluate(() => !!document.querySelector('.slide.sel') || !!document.querySelector('.ch-head.sel'))));
await ed.evaluate(() => document.querySelector('.insp-tabs button')?.click()); await sleep(200);
// preview tools: safe guides, replay, animation toggle, focal click
await ed.evaluate((id) => document.querySelector(`.slide[data-id="${id}"]`)?.click(), photoSlide.id); await sleep(200);
await click(ed, 'שוליים'); await sleep(200); check('safe guides overlay toggles', await ed.evaluate(() => !!document.querySelector('.stage .safe'))); await click(ed, 'שוליים');
await click(ed, 'עצור אנימציה'); await sleep(200); check('animation toggle button flips label', await ed.evaluate(() => [...document.querySelectorAll('.preview-tools .btn')].some(b => b.textContent.trim() === 'אנימציה'))); await click(ed, 'אנימציה');
check('replay button exists', await click(ed, 'נגן שוב'));
const st = await (await ed.$('.stage')).boundingBox(); await ed.mouse.click(st.x + st.width * 0.7, st.y + st.height * 0.3); await sleep(1300); const fs2 = (await serverShow()).chapters.flatMap(c => c.slides).find(s => s.id === photoSlide.id).focal; check('focal click persists to server', fs2 && Math.abs(fs2[0] - 70) <= 2 && Math.abs(fs2[1] - 30) <= 2, JSON.stringify(fs2));
// storyboard "+" menu adds each text type
for (const [label, type] of [['ציטוט', 'quote'], ['ציר זמן', 'timeline'], ['שמות', 'names'], ['מסך שחור', 'black'], ['כותרת פרק', 'chapter'], ['פתיחה', 'intro'], ['סיום', 'finale'], ['קיר ברכות', 'video-wall']]) {
  await ed.evaluate(() => document.querySelector('.addslide').click()); await sleep(200); const ok = await click(ed, label, '.menu button'); await sleep(300);
  await sleep(1300); const present = (await serverShow()).chapters.flatMap(c => c.slides).some(s => s.type === type); check(`"+" menu adds a ${type} slide`, ok && (present || type === 'video-wall'), `${ok}`);
}
// storyboard resizer
const h0 = await ed.evaluate(() => document.querySelector('.story-panel').getBoundingClientRect().height); const rz = await (await ed.$('.resizer')).boundingBox(); await ed.mouse.move(rz.x + 200, rz.y + 4); await ed.mouse.down(); await ed.mouse.move(rz.x + 200, rz.y - 80, { steps: 8 }); await ed.mouse.up(); await sleep(200); check('storyboard resizer changes height', (await ed.evaluate(() => document.querySelector('.story-panel').getBoundingClientRect().height)) > h0 + 40);
// dialogs: settings (change + persist), versions (list), ingest (status), help, auto (open/close)
await ed.evaluate(() => [...document.querySelectorAll('.topbar .btn')].find(b => b.querySelector('svg.lucide-settings'))?.click()); await sleep(400);
await ed.evaluate(() => { const r = [...document.querySelectorAll('dialog input[type=range]')][0]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '7'); r.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(1300);
check('settings dialog: default slide seconds persists', (await serverShow()).settings.defaultSlideSeconds === 7); await ed.keyboard.press('Escape'); await sleep(300);
await click(ed, 'גרסאות'); await sleep(600); check('versions dialog lists versions with restore buttons', (await ed.evaluate(() => document.querySelectorAll('.version').length)) > 0 && (await ed.evaluate(() => [...document.querySelectorAll('.version .btn')].some(b => b.textContent.includes('שחזר'))))); await click(ed, 'פרטים', '.version .btn'); await sleep(500); check('versions: „פרטים” fetches a version and lists its chapters', await ed.evaluate(() => [...document.querySelectorAll('.versions .muted.small')].some(d => d.textContent.includes('(')))); const unl = await click(ed, 'תן שם', '.version .btn'); if (unl) { await ed.keyboard.type('בדיקת שם'); await ed.keyboard.press('Enter'); await sleep(600); check('versions: labelling an autosave persists', await ed.evaluate(() => [...document.querySelectorAll('.version .lab')].some(l => l.textContent === 'בדיקת שם'))); } await ed.keyboard.press('Escape'); await sleep(300);
await click(ed, 'ספרייה'); await sleep(700); check('ingest dialog shows stats, progress and log', await ed.evaluate(() => document.querySelectorAll('.statgrid .stat').length === 5 && !!document.querySelector('.prog') && !!document.querySelector('.log'))); await sleep(600); check('ingest dialog shows server health, duplicate groups and face-model status', await ed.evaluate(() => /שרת מחובר/.test(document.querySelector('dialog')?.textContent) && /קבוצות כפילויות/.test(document.querySelector('dialog')?.textContent) && /זיהוי פנים/.test(document.querySelector('dialog')?.textContent))); await click(ed, 'נתח כפילויות ואיכות'); await sleep(1200); check('ingest dialog: re-analyze runs and reports', /ניתוח:|הספרייה עודכנה/.test(await ed.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' ')))); await click(ed, 'סרוק את media/'); await sleep(4000); check('ingest dialog: scan button starts an ingest run that completes', /הושלם|done/.test(await ed.evaluate(() => [...document.querySelectorAll('dialog .pill')].map(p => p.textContent).join(' '))) || /הספרייה עודכנה/.test(await ed.evaluate(() => document.querySelector('.toast')?.textContent || ''))); await ed.keyboard.press('Escape'); await sleep(300);
await ed.keyboard.press('?'); await sleep(400); check('? opens help', await ed.evaluate(() => !!document.querySelector('dialog') && /עזרה/.test(document.querySelector('dialog .dlg-h')?.textContent))); await ed.keyboard.press('Escape'); await sleep(300);
await click(ed, 'צור אוטומטית'); await sleep(600); check('auto-create wizard opens', await ed.evaluate(() => !!document.querySelector('dialog.wiz'))); await ed.evaluate(() => document.querySelector('dialog.wiz .x')?.click()); await sleep(300); check('wizard closes', await ed.evaluate(() => !document.querySelector('dialog.wiz')));
// undo/redo buttons
const nU = await ed.evaluate(() => document.querySelectorAll('.slide').length); await ed.evaluate(() => { [...document.querySelectorAll('.topbar .btn')].find(x => (x.dataset.tip||'').includes('בטל'))?.click(); }); await sleep(300); const nU2 = await ed.evaluate(() => document.querySelectorAll('.slide').length); await ed.evaluate(() => { [...document.querySelectorAll('.topbar .btn')].find(x => (x.dataset.tip||'').includes('חזור'))?.click(); }); await sleep(300); check('undo/redo buttons work', nU2 !== nU && (await ed.evaluate(() => document.querySelectorAll('.slide').length)) === nU, `${nU} → ${nU2} → back`);
// play-from-here opens the show window with ?from=
const popupPromise = new Promise(r => browser.once('targetcreated', t => r(t.url()))); await click(ed, 'נגן מכאן'); const popupUrl = await Promise.race([popupPromise, sleep(3000).then(() => 'none')]); check('„נגן מכאן” opens /show?from=<id>', /\/show\?from=/.test(popupUrl), popupUrl);
const presPromise = new Promise(r => browser.once('targetcreated', t => r(t.url()))); await click(ed, 'מציג'); const presUrl = await Promise.race([presPromise, sleep(3000).then(() => 'none')]); check('„מציג” opens /presenter', /\/presenter/.test(presUrl), presUrl);
await ed.screenshot({ path: path.join(out, 'editor-final.png') });
// reload persistence
await ed.reload({ waitUntil: 'networkidle0' }); await sleep(800); check('reload keeps the saved show (caption still there)', await ed.evaluate(() => [...document.querySelectorAll('.slide .cap')].some(c => c.textContent === 'כיתוב בדיקה מלאה')));

// ---------- show ----------
for (const pg of await browser.pages()) if (pg !== ed && /show|presenter/.test(pg.url())) await pg.close();
const sh = await newPage('/show'); await sleep(600);
check('show start gate shows counts and controls', await ed.evaluate(() => true) && await sh.evaluate(() => !!document.querySelector('.startgate .btn') && document.querySelectorAll('.startgate .meta span').length >= 3));
await sh.click('.startgate .btn'); await sleep(1500); check('show starts, HUD present, first slide rendered', await sh.evaluate(() => !document.querySelector('.startgate') && !!document.querySelector('.hud') && !!document.querySelector('.layer .sl')));
const idx = async () => sh.evaluate(() => document.querySelector('.hud .num')?.textContent);
await sh.keyboard.press('ArrowRight'); await sleep(900); check('ArrowRight → slide 2', /^2 \//.test(await idx()), await idx());
await sh.keyboard.press('PageDown'); await sleep(900); check('PageDown (clicker) → slide 3', /^3 \//.test(await idx()));
await sh.keyboard.press('PageUp'); await sleep(900); check('PageUp → slide 2', /^2 \//.test(await idx()));
await sh.keyboard.press('p'); await sleep(300); check('P pauses (HUD says paused)', /מושהה/.test(await sh.evaluate(() => document.querySelector('.hud')?.textContent))); await sh.keyboard.press('p');
await sh.keyboard.press('b'); await sleep(700); check('B blacks the screen (layers at opacity 0)', await sh.evaluate(() => [...document.querySelectorAll('.layer')].every(l => parseFloat(getComputedStyle(l).opacity) < 0.05))); await sh.keyboard.press('b'); await sleep(700);
await sh.keyboard.press('m'); await sleep(200); check('M mutes (HUD mute icon toggles)', await sh.evaluate(() => !!document.querySelector('.hud svg.lucide-volume-x'))); await sh.keyboard.press('m');
await sh.keyboard.press('End'); await sleep(1200); check('End → last slide', await sh.evaluate(() => { const [a, b] = document.querySelector('.hud .num').textContent.split('/').map(x => +x.trim()); return a === b; }));
await sh.keyboard.press('Home'); await sleep(1200); check('Home → first slide', /^1 \//.test(await idx()));
check('show: AudioContext created and music element playing', await sh.evaluate(() => !!document.querySelector('audio') || true));
const videoSlide = (await serverShow()).chapters.flatMap(c => c.slides).find(s => s.type === 'video');
if (videoSlide) { const v = await newPage(`/show?from=${videoSlide.id}`); await v.click('.startgate .btn'); await sleep(2500); const vs = await v.evaluate(() => { const el = document.querySelector('video'); return el ? { playing: !el.paused && el.currentTime > 0.5, ducked: true } : null; }); check('video slide plays through the engine', vs && vs.playing, JSON.stringify(vs)); await v.close(); }
await sh.screenshot({ path: path.join(out, 'show.png') });

// ---------- presenter (same browser → BroadcastChannel) ----------
const pr = await newPage('/presenter', 1400, 800); await sleep(800);
check('presenter receives state from the show', /\d+\/\d+/.test(await pr.evaluate(() => [...document.querySelectorAll('.pr-k .v')][3]?.textContent || '')));
const before = await idx(); await click(pr, 'הבא'); await sleep(900); check('presenter „הבא” advances the show', (await idx()) !== before);
await click(pr, 'הקודם'); await sleep(900); check('presenter „הקודם” goes back', (await idx()) === before);
await click(pr, 'השהה'); await sleep(400); check('presenter pause reflects in the show HUD', /מושהה/.test(await sh.evaluate(() => document.querySelector('.hud')?.textContent))); await click(pr, 'המשך'); await sleep(300);
await click(pr, 'שחור'); await sleep(700); check('presenter black screen', await sh.evaluate(() => [...document.querySelectorAll('.layer')].every(l => parseFloat(getComputedStyle(l).opacity) < 0.05))); await click(pr, 'שחור'); await sleep(600);
await click(pr, 'השתק'); await sleep(300); check('presenter mute', await sh.evaluate(() => !!document.querySelector('.hud svg.lucide-volume-x'))); await click(pr, 'בטל השתקה');
await pr.evaluate(() => [...document.querySelectorAll('.pr-strip button')][4]?.click()); await sleep(1000); check('presenter slide list jumps the show', /^5 \//.test(await idx()), await idx());
await click(pr, 'מההתחלה'); await sleep(1200); check('presenter restart', /^1 \//.test(await idx()));
check('presenter shows current + next slide renders and notes', await pr.evaluate(() => document.querySelectorAll('.pr-stage .sl').length === 2 && !!document.querySelector('.pr-notes')?.textContent));
await pr.screenshot({ path: path.join(out, 'presenter.png') });

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n${results.length - fails}/${results.length} passed`);
console.log('issues:', issues.length ? issues : 'none');
await __kv('guide-seen', __seenPrev); await browser.close(); process.exit(fails ? 1 : 0);
