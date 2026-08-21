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
    width: 40,
    height: 40,
  },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 20 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 20 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 20 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 20 },
});
