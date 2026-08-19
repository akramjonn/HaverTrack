import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

interface BarcodeScanLineProps {
  /** Skips the sweep and renders a static centered line instead. */
  reducedMotion: boolean;
}

const TOP_PCT = 12;
const BOTTOM_PCT = 88;
const SWEEP_MS = 1400;

/** The line that sweeps the barcode frame guide top-to-bottom while waiting for a read. */
export function BarcodeScanLine({ reducedMotion }: BarcodeScanLineProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 0.5;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [reducedMotion]);

  const style = useAnimatedStyle(() => ({
    top: `${TOP_PCT + progress.value * (BOTTOM_PCT - TOP_PCT)}%`,
  }));

  return <Animated.View style={[styles.line, style]} />;
}

const styles = StyleSheet.create({
  line: {
    position: 'absolute',
    left: 24,
    right: 24,
    height: 2,
    backgroundColor: Colors.scarletBright,
    opacity: 0.85,
  },
});
