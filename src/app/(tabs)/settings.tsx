import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Row, SectionLabel, SettingRow, Txt } from '@/components/ui';
import { F, T } from '@/constants/theme';
import { bubbleSupported, disableBubble, enableBubble, openOverlaySettings } from '@/lib/bubble';
import { clearHistory, formatBytes, updateSettings, useApp } from '@/lib/store';

export default function Settings() {
  const st = useApp((s) => s.settings);
  const history = useApp((s) => s.history);
  const bio = Platform.OS === 'ios' ? 'Face ID' : 'fingerprint unlock';
  const total = history.reduce((a, h) => a + h.bytes, 0);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 28, gap: 10 }}>
        <Txt v="display" style={{ paddingHorizontal: 2, paddingBottom: 6 }}>Settings</Txt>

        <SectionLabel>Downloads</SectionLabel>
        <Card>
          <Row first onPress={() => router.push('/location')}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt>Save location</Txt>
              <Txt v="mono" numberOfLines={1} style={{ color: T.softInk, marginTop: 3 }}>
                {st.saveTo === 'photos' ? `${Platform.OS === 'ios' ? 'Photos' : 'Gallery'} › Media Downloader` : 'Files › MediaDL'}
              </Txt>
            </View>
            <Txt v="sub" style={{ fontSize: 13 }}>Change ›</Txt>
          </Row>
          <SettingRow title="Sort into folders by source" sub="MediaDL/Reddit, MediaDL/Instagram…" on={st.sortBySource} onPress={() => updateSettings({ sortBySource: !st.sortBySource })} />
          <Row>
            <View style={{ flex: 1 }}>
              <Txt>File names</Txt>
              <Txt v="mono" style={{ marginTop: 3 }}>{'{source}_{author}_{nn}.{ext}'}</Txt>
            </View>
          </Row>
          <Row>
            <View style={{ flex: 1 }}>
              <Txt>Quality</Txt>
              <Txt v="sub" style={{ marginTop: 2 }}>Files keep the format and resolution they were uploaded in</Txt>
            </View>
            <Txt style={{ fontFamily: F.monoMedium, fontSize: 12, color: T.softInk }}>Original</Txt>
          </Row>
        </Card>

        <SectionLabel>Link checker</SectionLabel>
        <Card>
          <SettingRow first title="Watch clipboard" sub="Offer a download when you copy a post link" on={st.watchClipboard} onPress={() => updateSettings({ watchClipboard: !st.watchClipboard })} />
          {Platform.OS === 'android' ? (
            <SettingRow
              title="Floating download bubble"
              sub="Shows over Instagram, Reddit and other apps. Copy a link, tap the bubble. Needs Gallery and 'Display over other apps'."
              on={st.bubble}
              onPress={async () => {
                if (st.bubble) return disableBubble();
                if (!bubbleSupported) return Alert.alert('Needs the full app', 'The bubble uses native Android code, so it works in a development or store build, not in Expo Go.');
                const missing = await enableBubble();
                if (missing === 'photos') Alert.alert('Gallery access needed', 'Allow access to photos and videos so the bubble can save downloads. The bubble stays off until then.');
                if (missing === 'overlay')
                  Alert.alert('Allow "Display over other apps"', 'Android needs this so the bubble can float over Instagram and Reddit. Turn it on for Media Downloader, then come back.', [
                    { text: 'Not now', style: 'cancel' },
                    { text: 'Open settings', onPress: openOverlaySettings },
                  ]);
              }}
            />
          ) : null}
          <SettingRow title="Ask before bulk downloads" sub="When a link has several items, ask for all, some or one" on={st.askBulk} onPress={() => updateSettings({ askBulk: !st.askBulk })} />
        </Card>

        <SectionLabel>Content</SectionLabel>
        <Card>
          <SettingRow first title="Allow NSFW content" sub="When off, NSFW posts are skipped and kept out of History" on={st.allowNsfw} onPress={() => updateSettings({ allowNsfw: !st.allowNsfw })} />
          {st.allowNsfw ? (
            <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutUp.duration(150)}>
              <SettingRow indent title="Blur thumbnails" sub="Tap a blurred item to reveal it" on={st.blurNsfw} onPress={() => updateSettings({ blurNsfw: !st.blurNsfw })} />
              <SettingRow indent title="Lock Private folder" sub={`Require ${bio} to open NSFW downloads`} on={st.lockPrivate} onPress={() => updateSettings({ lockPrivate: !st.lockPrivate })} />
            </Animated.View>
          ) : null}
        </Card>

        <SectionLabel>Storage</SectionLabel>
        <Card>
          <Row first>
            <Txt style={{ flex: 1 }}>Downloaded</Txt>
            <Txt v="mono" style={{ fontSize: 12.5 }}>{`${formatBytes(total)} · ${history.length} files`}</Txt>
          </Row>
          <Row
            onPress={() =>
              Alert.alert('Clear history?', 'The list is emptied. Files stay on your device.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearHistory },
              ])
            }>
            <View style={{ flex: 1 }}>
              <Txt style={{ color: T.softInk }}>Clear history</Txt>
              <Txt v="sub" style={{ marginTop: 2 }}>Files stay on your device</Txt>
            </View>
          </Row>
        </Card>

        <Txt v="mono" style={{ fontSize: 11, textAlign: 'center', paddingTop: 14 }}>{`Media Downloader ${Constants.expoConfig?.version ?? ''}`}</Txt>
      </ScrollView>
    </SafeAreaView>
  );
}
