import React, { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts } from '@/constants/theme';

export type ScanMode = 'scan' | 'describe' | 'barcode';

interface AnimatedModeTabsProps {
  mode: ScanMode;
  onChange: (mode: ScanMode) => void;
}

const TABS: { value: ScanMode; label: string }[] = [
  { value: 'scan', label: 'Scan food' },
  { value: 'describe', label: 'Describe it' },
  { value: 'barcode', label: 'Barcode' },
];

type Layout = { x: number; width: number };

/** The scan/describe/barcode row, with one underline that slides to the active tab. */
export function AnimatedModeTabs({ mode, onChange }: AnimatedModeTabsProps) {
  const layouts = useRef<Partial<Record<ScanMode, Layout>>>({});
  const [ready, setReady] = useState(false);

  const underlineX = useSharedValue(0);
  const underlineWidth = useSharedValue(0);

  const applyLayout = (value: ScanMode) => {
    const layout = layouts.current[value];
    if (!layout) return;
    underlineX.value = withTiming(layout.x, { duration: 220 });
    underlineWidth.value = withTiming(layout.width, { duration: 220 });
  };

  const handleTabLayout = (value: ScanMode) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    layouts.current[value] = { x, width };

    // The active tab's own layout is what seeds the underline's starting
    // position — nothing to slide *from* until that first measurement lands.
    if (value === mode && !ready) {
      underlineX.value = x;
      underlineWidth.value = width;
      setReady(true);
    }
  };

  useEffect(() => {
    if (!ready) return;
    applyLayout(mode);
  }, [mode, ready]);

  const underlineStyle = useAnimatedStyle(() => ({
    left: underlineX.value,
    width: underlineWidth.value,
  }));

  const handlePress = (value: ScanMode) => {
    if (value === mode) return;
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    onChange(value);
  };

  return (
    <View style={styles.modeRow}>
      {TABS.map((tab) => (
        <Pressable
          key={tab.value}
          onPress={() => handlePress(tab.value)}
          onLayout={handleTabLayout(tab.value)}
          style={styles.modeItem}
        >
          <Text style={[styles.modeText, mode === tab.value && styles.activeModeText]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
      {ready ? <Animated.View style={[styles.underline, underlineStyle]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
    position: 'relative',
  },
  modeItem: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  modeText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    color: Colors.darkTextDim,
  },
  activeModeText: {
    color: Colors.darkText,
    fontFamily: Fonts.outfit.semiBold,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    backgroundColor: Colors.scarlet,
  },
});
