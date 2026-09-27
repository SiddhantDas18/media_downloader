import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, Btn, Press, Tag, Txt } from '@/components/ui';
import { F, T } from '@/constants/theme';
import { extract, previewOf, RateLimited, thumbPreviewOf, type MediaItem, type Post } from '@/lib/extract';
import { enqueue, folderKey, folderLabel, getPhotoAlbums, setPost, useApp } from '@/lib/store';

const kind = (it: MediaItem) => (it.type === 'VID' ? 'Video' : it.type === 'GIF' ? 'GIF' : 'Photo');
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/**
 * One carousel slide. Nothing loads until you swipe to it; once started it keeps loading (at low priority)
 * when you move on, so coming back never restarts it. Cached in memory only; Preview clears it on close.
 */
function SlideImage({ uri, current, onReady }: { uri?: string; current: boolean; onReady: () => void }) {
  const [pct, setPct] = useState<number | null>(0);
  const [started, setStarted] = useState(current);
  if (current && !started) setStarted(true);
  if (!uri || !started) return null;
  return (
    <>
      <Image
        source={uri}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        transition={200}
        priority={current ? 'high' : 'low'}
        cachePolicy="memory"
        onProgress={({ loaded, total }) => total > 0 && setPct(Math.round((loaded / total) * 100))}
        onLoad={() => {
          setPct(null);
          onReady();
        }}
        onError={() => setPct(null)}
      />
      {pct !== null ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={T.sub} />
          <Txt v="mono">{pct > 0 ? `Loading ${pct}%` : 'Loading…'}</Txt>
        </View>
      ) : null}
    </>
  );
}

