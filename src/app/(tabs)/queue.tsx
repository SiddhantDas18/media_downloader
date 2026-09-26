import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Card, Row, Txt } from '@/components/ui';
import { F, T } from '@/constants/theme';
import { previewOf } from '@/lib/extract';
import { clearFinished, folderKey, folderLabel, formatBytes, retry, useApp, type Job } from '@/lib/store';

function status(j: Job, now: number) {
  if (j.status === 'done') return `Saved to ${folderLabel(folderKey(j.post.source, j.post.nsfw))}`;
  if (j.status === 'failed') return `Failed · ${j.error ?? 'unknown error'} · Tap to retry`;
  if (j.status === 'waiting') return 'Waiting';
  const pct = j.total ? Math.round((j.written / j.total) * 100) : 0;
  const secs = (now - (j.startedAt ?? now)) / 1000;
  return secs > 0.5 ? `${pct}% · ${formatBytes(j.written / secs)}/s` : `${pct}%`;
}

export default function Queue() {
  const { jobs } = useApp();
  const [now, setNow] = useState(0); // ticks while downloads run
  const running = jobs.filter((j) => j.status === 'running').length;
  const waiting = jobs.filter((j) => j.status === 'waiting').length;

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
          {jobs.some((j) => j.status === 'done' || j.status === 'failed') ? (
            <Btn label="Clear finished" kind="ghost" onPress={clearFinished} style={{ height: 36, paddingHorizontal: 0 }} />
          ) : null}
        </View>

        {!jobs.length ? (
          <View style={styles.empty}>
            <Txt v="sub" style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }}>{'Nothing downloading.\nLinks you fetch will show up here.'}</Txt>
          </View>
        ) : (
          <Card>
            {jobs.map((j, i) => {
              const pct = j.status === 'done' ? 100 : j.total ? (j.written / j.total) * 100 : 0;
              return (
                <Row key={j.id} first={i === 0} onPress={j.status === 'failed' ? () => retry(j.id) : undefined} style={{ paddingHorizontal: 12 }}>
                  <View style={styles.thumb}>
                    <Image source={previewOf(j.item)} style={StyleSheet.absoluteFill} contentFit="cover" autoplay={false} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Txt numberOfLines={1} style={{ flex: 1, fontFamily: F.monoMedium, fontSize: 13 }}>{j.name}</Txt>
                      <Txt v="mono">{j.total ? formatBytes(j.total) : j.item.fmt}</Txt>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.bar, { width: `${pct}%`, backgroundColor: j.status === 'done' ? T.sub : j.status === 'failed' ? T.danger : T.accent }]} />
                    </View>
                    <Txt numberOfLines={1} v="sub" style={{ fontSize: 12, color: j.status === 'done' ? T.softInk : j.status === 'failed' ? T.danger : T.sub }}>
                      {status(j, now)}
                    </Txt>
                  </View>
                </Row>
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
  track: { height: 4, borderRadius: 2, backgroundColor: T.raised, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 2 },
});
