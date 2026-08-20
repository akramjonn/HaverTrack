import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radii, Fonts } from '@/constants/theme';
import { Icon } from './Icon';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unitLabel?: string;
  style?: ViewStyle;
}

export function Stepper({
  value,
  onChange,
  step = 0.25,
  min = 0.25,
  max = 10,
  unitLabel,
  style,
}: StepperProps) {
  const handleDecrement = () => {
    const next = Math.max(min, Math.round((value - step) * 100) / 100);
    onChange(next);
  };

  const handleIncrement = () => {
    const next = Math.min(max, Math.round((value + step) * 100) / 100);
    onChange(next);
  };

  const formattedValue = value % 1 === 0 ? value.toFixed(0) : value.toString();

  return (
    <View style={[styles.container, style]}>
      <Pressable
        onPress={handleDecrement}
        disabled={value <= min}
        accessibilityRole="button"
        accessibilityLabel="Decrease portion"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={({ pressed }) => [
          styles.btn,
          value <= min && styles.btnDisabled,
          pressed && value > min && { opacity: 0.7 },
        ]}
      >
        <Icon name="remove" size="md" color={value <= min ? Colors.textGhost : Colors.ink} />
      </Pressable>

      <View style={styles.valueContainer}>
        <Text style={styles.valueText}>{formattedValue}</Text>
        {unitLabel ? <Text style={styles.unitText}>{unitLabel}</Text> : null}
      </View>

      <Pressable
        onPress={handleIncrement}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel="Increase portion"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={({ pressed }) => [
          styles.btn,
          value >= max && styles.btnDisabled,
          pressed && value < max && { opacity: 0.7 },
        ]}
      >
        <Icon name="add" size="md" color={value >= max ? Colors.textGhost : Colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceWarm,
    borderRadius: Radii.pill,
    padding: 4,
    alignSelf: 'center',
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.35,
  },
  valueContainer: {
    minWidth: 54,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 18,
    color: Colors.ink,
  },
  unitText: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.textMuted,
  },
});
