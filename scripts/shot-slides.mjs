// Screenshot the first slide of each given type after its animation settles. Usage: node scripts/shot-slides.mjs <outDir> timeline,quote,collage [seconds]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const [out = 'shots', typesArg = 'intro', secs = '5'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const show = await fetch('http://127.0.0.1:4000/api/show').then(r => r.json());
const all = show.chapters.flatMap(c => c.slides);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const p = await browser.newPage(); await p.setViewport({ width: 1920, height: 1080 });
for (const t of typesArg.split(',')) {
  const s = all.find(x => x.type === t); if (!s) { console.log('no slide of type', t); continue; }
  await p.goto(`http://127.0.0.1:4000/show?from=${s.id}`, { waitUntil: 'networkidle0' }); await p.click('.startgate .btn');
  await new Promise(r => setTimeout(r, +secs * 1000)); await p.screenshot({ path: path.join(out, `${t}.png`) }); console.log('shot', t);
}
await browser.close();
