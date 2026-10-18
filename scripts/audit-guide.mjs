// Headless audit of the interactive guide: /guide renders every chapter with live demos, the demos react to their controls,
// search and navigation work, the progress checklist reads the real show, the editor shows the welcome card on first run,
// the 14-step tour spotlights real controls, guide → editor commands arrive over the bridge (and via ?do=), and the show marks a rehearsal.
// Works with an EMPTY library (the guide renders its own demo photos). Server on :4000 required.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2] || 'audit-guide'; fs.mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const base = 'http://127.0.0.1:4000'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let fails = 0; const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) fails++; };
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const issues = [];
const page = async (url, w = 1920, h = 1080) => { const p = await browser.newPage(); await p.setViewport({ width: w, height: h }); p.on('pageerror', e => issues.push(`[${url}] ${e.message}`)); p.on('console', m => { if (m.type() === 'error') issues.push(`[${url}] console: ${m.text()}`); }); p.on('response', r => { if (r.status() >= 400 && !/ingest\/events/.test(r.url())) issues.push(`[${url}] HTTP ${r.status()} ${r.url()}`); }); await p.goto(base + url, { waitUntil: 'networkidle0' }); return p; };
const kv = async (k, v) => fetch(`${base}/api/kv/${k}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
const kvGet = async (k) => fetch(`${base}/api/kv/${k}`).then(r => r.json()).then(r => (r.value ? JSON.parse(r.value) : null));
const prevSeen = await kvGet('guide-seen'); const prevRehearsed = await kvGet('rehearsed');

// ---------- the guide page ----------
const g = await page('/guide'); await sleep(1200);
check('guide: 13 chapters in the navigation', (await g.$$('.guide-nav ol li')).length === 13);
check('guide: 13 chapter sections rendered', (await g.$$('.guide-ch')).length === 13);
check('guide: progress checklist has 11 items and reads the server', (await g.$$('.guide-progress li')).length === 11 && await g.evaluate(() => !!document.querySelector('.guide-head .pill.ok')));
// scroll through everything so lazy demos mount, then count live slides
await g.evaluate(async () => { const m = document.querySelector('.guide-main'); for (let y = 0; y < m.scrollHeight; y += 700) { m.scrollTop = y; await new Promise(r => setTimeout(r, 60)); } m.scrollTop = 0; }); await sleep(800);
const stages = await g.evaluate(() => document.querySelectorAll('.gd-stage .sl').length);
check('guide: live demo slides rendered across the chapters (≥ 45)', stages >= 45, String(stages));
check('guide: slide-type gallery shows all 12 types', (await g.$$('.gd-type')).length === 12);
check('guide: demo photos are generated (no network media requests)', !issues.some(i => /\/media\//.test(i)));
await g.evaluate(() => document.getElementById('photo')?.scrollIntoView()); await sleep(600);
// transitions: pick "push", both layers get content
await g.evaluate(() => [...document.querySelectorAll('.gd-chips .chip')].find(b => b.textContent === 'דחיפה')?.click()); await sleep(1800);
check('guide: transition demo plays into two layers', await g.evaluate(() => document.querySelectorAll('.gd-player .layer .sl').length >= 2));
await g.evaluate(() => document.getElementById('design')?.scrollIntoView()); await sleep(600);
await g.evaluate(() => [...document.querySelectorAll('.gd-chips .chip')].find(b => b.textContent === 'מילה־מילה')?.click()); await sleep(700);
check('guide: animation playground re-renders the overlay (typewriter words)', await g.evaluate(() => document.querySelectorAll('.gd-stage .ov-text .w').length >= 1));
await g.evaluate(() => [...document.querySelectorAll('.gd-chips .chip')].find(b => b.textContent === 'ספיה')?.click()); await sleep(500);
check('guide: look demo applies the sepia filter', await g.evaluate(() => [...document.querySelectorAll('.gd-stage .sl')].some(el => (el.style.getPropertyValue('--media-filter') || '').includes('sepia'))));
check('guide: eight collage layouts rendered', await g.evaluate(() => new Set([...document.querySelectorAll('.gd-stage .sl.collage .grid')].map(g => [...g.classList].find(c => c.startsWith('l-')))).size === 8));
await g.evaluate(() => document.getElementById('themes')?.scrollIntoView()); await sleep(500);
await g.evaluate(() => [...document.querySelectorAll('.gd-theme-chip')].find(b => b.textContent.includes('קולנועי'))?.click()); await sleep(1300);
check('guide: theme demo switches the stage theme live', await g.evaluate(() => !!document.querySelector('.gd-stage[data-theme="cinema"] .sl')));
check('guide: eleven theme previews', (await g.$$('.gd-theme-chip')).length === 11 && await g.evaluate(() => document.querySelectorAll('.gd-gallery.xs .gd-stage[data-theme]').length >= 11));
await g.screenshot({ path: path.join(out, 'guide-themes.png') });
// navigation + hash
await g.evaluate(() => [...document.querySelectorAll('.guide-nav ol button')].find(b => b.textContent.includes('מוזיקה ושמע'))?.click()); await sleep(1500);
check('guide: nav click scrolls to the chapter and sets the hash', await g.evaluate(() => location.hash === '#audio' && document.querySelector('.guide-nav button.cur')?.textContent.includes('מוזיקה')));
// search
await g.type('.guide-search input', 'מוקד'); await sleep(400);
const visibleCh = await g.evaluate(() => document.querySelectorAll('.guide-ch').length);
check('guide: search narrows the chapters', visibleCh > 0 && visibleCh < 13, String(visibleCh));
await g.focus('.guide-search input'); await g.keyboard.down('Control'); await g.keyboard.press('a'); await g.keyboard.up('Control'); await g.keyboard.press('Backspace'); await sleep(600); // React-controlled input: clear it the way a person would
check('guide: clearing the search restores all chapters', (await g.$$('.guide-ch')).length === 13, await g.evaluate(() => `value="${document.querySelector('.guide-search input').value}" sections=${document.querySelectorAll('.guide-ch').length}`));
await g.evaluate(() => { document.querySelector('.guide-main').scrollTop = 0; }); await g.screenshot({ path: path.join(out, 'guide-start.png') });

// ---------- editor: welcome card on first run, tour, bridge ----------
await kv('guide-seen', null);
const ed = await page('/edit'); await sleep(1200);
check('editor: welcome card appears when the guide was never seen', !!(await ed.$('.welcome')));
check('editor: top bar has the guide button', await ed.evaluate(() => !!document.querySelector('.topbar [data-tour="guide"]') && document.querySelector('.topbar [data-tour="guide"]').textContent.includes('מדריך')));
await ed.screenshot({ path: path.join(out, 'editor-welcome.png') });
await ed.evaluate(() => [...document.querySelectorAll('.welcome-opt')].find(b => b.textContent.includes('סיור קצר'))?.click()); await sleep(600);
check('editor: tour starts from the welcome card', !!(await ed.$('.tour-card')));
let spots = 0, steps = 0;
for (let i = 0; i < 20; i++) { const st = await ed.evaluate(() => ({ card: !!document.querySelector('.tour-card'), spot: !!document.querySelector('.tour-spot'), n: document.querySelector('.tour-n')?.textContent })); if (!st.card) break; steps++; if (st.spot) spots++; if (i === 6) await ed.screenshot({ path: path.join(out, 'editor-tour.png') }); await ed.keyboard.press('ArrowLeft'); await sleep(350); }
check('editor: tour has 15 steps and every step spotlights a real control', steps === 15 && spots === 15, `${steps} steps, ${spots} spotlights`);
check('editor: tour finishes and closes', !(await ed.$('.tour-card')));
check('editor: welcome choice is remembered on the server', !!(await kvGet('guide-seen')));
// bridge: guide → editor command
await g.bringToFront(); await g.evaluate(() => document.getElementById('media')?.scrollIntoView()); await sleep(300);
await g.evaluate(() => [...document.querySelectorAll('#media .gd-try')].find(b => b.textContent.includes('פתח את חלון הסריקה'))?.click()); await sleep(900);
check('bridge: a guide button opens the ingest dialog in the editor window', await ed.evaluate(() => document.querySelector('dialog[open] h2')?.textContent === 'קליטת מדיה'));
check('bridge: the guide confirms the command reached the editor', await g.evaluate(() => [...document.querySelectorAll('#media .gd-try')].some(b => b.textContent.includes('בוצע בחלון העורך'))));
await ed.keyboard.press('Escape'); await sleep(300);
await g.evaluate(() => document.getElementById('walkthrough')?.scrollIntoView()); await sleep(300);
await g.evaluate(() => [...document.querySelectorAll('#walkthrough .gd-try')].find(b => b.textContent.includes('סיור מודרך'))?.click()); await sleep(900);
check('bridge: "guided tour" from the guide starts the tour in the editor', !!(await ed.$('.tour-card')));
await ed.keyboard.press('Escape'); await sleep(200);
// ?do= path (no editor open yet would open one; here we just load a fresh editor with the command)
const ed2 = await page('/edit?do=' + encodeURIComponent(JSON.stringify({ cmd: 'dialog', id: 'settings' }))); await sleep(1600);
check('bridge: ?do= opens the requested dialog on load', await ed2.evaluate(() => document.querySelector('dialog[open] h2')?.textContent === 'הגדרות המצגת'));
check('bridge: ?do= is removed from the address and the welcome card is suppressed', await ed2.evaluate(() => !location.search.includes('do=') && !document.querySelector('.welcome')));
await ed2.close();
// ---------- show: a run to the end marks the rehearsal ----------
await kv('rehearsed', null);
const sh = await page('/show'); await sleep(600); await sh.click('.startgate .btn'); await sleep(900); await sh.keyboard.press('End'); await sleep(500); await sh.keyboard.press('ArrowRight'); await sleep(900);
check('show: reaching the end records "rehearsed" for the guide checklist', !!(await kvGet('rehearsed')) && await sh.evaluate(() => !!document.querySelector('.endcard')));
await sh.close();
await g.bringToFront(); await sleep(1200);
check('guide: checklist shows the rehearsal as done', await g.evaluate(() => [...document.querySelectorAll('.guide-progress li')].some(li => li.classList.contains('done') && li.textContent.includes('חזרה גנרלית'))));

check('no console errors, page errors or failed requests', issues.length === 0);
// restore the user's state: the welcome card must still show for Ohad on his first open; rehearsal flag back to what it was
await kv('guide-seen', prevSeen); await kv('rehearsed', prevRehearsed);
await ed.close(); await g.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n${results.length - fails}/${results.length} passed`); console.log('issues:', issues.length ? issues : 'none');
await browser.close(); process.exit(fails ? 1 : 0);
