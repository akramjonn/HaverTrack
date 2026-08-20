import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radii, Fonts } from '@/constants/theme';
import { Icon } from './Icon';

interface StreakBadgeProps {
  days: number;
  style?: ViewStyle;
}

export function StreakBadge({ days, style }: StreakBadgeProps) {
  return (
    <View style={[styles.container, style]}>
      {/*
        A flame rather than the gold nut that used to sit here. The nut is the
        brand mark's accent and reads as decoration; every tracker a student has
        already used — MyFitnessPal, Alma, Me+ — puts a flame on a streak, so
        the flame is the mark that needs no learning. Filled, because an
        outlined flame at 14px on a gold-tinted pill reads as a smudge.
      */}
      <Icon name="streak" size="xs" color={Colors.gold} filled style={styles.flame} />
      <Text style={styles.text}>{days} day streak</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDF7E7',
    borderWidth: 1,
    borderColor: 'rgba(232, 184, 75, 0.4)',
    borderRadius: Radii.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  flame: {
    marginRight: 6,
  },
  text: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 13,
    color: '#8A5D00',
  },
});
