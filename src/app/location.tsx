import { Directory } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { Btn, Radio, Txt } from '@/components/ui';
import { T } from '@/constants/theme';
import { folderLabel, showToast, updateSettings, useApp, type SaveTo } from '@/lib/store';

const gallery = Platform.OS === 'ios' ? 'Photos' : 'Gallery';

export default function Location() {
  const { saveTo, folderName, albumName } = useApp((s) => s.settings);
  const [draft, setDraft] = useState(saveTo);

  // Android only: the system folder picker grants lasting access, so the folder is picked once and remembered.
  const pickFolder = async () => {
    try {
      const dir = await Directory.pickDirectoryAsync();
      updateSettings({ folderUri: dir.uri, folderName: decodeURIComponent(dir.name) });
      setDraft('folder');
    } catch {}
  };

  const options: [SaveTo, string, string][] = [
    ['photos', `${gallery} › ${albumName || 'Media Downloader'}`, `Straight into your ${gallery} app. Nothing is kept inside this app.`],
    ...(Platform.OS === 'android' && folderName
      ? [['folder', `Device › ${folderName}`, 'Straight into this folder. Nothing is kept inside this app.'] as [SaveTo, string, string]]
      : []),
    ['files', 'Private app folder', 'Kept only inside this app, hidden from your gallery. Share or export from the viewer.'],
  ];

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 24, paddingBottom: 34, gap: 12 }}>
      <View>
        <Txt v="display" style={{ fontSize: 24, lineHeight: 28 }}>Save location</Txt>
        <Txt v="sub" style={{ fontSize: 13, marginTop: 4 }}>Where new downloads go. Your choice is remembered until you change it.</Txt>
      </View>
      <View style={{ gap: 8 }}>
        {options.map(([key, title, sub]) => (
          <Radio key={key} on={draft === key} title={title} sub={sub} onPress={() => setDraft(key)} />
        ))}
      </View>
      {Platform.OS === 'android' ? (
        <Btn
          label={folderName ? 'Pick a different device folder' : 'Choose a folder on this device…'}
          kind="raised"
          onPress={pickFolder}
          style={{ borderRadius: T.r }}
        />
      ) : null}
      <Txt v="sub" style={{ fontSize: 12 }}>Files you already downloaded stay where they are.</Txt>
      <Btn
        label="Use this location"
        onPress={() => {
          updateSettings({ saveTo: draft });
          showToast('New downloads will be saved to ' + folderLabel('All', draft));
          router.back();
        }}
        style={{ height: 52, borderRadius: T.r }}
      />
    </ScrollView>
  );
}
