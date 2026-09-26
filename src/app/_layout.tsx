import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, useFonts } from '@expo-google-fonts/space-grotesk';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Toast } from '@/components/toast';
import { T } from '@/constants/theme';
import { useApp } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: T.bg, card: T.surface, text: T.ink, border: T.line, primary: T.accent } };
const sheet = { presentation: 'formSheet', sheetAllowedDetents: 'fitToContents', sheetGrabberVisible: true, contentStyle: { backgroundColor: T.surface } } as const;

export default function RootLayout() {
  const [loaded] = useFonts({ SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, IBMPlexMono_400Regular, IBMPlexMono_500Medium });
  const { onboarded } = useApp().settings;

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }}>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="preview" />
          <Stack.Screen name="folder/[key]" />
          <Stack.Screen name="viewer/[id]" options={{ contentStyle: { backgroundColor: '#000' } }} />
          <Stack.Screen name="picker" options={sheet} />
          <Stack.Screen name="location" options={sheet} />
        </Stack.Protected>
      </Stack>
      <Toast />
    </ThemeProvider>
  );
}
