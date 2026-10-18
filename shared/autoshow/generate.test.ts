import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from './generate.ts';
import { DEFAULT_OPTIONS } from './types.ts';
import { mulberry32 } from './prng.ts';
import { Settings, slideAssetIds, slideSeconds, type Asset, type Show } from '../model.ts';

/** Synthetic library: 240 photos 1946–2026 in event and decade folders, 3 dup groups of 4, 2 bursts, 6 greetings, 2 clips, 3 tracks. */
function library(seed = 7): Asset[] {
  const rng = mulberry32(seed); const out: Asset[] = []; let n = 0;
  const hex = () => Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(rng() * 16)]).join('');
  const photo = (year: number, dir: string, extra: Partial<Asset> = {}): Asset => { const id = 'p' + (n++).toString(36).padStart(4, '0'); const portrait = rng() < 0.3; return { id, type: 'photo', relPath: `${dir}/IMG_${n}.jpg`, name: `IMG_${n}.jpg`, folder: dir.split('/').pop()!, bytes: 1e6, mtime: Date.UTC(year, 5, 1), width: portrait ? 1600 : 2400, height: portrait ? 2400 : 1600, year, yearSource: 'exif', takenAt: new Date(Date.UTC(year, Math.floor(rng() * 12), 1 + Math.floor(rng() * 27), 10, Math.floor(rng() * 60))).toISOString(), portrait, status: 'ready', dhash: hex(), quality: Math.round(rng() * 1000) / 1000, faceCount: rng() < 0.5 ? 1 : 0, dupGroup: id, burstGroup: id, isBest: true, ...extra }; };
  for (let y = 1946; y <= 2026; y++) for (let k = 0; k < (y > 2008 ? 5 : 2); k++) out.push(photo(y, y < 1960 ? 'photos/ילדות' : y >= 2008 ? 'photos/הנכדים' : `photos/${Math.floor(y / 10) * 10}s`));
  for (let k = 0; k < 10; k++) out.push(photo(1966, 'photos/1966 חתונה'));
  // dup groups: 4 photos sharing a group and near-identical hashes
  for (let g = 0; g < 3; g++) { const best = out[20 + g * 30]; for (let k = 1; k < 4; k++) out.push(photo(best.year!, 'photos/הנכדים', { dhash: best.dhash, dupGroup: best.id, isBest: false, quality: 0.2 })); }
  for (let g = 0; g < 2; g++) { const best = out[60 + g * 10]; for (let k = 1; k < 5; k++) out.push(photo(best.year!, best.relPath.slice(0, best.relPath.lastIndexOf('/')), { burstGroup: best.id, quality: 0.3 })); }
  for (let i = 0; i < 6; i++) out.push({ id: 'v' + i, type: 'video', relPath: `videos/greetings/נכד${i}.mp4`, name: `נכד${i}.mp4`, folder: 'greetings', bytes: 1e6, mtime: 0, duration: 8 + i, year: 2026, yearSource: 'mtime', portrait: true, status: 'ready' });
  for (let i = 0; i < 2; i++) out.push({ id: 'c' + i, type: 'video', relPath: `photos/הנכדים/VID_${i}.mp4`, name: `VID_${i}.mp4`, folder: 'הנכדים', bytes: 1e6, mtime: 0, duration: 5, year: 2015 + i, yearSource: 'folder', status: 'ready' });
  for (let i = 0; i < 3; i++) out.push({ id: 'm' + i, type: 'music', relPath: `music/t${i}.m4a`, name: `t${i}.m4a`, folder: 'music', bytes: 1e6, mtime: 0, duration: 150 + i * 60, yearSource: 'mtime', status: 'ready' });
  return out;
}
const settings = Settings.parse({}); const meta = { title: 'סבא יהודה 80', date: '2026-10-24', language: 'he' as const };
const allSlides = (s: Show) => s.chapters.flatMap(c => c.slides.map(sl => ({ sl, c })));

