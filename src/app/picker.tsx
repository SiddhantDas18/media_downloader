import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Btn, Radio, Tag, Txt } from '@/components/ui';
import { F, T } from '@/constants/theme';
import { previewOf } from '@/lib/extract';
import { enqueue, useApp } from '@/lib/store';

export default function Picker() {
  const { post } = useApp();
  const slide = Number(useLocalSearchParams<{ slide: string }>().slide ?? 0);
  const n = post?.items.length ?? 0;
  const [mode, setMode] = useState<'all' | 'choose' | 'one'>('all');
  const [sel, setSel] = useState<number[]>(() => [...Array(n).keys()]);
  if (!post) return null;

  const cur = post.items[slide];
  const pick = mode === 'all' ? [...Array(n).keys()] : mode === 'one' ? [slide] : sel;
  const label = mode === 'all' ? `Download ${n} items` : mode === 'one' ? 'Download 1 item' : `Download ${sel.length} selected`;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 24, paddingBottom: 34, gap: 14 }}>
      <View>
        <Txt v="display" style={{ fontSize: 24, lineHeight: 28 }}>{`This post has ${n} items`}</Txt>
        <Txt v="mono" style={{ marginTop: 4 }}>{`${post.author} · ${post.host}`}</Txt>
      </View>
      <View style={{ gap: 8 }}>
        <Radio on={mode === 'all'} title="Download all" sub={`${n} items`} onPress={() => setMode('all')} />
        <Radio on={mode === 'choose'} title="Choose items" sub={`${sel.length} of ${n} selected`} onPress={() => setMode('choose')} />
        <Radio on={mode === 'one'} title="Only the current item" sub={`Item ${slide + 1} · ${cur.fmt}`} onPress={() => setMode('one')} />
      </View>

      {mode === 'choose' ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt v="sub" style={{ fontSize: 13 }}>{`${sel.length} selected`}</Txt>
            <Btn
              label={sel.length === n ? 'Select none' : 'Select all'}
              kind="ghost"
              onPress={() => setSel(sel.length === n ? [] : [...Array(n).keys()])}
              style={{ height: 32, paddingHorizontal: 0 }}
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {post.items.map((it, i) => {
              const on = sel.includes(i);
              return (
                <Pressable
                  key={i}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Item ${i + 1}, ${it.fmt}`}
                  onPress={() => setSel(on ? sel.filter((x) => x !== i) : [...sel, i].sort((a, b) => a - b))}
                  style={[styles.cell, { opacity: on ? 1 : 0.55, borderColor: on ? T.accent : 'transparent' }]}>
                  <Image source={previewOf(it)} style={StyleSheet.absoluteFill} contentFit="cover" autoplay={false} />
                  <View style={[styles.check, { backgroundColor: on ? T.accent : 'rgba(0,0,0,0.25)' }]}>
                    <Text style={{ color: T.accentInk, fontFamily: F.semibold, fontSize: 12 }}>{on ? '✓' : ''}</Text>
                  </View>
                  <Tag style={{ position: 'absolute', left: 5, bottom: 5 }}>{it.fmt}</Tag>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Btn
        label={label}
        disabled={!pick.length}
        onPress={() => {
          enqueue(post, pick);
          router.dismissTo('/queue');
        }}
        style={{ height: 52, borderRadius: T.r }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cell: { width: '32%', aspectRatio: 1, borderRadius: T.rs, overflow: 'hidden', borderWidth: 2.5, backgroundColor: T.raised },
  check: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
