// Contrast audit of the tool's chrome, element by element, in both chrome themes (light and dark).
// For every visible element that renders its own text, the effective background is found by compositing the
// ancestors' backgrounds, and the WCAG 2.2 contrast ratio is checked: ≥ 4.5:1 (≥ 3:1 for large text: 24 px, or 18.66 px bold).
// Form-field borders (input, select, textarea) and segmented-control outlines are checked for ≥ 3:1 (WCAG 1.4.11).
// Show content (slides, start gate, HUD, thumbnails over photos) is excluded: it follows the show's own themes.
// Usage: node scripts/audit-contrast.mjs [outDir]     (server on :4000; works with an empty or a demo library)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const base = 'http://127.0.0.1:4000'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const kv = (k, v) => fetch(`${base}/api/kv/${k}`, v === undefined ? undefined : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }).then(r => r.json());
const prev = { seen: (await kv('guide-seen')).value, chrome: (await kv('chrome-theme')).value };
const browser = await puppeteer.launch({ executablePath: exe, headless: true });
const results = []; let fails = 0; const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) fails++; };

/** Runs inside the page: returns every text and border contrast failure in the current DOM. */
function scan() {
  const SKIP = '.sl, .stage, .gd-stage, .pr-stage, .asset, .slide, .startgate, .hud, .showpage, .drop-item, .mini, .pr-strip button, .theme-card .sw, .strip-item, .tour-spot, .gd-player, .layout-pick svg, kbd';
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, bottom) => { const a = top.a + bottom.a * (1 - top.a); if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }; return { r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a, g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a, b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a, a }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } } let acc = { r: 255, g: 255, b: 255, a: 1 }; for (const l of layers.reverse()) acc = over(l, acc); return acc; };
  const visible = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < .1) return false; } return true; };
  const out = []; const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest(SKIP) || el.closest('svg')) continue;
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
    const cs = getComputedStyle(el);
    if (ownText && visible(el)) {
      if (el.closest('[disabled], .btn[disabled], [aria-disabled="true"]')) continue; // inactive components are exempt
      const fg = parse(cs.color); const bg = bgOf(el); if (!fg || !bg) continue;
      const eff = over(fg, bg); const r = ratio(eff, bg); const size = parseFloat(cs.fontSize); const bold = +cs.fontWeight >= 700; const large = size >= 24 || (bold && size >= 18.66);
      const need = large ? 3 : 4.5; const opacityChain = (() => { let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; })();
      const rr = opacityChain < 1 ? ratio(over({ ...eff, a: opacityChain }, bg), bg) : r;
      if (rr < need) { const key = `${el.tagName}.${el.className}|${el.textContent.trim().slice(0, 24)}`; if (!seen.has(key)) { seen.add(key); out.push({ kind: 'text', ratio: +rr.toFixed(2), need, sel: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`, text: el.textContent.trim().slice(0, 40), color: cs.color, size }); } }
    }
    if (el.matches('input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]), select, textarea, .seg') && visible(el) && !el.closest('[disabled]')) {
      const bc = parse(cs.borderTopColor); const bg = bgOf(el.parentElement || el); if (bc && bg) { const r = ratio(over(bc, bg), bg); if (r < 3) { const key = 'border|' + el.tagName + el.className; if (!seen.has(key)) { seen.add(key); out.push({ kind: 'border', ratio: +r.toFixed(2), need: 3, sel: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`, color: cs.borderTopColor }); } } }
    }
  }
  return out;
}

const screens = [
  ['editor', '/edit', async (p) => { await p.evaluate(() => (document.querySelector('.slide[data-type="photo"]') || document.querySelector('.slides .slide'))?.click()); await sleep(500); }],
  ['editor · chapter', '/edit', async (p) => { await p.evaluate(() => document.querySelector('.ch-head')?.click()); await sleep(400); }],
  ['editor · checks tab', '/edit', async (p) => { await p.evaluate(() => document.querySelector('[data-tour="checks-tab"]')?.click()); await sleep(300); }],
  ['editor · add-text menu', '/edit', async (p) => { await p.evaluate(() => document.querySelector('.slides .slide')?.click()); await sleep(300); await p.evaluate(() => [...document.querySelectorAll('.preview-tools .btn')].find(b => b.textContent.includes('טקסט'))?.click()); await sleep(300); }],
  ['editor · theme popover', '/edit', async (p) => { await p.evaluate(() => document.querySelector('[data-tour="theme"]')?.click()); await sleep(300); }],
  ['dialog · settings', '/edit?do=' + encodeURIComponent(JSON.stringify({ cmd: 'dialog', id: 'settings' })), async () => { await sleep(900); }],
  ['dialog · versions', '/edit?do=' + encodeURIComponent(JSON.stringify({ cmd: 'dialog', id: 'versions' })), async () => { await sleep(1200); }],
  ['dialog · ingest', '/edit?do=' + encodeURIComponent(JSON.stringify({ cmd: 'dialog', id: 'ingest' })), async () => { await sleep(1200); }],
  ['dialog · help', '/edit?do=' + encodeURIComponent(JSON.stringify({ cmd: 'dialog', id: 'help' })), async () => { await sleep(900); }],
  ['wizard · auto-create', '/edit?do=' + encodeURIComponent(JSON.stringify({ cmd: 'dialog', id: 'auto' })), async () => { await sleep(1200); }],
  ['tour', '/edit?do=' + encodeURIComponent(JSON.stringify({ cmd: 'tour', step: 2 })), async () => { await sleep(1200); }],
  ['guide', '/guide', async (p) => { await p.evaluate(async () => { const m = document.querySelector('.guide-main'); for (let y = 0; y < m.scrollHeight; y += 800) { m.scrollTop = y; await new Promise(r => setTimeout(r, 40)); } m.scrollTop = 0; }); await sleep(600); }],
  ['presenter', '/presenter', async () => { await sleep(900); }],
];
for (const chrome of ['light', 'dark']) {
  await kv('chrome-theme', chrome);
  for (const [name, url, prep] of screens) {
    await kv('guide-seen', { at: 'contrast-audit' });
    const p = await browser.newPage(); await p.setViewport({ width: 1920, height: 1080 }); await p.goto(base + url, { waitUntil: 'load' }); await sleep(900); await prep(p);
    const bad = await p.evaluate(scan);
    check(`${chrome} · ${name}: every text ≥ 4.5:1 (large ≥ 3:1), field borders ≥ 3:1`, bad.length === 0, bad.slice(0, 6).map(b => `${b.kind} ${b.ratio}<${b.need} ${b.sel} “${b.text ?? ''}” ${b.color}`).join(' | '));
    await p.close();
  }
  // the welcome card (first run)
  await kv('guide-seen', null);
  { const p = await browser.newPage(); await p.setViewport({ width: 1920, height: 1080 }); await p.goto(base + '/edit', { waitUntil: 'load' }); await sleep(1200); const bad = await p.evaluate(scan); check(`${chrome} · welcome card`, bad.length === 0, bad.slice(0, 6).map(b => `${b.kind} ${b.ratio}<${b.need} ${b.sel} “${b.text ?? ''}” ${b.color}`).join(' | ')); await p.close(); }
}
await kv('guide-seen', prev.seen ? JSON.parse(prev.seen) : null); await kv('chrome-theme', prev.chrome ? JSON.parse(prev.chrome) : null);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '\n      ' + r.detail : ''}`);
console.log(`\n${results.length - fails}/${results.length} passed`);
await browser.close(); process.exit(fails ? 1 : 0);
