import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

/** Original, decorative menu illustration; never presented as a photograph of the actual dish. */
export function MealArtwork({ name, size = 184 }: { name: string; size?: number }) {
  const sushi = /sushi|maki/i.test(name);
  const pizza = /pizza|flatbread/i.test(name);
  return (
    <Svg width={size} height={size} viewBox="0 0 220 220">
      <Ellipse cx="113" cy="122" rx="92" ry="88" fill="#243B32" opacity={0.1} />
      <Circle cx="108" cy="108" r="94" fill="#FFFCF3" />
      <Circle cx="108" cy="108" r="78" fill="#F2EDDE" stroke="#DAD6BE" strokeWidth="1" />
      {sushi ? <G rotation={-18} origin="110,110">
        {[[79,75],[127,75],[79,124],[127,124]].map(([x,y]) => <G key={`${x}-${y}`}>
          <Rect x={x-21} y={y-19} width="42" height="42" rx="14" fill="#243B32" />
          <Rect x={x-17} y={y-17} width="34" height="32" rx="12" fill="#FFFCF3" />
          <Rect x={x-9} y={y-9} width="14" height="17" rx="4" fill="#E28C6C" />
          <Path d={`M${x+5} ${y-8} l7 5 -2 10 -5 -2z`} fill="#829653" />
        </G>)}
        <Path d="M150 153 Q174 127 180 152 Q169 168 150 153" fill="#819A57" />
      </G> : pizza ? <G>
        <Circle cx="108" cy="108" r="66" fill="#CD9653" />
        <Circle cx="108" cy="108" r="57" fill="#E3AC52" stroke="#B95335" strokeWidth="5" />
        {[[82,80],[126,78],[104,116],[143,123],[78,137]].map(([x,y]) => <Circle key={x} cx={x} cy={y} r="11" fill="#AA4938" />)}
        <Path d="M98 60 Q120 56 108 80 Q94 75 98 60 M126 139 Q151 138 139 160 Q121 157 126 139 M57 109 Q77 94 80 116 Q64 125 57 109" fill="#516D43" />
      </G> : <G>
        <Path d="M53 93 Q42 57 81 49 Q107 53 105 85 Q76 111 53 93 M116 52 Q151 37 171 73 Q170 103 133 102Z M134 129 Q176 106 178 140 Q165 172 137 166Z" fill="#71874F" />
        <Path d="M57 116 Q79 97 102 113 L122 150 Q111 176 77 163Z" fill="#E7BF6D" />
        <Path d="M95 70 Q113 59 123 78 L155 122 Q158 138 141 148 Q127 157 117 139 L88 93 Q83 80 95 70" fill="#CB7850" />
        <Path d="M98 88 L122 80 M108 106 L136 98 M120 125 L146 117" stroke="#9B573B" strokeWidth="4" strokeLinecap="round" />
        {[[66,88],[147,67],[158,148]].map(([x,y]) => <Circle key={x} cx={x} cy={y} r="10" fill="#B74637" />)}
        <Path d="M68 131 l10 -5 M77 145 l11 -5 M91 131 l9 3 M143 84 l8 -6" stroke="#FFF9DE" strokeWidth="3" strokeLinecap="round" />
      </G>}
      <Path d="M185 31 L198 20 M193 44 L209 41 M174 20 L176 8" stroke="#243B32" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
