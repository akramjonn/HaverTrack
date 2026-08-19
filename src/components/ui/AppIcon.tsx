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
  // Mark 2b: "Tail S" from §3.6
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
        <Path
          d="M142 46C112 30 66 40 60 74C54 108 92 118 116 126C140 134 154 146 150 162C146 178 116 184 96 168"
          stroke={strokeColor}
          strokeWidth="28"
          strokeLinecap="round"
        />
        <Circle cx="150" cy="44" r="13" fill={nutColor} />
      </Svg>
    </View>
  );
}
