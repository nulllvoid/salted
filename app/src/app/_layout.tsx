import { Caprasimo_400Regular } from '@expo-google-fonts/caprasimo';
import {
  Figtree_400Regular,
  Figtree_700Bold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { Screen, Empty } from '@/components/ui';
import type { ErrorBoundaryProps } from 'expo-router';
import { ActiveGroupProvider } from '@/contexts/active-group';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Caprasimo_400Regular,
    Figtree_400Regular,
    Figtree_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          background: palette.background,
          card: palette.background,
          text: palette.text,
          primary: palette.accentText,
          border: palette.divider,
        },
      }}
    >
      <ActiveGroupProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="grocery-list"
            options={{
              headerShown: true,
              title: 'Grocery list',
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="cook-message-preview"
            options={{
              headerShown: true,
              title: 'Cook message',
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="who-is-eating"
            options={{
              headerShown: true,
              title: "Who's eating",
              presentation: 'modal',
            }}
          />
        </Stack>
      </ActiveGroupProvider>
    </ThemeProvider>
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen>
      <Empty
        title="Let’s try that again"
        detail="Something interrupted this screen. Your saved meals are still there."
        action="Reload screen"
        onAction={() => {
          void retry();
        }}
      />
    </Screen>
  );
}
