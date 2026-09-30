import { requireOptionalNativeModule } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import type * as ML from 'expo-media-library';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { MediaItem, MediaType, Post } from '@/lib/extract';

export type SaveTo = 'photos' | 'files' | 'folder'; // folder = a device folder picked with Android's folder picker

export type Settings = {
  onboarded: boolean;
  saveTo: SaveTo;
  albumName?: string; // chosen gallery album name (defaults to 'Media Downloader')
  saveNsfwToPrivate: boolean; // whether to route NSFW downloads to the Private (.private) app folder
  sortBySource: boolean;
  watchClipboard: boolean;
  askBulk: boolean;
  allowNsfw: boolean;
  blurNsfw: boolean;
  lockPrivate: boolean;
  bubble: boolean; // Android floating download bubble (see src/lib/bubble.ts)
  igSignedIn: boolean;
  folderUri?: string; // content:// tree URI of the picked device folder (Android; permission persists)
  folderName?: string;
  lastClip?: string; // last clipboard link offered by the pill, so the same link is never offered twice
};

export type Saved = {
  id: string;
  name: string;
  uri: string;
  thumb?: string;
  type: MediaType;
  fmt: string;
  bytes: number;
  w?: number;
  h?: number;
  dur?: number;
  source: string;
  folder: string; // folder key: Instagram, Reddit…, All, Private
  nsfw: boolean;
  postUrl: string;
  savedAt: number;
  saveTo?: SaveTo; // missing on items saved before per-download choice existed
};

export type Job = {
  id: string;
  name: string;
  item: MediaItem;
  post: Post;
  written: number;
  total: number;
  status: 'waiting' | 'running' | 'done' | 'failed';
  saveTo: SaveTo; // chosen per download; defaults to the Settings value
  albumName?: string;
  error?: string;
  startedAt?: number;
};

type State = {
  settings: Settings;
  history: Saved[];
  jobs: Job[];
  post: Post | null; // the post open in Preview
  unlocked: boolean; // Private folder unlocked for this session
  toast: string | null;
  igSignOut: number; // bumped to ask IgSession to log out
};

const DEFAULTS: Settings = {
  onboarded: false,
  saveTo: 'photos',
  albumName: 'Media Downloader',
  saveNsfwToPrivate: false,
  sortBySource: true,
  watchClipboard: true,
  askBulk: true,
  allowNsfw: true,
  blurNsfw: true,
  lockPrivate: true,
  bubble: false,
  igSignedIn: false,
};

export const ROOT = new Directory(Paths.document, 'MediaDL');
const stateFile = new File(Paths.document, 'state.json');

function load(): Pick<State, 'settings' | 'history'> {
  try {
    if (stateFile.exists) {
      const s = JSON.parse(stateFile.textSync());
      return { settings: { ...DEFAULTS, ...s.settings }, history: s.history ?? [] };
    }
  } catch {}
  return { settings: DEFAULTS, history: [] };
}

let state: State = { ...load(), jobs: [], post: null, unlocked: false, toast: null, igSignOut: 0 };
const listeners = new Set<() => void>();

function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  const persist = 'settings' in next || 'history' in next;
  state = { ...state, ...next };
  if (persist) stateFile.write(JSON.stringify({ settings: state.settings, history: state.history }));
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

/**
 * Subscribe to one slice of state; the component re-renders only when that slice changes.
 * The selector must return existing references or primitives (e.g. `s => s.jobs`), never a new array/object.
 */
export function useApp<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export const getSettings = () => state.settings;

export function updateSettings(patch: Partial<Settings>) {
  set((s) => ({ settings: { ...s.settings, ...patch }, unlocked: 'lockPrivate' in patch ? false : s.unlocked }));
}

export const signOutInstagram = () => set((s) => ({ igSignOut: s.igSignOut + 1 }));
export const setPost = (post: Post | null) => set({ post });

