import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors, MacroColors, Typography } from '@/constants/theme';
import { ProgressBar } from './ProgressBar';
import { Icon, type IconName } from './Icon';

export type MacroKey = 'protein' | 'carbs' | 'fat';

const MACRO_LABEL: Record<MacroKey, string> = {
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
};

const MACRO_GLYPH: Record<MacroKey, IconName> = {
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
};

interface MacroStatProps {
  macro: MacroKey;
  /** Grams consumed so far. */
  current: number;
  /** Grams targeted for the day, or null in tracking mode where there is no target. */
  target: number | null;
  style?: StyleProp<ViewStyle>;
}

/**
 * The protein/carbs/fat column that repeats on Today and in the plan preview.
 *
 * The glyph is deliberately tinted with the macro's own colour and the bar is
 * filled with the same one. That pairing is what lets the numbers elsewhere in
 * the app drop their text labels: once a student has seen the scarlet cut of
 * beef mean protein twice, an amber wheat sheaf beside "91g" needs no caption.
 * The label text stays here, in the one place the association gets taught.
 */
export function MacroStat({ macro, current, target, style }: MacroStatProps) {
  const color = MacroColors[macro];
  const progress = target && target > 0 ? current / target : 0;

  return (
    <View style={[styles.col, style]}>
      <View style={styles.labelRow}>
        <Icon name={MACRO_GLYPH[macro]} size="xs" color={color} />
        <Text style={Typography.caption}>{MACRO_LABEL[macro]}</Text>
      </View>
      <ProgressBar progress={progress} fillColor={color} style={styles.bar} />
      <Text style={Typography.monoUnit}>
        {Math.round(current)}
        {target ? ` / ${target}` : ''}G
      </Text>
    </View>
  );
}

interface MacroTagProps {
  macro: MacroKey;
  /** Pre-formatted value, e.g. "24g" or "39%". */
  value: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The compact form: coloured glyph plus a number, no word. Used where three
 * macros have to fit on one line beside a dish — the colour and silhouette do
 * the labelling that "P / C / F" letters used to do, and they survive being
 * read at a glance while walking through a serving line.
 */
export function MacroTag({ macro, value, style }: MacroTagProps) {
  const color = MacroColors[macro];

  return (
    <View style={[styles.tag, style]}>
      <Icon name={MACRO_GLYPH[macro]} size={12} color={color} label={MACRO_LABEL[macro]} />
      <Text style={[styles.tagValue, { color: Colors.textMuted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bar: {
    marginVertical: 6,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagValue: {
    ...Typography.monoUnit,
  },
});
