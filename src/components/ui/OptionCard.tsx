import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radii, Fonts } from '@/constants/theme';

interface OptionCardProps {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  style?: ViewStyle;
  badge?: string;
}

export function OptionCard({
  title,
  subtitle,
  selected,
  onPress,
  style,
  badge,
}: OptionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.card,
        selected ? styles.selectedCard : styles.unselectedCard,
        pressed && { opacity: 0.88 },
        style,
      ]}
    >
      <Text
        style={[
          styles.title,
          selected ? styles.selectedTitle : styles.unselectedTitle,
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[
            styles.subtitle,
            selected ? styles.selectedSubtitle : styles.unselectedSubtitle,
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.card,
    padding: 20,
    marginBottom: 12,
    width: '100%',
  },
  unselectedCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectedCard: {
    backgroundColor: Colors.scarlet,
    borderWidth: 0,
  },
  title: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 18,
    lineHeight: 23,
    marginBottom: 4,
  },
  unselectedTitle: {
    color: Colors.ink,
  },
  selectedTitle: {
    color: Colors.cream,
  },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  unselectedSubtitle: {
    color: Colors.textMuted,
  },
  selectedSubtitle: {
    color: 'rgba(251, 248, 243, 0.78)',
  },
});
