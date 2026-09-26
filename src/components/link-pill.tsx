import * as Clipboard from 'expo-clipboard';
import { router, useRootNavigationState } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOutUp, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/ui';
import { F, T } from '@/constants/theme';
import { fmtOf, parseInput, sourceOf } from '@/lib/extract';
import { syncBubble } from '@/lib/bubble';
import { useApp } from '@/lib/store';

const INITIALS: Record<string, string> = { Reddit: 'RD', Instagram: 'IG', X: 'X', TikTok: 'TT', Facebook: 'FB', Tumblr: 'TB', Pinterest: 'PN', Web: '↓' };
const open = (url: string) => router.push({ pathname: '/preview', params: { url } });

/** A post link we can download: a known site, or a direct media file. */
function supported(text: string) {
  const url = parseInput(text);
  if (!url) return null;
  const source = sourceOf(url.host.replace(/^www\.|^m\.|^old\./, ''));
  return source !== 'Web' || fmtOf(url.pathname) ? { url: url.href, source } : null;
}

/**
 * Two shortcuts into the app, mounted once at the root:
 * - Links shared to the app (Instagram/Reddit → Share → Media Downloader) open Preview directly.
 * - A pill slides in over any screen when a post link is copied: live while the app is open, and on returning to it.
 */
export function LinkPill() {
  const watch = useApp((s) => s.settings.watchClipboard);
  const ready = !!useRootNavigationState()?.key;
  const insets = useSafeAreaInsets();
  // iOS: reading the clipboard shows the paste prompt, so the pill only knows *that* a link is there until tapped.
  const [pill, setPill] = useState<{ url?: string; source?: string } | null>(null);
  const lastUrl = useRef<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!ready) return;
    const show = (p: { url?: string; source?: string }) => {
      setPill(p);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setPill(null), 8000);
    };
    const checkClipboard = async () => {
      if (!watch) return;
      if (Platform.OS === 'ios') {
        if (await Clipboard.hasUrlAsync()) show({});
        return;
      }
      const hit = supported(await Clipboard.getStringAsync());
      if (!hit || hit.url === lastUrl.current) return;
      lastUrl.current = hit.url;
      show(hit);
    };
    const checkShared = () => {
      try {
        const text = Sharing.getSharedPayloads().map((p) => p.value).join(' ');
        const hit = text && supported(text);
        if (!text) return;
        Sharing.clearSharedPayloads();
        if (hit) open(hit.url);
      } catch {
        // Expo Go has no share target; receiving shares needs a development build.
      }
    };
    const onActive = () => {
      syncBubble();
      checkShared();
      checkClipboard();
    };
    onActive();
    const app = AppState.addEventListener('change', (s) => s === 'active' && onActive());
    const clip = Clipboard.addClipboardListener(() => checkClipboard());
    return () => {
      app.remove();
      clip.remove();
      clearTimeout(hideTimer.current);
    };
  }, [ready, watch]);

  if (!pill) return null;
  const go = async () => {
    setPill(null);
    const hit = pill.url ? pill : supported((await Clipboard.getStringAsync()) ?? '');
    if (hit?.url) open(hit.url);
  };
  const label = pill.source ? `${pill.source} link copied` : 'Link copied';

  return (
    <Animated.View entering={SlideInUp.duration(180)} exiting={FadeOutUp.duration(180)} style={[styles.wrap, { top: insets.top + 6 }]} pointerEvents="box-none">
      <Press accessibilityRole="button" accessibilityLabel={`${label}. Download`} onPress={go} scaleTo={0.97} style={styles.pill}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{INITIALS[pill.source ?? 'Web'] ?? '↓'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{label}</Text>
          {pill.url ? (
            <Text numberOfLines={1} style={styles.url}>
              {pill.url.replace(/^https?:\/\/(www\.)?/, '')}
            </Text>
          ) : null}
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>Download</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={8} onPress={() => setPill(null)} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </Press>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 50 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 8, paddingRight: 10,
    borderRadius: 999, backgroundColor: T.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: T.line,
    boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
  },
  chip: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.soft, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: F.semibold, fontSize: 12, color: T.softInk },
  title: { fontFamily: F.semibold, fontSize: 14, color: T.ink },
  url: { fontFamily: F.mono, fontSize: 11.5, color: T.sub, marginTop: 1 },
  cta: { height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: T.accent, justifyContent: 'center' },
  ctaText: { fontFamily: F.semibold, fontSize: 13, color: T.accentInk },
  cancel: { height: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: T.raised, justifyContent: 'center' },
  cancelText: { fontFamily: F.semibold, fontSize: 13, color: T.ink },
});
