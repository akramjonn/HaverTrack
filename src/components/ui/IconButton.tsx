import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radii } from '@/constants/theme';

interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'light' | 'dark';
  style?: ViewStyle;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'light',
  style,
}: IconButtonProps) {
  const isDark = variant === 'dark';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        styles.container,
        isDark ? styles.darkContainer : styles.lightContainer,
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 38,
    height: 38,
    borderRadius: Radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightContainer: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  darkContainer: {
    backgroundColor: Colors.darkSurface,
    borderColor: Colors.darkBorder,
  },
});
