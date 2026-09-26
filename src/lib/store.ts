import { requireOptionalNativeModule } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import type * as ML from 'expo-media-library';
import { useSyncExternalStore } from 'react';

import type { MediaItem, MediaType, Post } from '@/lib/extract';

export type SaveTo = 'photos' | 'files';

export type Settings = {
  onboarded: boolean;
  saveTo: SaveTo;
  sortBySource: boolean;
  watchClipboard: boolean;
  askBulk: boolean;
  allowNsfw: boolean;
  blurNsfw: boolean;
  lockPrivate: boolean;
  bubble: boolean; // Android floating download bubble (see src/lib/bubble.ts)
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
};

const DEFAULTS: Settings = {
  onboarded: false,
  saveTo: 'photos',
  sortBySource: true,
  watchClipboard: true,
  askBulk: true,
  allowNsfw: true,
  blurNsfw: true,
  lockPrivate: true,
  bubble: false,
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

let state: State = { ...load(), jobs: [], post: null, unlocked: false, toast: null };
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
  return nsfw ? 'Private' : s.sortBySource ? source : 'All';
}

export function folderDir(key: string) {
  return key === 'Private' ? new Directory(ROOT, '.private') : key === 'All' ? ROOT : new Directory(ROOT, key);
}

export const folderName = (k: string) => (k === 'All' ? 'All downloads' : k === 'Private' ? 'Private (NSFW)' : k);

/** Human-readable location shown in the UI. */
export function folderLabel(key: string, saveTo: SaveTo = state.settings.saveTo) {
  if (key !== 'Private' && saveTo === 'photos') return 'Photos › Media Downloader';
  return 'Files › MediaDL' + (key === 'All' ? '' : key === 'Private' ? '/.private' : '/' + key);
}

// ---------- downloads ----------

const pad = (n: number) => String(n).padStart(2, '0');
const MAX_PARALLEL = 2;
let jobSeq = 0;

export function enqueue(post: Post, indexes: number[], saveTo: SaveTo = state.settings.saveTo) {
  const jobs: Job[] = indexes.map((i) => ({
    id: `j${++jobSeq}`,
    name: `${post.source.toLowerCase()}_${post.slug}_${pad(i + 1)}.${post.items[i].fmt.toLowerCase()}`,
    item: post.items[i],
    post,
    written: 0,
    total: 0,
    status: 'waiting',
    saveTo,
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
async function mediaLibrary(): Promise<typeof ML> {
  if (!requireOptionalNativeModule('ExpoMediaLibraryNext'))
    throw new Error('Saving to Photos needs a development build. Saved to the app folder instead.');
  return import('expo-media-library');
}

export async function hasPhotos(): Promise<boolean> {
  try {
    return (await (await mediaLibrary()).getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function requestPhotos(): Promise<boolean> {
  try {
    return (await (await mediaLibrary()).requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

let album: ML.Album | null = null;
async function saveToPhotos(uri: string) {
  const MediaLibrary = await mediaLibrary();
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Photos access denied. Saved to the app folder instead.');
  album ??= await MediaLibrary.Album.get('Media Downloader');
  if (album) return void (await MediaLibrary.Asset.create(uri, album));
  const asset = await MediaLibrary.Asset.create(uri);
  album = await MediaLibrary.Album.create('Media Downloader', [asset]);
}

async function run(job: Job) {
  patchJob(job.id, { status: 'running', startedAt: Date.now() });
  const { post, item } = job;
  const key = folderKey(post.source, post.nsfw);
  const dir = folderDir(key);
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
    let warning: string | undefined;
    if (job.saveTo === 'photos' && !post.nsfw) {
      await saveToPhotos(file.uri).catch((e: Error) => (warning = e.message));
    }
    const saved: Saved = {
      id: job.id + '_' + Date.now(),
      name: file.name,
      uri: file.uri,
      thumb: item.thumb,
      type: item.type,
      fmt: item.fmt,
      bytes: file.size,
      w: item.w,
      h: item.h,
      dur: item.dur,
      source: post.source,
      folder: key,
      nsfw: post.nsfw,
      postUrl: post.url,
      savedAt: Date.now(),
      saveTo: job.saveTo,
    };
    set((s) => ({
      history: [saved, ...s.history],
      jobs: s.jobs.map((j) => (j.id === job.id ? { ...j, status: 'done', written: file.size, total: file.size } : j)),
    }));
    if (warning) showToast(warning);
    else if (!state.jobs.some((j) => j.status === 'waiting' || j.status === 'running'))
      showToast(`Downloads finished. Saved to ${folderLabel(key, job.saveTo)}`);
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
