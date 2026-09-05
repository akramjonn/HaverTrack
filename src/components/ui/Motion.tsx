import React from "react";
import {
  Pressable,
  type PressableProps,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";

export function MotionPressable({
  children,
  style,
  onPressIn,
  onPressOut,
  ...props
}: PressableProps) {
  const pressed = useSharedValue(0);
  const reduce = useReducedMotion();
  const animated = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withTiming(reduce ? 1 : 1 - pressed.value * 0.025, {
          duration: 120,
        }),
      },
    ],
  }));
  return (
    <Animated.View style={animated}>
      <Pressable
        {...props}
        style={style}
        onPressIn={(e) => {
          pressed.value = 1;
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          pressed.value = 0;
          onPressOut?.(e);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function Enter({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  return (
    <Animated.View
      entering={reduce ? undefined : FadeIn.duration(220)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
