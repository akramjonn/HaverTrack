import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '@/constants/theme';

interface ProgressBarProps {
  progress: number; // 0 to 1
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: ViewStyle;
}

export function ProgressBar({
  progress,
  height = 6,
  trackColor = Colors.track,
  fillColor = Colors.scarlet,
  style,
}: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const radius = height / 2;

  return (
    <View
      style={[
        styles.track,
        {
          height,
          borderRadius: radius,
          backgroundColor: trackColor,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${clampedProgress * 100}%`,
            height,
            borderRadius: radius,
            backgroundColor: fillColor,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
