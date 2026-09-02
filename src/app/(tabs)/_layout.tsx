import React, { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Colors } from '@/constants/theme';
import { Calendar, Utensils, TrendingUp, User } from 'lucide-react-native';
import { useAuthStore, selectIsOnboarded } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { useMenuStore } from '@/store/menuStore';
import { AppTabBar } from '@/components/navigation/AppTabBar';

export default function TabLayout() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const isOnboarded = useAuthStore(selectIsOnboarded);
  const hydrate = useLogStore((state) => state.hydrate);
  const refreshMenu = useMenuStore((state) => state.refreshMenu);
  const userId = user?.id ?? null;

  // One load for the whole tab group; every tab reads the same store.
  useEffect(() => {
    hydrate(userId);
    if (userId) refreshMenu();
  }, [userId, hydrate, refreshMenu]);

  // Guarding the group itself means a deep link cannot land inside the app
  // without a session.
  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (profile && !isOnboarded) return <Redirect href="/(onboarding)/goal" />;

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.scarlet,
        tabBarInactiveTintColor: Colors.textFaint,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <Calendar size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'DC menu',
          tabBarIcon: ({ color, size }) => <Utensils size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color, size }) => <TrendingUp size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'You',
          tabBarIcon: ({ color, size }) => <User size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
