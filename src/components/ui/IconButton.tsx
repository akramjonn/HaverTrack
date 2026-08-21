import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radii } from '@/constants/theme';

interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'light' | 'dark';
  /** 'square' (default, existing look) or 'circle' for floating controls over photos. */
  shape?: 'square' | 'circle';
  style?: ViewStyle;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'light',
  shape = 'square',
  style,
}: IconButtonProps) {
  const isDark = variant === 'dark';
  const isCircle = shape === 'circle';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        styles.container,
        isDark ? styles.darkContainer : styles.lightContainer,
        isCircle && styles.circleContainer,
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
  circleContainer: {
    borderRadius: 19,
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
