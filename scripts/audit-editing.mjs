// Headless audit of the advanced editing tools: overlays (text, symbol, emoji, shape, image), drag/resize/rotate, animation,
// layers, keyboard, look filters, frame, caption style, new transitions — verified in the editor DOM, on the server, and in the show.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2] || 'audit-editing'; fs.mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const base = 'http://127.0.0.1:4000'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let fails = 0; const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) fails++; };
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const issues = []; const p = await browser.newPage(); await p.setViewport({ width: 1920, height: 1080 });
p.on('pageerror', e => issues.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') issues.push('console: ' + m.text()); }); p.on('response', r => { if (r.status() >= 400 && !/ingest\/events/.test(r.url())) issues.push(`HTTP ${r.status()} ${r.url()}`); });
const click = async (text, sel = 'button') => p.evaluate((t, s) => { const b = [...document.querySelectorAll(s)].find(x => x.textContent.trim().includes(t) && !x.disabled); if (b) { b.click(); return true; } return false; }, text, sel);
const serverSlide = async (id) => (await fetch(base + '/api/show').then(r => r.json())).chapters.flatMap(c => c.slides).find(s => s.id === id);
const stageBox = () => p.$('.stage').then(h => h.boundingBox());

// start from a clean slide: strip overlays/look/frame/captionStyle left by a previous run
{ const show = await fetch(base + '/api/show').then(r => r.json()); for (const c of show.chapters) for (const s of c.slides) if (s.type === 'photo') { delete s.overlays; delete s.look; delete s.frame; delete s.captionStyle; delete s.transition; } await fetch(base + '/api/show', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(show) }); }
await p.goto(base + '/edit', { waitUntil: 'networkidle0' }); await sleep(900);
// select a photo slide
const sid = await p.evaluate(() => { const s = document.querySelector('.slide[data-type="photo"]'); s?.click(); return s?.dataset.id; }); await sleep(400);
check('photo slide selected and add-toolbar visible', !!sid && await p.evaluate(() => [...document.querySelectorAll('.preview-tools .btn')].some(b => b.textContent.includes('טקסט'))));
// --- add text ---
await click('טקסט', '.preview-tools .btn'); await sleep(200); await click('כותרת גדולה', '.menu button'); await sleep(600);
let s = await serverSlide(sid).then(x => x) ; await sleep(1000); s = await serverSlide(sid);
const textOv = s.overlays?.find(o => o.kind === 'text'); check('text overlay saved to server with preset values', !!textOv && textOv.size === 7 && textOv.font === 'display', JSON.stringify(textOv && { x: textOv.x, y: textOv.y, w: textOv.w, size: textOv.size }));
check('overlay rendered in preview with handles', await p.evaluate(() => !!document.querySelector('.stage .ov-text') && !!document.querySelector('.ov-handles') && !!document.querySelector('.ov-handles .h.se')));
check('overlay inspector opened (layer title)', await p.evaluate(() => /טקסט/.test(document.querySelector('.insp-title .ty')?.textContent || '') && !!document.querySelector('.insp textarea')));
// edit the text through the inspector
await p.evaluate(() => { const ta = document.querySelector('.insp textarea'); ta.focus(); ta.select(); }); await p.keyboard.type('שמונים שנה של אהבה'); await sleep(1300);
s = await serverSlide(sid); check('text content edit persists and renders', s.overlays.find(o => o.kind === 'text').text === 'שמונים שנה של אהבה' && (await p.evaluate(() => document.querySelector('.stage .ov-text .tx')?.textContent)) === 'שמונים שנה של אהבה');
// --- drag the overlay with the mouse ---
const before = s.overlays.find(o => o.kind === 'text'); const sb = await stageBox(); const hb = await (await p.$('.ov-handles')).boundingBox();
await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.mouse.move(hb.x + hb.width / 2 - sb.width * 0.15, hb.y + hb.height / 2 + sb.height * 0.2, { steps: 12 }); await p.mouse.up(); await sleep(1300);
s = await serverSlide(sid); const afterMove = s.overlays.find(o => o.kind === 'text');
check('mouse drag moves the overlay (x,y persisted)', Math.abs(afterMove.x - (before.x - 15)) < 3 && Math.abs(afterMove.y - (before.y + 20)) < 3, `${before.x},${before.y} → ${afterMove.x},${afterMove.y}`);
// --- resize via the corner handle ---
const se = await (await p.$('.ov-handles .h.se')).boundingBox(); await p.mouse.move(se.x + 6, se.y + 6); await p.mouse.down(); await p.mouse.move(se.x + 6 - sb.width * 0.2, se.y + 6, { steps: 10 }); await p.mouse.up(); await sleep(1300);
s = await serverSlide(sid); const afterResize = s.overlays.find(o => o.kind === 'text'); check('corner handle resizes (w persisted)', Math.abs(afterResize.w - (afterMove.w - 20)) < 3, `${afterMove.w} → ${afterResize.w}`);
// --- rotate via the top handle ---
const rot = await (await p.$('.ov-handles .h.rot')).boundingBox(); const hb2 = await (await p.$('.ov-handles')).boundingBox(); const cx = hb2.x + hb2.width / 2, cy = hb2.y + hb2.height / 2;
await p.mouse.move(rot.x + 6, rot.y + 6); await p.mouse.down(); await p.mouse.move(cx + 200, cy - 200, { steps: 10 }); await p.mouse.up(); await sleep(1300);
s = await serverSlide(sid); const afterRot = s.overlays.find(o => o.kind === 'text'); check('rotate handle sets rotation (snaps near 45°)', Math.abs(afterRot.rotate - 45) < 8, `${afterRot.rotate}°`);
await click('יישר'); await sleep(300);
// --- animation controls ---
await p.evaluate(() => [...document.querySelectorAll('.insp .seg button')].find(b => b.textContent === 'קפיצה')?.click()); await p.evaluate(() => [...document.querySelectorAll('.insp .seg button')].find(b => b.textContent === 'פעימה')?.click()); await sleep(1300);
s = await serverSlide(sid); const an = s.overlays.find(o => o.kind === 'text').anim; check('animation in/loop persist', an && an.in === 'pop' && an.loop === 'pulse', JSON.stringify(an));
// --- keyboard: nudge, duplicate, delete the duplicate ---
await p.evaluate(() => document.activeElement?.blur()); // leave the textarea, as a mouse user would, so keys act on the overlay
const n0 = s.overlays.length; await p.keyboard.press('ArrowLeft'); await sleep(300); await p.keyboard.down('Shift'); await p.keyboard.press('ArrowDown'); await p.keyboard.up('Shift'); await sleep(1300);
s = await serverSlide(sid); const nud = s.overlays.find(o => o.kind === 'text'); check('arrow keys nudge the overlay (1% and Shift 5%)', Math.abs(nud.x - (afterResize.x - 1)) < 0.6 && Math.abs(nud.y - (afterMove.y + 5)) < 0.6, `${nud.x},${nud.y}`);
await p.keyboard.down('Control'); await p.keyboard.press('d'); await p.keyboard.up('Control'); await sleep(1300); s = await serverSlide(sid); check('Ctrl+D duplicates the overlay (not the slide)', s.overlays.length === n0 + 1);
const slidesN = await p.evaluate(() => document.querySelectorAll('.slide').length); await p.keyboard.press('Delete'); await sleep(1300); s = await serverSlide(sid);
check('Delete removes the selected overlay, not the slide', s.overlays.length === n0 && n0 >= 1 && (await p.evaluate(() => document.querySelectorAll('.slide').length)) === slidesN && !(await p.evaluate(() => !!document.querySelector('.ov-handles'))));
// --- symbol, emoji, shape, image ---
await click('סמל', '.preview-tools .btn'); await sleep(300); check('symbol picker shows groups and icons', await p.evaluate(() => document.querySelectorAll('.sym-tabs button').length >= 6 && document.querySelectorAll('.sym-grid button svg').length > 5));
await p.evaluate(() => document.querySelector('.sym-grid button')?.click()); await sleep(1300); s = await serverSlide(sid); check('symbol overlay added and rendered as inline SVG', s.overlays.some(o => o.kind === 'symbol') && await p.evaluate(() => !!document.querySelector('.stage .ov-symbol svg path')));
await click('סמל', '.preview-tools .btn'); await sleep(200); await click('אימוג׳י', '.sym-tabs button'); await sleep(200); await p.evaluate(() => document.querySelector('.sym-grid button')?.click()); await sleep(1300); s = await serverSlide(sid); check('emoji overlay added', s.overlays.some(o => o.kind === 'emoji'));
await click('צורה', '.preview-tools .btn'); await sleep(200); await click('מסגרת זהב', '.menu button'); await sleep(1300); s = await serverSlide(sid); check('shape (frame) overlay added', s.overlays.some(o => o.kind === 'shape' && o.shape === 'frame'));
await p.evaluate(() => document.querySelector('.asset')?.click()); await sleep(200); await click('תמונה', '.preview-tools .btn'); await sleep(1300); s = await serverSlide(sid); check('image sticker overlay added from library selection', s.overlays.some(o => o.kind === 'image') && await p.evaluate(() => !!document.querySelector('.stage .ov-image img')));
// --- layers panel ---
await p.evaluate(() => document.querySelector('.stage')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }))); await sleep(200);
await p.evaluate(() => document.querySelector('.slide[data-type="photo"]')?.click()); await sleep(400);
const layers = await p.evaluate(() => document.querySelectorAll('.layers .layer-row').length); check('layers panel lists all overlays', layers === s.overlays.length, `${layers} rows / ${s.overlays.length} overlays`);
await p.evaluate(() => document.querySelectorAll('.layers .layer-row')[1]?.click()); await sleep(300); check('clicking a layer selects it (handles + inspector)', await p.evaluate(() => !!document.querySelector('.ov-handles') && !!document.querySelector('.insp-title .ty')));
await p.keyboard.press('Escape'); await sleep(200);
// --- look / frame / caption ---
await click('ארכיון', '.chip'); await sleep(1300); s = await serverSlide(sid); check('look preset persists (sepia)', s.look?.filter === 'sepia' && s.look.vignette === 0.75, JSON.stringify(s.look));
check('look filter applied in the preview DOM', await p.evaluate(() => /sepia/.test(document.querySelector('.stage .sl')?.style.getPropertyValue('--media-filter') || '')));
await p.evaluate(() => [...document.querySelectorAll('.insp .seg button')].find(b => b.textContent === '90°')?.click()); await sleep(1300); s = await serverSlide(sid); check('frame rotate 90° persists and renders', s.frame?.rotate === 90 && await p.evaluate(() => /rotate\(90deg\)/.test(document.querySelector('.stage .imgwrap')?.style.transform || '')));
await p.evaluate(() => [...document.querySelectorAll('.insp .seg button')].find(b => b.textContent === '0°')?.click());
await p.evaluate(() => [...document.querySelectorAll('.insp .seg button')].find(b => b.textContent === 'מילה־מילה')?.click()); await p.evaluate(() => [...document.querySelectorAll('.insp .seg button')].find(b => b.textContent === 'למעלה')?.click()); await sleep(1300); s = await serverSlide(sid);
check('caption style (words, top) persists and renders', s.captionStyle?.anim === 'words' && s.captionStyle.position === 'top' && await p.evaluate(() => document.querySelector('.stage .sl')?.classList.contains('cap-top')));
// --- transitions: wipe + blur selectable ---
await p.evaluate(() => [...document.querySelectorAll('.insp .seg button')].find(b => b.textContent === 'מחיקה')?.click()); await sleep(1300); s = await serverSlide(sid); check('wipe transition selectable and persisted', s.transition === 'wipe');
await p.screenshot({ path: path.join(out, 'editor-composed.png') });
// --- show: the composed slide renders overlays, filter, and plays with the wipe transition ---
const sh = await browser.newPage(); await sh.setViewport({ width: 1920, height: 1080 }); sh.on('pageerror', e => issues.push('show pageerror: ' + e.message));
const all = (await fetch(base + '/api/show').then(r => r.json())).chapters.flatMap(c => c.slides); const prevId = all[all.findIndex(x => x.id === sid) - 1]?.id ?? sid;
await sh.goto(`${base}/show?from=${prevId}`, { waitUntil: 'networkidle0' }); await sh.click('.startgate .btn'); await sleep(1200); await sh.keyboard.press('ArrowRight'); await sleep(2600);
const showState = await sh.evaluate(() => { const sl = document.querySelector('.layer[style*="z-index: 2"] .sl'); return { ov: sl?.querySelectorAll('.ov').length, filter: sl?.style.getPropertyValue('--media-filter'), capTop: sl?.classList.contains('cap-top'), textVisible: (() => { const t = sl?.querySelector('.ov-text'); return t ? parseFloat(getComputedStyle(t).opacity) > 0.5 : false; })() }; });
check('show renders overlays, filter and caption style on the composed slide', showState.ov >= 4 && /sepia/.test(showState.filter || '') && showState.capTop && showState.textVisible, JSON.stringify(showState));
await sh.screenshot({ path: path.join(out, 'show-composed.png') });
await sh.keyboard.press('ArrowLeft'); await sleep(800); await sh.evaluate(() => {}); await sh.keyboard.press('ArrowRight'); await sleep(400); await sh.screenshot({ path: path.join(out, 'show-wipe-mid.png') }); await sleep(1500);
check('wipe transition completed (clip-path cleared)', await sh.evaluate(() => { const l = document.querySelector('.layer[style*="z-index: 2"]'); return !l.style.clipPath || l.style.clipPath === 'none' || l.style.clipPath === ''; }));
await sh.close();
// cleanup: strip the test composition again so other audits and the demo show start clean (a labelled version keeps it)
{ const show = await fetch(base + '/api/show').then(r => r.json()); await fetch(base + '/api/show?label=' + encodeURIComponent('audit-editing composed slide'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(show) }); for (const c of show.chapters) for (const s of c.slides) if (s.type === 'photo') { delete s.overlays; delete s.look; delete s.frame; delete s.captionStyle; delete s.transition; } await fetch(base + '/api/show', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(show) }); }
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n${results.length - fails}/${results.length} passed`); console.log('issues:', issues.length ? issues : 'none');
await browser.close(); process.exit(fails ? 1 : 0);
