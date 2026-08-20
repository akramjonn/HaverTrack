import React from 'react';
import { Pressable, Text, View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radii, Fonts } from '@/constants/theme';
import { Icon, type IconName } from './Icon';

interface OptionCardProps {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  /**
   * Optional leading glyph. Worth supplying when a screen stacks three or four
   * of these — a column of same-shaped cards is slow to re-scan on the way back
   * through onboarding, and a distinct mark per card fixes that. Not worth it
   * for a two-option choice, where the titles already differ enough.
   */
  icon?: IconName;
  style?: ViewStyle;
  badge?: string;
}

export function OptionCard({
  title,
  subtitle,
  selected,
  onPress,
  icon,
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
        icon ? styles.cardWithIcon : null,
        selected ? styles.selectedCard : styles.unselectedCard,
        pressed && { opacity: 0.88 },
        style,
      ]}
    >
      {icon ? (
        <View style={[styles.glyphWell, selected && styles.glyphWellSelected]}>
          <Icon name={icon} size="md" color={selected ? Colors.cream : Colors.scarlet} />
        </View>
      ) : null}
      <View style={styles.textCol}>
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
      </View>
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
  cardWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  textCol: {
    flex: 1,
  },
  glyphWell: {
    width: 40,
    height: 40,
    borderRadius: Radii.sm,
    backgroundColor: Colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphWellSelected: {
    // On the scarlet card the well has to lift off its own ground rather than
    // sit on cream, so it becomes a translucent white rather than a warm tint.
    backgroundColor: 'rgba(251, 248, 243, 0.16)',
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
