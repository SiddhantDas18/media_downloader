// Turns a pasted post link into a list of downloadable media URLs.
// Self-contained (no imports) so `node src/lib/extract.check.ts` can test the parsers.

export type MediaType = 'IMG' | 'VID' | 'GIF';

export type MediaItem = {
  url: string; // full-size original, only fetched when saving
  thumb?: string; // small preview (~640px) shown before saving
  type: MediaType;
  fmt: string; // JPG, PNG, MP4…
  w?: number;
  h?: number;
  dur?: number; // seconds
};

export type Post = {
  url: string;
  host: string;
  source: string; // Reddit, Instagram, X…
  author: string;
  slug: string; // used in file names
  nsfw: boolean;
  items: MediaItem[];
};

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
// Instagram/Facebook only serve Open Graph tags to link-preview bots.
const BOT_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

const SOURCES: [RegExp, string][] = [
  [/(^|\.)(reddit\.com|redd\.it)$/, 'Reddit'],
  [/(^|\.)(instagram\.com|instagr\.am)$/, 'Instagram'],
  [/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/, 'Facebook'],
  [/(^|\.)(x\.com|twitter\.com)$/, 'X'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)tumblr\.com$/, 'Tumblr'],
  [/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, 'Pinterest'],
];

export function sourceOf(host: string): string {
  return SOURCES.find(([re]) => re.test(host))?.[1] ?? 'Web';
}

const EXT_FMT: Record<string, [MediaType, string]> = {
  jpg: ['IMG', 'JPG'], jpeg: ['IMG', 'JPG'], png: ['IMG', 'PNG'], webp: ['IMG', 'WEBP'], heic: ['IMG', 'HEIC'],
  gif: ['GIF', 'GIF'], mp4: ['VID', 'MP4'], mov: ['VID', 'MOV'], webm: ['VID', 'WEBM'], m4v: ['VID', 'M4V'],
};

/** What to draw on screen before saving: the small preview, else the original for images/real GIFs. */
export const previewOf = (it: MediaItem) => it.thumb ?? (it.type === 'IMG' || it.fmt === 'GIF' ? it.url : undefined);

/** For small thumbnails (filmstrip, picker, queue): never pull a full GIF original (often several MB) just to draw 50px. */
export const thumbPreviewOf = (it: MediaItem) => it.thumb ?? (it.type === 'IMG' ? it.url : undefined);

export function fmtOf(url: string): [MediaType, string] | undefined {
  const ext = url.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? '';
  return EXT_FMT[ext];
}

function fmtOfMime(mime: string): [MediaType, string] | undefined {
  const sub = mime.split(';')[0].split('/')[1]?.toLowerCase();
  return sub ? EXT_FMT[sub === 'quicktime' ? 'mov' : sub] : undefined;
}

const unescape = (s: string) =>
  s
    .replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

/** Normalises user input: trims, adds https://, and pulls the first URL out of shared text. */
export function parseInput(text: string): URL | null {
  const m = text.match(/https?:\/\/\S+/) ?? text.trim().match(/^[\w-]+(\.[\w-]+)+\/?\S*$/);
  if (!m) return null;
  try {
    return new URL(/^https?:/.test(m[0]) ? m[0] : 'https://' + m[0]);
  } catch {
    return null;
  }
}

async function get(url: string, ua = UA): Promise<Response> {
  const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: '*/*' } });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res;
}

// ---------- Reddit ----------
// Reddit answers 403 to logged-out `.json` requests (seen 2026-09 on Wi-Fi and mobile data), but the public
// embed page (embed.reddit.com/r/<sub>/comments/<id>/) still carries everything, NSFW posts included:
//   <shreddit-screenview-data data="{post:{url,nsfw,type}}">  type: image | gallery | video | link…
//   <gallery-carousel> previews named …-v0-<mediaId>.<ext>        -> original at i.redd.it/<mediaId>.<ext>
//   <shreddit-player packaged-media-json="{playbackMp4s:…}">       -> MP4s with audio, every resolution

