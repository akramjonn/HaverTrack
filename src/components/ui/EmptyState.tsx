import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors, Radii, Typography } from '@/constants/theme';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  body?: string;
  /** Buttons or links offering the way out of the empty state. */
  children?: React.ReactNode;
  /** Drops the card chrome for empty states already sitting inside a Card. */
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The "there is nothing here yet" block, with the glyph in a tinted disc.
 *
 * An empty state is the one place a large icon is doing real work rather than
 * decorating: there is no content for the eye to land on, so the mark is what
 * tells you at a glance which surface you are looking at — a bookmark for
 * saved meals, a crossed fork for an unlogged day, a clock for no history.
 * The disc keeps the glyph from reading as a stray line drawing on cream.
 */
export function EmptyState({ icon, title, body, children, bare = false, style }: EmptyStateProps) {
  return (
    <View style={[bare ? styles.bare : styles.card, style]}>
      <View style={styles.disc}>
        <Icon name={icon} size="xl" color={Colors.textFainter} />
      </View>
      <Text style={[Typography.title, styles.title]}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  bare: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  disc: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    ...Typography.bodyS,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  actions: {
    width: '100%',
    gap: 8,
    marginTop: 18,
  },
});
