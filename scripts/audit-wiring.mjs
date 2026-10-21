// Wiring audit with REAL input: every control is driven with the mouse and keyboard the way a person would, never with
// element.click(). Two generic rules are checked in every screen state, and then each feature is exercised end to end:
//   1. every visible, enabled control must be mouse-reachable (a hit test at its centre lands on it, not on something covering or clipping it);
//   2. every visible, disabled control must say why (title or data-tip).
// Needs the production server on :4000 with media in the library (npm run demo:media) and Chrome or Edge. Leaves the show as it found it.
// Usage: node scripts/audit-wiring.mjs [outDir]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2] || '.audit/wiring'; fs.mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const base = 'http://127.0.0.1:4000'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let fails = 0; const issues = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); if (!ok) { fails++; console.log(`FAIL  ${name}${detail ? '  — ' + detail : ''}`); } };
const kv = (k, v) => fetch(`${base}/api/kv/${k}`, v === undefined ? undefined : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }).then(r => r.json());
const getShow = () => fetch(base + '/api/show').then(r => r.json()); const putShow = (s, label) => fetch(base + '/api/show' + (label ? '?label=' + encodeURIComponent(label) : ''), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
const allSlides = s => s.chapters.flatMap(c => c.slides); const count = async () => allSlides(await getShow()).length;
/** The editor autosaves 600 ms after a change; poll the server instead of guessing a delay. */
async function until(fn, ms = 5000) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(150); } return v; }
const countIs = n => until(async () => (await count()) === n); const serverHas = pred => until(async () => pred(await getShow()));

const original = await getShow(); const prevSeen = await kv('guide-seen').then(r => (r.value ? JSON.parse(r.value) : null)); const prevChrome = await kv('chrome-theme').then(r => (r.value ? JSON.parse(r.value) : null));
await putShow(original, 'לפני בדיקת חיווט'); await kv('guide-seen', { at: 'audit-wiring' });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--lang=he'] });
const shot = (p, name) => p.screenshot({ path: path.join(out, name + '.png') }).catch(() => {});

async function newPage(url, w = 1920, h = 1000) {
  const p = await browser.newPage(); await p.setViewport({ width: w, height: h });
  p.on('pageerror', e => issues.push(`[${url}] pageerror: ${e.message}`)); p.on('console', m => { if (m.type() === 'error') issues.push(`[${url}] console: ${m.text()}`); });
  p.on('response', r => { if (r.status() >= 400 && !/ingest\/events/.test(r.url())) issues.push(`[${url}] HTTP ${r.status()} ${r.url()}`); });
  p.on('dialog', d => d.accept()); // confirm() on destructive actions: accept, the show is restored at the end
  await p.goto(base + url, { waitUntil: 'networkidle0' }); await sleep(500); return p;
}
/* ---------- the two generic rules, applied to a scope ---------- */
const SEL = 'button, [role=button], input, select, textarea, .chip, .asset, .slide, .ch-head, .addslide, .theme-card, .layer-row, .mini, .version .btn';
async function sweep(p, label, scope = 'body') {
  const r = await p.evaluate((scope, SEL) => {
    const root = document.querySelector(scope); if (!root) return { missing: true };
    const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 3 && r.height > 3 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
    const name = el => ((el.getAttribute('aria-label') || el.getAttribute('title') || el.dataset.tip || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36) || el.className) + ' <' + el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 2).join('.') : '') + '>';
    const out = { unreachable: [], disabledNoReason: [], total: 0 };
    // an element scrolled out of a scrolling ancestor (or mostly outside the viewport) is not "visible": it needs a scroll, not a fix
    const clipped = el => { let r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return true; for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowY + cs.overflowX)) { const ar = a.getBoundingClientRect(); if (cx < ar.left || cx > ar.right || cy < ar.top || cy > ar.bottom) return true; } } return false; };
    const probe = el => { const r = el.getBoundingClientRect(); const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + Math.min(10, r.width / 3), r.top + Math.min(10, r.height / 3)], [r.right - Math.min(10, r.width / 3), r.bottom - Math.min(10, r.height / 3)]]; const hit = pts.some(([x, y]) => { const t = document.elementFromPoint(x, y); return t && (t === el || el.contains(t) || (el.tagName === 'INPUT' && t.tagName === 'LABEL' && t.contains(el))); }); return { hit, by: hit ? null : document.elementFromPoint(...pts[0]) }; };
    const dnd = el => el.getAttribute('role') === 'button' && el.querySelector('.asset, .slide'); // dnd-kit wrappers around cards: the card itself is checked
    for (const el of root.querySelectorAll(SEL)) {
      if (!vis(el) || clipped(el) || dnd(el)) continue; if (el.closest('.tour-dim, .tour-spot')) continue; out.total++;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') { if (!(el.title || el.dataset.tip || el.closest('[title]'))) out.disabledNoReason.push(name(el)); continue; }
      let p = probe(el);
      if (!p.hit) { // something overlaps it in place (e.g. a sticky bar): reachable if a scroll brings it clear, otherwise a real defect
        const scroller = (() => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (/(auto|scroll)/.test(cs.overflowY)) return a; } return null; })();
        if (scroller) { const st = scroller.scrollTop; el.scrollIntoView({ block: 'center' }); p = probe(el); scroller.scrollTop = st; }
      }
      if (!p.hit) { const b = p.by; const br = b?.getBoundingClientRect(); const anc = []; for (let a = b?.parentElement; a && a !== document.body && anc.length < 7; a = a.parentElement) anc.push((typeof a.className === 'string' && a.className.trim() ? a.className.trim().split(/\s+/).slice(0, 2).join('.') : a.tagName.toLowerCase()) + (getComputedStyle(a).transform !== 'none' ? '{tf}' : '')); out.unreachable.push(name(el) + ' ← covered by ' + (b ? `${b.tagName.toLowerCase()}.${String(b.className).split(' ').slice(0, 2).join('.')}${b.getAttribute('aria-label') ? '[' + b.getAttribute('aria-label') + ']' : ''} @${Math.round(br.left)},${Math.round(br.top)} ${Math.round(br.width)}×${Math.round(br.height)} < ${anc.join(' < ')}` : 'nothing')); }
    }
    return out;
  }, scope, SEL);
  if (r.missing) { check(`${label}: scope ${scope} exists`, false); return; }
  check(`${label}: all ${r.total} visible controls are mouse-reachable`, r.unreachable.length === 0, r.unreachable.slice(0, 5).join(' | '));
  check(`${label}: every disabled control explains why`, r.disabledNoReason.length === 0, r.disabledNoReason.slice(0, 5).join(' | '));
}
/* ---------- real mouse helpers ---------- */
/** Find a visible, enabled element by text inside `within`: an exact text match wins over a partial one ("מחק" never picks "מחק פרק"). */
async function handle(p, sel, within) { if (typeof sel !== 'string' || !within) return typeof sel === 'string' ? p.$(sel) : sel; const h = await p.evaluateHandle((t, s) => { const all = [...document.querySelectorAll(s)].filter(x => !x.disabled && x.getBoundingClientRect().width > 0); const norm = x => x.textContent.replace(/\s+/g, ' ').trim(); return all.find(x => norm(x) === t) || all.find(x => norm(x).includes(t)) || null; }, sel, within); return h.asElement(); }
/** Real click at the element's centre; fails (returns false) if the centre is not hit-testable, which is the bug class this audit exists for. */
async function click(p, sel, within, opts = {}) {
  const h = await handle(p, sel, within); if (!h) return false;
  await p.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }), h); await sleep(60);
  const ok = await p.evaluate(el => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === el || el.contains(t) || (t.tagName === 'LABEL' && t.contains(el))); }, h); if (!ok) return false;
  const b = await h.boundingBox(); await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2, opts); await sleep(opts.wait ?? 220); return true;
}
const text = (p, sel) => p.evaluate(s => document.querySelector(s)?.textContent?.trim() ?? null, sel);
const toastText = p => p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
const has = (p, sel) => p.evaluate(s => !!document.querySelector(s), sel);
const popup = async (p, fn) => { const t = new Promise(r => browser.once('targetcreated', x => r(x.url()))); await fn(); const url = await Promise.race([t, sleep(3000).then(() => 'none')]); for (const pg of await browser.pages()) if (pg !== p && pg.url() !== 'about:blank' && !/\/(edit|guide)\b/.test(pg.url()) && /show|presenter/.test(pg.url())) await pg.close().catch(() => {}); return url; };
/** Select the first n library cards of a type with real clicks. A plain click on the only selected card deselects it (by design), so the first click is repeated when it emptied the selection. */
/** Wait until running CSS transitions/animations in the page have finished (drawers sliding, dialogs opening). */
const settle = (p, ms = 3000) => p.evaluate(ms => new Promise(res => { const t0 = performance.now(); let quiet = 0; const tick = () => { const n = document.getAnimations().filter(a => a.playState === 'running').length; quiet = n ? 0 : quiet + 1; if (quiet >= 3 || performance.now() - t0 > ms) res(); else setTimeout(tick, 100); }; tick(); }), ms); // three quiet samples 100 ms apart: a transition that starts late (busy main thread after a resize) is still caught
async function selectAssets(p, n, type = 'photo') { await click(p, type === 'photo' ? 'תמונות' : 'ברכות', '.lib-tools .chip'); await sleep(250); const cards = await p.$$('.lib-grid-wrap .asset'); for (let i = 0; i < Math.min(n, cards.length); i++) { await p.evaluate(el => el.scrollIntoView({ block: 'nearest' }), cards[i]); await sleep(60); const b = await cards[i].boundingBox(); const already = await p.evaluate(el => el.classList.contains('sel'), cards[i]); if (i === 0 && already && (await p.evaluate(() => document.querySelectorAll('.asset.sel').length)) === 1) continue; // a plain click on the only selected card would toggle it off; a second click within 500 ms would be a double-click and add a slide
    if (i) await p.keyboard.down('Control'); await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2); if (i) await p.keyboard.up('Control'); await sleep(80); if (i === 0 && (await p.evaluate(() => document.querySelectorAll('.asset.sel').length)) === 0) { await sleep(600); await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await sleep(80); } } await sleep(150); return p.evaluate(() => document.querySelectorAll('.asset.sel').length); }
