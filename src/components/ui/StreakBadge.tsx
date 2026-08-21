import React from 'react';
import { View, Text, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { Colors, Radii, Fonts } from '@/constants/theme';
import Svg, { Circle } from 'react-native-svg';

interface StreakBadgeProps {
  days: number;
  style?: ViewStyle;
  /** Optional — when given, the badge becomes tappable (e.g. to show streak detail). */
  onPress?: () => void;
}

export function StreakBadge({ days, style, onPress }: StreakBadgeProps) {
  const content = (
    <>
      {/* Gold nut accent circle */}
      <View style={styles.nutContainer}>
        <Svg width={10} height={10} viewBox="0 0 10 10">
          <Circle cx={5} cy={5} r={4.5} fill={Colors.gold} />
        </Svg>
      </View>
      <Text style={styles.text}>{days} day streak</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${days} day streak. View streak detail.`}
        hitSlop={6}
        style={({ pressed }) => [styles.container, style, pressed && { opacity: 0.8 }]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.container, style]}>{content}</View>;
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
  nutContainer: {
    marginRight: 6,
  },
  text: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 13,
    color: '#8A5D00',
  },
});
