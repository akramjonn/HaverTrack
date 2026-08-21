import React from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { Colors } from '@/constants/theme';

interface AppIconProps {
  size?: number;
  variant?: 'light' | 'dark';
  style?: ViewStyle;
}

export function AppIcon({ size = 88, variant = 'light', style }: AppIconProps) {
  // Mark 3: "Ring + Flick" — HaverTrack rebrand
  // A 270° progress ring (same stroke-circle grammar as CalorieRing) with a
  // gap at the bottom; the open end grows a short tangent "tail flick" that
  // curls up and outward (the squirrel nod), and the gold dot sits at the
  // ring's start point, doubling as "current position" + head/ear.
  // Container: #141414, radius 22.37% (iOS squircle proportion)
  const strokeColor = variant === 'dark' ? '#FBF8F3' : '#E23A50';
  const nutColor = Colors.gold;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.2237,
          backgroundColor: Colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Svg width={size * 0.8} height={size * 0.8} viewBox="0 0 200 200" fill="none">
        {/* Base: 270° ring, gap at the bottom, centered at (100,100) r=62 */}
        <Path
          d="M56.2 143.8 A62 62 0 1 1 143.8 143.8"
          stroke={strokeColor}
          strokeWidth="26"
          strokeLinecap="round"
        />
        {/* Tail flick: tangent off the ring's open end, curling up and outward */}
        <Path
          d="M143.8 143.8 C161.5 126.1 176 116 166 98"
          stroke={strokeColor}
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Head/acorn dot: the ring's start point */}
        <Circle cx="56.2" cy="143.8" r="13" fill={nutColor} />
      </Svg>
    </View>
  );
}
