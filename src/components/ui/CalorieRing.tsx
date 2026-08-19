import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '@/constants/theme';

interface CalorieRingProps {
  current: number;
  target: number;
  size?: number;
  strokeWidth?: number;
  style?: ViewStyle;
  children?: React.ReactNode;
}

export function CalorieRing({
  current,
  target,
  size = 128,
  strokeWidth = 20,
  style,
  children,
}: CalorieRingProps) {
  const radius = 80;
  const circumference = 2 * Math.PI * radius; // ~502.65

  // Clamp pct to [0, 1] as mandated by §3.5 and §11
  const pct = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
  const strokeDashoffset = circumference - circumference * pct;

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 200 200">
        {/* Track */}
        <Circle
          cx="100"
          cy="100"
          r={radius}
          stroke={Colors.track}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress fill — ALWAYS --scarlet, never red even over target (§11) */}
        {pct > 0 ? (
          <Circle
            cx="100"
            cy="100"
            r={radius}
            stroke={Colors.scarlet}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference * pct} ${circumference}`}
            transform="rotate(-90 100 100)"
          />
        ) : null}
      </Svg>
      {children ? <View style={styles.childContainer}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  childContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