test('invariants of a full generation', () => {
  const assets = library(); const { show, report } = generate({ assets, options: { ...DEFAULT_OPTIONS, seed: 42 }, settings, meta });
  const byId = Object.fromEntries(assets.map(a => [a.id, a]));
  const used: string[] = []; for (const { sl } of allSlides(show)) for (const id of slideAssetIds(sl)) if (byId[id].type === 'photo' && sl.type !== 'timeline' && sl.type !== 'chapter') used.push(id);
  assert.equal(new Set(used).size, used.length, 'no photo used twice');
  for (const c of show.chapters) { const groups = c.slides.flatMap(slideAssetIds).map(id => byId[id]?.dupGroup).filter(Boolean); assert.equal(new Set(groups).size, groups.length, `no two near-duplicates in chapter ${c.title}`); }
  for (const c of show.chapters) for (let i = 1; i < c.slides.length; i++) { assert.ok(!(c.slides[i].type === 'collage' && c.slides[i - 1].type === 'collage'), 'no adjacent collages'); if (c.title !== 'ברכות') assert.ok(!(c.slides[i].type === 'video' && c.slides[i - 1].type === 'video'), 'no adjacent videos outside the greetings chapter'); }
  const greetCh = show.chapters.find(c => c.title === 'ברכות')!; assert.ok(greetCh && greetCh.slides[0].type === 'video-wall' && greetCh.slides.length === 7, 'greetings chapter: wall + 6 videos');
  const collages = allSlides(show).filter(x => x.sl.type === 'collage').map(x => x.sl as any); const layouts = collages.map(c => c.layout as string);
  for (let i = 1; i < layouts.length; i++) assert.notEqual(layouts[i], layouts[i - 1], 'no two consecutive collages share a layout: ' + layouts.join(','));
  for (let i = 0; i < layouts.length; i++) if ([3, 4].includes(collages[i].assetIds.length)) assert.ok(!layouts.slice(Math.max(0, i - 3), i).includes(layouts[i]), 'a 3–4 photo layout does not repeat within 3 collages: ' + layouts.join(','));
  assert.ok(new Set(layouts).size >= 3, 'at least three different layouts');
  const greetings = allSlides(show).filter(x => x.sl.type === 'video' && (x.sl as any).assetId.startsWith('v')); assert.equal(greetings.length, 6, 'every greeting used exactly once');
  const total = show.chapters.reduce((t, c) => t + c.slides.reduce((u, s) => u + slideSeconds(s, c, settings, byId), 0), 0);
  assert.ok(Math.abs(total - 22 * 60) / (22 * 60) <= 0.12, `duration ${Math.round(total)}s within ±12 % of 22 min`);
  assert.ok(report.pool.dupRemoved >= 9 && report.pool.burstRemoved >= 6, 'duplicates and bursts collapsed');
  assert.ok(show.chapters.length >= 6, 'enough chapters: ' + show.chapters.map(c => c.title).join(' | '));
  assert.ok(show.chapters.some(c => c.title.includes('חתונה')), 'event folder became a chapter');
  for (const c of show.chapters.filter(c => c.auto && c.title !== 'סיום' && c.title !== 'ברכות')) assert.ok(c.musicId, 'music assigned to ' + c.title);
  assert.ok(allSlides(show).every(x => x.sl.auto?.run === report.runId), 'all slides carry the run id');
});

test('determinism and seeds', () => {
  const assets = library(); const a = generate({ assets, options: { ...DEFAULT_OPTIONS, seed: 5 }, settings, meta }), b = generate({ assets, options: { ...DEFAULT_OPTIONS, seed: 5 }, settings, meta }), c = generate({ assets, options: { ...DEFAULT_OPTIONS, seed: 6 }, settings, meta });
  const sig = (s: Show) => allSlides(s).map(x => x.sl.type + ':' + slideAssetIds(x.sl).join('+')).join('|');
  assert.equal(sig(a.show), sig(b.show), 'same seed → same show'); assert.notEqual(sig(a.show), sig(c.show), 'different seed → different show');
});

test('regenerate keeps locked slides and chapters, replaces everything else', () => {
  const assets = library(); const first = generate({ assets, options: { ...DEFAULT_OPTIONS, seed: 1 }, settings, meta }).show;
  const ch = first.chapters[2]; const lockedSlide = ch.slides[1]; lockedSlide.locked = true; const handMade = { id: 'hand', type: 'quote' as const, text: 'ידני', seconds: 5 }; ch.slides.push(handMade); first.chapters[3].locked = true;
  const second = generate({ assets, options: { ...DEFAULT_OPTIONS, seed: 2 }, settings, meta, existing: first }).show;
  const all = allSlides(second).map(x => x.sl);
  assert.ok(all.some(s => s.id === lockedSlide.id), 'locked slide kept'); assert.ok(!all.some(s => s.id === 'hand'), 'unlocked hand-made slide is replaced on a full replace');
  assert.ok(second.chapters.some(c => c.id === first.chapters[3].id), 'locked chapter kept'); assert.equal(second.chapters.indexOf(second.chapters.find(c => c.id === first.chapters[3].id)!), 3, 'locked chapter keeps its position');
  const lockedAssets = new Set(slideAssetIds(lockedSlide)); const others = all.filter(s => s.id !== lockedSlide.id).flatMap(slideAssetIds); assert.ok(others.every(id => !lockedAssets.has(id)), 'locked photo not reused elsewhere');
});

test('fill one chapter keeps its identity and avoids photos used elsewhere', () => {
  const assets = library(); const first = generate({ assets, options: { ...DEFAULT_OPTIONS, seed: 1 }, settings, meta }).show;
  const target = first.chapters[2]; const elsewhere = new Set(first.chapters.filter(c => c !== target).flatMap(c => c.slides.flatMap(slideAssetIds)));
  const { show } = generate({ assets, options: { ...DEFAULT_OPTIONS, seed: 9, yearFrom: 1960, yearTo: 1979, targetMinutes: 4 }, settings, meta, existing: first, mode: 'fill', fillChapterId: target.id });
  const filled = show.chapters.find(c => c.id === target.id)!; assert.ok(filled && filled.title === target.title && filled.musicId === target.musicId, 'chapter identity kept');
  assert.ok(filled.slides.flatMap(slideAssetIds).every(id => !elsewhere.has(id) || assets.find(a => a.id === id)?.type !== 'photo'), 'no photo already used elsewhere');
  assert.equal(show.chapters.length, first.chapters.length, 'other chapters untouched');
});

test('interleaved greetings never sit next to each other', () => {
  const { show } = generate({ assets: library(), options: { ...DEFAULT_OPTIONS, seed: 3, greetingsMode: 'interleave', greetingsEveryMin: 2 }, settings, meta });
  const vids = allSlides(show).filter(x => x.sl.type === 'video').length; assert.equal(vids, 8, 'all greetings and clips present');
  for (const c of show.chapters) for (let i = 1; i < c.slides.length; i++) assert.ok(!(c.slides[i].type === 'video' && c.slides[i - 1].type === 'video'));
});
