/**
 * Dry run of auto-create against the live library (reads the database directly, applies nothing).
 * Usage: npm run autoshow -- [--minutes 22] [--seed 1] [--apply]   (--apply saves through the running server with a labelled backup first)
 */
import { ensureDirs } from '../server/paths.ts';
import { openDb, listAssets } from '../server/db.ts';
import { loadShow } from '../server/show-store.ts';
import { generate } from '../shared/autoshow/generate.ts';
import { DEFAULT_OPTIONS } from '../shared/autoshow/types.ts';
import { fmtTime, TYPE_LABEL } from '../shared/model.ts';

ensureDirs(); openDb();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const assets = listAssets(); const show = loadShow();
const options = { ...DEFAULT_OPTIONS, targetMinutes: +(arg('--minutes') ?? 22), seed: +(arg('--seed') ?? 1) };
const t0 = performance.now(); const { show: out, report } = generate({ assets, options, settings: show.settings, meta: show.meta, existing: show });
console.log(`generated in ${(performance.now() - t0).toFixed(0)} ms · run ${report.runId}`);
console.log(`pool: ${report.pool.photosTotal} photos → ${report.pool.photosAfter} (dup −${report.pool.dupRemoved}, burst −${report.pool.burstRemoved}, quality −${report.pool.lowQualityRemoved}) · ${report.pool.greetings} greetings · ${report.pool.clips} clips · ${report.pool.music} tracks`);
console.log(`estimated ${fmtTime(report.estimatedSeconds)} / target ${fmtTime(report.targetSeconds)} · layouts: ${Object.entries(report.layoutsUsed).map(([l, n]) => `${l}×${n}`).join(' ')}`);
for (const c of out.chapters) console.log(`\n■ ${c.title}${c.subtitle ? ` (${c.subtitle})` : ''}${c.musicId ? ` ♪ ${assets.find(a => a.id === c.musicId)?.name}` : ''}\n   ${c.slides.map(s => TYPE_LABEL[s.type] + (s.type === 'collage' ? `[${s.assetIds.length}·${s.layout}]` : s.type === 'photo' ? `(${s.year ?? '?'})` : s.type === 'video' ? `(${s.name})` : '')).join(' → ')}`);
if (report.warnings.length) console.log('\nwarnings:\n - ' + report.warnings.join('\n - '));
if (process.argv.includes('--apply')) {
  const base = 'http://127.0.0.1:4000'; const prev = await fetch(base + '/api/show').then(r => r.json());
  await fetch(base + '/api/show?label=' + encodeURIComponent('לפני יצירה אוטומטית (CLI)'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prev) });
  const r = await fetch(base + '/api/show?label=' + encodeURIComponent('יצירה אוטומטית (CLI)'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) });
  console.log(r.ok ? '\napplied through the server' : `\napply failed: ${r.status} ${await r.text()}`);
}
