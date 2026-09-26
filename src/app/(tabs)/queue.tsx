import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Bar, Btn, Card, Row, Txt } from '@/components/ui';
import { F, T } from '@/constants/theme';
import { thumbPreviewOf } from '@/lib/extract';
import { clearFinished, folderKey, folderLabel, formatBytes, retry, useApp, type Job } from '@/lib/store';

function status(j: Job, now: number) {
  if (j.status === 'done') return `Saved to ${folderLabel(folderKey(j.post.source, j.post.nsfw), j.saveTo)}`;
  if (j.status === 'failed') return `Failed · ${j.error ?? 'unknown error'}`;
  if (j.status === 'waiting') return 'Waiting';
  const pct = j.total ? Math.round((j.written / j.total) * 100) : 0;
  const secs = (now - (j.startedAt ?? now)) / 1000;
  return secs > 0.5 ? `${pct}% · ${formatBytes(j.written / secs)}/s` : `${pct}%`;
}

export default function Queue() {
  const jobs = useApp((s) => s.jobs);
  const [now, setNow] = useState(0); // ticks while downloads run
  const running = jobs.filter((j) => j.status === 'running').length;
  const waiting = jobs.filter((j) => j.status === 'waiting').length;
  const failed = jobs.filter((j) => j.status === 'failed');

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  const summary = running + waiting ? `${running} downloading · ${waiting} waiting` : jobs.length ? 'All done' : 'Idle';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 24, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 2 }}>
          <View>
            <Txt v="display">Queue</Txt>
            <Txt v="sub" style={{ fontSize: 13, marginTop: 4 }}>{summary}</Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {failed.length > 1 ? (
              <Btn label={`Retry all ${failed.length}`} kind="ghost" onPress={() => failed.forEach((j) => retry(j.id))} style={{ height: 36, paddingHorizontal: 0 }} />
            ) : null}
            {jobs.some((j) => j.status === 'done' || j.status === 'failed') ? (
              <Btn label="Clear finished" kind="ghost" onPress={clearFinished} style={{ height: 36, paddingHorizontal: 0 }} />
            ) : null}
          </View>
        </View>

        {!jobs.length ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.empty}>
            <Txt v="sub" style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }}>{'Nothing downloading.\nLinks you fetch will show up here.'}</Txt>
          </Animated.View>
        ) : (
          <Card>
            {jobs.map((j, i) => {
              const pct = j.status === 'done' ? 100 : j.total ? (j.written / j.total) * 100 : 0;
              return (
                <Animated.View key={j.id} entering={FadeInDown.duration(220)} exiting={FadeOut.duration(160)} layout={LinearTransition.springify().damping(20)}>
                <Row first={i === 0} style={{ paddingHorizontal: 12 }}>
                  <View style={styles.thumb}>
                    <Image source={thumbPreviewOf(j.item)} style={StyleSheet.absoluteFill} contentFit="cover" autoplay={false} transition={180} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Txt numberOfLines={1} style={{ flex: 1, fontFamily: F.monoMedium, fontSize: 13 }}>{j.name}</Txt>
                      <Txt v="mono">{j.total ? formatBytes(j.total) : j.item.fmt}</Txt>
                    </View>
                    <Bar pct={pct} color={j.status === 'done' ? T.sub : j.status === 'failed' ? T.danger : T.accent} />
                    <Txt numberOfLines={j.status === 'failed' ? 2 : 1} v="sub" style={{ fontSize: 12, color: j.status === 'done' ? T.softInk : j.status === 'failed' ? T.danger : T.sub }}>
                      {status(j, now)}
                    </Txt>
                  </View>
                  {j.status === 'failed' ? (
                    <Btn label="Retry" kind="raised" accessibilityLabel={`Retry ${j.name}`} onPress={() => retry(j.id)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999 }} />
                  ) : null}
                </Row>
                </Animated.View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: 48, paddingHorizontal: 20, borderRadius: T.r, borderWidth: 1, borderStyle: 'dashed', borderColor: T.line },
  thumb: { width: 48, height: 48, borderRadius: T.rs, overflow: 'hidden', backgroundColor: T.raised },
});
