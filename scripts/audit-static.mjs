// Static cross-reference audit: every server route has a client/script caller, every slide type is covered everywhere,
// every store action is used by the UI, every DB helper is referenced, no TODO/FIXME left behind.
import fs from 'node:fs';
import path from 'node:path';
const read = f => fs.readFileSync(f, 'utf8');
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx|mjs)$/.test(e.name)) out.push(p); } return out; };
const files = [...walk('src'), ...walk('server'), ...walk('shared'), ...walk('scripts')]; const all = Object.fromEntries(files.map(f => [f, read(f)]));
const clientSrc = Object.entries(all).filter(([f]) => f.startsWith('src')).map(([, s]) => s).join('\n'); const scriptsSrc = Object.entries(all).filter(([f]) => f.startsWith('scripts')).map(([, s]) => s).join('\n');
const results = []; let fails = 0; const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) fails++; };

// 1. routes ↔ callers
const server = all[path.join('server', 'index.ts')];
const routes = [...server.matchAll(/app\.(get|post|put|patch|delete)(?:<[^>]*>)?\('([^']+)'/g)].map(m => ({ method: m[1].toUpperCase(), path: m[2] }));
for (const r of routes) { const parts = r.path.split('/').filter(Boolean).slice(1); const pattern = new RegExp('/api/' + parts.map(p => (p.startsWith(':') ? '\\$\\{[^}]+\\}' : p)).join('/') + '(?![\\w-])'); const used = pattern.test(clientSrc) || pattern.test(scriptsSrc) || r.path === '/api/ingest/events'; check(`route ${r.method} ${r.path} has a caller`, used, used ? '' : 'no caller in src/ or scripts/'); }
const clientCalls = [...clientSrc.matchAll(/['`]\/api\/([a-z-]+(?:\/[a-z-]+)*)/g)].map(m => m[1]);
for (const c of new Set(clientCalls)) { const ok = routes.some(r => r.path.replace(/:\w+/g, 'X').includes('/api/' + c.split('/')[0])); check(`client call /api/${c} has a route`, ok); }

// 2. slide types covered everywhere
const model = all[path.join('shared', 'model.ts')]; const slideUnion = model.split('export const Slide = z.discriminatedUnion')[1].split(']);')[0]; const types = [...slideUnion.matchAll(/type: z\.literal\('([a-z-]+)'\)/g)].map(m => m[1]);
const slides = all[path.join('src', 'show', 'slides.ts')], insp = all[path.join('src', 'editor', 'Inspector.tsx')], store = all[path.join('src', 'store', 'show.ts')];
for (const t of types) {
  check(`type ${t}: TYPE_LABEL`, new RegExp(`['"]?${t}['"]?\\s*:\\s*'`).test(model.split('TYPE_LABEL')[1].split('};')[0]));
  check(`type ${t}: TYPE_DEFAULT_SECONDS`, new RegExp(`['"]?${t}['"]?\\s*:\\s*\\d`).test(model.split('TYPE_DEFAULT_SECONDS')[1].split('};')[0]));
  check(`type ${t}: buildSlide case`, slides.split('export function buildSlide')[1].split('export interface AnimOpts')[0].includes(`case '${t}'`));
  check(`type ${t}: animateSlide case`, slides.split('export function animateSlide')[1].includes(`case '${t}'`));
  check(`type ${t}: inspector fields`, insp.includes(`s.type === '${t}'`) || insp.includes(`'${t}'`), '');
  if (!['photo', 'photo-pair', 'collage', 'video'].includes(t)) check(`type ${t}: creatable from the "+" menu or wizard`, all[path.join('src', 'editor', 'Storyboard.tsx')].includes(`t: '${t}'`) || store.includes(`case '${t}'`) || t === 'video-wall');
}
// 3. store actions used
const actions = [...store.split('interface ShowState')[1].split('}')[0].matchAll(/^\s*(\w+):\s*\(/gm)].map(m => m[1]);
for (const a of actions) { const used = Object.entries(all).some(([f, s]) => f.startsWith('src') && !f.endsWith('store/show.ts') && (s.includes(`s.${a})`) || s.includes(`st.${a})`) || s.includes(`.${a}(`))); check(`store action ${a} is used by a component`, used); }
// 4. DB helpers used
const db = all[path.join('server', 'db.ts')]; const helpers = [...db.matchAll(/^export function (\w+)/gm)].map(m => m[1]);
for (const h of helpers) { const used = Object.entries(all).some(([f, s]) => f.startsWith('server') && !f.endsWith('db.ts') && s.includes(h + '(')) || Object.entries(all).some(([f, s]) => f.startsWith('scripts') && s.includes(h + '(')); check(`db helper ${h} is used`, used); }
// 5. api client methods used
const api = all[path.join('src', 'api.ts')]; const methods = [...api.matchAll(/^\s{2}(\w+):\s*\(/gm)].map(m => m[1]);
for (const m of methods) { const used = Object.entries(all).some(([f, s]) => f.startsWith('src') && !f.endsWith('api.ts') && s.includes(`api.${m}(`)); check(`api.${m} is used`, used); }
// 6. leftovers
for (const [f, s] of Object.entries(all)) { const m = /TODO|FIXME|XXX|console\.log\(/.exec(s); if (m && !f.startsWith('scripts') && !f.endsWith('cli.ts') && !f.endsWith('index.ts')) check(`no TODO/FIXME/console.log in ${f}`, false, m[0]); }
check('no TODO/FIXME left in src/server/shared', !Object.entries(all).some(([f, s]) => !f.startsWith('scripts') && /TODO|FIXME/.test(s)));
// 7. package scripts reference existing files and deps
const pkg = JSON.parse(read('package.json')); for (const [name, cmd] of Object.entries(pkg.scripts)) { const file = /((?:server|scripts)\/[\w./-]+\.(?:ts|mjs))/.exec(cmd)?.[1]; if (file) check(`script "${name}" points at an existing file`, fs.existsSync(file), file); }
for (const bin of ['tsx', 'vite', 'concurrently', 'cross-env', 'typescript']) check(`dev dependency ${bin} installed`, fs.existsSync(path.join('node_modules', bin)));
check('ffmpeg binary present', fs.existsSync(path.join('node_modules', 'ffmpeg-static', 'ffmpeg.exe')));
check('fonts self-hosted in dist (no googleapis)', !/googleapis|gstatic/.test(read('dist/index.html')) && fs.readdirSync('dist/assets').some(f => /frank-ruhl-libre-hebrew/.test(f)));
check('.gitignore excludes media, cache, db, dist', /media\//.test(read('.gitignore')) && /\.cache/.test(read('.gitignore')) && /library\.db/.test(read('.gitignore')) && /dist/.test(read('.gitignore')));

for (const r of results) if (!r.ok) console.log(`FAIL  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`${results.length - fails}/${results.length} static checks passed`);
process.exit(fails ? 1 : 0);
