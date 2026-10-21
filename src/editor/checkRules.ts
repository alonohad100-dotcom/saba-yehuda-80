import { type Show, type Asset, slideSeconds, slideAssetIds, fmtTime, TYPE_LABEL, trackAt } from '@shared/model';

export interface Check { kind: 'ok' | 'warn' | 'bad'; text: string; slideId?: string; chapterId?: string }

export function runChecks(show: Show, assets: Record<string, Asset>, list: Asset[]): Check[] {
  const out: Check[] = []; let n = 0; const used = new Set<string>();
  for (const c of show.chapters) {
    if (!c.slides.length) out.push({ kind: 'warn', text: `פרק „${c.title}” ריק`, chapterId: c.id });
    const dur = c.slides.reduce((t, s) => t + slideSeconds(s, c, show.settings, assets), 0);
    const hasVisual = c.slides.some(s => s.type !== 'video' && s.type !== 'black');
    if (!c.musicId && !c.musicOff && hasVisual && !trackAt(show, c, c.slides[0]) && !c.slides.some(s => s.musicId)) out.push({ kind: 'warn', text: `פרק „${c.title}”: אין מוזיקה`, chapterId: c.id });
    if (c.musicId) { const m = assets[c.musicId]; if (!m) out.push({ kind: 'bad', text: `פרק „${c.title}”: קובץ המוזיקה לא נמצא`, chapterId: c.id }); else if (m.duration && m.duration - (c.musicStartSec ?? 0) < dur) out.push({ kind: 'warn', text: `פרק „${c.title}”: המוזיקה קצרה ב־${fmtTime(dur - (m.duration - (c.musicStartSec ?? 0)))} — תתבצע חזרה עם crossfade`, chapterId: c.id }); }
    for (const s of c.slides) { n++;
      for (const id of slideAssetIds(s)) { used.add(id); const a = assets[id]; if (!a) out.push({ kind: 'bad', text: `שקופית ${n} (${TYPE_LABEL[s.type]}): קובץ מדיה לא נמצא בספרייה`, slideId: s.id, chapterId: c.id }); else if (a.status === 'error') out.push({ kind: 'bad', text: `שקופית ${n}: הקובץ ${a.name} נכשל בעיבוד`, slideId: s.id, chapterId: c.id }); else if (a.status === 'processing') out.push({ kind: 'warn', text: `שקופית ${n}: ${a.name} עדיין בעיבוד`, slideId: s.id, chapterId: c.id }); }
      if (s.musicId && !assets[s.musicId]) out.push({ kind: 'bad', text: `שקופית ${n}: קובץ המוזיקה של השקופית לא נמצא`, slideId: s.id, chapterId: c.id });
      if (s.type === 'photo' && !s.caption) out.push({ kind: 'warn', text: `שקופית ${n} (${c.title}): תמונה ללא כיתוב`, slideId: s.id, chapterId: c.id });
      if (s.type === 'photo' && (s.seconds ?? 0) > 12) out.push({ kind: 'warn', text: `שקופית ${n}: ${s.seconds} שניות לתמונה אחת — ארוך`, slideId: s.id, chapterId: c.id });
      if (s.type === 'video' && !s.name) out.push({ kind: 'warn', text: `שקופית ${n}: ברכה ללא שם מברך/ת`, slideId: s.id, chapterId: c.id });
      if (s.type === 'collage' && s.assetIds.length < 3) out.push({ kind: 'warn', text: `שקופית ${n}: קולאז׳ עם פחות מ־3 תמונות`, slideId: s.id, chapterId: c.id });
      if (s.type === 'chapter' && !s.heroAssetId) out.push({ kind: 'warn', text: `שקופית ${n}: פרק „${s.label}” ללא תמונת רקע`, slideId: s.id, chapterId: c.id });
      if (s.type === 'names' && s.people.length === 0) out.push({ kind: 'warn', text: `שקופית ${n}: שקופית שמות ריקה`, slideId: s.id, chapterId: c.id });
    }
  }
  // auto-create related: the same photo twice, near-duplicates in one chapter, over-long chapters, adjacent videos
  const seen = new Map<string, number>(); let k = 0;
  for (const c of show.chapters) { const groupsInChapter = new Map<string, number>(); const dur = c.slides.reduce((t, s) => t + slideSeconds(s, c, show.settings, assets), 0);
    if (dur > 6 * 60) out.push({ kind: 'warn', text: `פרק „${c.title}” ארוך מ־6 דקות (${fmtTime(dur)})`, chapterId: c.id });
    for (let i = 0; i < c.slides.length; i++) { const s = c.slides[i]; k++;
      if (i > 0 && s.type === 'video' && c.slides[i - 1].type === 'video' && c.title !== 'ברכות') out.push({ kind: 'warn', text: `שקופית ${k}: שני סרטונים ברצף`, slideId: s.id, chapterId: c.id });
      if (s.type === 'timeline' || s.type === 'chapter' || s.type === 'names') continue;
      for (const id of slideAssetIds(s)) { const a = assets[id]; if (!a || a.type !== 'photo') continue; const prev = seen.get(id); if (prev != null) out.push({ kind: 'warn', text: `שקופית ${k}: התמונה ${a.name} כבר מופיעה בשקופית ${prev}`, slideId: s.id, chapterId: c.id }); else seen.set(id, k);
        const g = a.dupGroup ?? id; const pg = groupsInChapter.get(g); if (pg != null && pg !== k && seen.get(id) === k) out.push({ kind: 'warn', text: `שקופית ${k}: כמעט זהה לתמונה בשקופית ${pg} באותו פרק`, slideId: s.id, chapterId: c.id }); else if (pg == null) groupsInChapter.set(g, k); } } }
  const unusedVideos = list.filter(a => a.type === 'video' && a.status === 'ready' && !used.has(a.id));
  if (unusedVideos.length) out.push({ kind: 'warn', text: `${unusedVideos.length} סרטוני ברכה עדיין לא במצגת: ${unusedVideos.slice(0, 6).map(a => a.name.replace(/\.[^.]+$/, '')).join(', ')}${unusedVideos.length > 6 ? '…' : ''}` });
  const errs = list.filter(a => a.status === 'error'); if (errs.length) out.push({ kind: 'bad', text: `${errs.length} קבצים נכשלו בעיבוד (ראה חלון הקליטה)` });
  if (!out.length) out.push({ kind: 'ok', text: 'הכל תקין — המצגת מוכנה להצגה' });
  return out.sort((a, b) => (a.kind === 'bad' ? 0 : a.kind === 'warn' ? 1 : 2) - (b.kind === 'bad' ? 0 : b.kind === 'warn' ? 1 : 2));
}
