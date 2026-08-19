import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radii, Fonts } from '@/constants/theme';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'default' | 'scarlet';
  style?: ViewStyle;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = 'default',
  style,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.container, style]}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            style={[
              styles.segment,
              isSelected &&
                (variant === 'scarlet'
                  ? styles.activeSegmentScarlet
                  : styles.activeSegmentDefault),
            ]}
          >
            <Text
              style={[
                styles.label,
                isSelected
                  ? variant === 'scarlet'
                    ? styles.activeLabelScarlet
                    : styles.activeLabelDefault
                  : styles.inactiveLabel,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.track,
    borderRadius: Radii.pill,
    padding: 3,
    alignItems: 'center',
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSegmentDefault: {
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  activeSegmentScarlet: {
    backgroundColor: Colors.scarlet,
  },
  label: {
    fontSize: 14,
    fontFamily: Fonts.outfit.medium,
  },
  activeLabelDefault: {
    color: Colors.ink,
    fontFamily: Fonts.outfit.semiBold,
  },
  activeLabelScarlet: {
    color: Colors.cream,
    fontFamily: Fonts.outfit.semiBold,
  },
  inactiveLabel: {
    color: Colors.textMuted,
  },
});
