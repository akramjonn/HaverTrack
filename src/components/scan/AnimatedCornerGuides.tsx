import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

interface AnimatedCornerGuidesProps {
  /** Toggling true triggers one green flash across all four corners, e.g. on a successful barcode read. */
  pulse: boolean;
}

const DEFAULT_COLOR = 'rgba(251, 248, 243, 0.6)';
const PULSE_COLOR = Colors.green;

/** The four L-shaped frame-guide corners, with a one-shot success pulse. */
export function AnimatedCornerGuides({ pulse }: AnimatedCornerGuidesProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!pulse) return;
    progress.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(0, { duration: 320 })
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [DEFAULT_COLOR, PULSE_COLOR]),
  }));

  return (
    <>
      <Animated.View style={[styles.corner, styles.tl, animatedStyle]} />
      <Animated.View style={[styles.corner, styles.tr, animatedStyle]} />
      <Animated.View style={[styles.corner, styles.bl, animatedStyle]} />
      <Animated.View style={[styles.corner, styles.br, animatedStyle]} />
    </>
  );
}

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
});
