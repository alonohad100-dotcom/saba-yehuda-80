// Builds a complete demo show from whatever is in the library (grouped by decade) and saves it through the running server.
// Usage: node scripts/seed-demo-show.mjs   (server must be running on :4000). Saves a labelled version first so the previous show can be restored.
const base = 'http://127.0.0.1:4000';
const assets = await fetch(base + '/api/assets').then(r => r.json());
const photos = assets.filter(a => a.type === 'photo' && a.status === 'ready').sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
const videos = assets.filter(a => a.type === 'video' && a.status === 'ready');
const music = assets.filter(a => a.type === 'music' && a.status === 'ready');
if (!photos.length) { console.error('no photos in library — run `npm run sample-media` and `npm run ingest` first'); process.exit(1); }
const uid = (p = 's') => p + '-' + Math.random().toString(36).slice(2, 9);
const m = i => music[i % Math.max(1, music.length)]?.id;
const kb = ['in', 'out', 'left', 'right', 'up', 'down'];
const photo = (a, caption, i = 0) => ({ id: uid(), type: 'photo', assetId: a.id, caption, year: a.year, kenBurns: kb[i % kb.length], seconds: 6 });

const groups = [
  { title: 'ילדות ונעורים', sub: '1946–1964', label: 'שנות הארבעים והחמישים', blurb: 'ילד קטן בארץ צעירה', from: 0, to: 1965, caps: ['השנה הראשונה', 'עם אמא, בחצר', 'כיתה ד׳', 'הטיול השנתי', 'בר מצווה', 'סוף התיכון'] },
  { title: 'המשפחה', sub: '1965–1989', label: 'המשפחה גדלה', blurb: 'חתונה, בית, ארבעה ילדים', from: 1965, to: 1990, caps: ['יום החתונה', 'הדירה הראשונה', 'הבכור נולד', 'חופשה בכנרת', 'הבית החדש', 'שבת בבוקר'] },
  { title: 'העבודה והחברים', sub: '1990–2009', label: 'שנות העשייה', blurb: 'עבודה, חברים, נסיעות', from: 1990, to: 2010, caps: ['במשרד', 'עם החברים מהצבא', 'הנסיעה לאיטליה', 'יום הולדת 60'] },
  { title: 'הנכדים', sub: '2010–2026', label: 'סבא', blurb: 'תשעה נכדים ושתי נינות', from: 2010, to: 2100, caps: ['הנכדה הראשונה', 'חנוכה אצל סבא', 'בגן', 'יום הולדת 75', 'הנינה הראשונה', 'פסח האחרון'] },
];
const chapters = [];
chapters.push({ id: uid('ch'), title: 'פתיחה', musicId: m(0), slides: [
  { id: uid(), type: 'intro', title: 'יהודה', subtitle: 'חוגגים 80 · אוקטובר 2026', number: '80', seconds: 8, notes: 'לחכות שכולם יושבים. המוזיקה מתחילה לבד.' },
  { id: uid(), type: 'timeline', title: 'שמונים שנה בדקה', seconds: 14, milestones: [
    { year: 1946, label: 'נולד', assetId: photos[0]?.id }, { year: 1966, label: 'חתונה', assetId: photos.find(p => p.year >= 1966)?.id }, { year: 1971, label: 'ילד ראשון', assetId: photos.find(p => p.year >= 1971)?.id },
    { year: 1995, label: 'נכדה ראשונה', assetId: photos.find(p => p.year >= 1995)?.id }, { year: 2026, label: '80', assetId: photos[photos.length - 1]?.id }] },
]});
let gi = 0;
for (const g of groups) {
  const ps = photos.filter(p => (p.year ?? 0) >= g.from && (p.year ?? 0) < g.to); if (!ps.length) continue;
  const slides = [{ id: uid(), type: 'chapter', heroAssetId: ps[Math.min(1, ps.length - 1)].id, label: g.label, blurb: g.blurb, seconds: 6 }];
  ps.slice(0, 6).forEach((p, i) => slides.push(photo(p, g.caps[i] ?? '', i)));
  if (ps.length >= 4) slides.push({ id: uid(), type: 'collage', assetIds: ps.slice(-5).map(p => p.id), caption: g.sub, seconds: 9, heroIndex: 0 });
  if (gi === 1) slides.push({ id: uid(), type: 'quote', text: 'אבא לימד אותנו שאין דבר כזה ״אי אפשר״, יש רק ״עוד לא ניסינו מספיק״.', by: 'הילדים', seconds: 10 });
  if (gi === 0 && photos.length > 2) slides.push({ id: uid(), type: 'photo-pair', assetIds: [ps[0].id, photos[photos.length - 1].id], caption: 'אז · והיום', seconds: 7 });
  if (gi === 3) slides.push({ id: uid(), type: 'names', title: 'הנכדים', seconds: 9, people: ['נועה', 'איתי', 'מאיה', 'יונתן', 'תמר', 'עידו'].map((n, i) => ({ name: n, assetId: ps[i % ps.length]?.id })) });
  chapters.push({ id: uid('ch'), title: g.title, subtitle: g.sub, musicId: m(gi + 1), slides }); gi++;
}
if (videos.length) chapters.push({ id: uid('ch'), title: 'ברכות', musicId: m(1), slides: [
  { id: uid(), type: 'video-wall', title: 'ברכות מהנכדים והאחיינים', assetIds: videos.slice(0, 9).map(v => v.id), seconds: 8 },
  ...videos.map((v, i) => ({ id: uid(), type: 'video', assetId: v.id, name: v.name.replace(/\.[^.]+$/, ''), relation: i < 3 ? 'נכד/ה' : 'אחיין/ית', hold: false })),
]});
chapters.push({ id: uid('ch'), title: 'סיום', musicId: m(0), slides: [
  { id: uid(), type: 'finale', text: 'עד 120, אבא', number: '80', seconds: 14, notes: 'קונפטי — להזמין את כולם למחוא כפיים' },
  { id: uid(), type: 'black', caption: '(מחיאות כפיים)' },
]});
const show = { version: 1, meta: { title: 'סבא יהודה 80', subtitle: 'חוגגים שמונים', date: '2026-10-24', language: 'he' }, settings: { defaultSlideSeconds: 6, defaultTransition: 'fade', transitionSeconds: 0.9, duckLevel: 0.1, musicLevel: 0.7, safeMarginPct: 5, grainOnArchival: true, archivalBeforeYear: 1990 }, chapters };
// keep the previous show restorable
const prev = await fetch(base + '/api/show').then(r => r.json());
await fetch(base + '/api/show?label=' + encodeURIComponent('לפני טעינת מצגת הדוגמה'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prev) });
const r = await fetch(base + '/api/show?label=' + encodeURIComponent('מצגת דוגמה'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(show) });
if (!r.ok) { console.error('save failed', r.status, await r.text()); process.exit(1); }
const saved = await r.json();
console.log(`seeded: ${saved.chapters.length} chapters, ${saved.chapters.reduce((n, c) => n + c.slides.length, 0)} slides, ${videos.length} greetings, ${music.length} tracks`);