const attr = (html: string, re: RegExp) => {
  const m = html.match(re)?.[1];
  return m === undefined ? undefined : unescape(m);
};

export function parseRedditEmbed(html: string): Omit<Post, 'url' | 'host' | 'source'> & { link?: string } {
  const raw = attr(html, /<shreddit-screenview-data data="([^"]*)"/);
  if (!raw) throw new Error('Reddit post not found. It may be deleted or private.');
  const { post, subreddit } = JSON.parse(raw);
  const user = html.match(/\/user\/([\w-]+)/)?.[1];
  const meta = { author: `r/${subreddit?.name ?? 'reddit'}${user ? ' · u/' + user : ''}`, slug: user ?? subreddit?.name ?? 'reddit', nsfw: !!post.nsfw };
  const items: MediaItem[] = [];

  const gallery = html.match(/<gallery-carousel[\s\S]*?<\/gallery-carousel>/)?.[0];
  const packaged = attr(html, /packaged-media-json="([^"]*)"/);
  if (gallery) {
    // One <li> per slide. Photos appear as preview.redd.it/…-v0-<id>.<ext> (640px; original at i.redd.it/<id>.<ext>);
    // GIFs appear only as the original i.redd.it/<id>.gif (unsigned preview URLs 403), so the GIF is its own preview.
    const slides = gallery.match(/<li\b[\s\S]*?<\/li>/g) ?? [gallery];
    const seen = new Set<string>();
    for (const li of slides) {
      const m = li.match(/https:\/\/(preview|i)\.redd\.it\/(?:[^"?\s]*-v0-)?([a-z0-9]+)\.(\w+)[^"\s]*/);
      if (!m) continue;
      const f = `${m[2]}.${m[3]}`;
      if (seen.has(f)) continue;
      seen.add(f);
      const [type, fmt] = fmtOf(f) ?? ['IMG', 'JPG'];
      items.push({ url: `https://i.redd.it/${f}`, thumb: m[1] === 'preview' ? unescape(m[0]) : undefined, type, fmt });
    }
  } else if (packaged) {
    const perms: any[] = JSON.parse(packaged).playbackMp4s?.permutations ?? [];
    const best = perms.reduce((a, b) => (b.source.dimensions.height * b.source.dimensions.width > a.source.dimensions.height * a.source.dimensions.width ? b : a), perms[0]);
    const poster = attr(html, /<shreddit-player[^>]*\sposter="([^"]*)"/);
    if (best) items.push({ url: best.source.url, thumb: poster, type: 'VID', fmt: 'MP4', w: best.source.dimensions.width, h: best.source.dimensions.height, dur: JSON.parse(packaged).playbackMp4s?.duration });
  } else if (typeof post.url === 'string' && fmtOf(post.url)) {
    const [type, fmt] = fmtOf(post.url)!;
    const id = post.url.match(/i\.redd\.it\/([a-z0-9]+)/)?.[1];
    const thumb = id ? attr(html, new RegExp(`"(https://preview\\.redd\\.it/[^"]*${id}\\.[^"]*)"`)) : undefined;
    items.push({ url: post.url, thumb, type, fmt });
  }
  if (items.length) return { ...meta, items };
  // Link posts (imgur, redgifs, YouTube…) point elsewhere; let the caller follow them.
  if (typeof post.url === 'string' && !/reddit\.com\//.test(post.url)) return { ...meta, items, link: post.url };
  throw new Error('This Reddit post has no photos, videos or GIFs');
}

/** Highest-resolution video-only stream from a v.redd.it DASH playlist (used when we only have a v.redd.it link). */
export function parseDashBest(mpd: string): { file: string; w: number; h: number } | null {
  const reps = [...mpd.matchAll(/<Representation\b([^>]*)>\s*<BaseURL>([^<]+)<\/BaseURL>/g)]
    .map(([, attrs, file]) => ({ h: +(attrs.match(/\sheight="(\d+)"/)?.[1] ?? 0), w: +(attrs.match(/\swidth="(\d+)"/)?.[1] ?? 0), file }))
    .filter((r) => r.h) // audio representations have no height
    .sort((a, b) => b.h * b.w - a.h * a.w);
  return reps[0] ?? null;
}

