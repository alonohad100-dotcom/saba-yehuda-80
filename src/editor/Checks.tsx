import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useShow } from '@/store/show';
import { useLibrary } from '@/store/library';
import { runChecks, type Check } from './checkRules';

export function useChecks(): Check[] {
  const show = useShow(s => s.show)!; const { assets, list } = useLibrary();
  return useMemo(() => runChecks(show, assets, list), [show, assets, list]);
}

/** The checks list (lives in the inspector's "בדיקות" tab). Clicking an item selects the slide or chapter it refers to. */
export function Checks() {
  const checks = useChecks(); const select = useShow(s => s.select);
  const bad = checks.filter(c => c.kind === 'bad').length, warn = checks.filter(c => c.kind === 'warn').length;
  return (
    <div className="panel-b" data-tour="checks">
      <div className="muted small" style={{ marginBottom: 10 }}>{bad ? `${bad} בעיות שחייבים לתקן` : ''}{bad && warn ? ' · ' : ''}{warn ? `${warn} אזהרות` : ''}{!bad && !warn ? 'הכל תקין. הרשימה מתעדכנת עם כל שינוי.' : ' · לחיצה קופצת לשקופית'}</div>
      <div className="checks">{checks.map((c, i) => <button key={i} className={`check ${c.kind}`} onClick={() => { if (c.slideId) select(c.chapterId ?? null, [c.slideId]); else if (c.chapterId) select(c.chapterId, []); }}>{c.kind === 'ok' ? <CheckCircle2 /> : c.kind === 'bad' ? <XCircle /> : <AlertTriangle />}<span>{c.text}</span></button>)}</div>
    </div>
  );
}