/** Face ID / fingerprint (falls back to the device passcode). Returns whether the Private folder is open. */
export async function unlockPrivate(): Promise<boolean> {
  if (!state.settings.lockPrivate || state.unlocked) return true;
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Private folder' });
  if (res.success) set({ unlocked: true });
  return res.success;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(toast: string) {
  clearTimeout(toastTimer);
  set({ toast });
  toastTimer = setTimeout(() => set({ toast: null }), 3500);
}
export const hideToast = () => set({ toast: null });

// ---------- folders ----------

export function folderKey(source: string, nsfw: boolean, s = state.settings) {
  return (s.saveNsfwToPrivate && nsfw) ? 'Private' : s.sortBySource ? source : 'All';
}

export function folderDir(key: string) {
  return key === 'Private' ? new Directory(ROOT, '.private') : key === 'All' ? ROOT : new Directory(ROOT, key);
}

export const folderName = (k: string) => (k === 'All' ? 'All downloads' : k === 'Private' ? 'Private (NSFW)' : k);

/** Human-readable location shown in the UI. */
export function folderLabel(key: string, saveTo?: SaveTo, albumName?: string) {
  const effectiveSaveTo = saveTo ?? (key === 'Private' ? (state.settings.saveNsfwToPrivate ? 'files' : state.settings.saveTo) : state.settings.saveTo);
  const gallery = Platform.OS === 'ios' ? 'Photos' : 'Gallery';
  if (effectiveSaveTo === 'photos') return `${gallery} › ${albumName || state.settings.albumName || 'Media Downloader'}`;
  if (effectiveSaveTo === 'folder') return `Device › ${state.settings.folderName ?? 'chosen folder'}`;
  return 'Files › MediaDL' + (key === 'All' ? '' : key === 'Private' ? '/.private' : '/' + key);
}

// ---------- downloads ----------

const pad = (n: number) => String(n).padStart(2, '0');
const MAX_PARALLEL = 2;
let jobSeq = 0;

export function enqueue(
  post: Post,
  indexes: number[],
  saveTo: SaveTo = state.settings.saveTo,
  albumName: string = state.settings.albumName || 'Media Downloader'
) {
  const jobs: Job[] = indexes.map((i) => ({
    id: `j${++jobSeq}`,
    name: `${post.source.toLowerCase()}_${post.slug}_${pad(i + 1)}.${post.items[i].fmt.toLowerCase()}`,
    item: post.items[i],
    post,
    written: 0,
    total: 0,
    status: 'waiting',
    saveTo,
    albumName,
  }));
  set((s) => ({ jobs: [...s.jobs.filter((j) => j.status !== 'done'), ...jobs] }));
  pump();
}

export const clearFinished = () => set((s) => ({ jobs: s.jobs.filter((j) => j.status === 'waiting' || j.status === 'running') }));
export const retry = (id: string) => {
  patchJob(id, { status: 'waiting', error: undefined, written: 0 });
  pump();
};

function patchJob(id: string, patch: Partial<Job>) {
  set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }));
}

function pump() {
  const running = state.jobs.filter((j) => j.status === 'running').length;
  state.jobs
    .filter((j) => j.status === 'waiting')
    .slice(0, MAX_PARALLEL - running)
    .forEach(run);
}

// Loaded lazily: Expo Go on Android ships without this native module, and a top-level import crashes every route.
// Two Photos paths: the current API (needs a development build), and the legacy one Expo Go still ships.
// Expo Go on Android only gets write access, so there the file lands in the gallery without the album.
const hasNextLibrary = () => !!requireOptionalNativeModule('ExpoMediaLibraryNext');
const legacyLibrary = () => import('expo-media-library/legacy');

export async function hasPhotos(): Promise<boolean> {
  try {
    if (hasNextLibrary()) return (await (await import('expo-media-library')).getPermissionsAsync()).granted;
    return (await (await legacyLibrary()).getPermissionsAsync(true)).granted;
  } catch {
    return false;
  }
}

export async function requestPhotos(): Promise<boolean> {
  try {
    if (hasNextLibrary()) return (await (await import('expo-media-library')).requestPermissionsAsync()).granted;
    return (await (await legacyLibrary()).requestPermissionsAsync(true)).granted;
  } catch {
    return false;
  }
}

let album: ML.Album | null = null;
const albums = new Map<string, ML.Album | null>();

export async function getPhotoAlbums(): Promise<string[]> {
  if (!(await requestPhotos())) return [];
  try {
    if (hasNextLibrary()) {
      const MediaLibrary = await import('expo-media-library');
      const names = await Promise.all((await MediaLibrary.Album.getAll()).map((a) => a.getTitle()));
      return [...new Set(names.filter(Boolean))].sort();
    }
    const legacy = await legacyLibrary();
    return [...new Set((await legacy.getAlbumsAsync({ includeSmartAlbums: false })).map((a) => a.title).filter(Boolean))].sort();
  } catch {
    return [];
  }
}

/** Saves into the gallery album and returns the gallery copy's URI (used by History and the viewer). */
async function saveToPhotos(uri: string, albumName = state.settings.albumName || 'Media Downloader'): Promise<string> {
  if (!(await requestPhotos())) throw new Error('Gallery access denied.');
  if (!hasNextLibrary()) {
    const legacy = await legacyLibrary();
    const asset = await legacy.createAssetAsync(uri);
    const target = await legacy.getAlbumAsync(albumName).catch(() => null);
    if (target) await legacy.addAssetsToAlbumAsync(asset, target, true);
    else await legacy.createAlbumAsync(albumName, asset, true);
    return asset.uri;
  }
  const MediaLibrary = await import('expo-media-library');
  if (albumName === 'Media Downloader') album ??= await MediaLibrary.Album.get(albumName);
  else if (!albums.has(albumName)) albums.set(albumName, await MediaLibrary.Album.get(albumName));
  const target = albumName === 'Media Downloader' ? album : albums.get(albumName);
  if (target) return (await MediaLibrary.Asset.create(uri, target)).getUri();
  const asset = await MediaLibrary.Asset.create(uri);
  if (albumName === 'Media Downloader') album = await MediaLibrary.Album.create(albumName, [asset]);
  else albums.set(albumName, await MediaLibrary.Album.create(albumName, [asset]));
  return asset.getUri();
}

