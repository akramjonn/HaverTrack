import React, { useEffect } from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Colors, Fonts } from '@/constants/theme';
import { TabBarIcon } from '@/components/ui';
import { Platform } from 'react-native';
import { useAuthStore, selectIsOnboarded } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';

export default function TabLayout() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const isOnboarded = useAuthStore(selectIsOnboarded);
  const hydrate = useLogStore((state) => state.hydrate);

  // One load for the whole tab group; every tab reads the same store.
  useEffect(() => {
    hydrate(user?.id ?? null);
  }, [user?.id]);

  // Guarding the group itself means a deep link cannot land inside the app
  // without a session.
  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (profile && !isOnboarded) return <Redirect href="/(onboarding)/goal" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.scarlet,
        tabBarInactiveTintColor: Colors.textFaint,
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 92 : 70,
          backgroundColor: 'rgba(251, 248, 243, 0.96)',
          borderTopWidth: 1,
          borderTopColor: Colors.borderSoft,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 26 : 10,
        },
        tabBarLabelStyle: {
          fontFamily: Fonts.outfit.medium,
          fontSize: 10,
          marginTop: 2,
        },
      }}
    >
      {/*
        Today gets the plate and the menu tab gets the chef's hat, swapping the
        calendar that used to sit on Today. A calendar says "dates", which is
        what the Progress tab is about; the thing Today actually shows is the
        meals on your plate right now. The pair also stops Today and DC menu
        from both being fork-and-knife variants.
      */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ focused }) => <TabBarIcon name="today" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'DC menu',
          tabBarIcon: ({ focused }) => <TabBarIcon name="menu" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ focused }) => <TabBarIcon name="progress" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'You',
          tabBarIcon: ({ focused }) => <TabBarIcon name="profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
