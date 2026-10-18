// Headless audit of colour themes: editor picker → settings persisted → preview re-themed; chapter and slide overrides; show T key,
// HUD button, presenter theme buttons, live override and reset; confetti palette; screenshots of every theme on one slide.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2] || 'audit-theme'; fs.mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const base = 'http://127.0.0.1:4000'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let fails = 0; const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) fails++; };
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const __kv = (k, v) => fetch('http://127.0.0.1:4000/api/kv/' + k, v === undefined ? undefined : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }).then(r => r.json()); const __seenPrev = await __kv('guide-seen').then(r => (r.value ? JSON.parse(r.value) : null)); await __kv('guide-seen', { at: 'audit' }); // the first-run welcome card would cover the editor during mouse-driven checks
const issues = []; const page = async (url, w = 1920, h = 1080) => { const p = await browser.newPage(); await p.setViewport({ width: w, height: h }); p.on('pageerror', e => issues.push(`[${url}] ${e.message}`)); p.on('console', m => { if (m.type() === 'error') issues.push(`[${url}] console: ${m.text()}`); }); p.on('response', r => { if (r.status() >= 400 && !/ingest\/events/.test(r.url())) issues.push(`[${url}] HTTP ${r.status()} ${r.url()}`); }); await p.goto(base + url, { waitUntil: 'networkidle0' }); return p; };
const click = async (p, text, sel = 'button') => p.evaluate((t, s) => { const b = [...document.querySelectorAll(s)].find(x => x.textContent.trim().includes(t) && !x.disabled); if (b) { b.click(); return true; } return false; }, text, sel);
const server = () => fetch(base + '/api/show').then(r => r.json());
const THEMES = ['midnight-gold', 'navy-rosegold', 'ivory-classic', 'cinema', 'vintage', 'emerald-copper', 'burgundy', 'sea', 'modern', 'pastel', 'monochrome'];
// reset to the default theme
{ const s = await server(); s.settings.theme = 'midnight-gold'; for (const c of s.chapters) { delete c.theme; for (const sl of c.slides) delete sl.theme; } await fetch(base + '/api/show', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }); }

// ---- editor ----
const ed = await page('/edit'); await sleep(900);
check('theme CSS injected with all themes', await ed.evaluate((n) => { const css = document.getElementById('themes')?.textContent || ''; return n.every(id => css.includes(`[data-theme="${id}"]`)); }, THEMES));
check('top bar shows the current theme', await ed.evaluate(() => /לילה וזהב/.test(document.querySelector('.topbar')?.textContent || '')));
await ed.evaluate(() => document.querySelector('.slide[data-type="intro"], .slide[data-type="photo"]')?.click()); await sleep(300);
const colorBefore = await ed.evaluate(() => { const el = document.querySelector('.stage .sl'); return getComputedStyle(el).backgroundColor + '|' + getComputedStyle(el).fontFamily; });
await ed.evaluate(() => [...document.querySelectorAll('.topbar .btn')].find(b => b.querySelector('svg.lucide-palette'))?.click()); await sleep(300);
check('theme picker opens with 11 cards', (await ed.evaluate(() => document.querySelectorAll('.theme-pop .theme-card').length)) === 11);
await ed.evaluate(() => [...document.querySelectorAll('.theme-pop .theme-card')].find(c => c.textContent.includes('שנהב קלאסי'))?.click()); await sleep(1400);
const s1 = await server(); check('choosing a theme persists settings.theme', s1.settings.theme === 'ivory-classic', s1.settings.theme);
check('preview stage carries the new theme and re-colours', await ed.evaluate(() => document.querySelector('.stage')?.dataset.theme === 'ivory-classic') && (await ed.evaluate(() => { const el = document.querySelector('.stage .sl'); return getComputedStyle(el).backgroundColor + '|' + getComputedStyle(el).fontFamily; })) !== colorBefore);
await ed.screenshot({ path: path.join(out, 'editor-ivory.png') });
// chapter override
await ed.evaluate(() => document.querySelector('.theme-pop')?.parentElement?.querySelector('div[style*="fixed"]')?.click()); await sleep(200);
await ed.evaluate(() => document.querySelectorAll('.ch-head')[1]?.click()); await sleep(400);
await ed.evaluate(() => [...document.querySelectorAll('.insp .theme-card')].find(c => c.textContent.includes('בורדו'))?.click()); await sleep(1400);
const s2 = await server(); check('chapter theme override persists', s2.chapters[1].theme === 'burgundy', s2.chapters[1].theme);
await ed.evaluate(() => document.querySelectorAll('.ch-head')[1]?.parentElement.querySelector('.slide')?.click()); await sleep(400);
check('preview resolves the chapter override for its slides', await ed.evaluate(() => document.querySelector('.stage')?.dataset.theme === 'burgundy'));
// slide override via select
await ed.evaluate(() => { const sel = [...document.querySelectorAll('.insp select')].find(s => [...s.options].some(o => o.value === 'modern')); if (sel) { sel.value = 'modern'; sel.dispatchEvent(new Event('change', { bubbles: true })); } }); await sleep(1400);
const s3 = await server(); const slideThemed = s3.chapters[1].slides[0]; check('slide theme override persists and wins over the chapter', slideThemed.theme === 'modern' && await ed.evaluate(() => document.querySelector('.stage')?.dataset.theme === 'modern'));
await ed.evaluate(() => { const sel = [...document.querySelectorAll('.insp select')].find(s => [...s.options].some(o => o.value === 'modern')); if (sel) { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); } }); await sleep(800);
// settings dialog has the grid too
await ed.evaluate(() => [...document.querySelectorAll('.topbar .btn')].find(b => b.querySelector('svg.lucide-settings'))?.click()); await sleep(400);
check('settings dialog shows the theme grid', (await ed.evaluate(() => document.querySelectorAll('dialog .theme-card').length)) === 11); await ed.keyboard.press('Escape'); await sleep(300);
// overlay with auto colour follows the theme
await ed.evaluate(() => document.querySelector('.slide[data-type="photo"]')?.click()); await sleep(300);
await click(ed, 'טקסט', '.preview-tools .btn'); await sleep(200); await click(ed, 'כותרת גדולה', '.menu button'); await sleep(800);
const autoColorIvory = await ed.evaluate(() => getComputedStyle(document.querySelector('.stage .ov-text')).color);
check('auto-colour text overlay uses the theme on-media colour', await ed.evaluate(() => document.querySelector('.stage .ov-text')?.classList.contains('color-auto')) && !!autoColorIvory);
// remove the test overlay while it is selected (never Escape+Delete, which would delete the slide)
const ovBefore = await ed.evaluate(() => document.querySelectorAll('.stage .ov').length); await ed.evaluate(() => document.activeElement?.blur()); await ed.keyboard.press('Delete'); await sleep(800);
check('test overlay removed again (slide intact)', (await ed.evaluate(() => document.querySelectorAll('.stage .ov').length)) === ovBefore - 1 && await ed.evaluate(() => !!document.querySelector('.slide.sel')));

