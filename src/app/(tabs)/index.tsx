import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Card, Thumb, Txt } from '@/components/ui';
import { F, T } from '@/constants/theme';
import { thumbOf, useApp } from '@/lib/store';

export default function Home() {
  const history = useApp((s) => s.history);
  const [value, setValue] = useState('');
  const open = (url: string) => router.push({ pathname: '/preview', params: { url } });
  const recent = history.filter((h) => !h.nsfw).slice(0, 4);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 24, gap: 16 }}>
        <View style={{ gap: 4, paddingHorizontal: 2 }}>
          <Txt v="label">Media Downloader</Txt>
          <Txt v="display">Paste a link</Txt>
        </View>

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
