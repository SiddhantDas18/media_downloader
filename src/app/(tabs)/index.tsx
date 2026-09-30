import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Bar, Btn, Card, Press, Thumb, Txt } from '@/components/ui';
import { F, T } from '@/constants/theme';
import { folderLabel, thumbOf, useApp } from '@/lib/store';

export default function Home() {
  const history = useApp((s) => s.history);
  const jobs = useApp((s) => s.jobs);
  const settings = useApp((s) => s.settings);
  const active = jobs.filter((j) => j.status === 'running' || j.status === 'waiting');
  const written = active.reduce((a, j) => a + j.written, 0);
  const total = active.reduce((a, j) => a + j.total, 0);
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
          <View style={{ position: 'relative' }}>
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
              style={{ height: 46, borderRadius: T.rs, borderWidth: 1, borderColor: T.line, backgroundColor: T.bg, color: T.ink, paddingLeft: 12, paddingRight: value ? 42 : 12, fontFamily: F.mono, fontSize: 13.5 }}
            />
            {value ? (
              <Press
                accessibilityRole="button"
                accessibilityLabel="Clear post link"
                onPress={() => setValue('')}
                style={{ position: 'absolute', top: 5, right: 5, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
                <Txt style={{ color: T.sub, fontSize: 24, lineHeight: 26 }}>×</Txt>
              </Press>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label="Paste" kind="raised" onPress={async () => setValue(await Clipboard.getStringAsync())} />
            <Btn label="Fetch media" disabled={!value.trim()} onPress={() => open(value)} style={{ flex: 1 }} />
          </View>
        </Card>

        <Press accessibilityRole="button" accessibilityLabel="Change save location" onPress={() => router.push('/location')} style={styles.dest}>
          <Txt v="sub" style={{ fontSize: 12.5 }}>Saving to</Txt>
          <Txt numberOfLines={1} style={{ flex: 1, fontFamily: F.semibold, fontSize: 13.5, color: T.softInk }}>
            {folderLabel('All', settings.saveTo, settings.albumName)}
          </Txt>
          <Txt v="sub" style={{ fontSize: 12.5 }}>Change ›</Txt>
        </Press>

        {active.length ? (
          <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(150)}>
            <Press accessibilityRole="button" accessibilityLabel="Open download queue" onPress={() => router.navigate('/queue')} style={styles.progress}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt style={{ fontFamily: F.semibold, fontSize: 14 }}>{`Downloading ${active.length} ${active.length === 1 ? 'file' : 'files'}`}</Txt>
                <Txt v="sub">View queue ›</Txt>
              </View>
              <Bar pct={total ? (written / total) * 100 : 0} color={T.accent} />
            </Press>
          </Animated.View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Txt v="label" style={{ paddingHorizontal: 2 }}>Works with</Txt>
          <View style={styles.chips}>
            {['Reddit', 'Instagram', 'X', 'TikTok', 'Facebook', 'Tumblr', 'Pinterest', 'Direct links'].map((name) => (
              <View key={name} style={styles.chip}>
                <Txt style={{ fontSize: 12.5, color: T.ink }}>{name}</Txt>
              </View>
            ))}
          </View>
          <Txt v="sub" style={{ paddingHorizontal: 2 }}>Galleries and carousels are detected automatically. Copy a link anywhere and it pops up here.</Txt>
        </View>

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
        ) : (
          <View style={styles.empty}>
            <Txt v="sub" style={{ textAlign: 'center', fontSize: 13.5, lineHeight: 20 }}>{'Your downloads will show up here.\nPaste a post link above to start.'}</Txt>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dest: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: T.r, backgroundColor: T.soft },
  progress: { gap: 10, padding: 14, borderRadius: T.r, backgroundColor: T.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: T.line },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: T.raised },
  empty: { paddingVertical: 32, paddingHorizontal: 20, borderRadius: T.r, borderWidth: 1, borderStyle: 'dashed', borderColor: T.line },
});
