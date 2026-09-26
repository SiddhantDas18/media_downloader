import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { IG_LOGIN_URL, igAuthScript, isInstagramPage } from '@/components/ig-session';
import { BackButton, Txt } from '@/components/ui';
import { showToast, updateSettings } from '@/lib/store';

/** Instagram's own login page. The app never sees the password; it only learns that the session exists. */
export default function InstagramLogin() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 }}>
        <BackButton />
        <Txt v="title">Sign in to Instagram</Txt>
      </View>
      <WebView
        source={{ uri: IG_LOGIN_URL }}
        style={{ flex: 1 }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        injectedJavaScript={igAuthScript}
        onMessage={(e) => {
          if (!isInstagramPage(e.nativeEvent.url)) return;
          const msg = JSON.parse(e.nativeEvent.data);
          if (msg.type === 'auth' && msg.signedIn && !msg.path.startsWith('/accounts/login')) {
            updateSettings({ igSignedIn: true });
            showToast('Signed in to Instagram');
            router.back();
          }
        }}
      />
    </SafeAreaView>
  );
}
