import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { Icon } from './icon';
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.divider,
          height: 72,
          paddingTop: Spacing.label,
          paddingBottom: Spacing.label,
        },
        tabBarLabelStyle: { fontFamily: Fonts.bodyBold, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => (
            <Icon name="home" color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <Icon name="settings" color={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}
