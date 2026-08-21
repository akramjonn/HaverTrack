import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { HelpCircle, Ruler } from 'lucide-react-native';
import { Colors, Typography, Fonts, Radii } from '@/constants/theme';
import { Card, IconButton } from '@/components/ui';
import { calculateBmi, bmiCategory, bmiScalePosition, BMI_BANDS } from '@/lib/bmi';

const BAR_HEIGHT = 10;

interface BmiScaleBarProps {
  bmi: number;
  style?: ViewStyle;
}

/**
 * The horizontal gradient scale + tick, shared by the Progress card and the
 * `/bmi-info` screen. A `LinearGradient` sweeps across the four band colors
 * with hard stops at each band boundary (mapped onto the 15–40 display
 * range from `bmiScalePosition`) so the zones stay legible as bands, not a
 * blur.
 */
export function BmiScaleBar({ bmi, style }: BmiScaleBarProps) {
  const tickPct = bmiScalePosition(bmi) * 100;
  const underweightEdge = bmiScalePosition(BMI_BANDS[0].max);
  const healthyEdge = bmiScalePosition(BMI_BANDS[1].max);
  const overweightEdge = bmiScalePosition(BMI_BANDS[2].max);

  return (
    <View style={[styles.scaleBar, style]}>
      <Svg width="100%" height={BAR_HEIGHT} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bmiScale" x1="0" y1="0" x2="1" y2="0">
            <Stop offset={0} stopColor={BMI_BANDS[0].color} />
            <Stop offset={underweightEdge} stopColor={BMI_BANDS[0].color} />
            <Stop offset={underweightEdge} stopColor={BMI_BANDS[1].color} />
            <Stop offset={healthyEdge} stopColor={BMI_BANDS[1].color} />
            <Stop offset={healthyEdge} stopColor={BMI_BANDS[2].color} />
            <Stop offset={overweightEdge} stopColor={BMI_BANDS[2].color} />
            <Stop offset={overweightEdge} stopColor={BMI_BANDS[3].color} />
            <Stop offset={1} stopColor={BMI_BANDS[3].color} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} fill="url(#bmiScale)" />
      </Svg>
      <View pointerEvents="none" style={[styles.tick, { left: `${tickPct}%` }]} />
    </View>
  );
}

/** Four-dot legend row: one colored dot + label per band. */
export function BmiLegend() {
  return (
    <View style={styles.legendRow}>
      {BMI_BANDS.map((band) => (
        <View key={band.key} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: band.color }]} />
          <Text style={styles.legendLabel}>{band.label}</Text>
        </View>
      ))}
    </View>
  );
}

interface BmiCardProps {
  /** Latest known weight in kg — from `weightEntries`, falling back to `profile.weight_kg`. */
  weightKg: number | null;
  heightCm: number | null;
  age: number | null | undefined;
  style?: ViewStyle;
}

export function BmiCard({ weightKg, heightCm, age, style }: BmiCardProps) {
  const router = useRouter();
  const bmi = calculateBmi({ weight_kg: weightKg, height_cm: heightCm });

  const helpButton = (
    <IconButton
      icon={<HelpCircle size={16} color={Colors.inkSoft} />}
      onPress={() => router.push('/bmi-info' as any)}
      accessibilityLabel="What is BMI?"
    />
  );

  if (bmi === null) {
    return (
      <Card style={[styles.card, style]}>
        <View style={styles.headerRow}>
          <Text style={Typography.title}>Your BMI</Text>
          {helpButton}
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ruler size={20} color={Colors.textMuted} />
          </View>
          <Text style={[Typography.bodyS, styles.emptyText]}>Add your height to see your BMI</Text>
          <Pressable
            onPress={() => router.push('/(tabs)/settings' as any)}
            accessibilityRole="button"
            accessibilityLabel="Add your height in Settings"
            style={({ pressed }) => [styles.emptyButton, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.emptyButtonText}>Add height</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  const category = bmiCategory(bmi, age);

  return (
    <Card style={[styles.card, style]}>
      <View style={styles.headerRow}>
        <Text style={Typography.title}>Your BMI</Text>
        {helpButton}
      </View>

      <Text style={[Typography.displayXL, { marginTop: 8 }]}>{bmi.toFixed(1)}</Text>

      <View style={styles.pillRow}>
        <Text style={[Typography.bodyS, { color: Colors.textMuted }]}>Your weight is</Text>
        <View
          style={[
            styles.categoryPill,
            { backgroundColor: `${category.color}1F`, borderColor: category.color },
          ]}
        >
          <Text style={[styles.categoryPillText, { color: category.color }]}>{category.label}</Text>
        </View>
      </View>

      <BmiScaleBar bmi={bmi} style={{ marginTop: 20 }} />
      <BmiLegend />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  categoryPill: {
    marginLeft: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  categoryPillText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 13,
  },
  scaleBar: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    overflow: 'hidden',
    position: 'relative',
  },
  tick: {
    position: 'absolute',
    top: -3,
    marginLeft: -2,
    width: 4,
    height: BAR_HEIGHT + 6,
    borderRadius: 2,
    backgroundColor: Colors.ink,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendLabel: {
    ...Typography.micro,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyText: {
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: Colors.ink,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: Radii.pill,
  },
  emptyButtonText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 14,
    color: Colors.cream,
  },
});
