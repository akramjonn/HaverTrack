import React, { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface PulsingIconProps {
  children: React.ReactNode;
  reducedMotion: boolean;
}

const PULSE_MS = 900;

/** Gentle breathing loop for the "analyzing" icon — stops automatically on unmount. */
export function PulsingIcon({ children, reducedMotion }: PulsingIconProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [reducedMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.15 }],
    opacity: 0.7 + progress.value * 0.3,
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
