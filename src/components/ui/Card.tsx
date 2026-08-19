import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Pressable } from 'react-native';
import { Colors, Radii } from '@/constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function Card({ children, style, onPress, accessibilityLabel }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.card,
          style,
          pressed && { opacity: 0.9 },
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[styles.card, style]}>{children}</View>;
}

export function HeroCard({ children, style, onPress, accessibilityLabel }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.heroCard,
          style,
          pressed && { opacity: 0.9 },
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[styles.heroCard, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.cardLg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 22,
  },
});