async function reddit(url: URL): Promise<Omit<Post, 'url' | 'host' | 'source'>> {
  let target = url;
  // Share links (/s/xyz) redirect to the full post; fetch follows it even when the final page is a block page.
  if (/\/s\/\w+/.test(url.pathname)) target = new URL((await fetch(url.href, { headers: { 'User-Agent': UA } })).url);
  if (target.host === 'v.redd.it') {
    const vid = target.pathname.split('/')[1];
    const best = parseDashBest(await (await get(`https://v.redd.it/${vid}/DASHPlaylist.mpd`)).text());
    if (!best) throw new Error('Reddit video not found');
    // ponytail: silent. A bare v.redd.it link has no post id, so no embed page with the muxed MP4. Share the post link instead.
    return { author: 'Reddit video', slug: vid, nsfw: false, items: [{ url: `https://v.redd.it/${vid}/${best.file}`, type: 'VID', fmt: 'MP4', w: best.w, h: best.h }] };
  }
  const id = target.pathname.match(/\/comments\/([a-z0-9]+)/i)?.[1] ?? (target.host === 'redd.it' ? target.pathname.slice(1) : undefined);
  if (!id) throw new Error('Open a single Reddit post and copy its link');
  // The embed page 404s without a subreddit in the path. Any name loads the post, but only the real one renders
  // galleries, so for redd.it/<id> and /comments/<id> links read the real subreddit off the placeholder page first.
  const embed = async (sub: string) => (await get(`https://embed.reddit.com/r/${sub}/comments/${id}/`)).text();
  let sub = target.pathname.match(/\/r\/(\w+)/)?.[1];
  let html = '';
  if (!sub) {
    html = await embed('all');
    sub = html.match(new RegExp(`/r/(\\w+)/comments/${id}/`))?.[1];
  }
  if (sub) html = await embed(sub);
  const data = parseRedditEmbed(html);
  if (!data.link) return data;
  const inner = await extract(data.link);
  return { ...inner, author: data.author, nsfw: data.nsfw || inner.nsfw };
}

// ---------- X / Twitter (public fxtwitter API) ----------

export function parseFxTweet(json: any): Omit<Post, 'url' | 'host' | 'source'> {
  const t = json?.tweet;
  if (!t) throw new Error('Post not found on X');
  const items: MediaItem[] = (t.media?.all ?? []).map((m: any): MediaItem =>
    m.type === 'photo'
      ? { url: m.url.split('?')[0] + '?name=orig', thumb: m.url.split('?')[0] + '?name=small', type: 'IMG', fmt: fmtOf(m.url)?.[1] ?? 'JPG', w: m.width, h: m.height }
      : { url: m.url, thumb: m.thumbnail_url, type: m.type === 'gif' ? 'GIF' : 'VID', fmt: 'MP4', w: m.width, h: m.height, dur: m.duration },
  );
  if (!items.length) throw new Error('This post has no media');
  return { author: '@' + t.author.screen_name, slug: t.author.screen_name, nsfw: !!t.possibly_sensitive, items };
}

// ---------- TikTok (public tikwm API) ----------

export function parseTikwm(json: any): Omit<Post, 'url' | 'host' | 'source'> {
  const d = json?.data;
  if (!d) throw new Error(json?.msg || 'TikTok video not found');
  const items: MediaItem[] = d.images?.length
    ? d.images.map((u: string) => ({ url: u, type: 'IMG' as const, fmt: fmtOf(u)?.[1] ?? 'JPG' }))
    : [{ url: d.hdplay || d.play, thumb: d.cover, type: 'VID', fmt: 'MP4', dur: d.duration }];
  const who = d.author?.unique_id ?? 'tiktok';
  return { author: '@' + who, slug: who, nsfw: false, items };
}

// ---------- Instagram ----------