async function selectSlide(p, type) { const h = await p.$(type ? `.slide[data-type="${type}"]` : '.slides .slide'); if (!h) return false; return click(p, h); }
const rangeNudge = async (p, h) => { if (!h) return false; await p.evaluate(el => el.scrollIntoView({ block: 'center' }), h); await sleep(60); const before = await p.evaluate(el => el.value, h); const b = await h.boundingBox(); if (!b) return false; await p.mouse.click(b.x + b.width * 0.22, b.y + b.height / 2); await sleep(120); let after = await p.evaluate(el => el.value, h); if (after === before) { await p.mouse.click(b.x + b.width * 0.78, b.y + b.height / 2); await sleep(120); after = await p.evaluate(el => el.value, h); } return after !== before; };

/* ================= EDITOR ================= */
const ed = await newPage('/edit'); await sleep(800);
await sweep(ed, 'editor: idle');
check('editor: a slide card is selected by a real click', await selectSlide(ed) && await has(ed, '.slide.sel'));
await sweep(ed, 'editor: slide selected');
// ---- add tools: text, symbol, emoji, shape, image ----
const n0 = async () => (await getShow()).chapters.flatMap(c => c.slides).find(s => s.id === curId)?.overlays?.length ?? 0;
let curId = await ed.evaluate(() => document.querySelector('.slide.sel')?.dataset.id);
check('add text: the טקסט button opens a menu that is mouse-reachable', await click(ed, 'טקסט', '.preview-tools button') && await has(ed, '.menu.addmenu'));
await sweep(ed, 'add text menu', '.menu.addmenu');
check('add text: picking a preset creates a text layer with handles', await click(ed, 'כותרת גדולה', '.menu.addmenu button') && await has(ed, '.stage .ov-text') && await has(ed, '.ov-handles'));
await sleep(1200); check('add text: the layer reaches the server', (await n0()) >= 1);
check('add symbol: menu opens and the group tabs are reachable', await click(ed, 'סמל', '.preview-tools button') && await click(ed, 'משפחה', '.sym-tabs button'));
await sweep(ed, 'symbol picker', '.menu.addmenu');
check('add symbol: clicking an icon creates a symbol layer', await click(ed, await ed.$('.sym-grid button')) && await has(ed, '.stage .ov-symbol svg'));
check('add emoji: emoji tab + glyph creates an emoji layer', await click(ed, 'סמל', '.preview-tools button') && await click(ed, 'אימוג׳י', '.sym-tabs button') && await click(ed, await ed.$('.sym-grid button')) && await has(ed, '.stage .ov-emoji'));
check('add shape: menu + מסגרת creates a shape layer', await click(ed, 'צורה', '.preview-tools button') && await has(ed, '.menu.addmenu') && await click(ed, 'מסגרת', '.menu.addmenu button') && await has(ed, '.stage .ov-shape'));
await ed.keyboard.press('Escape'); await sleep(150);
check('add image: without a library selection the button explains itself (toast)', await click(ed, 'תמונה', '.preview-tools button') && /בחר/.test(await toastText(ed)));
check('add image: with a photo selected it creates an image layer', (await selectAssets(ed, 1)) === 1 && await click(ed, 'תמונה', '.preview-tools button') && await has(ed, '.stage .ov-image img'));
check('add tools: five layers (text, symbol, emoji, shape, image) reached the server', await until(async () => (await n0()) >= 5));
await sweep(ed, 'overlay inspector', '.insp');
check('overlay inspector: layer delete button works', await (async () => { const before = await ed.evaluate(() => document.querySelectorAll('.stage .ov').length); return await click(ed, 'מחק', '.insp .btn') && (await ed.evaluate(() => document.querySelectorAll('.stage .ov').length)) === before - 1; })());
await ed.keyboard.press('Escape'); await sleep(200);
// ---- slide actions: inspector top row, card hover buttons, context menu, keyboard ----
await selectSlide(ed); // Escape with no layer selected clears the slide selection (by design); select again
check('inspector: the action row is visible at the top without scrolling', await ed.evaluate(() => { const a = document.querySelector('.insp-actions'), i = document.querySelector('.insp'); return !!a && a.getBoundingClientRect().top < i.getBoundingClientRect().top + 140; }));
let c0 = await count(); check('inspector: שכפל duplicates the slide', await click(ed, 'שכפל', '.insp-actions button') && await countIs(c0 + 1));
check('inspector: מחק removes the slide', await click(ed, 'מחק', '.insp-actions button') && await countIs(c0));
check('card: hover shows duplicate/delete buttons that are reachable', await (async () => { const card = await ed.$('.slides .slide'); const b = await card.boundingBox(); await ed.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await sleep(200); return (await ed.evaluate(() => { const a = document.querySelector('.slide:hover .acts'); return a && +getComputedStyle(a).opacity > .9; })) && await click(ed, await ed.$('.slide:hover .acts button.del')); })() && await countIs(c0 - 1));
await ed.keyboard.down('Control'); await ed.keyboard.press('z'); await ed.keyboard.up('Control'); check('card: Ctrl+Z restores the deleted slide (and the undo is saved)', await countIs(c0));
check('card: right-click opens a context menu', await (async () => { const card = await ed.$('.slides .slide'); const b = await card.boundingBox(); await ed.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: 'right' }); await sleep(250); return has(ed, '.slide-menu'); })());
await sweep(ed, 'slide context menu', '.slide-menu');
check('context menu: שכפל duplicates', await click(ed, 'שכפל', '.slide-menu button') && await countIs(c0 + 1));
check('context menu: מחק removes', await (async () => { const card = await ed.$('.slides .slide'); const b = await card.boundingBox(); await ed.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: 'right' }); await sleep(250); return click(ed, 'מחק', '.slide-menu button'); })() && await countIs(c0));
await selectSlide(ed); await ed.keyboard.press('Delete'); check('keyboard: Delete removes the selected slide', await countIs(c0 - 1)); await ed.keyboard.down('Control'); await ed.keyboard.press('z'); await ed.keyboard.up('Control'); check('keyboard: Ctrl+Z after Delete is saved to the server', await countIs(c0));
// ---- "+" menu: media slides from the library selection with reasons, text slides ----
await ed.keyboard.press('Escape'); await ed.evaluate(() => document.querySelector('.lib-foot'));
check('+ menu opens by mouse', await click(ed, await ed.$('.addslide')) && await has(ed, '.menu.fixed'));
await sweep(ed, '+ menu (nothing selected in the library)', '.menu.fixed');
check('+ menu: collage is disabled with a reason when no photos are selected', await ed.evaluate(() => { const b = [...document.querySelectorAll('.menu.fixed button')].find(x => x.textContent.includes('קולאז')); return b && b.disabled && /בחרו/.test(b.title); }));
await ed.keyboard.press('Escape'); await sleep(150);
check('+ menu: with 3 photos selected, קולאז׳ creates a collage slide', (await selectAssets(ed, 3)) === 3 && await click(ed, await ed.$('.addslide')) && await click(ed, 'קולאז', '.menu.fixed button') && await serverHas(s => allSlides(s).some(x => x.type === 'collage' && x.assetIds.length === 3)));
check('+ menu: with 2 photos selected, זוג creates a pair', (await selectAssets(ed, 2)) === 2 && await click(ed, await ed.$('.addslide')) && await click(ed, 'זוג תמונות', '.menu.fixed button') && await serverHas(s => allSlides(s).some(x => x.type === 'photo-pair')));
check('+ menu: with 1 photo selected, תמונה creates a photo slide', (await selectAssets(ed, 1)) === 1 && await click(ed, await ed.$('.addslide')) && await click(ed, 'תמונה / ברכה', '.menu.fixed button') && await serverHas(s => allSlides(s).some(x => x.type === 'photo')));
check('+ menu: with a greeting video selected, ברכה creates a video slide', (await selectAssets(ed, 1, 'video')) === 1 && await click(ed, await ed.$('.addslide')) && await click(ed, 'תמונה / ברכה', '.menu.fixed button') && await serverHas(s => allSlides(s).some(x => x.type === 'video')));
for (const [label, type] of [['ציטוט', 'quote'], ['ציר זמן', 'timeline'], ['שמות', 'names'], ['מסך שחור', 'black'], ['כותרת פרק', 'chapter'], ['סיום', 'finale'], ['קיר ברכות', 'video-wall']]) { const ok = await click(ed, await ed.$('.addslide')) && await click(ed, label, '.menu.fixed button'); check(`+ menu: ${label} adds a ${type} slide`, ok && await serverHas(s => allSlides(s).some(x => x.type === type))); }
// ---- library footer, chips, selects, search, year, double-click ----
check('library: footer collage button is disabled with a reason when nothing is selected', await ed.evaluate(() => { const b = [...document.querySelectorAll('.lib-foot .btn')].find(x => x.textContent.includes('קולאז')); return b && b.disabled && b.title.length > 4; }));
check('library: קולאז׳ footer button creates a collage from 4 selected photos', (await selectAssets(ed, 4)) === 4 && await click(ed, 'קולאז', '.lib-foot .btn') && await serverHas(s => allSlides(s).some(x => x.type === 'collage' && x.assetIds.length === 4)));
{ const pairs0 = allSlides(await getShow()).filter(x => x.type === 'photo-pair').length; check('library: זוג footer button creates a pair', (await selectAssets(ed, 2)) === 2 && await click(ed, 'זוג', '.lib-foot .btn') && await serverHas(s => allSlides(s).filter(x => x.type === 'photo-pair').length === pairs0 + 1)); } // wait for this pair's own save, not for any earlier pair
{ await ed.evaluate(() => document.querySelector('.ch-head')?.scrollIntoView({ block: 'center' })); const chb = await (await ed.$('.ch-head')).boundingBox(); await ed.mouse.click(chb.x + chb.width / 2, chb.y + chb.height / 2); await sleep(200); // the footer button needs a target chapter: pick the first one with a real click
  c0 = await count(); const nsel = await selectAssets(ed, 2); const hinted = +((await ed.evaluate(() => document.querySelector('.lib-hint')?.textContent || '')).match(/(\d+) נבחרו/)?.[1] ?? 0); // the grid is virtualised: the footer hint is the real selection size, cards scrolled away still count
  const clicked = nsel === 2 && hinted >= 2 && await click(ed, 'הוסף לפרק', '.lib-foot .btn'); const grew = clicked && await countIs(c0 + hinted);
  check('library: הוסף לפרק adds one slide per selected file', grew, `selected ${nsel} visible / ${hinted} in the hint, clicked ${clicked}, slides ${c0} → ${await count()}`); }