export default function Preview() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const settings = useApp((s) => s.settings);
  const [post, setLocal] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [saveTo, setSaveTo] = useState(settings.saveTo); // this download only; Settings holds the default
  const [albumName, setAlbumName] = useState('Media Downloader');
  const [albums, setAlbums] = useState<string[]>([]);
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);
  const [firstReady, setFirstReady] = useState(false); // filmstrip thumbnails wait for the first visible image
  const list = useRef<FlatList<MediaItem>>(null);
  const { width } = useWindowDimensions();
  const cw = width - 32;

  // Preview images are memory-only (never written to disk); drop them when this screen closes.
  useEffect(() => () => void Image.clearMemoryCache(), []);

  // Instagram "please wait": count down, then try the same link again automatically.
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!retryAt) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= retryAt) {
        setRetryAt(null);
        setAttempt((a) => a + 1);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [retryAt]);

  useEffect(() => {
    let live = true;
    extract(url)
      .then((p) => {
        if (!live) return;
        if (p.nsfw && !settings.allowNsfw) throw new Error('This post is marked NSFW. Turn on "Allow NSFW content" in Settings to download it.');
        setLocal(p);
        setPost(p); // the picker sheet reads it from the store
      })
      .catch((e: Error) => {
        if (!live) return;
        if (e instanceof RateLimited) {
          setNow(Date.now());
          setRetryAt(e.retryAt);
        }
        else setError(e.message);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per link (and per automatic retry)
  }, [url, attempt]);

  const loaded = post && !error;
  const items = post?.items ?? [];
  const n = items.length;
  const cur = items[Math.min(slide, n - 1)];
  const go = (i: number) => {
    list.current?.scrollToIndex({ index: i, animated: true });
    setSlide(i);
  };
  const chooseAlbum = async () => {
    const names = await getPhotoAlbums();
    if (!names.length) return Alert.alert('Gallery access needed', 'Allow photo access to choose a gallery album.');
    setAlbums(names.includes(albumName) ? names : [albumName, ...names]);
    setAlbumPickerOpen(true);
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 }}>
        <BackButton />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt numberOfLines={1} style={{ fontFamily: F.semibold }}>{post?.author ?? 'Reading post…'}</Txt>
          <Txt v="mono" numberOfLines={1}>{(post?.url ?? url).replace(/^https?:\/\/(www\.)?/, '')}</Txt>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ gap: 14, paddingTop: 14, paddingBottom: 16 }}>
        {retryAt ? (
          <Animated.View entering={FadeIn.duration(200)} style={[styles.empty, { marginHorizontal: 16 }]}>
            <Txt style={{ textAlign: 'center', fontFamily: F.semibold }}>Instagram asked us to slow down</Txt>
            <Txt v="sub" style={{ textAlign: 'center', fontSize: 13.5 }}>
              {`Too many lookups from this network. Retrying automatically in ${fmtDur(Math.max(0, (retryAt - now) / 1000))}.`}
            </Txt>
          </Animated.View>
        ) : error ? (
          <Animated.View entering={FadeIn.duration(200)} style={[styles.empty, { marginHorizontal: 16 }]}>
            <Txt style={{ textAlign: 'center', fontFamily: F.semibold }}>{"Couldn't get media from this link"}</Txt>
            <Txt v="sub" style={{ textAlign: 'center', fontSize: 13.5 }}>{error}</Txt>
          </Animated.View>
        ) : !loaded ? (
          <Animated.View exiting={FadeOut.duration(150)} style={[{ marginHorizontal: 16, gap: 12 }, styles.pulse]}>
            <View style={[styles.slide, { width: cw, borderRadius: T.r, backgroundColor: T.raised }]}>
              <Txt v="mono">Reading post…</Txt>
            </View>
            <View style={{ height: 12, width: '60%', borderRadius: 6, backgroundColor: T.raised }} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(260)} style={{ gap: 14 }}>
            <View style={{ marginHorizontal: 16, borderRadius: T.r, overflow: 'hidden' }}>
              <FlatList
                ref={list}
                data={items}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                getItemLayout={(_, i) => ({ length: cw, offset: cw * i, index: i })}
                onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / cw))}
                keyExtractor={(it, i) => it.url + i}
                // Mount only the visible slide and its neighbours, so the one you're looking at gets the bandwidth.
                // Keep every slide mounted so a started image is never cancelled; unvisited slides render nothing.
                initialNumToRender={1}
                maxToRenderPerBatch={1}
                windowSize={2 * n + 1}
                renderItem={({ item, index }) => (
                  <View style={[styles.slide, { width: cw }]}>
                    <SlideImage uri={previewOf(item)} current={index === slide} onReady={() => setFirstReady(true)} />
                    {item.type === 'VID' ? <View style={styles.play}><Txt style={{ color: '#111', fontSize: 20 }}>▶</Txt></View> : null}
                    {item.type === 'GIF' ? <View style={styles.gifPill}><Txt style={{ fontFamily: F.monoMedium, fontSize: 13, color: '#111' }}>GIF · loops</Txt></View> : null}
                    <Txt v="mono" style={styles.caption}>{`${kind(item).toLowerCase()} ${index + 1} of ${n}`}</Txt>
                    {item.dur ? <Tag style={{ position: 'absolute', right: 12, bottom: 10 }}>{fmtDur(item.dur)}</Tag> : null}
                  </View>
                )}
              />
              <Tag style={[styles.overlay, { left: 10 }]}>{`${cur.type} · ${cur.fmt}`}</Tag>
              <Tag style={[styles.overlay, { right: 10, borderRadius: 999, paddingHorizontal: 8 }]}>{`${slide + 1}/${n}`}</Tag>
            </View>

            {n > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 2 }}>
                {items.map((it, i) => (
                  <Press
                    key={i}
                    scaleTo={0.92}
                    accessibilityLabel={`Item ${i + 1}`}
                    accessibilityState={{ selected: i === slide }}
                    onPress={() => go(i)}
                    style={[styles.film, { opacity: i === slide ? 1 : 0.6, borderColor: i === slide ? T.accent : 'transparent', transitionProperty: ['opacity', 'borderColor'], transitionDuration: 180 }]}>
                    {firstReady ? <Image source={thumbPreviewOf(it)} style={StyleSheet.absoluteFill} contentFit="cover" autoplay={false} transition={180} priority="low" cachePolicy="memory" /> : null}
                    <Tag style={{ paddingVertical: 1, paddingHorizontal: 3, marginBottom: 4 }}>{it.fmt}</Tag>
                  </Press>
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.meta}>
              {[
                ['Type', kind(cur)],
                ['Format', cur.fmt],
                ['Size', cur.w && cur.h ? `${cur.w}×${cur.h}` : '—'],
                ['Source', post.source],
              ].map(([k, v], i) => (
                <View key={k} style={{ flex: 1, padding: 10, minWidth: 0, borderLeftWidth: i ? StyleSheet.hairlineWidth : 0, borderLeftColor: T.line }}>
                  <Txt v="sub" style={{ fontSize: 11 }}>{k}</Txt>
                  <Txt numberOfLines={1} style={{ fontFamily: F.monoMedium, fontSize: 12.5, marginTop: 3 }}>{v}</Txt>
                </View>
              ))}
            </View>
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {post.nsfw ? null : (
                <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
                  {(settings.folderUri ? (['photos', 'files', 'folder'] as const) : (['photos', 'files'] as const)).map((k) => (
                    <Press
                      key={k}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: saveTo === k }}
                      onPress={() => setSaveTo(k)}
                      style={[styles.dest, { borderColor: saveTo === k ? T.accent : T.line, backgroundColor: saveTo === k ? T.soft : 'transparent', transitionProperty: ['borderColor', 'backgroundColor'], transitionDuration: 180 }]}>
                      <Txt style={{ fontFamily: F.semibold, fontSize: 13, color: saveTo === k ? T.softInk : T.sub }}>{k === 'photos' ? `${Platform.OS === 'ios' ? 'Photos' : 'Gallery'} album` : k === 'folder' ? settings.folderName : 'App folder'}</Txt>
                    </Press>
                  ))}
                </View>
              )}
              {saveTo === 'photos' ? (
                <Press accessibilityRole="button" onPress={chooseAlbum} style={styles.albumChoice}>
                  <Txt v="sub">Gallery album</Txt>
                  <Txt style={{ fontFamily: F.semibold, color: T.softInk }}>{albumName} ›</Txt>
                </Press>
              ) : null}
              <Txt v="sub">
                Saved as the original file, without re-encoding. To:{' '}
                <Txt v="mono" style={{ color: T.ink }}>{folderLabel(folderKey(post.source, post.nsfw), saveTo)}</Txt>
              </Txt>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {loaded ? (
        <View style={styles.footer}>
          <Btn label="Save this" kind="raised" onPress={() => { enqueue(post, [slide], saveTo, albumName); router.navigate('/queue'); }} style={{ flex: 1, height: 50, borderRadius: T.r }} />
          <Btn
            label={n > 1 ? `Save all ${n}` : 'Save'}
            onPress={() => {
              if (n > 1 && settings.askBulk) return router.push({ pathname: '/picker', params: { slide, saveTo, albumName } });
              enqueue(post, items.map((_, i) => i), saveTo, albumName);
              router.navigate('/queue');
            }}
            style={{ flex: 1.4, height: 50, borderRadius: T.r }}
          />
        </View>
      ) : null}
      <Modal visible={albumPickerOpen} transparent animationType="fade" onRequestClose={() => setAlbumPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.albumModal}>
            <Txt v="title">Choose gallery album</Txt>
            <ScrollView style={{ maxHeight: 360 }}>
              {albums.map((name) => (
                <Press key={name} onPress={() => { setAlbumName(name); setAlbumPickerOpen(false); }} style={styles.albumRow}>
                  <Txt style={{ flex: 1 }}>{name}</Txt>
                  {name === albumName ? <Txt style={{ color: T.accent }}>Selected</Txt> : null}
                </Press>
              ))}
            </ScrollView>
            <Btn label="Cancel" kind="raised" onPress={() => setAlbumPickerOpen(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  slide: { aspectRatio: 4 / 5, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 32, gap: 8, borderRadius: T.r, borderWidth: 1, borderStyle: 'dashed', borderColor: T.line },
  dest: { flex: 1, height: 36, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  albumChoice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 42, paddingHorizontal: 12, borderRadius: T.rs, borderWidth: 1, borderColor: T.line, backgroundColor: T.surface },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' },
  albumModal: { gap: 12, padding: 16, borderRadius: T.r, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line },
  albumRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.line },
  loading: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 8 },
  play: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  gifPill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.9)' },
  caption: { position: 'absolute', left: 12, bottom: 12, color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  overlay: { position: 'absolute', top: 10, paddingVertical: 5, paddingHorizontal: 7, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.6)' },
  film: { width: 46, height: 56, borderRadius: 10, overflow: 'hidden', borderWidth: 2, backgroundColor: T.raised, alignItems: 'center', justifyContent: 'flex-end' },
  meta: { marginHorizontal: 16, flexDirection: 'row', borderRadius: T.r, borderWidth: StyleSheet.hairlineWidth, borderColor: T.line, backgroundColor: T.surface },
  // Skeleton breathes while the post loads (Reanimated CSS animation, runs on the UI thread).
  pulse: { animationName: { from: { opacity: 1 }, to: { opacity: 0.45 } }, animationDuration: '900ms', animationIterationCount: 'infinite', animationDirection: 'alternate', animationTimingFunction: 'ease-in-out' },
  footer: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.line, backgroundColor: T.bg },
});
