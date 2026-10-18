import { THEMES, themeById } from '@shared/themes';

/** Theme cards: swatch strip (ground, text, accent), typeface sample "80", name and description. */
export function ThemeGrid({ value, onChange, allowInherit }: { value: string | undefined; onChange: (id: string | undefined) => void; allowInherit?: string }) {
  return (
    <div className="theme-grid">
      {allowInherit && <button className="theme-card" aria-pressed={value === undefined} onClick={() => onChange(undefined)}><div className="sw" style={{ background: 'var(--panel-3)', color: 'var(--fg-2)', fontFamily: 'var(--font)' }}>—<span className="n">{allowInherit}</span></div><div className="nm">כמו ההגדרה הכללית</div><div className="ds">ללא דריסה</div></button>}
      {THEMES.map(t => <button key={t.id} className="theme-card" aria-pressed={value === t.id} onClick={() => onChange(t.id)} title={t.description}>
        <div className="sw" style={{ background: `radial-gradient(ellipse at 50% 60%, ${t.bg1}, ${t.bg2} 80%)`, color: t.accent, fontFamily: t.fontNum }}>80<span className="n" style={{ color: t.fg, fontFamily: t.fontDisplay }}>יהודה</span><span className="ac" style={{ background: t.accent2 }} /></div>
        <div className="nm">{t.name}</div><div className="ds">{t.description}</div>
      </button>)}
    </div>
  );
}
export function ThemeSwatch({ id }: { id: string }) { const t = themeById(id); return <span className="theme-mini"><i style={{ background: t.accent, borderColor: t.fg }} />{t.name}</span>; }
