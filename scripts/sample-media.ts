/**
 * Generates stand-in media so the whole pipeline (ingest → editor → show) can be exercised before the real
 * photos arrive. Output goes to media/sample-* folders; delete those folders when the real library lands.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { MEDIA_DIR, ensureDirs } from '../server/paths.ts';
import { run } from '../server/ingest/ffmpeg.ts';

ensureDirs();
const rnd = (seed: number) => { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

function stillSvg(seed: number, year: number, w: number, h: number, label: string): string {
  const r = rnd(seed * 31 + year);
  const era = year < 1962 ? 'bw' : year < 1982 ? 'faded' : year < 2002 ? 'film' : 'digital';
  const pal = { bw: ['#d9d4c6', '#8a867b', '#6d685d', '#2b2924', '#1c1a17'], faded: ['#e7c9a0', '#b08a68', '#9c7a55', '#4a3a2a', '#2a1e16'], film: ['#9fc3e0', '#4f7faa', '#7e9a52', '#2f4a24', '#1b2430'], digital: ['#bcd9ef', '#6aa5d8', '#89b06a', '#3a6a35', '#202a38'] }[era];
  const hill = (k: number) => { const base = h * (0.5 + k * 0.09); let d = `M0 ${h} L0 ${base}`; for (let i = 0; i <= w; i += 24) d += ` L${i} ${(base - Math.sin(i / w * Math.PI * (1.5 + k) + k) * h * 0.06 - Math.sin(i / w * 9 + k) * h * 0.015).toFixed(1)}`; return d + ` L${w} ${h} Z`; };
  const n = 1 + Math.floor(r() * 4); const cx0 = w * (0.3 + r() * 0.4); let figs = '';
  for (let i = 0; i < n; i++) { const fh = h * (0.28 + r() * 0.12); const cx = cx0 + (i - (n - 1) / 2) * w * 0.1; const by = h * 0.9; figs += `<rect x="${cx - fh * 0.16}" y="${by - fh * 0.72}" width="${fh * 0.32}" height="${fh * 0.72}" rx="${fh * 0.1}" fill="${pal[4]}" opacity=".92"/><circle cx="${cx}" cy="${by - fh * 0.84}" r="${fh * 0.12}" fill="${pal[4]}" opacity=".92"/>`; }
  // scenery detail so every still has its own structure (trees, houses, a road) — keeps perceptual hashes apart like real photos
  let detail = ''; const nd = 3 + Math.floor(r() * 5);
  for (let i = 0; i < nd; i++) { const kind = r(); const x = r() * w, y = h * (0.55 + r() * 0.3), s = h * (0.04 + r() * 0.08); detail += kind < 0.4 ? `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(s * 0.6).toFixed(0)}" ry="${s.toFixed(0)}" fill="${pal[3]}" opacity=".8"/>` : kind < 0.75 ? `<rect x="${x.toFixed(0)}" y="${(y - s * 0.6).toFixed(0)}" width="${(s * 1.4).toFixed(0)}" height="${(s * 0.9).toFixed(0)}" fill="${pal[2]}" opacity=".85"/><polygon points="${x.toFixed(0)},${(y - s * 0.6).toFixed(0)} ${(x + s * 0.7).toFixed(0)},${(y - s * 1.2).toFixed(0)} ${(x + s * 1.4).toFixed(0)},${(y - s * 0.6).toFixed(0)}" fill="${pal[4]}" opacity=".8"/>` : `<path d="M${x.toFixed(0)} ${h} Q${(x + w * 0.1).toFixed(0)} ${(y + s).toFixed(0)} ${(x + w * 0.25).toFixed(0)} ${y.toFixed(0)}" stroke="${pal[0]}" stroke-width="${(s * 0.25).toFixed(0)}" fill="none" opacity=".35"/>`; }
  const tone = era === 'bw' ? `<rect width="${w}" height="${h}" fill="#d9c6a3" opacity=".35" style="mix-blend-mode:multiply"/>` : era === 'faded' ? `<rect width="${w}" height="${h}" fill="#785028" opacity=".18"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[1]}"/></linearGradient>
  <radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <circle cx="${w * (0.2 + r() * 0.6)}" cy="${h * (0.15 + r() * 0.2)}" r="${w * 0.05}" fill="#fff6d8" opacity=".55"/>
  <path d="${hill(0)}" fill="${pal[1]}" opacity=".7"/><path d="${hill(1)}" fill="${pal[2]}"/><path d="${hill(2)}" fill="${pal[3]}"/>
  ${detail}${figs}
  <rect width="${w}" height="${h}" fill="url(#vig)"/>${tone}
  <text x="${w - 28}" y="${h - 22}" font-family="Arial, Noto Sans Hebrew, sans-serif" font-size="${Math.round(h * 0.035)}" fill="#fff" fill-opacity=".55" text-anchor="end" direction="rtl">${label} · ${year} · דוגמה</text>
  ${era !== 'digital' ? `<rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="#fff8e8" stroke-width="10" opacity=".9"/>` : ''}
</svg>`;
}

async function photos() {
  const plan: { folder: string; years: number[]; exif: boolean }[] = [
    { folder: 'sample-photos/ילדות 1946-1959', years: [1947, 1949, 1951, 1953, 1956, 1958], exif: false },
    { folder: 'sample-photos/שנות ה-60', years: [1961, 1963, 1964, 1966, 1968], exif: false },
    { folder: 'sample-photos/1966 חתונה', years: [1966, 1966, 1966], exif: false },
    { folder: 'sample-photos/המשפחה 1970s', years: [1971, 1973, 1974, 1977, 1979], exif: true },
    { folder: 'sample-photos/1980s', years: [1980, 1983, 1986, 1989], exif: true },
    { folder: 'sample-photos/1990s', years: [1992, 1995, 1998], exif: true },
    { folder: 'sample-photos/2000s', years: [2003, 2006, 2008], exif: true },
    { folder: 'sample-photos/הנכדים', years: [2011, 2014, 2017, 2019, 2021, 2023, 2024, 2025, 2026], exif: true },
  ];
  let n = 0;
  for (const p of plan) {
    const dir = path.join(MEDIA_DIR, p.folder); fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < p.years.length; i++) {
      const y = p.years[i]; const portrait = (n % 5 === 3); const w = portrait ? 1600 : 2400, h = portrait ? 2400 : 1600;
      const file = path.join(dir, `${y < 1990 ? 'scan' : 'IMG'}_${String(1000 + n * 37)}.jpg`);
      if (fs.existsSync(file)) { n++; continue; }
      let img = sharp(Buffer.from(stillSvg(n + 1, y, w, h, path.basename(p.folder)))).jpeg({ quality: 88 });
      if (p.exif) img = img.withExif({ IFD0: { Make: 'Sample', Model: 'Generated' }, IFD2: { DateTimeOriginal: `${y}:${String(3 + (n % 9)).padStart(2, '0')}:${String(5 + (n % 20)).padStart(2, '0')} 10:00:00` } });
      await img.toFile(file); n++;
    }
  }
  console.log(`photos: ${n}`);
  // ---- planted test cases for the auto-create feature ----
  const dir = path.join(MEDIA_DIR, 'sample-photos', 'הנכדים'); fs.mkdirSync(dir, { recursive: true });
  const base = Buffer.from(stillSvg(7, 2019, 2400, 1600, 'הנכדים'));
  const write = async (name: string, img: Sharp, exifYear = 2019, minute = 10) => { const file = path.join(dir, name); if (!fs.existsSync(file)) await img.jpeg({ quality: 88 }).withExif({ IFD2: { DateTimeOriginal: `${exifYear}:06:12 10:${String(minute).padStart(2, '0')}:00` } }).toFile(file); };
  // exact duplicates (re-exports of one photo): same hash, different bytes
  await write('IMG_9001.jpg', sharp(base)); await write('IMG_9001 (1).jpg', sharp(base).jpeg({ quality: 70 })); await write('IMG_9001-whatsapp.jpg', sharp(base).resize(1600)); await write('IMG_9001 copy.jpg', sharp(base).modulate({ brightness: 1.03 }));
  // a burst: 5 frames seconds apart with a slightly moving sun
  for (let i = 0; i < 5; i++) { const svg = stillSvg(7, 2019, 2400, 1600, 'הנכדים').replace(/<circle cx="([\d.]+)"/, (_m, cx) => `<circle cx="${(+cx + i * 18).toFixed(1)}"`); const file = path.join(dir, `IMG_9100${i}.jpg`); if (!fs.existsSync(file)) await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).withExif({ IFD2: { DateTimeOriginal: `2019:06:12 10:20:${String(i * 3).padStart(2, '0')}` } }).toFile(file); }
  // a blurry frame and a dark frame
  await write('IMG_9200-blurry.jpg', sharp(Buffer.from(stillSvg(11, 2021, 2400, 1600, 'הנכדים'))).blur(12), 2021, 30);
  await write('IMG_9201-dark.jpg', sharp(Buffer.from(stillSvg(12, 2021, 2400, 1600, 'הנכדים'))).modulate({ brightness: 0.12 }), 2021, 31);
  console.log('planted: 4 duplicates, 1 burst of 5, 1 blurry, 1 dark');
}

async function clips() {
  // short clips inside a photo folder (phone videos next to photos) — treated as photos in the flow by auto-create
  const dir = path.join(MEDIA_DIR, 'sample-photos', 'הנכדים'); fs.mkdirSync(dir, { recursive: true });
  for (const [name, hue] of [['VID_2021_חנוכה.mp4', 200], ['VID_2024_גן.mp4', 320]] as [string, number][]) {
    const file = path.join(dir, name); if (fs.existsSync(file)) continue;
    const r = await run(['-y', '-hide_banner', '-f', 'lavfi', '-i', `color=c=0x${hsl(hue)}:s=1280x720:d=4:r=30`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
    if (r.code !== 0) throw new Error('clip sample failed');
  }
  console.log('clips: 2');
}

async function videos() {
  const names = ['נועה', 'איתי', 'מאיה', 'יונתן', 'תמר', 'עידו'];
  const dir = path.join(MEDIA_DIR, 'videos', 'greetings'); fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < names.length; i++) {
    const file = path.join(dir, `${names[i]}.mp4`); if (fs.existsSync(file)) continue;
    const portrait = i !== 2; const w = portrait ? 720 : 1280, h = portrait ? 1280 : 720; const dur = 6 + i;
    const overlay = path.join(dir, `.overlay-${i}.png`);
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#000" opacity="0"/><text x="${w / 2}" y="${h / 2}" font-family="Arial, Noto Sans Hebrew, sans-serif" font-size="${Math.round(w * 0.12)}" fill="#fff" text-anchor="middle" direction="rtl">${names[i]}</text><text x="${w / 2}" y="${h / 2 + w * 0.1}" font-family="Arial, sans-serif" font-size="${Math.round(w * 0.05)}" fill="#f1d38a" text-anchor="middle" direction="rtl">ברכה לדוגמה · ${dur} שניות</text></svg>`)).png().toFile(overlay);
    const hue = 20 + i * 50; const vol = [0.9, 0.2, 0.6, 1.0, 0.35, 0.7][i]; // deliberately uneven loudness for loudnorm to fix
    const r = await run(['-y', '-hide_banner', '-f', 'lavfi', '-i', `color=c=0x${hsl(hue)}:s=${w}x${h}:d=${dur}:r=30`, '-f', 'lavfi', '-i', `sine=frequency=${300 + i * 60}:duration=${dur}`, '-i', overlay,
      '-filter_complex', `[0:v][2:v]overlay=0:0,format=yuv420p[v];[1:a]volume=${vol},tremolo=f=3:d=0.6[a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-c:a', 'aac', '-b:a', '96k', '-shortest', file]);
    fs.unlinkSync(overlay);
    if (r.code !== 0) throw new Error('video sample failed: ' + r.stderr.split('\n').slice(-5).join(' | '));
  }
  console.log(`videos: ${names.length}`);
}
function hsl(h: number): string { const s = .45, l = .35; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join(''); }

async function music() {
  const dir = path.join(MEDIA_DIR, 'music'); fs.mkdirSync(dir, { recursive: true });
  const tracks: [string, string][] = [
    ['01 ערב של שושנים (דוגמה).m4a', '0.18*sin(220*2*PI*t)*(0.7+0.3*sin(0.4*t))+0.12*sin(277.18*2*PI*t)*(0.7+0.3*sin(0.3*t+1))+0.12*sin(329.63*2*PI*t)*(0.7+0.3*sin(0.5*t+2))+0.08*sin(110*2*PI*t)'],
    ['02 הכניסיני תחת כנפך (דוגמה).m4a', '0.18*sin(196*2*PI*t)*(0.7+0.3*sin(0.35*t))+0.12*sin(246.94*2*PI*t)*(0.7+0.3*sin(0.25*t+1))+0.12*sin(293.66*2*PI*t)*(0.7+0.3*sin(0.45*t+2))+0.08*sin(98*2*PI*t)'],
    ['03 שיר לשלום (דוגמה).m4a', '0.18*sin(174.61*2*PI*t)*(0.7+0.3*sin(0.3*t))+0.12*sin(220*2*PI*t)*(0.7+0.3*sin(0.2*t+1))+0.12*sin(261.63*2*PI*t)*(0.7+0.3*sin(0.4*t+2))+0.08*sin(87.3*2*PI*t)'],
  ];
  for (const [name, expr] of tracks) {
    const file = path.join(dir, name); if (fs.existsSync(file)) continue;
    const r = await run(['-y', '-hide_banner', '-f', 'lavfi', '-i', `aevalsrc=${expr}:d=75:s=48000`, '-af', 'afade=t=in:d=3,afade=t=out:st=70:d=5,lowpass=f=900', '-c:a', 'aac', '-b:a', '128k', file]);
    if (r.code !== 0) throw new Error('music sample failed: ' + r.stderr.split('\n').slice(-5).join(' | '));
  }
  console.log(`music: ${tracks.length}`);
}

await photos(); await videos(); await music(); await clips();
console.log('sample media written to', MEDIA_DIR);