/** Parses a GraphQL `shortcode_media` object (same shape from the GraphQL query and the embed page). */
export function parseIgMedia(m: any): Omit<Post, 'url' | 'host' | 'source'> | null {
  const nodes: any[] = m.edge_sidecar_to_children?.edges?.map((e: any) => e.node) ?? [m];
  const items: (MediaItem | null)[] = nodes.map((n) => {
    const w = n.dimensions?.width, h = n.dimensions?.height;
    // The embed page often omits video_url; never fall back to saving a reel's cover image.
    if (n.is_video) return n.video_url ? { url: n.video_url, thumb: n.display_url, type: 'VID', fmt: 'MP4', w, h, dur: n.video_duration } : null;
    // display_url is the full-size original (up to 1440px); display_resources top out lower.
    const best = n.display_resources?.at(-1);
    const useBest = best && best.config_width > (w ?? 0);
    const url = useBest ? best.src : n.display_url;
    const small = n.display_resources?.find((r: any) => r.config_width >= 480)?.src;
    return { url, thumb: small !== url ? small : undefined, type: 'IMG', fmt: fmtOf(url)?.[1] ?? 'JPG', w: useBest ? best.config_width : w, h: useBest ? best.config_height : h };
  });
  if (!items.length || items.some((i) => !i)) return null;
  const who = m.owner?.username ?? 'instagram';
  return { author: '@' + who, slug: who, nsfw: false, items: items as MediaItem[] };
}

/** The embed page carries the post as an escaped JSON string: "contextJSON":"{...gql_data...}". */
export function parseIgEmbed(html: string): any {
  const raw = html.match(/"contextJSON":"((?:\\.|[^"\\])*)"/)?.[1];
  if (!raw) return null;
  const ctx = JSON.parse(JSON.parse(`"${raw}"`));
  return ctx?.gql_data?.shortcode_media ?? null;
}

/** Instagram shortcode (…/p/<code>/) → numeric media id, as used by /api/v1/media/<id>/info/. */
export function igMediaId(code: string): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = BigInt(0);
  for (const c of code.slice(0, 11)) id = id * BigInt(64) + BigInt(abc.indexOf(c));
  return id.toString();
}

/** Parses /api/v1/media/<id>/info/ (signed-in web API): full-size photos, real video URLs, age-restricted posts included. */
export function parseIgV1(json: any): Omit<Post, 'url' | 'host' | 'source'> | null {
  const m = json?.items?.[0];
  if (!m) return null;
  const nodes: any[] = m.carousel_media ?? [m];
  const items: MediaItem[] = nodes.map((n): MediaItem => {
    const img = n.image_versions2?.candidates ?? [];
    const best = img.reduce((a: any, b: any) => (b.width > (a?.width ?? 0) ? b : a), null);
    const small = img.filter((c: any) => c.width >= 480).reduce((a: any, b: any) => (!a || b.width < a.width ? b : a), null);
    const vid = n.video_versions?.reduce((a: any, b: any) => (b.width > (a?.width ?? 0) ? b : a), null);
    return vid
      ? { url: vid.url, thumb: small?.url ?? best?.url, type: 'VID', fmt: 'MP4', w: vid.width, h: vid.height, dur: n.video_duration }
      : { url: best?.url, thumb: small?.url, type: 'IMG', fmt: fmtOf(best?.url ?? '')?.[1] ?? 'JPG', w: best?.width, h: best?.height };
  });
  if (!items.length || items.some((i) => !i.url)) return null;
  const who = m.user?.username ?? 'instagram';
  return { author: '@' + who, slug: who, nsfw: false, items };
}

/**
 * Signed-in Instagram requests run inside a hidden instagram.com WebView (src/components/ig-session.tsx), so the
 * user's own login cookies are used without the app ever reading them. Set when signed in, null otherwise.
 */
let igSession: ((path: string) => Promise<any>) | null = null;
export const setIgSession = (fn: typeof igSession) => (igSession = fn);

