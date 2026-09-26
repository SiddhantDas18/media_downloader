import { Directory } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { Btn, Radio, Txt } from '@/components/ui';
import { T } from '@/constants/theme';
import { showToast, updateSettings, useApp, type SaveTo } from '@/lib/store';

const gallery = Platform.OS === 'ios' ? 'Photos' : 'Gallery';
const OPTIONS: [SaveTo, string, string][] = [
  ['photos', `${gallery} › Media Downloader`, `Shows up in your ${gallery} app in a Media Downloader album. A copy also stays in the app.`],
  ['files', 'App folder only', Platform.OS === 'ios' ? 'Files › On My iPhone › Media Downloader › MediaDL' : 'Kept inside the app. Share or export from the viewer.'],
];

export default function Location() {
  const { saveTo, folderName } = useApp((s) => s.settings);
  const [draft, setDraft] = useState(saveTo);
  // Android only: the system folder picker grants lasting access, so downloads can be copied into any folder.
  const pickFolder = async () => {
    try {
      const dir = await Directory.pickDirectoryAsync();
      updateSettings({ folderUri: dir.uri, folderName: decodeURIComponent(dir.name) });
      setDraft('folder');
    } catch {}
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 24, paddingBottom: 34, gap: 12 }}>
      <View>
        <Txt v="display" style={{ fontSize: 24, lineHeight: 28 }}>Save location</Txt>
        <Txt v="sub" style={{ fontSize: 13, marginTop: 4 }}>Where new downloads go. Source folders (Reddit, Instagram…) are created inside it.</Txt>
      </View>
      <View style={{ gap: 8 }}>
        {OPTIONS.map(([key, title, sub]) => (
          <Radio key={key} on={draft === key} title={title} sub={sub} onPress={() => setDraft(key)} />
        ))}
        {Platform.OS === 'android' ? (
          <Radio on={draft === 'folder'} title={folderName ? `Device › ${folderName}` : 'Choose a folder on this device…'} sub={folderName ? 'Tap to pick a different folder' : 'Downloads, DCIM, or any folder you pick'} onPress={pickFolder} />
        ) : null}
      </View>
      <Txt v="sub" style={{ fontSize: 12 }}>
        Files you already downloaded stay where they are. The Private (NSFW) folder always stays hidden from the {gallery.toLowerCase()}.
      </Txt>
      <Btn
        label="Use this location"
        onPress={() => {
          updateSettings({ saveTo: draft });
          showToast('New downloads will be saved to ' + (draft === 'folder' ? `Device › ${folderName}` : OPTIONS.find((o) => o[0] === draft)![1]));
          router.back();
        }}
        style={{ height: 52, borderRadius: T.r }}
      />
    </ScrollView>
  );
}
