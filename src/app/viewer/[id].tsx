import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, Btn, Txt } from '@/components/ui';
import { F, T } from '@/constants/theme';
import { dayLabel, deleteSaved, folderLabel, formatBytes, useApp, type Saved } from '@/lib/store';

function Media({ item }: { item: Saved }) {
  const video = item.type === 'VID' || (item.type === 'GIF' && item.fmt !== 'GIF');
  const player = useVideoPlayer(video ? item.uri : null, (p) => {
    p.loop = item.type === 'GIF';
    p.muted = item.type === 'GIF';
    p.play();
  });
  const ratio = item.w && item.h ? item.w / item.h : 1;
  const style = { width: '100%', aspectRatio: ratio, maxHeight: 520 } as const;
  return video ? (
    <VideoView player={player} style={style} contentFit="contain" nativeControls={item.type === 'VID'} />
  ) : (
    <Image source={item.uri} style={style} contentFit="contain" />
  );
}

export default function Viewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useApp((s) => s.history.find((h) => h.id === id));
  if (!item) return null;

  const rows: [string, string][] = [
    ['Format', item.fmt + (item.dur ? ` · ${Math.floor(item.dur / 60)}:${String(Math.round(item.dur % 60)).padStart(2, '0')}` : '')],
    ['Resolution', item.w && item.h ? `${item.w}×${item.h}` : '—'],
    ['Size', formatBytes(item.bytes)],
    ['Source', item.source],
    ['Saved to', folderLabel(item.folder, item.saveTo)],
    ['Downloaded', dayLabel(item.savedAt)],
  ];

  const remove = () =>
    Alert.alert('Delete this file?', `${item.name} will be removed from the app. Copies in your photo library are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => (router.back(), deleteSaved(item.id)) },
    ]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 }}>
        <BackButton color="#fff" />
        <Txt numberOfLines={1} style={{ flex: 1, color: '#fff', fontFamily: F.monoMedium, fontSize: 13 }}>{item.name}</Txt>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
        <Media item={item} />
      </View>
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <ScrollView contentContainerStyle={{ gap: 8 }} style={{ maxHeight: 200 }}>
          {rows.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
              <Txt style={{ color: '#8a8a8a', fontSize: 13 }}>{k}</Txt>
              <Txt style={{ flex: 1, textAlign: 'right', color: '#eee', fontFamily: F.mono, fontSize: 12.5 }}>{v}</Txt>
            </View>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Btn label="Share" onPress={() => Sharing.shareAsync(item.uri)} style={{ flex: 1 }} />
          <Btn label="Folder" kind="raised" onPress={() => router.push(`/folder/${item.folder}`)} style={{ flex: 1, backgroundColor: '#262626' }} />
          <Btn label="Delete" kind="raised" color={T.danger} onPress={remove} style={{ flex: 1, backgroundColor: '#262626' }} />
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: '#141414', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 8, borderColor: T.line },
});
