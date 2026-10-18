import { ensureDirs } from './paths.ts';
import { openDb, listAssets } from './db.ts';
import { runIngest, events } from './ingest/index.ts';

ensureDirs(); openDb();
const cmd = process.argv[2];
if (cmd === 'ingest') {
  events.on('event', (ev: { type: string; data: unknown }) => { if (ev.type === 'log') console.log(ev.data); });
  const p = await runIngest();
  console.log(`\n${p.phase}: ${p.done}/${p.total} · ${p.photos} photos · ${p.videos} videos · ${p.music} music · ${p.warnings.length} warnings · ${p.errors} errors · ${(((p.finishedAt ?? 0) - (p.startedAt ?? 0)) / 1000).toFixed(1)}s`);
  console.log(`library: ${listAssets().length} assets`);
} else if (cmd === 'list') {
  for (const a of listAssets()) console.log(a.type.padEnd(6), a.id, String(a.year ?? '').padEnd(4), a.yearSource.padEnd(6), a.status.padEnd(10), a.relPath, a.duration ? `${a.duration}s` : `${a.width}x${a.height}`);
} else {
  console.log('usage: tsx server/cli.ts ingest|list');
}
