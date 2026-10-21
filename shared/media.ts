/** File types the app takes in: one list for the ingest scan, the upload route and the editor's file pickers. */
export const PHOTO_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.heic', '.heif', '.avif', '.gif', '.bmp'];
export const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.3gp', '.mkv', '.avi', '.webm', '.mts', '.m2ts', '.vob', '.mpg', '.mpeg', '.wmv', '.flv', '.ts']; // ffmpeg decodes all of these; DVD .vob and old camcorder files included
export const MUSIC_EXT = ['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.wma', '.mpga', '.mp2', '.aiff', '.aif', '.amr'];

export type MediaFolder = 'photos' | 'videos/greetings' | 'music';
export const MEDIA_FOLDERS: MediaFolder[] = ['photos', 'videos/greetings', 'music'];

/** The media/ folder a file belongs in, or null for anything the app does not use (Thumbs.db, .txt, macOS "._" sidecars). */
export function mediaFolderFor(name: string): MediaFolder | null {
  if (name.startsWith('.') || name.startsWith('~')) return null;
  const i = name.lastIndexOf('.'); if (i <= 0) return null;
  const ext = name.slice(i).toLowerCase();
  return PHOTO_EXT.includes(ext) ? 'photos' : VIDEO_EXT.includes(ext) ? 'videos/greetings' : MUSIC_EXT.includes(ext) ? 'music' : null;
}
