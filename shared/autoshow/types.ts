import type { Asset, Show } from '../model';

export interface AutoOptions {
  folders: string[];            // directory prefixes under media/ to include; empty = everything
  yearFrom?: number; yearTo?: number;
  includeGreetings: boolean;    // media/videos/greetings
  includeClips: boolean;        // short videos (< 20 s) found inside photo folders
  dropLowQuality: boolean;
  targetMinutes: number;
  chapterMode: 'auto' | 'folder' | 'decade';
  pacing: 'calm' | 'normal' | 'dynamic';
  collageDensity: 'none' | 'some' | 'many';
  pairs: boolean; timeline: boolean; quotes: boolean; names: boolean;
  greetingsMode: 'chapter' | 'interleave'; greetingsEveryMin: number; greetingsPosition: 'beforeFinale' | 'afterIntro';
  musicMode: 'roundRobin' | 'single' | 'none'; musicId?: string; preferLongTrack: boolean;
  personName: string; birthYear?: number; weddingYear?: number;
  seed: number;
}
export const DEFAULT_OPTIONS: AutoOptions = {
  folders: [], includeGreetings: true, includeClips: true, dropLowQuality: true,
  targetMinutes: 22, chapterMode: 'auto', pacing: 'normal', collageDensity: 'some',
  pairs: true, timeline: true, quotes: false, names: false,
  greetingsMode: 'chapter', greetingsEveryMin: 4, greetingsPosition: 'beforeFinale',
  musicMode: 'roundRobin', preferLongTrack: true,
  personName: 'יהודה', birthYear: 1946, seed: 1,
};
export const PACING_SECONDS: Record<AutoOptions['pacing'], number> = { calm: 7, normal: 6, dynamic: 4.5 };

export interface Dropped { id: string; reason: 'dup' | 'burst' | 'quality' | 'locked' }
export interface ChapterReport { id: string; title: string; yearFrom: number; yearTo: number; candidates: number; chosen: number; collages: number; seconds: number; musicId?: string; event: boolean }
export interface GenReport {
  runId: string; seed: number;
  pool: { photosTotal: number; photosAfter: number; clips: number; greetings: number; music: number; dupRemoved: number; burstRemoved: number; lowQualityRemoved: number; lockedExcluded: number };
  dropped: Dropped[];
  chapters: ChapterReport[];
  usedPhotoIds: string[]; unusedPhotoIds: string[];
  estimatedSeconds: number; targetSeconds: number;
  layoutsUsed: Record<string, number>;
  warnings: string[];
}
export interface GenInput { assets: Asset[]; options: AutoOptions; settings: Show['settings']; meta: Show['meta']; existing?: Show; mode?: 'replace' | 'fill'; fillChapterId?: string }
export interface GenOutput { show: Show; report: GenReport }
