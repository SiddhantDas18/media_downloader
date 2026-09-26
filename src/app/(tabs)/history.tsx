import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Row, Thumb, Txt } from '@/components/ui';
import { F, T } from '@/constants/theme';
import { dayLabel, folderLabel, folderName, formatBytes, thumbOf, unlockPrivate, useApp, type Saved } from '@/lib/store';

const ORDER = ['Reddit', 'Instagram', 'Facebook', 'X', 'TikTok', 'Tumblr', 'Pinterest', 'Web', 'All', 'Private'];
const INITIALS: Record<string, string> = { Facebook: 'FB', Instagram: 'IG', Reddit: 'RD', X: 'X', TikTok: 'TT', Tumblr: 'TB', Pinterest: 'PN', Web: 'WB', All: 'MD', Private: 'PV' };

export default function History() {
  const history = useApp((s) => s.history);
  const settings = useApp((s) => s.settings);
  const unlocked = useApp((s) => s.unlocked);
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = params.mode === 'timeline' ? 'timeline' : 'folders';
  const setMode = (m: string) => router.setParams({ mode: m });
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const lockedOut = settings.lockPrivate && !unlocked;
  const shown = history.filter((h) => !h.nsfw || settings.allowNsfw);
  const visible = shown.filter((h) => !h.nsfw || !lockedOut);
  const privCount = shown.length - visible.length;

  const groups: Record<string, Saved[]> = {};
  shown.forEach((h) => (groups[h.folder] ??= []).push(h));
  const folders = [...ORDER.filter((k) => groups[k]), ...Object.keys(groups).filter((k) => !ORDER.includes(k))];

  const days: [string, Saved[]][] = [];
  visible.forEach((h) => {
    const d = dayLabel(h.savedAt);
    if (days.at(-1)?.[0] !== d) days.push([d, []]);
    days.at(-1)![1].push(h);
  });

  const hidden = (h: Saved) => h.nsfw && settings.blurNsfw && !revealed[h.id];
  const openItem = (h: Saved) => (hidden(h) ? setRevealed({ ...revealed, [h.id]: true }) : router.push(`/viewer/${h.id}`));
  const openFolder = async (k: string) => {
    if (k === 'Private' && !(await unlockPrivate())) return;
    router.push(`/folder/${k}`);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 24, gap: 14 }}>
        <View style={{ gap: 4, paddingHorizontal: 2 }}>
          <Txt v="display">History</Txt>
          <Txt v="mono">{`${visible.length} files · ${formatBytes(visible.reduce((a, h) => a + h.bytes, 0))}`}</Txt>
        </View>
        <View style={styles.seg} accessibilityRole="tablist">
          {/* The selected pill slides between the two segments. */}
          <View pointerEvents="none" style={styles.segTrack}>
            <Animated.View style={[styles.segPill, { left: mode === 'folders' ? '0%' : '50%', transitionProperty: 'left', transitionDuration: 240, transitionTimingFunction: 'ease-out' }]} />
          </View>
          {(['folders', 'timeline'] as const).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === k }}
              onPress={() => setMode(k)}
              style={styles.segBtn}>
              <Txt style={{ fontFamily: F.semibold, fontSize: 14, color: mode === k ? T.ink : T.sub }}>{k === 'folders' ? 'Folders' : 'Timeline'}</Txt>
            </Pressable>
          ))}
        </View>

        {!shown.length ? (
          <View style={styles.empty}>
            <Txt v="sub" style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }}>{'No downloads yet.\nSaved files are sorted into folders here.'}</Txt>
          </View>
        ) : mode === 'folders' ? (
          <Animated.View key="folders" entering={FadeInLeft.duration(280)}>
          <Card>
            {folders.map((k, i) => {
              const g = groups[k];
              const priv = k === 'Private';
              return (
                <Row key={k} first={i === 0} onPress={() => openFolder(k)} style={{ paddingHorizontal: 12 }}>
                  <View style={[styles.chip, { backgroundColor: priv ? T.soft : T.raised }]}>
                    <Txt style={{ fontFamily: F.semibold, fontSize: 12, color: priv ? T.softInk : T.ink }}>{INITIALS[k] ?? k.slice(0, 2).toUpperCase()}</Txt>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt style={{ fontFamily: F.semibold }}>{folderName(k)}</Txt>
                      {priv ? (
                        <View style={styles.lock}>
                          <Txt style={{ fontFamily: F.monoMedium, fontSize: 10, color: T.softInk }}>{lockedOut ? 'LOCKED' : 'NSFW'}</Txt>
                        </View>
                      ) : null}
                    </View>
                    <Txt v="mono" numberOfLines={1} style={{ fontSize: 11.5 }}>{folderLabel(k)}</Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Txt style={{ fontFamily: F.monoMedium, fontSize: 13 }}>{g.length}</Txt>
                    <Txt v="sub" style={{ fontSize: 11.5 }}>{formatBytes(g.reduce((a, h) => a + h.bytes, 0))}</Txt>
                  </View>
                </Row>
              );
            })}
          </Card>
          </Animated.View>
        ) : (
          <Animated.View key="timeline" entering={FadeInRight.duration(280)} style={{ gap: 14 }}>
            {days.map(([label, rows]) => (
              <View key={label} style={{ gap: 6 }}>
                <Txt v="label" style={{ paddingVertical: 6, paddingHorizontal: 2 }}>{label}</Txt>
                <Card>
                  {rows.map((h, i) => (
                    <Row key={h.id} first={i === 0} onPress={() => openItem(h)} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                      <Thumb uri={thumbOf(h)} type={h.type} hidden={hidden(h)} style={{ width: 50, height: 50 }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt numberOfLines={1} style={{ fontFamily: F.monoMedium, fontSize: 13 }}>{h.name}</Txt>
                        <Txt v="sub" style={{ fontSize: 12, marginTop: 2 }}>
                          {[h.fmt, formatBytes(h.bytes), h.w && h.h ? `${h.w}×${h.h}` : ''].filter(Boolean).join(' · ')}
                        </Txt>
                        <Txt v="mono" numberOfLines={1} style={{ fontSize: 11, color: T.softInk, marginTop: 3 }}>{folderLabel(h.folder, h.saveTo)}</Txt>
                      </View>
                    </Row>
                  ))}
                </Card>
              </View>
            ))}
            {privCount ? (
              <Pressable accessibilityRole="button" onPress={unlockPrivate} style={[styles.empty, { paddingVertical: 12, minHeight: 44 }]}>
                <Txt v="sub" style={{ textAlign: 'center', fontSize: 13, fontFamily: F.medium }}>{`${privCount} private items hidden · Unlock`}</Txt>
              </Pressable>
            ) : null}
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', padding: 3, borderRadius: T.rs, backgroundColor: T.raised },
  segBtn: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
  segTrack: { position: 'absolute', top: 3, bottom: 3, left: 3, right: 3 },
  segPill: { position: 'absolute', top: 0, bottom: 0, width: '50%', borderRadius: T.rs - 2, backgroundColor: T.surface, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' },
  empty: { paddingVertical: 48, paddingHorizontal: 20, borderRadius: T.r, borderWidth: 1, borderStyle: 'dashed', borderColor: T.line },
  chip: { width: 44, height: 44, borderRadius: T.rs, alignItems: 'center', justifyContent: 'center' },
  lock: { paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3, backgroundColor: T.soft },
});
