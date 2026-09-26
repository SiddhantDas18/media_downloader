import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, Btn, Thumb, Txt } from '@/components/ui';
import { T } from '@/constants/theme';
import { folderLabel, folderName, thumbOf, useApp } from '@/lib/store';

export default function Folder() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { history, settings, unlocked } = useApp();
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const items = history.filter((h) => h.folder === key && (!h.nsfw || (settings.allowNsfw && (!settings.lockPrivate || unlocked))));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -12 }}>
          <BackButton color={T.softInk} />
          <Txt style={{ color: T.softInk, marginLeft: -6 }} onPress={() => router.back()}>All folders</Txt>
        </View>
        <View style={{ gap: 4, paddingHorizontal: 2 }}>
          <Txt v="display">{folderName(key)}</Txt>
          <Txt v="mono">{`${folderLabel(key)} · ${items.length} files`}</Txt>
          <Btn
            label="Change save location"
            kind="ghost"
            onPress={() => router.push('/location')}
            style={{ alignSelf: 'flex-start', height: 34, marginTop: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: T.line }}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {items.map((h) => {
            const hidden = h.nsfw && settings.blurNsfw && !revealed[h.id];
            return (
              <Thumb
                key={h.id}
                uri={thumbOf(h)}
                type={h.type}
                fmt={h.fmt}
                hidden={hidden}
                style={{ width: '32.5%' }}
                onPress={() => (hidden ? setRevealed({ ...revealed, [h.id]: true }) : router.push(`/viewer/${h.id}`))}
              />
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
