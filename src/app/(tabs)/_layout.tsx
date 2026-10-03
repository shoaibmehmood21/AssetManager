import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { colors } from '../../components/ui.tsx';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function icon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Assets', tabBarIcon: icon('wallet-outline') }} />
      <Tabs.Screen name="report" options={{ title: 'Report', tabBarIcon: icon('grid-outline') }} />
      <Tabs.Screen name="backup" options={{ title: 'Backup', tabBarIcon: icon('cloud-upload-outline') }} />
    </Tabs>
  );
}
