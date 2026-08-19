import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Card } from '@/components/ui';
import type { HealthGrade, HealthScore } from '@/lib/health';

/**
 * The graded rating for a plate.
 *
 * Deliberately warm-toned at every grade: an E is amber, never alarm-red, and the
 * copy talks about the food rather than the person (§11). The palette below is
 * the app's own — green, gold, amber — so a low score reads as information, not
 * as a telling-off.
 */
const GRADE_COLORS: Record<HealthGrade, { fill: string; track: string; text: string }> = {
  A: { fill: Colors.green, track: Colors.greenBg, text: Colors.green },
  B: { fill: Colors.green, track: Colors.greenBg, text: Colors.green },
  C: { fill: Colors.gold, track: 'rgba(232, 184, 75, 0.2)', text: '#8A5D00' },
  D: { fill: Colors.amber, track: Colors.amberBg, text: Colors.amber },
  E: { fill: Colors.amber, track: Colors.amberBg, text: Colors.amber },
};

interface RingProps {
  score: HealthScore;
  size?: number;
}

export function HealthScoreRing({ score, size = 64 }: RingProps) {
  const palette = GRADE_COLORS[score.grade];
  const stroke = size * 0.11;
  const radius = 50 - (stroke / size) * 100 / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, score.score / 100));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle
          cx="50"
          cy="50"
          r={radius}
          stroke={palette.track}
          strokeWidth={(stroke / size) * 100}
          fill="none"
        />
        {pct > 0 ? (
          <Circle
            cx="50"
            cy="50"
            r={radius}
            stroke={palette.fill}
            strokeWidth={(stroke / size) * 100}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference * pct} ${circumference}`}
            transform="rotate(-90 50 50)"
          />
        ) : null}
      </Svg>
      <View style={StyleSheet.absoluteFill as any}>
        <View style={styles.ringCenter}>
          <Text style={[styles.gradeLetter, { color: palette.text, fontSize: size * 0.34 }]}>
            {score.grade}
          </Text>
        </View>
      </View>
    </View>
  );
}

interface BadgeProps {
  score: HealthScore;
  style?: ViewStyle;
}

/** Compact pill for list rows. */
export function HealthScoreBadge({ score, style }: BadgeProps) {
  const palette = GRADE_COLORS[score.grade];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: palette.track, borderColor: palette.fill },
        style,
      ]}
      accessibilityLabel={`Balance score ${score.score} out of 100, grade ${score.grade}`}
    >
      <Text style={[styles.badgeGrade, { color: palette.text }]}>{score.grade}</Text>
      <Text style={[styles.badgeScore, { color: palette.text }]}>{score.score}</Text>
    </View>
  );
}

interface CardProps {
  score: HealthScore;
  style?: ViewStyle;
}

export function HealthScoreCard({ score, style }: CardProps) {
  const palette = GRADE_COLORS[score.grade];
  const missing = score.coverage < 0.65;

  return (
    <Card style={[styles.card, style] as any}>
      <View style={styles.cardHeader}>
        <HealthScoreRing score={score} size={68} />
        <View style={styles.cardHeaderText}>
          <Text style={Typography.monoLabel}>BALANCE SCORE</Text>
          <View style={styles.scoreRow}>
            <Text style={[Typography.displayM, { color: palette.text }]}>{score.score}</Text>
            <Text style={[Typography.caption, { color: Colors.textMuted, marginLeft: 4 }]}>
              / 100
            </Text>
          </View>
          <Text style={styles.headline}>{score.headline}</Text>
        </View>
      </View>

      <View style={styles.componentList}>
        {score.components.map((component) => (
          <View key={component.key} style={styles.componentRow}>
            <View style={styles.componentLabelCol}>
              <Text style={Typography.bodySSemiBold}>{component.label}</Text>
              <Text style={styles.componentDetail}>{component.detail}</Text>
            </View>
            <View style={styles.componentBarTrack}>
              <View
                style={[
                  styles.componentBarFill,
                  {
                    width: `${Math.round(component.ratio * 100)}%`,
                    backgroundColor: palette.fill,
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.footnote}>
        {missing
          ? 'Scored on macros only — the DC does not publish fiber or sodium for these dishes.'
          : 'Scored on macro balance plus the micronutrients we have for this meal.'}
        {' '}This rates the food, not you.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  ringCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeLetter: {
    fontFamily: Fonts.outfit.bold,
    letterSpacing: -1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
    gap: 5,
  },
  badgeGrade: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 13,
  },
  badgeScore: {
    fontFamily: Fonts.mono.medium,
    fontSize: 11,
  },
  card: {
    padding: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 16,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  headline: {
    ...Typography.bodyS,
    color: Colors.textMuted,
    marginTop: 2,
  },
  componentList: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
    gap: 12,
  },
  componentRow: {
    gap: 6,
  },
  componentLabelCol: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  componentDetail: {
    ...Typography.monoUnit,
    color: Colors.textFaint,
    textTransform: 'none',
  },
  componentBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.track,
    overflow: 'hidden',
  },
  componentBarFill: {
    height: 6,
    borderRadius: 3,
  },
  footnote: {
    ...Typography.micro,
    color: Colors.textFaint,
    marginTop: 14,
  },
});
