import { Tabs } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { F, T } from '@/constants/theme';
import { useApp } from '@/lib/store';

const TABS: Record<string, [string, string]> = {
  index: ['Home', '⌂'],
  queue: ['Queue', '↓'],
  history: ['History', '◷'],
  settings: ['Settings', '⚙︎'],
};

export default function TabsLayout() {
  const active = useApp().jobs.filter((j) => j.status === 'waiting' || j.status === 'running').length;
  const insets = useSafeAreaInsets();
  const android = Platform.OS === 'android';

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: T.bg } }}
      tabBar={({ state, navigation }) => (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {state.routes.map((route, i) => {
            const on = state.index === i;
            const [label, glyph] = TABS[route.name];
            const badge = route.name === 'queue' && active ? String(active) : '';
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={badge ? `${label}, ${badge} downloading` : label}
                onPress={() => !on && navigation.navigate(route.name)}
                style={styles.tab}>
                <View style={[styles.pill, { width: android ? 60 : 40, backgroundColor: on && android ? T.soft : 'transparent' }]}>
                  <Text style={[styles.glyph, { color: on ? (android ? T.ink : T.accent) : T.sub }]}>{glyph}</Text>
                  {badge ? (
                    <View style={[styles.badge, { right: android ? 4 : -6 }]}>
                      <Text style={styles.badgeText}>{badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ fontSize: 11, fontFamily: on ? F.semibold : F.medium, color: on ? (android ? T.ink : T.accent) : T.sub }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="queue" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.line, backgroundColor: T.surface },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  pill: { height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 17, lineHeight: 22 },
  badge: { position: 'absolute', top: -2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: F.semibold, fontSize: 10, color: T.accentInk },
});
