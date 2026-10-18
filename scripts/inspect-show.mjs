// Steps through every slide of the show headlessly, screenshots each, and reports video/audio state. Usage: node scripts/inspect-show.mjs <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2] || 'inspect-show'; fs.mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1920,1080', '--mute-audio'] });
const p = await browser.newPage(); await p.setViewport({ width: 1920, height: 1080 });
const errors = []; p.on('pageerror', e => errors.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); }); p.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
await p.goto('http://127.0.0.1:4000/show', { waitUntil: 'networkidle0' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.click('.startgate .btn'); await sleep(2500);
const total = await p.evaluate(() => +document.querySelector('.hud .num')?.textContent.split('/')[1]);
console.log('total slides', total);
let i = 1;
while (true) {
  const st = await p.evaluate(() => { const sl = document.querySelector('.layer[style*="z-index: 2"] .sl'); const v = sl?.querySelector('video'); const audio = [...document.querySelectorAll('audio')]; return { cls: sl?.className, hud: document.querySelector('.hud')?.textContent, video: v ? { paused: v.paused, t: +v.currentTime.toFixed(1), dur: +v.duration.toFixed(1), vol: v.volume, w: v.videoWidth, h: v.videoHeight } : null, ended: !!document.querySelector('.endcard') }; });
  await p.screenshot({ path: path.join(out, `slide-${String(i).padStart(2, '0')}-${(st.cls || '').replace('sl ', '')}.png`) });
  console.log(i, JSON.stringify(st));
  if (st.ended || i >= total) break;
  if (st.video) await sleep(2500);
  await p.keyboard.press('ArrowRight'); await sleep(st.cls?.includes('timeline') || st.cls?.includes('finale') ? 4500 : 2300); i++;
}
console.log('issues:', errors.length ? errors : 'none');
await browser.close();
