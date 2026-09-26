import { Tabs } from 'expo-router';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Easing, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/ui';
import { F, T } from '@/constants/theme';
import { useApp } from '@/lib/store';

// [label, SF Symbol (iOS; filled variant when active), Material Symbol (Android)]
const TABS: Record<string, [string, SFSymbol, AndroidSymbol]> = {
  index: ['Home', 'house', 'home'],
  queue: ['Queue', 'arrow.down.circle', 'download'],
  history: ['History', 'clock', 'history'],
  settings: ['Settings', 'gearshape', 'settings'],
};

export default function TabsLayout() {
  const active = useApp((s) => s.jobs.filter((j) => j.status === 'waiting' || j.status === 'running').length);
  const insets = useSafeAreaInsets();
  const android = Platform.OS === 'android';
  const { width } = useWindowDimensions();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: T.bg },
        // Slide toward the tab you picked: tabs to the right come in from the right, and vice versa.
        transitionSpec: { animation: 'timing', config: { duration: 260, easing: Easing.out(Easing.cubic) } },
        sceneStyleInterpolator: ({ current }) => ({
          sceneStyle: {
            opacity: current.progress.interpolate({ inputRange: [-1, -0.5, 0, 0.5, 1], outputRange: [0, 0.4, 1, 0.4, 0] }),
            transform: [{ translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-width * 0.3, 0, width * 0.3] }) }],
          },
        }),
      }}
      tabBar={({ state, navigation }) => (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {state.routes.map((route, i) => {
            const on = state.index === i;
            const [label, sf, material] = TABS[route.name];
            const badge = route.name === 'queue' && active ? String(active) : '';
            return (
              <Press
                key={route.key}
                scaleTo={0.9}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={badge ? `${label}, ${badge} downloading` : label}
                onPress={() => !on && navigation.navigate(route.name)}
                style={styles.tab}>
                <Animated.View style={[styles.pill, { width: android ? 64 : 48, backgroundColor: on && android ? T.soft : 'transparent', transitionProperty: 'backgroundColor', transitionDuration: 200 }]}>
                  <SymbolView
                    name={{ ios: (on ? `${sf}.fill` : sf) as SFSymbol, android: material }}
                    size={26}
                    tintColor={on ? (android ? T.ink : T.accent) : T.sub}
                  />
                  {badge ? (
                    <Animated.View entering={ZoomIn.springify()} exiting={ZoomOut.duration(150)} style={[styles.badge, { right: android ? 4 : -6 }]}>
                      <Text style={styles.badgeText}>{badge}</Text>
                    </Animated.View>
                  ) : null}
                </Animated.View>
                <Text style={{ fontSize: 12, fontFamily: on ? F.semibold : F.medium, color: on ? (android ? T.ink : T.accent) : T.sub }}>{label}</Text>
              </Press>
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
  pill: { height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: F.semibold, fontSize: 10, color: T.accentInk },
});
