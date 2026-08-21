import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

interface AvatarProps {
  name?: string | null;
  size?: number;
  style?: ViewStyle;
}

/** Background palette an avatar's color is deterministically hashed from —
 * nothing persisted, just a stable function of the name/email string. */
const PALETTE = [Colors.scarlet, Colors.gold, Colors.green, Colors.ink] as const;

/** `Colors.gold` is light enough that cream-on-gold doesn't read clearly;
 * every other palette entry is dark enough for cream text to contrast well. */
const TEXT_COLOR_BY_BG: Record<string, string> = {
  [Colors.gold]: Colors.ink,
};

function paletteColorFor(input: string): string {
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) {
    sum += input.charCodeAt(i);
  }
  return PALETTE[sum % PALETTE.length];
}

export function Avatar({ name, size = 64, style }: AvatarProps) {
  const trimmed = (name ?? '').trim();
  const initial = trimmed ? trimmed[0].toUpperCase() : '?';
  const backgroundColor = paletteColorFor(trimmed || '?');
  const textColor = TEXT_COLOR_BY_BG[backgroundColor] ?? Colors.cream;

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
        style,
      ]}
    >
      <Text style={[styles.initial, { color: textColor, fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: Fonts.outfit.bold,
  },
});