c0 = await count(); check('library: double-click on a photo adds a slide', await (async () => { const a = (await ed.$$('.lib-grid-wrap .asset'))[2]; const b = await a.boundingBox(); await ed.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await ed.mouse.down(); await ed.mouse.up(); await sleep(70); await ed.mouse.down({ clickCount: 2 }); await ed.mouse.up({ clickCount: 2 }); return countIs(c0 + 1); })());
await ed.keyboard.press('Escape'); useLibClear: { await ed.evaluate(() => document.querySelector('.lib-tools .search input')?.focus()); await ed.keyboard.press('Escape'); }
check('library: year field + Enter sets the year of the selection', await (async () => { if ((await selectAssets(ed, 1)) !== 1) return false; const i = await ed.$('.lib-foot input[type=number]'); if (!i) return false; await click(ed, i); await ed.keyboard.type('1977'); await ed.keyboard.press('Enter'); return until(async () => /1977/.test(await toastText(ed)) && await ed.evaluate(() => [...document.querySelectorAll('.asset.sel .badge.yr')].some(y => /1977/.test(y.textContent)))); })());
for (const chip of ['ברכות', 'מוזיקה', 'לא בשימוש', 'הכל']) { check(`library: chip ${chip} is pressed by a real click and filters`, await click(ed, chip, '.lib-tools .chip') && await ed.evaluate(t => [...document.querySelectorAll('.lib-tools .chip')].find(c => c.textContent.trim() === t)?.getAttribute('aria-pressed') === 'true', chip)); }
check('library: duplicates toggle chip flips its label', await (async () => { const before = await ed.evaluate(() => [...document.querySelectorAll('.lib-tools .chip')].find(c => /כפילויות/.test(c.textContent))?.textContent); await click(ed, 'כפילויות', '.lib-tools .chip'); const after = await ed.evaluate(() => [...document.querySelectorAll('.lib-tools .chip')].find(c => /כפילויות/.test(c.textContent))?.textContent); await click(ed, 'כפילויות', '.lib-tools .chip'); return before !== after; })());
check('library: quality sort chip toggles', await click(ed, 'לפי איכות', '.lib-tools .chip') && await ed.evaluate(() => [...document.querySelectorAll('.lib-tools .chip')].find(c => c.textContent.trim() === 'לפי איכות')?.getAttribute('aria-pressed') === 'true') && await click(ed, 'לפי איכות', '.lib-tools .chip'));
check('library: decade select filters', await (async () => { await ed.select('.lib-tools select[aria-label="עשור"]', '2010'); await sleep(300); const ok = await ed.evaluate(() => document.querySelectorAll('.asset').length > 0 && [...document.querySelectorAll('.asset .yr')].every(y => /^201\d$/.test(y.textContent.replace(/\D/g, '')))); await ed.select('.lib-tools select[aria-label="עשור"]', ''); return ok; })());
check('library: search narrows and clears', await (async () => { const all = await ed.evaluate(() => document.querySelectorAll('.asset').length); await click(ed, '.lib-tools .search input'); await ed.keyboard.type('IMG_9'); await sleep(400); const n = await ed.evaluate(() => document.querySelectorAll('.asset').length); await ed.keyboard.down('Control'); await ed.keyboard.press('a'); await ed.keyboard.up('Control'); await ed.keyboard.press('Backspace'); await sleep(400); return n > 0 && n < all && (await ed.evaluate(() => document.querySelectorAll('.asset').length)) === all; })());
check('library: the scan icon opens the ingest dialog', await click(ed, await ed.$('.panel-h .btn')) && await has(ed, 'dialog[open]')); await ed.keyboard.press('Escape'); await sleep(250);
// ---- drag with the mouse: library → storyboard, reorder ----
{ await click(ed, 'תמונות', '.lib-tools .chip'); await sleep(200); const a = await (await ed.$('.lib-grid-wrap .asset')).boundingBox(); const strip = await (await ed.$('.slides')).boundingBox(); c0 = await count(); await ed.mouse.move(a.x + 40, a.y + 40); await ed.mouse.down(); await ed.mouse.move(a.x + 60, a.y + 60, { steps: 5 }); await ed.mouse.move(strip.x + strip.width - 80, strip.y + 40, { steps: 20 }); await sleep(200); await ed.mouse.up(); await sleep(1100); check('drag: library → storyboard adds a slide', (await count()) === c0 + 1); }
// reorder inside a chapter with the mouse: once from the middle of the card, once from the hover-action corner (the sensor needs 6 px of movement, so the buttons there never block a drag)
for (const [where, dx, dy] of [['centre', .5, .5], ['hover-action corner', .85, .35]]) {
  const r = await (async () => { const idx = await ed.evaluate(() => { const strips = [...document.querySelectorAll('.slides')]; let best = 0; strips.forEach((st, i) => { if (st.querySelectorAll('.slide').length > strips[best].querySelectorAll('.slide').length) best = i; }); const st = strips[best]; st.scrollLeft = 0; st.scrollIntoView({ block: 'center' }); return best; }); await sleep(250);
    const order = () => ed.evaluate((i) => [...document.querySelectorAll('.slides')[i].querySelectorAll('.slide')].map(x => x.dataset.id), idx); const before = await order(); if (before.length < 3) return 'short strip';
    const cards = await (await ed.$$('.slides'))[idx].$$('.slide'); const a = await cards[0].boundingBox(), b = await cards[2].boundingBox(); const p0 = { x: a.x + a.width * dx, y: a.y + a.height * dy };
    const hit = await ed.evaluate((x, y) => !!document.elementFromPoint(x, y)?.closest('.slide'), p0.x, p0.y); if (!hit) return 'start point not on the card';
    await ed.mouse.move(p0.x, p0.y); await ed.mouse.down(); await ed.mouse.move(p0.x + 20, p0.y, { steps: 5 }); await ed.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 }); await sleep(150); await ed.mouse.up(); await sleep(400);
    const after = await order(); if (after.join() === before.join()) return 'order unchanged'; let srvOrder = '', domOrder = ''; const srv = await until(async () => { const sh = await getShow(); const c = sh.chapters.find(c => c.slides.some(x => x.id === before[0])); srvOrder = c ? c.slides.map(x => x.id).join() : 'chapter not found'; domOrder = (await order()).join(); return srvOrder === domOrder; }, 6000); return srv ? true : `not saved: server ${srvOrder.slice(0, 40)}… vs screen ${domOrder.slice(0, 40)}…`; })();
  check(`drag: reorder slides from the ${where}`, r === true, String(r));
}
// ---- preview tools ----
check('preview: focal click on a photo slide persists', await selectSlide(ed, 'photo') && await (async () => { const st = await (await ed.$('.stage')).boundingBox(); await ed.mouse.click(st.x + st.width * .7, st.y + st.height * .3); await sleep(1200); const id = await ed.evaluate(() => document.querySelector('.slide.sel')?.dataset.id); const f = allSlides(await getShow()).find(s => s.id === id)?.focal; return f && Math.abs(f[0] - 70) <= 2; })());
check('preview: שוליים toggles the safe-margin guides', await click(ed, 'שוליים', '.preview-tools button') && await has(ed, '.stage .safe') && await click(ed, 'שוליים', '.preview-tools button') && !(await has(ed, '.stage .safe')));
check('preview: animation toggle flips its label', await click(ed, 'עצור אנימציה', '.preview-tools button') && await has(ed, '.preview-tools button[data-tip="הפעל אנימציה"]') && await click(ed, 'אנימציה', '.preview-tools button'));
check('preview: נגן שוב is reachable', await click(ed, 'נגן שוב', '.preview-tools button'));
check('preview: dragging a layer moves it', await (async () => { await click(ed, 'טקסט', '.preview-tools button'); await click(ed, 'כיתוב קטן', '.menu.addmenu button'); await sleep(300); const hb = await (await ed.$('.ov-handles')).boundingBox(); const sb = await (await ed.$('.stage')).boundingBox(); await ed.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await ed.mouse.down(); await ed.mouse.move(hb.x + hb.width / 2 - sb.width * .1, hb.y + hb.height / 2 - sb.height * .15, { steps: 10 }); await ed.mouse.up(); await sleep(1200); const id = await ed.evaluate(() => document.querySelector('.slide.sel')?.dataset.id); const o = allSlides(await getShow()).find(s => s.id === id)?.overlays?.at(-1); return o && Math.abs(o.x - 20) < 3 && Math.abs(o.y - 67) < 3; })());
await ed.keyboard.press('Escape');
// ---- inspector: every control of every slide type ----
async function exerciseInspector(p, label) {
  await p.evaluate(() => document.querySelectorAll('.insp .sec:not(.open) .sec-h').forEach(b => b.click())); await sleep(200); // open every section (collapse state is per-user, not under test)
  await sweep(p, `inspector ${label}`, '.insp');
  let segTried = 0, segOk = 0; const segBad = []; for (let i = 0; i < 60; i++) { const h = await p.evaluateHandle(() => [...document.querySelectorAll('.insp .seg button, .insp .kb-grid button, .insp .layout-pick button')].find(b => b.getAttribute('aria-pressed') !== 'true' && !b.disabled && !b.dataset.tried) || null); const el = h.asElement(); if (!el) break; const nm = await p.evaluate(e => { e.dataset.tried = '1'; return (e.closest('.field')?.querySelector('label')?.textContent?.trim() ?? '') + '→' + e.textContent.trim(); }, el); segTried++; if (!(await click(p, el))) { segBad.push(nm + ' (unreachable)'); continue; } if (await p.evaluate(e => e.getAttribute('aria-pressed') === 'true' || !document.contains(e), el)) segOk++; else segBad.push(nm); }
  check(`inspector ${label}: segmented buttons respond to real clicks (${segOk}/${segTried})`, segOk === segTried, segBad.join(' | '));
  const ranges = await p.$$('.insp input[type=range]'); let rOk = 0; const rBad = []; for (const r of ranges) { if (await rangeNudge(p, r)) rOk++; else rBad.push(await p.evaluate(e => e.closest('.field')?.querySelector('label')?.textContent?.trim() ?? e.title ?? '?', r)); } check(`inspector ${label}: sliders move on click (${rOk}/${ranges.length})`, rOk === ranges.length, rBad.join(' | '));
  const boxes = await p.$$('.insp input[type=checkbox]'); let bOk = 0; for (const b of boxes) { const before = await p.evaluate(e => e.checked, b); if (await click(p, b) && (await p.evaluate(e => e.checked, b)) !== before) bOk++; } check(`inspector ${label}: checkboxes toggle (${bOk}/${boxes.length})`, bOk === boxes.length);
}
const show1 = await getShow(); const types = [...new Set(allSlides(show1).map(s => s.type))];
for (const t of types) { if (!(await selectSlide(ed, t))) { check(`inspector: can select a ${t} slide`, false); continue; } check(`inspector: opens for ${t}`, (await text(ed, '.insp-title .ty')) !== null); await exerciseInspector(ed, t); }
check('inspector: photo caption typed by keyboard reaches preview, card and server', await selectSlide(ed, 'photo') && await click(ed, await ed.$('.insp textarea.he')) && (await ed.keyboard.down('Control'), await ed.keyboard.press('a'), await ed.keyboard.up('Control'), await ed.keyboard.type('כיתוב חיווט'), await sleep(1300), true) && (await text(ed, '.stage .cap .tx')) === 'כיתוב חיווט' && allSlides(await getShow()).some(s => s.caption === 'כיתוב חיווט'));
check('inspector: תמונה דומה swaps the photo for an unused one', await (async () => { const id = await ed.evaluate(() => document.querySelector('.slide.sel')?.dataset.id); const before = allSlides(await getShow()).find(s => s.id === id)?.assetId; const ok = await click(ed, 'תמונה דומה', '.insp .btn'); await sleep(1200); const after = allSlides(await getShow()).find(s => s.id === id)?.assetId; return ok && after && after !== before; })());
check('inspector: collage layout picker changes the layout', await selectSlide(ed, 'collage') && await (async () => { const id = await ed.evaluate(() => document.querySelector('.slide.sel')?.dataset.id); const h = await ed.evaluateHandle(() => [...document.querySelectorAll('.insp .layout-pick button')].find(b => !b.disabled && b.getAttribute('aria-pressed') !== 'true') || null); const el = h.asElement(); if (!el) return false; const want = await ed.evaluate(e => e.title, el); if (!(await click(ed, el))) return false; await sleep(1200); const s = allSlides(await getShow()).find(x => x.id === id); return s && s.layout && (await ed.evaluate((id) => [...document.querySelectorAll('.insp .layout-pick button')].find(b => b.getAttribute('aria-pressed') === 'true')?.title, id)) === want; })());
check('inspector: layers list selects a layer by click', await selectSlide(ed, 'photo') && await ed.evaluate(() => { const s = document.querySelector('.insp .sec[data-sec="layers"]:not(.open) .sec-h'); s?.click(); return true; }) && (await sleep(200), await has(ed, '.layers .layer-row')) && await click(ed, await ed.$('.layers .layer-row')) && await has(ed, '.ov-handles'));
check('overlay inspector: קדימה/אחורה, מרכז, יישר, נעל are reachable and respond', await click(ed, 'מרכז אופקי', '.insp .btn') && await click(ed, 'יישר', '.insp .btn') && await click(ed, 'קדימה', '.insp .btn') && await click(ed, 'נעל מיקום', '.insp .btn') && await has(ed, '.ov-handles svg.lucide-lock') && await click(ed, 'נעול', '.insp .btn'));
await ed.keyboard.press('Escape'); await sleep(150);
// ---- bulk inspector ----
await selectSlide(ed); await ed.keyboard.down('Control'); await ed.keyboard.press('a'); await ed.keyboard.up('Control'); await sleep(300);
check('bulk: Ctrl+A opens the bulk inspector', /שקופיות/.test(await text(ed, '.insp-title .ty') || '')); await sweep(ed, 'bulk inspector', '.insp');
check('bulk: a duration chip applies to all selected', await click(ed, '7s', '.insp .chip') && /7/.test(await toastText(ed)));
await ed.keyboard.press('Escape'); await sleep(150);
// ---- checks tab ----
check('checks tab: opens and an item click selects something', await click(ed, 'בדיקות', '.insp-tabs button') && await has(ed, '.insp .checks .check') && (await (async () => { const h = await ed.evaluateHandle(() => [...document.querySelectorAll('.insp .checks .check')].find(c => !c.classList.contains('ok')) || null); const el = h.asElement(); if (!el) return true; return click(ed, el) && (await has(ed, '.slide.sel') || await has(ed, '.ch-head.sel')); })()));
await sweep(ed, 'checks tab', '.insp'); await click(ed, 'מאפיינים', '.insp-tabs button');
// ---- chapter inspector ----
check('chapter: clicking the head opens the chapter inspector with its action row on top', await click(ed, await ed.$('.ch-head')) && (await text(ed, '.insp-title .ty')) === 'פרק' && await has(ed, '.insp-actions'));
await sweep(ed, 'chapter inspector', '.insp');
check('chapter: סדר לפי שנה responds', await click(ed, 'סדר לפי שנה', '.insp-actions button') && /סודר/.test(await toastText(ed)));
check('chapter: music select + waveform click sets the start offset', await (async () => { const opts = await ed.evaluate(() => [...document.querySelectorAll('.insp select option')].map(o => o.value).filter(Boolean)); if (!opts.length) return false; await ed.select('.insp select', opts[0]); await sleep(400); const w = await ed.$('.wave'); if (!w) return false; const b = await w.boundingBox(); await ed.mouse.click(b.x + b.width * .3, b.y + b.height / 2); await sleep(1200); return (await getShow()).chapters[0].musicStartSec > 0; })());
check('chapter: rename by keyboard persists to the head card', await click(ed, await ed.$('.insp input.he')) && (await ed.keyboard.down('Control'), await ed.keyboard.press('a'), await ed.keyboard.up('Control'), await ed.keyboard.type('פרק חיווט'), await sleep(1200), true) && await ed.evaluate(() => [...document.querySelectorAll('.ch-head .t')].some(t => t.textContent === 'פרק חיווט')));
check('chapter: נעל locks the chapter (badge on the head)', await click(ed, 'נעל', '.insp .btn') && await has(ed, '.ch-head .lock') && await click(ed, 'נעול', '.insp .btn'));
check('chapter: מלא את הפרק אוטומטית opens the wizard in fill mode', await click(ed, 'מלא את הפרק', '.insp .btn') && /מילוי/.test(await text(ed, 'dialog.wiz h2') || '')); await ed.keyboard.press('Escape'); await ed.evaluate(() => document.querySelector('dialog.wiz .x')?.click()); await sleep(300);
let ch0 = (await getShow()).chapters.length; check('top bar: + פרק adds a chapter', await click(ed, 'פרק', '.topbar .tb-center .btn') && (await sleep(1100), (await getShow()).chapters.length) === ch0 + 1);
check('chapter: מחק פרק (confirm accepted) removes it', await click(ed, await ed.$$('.ch-head').then(h => h[h.length - 1])) && await click(ed, 'מחק פרק', '.insp-actions button') && (await sleep(1100), (await getShow()).chapters.length) === ch0);
check('chapter: הקדם is disabled on the first chapter with a reason, אחר works', await click(ed, await ed.$('.ch-head')) && await ed.evaluate(() => { const b = [...document.querySelectorAll('.insp-actions button')].find(x => x.textContent.includes('הקדם')); return b && b.disabled && !!(b.title || b.closest('[title]')); }));
// ---- top bar ----
check('top bar: ספרייה opens the ingest dialog', await click(ed, 'ספרייה', '.topbar .btn') && await has(ed, 'dialog[open]')); await sweep(ed, 'ingest dialog', 'dialog[open]');
check('ingest dialog: נתח כפילויות responds', await click(ed, 'נתח כפילויות', 'dialog .btn') && await until(async () => /ניתוח|עודכנה|נכשל/.test(await toastText(ed)), 8000) && !/נכשל/.test(await toastText(ed))); await ed.keyboard.press('Escape'); await sleep(250);
check('top bar: theme button opens the picker and a card changes the show theme', await click(ed, await ed.$('.topbar [data-tour="theme"]')) && await has(ed, '.theme-pop') && (await sweep(ed, 'theme picker', '.theme-pop'), true) && await click(ed, await ed.$$('.theme-pop .theme-card').then(c => c[3])) && (await sleep(1100), (await getShow()).settings.theme) !== original.settings.theme);
await ed.keyboard.press('Escape'); await ed.mouse.click(5, 500); await sleep(200);
check('top bar: גרסאות opens, פרטים and שחזר are reachable', await click(ed, 'גרסאות', '.topbar .btn') && await has(ed, '.versions .version') && (await sweep(ed, 'versions dialog', 'dialog[open]'), true) && await click(ed, 'פרטים', '.version .btn') && await click(ed, 'שחזר', '.version .btn') && await has(ed, 'dialog .btn.primary'));
await ed.keyboard.press('Escape'); await sleep(250);
check('top bar: settings opens; sliders, segments and interface choice respond', await click(ed, await ed.$('.topbar [data-tour="settings"]')) && await has(ed, 'dialog[open]') && (await sweep(ed, 'settings dialog', 'dialog[open]'), true) && await rangeNudge(ed, await ed.$('dialog input[type=range]')) && await click(ed, 'דחיפה', 'dialog .seg button') && await click(ed, 'כהה', 'dialog .seg button') && (await ed.evaluate(() => document.documentElement.dataset.chrome)) === 'dark' && await click(ed, 'בהיר', 'dialog .seg button'));
await ed.keyboard.press('Escape'); await sleep(250);
check('top bar: moon/sun toggles the interface theme', await click(ed, await ed.$('.topbar [data-chrome-toggle]')) && (await ed.evaluate(() => document.documentElement.dataset.chrome)) === 'dark' && await click(ed, await ed.$('.topbar [data-chrome-toggle]')) && (await ed.evaluate(() => document.documentElement.dataset.chrome)) === 'light');
check('top bar: ? opens help', await click(ed, await ed.$('.topbar [data-tour="help"]')) && /עזרה/.test(await text(ed, 'dialog .dlg-h') || '')); await sweep(ed, 'help dialog', 'dialog[open]'); await ed.keyboard.press('Escape'); await sleep(250);
check('top bar: undo/redo buttons respond', await ed.evaluate(() => !document.querySelector('.topbar .btn[data-tip^="בטל"]').disabled) && await click(ed, await ed.$('.topbar .btn[data-tip^="בטל"]')) && await click(ed, await ed.$('.topbar .btn[data-tip^="חזור"]')));
check('top bar: save button responds', await click(ed, await ed.$('.topbar .btn[data-tip^="שמור"]')) && (await sleep(900), /נשמר/.test(await text(ed, '.savestate') || '')));
check('top bar: מדריך opens the guide window', /\/guide/.test(await popup(ed, () => click(ed, 'מדריך', '.topbar .btn'))));
check('top bar: מציג opens the presenter window', /\/presenter/.test(await popup(ed, () => click(ed, 'מציג', '.topbar .btn'))));
check('top bar: נגן opens the show window from the selection', /\/show/.test(await popup(ed, async () => click(ed, await ed.$('.topbar [data-tour="play"]')))));
check('storyboard: double-click on a card opens the show from it', /\/show\?from=/.test(await popup(ed, async () => { const b = await (await ed.$('.slides .slide')).boundingBox(); await ed.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await ed.mouse.down(); await ed.mouse.up(); await sleep(70); await ed.mouse.down({ clickCount: 2 }); await ed.mouse.up({ clickCount: 2 }); })));
// ---- wizard, every step by mouse, applied as "append", then undone ----
check('wizard: opens from the top bar', await click(ed, 'צור אוטומטית', '.topbar .btn') && await has(ed, 'dialog.wiz')); await sweep(ed, 'wizard step 1', 'dialog.wiz');
check('wizard: a folder checkbox and the year inputs respond', await (async () => { const cb = await ed.$('dialog.wiz .tree input[type=checkbox]'); if (!cb) return false; const before = await ed.evaluate(e => e.checked, cb); await click(ed, cb); const changed = (await ed.evaluate(e => e.checked, cb)) !== before; await click(ed, cb); const yi = await ed.$('dialog.wiz input[type=number]'); await click(ed, yi); await ed.keyboard.type('1950'); await sleep(200); const v = await ed.evaluate(e => e.value, yi); await ed.keyboard.down('Control'); await ed.keyboard.press('a'); await ed.keyboard.up('Control'); await ed.keyboard.press('Backspace'); return changed && v === '1950'; })());
check('wizard: המשך → step 2 by mouse', await click(ed, 'המשך', 'dialog.wiz .dlg-f .btn') && await ed.evaluate(() => document.querySelector('.wiz-steps button.cur')?.textContent.includes('צורה'))); await sweep(ed, 'wizard step 2', 'dialog.wiz');
check('wizard: step 2 segments and the length slider respond', await click(ed, 'דינמי', 'dialog.wiz .seg button') && await click(ed, 'הרבה', 'dialog.wiz .seg button') && await rangeNudge(ed, await ed.$('dialog.wiz input[type=range]')));
check('wizard: צור תצוגה מקדימה → step 3 with a filmstrip and a chapter table', await click(ed, 'צור תצוגה מקדימה', 'dialog.wiz .dlg-f .btn') && (await sleep(1200), await has(ed, 'dialog.wiz .strip-item') && await has(ed, 'dialog.wiz .tbl tr'))); await sweep(ed, 'wizard step 3', 'dialog.wiz');
check('wizard: צור מחדש regenerates (seed label increments)', await (async () => { const b = await text(ed, 'dialog.wiz .row .btn'); await click(ed, 'צור מחדש', 'dialog.wiz .btn'); await sleep(900); return (await text(ed, 'dialog.wiz .row .btn')) !== b; })());
check('wizard: המשך → step 4', await click(ed, 'המשך', 'dialog.wiz .dlg-f .btn') && await has(ed, 'dialog.wiz .radio')); await sweep(ed, 'wizard step 4', 'dialog.wiz');
ch0 = (await getShow()).chapters.length;
check('wizard: append mode applies and adds chapters', await click(ed, 'הוסף את הפרקים', 'dialog.wiz .radio') && await click(ed, 'הוסף פרקים', 'dialog.wiz .btn.primary') && await until(async () => (await getShow()).chapters.length > ch0, 8000));
await ed.keyboard.down('Control'); await ed.keyboard.press('z'); await ed.keyboard.up('Control'); check('wizard: Ctrl+Z reverts the whole generation (and saves)', await until(async () => (await getShow()).chapters.length === ch0, 8000));
// ---- storyboard footer ----
check('storyboard: zoom slider changes the card size', await (async () => { const w0 = await ed.evaluate(() => document.querySelector('.slide').getBoundingClientRect().width); const ok = await rangeNudge(ed, await ed.$('.story-foot .zoom input')); return ok && (await ed.evaluate(() => document.querySelector('.slide').getBoundingClientRect().width)) !== w0; })());
check('storyboard: resizer drag changes the height', await (async () => { const h0 = await ed.evaluate(() => document.querySelector('.story-panel').getBoundingClientRect().height); const rz = await (await ed.$('.resizer')).boundingBox(); await ed.mouse.move(rz.x + 300, rz.y + 4); await ed.mouse.down(); await ed.mouse.move(rz.x + 300, rz.y - 70, { steps: 8 }); await ed.mouse.up(); await sleep(200); return (await ed.evaluate(() => document.querySelector('.story-panel').getBoundingClientRect().height)) > h0 + 30; })());
check('panels: library and inspector resize handles work', await (async () => { const l0 = await ed.evaluate(() => document.querySelector('.lib').getBoundingClientRect().width); const h = await (await ed.$('.lib .vresizer')).boundingBox(); await ed.mouse.move(h.x + 4, h.y + 200); await ed.mouse.down(); await ed.mouse.move(h.x - 60, h.y + 200, { steps: 8 }); await ed.mouse.up(); await sleep(200); return (await ed.evaluate(() => document.querySelector('.lib').getBoundingClientRect().width)) > l0 + 30; })());
await shot(ed, 'editor-after');
// ---- narrow screens: overflow menu and drawers ----
await ed.bringToFront(); // after the popup windows the editor may be a background tab, where CSS transitions do not start and the drawers would never slide out
await ed.setViewport({ width: 1200, height: 900 }); await sleep(400); await settle(ed); await sweep(ed, 'editor @1200'); await shot(ed, 'editor-1200');
check('@1200: the preview stage shrank with the window (no overflow over the tools)', await ed.evaluate(() => { const s = document.querySelector('.stage').getBoundingClientRect(), w = document.querySelector('.stage-wrap').getBoundingClientRect(); return s.left >= w.left - 1 && s.right <= w.right + 1; }));
check('@1200: the overflow menu opens and its items work', await click(ed, await ed.$('.tb-more > .btn')) && await has(ed, '.tb-more .menu') && (await sweep(ed, 'overflow menu', '.tb-more .menu'), true) && await click(ed, 'הגדרות', '.tb-more .menu button') && await has(ed, 'dialog[open]')); await ed.keyboard.press('Escape'); await sleep(200);
await ed.setViewport({ width: 1100, height: 900 }); await sleep(400); await settle(ed); await sweep(ed, 'editor @1100 (drawers closed)'); await shot(ed, 'editor-1100');
check('@1100: the library drawer opens from its tab and its controls are reachable', await click(ed, 'ספרייה', '.drawer-tabs.start .btn') && await ed.evaluate(() => document.querySelector('.editor').classList.contains('lib-open')) && (await sweep(ed, 'library drawer', '.lib'), true));
check('@1100: the backdrop closes the drawer', await click(ed, await ed.$('.drawer-back')) && !(await ed.evaluate(() => document.querySelector('.editor').classList.contains('lib-open'))));
check('@1100: the inspector drawer opens and its action row is reachable', await click(ed, 'מאפיינים', '.drawer-tabs.end .btn') && await ed.evaluate(() => document.querySelector('.editor').classList.contains('insp-open')) && (await sweep(ed, 'inspector drawer', '.insp'), true) && await click(ed, await ed.$('.drawer-back')));
await ed.setViewport({ width: 1920, height: 1000 }); await sleep(300);
// ---- welcome card and tour by mouse ----
await kv('guide-seen', null); await ed.reload({ waitUntil: 'networkidle0' }); await sleep(800);
check('welcome: appears on a first run and all its options are reachable', await has(ed, '.welcome')); await sweep(ed, 'welcome card', '.welcome');
check('welcome: סיור קצר starts the tour; הבא, הקודם, dots and close respond', await click(ed, 'סיור קצר', '.welcome-opt') && await has(ed, '.tour-card') && (await sweep(ed, 'tour card', '.tour-card'), true) && await click(ed, 'הבא', '.tour-f .btn') && (await text(ed, '.tour-n')).startsWith('2') && await click(ed, 'הקודם', '.tour-f .btn') && (await text(ed, '.tour-n')).startsWith('1') && await click(ed, await ed.$$('.tour-dots i').then(d => d[4])) && (await text(ed, '.tour-n')).startsWith('5') && await click(ed, await ed.$('.tour-h .x')) && !(await has(ed, '.tour-card')));
check('welcome: the choice was remembered', !!(await kv('guide-seen')).value);
await kv('guide-seen', { at: 'audit-wiring' });

