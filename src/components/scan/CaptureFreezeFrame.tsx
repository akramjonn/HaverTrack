import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Image } from 'expo-image';

interface CaptureFreezeFrameProps {
  /** The just-captured photo. Null hides the whole overlay. */
  uri: string | null;
  /** True once analysis has started — settles the frame back slightly. */
  analyzing: boolean;
}

const FLASH_MS = 180;

/**
 * What makes a tap feel like a real shutter: the frame the camera saw sticks in
 * place instead of the preview just cutting to a spinner. A white flash fades
 * out over the frame appearing, then the frame settles back a touch once
 * analysis starts — so the "thinking" state visibly happens on the photo, not
 * on a black box.
 *
 * Deliberately not gated behind reduced motion: this is capture feedback (it
 * tells the user the shot was taken), not decoration.
 */
export function CaptureFreezeFrame({ uri, analyzing }: CaptureFreezeFrameProps) {
  const flashOpacity = useSharedValue(0);
  const frameScale = useSharedValue(1);

  useEffect(() => {
    if (!uri) {
      // Reset for the next capture rather than animating back — the overlay
      // is unmounted from the caller's perspective at this point.
      flashOpacity.value = 0.85;
      frameScale.value = 1;
      return;
    }

    flashOpacity.value = 0.85;
    flashOpacity.value = withTiming(0, { duration: FLASH_MS, easing: Easing.out(Easing.quad) });
  }, [uri]);

  useEffect(() => {
    frameScale.value = withSpring(analyzing ? 0.96 : 1, { damping: 16, stiffness: 180 });
  }, [analyzing]);

  const frameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: frameScale.value }],
  }));

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  if (!uri) return null;

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, frameStyle]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />
    </>
  );
}

const styles = StyleSheet.create({
  flash: {
    backgroundColor: '#FFFFFF',
  },
});