/** Copies a finished download into the device folder the user picked (Android folder picker, persistent access). */
async function saveToFolder(file: File, fmt: string): Promise<string> {
  const uri = state.settings.folderUri;
  if (!uri) throw new Error('No device folder chosen.');
  const out = new Directory(uri).createFile(file.name, MIME[fmt] ?? null);
  await file.copy(out, { overwrite: true });
  return out.uri;
}

// Gallery / device-folder downloads land here first and are moved out; only the app-folder choice keeps files in the app.
const TEMP = new Directory(Paths.cache, 'incoming');
const MIME: Record<string, string> = { JPG: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp', HEIC: 'image/heic', GIF: 'image/gif', MP4: 'video/mp4', MOV: 'video/quicktime', WEBM: 'video/webm', M4V: 'video/x-m4v' };

async function run(job: Job) {
  patchJob(job.id, { status: 'running', startedAt: Date.now() });
  const { post, item } = job;
  const key = folderKey(post.source, post.nsfw);
  // The Private folder and the app-folder setting are the only places files stay inside the app.
  const keepInApp = key === 'Private' || job.saveTo === 'files';
  const dir = keepInApp ? folderDir(key) : TEMP;
  let lastAt = 0;
  try {
    dir.create({ intermediates: true, idempotent: true });
    let dest = new File(dir, job.name);
    if (dest.exists) dest = new File(dir, job.name.replace(/(\.\w+)$/, `_${Date.now().toString(36)}$1`));
    const file = await File.downloadFileAsync(item.url, dest, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', Referer: post.url },
      onProgress: ({ bytesWritten, totalBytes }) => {
        // Each patch re-renders the Queue; ~4 updates a second is smooth without flooding the JS thread.
        const now = Date.now();
        if (now - lastAt > 250) {
          lastAt = now;
          patchJob(job.id, { written: bytesWritten, total: totalBytes });
        }
      },
    });
    const bytes = file.size;
    let warning: string | undefined;
    let finalUri = file.uri;
    let savedTo = keepInApp ? 'files' as SaveTo : job.saveTo;
    if (!keepInApp) {
      try {
        finalUri = job.saveTo === 'folder' ? await saveToFolder(file, item.fmt) : await saveToPhotos(file.uri, job.albumName);
        file.delete();
      } catch (e) {
        // Don't lose the download: keep it in the app folder and say why.
        const home = folderDir(key);
        home.create({ intermediates: true, idempotent: true });
        await file.move(home);
        finalUri = file.uri;
        savedTo = 'files';
        warning = `${(e as Error).message} Kept in the app folder instead.`;
      }
    }
    const saved: Saved = {
      id: job.id + '_' + Date.now(),
      name: file.name,
      uri: finalUri,
      thumb: item.thumb,
      type: item.type,
      fmt: item.fmt,
      bytes,
      w: item.w,
      h: item.h,
      dur: item.dur,
      source: post.source,
      folder: key,
      nsfw: post.nsfw,
      postUrl: post.url,
      savedAt: Date.now(),
      saveTo: savedTo,
    };
    set((s) => ({
      history: [saved, ...s.history],
      jobs: s.jobs.map((j) => (j.id === job.id ? { ...j, status: 'done', written: bytes, total: bytes } : j)),
    }));
    if (warning) showToast(warning);
    else if (!state.jobs.some((j) => j.status === 'waiting' || j.status === 'running'))
      showToast(`Downloads finished. Saved to ${folderLabel(key, savedTo, job.albumName)}`);
  } catch (e) {
    patchJob(job.id, { status: 'failed', error: (e as Error).message });
  }
  pump();
}

// ---------- history ----------

/** Image to show for a saved item: the file itself for images and real GIFs, the source thumbnail for videos. */
export const thumbOf = (h: Saved) => (h.type === 'IMG' || h.fmt === 'GIF' ? h.uri : h.thumb);

export function deleteSaved(id: string) {
  const it = state.history.find((h) => h.id === id);
  if (it) {
    try {
      new File(it.uri).delete();
    } catch {}
  }
  set((s) => ({ history: s.history.filter((h) => h.id !== id) }));
}

/** Forgets history; the files themselves stay on the device. */
export const clearHistory = () => set({ history: [] });

export function formatBytes(b: number) {
  return b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
}

export function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