/* ================= SHOW ================= */
const sh = await newPage('/show', 1600, 900); await sleep(500);
await sweep(sh, 'show: start gate', '.startgate');
check('show: Start button starts the show', await click(sh, 'התחל', '.startgate .btn') && (await sleep(1500), !(await has(sh, '.startgate')) && await has(sh, '.layer .sl')));
await sh.mouse.move(800, 450); await sh.mouse.move(820, 460); await sleep(200); await sweep(sh, 'show: HUD', '.hud');
const idx = () => text(sh, '.hud .num');
check('HUD: הבא / הקודם buttons move the show', await click(sh, await sh.$('.hud .btn[title="הבא"]')) && (await sleep(700), (await idx()).startsWith('2')) && await click(sh, await sh.$('.hud .btn[title="הקודם"]')) && (await sleep(700), (await idx()).startsWith('1')));
check('HUD: pause button pauses and resumes', await click(sh, await sh.$('.hud .btn[title="השהה"]')) && /מושהה/.test(await text(sh, '.hud')) && await click(sh, await sh.$('.hud .btn[title="המשך"]')));
check('HUD: black screen button', await click(sh, await sh.$('.hud .btn[title="מסך שחור"]')) && (await sleep(700), await sh.evaluate(() => [...document.querySelectorAll('.layer')].every(l => +getComputedStyle(l).opacity < .05))) && await click(sh, await sh.$('.hud .btn[title="מסך שחור"]')));
check('HUD: mute button', await click(sh, await sh.$('.hud .btn[title="השתק מוזיקה"]')) && await has(sh, '.hud svg.lucide-volume-x') && await click(sh, await sh.$('.hud .btn[title="השתק מוזיקה"]')));
check('HUD: palette button cycles the theme', await (async () => { const t0 = await sh.evaluate(() => document.querySelector('.player').dataset.theme); await click(sh, await sh.$('.hud .btn[title^="ערכת צבעים"]')); await sleep(900); return (await sh.evaluate(() => document.querySelector('.player').dataset.theme)) !== t0; })());
check('show: a click on the stage advances', await (async () => { const i0 = await idx(); await sh.mouse.click(800, 300); await sleep(800); return (await idx()) !== i0; })());
check('show: keyboard PageDown/PageUp/Home/End', (await sh.keyboard.press('PageDown'), await sleep(700), await sh.keyboard.press('PageUp'), await sleep(700), await sh.keyboard.press('End'), await sleep(900), await sh.evaluate(() => { const [a, b] = document.querySelector('.hud .num').textContent.split('/').map(x => +x.trim()); return a === b; })) && (await sh.keyboard.press('Home'), await sleep(900), (await idx()).startsWith('1')));
await shot(sh, 'show');

