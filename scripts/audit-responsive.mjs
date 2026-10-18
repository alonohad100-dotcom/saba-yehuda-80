// Responsive audit of the chrome: at each width the top bar must not overflow or clip, the primary "play" button must be fully on screen,
// side panels must be usable (≥ 240 px) or, below 1180 px, available as drawers that open; presenter and guide must not scroll sideways.
// Usage: node scripts/audit-responsive.mjs [outDir]     (server on :4000)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2] || '.audit/responsive'; fs.mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const base = 'http://127.0.0.1:4000'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const kv = (k, v) => fetch(`${base}/api/kv/${k}`, v === undefined ? undefined : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }).then(r => r.json());
const prevSeen = (await kv('guide-seen')).value; await kv('guide-seen', { at: 'responsive-audit' });
const browser = await puppeteer.launch({ executablePath: exe, headless: true });
const results = []; let fails = 0; const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) fails++; };
for (const [w, h] of [[1920, 1080], [1600, 900], [1366, 768], [1280, 720], [1180, 820], [1024, 768]]) {
  const p = await browser.newPage(); await p.setViewport({ width: w, height: h }); await p.goto(base + '/edit', { waitUntil: 'load' }); await sleep(1200);
  await p.evaluate(() => document.querySelector('.slides .slide')?.click()); await sleep(300);
  const m = await p.evaluate(() => { const tb = document.querySelector('.topbar'); const play = document.querySelector('[data-tour="play"]').getBoundingClientRect(); const lib = document.querySelector('.lib').getBoundingClientRect(); const insp = document.querySelector('.insp').getBoundingClientRect(); const kids = [...tb.querySelectorAll('.btn, .brand, .totals, .savestate')].filter(e => e.offsetParent); const clipped = kids.filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).length; return { overflow: tb.scrollWidth - tb.clientWidth, playIn: play.left >= 0 && play.right <= innerWidth, clipped, libW: Math.round(lib.width), inspW: Math.round(insp.width), docOverflow: document.documentElement.scrollWidth - innerWidth, previewTools: (() => { const pt = document.querySelector('.preview-tools'); return pt.scrollWidth - pt.clientWidth; })() }; });
  check(`${w}×${h}: top bar fits (no overflow, nothing clipped, play button on screen)`, m.overflow <= 0 && m.clipped === 0 && m.playIn, JSON.stringify(m));
  check(`${w}×${h}: no horizontal page scroll; preview toolbar fits`, m.docOverflow <= 0 && m.previewTools <= 0, JSON.stringify({ doc: m.docOverflow, tools: m.previewTools }));
  if (w > 1180) check(`${w}×${h}: library and inspector usable (≥ 240 px)`, m.libW >= 240 && m.inspW >= 240, `${m.libW} / ${m.inspW}`);
  else {
    const before = await p.evaluate(() => { const r = document.querySelector('.lib').getBoundingClientRect(); return r.right <= 0 || r.left >= innerWidth; });
    await p.evaluate(() => document.querySelector('.drawer-tabs.start .btn')?.click()); await sleep(450);
    const libOpen = await p.evaluate(() => { const r = document.querySelector('.lib').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.width >= 240; });
    await p.evaluate(() => document.querySelector('.drawer-tabs.end .btn')?.click()); await sleep(450);
    const inspOpen = await p.evaluate(() => { const r = document.querySelector('.insp').getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.width >= 240; });
    check(`${w}×${h}: library and inspector are drawers that open from their buttons`, before && libOpen && inspOpen, JSON.stringify({ hiddenFirst: before, libOpen, inspOpen }));
  }
  if (w >= 1280) {
    // every control of the inspector must stay inside the panel, for each kind of slide and for a chapter
    for (const type of ['photo', 'collage', 'video', 'timeline', 'quote', 'names', 'chapter-row']) {
      if (type === 'chapter-row') await p.evaluate(() => document.querySelector('.ch-head')?.click()); else await p.evaluate((t) => document.querySelector(`.slide[data-type="${t}"]`)?.click(), type);
      await sleep(350);
      const spill = await p.evaluate(() => { const box = document.querySelector('.insp').getBoundingClientRect(); return [...document.querySelectorAll('.insp .panel-b *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.left < box.left - 1 || r.right > box.right + 1); }).map(e => `${e.tagName}.${typeof e.className === 'string' ? e.className : ''} ${(e.textContent || '').trim().slice(0, 16)}`).slice(0, 4); });
      check(`${w}×${h}: inspector (${type}) keeps every control inside the panel`, spill.length === 0, spill.join(' | '));
    }
  }
  await p.screenshot({ path: path.join(out, `editor-${w}.png`) }); await p.close();
  for (const url of ['/presenter', '/guide']) { const q = await browser.newPage(); await q.setViewport({ width: w, height: h }); await q.goto(base + url, { waitUntil: 'load' }); await sleep(900); const o = await q.evaluate(() => document.documentElement.scrollWidth - innerWidth); check(`${w}×${h}: ${url} has no horizontal scroll`, o <= 0, String(o)); if (w === 1024) await q.screenshot({ path: path.join(out, `${url.slice(1)}-${w}.png`) }); await q.close(); }
}
// interactions: drag the panel edges, story zoom, slider fill
{ const p = await browser.newPage(); await p.setViewport({ width: 1920, height: 1080 }); await p.goto(base + '/edit', { waitUntil: 'load' }); await sleep(1200); await p.evaluate(() => document.querySelector('.slides .slide')?.click()); await sleep(300);
  const w0 = await p.evaluate(() => [document.querySelector('.lib').getBoundingClientRect().width, document.querySelector('.insp').getBoundingClientRect().width]);
  const lr = await (await p.$('.lib .vresizer')).boundingBox(); await p.mouse.move(lr.x + lr.width / 2, lr.y + 200); await p.mouse.down(); await p.mouse.move(lr.x + lr.width / 2 - 60, lr.y + 200, { steps: 6 }); await p.mouse.up(); await sleep(200);
  const ir = await (await p.$('.insp .vresizer')).boundingBox(); await p.mouse.move(ir.x + ir.width / 2, ir.y + 200); await p.mouse.down(); await p.mouse.move(ir.x + ir.width / 2 + 50, ir.y + 200, { steps: 6 }); await p.mouse.up(); await sleep(200);
  const w1 = await p.evaluate(() => [document.querySelector('.lib').getBoundingClientRect().width, document.querySelector('.insp').getBoundingClientRect().width]);
  check('dragging the inner edges resizes the library and the inspector', Math.abs(w1[0] - w0[0] - 60) <= 4 && Math.abs(w1[1] - w0[1] - 50) <= 4, JSON.stringify({ w0, w1 }));
  const c0 = await p.evaluate(() => document.querySelector('.slides .slide').getBoundingClientRect().width); await p.evaluate(() => { const r = document.querySelector('.story-foot .zoom input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '200'); r.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(300); const c1 = await p.evaluate(() => document.querySelector('.slides .slide').getBoundingClientRect().width);
  check('storyboard zoom changes the card size', Math.round(c1) === 200 && c1 > c0, `${c0} → ${c1}`);
  const fill = await p.evaluate(() => { const r = [...document.querySelectorAll('.insp input[type=range]')][0]; return r ? r.style.getPropertyValue('--fill') : 'none'; }); check('sliders carry a filled-track value', /%$/.test(fill), fill);
  await p.evaluate(() => { localStorage.removeItem('sy80.libW'); localStorage.removeItem('sy80.inspW'); localStorage.removeItem('sy80.storyZoom'); }); await p.close(); }
await kv('guide-seen', prevSeen ? JSON.parse(prevSeen) : null);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  — ' + r.detail}`);
console.log(`\n${results.length - fails}/${results.length} passed`);
await browser.close(); process.exit(fails ? 1 : 0);
