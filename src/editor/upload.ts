import { create } from 'zustand';
import { api } from '@/api';
import { mediaFolderFor } from '@shared/media';
import { toast } from '@/store/toast';
import { useLibrary } from '@/store/library';
import { useUi } from './ui';

/** A file to copy into media/, with the folder path it came from ("1966 חתונה/ים"), or '' for a loose file. */
export interface Picked { file: File; dir: string }

interface UploadState { active: boolean; done: number; total: number; current: string; bytes: number; sentBytes: number; failed: string[] }
export const useUpload = create<UploadState>(() => ({ active: false, done: 0, total: 0, current: '', bytes: 0, sentBytes: 0, failed: [] }));

const dirOf = (p: string) => p.split('/').slice(0, -1).join('/');

/** From <input type=file webkitdirectory> or a plain multi-file picker. */
export function pickedFromInput(files: FileList | null): Picked[] {
  return Array.from(files ?? []).map(file => ({ file, dir: dirOf(file.webkitRelativePath || '') }));
}

function readDir(d: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = d.createReader(); const all: FileSystemEntry[] = [];
  // readEntries returns at most ~100 entries per call: keep reading until it returns none
  return new Promise((resolve, reject) => { const next = () => reader.readEntries(batch => { if (!batch.length) return resolve(all); all.push(...batch); next(); }, reject); next(); });
}
async function walk(e: FileSystemEntry, out: Picked[]) {
  if (e.isFile) { const file = await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)); out.push({ file, dir: dirOf(e.fullPath.replace(/^\/+/, '')) }); return; }
  if (e.isDirectory) for (const c of await readDir(e as FileSystemDirectoryEntry)) await walk(c, out);
}

/** Files and whole folders dropped from Explorer. The entries must be taken during the drop event itself; the walk happens after. */
export function pickedFromDrop(dt: DataTransfer): Promise<Picked[]> {
  const entries = Array.from(dt.items).filter(i => i.kind === 'file').map(i => i.webkitGetAsEntry?.() ?? null);
  const loose = Array.from(dt.files);
  if (!entries.length || entries.some(e => !e)) return Promise.resolve(loose.map(file => ({ file, dir: '' })));
  return (async () => { const out: Picked[] = []; for (const e of entries) { try { await walk(e!, out); } catch { /* unreadable entry: skip it */ } } return out; })();
}

/** Copy the picked files into media/ (three at a time), then scan. Files the app does not use are skipped and counted. */
export async function uploadPicked(picked: Picked[]) {
  if (useUpload.getState().active) return toast('העתקה כבר מתבצעת. המתינו שתסתיים', 'warn');
  const files = picked.filter(p => mediaFolderFor(p.file.name)); const ignored = picked.length - files.length;
  if (!files.length) return toast(picked.length ? `אין כאן תמונות, סרטונים או מוזיקה (${picked.length} קבצים אחרים)` : 'לא נבחרו קבצים', 'warn');
  const bytes = files.reduce((s, p) => s + p.file.size, 0);
  useUpload.setState({ active: true, done: 0, total: files.length, current: '', bytes, sentBytes: 0, failed: [] });
  const sentNow = new Map<number, number>(); let finishedBytes = 0; let copied = 0, repeated = 0; const failed: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++; const { file, dir } = files[i];
      useUpload.setState({ current: dir ? `${dir}/${file.name}` : file.name });
      try {
        const r = await api.upload(file, dir, sent => { sentNow.set(i, sent); useUpload.setState({ sentBytes: finishedBytes + [...sentNow.values()].reduce((a, b) => a + b, 0) }); });
        if (r.skipped) repeated++; else copied++;
      } catch (e) { failed.push(`${file.name}: ${(e as Error).message}`); }
      sentNow.delete(i); finishedBytes += file.size;
      useUpload.setState(s => ({ done: s.done + 1, sentBytes: finishedBytes + [...sentNow.values()].reduce((a, b) => a + b, 0), failed: [...failed] }));
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  useUpload.setState({ active: false, current: '' });
  const parts = [`${copied} קבצים הועתקו אל media/‎`, repeated ? `${repeated} כבר היו שם` : '', ignored ? `${ignored} קבצים שאינם מדיה דולגו` : ''].filter(Boolean);
  toast(parts.join(' · '), failed.length ? 'warn' : 'ok');
  if (failed.length) toast(`${failed.length} לא הועתקו: ${failed.slice(0, 2).join(' · ')}`, 'error');
  if (copied) { try { await api.startIngest(); } catch { /* a scan is running; the server queues another pass */ } useUi.getState().openDialog('ingest'); void useLibrary.getState().load(); }
}
