import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Card, Row, Txt } from '@/components/ui';
import { T } from '@/constants/theme';
import { requestPhotos, updateSettings, useApp } from '@/lib/store';

export default function Onboarding() {
  const { watchClipboard } = useApp((s) => s.settings);
  const [photos, setPhotos] = useState(false);

  const perms = [
    {
      title: 'Photos & files',
      sub: 'Save media to your device',
      on: photos,
      allow: async () => setPhotos(await requestPhotos()),
    },
    {
      title: 'Clipboard',
      sub: 'Spot post links when you copy them',
      on: watchClipboard,
      allow: () => updateSettings({ watchClipboard: true }),
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 24, gap: 22 }}>
        <View style={{ aspectRatio: 1 / 0.78, borderRadius: T.r, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 96, height: 96, borderRadius: 28, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Txt style={{ fontSize: 48, lineHeight: 56, color: T.accentInk }}>↓</Txt>
          </View>
        </View>
        <View style={{ gap: 10 }}>
          <Txt v="display" style={{ lineHeight: 32 }}>Save posts in their original format.</Txt>
          <Txt style={{ color: T.sub }}>
            Photos, videos and GIFs from any post link, at the resolution they were uploaded. Every file is sorted into a folder you can find later.
          </Txt>
        </View>
        <Card>
          {perms.map((p, i) => (
            <Row key={p.title} first={i === 0}>
              <View style={{ flex: 1 }}>
                <Txt style={{ fontSize: 15, fontWeight: '600' }}>{p.title}</Txt>
                <Txt v="sub" style={{ fontSize: 13, marginTop: 2 }}>{p.sub}</Txt>
              </View>
              <Btn
                label={p.on ? 'Allowed' : 'Allow'}
                kind={p.on ? 'ghost' : 'accent'}
                onPress={p.allow}
                disabled={p.on}
                style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: p.on ? T.soft : T.accent, opacity: 1 }}
              />
            </Row>
          ))}
        </Card>
        <View style={{ flex: 1 }} />
        <Btn label="Continue" onPress={() => updateSettings({ onboarded: true })} style={{ height: 52, borderRadius: T.r }} />
      </ScrollView>
    </SafeAreaView>
  );
}
