import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Card, Thumb, Txt } from '@/components/ui';
import { F, T } from '@/constants/theme';
import { parseInput, sourceOf } from '@/lib/extract';
import { thumbOf, useApp } from '@/lib/store';

export default function Home() {
  const { settings, history } = useApp();
  const [value, setValue] = useState('');
  // iOS: we only learn *that* a link is on the clipboard (reading it shows the paste prompt).
  const [clip, setClip] = useState<{ url?: string } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const checkClipboard = useCallback(async () => {
    if (!settings.watchClipboard) return setClip(null);
    if (Platform.OS === 'ios') return setClip((await Clipboard.hasUrlAsync()) ? {} : null);
    const url = parseInput(await Clipboard.getStringAsync())?.href;
    setClip(url && sourceOf(new URL(url).host.replace(/^www\./, '')) !== 'Web' ? { url } : null);
  }, [settings.watchClipboard]);

  useFocusEffect(
    useCallback(() => {
      checkClipboard();
      const sub = AppState.addEventListener('change', (s) => s === 'active' && checkClipboard());
      return () => sub.remove();
    }, [checkClipboard]),
  );

  const open = (url: string) => router.push({ pathname: '/preview', params: { url } });
  const fetchClip = async () => {
    const text = clip?.url ?? (await Clipboard.getStringAsync());
    const url = parseInput(text)?.href;
    setDismissed(url ?? '');
    setClip(null);
    if (url) open(url);
  };
  const showClip = clip && dismissed !== (clip.url ?? '');
  const recent = history.filter((h) => !h.nsfw).slice(0, 4);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 24, gap: 16 }}>
        <View style={{ gap: 4, paddingHorizontal: 2 }}>
          <Txt v="label">Media Downloader</Txt>
          <Txt v="display">Paste a link</Txt>
        </View>

        {showClip ? (
          <View style={{ borderRadius: T.r, backgroundColor: T.soft, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: T.accent }} />
              <Txt style={{ fontSize: 14, fontFamily: F.semibold, color: T.softInk }}>Link found in your clipboard</Txt>
            </View>
            {clip.url ? <Txt v="mono" style={{ fontSize: 12.5, lineHeight: 17, color: T.ink }}>{clip.url.replace(/^https?:\/\/(www\.)?/, '')}</Txt> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn label="Fetch" onPress={fetchClip} style={{ flex: 1, height: 40 }} />
              <Btn label="Dismiss" kind="ghost" onPress={() => setDismissed(clip.url ?? '')} style={{ height: 40 }} />
            </View>
          </View>
        ) : null}

        <Card style={{ padding: 12, gap: 10 }}>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="https://reddit.com/r/…"
            placeholderTextColor={T.sub}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => value && open(value)}
            accessibilityLabel="Post link"
            style={{ height: 46, borderRadius: T.rs, borderWidth: 1, borderColor: T.line, backgroundColor: T.bg, color: T.ink, paddingHorizontal: 12, fontFamily: F.mono, fontSize: 13.5 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label="Paste" kind="raised" onPress={async () => setValue(await Clipboard.getStringAsync())} />
            <Btn label="Fetch media" disabled={!value.trim()} onPress={() => open(value)} style={{ flex: 1 }} />
          </View>
        </Card>

        <Txt v="sub" style={{ fontSize: 13, lineHeight: 19, paddingHorizontal: 2 }}>
          Works with Reddit, X, TikTok, Instagram, Facebook, Tumblr, Pinterest and direct file links. Carousels and galleries are detected automatically.
        </Txt>

        {recent.length ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 4, paddingHorizontal: 2 }}>
              <Txt v="title">Recent</Txt>
              <Btn label="See all" kind="ghost" onPress={() => router.navigate('/history')} style={{ height: 32, paddingHorizontal: 0 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[0, 1, 2, 3].map((i) => {
                const h = recent[i];
                return h ? (
                  <Thumb key={h.id} uri={thumbOf(h)} type={h.type} fmt={h.fmt} style={{ flex: 1 }} onPress={() => router.push(`/viewer/${h.id}`)} />
                ) : (
                  <View key={i} style={{ flex: 1 }} />
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
