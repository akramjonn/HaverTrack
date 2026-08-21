import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Plus } from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';

// The visible cream bar's own content height (excludes the safe-area inset,
// which is added separately so the bar always clears the home indicator).
const BAR_H = 64;
// How far the FAB is allowed to sit proud of the bar's top edge. Also the
// tappable-but-empty strip above the bar reserved for that protrusion.
const OVERHANG = 24;
const FAB_SIZE = 60;

/**
 * Custom tab bar rendering 4 route tabs plus a center "+" FAB that pushes
 * straight to /scan. Kept inside a single fixed-height outer container (see
 * OVERHANG) so the FAB can visually overhang the bar without relying on
 * `overflow: visible`, which Android ignores for clipping purposes. Because
 * the navigator measures this component's real rendered height,
 * useBottomTabBarHeight() and any screen's bottom safe-area padding stay
 * correct automatically.
 */
export function AppTabBar(props: BottomTabBarProps): React.JSX.Element {
  const { state, descriptors, navigation, insets } = props;

  return (
    <View
      pointerEvents="box-none"
      style={{ height: OVERHANG + BAR_H + insets.bottom }}
    >
      <View
        pointerEvents="none"
        style={[styles.bar, { height: BAR_H + insets.bottom }]}
      />
      <View style={{ flexDirection: 'row', height: OVERHANG + BAR_H + insets.bottom }}>
        {state.routes.slice(0, 2).map((route, index) => (
          <TabItem
            key={route.key}
            route={route}
            isFocused={state.index === index}
            descriptors={descriptors}
            navigation={navigation}
            insets={insets}
          />
        ))}
        <View style={styles.fabSlot}>
          <ScanFab />
        </View>
        {state.routes.slice(2, 4).map((route, i) => {
          const index = i + 2;
          return (
            <TabItem
              key={route.key}
              route={route}
              isFocused={state.index === index}
              descriptors={descriptors}
              navigation={navigation}
              insets={insets}
            />
          );
        })}
      </View>
    </View>
  );
}

interface TabItemProps {
  route: BottomTabBarProps['state']['routes'][number];
  isFocused: boolean;
  descriptors: BottomTabBarProps['descriptors'];
  navigation: BottomTabBarProps['navigation'];
  insets: BottomTabBarProps['insets'];
}

function TabItem({ route, isFocused, descriptors, navigation, insets }: TabItemProps) {
  const { options } = descriptors[route.key];
  const color = isFocused ? Colors.scarlet : Colors.textFaint;

  const onPress = () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  const onLongPress = () => {
    navigation.emit({
      type: 'tabLongPress',
      target: route.key,
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={typeof options.title === 'string' ? options.title : route.name}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.tabItem, { paddingBottom: insets.bottom }]}
    >
      {options.tabBarIcon?.({ focused: isFocused, color, size: 22 })}
      <Text style={[styles.tabLabel, { color }]}>{options.title}</Text>
    </Pressable>
  );
}

const PRESS_SCALE = 0.85;

function ScanFab() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!reducedMotion) {
      scale.value = withSpring(PRESS_SCALE, { damping: 14, stiffness: 300 });
    }
  };

  const handlePressOut = () => {
    if (!reducedMotion) {
      scale.value = withSpring(1, { damping: 12, stiffness: 260 });
    }
  };

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    router.push('/scan' as any);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Scan a meal"
      accessibilityHint="Opens the camera"
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={8}
    >
      <Animated.View style={[styles.fab, animatedStyle]}>
        <Plus size={28} color={Colors.cream} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(251, 248, 243, 0.96)',
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: OVERHANG + 8,
    minHeight: 44,
  },
  tabLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 10,
    marginTop: 2,
  },
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