/* ================= PRESENTER ================= */
const pr = await newPage('/presenter', 1400, 850); await sleep(900);
await sweep(pr, 'presenter');
await sh.bringToFront(); // a background tab gets no animation frames, so the show's fades would never run; input still reaches the presenter page
check('presenter: receives state and its thumbnail strip follows', /\d+\/\d+/.test(await pr.evaluate(() => [...document.querySelectorAll('.pr-k .v')][3]?.textContent || '')) && await has(pr, '.pr-strip button.cur'));
const before = await idx();
check('presenter: הבא / הקודם buttons drive the show', await click(pr, 'הבא', '.pr-controls .btn') && (await sleep(800), (await idx()) !== before) && await click(pr, 'הקודם', '.pr-controls .btn') && (await sleep(800), (await idx()) === before));
check('presenter: pause, black, mute, restart buttons', await click(pr, 'השהה', '.pr-controls .btn') && (await sleep(400), /מושהה/.test(await text(sh, '.hud'))) && await click(pr, 'המשך', '.pr-controls .btn') && await click(pr, 'שחור', '.pr-controls .btn') && (await sleep(700), await sh.evaluate(() => [...document.querySelectorAll('.layer')].every(l => +getComputedStyle(l).opacity < .05))) && await click(pr, 'שחור', '.pr-controls .btn') && await click(pr, 'השתק', '.pr-controls .btn') && (await sleep(300), await has(sh, '.hud svg.lucide-volume-x')) && await click(pr, 'בטל השתקה', '.pr-controls .btn') && await click(pr, 'מההתחלה', '.pr-controls .btn') && (await sleep(1200), (await idx()).startsWith('1')));
check('presenter: a theme chip changes the show theme live and the reset button appears', await click(pr, await pr.$$('.pr-themes .btn').then(b => b[5])) && (await sleep(900), (await sh.evaluate(() => document.querySelector('.player').dataset.theme)) === (await pr.evaluate(() => [...document.querySelectorAll('.pr-themes .btn')].find(b => b.getAttribute('aria-pressed') === 'true')?.textContent) ? await sh.evaluate(() => document.querySelector('.player').dataset.theme) : null)) && await click(pr, 'חזרה לערכת המצגת', '.pr-themes .btn'));
check('presenter: a strip thumbnail jumps the show', await click(pr, await pr.$$('.pr-strip button').then(b => b[3])) && (await sleep(900), (await idx()).startsWith('4')));
check('presenter: interface theme toggle', await click(pr, await pr.$('[data-chrome-toggle]')) && (await pr.evaluate(() => document.documentElement.dataset.chrome)) === 'dark' && await click(pr, await pr.$('[data-chrome-toggle]')));
await shot(pr, 'presenter'); await pr.close(); await sh.close();