const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// ---------- Instagram pacing ----------
// Instagram limits how often a network (or account) may *ask about* posts; file downloads from its CDN aren't the
// problem. So Instagram lookups run one at a time with a gap, and a "please wait" answer pauses them with a growing
// cooldown (2, 4, 8… up to 30 min) that resets after the next success. No evasion: we just ask less and wait when told.

/** Thrown while Instagram has asked us to wait. `retryAt` is a timestamp (ms). */
export class RateLimited extends Error {
  retryAt: number;
  constructor(retryAt: number) {
    super('Instagram asked us to slow down.');
    this.retryAt = retryAt;
  }
}

export const IG_GAP_MS = 1500;
let igChain: Promise<unknown> = Promise.resolve();
let igLastAt = 0;
let igBackoff = 0;
let igCooldownUntil = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts (or doubles) the cooldown and throws. */
export function igCooldown(): never {
  igBackoff = Math.min(igBackoff ? igBackoff * 2 : 2 * 60_000, 30 * 60_000);
  igCooldownUntil = Date.now() + igBackoff;
  throw new RateLimited(igCooldownUntil);
}

/** Runs Instagram lookups one at a time, IG_GAP_MS apart, and not at all during a cooldown. */
export function igThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const run = igChain.then(async () => {
    if (Date.now() < igCooldownUntil) throw new RateLimited(igCooldownUntil);
    const wait = igLastAt + IG_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const out = await fn();
      igBackoff = 0;
      return out;
    } finally {
      igLastAt = Date.now();
    }
  });
  igChain = run.catch(() => {});
  return run;
}

async function instagram(url: URL): Promise<Omit<Post, 'url' | 'host' | 'source'> | null> {
  const code = url.pathname.match(/\/(?:p|reels?|tv)\/([\w-]+)/)?.[1];
  if (!code) return null;
  let limited = false; // Instagram answered 401/429 ("please wait")
  // 0. Signed in: the user's own session sees everything they can see in Instagram, including age-restricted posts.
  let signedInError: string | undefined; // why the signed-in lookup failed, shown to the user if nothing else works
  if (igSession) {
    const json = await igSession(`/api/v1/media/${igMediaId(code)}/info/`).catch((e: Error) => {
      limited ||= /\b(401|429)\b/.test(e.message);
      signedInError = e.message;
      return null;
    });
    const post = parseIgV1(json);
    if (post) return post;
    signedInError ??= json ? 'Instagram sent no media for this post' : undefined;
  }
  // 1. Public web GraphQL query: every carousel item, full-size photos and real video URLs.
  //    Without an X-CSRFToken header Instagram answers 403; any value passes for logged-out requests.
  try {
    const res = await fetch('https://www.instagram.com/graphql/query', {
      method: 'POST',
      headers: {
        'User-Agent': DESKTOP_UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-IG-App-ID': '936619743392459',
        'X-CSRFToken': 'missing',
        'X-ASBD-ID': '129477',
        'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery',
        Origin: 'https://www.instagram.com',
        Referer: `https://www.instagram.com/p/${code}/`,
      },
      body: `doc_id=8845758582119845&variables=${encodeURIComponent(JSON.stringify({ shortcode: code, fetch_tagged_user_count: null, hoisted_comment_id: null, hoisted_reply_id: null }))}`,
    });
    const json = await res.json().catch(() => null);
    limited ||= res.status === 401 || res.status === 429;
    const m = json?.data?.xdt_shortcode_media;
    if (m) return parseIgMedia(m);
    if (json?.data && !m) throw new Error('This Instagram post is private or was deleted');
  } catch (e) {
    if ((e as Error).message.startsWith('This Instagram')) throw e;
  }
  // 2. Embed page: complete for many (mostly older) posts, but photos max out at 640px.
  try {
    const m = parseIgEmbed(await (await get(`https://www.instagram.com/p/${code}/embed/captioned/`)).text());
    const post = m && parseIgMedia(m);
    if (post) return post;
  } catch {}
  if (limited) igCooldown();
  throw new Error(
    igSession
        ? `Couldn't read this Instagram post while signed in. ${signedInError ?? 'It may be private or deleted.'}`
        : "Couldn't read this Instagram post. If it's age-restricted or private, sign in to Instagram in Settings.",
  );
}

