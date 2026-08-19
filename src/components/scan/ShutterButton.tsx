import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { Colors } from '@/constants/theme';

interface ShutterButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

const PRESS_SCALE = 0.85;

/** The shutter circle: springs in on press, back out on release, with a haptic tap. */
export function ShutterButton({ onPress, disabled }: ShutterButtonProps) {
  const scale = useSharedValue(1);

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(PRESS_SCALE, { damping: 14, stiffness: 300 });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 260 });
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[styles.outer, disabled && styles.disabled]}
      accessibilityLabel="Take food photo"
    >
      <Animated.View style={[styles.inner, innerStyle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  inner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.cream,
  },
});
