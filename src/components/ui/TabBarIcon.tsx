import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, Radii } from '@/constants/theme';
import { Icon, type IconName } from './Icon';

interface TabBarIconProps {
  name: IconName;
  focused: boolean;
}

/**
 * Tint alone is a weak active state — at 22px on a cream bar, scarlet and
 * #8A8178 are close enough in value that the eye has to hunt for the selected
 * tab. Apps that get this right change the glyph's *ground*, not just its
 * colour: a tinted pill sits behind the active icon while the inactive ones
 * float bare.
 *
 * A pill rather than the filled-glyph swap most trackers use, because three of
 * the four tab marks are open line-art (utensils, chef hat, trend line) and
 * flooding those with fill turns them into blobs. The pill works for any glyph
 * and carries the extra advantage of reading as a hit target.
 */
export function TabBarIcon({ name, focused }: TabBarIconProps) {
  return (
    <View style={[styles.pill, focused && styles.pillActive]}>
      <Icon
        name={name}
        size="lg"
        color={focused ? Colors.scarlet : Colors.textFaint}
        emphasis={focused}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 56,
    height: 32,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    // The scarlet at 10% keeps the pill readable on cream without competing
    // with the scarlet glyph sitting on top of it.
    backgroundColor: 'rgba(158, 27, 50, 0.10)',
  },
});
