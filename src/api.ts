import type { Asset, Show } from '@shared/model';

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) } });
  if (!r.ok) { let detail = ''; try { detail = (await r.json()).detail || ''; } catch { /* ignore */ } throw new Error(`${r.status} ${r.statusText} ${detail}`.trim()); }
  return r.json() as Promise<T>;
}

export const api = {
  health: () => j<{ ok: boolean; assets: number; ingest: { running: boolean; phase: string }; faces: boolean; mediaDir: string }>('/api/health'),
  assets: () => j<Asset[]>('/api/assets'),
  patchAsset: (id: string, patch: { year?: number; focal?: [number, number] }) => j<Asset>(`/api/assets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  show: () => j<Show>('/api/show'),
  saveShow: (show: Show, label?: string) => j<Show>(`/api/show${label ? `?label=${encodeURIComponent(label)}` : ''}`, { method: 'PUT', body: JSON.stringify(show) }),
  versions: () => j<{ id: number; saved_at: number; label: string | null; slides: number; seconds: number }[]>('/api/show/versions'),
  version: (id: number) => j<Show>(`/api/show/versions/${id}`),
  restoreVersion: (id: number) => j<Show>(`/api/show/versions/${id}/restore`, { method: 'POST' }),
  labelVersion: (id: number, label: string) => j<{ ok: boolean }>(`/api/show/versions/${id}/label`, { method: 'POST', body: JSON.stringify({ label }) }),
  startIngest: () => j<IngestProgress>('/api/ingest', { method: 'POST' }),
  ingestStatus: () => j<IngestProgress>('/api/ingest/status'),
  analyze: () => j<{ analysed: number; dupGroups: number; burstGroups: number; faces: boolean }>('/api/analyze', { method: 'POST' }),
  groups: () => j<{ best: string; members: string[] }[]>('/api/groups'),
  exportEstimate: () => j<ExportEstimate>('/api/export/estimate'),
  startExport: (opts: { dest?: string; zip?: boolean }) => j<ExportProgress>('/api/export', { method: 'POST', body: JSON.stringify(opts) }),
  exportStatus: () => j<ExportProgress>('/api/export/status'),
  revealExport: () => j<{ ok: boolean }>('/api/export/reveal', { method: 'POST', body: '{}' }),
  kvGet: <T>(key: string) => j<{ key: string; value: string | null }>(`/api/kv/${key}`).then(r => (r.value ? (JSON.parse(r.value) as T) : null)),
  kvSet: (key: string, value: unknown) => j<{ ok: boolean }>(`/api/kv/${key}`, { method: 'PUT', body: JSON.stringify(value) }),
  /** Copy a file dropped on the library into media/<folder>/ (raw body; the server decides the folder by type when 'auto'). */
  upload: (file: File, folder: 'auto' | 'photos' | 'videos/greetings' | 'music' = 'auto') => fetch(`/api/upload?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(file.name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file }).then(async r => { if (!r.ok) throw new Error(`${r.status} ${(await r.json().catch(() => ({}))).detail ?? ''}`); return r.json() as Promise<{ ok: boolean; relPath: string }>; }),
};

export interface ExportEstimate { photos: number; videos: number; music: number; files: number; bytes: number; seconds: number; slides: number; missing: string[]; defaultDest: string; defaultFree?: number; drives: { root: string; free?: number }[]; dist: boolean }
export interface ExportProgress { running: boolean; phase: 'idle' | 'copy' | 'zip' | 'done' | 'error'; done: number; total: number; bytes: number; totalBytes: number; dir?: string; zip?: string; error?: string; missing: string[]; startedAt?: number; finishedAt?: number }
export interface IngestProgress { running: boolean; phase: string; done: number; total: number; current?: string; photos: number; videos: number; music: number; warnings: { file: string; message: string }[]; errors: number; startedAt?: number; finishedAt?: number; log: string[]; analyzeDone?: number; analyzeTotal?: number }

export function ingestEvents(on: (type: string, data: unknown) => void): () => void {
  const es = new EventSource('/api/ingest/events');
  for (const t of ['start', 'progress', 'log', 'done']) es.addEventListener(t, (e) => on(t, JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}