// ---- show: live switching ----
const sh = await page('/show'); await sleep(600);
check('start gate is themed (ivory)', await sh.evaluate(() => document.querySelector('.showpage')?.dataset.theme === 'ivory-classic'));
await sh.click('.startgate .btn'); await sleep(1500);
const themeOf = () => sh.evaluate(() => document.querySelector('.player')?.dataset.theme);
check('player starts with the show theme', (await themeOf()) === 'ivory-classic', await themeOf());
await sh.keyboard.press('t'); await sleep(1200); const t1 = await themeOf(); check('T key switches to the next theme live', t1 === 'cinema', t1);
await sh.screenshot({ path: path.join(out, 'show-live-cinema.png') });
await sh.keyboard.down('Shift'); await sh.keyboard.press('T'); await sh.keyboard.up('Shift'); await sleep(1200); check('Shift+T goes back', (await themeOf()) === 'ivory-classic');
await sh.evaluate(() => [...document.querySelectorAll('.hud .btn')].find(b => b.querySelector('svg.lucide-palette'))?.click()); await sleep(1200); check('HUD palette button cycles the theme', (await themeOf()) === 'cinema');
check('HUD shows the live theme name with the "temporary" marker', await sh.evaluate(() => /קולנועי/.test(document.querySelector('.hud')?.textContent || '') && /זמני/.test(document.querySelector('.hud')?.textContent || '')));
await sh.keyboard.press('ArrowRight'); await sleep(1200); check('live override survives a slide change (chapter override ignored while live)', (await themeOf()) === 'cinema');
await sh.keyboard.press('0'); await sleep(1200); check('0 resets the live override; the chapter override (burgundy) now applies', (await themeOf()) === 'burgundy' || (await themeOf()) === 'ivory-classic', await themeOf());
check('confetti palette var resolves from the theme', await sh.evaluate(() => (getComputedStyle(document.querySelector('.player')).getPropertyValue('--t-confetti') || '').split(',').length >= 4));
// ---- presenter controls the show theme ----
const pr = await page('/presenter', 1500, 900); await sleep(900);
check('presenter lists all theme buttons', (await pr.evaluate(() => [...document.querySelectorAll('.pr-top .btn')].filter(b => b.querySelector('.theme-mini')).length)) === 11);
await pr.evaluate(() => [...document.querySelectorAll('.pr-top .btn')].find(b => b.textContent.includes('ים'))?.click()); await sleep(1500);
check('presenter theme button switches the show live', (await themeOf()) === 'sea', await themeOf());
check('presenter stage mirrors the live theme', await pr.evaluate(() => document.querySelector('.pr-stage')?.dataset.theme === 'sea'));
await click(pr, 'חזרה לערכת המצגת'); await sleep(1200); check('presenter reset returns to the show theme', (await themeOf()) !== 'sea');
await pr.close();
// ---- screenshots of every theme on the intro slide ----
const show = await server(); const introId = show.chapters.flatMap(c => c.slides).find(s => s.type === 'intro')?.id;
for (const id of THEMES) { await sh.goto(`${base}/show?from=${introId}`, { waitUntil: 'networkidle0' }); await sh.evaluate((t) => { const sel = document.querySelector('select[aria-label="theme"]'); sel.value = t; sel.dispatchEvent(new Event('change', { bubbles: true })); }, id); await sh.click('.startgate .btn'); await sleep(2500); await sh.screenshot({ path: path.join(out, `theme-${id}.png`) }); }
check('every theme renders the intro without errors', issues.length === 0);
await sh.close(); await ed.close();
// restore default theme for the demo show
{ const s = await server(); s.settings.theme = 'midnight-gold'; for (const c of s.chapters) { delete c.theme; for (const sl of c.slides) delete sl.theme; } await fetch(base + '/api/show', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }); }
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n${results.length - fails}/${results.length} passed`); console.log('issues:', issues.length ? issues : 'none');
await __kv('guide-seen', __seenPrev); await browser.close(); process.exit(fails ? 1 : 0);
