import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { Colors, Radii, Fonts } from '@/constants/theme';

export type ChipVariant = 'default' | 'scarlet' | 'active' | 'gold' | 'amber' | 'green' | 'muted';

interface ChipProps {
  label: string;
  variant?: ChipVariant;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Chip({
  label,
  variant = 'default',
  selected = false,
  onPress,
  icon,
  style,
}: ChipProps) {
  const getStyles = () => {
    if (selected) {
      return {
        bg: Colors.scarlet,
        border: Colors.scarlet,
        text: Colors.cream,
      };
    }

    switch (variant) {
      case 'scarlet':
      case 'active':
        return {
          bg: Colors.scarlet,
          border: Colors.scarlet,
          text: Colors.cream,
        };
      case 'gold':
        return {
          bg: 'rgba(232, 184, 75, 0.15)',
          border: Colors.gold,
          text: '#926100',
        };
      case 'amber':
        return {
          bg: Colors.amberBg,
          border: Colors.amberBorder,
          text: Colors.amber,
        };
      case 'green':
        return {
          bg: Colors.greenBg,
          border: '#BBF7D0',
          text: Colors.green,
        };
      case 'muted':
        return {
          bg: Colors.surfaceWarm,
          border: Colors.borderSoft,
          text: Colors.textMuted,
        };
      case 'default':
      default:
        return {
          bg: Colors.surface,
          border: Colors.border,
          text: Colors.ink,
        };
    }
  };

  const current = getStyles();

  const content = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: current.bg,
          borderColor: current.border,
        },
        style,
      ]}
    >
      {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
      <Text style={[styles.text, { color: current.text }]}>{label}</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        style={({ pressed }) => [pressed && { opacity: 0.8 }]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radii.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  iconContainer: {
    marginRight: 6,
  },
  text: {
    fontSize: 13,
    fontFamily: Fonts.outfit.medium,
  },
});