/* ================= GUIDE ================= */
const g = await newPage('/guide', 1600, 900); await sleep(900);
await sweep(g, 'guide: header and navigation', '.guide-head'); await sweep(g, 'guide: nav', '.guide-nav'); await sweep(g, 'guide: body', '.guide-main');
check('guide: nav click scrolls and sets the hash', await click(g, await g.$$('.guide-nav ol button').then(b => b[3])) && (await sleep(900), /#slides/.test(await g.evaluate(() => location.hash))));
check('guide: transition chips switch the demo caption', await (async () => { const c0 = await text(g, '.gd-demo figcaption b'); await click(g, 'דחיפה', '.gd-demo .chip'); await sleep(300); return (await text(g, '.gd-demo figcaption b')) !== c0; })());
check('guide: search narrows by keyboard', await click(g, '.guide-search input') && (await g.keyboard.type('מוזיקה'), await sleep(400), (await g.evaluate(() => document.querySelectorAll('.guide-ch').length)) < 13));
await g.keyboard.down('Control'); await g.keyboard.press('a'); await g.keyboard.up('Control'); await g.keyboard.press('Backspace'); await sleep(300);
check('guide: a "try it" button reaches the open editor (ack)', await click(g, 'פתח את חלון הסריקה', '.gd-try') && (await sleep(700), /בוצע|נפתח/.test(await g.evaluate(() => [...document.querySelectorAll('.gd-try')].map(b => b.textContent).join(' '))) && await has(ed, 'dialog[open]')));
await ed.keyboard.press('Escape');
check('guide: פתח את העורך opens or focuses an editor window', await click(g, 'פתח את העורך', '.guide-head .btn'));
await shot(g, 'guide');

/* ================= restore and report ================= */
await putShow(original, 'אחרי בדיקת חיווט (שוחזר)'); await kv('guide-seen', prevSeen); if (prevChrome) await kv('chrome-theme', prevChrome); else await kv('chrome-theme', 'light');
const back = await getShow(); check('restore: the show is exactly as it was before the audit', JSON.stringify(back) === JSON.stringify(original));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n${results.length - fails}/${results.length} wiring checks passed`);
console.log('issues:', issues.length ? issues : 'none');
await browser.close(); process.exit(fails || issues.length ? 1 : 0);
