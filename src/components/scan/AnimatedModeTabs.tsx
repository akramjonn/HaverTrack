import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Image as LibraryIcon } from 'lucide-react-native';
import { Colors, Fonts, Radii } from '@/constants/theme';

export type ScanMode = 'scan' | 'describe' | 'barcode';

interface AnimatedModeTabsProps {
  mode: ScanMode;
  onChange: (mode: ScanMode) => void;
  /**
   * Opens the photo library. This is deliberately not a `ScanMode` — the app
   * only has three real analysis backends (scan / describe / barcode) — it
   * just fires the same `pickImage()` the old gallery button called.
   */
  onLibraryPress: () => void;
}

// "Describe" (not "Food label"): the mode behind this chip is a free-text
// description matched against today's DC menu, not a nutrition-label photo
// scan — there's no such backend. Labeling it "Food label" would promise a
// capability that doesn't exist, so the chip is named for what it does.
const MODE_CHIPS: { value: ScanMode; label: string }[] = [
  { value: 'scan', label: 'Scan Food' },
  { value: 'barcode', label: 'Barcode' },
  { value: 'describe', label: 'Describe' },
];

const INACTIVE_BG = 'rgba(20, 20, 20, 0.55)';
const INACTIVE_BORDER = 'rgba(255, 255, 255, 0.18)';

function ModeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: 180 });
  }, [active]);

  const chipStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [INACTIVE_BG, Colors.cream]),
    borderColor: interpolateColor(progress.value, [0, 1], [INACTIVE_BORDER, Colors.cream]),
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={4}
    >
      <Animated.View style={[styles.chip, chipStyle]}>
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** The bottom mode-chip row: Scan Food / Barcode / Describe, plus a Library action chip. */
export function AnimatedModeTabs({ mode, onChange, onLibraryPress }: AnimatedModeTabsProps) {
  const handlePress = (value: ScanMode) => {
    if (value === mode) return;
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    onChange(value);
  };

  const handleLibraryPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    onLibraryPress();
  };

  return (
    <View style={styles.modeRow}>
      {MODE_CHIPS.map((tab) => (
        <ModeChip
          key={tab.value}
          label={tab.label}
          active={mode === tab.value}
          onPress={() => handlePress(tab.value)}
        />
      ))}
      <Pressable
        onPress={handleLibraryPress}
        accessibilityRole="button"
        accessibilityLabel="Choose from photo library"
        hitSlop={4}
      >
        <View style={[styles.chip, styles.libraryChip]}>
          <LibraryIcon size={14} color={Colors.darkText} style={{ marginRight: 5 }} />
          <Text style={styles.chipText}>Library</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: INACTIVE_BORDER,
    backgroundColor: INACTIVE_BG,
  },
  libraryChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  chipText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.darkText,
  },
  chipTextActive: {
    fontFamily: Fonts.outfit.semiBold,
    color: Colors.ink,
  },
});