// ---------- Anything else: Open Graph tags ----------

export function parseOg(html: string): { title?: string; items: MediaItem[] } {
  const tags = [...html.matchAll(/<meta\s[^>]*>/gi)].map(([tag]) => ({
    key: (tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1] ?? '').toLowerCase(),
    val: unescape(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? ''),
  }));
  const all = (...keys: string[]) => [...new Set(tags.filter((t) => keys.includes(t.key) && t.val).map((t) => t.val))];
  const videos = all('og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream');
  const images = all('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image');
  const items: MediaItem[] = videos.length
    ? videos.slice(0, 1).map((url) => ({ url, thumb: images[0], type: 'VID', fmt: fmtOf(url)?.[1] ?? 'MP4' }))
    : images.slice(0, 1).map((url) => ({ url, type: 'IMG', fmt: fmtOf(url)?.[1] ?? 'JPG' }));
  return { title: all('og:title')[0], items };
}

async function generic(url: URL, source: string): Promise<Omit<Post, 'url' | 'host' | 'source'>> {
  const res = await get(url.href, source === 'Web' ? UA : BOT_UA);
  const type = res.headers.get('content-type') ?? '';
  const slug = url.pathname.split('/').filter(Boolean)[0] ?? url.host;
  const asFile = fmtOfMime(type);
  if (asFile) return { author: url.host, slug, nsfw: false, items: [{ url: res.url, type: asFile[0], fmt: asFile[1] }] };
  const { title, items } = parseOg(await res.text());
  if (!items.length) throw new Error(`No downloadable media found on ${url.host}. The post may be private or need a login.`);
  return { author: title?.slice(0, 60) ?? url.host, slug, nsfw: false, items };
}

// Posts already read this session: reopening or retrying a link doesn't ask the site again. Failures aren't kept.
const posts = new Map<string, Promise<Post>>();

export function extract(input: string): Promise<Post> {
  const url = parseInput(input);
  if (!url) return Promise.reject(new Error("That doesn't look like a link"));
  const key = url.href.replace(/[?#].*$/, '').replace(/\/$/, '');
  let post = posts.get(key);
  if (!post) {
    post = extractFresh(url);
    posts.set(key, post);
    post.catch(() => posts.delete(key));
  }
  return post;
}

async function extractFresh(url: URL): Promise<Post> {
  const host = url.host.replace(/^www\.|^m\.|^old\./, '');
  const source = sourceOf(host);
  const direct = fmtOf(url.pathname);

  let data: Omit<Post, 'url' | 'host' | 'source'>;
  if (direct && source !== 'Reddit') {
    data = { author: host, slug: host.split('.')[0], nsfw: false, items: [{ url: url.href, type: direct[0], fmt: direct[1] }] };
  } else if (source === 'Reddit') {
    data = direct && /(^|\.)redd\.it$/.test(host)
      ? { author: host, slug: 'reddit', nsfw: false, items: [{ url: url.href, type: direct[0], fmt: direct[1] }] }
      : await reddit(url);
  } else if (source === 'X') {
    const id = url.pathname.match(/status(?:es)?\/(\d+)/)?.[1];
    if (!id) throw new Error('Open a single post on X and copy its link');
    data = parseFxTweet(await (await get(`https://api.fxtwitter.com/status/${id}`)).json());
  } else if (source === 'TikTok') {
    data = parseTikwm(await (await get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url.href)}&hd=1`)).json());
  } else if (source === 'Instagram') {
    data = (await igThrottle(() => instagram(url))) ?? (await generic(url, source)); // generic: story/profile links without a shortcode
  } else {
    data = await generic(url, source);
  }
  return { url: url.href, host, source, ...data, slug: data.slug.replace(/[^\w.-]+/g, '').toLowerCase() || source.toLowerCase() };
}
