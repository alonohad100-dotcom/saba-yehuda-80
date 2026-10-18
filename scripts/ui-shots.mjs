// Screenshots of every page and major state of the app, optionally with a CSS override injected (to preview a theme proposal).
// Usage: node scripts/ui-shots.mjs <outDir> [override.css|''] [width height] [light|dark]      (server on :4000)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const [out = '.audit/shots', cssFile, W = '1920', H = '1080'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const css = cssFile ? fs.readFileSync(cssFile, 'utf8') : '';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const base = 'http://127.0.0.1:4000'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const kvGet = async (k) => fetch(`${base}/api/kv/${k}`).then(r => r.json()).then(r => (r.value ? JSON.parse(r.value) : null));
const kv = async (k, v) => fetch(`${base}/api/kv/${k}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
const prevSeen = await kvGet('guide-seen'); const chrome = process.argv[6]; const prevChrome = await kvGet('chrome-theme'); if (chrome) await kv('chrome-theme', chrome);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const open = async (url) => { const p = await browser.newPage(); await p.setViewport({ width: +W, height: +H }); await p.goto(base + url, { waitUntil: 'load' }); await sleep(900); if (css) await p.addStyleTag({ content: css }); await sleep(700); return p; };
const shot = (p, name) => p.screenshot({ path: path.join(out, name + '.png') });
const click = async (p, text, sel = 'button') => p.evaluate((t, s) => { const b = [...document.querySelectorAll(s)].find(x => x.textContent.trim().includes(t) && !x.disabled); if (b) { b.click(); return true; } return false; }, text, sel);

await kv('guide-seen', null);
let p = await open('/edit'); await shot(p, '01-editor-welcome'); await p.close();
await kv('guide-seen', { at: 'shots' });
p = await open('/edit'); await shot(p, '02-editor-empty');
await p.evaluate(() => [...document.querySelectorAll('.topbar .btn')].find(b => b.querySelector('svg.lucide-palette'))?.click()); await sleep(300); await shot(p, '03-editor-theme-popover'); await p.evaluate(() => document.querySelector('.theme-pop')?.parentElement?.querySelector('div[style*="fixed"]')?.click()); await sleep(200); await p.evaluate(() => document.querySelector('.slides .slide')?.click()); await sleep(300);
await click(p, 'טקסט', '.preview-tools .btn'); await sleep(300); await shot(p, '04-editor-add-text-menu'); await p.evaluate(() => document.querySelector('.addmenu')?.parentElement?.querySelector('div[style*="fixed"]')?.click()); await sleep(200);
await click(p, 'סמל', '.preview-tools .btn'); await sleep(300); await shot(p, '05-editor-symbol-picker'); await p.evaluate(() => document.querySelector('.addmenu')?.parentElement?.querySelector('div[style*="fixed"]')?.click()); await sleep(200);
await click(p, 'כותרת גדולה', '.menu button'); await p.evaluate(() => document.querySelector('.addslide')?.click()); await sleep(300); await shot(p, '06-editor-add-slide-menu'); await p.keyboard.press('Escape'); await sleep(200); await p.evaluate(() => document.querySelector('.slide[data-type="photo"]')?.click()); await sleep(300); await shot(p, '06b-editor-slide-inspector');
await p.evaluate(() => document.querySelector('.ch-head')?.click()); await sleep(300); await shot(p, '07-editor-chapter-inspector');
await p.close();
for (const [id, name] of [['settings', '08-dialog-settings'], ['versions', '09-dialog-versions'], ['ingest', '10-dialog-ingest'], ['help', '11-dialog-help'], ['auto', '12-wizard-auto']]) { p = await open('/edit?do=' + encodeURIComponent(JSON.stringify({ cmd: 'dialog', id }))); await sleep(900); await shot(p, name); await p.close(); }
p = await open('/edit?do=' + encodeURIComponent(JSON.stringify({ cmd: 'tour', step: 8 }))); await sleep(900); await shot(p, '13-editor-tour'); await p.close();
p = await open('/guide'); await shot(p, '14-guide-top'); await p.evaluate(() => document.getElementById('design')?.scrollIntoView()); await sleep(900); await shot(p, '15-guide-design'); await p.close();
p = await open('/show'); await shot(p, '16-show-gate'); await p.click('.startgate .btn'); await sleep(1200); await p.mouse.move(900, 900); await sleep(200); await shot(p, '17-show-hud'); await p.close();
p = await open('/presenter'); await shot(p, '18-presenter'); await p.close();
await kv('guide-seen', prevSeen); await kv('chrome-theme', prevChrome);
await browser.close(); console.log('shots written to', out);
