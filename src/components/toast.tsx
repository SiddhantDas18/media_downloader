import { router, useSegments } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { F, T } from '@/constants/theme';
import { hideToast, useApp } from '@/lib/store';

export function Toast() {
  const toast = useApp((s) => s.toast);
  const insets = useSafeAreaInsets();
  const inTabs = useSegments()[0] === '(tabs)';
  if (!toast) return null;
  return (
    <Animated.View
      key={toast}
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOutDown.duration(180)}
      accessibilityLiveRegion="polite"
      style={[styles.toast, { bottom: insets.bottom + (inTabs ? 72 : 16) }]}>
      <Text style={styles.text}>{toast}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          hideToast();
          router.navigate({ pathname: '/history', params: { mode: 'timeline' } });
        }}
        style={styles.btn}>
        <Text style={styles.view}>View</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', left: 14, right: 14, borderRadius: T.r, backgroundColor: T.ink, paddingVertical: 10, paddingLeft: 16, paddingRight: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
  },
  text: { flex: 1, fontSize: 13.5, lineHeight: 18, color: T.bg, fontFamily: F.regular },
  btn: { height: 36, paddingHorizontal: 12, justifyContent: 'center' },
  view: { color: T.bg, fontFamily: F.semibold, fontSize: 14, textDecorationLine: 'underline' },
});
