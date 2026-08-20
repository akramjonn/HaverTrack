import React from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors, Fonts, Radii } from '@/constants/theme';
import { Icon, type IconName } from './Icon';

interface LogSourceTileProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Marks the tile as the primary path — scarlet ground, cream glyph. */
  primary?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * One entry point to the log, drawn as a glyph over a short label.
 *
 * This is the shape MyFitnessPal and MacroFactor both land on for "how do you
 * want to add food" — a row of equal tiles rather than a stack of text links.
 * It works because the five paths are genuinely parallel choices, and because
 * the glyphs are distinguishable at a glance once learned, which turns a
 * read-every-option decision into a point-at-the-one-I-always-use reflex.
 *
 * The label stays under every tile. Icon-only would save a row of height and
 * cost first-time users the ability to tell "barcode" from "scan".
 */
export function LogSourceTile({ icon, label, onPress, primary = false, style }: LogSourceTileProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }, style]}
    >
      <View style={[styles.glyphWell, primary && styles.glyphWellPrimary]}>
        <Icon
          name={icon}
          size="lg"
          color={primary ? Colors.cream : Colors.scarlet}
          emphasis={primary}
        />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
  },
  glyphWell: {
    width: '100%',
    height: 54,
    borderRadius: Radii.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphWellPrimary: {
    backgroundColor: Colors.scarlet,
    borderColor: Colors.scarlet,
  },
  label: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
