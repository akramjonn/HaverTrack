import React from 'react';
import { View, Text, StyleSheet, Platform, ViewStyle } from 'react-native';
import { Colors, Typography } from '@/constants/theme';
import { Card } from '@/components/ui';
import { Footprints } from 'lucide-react-native';
import { useStepCount, estimateCaloriesBurned, DEFAULT_WEIGHT_KG } from '@/lib/steps';
import { useAuthStore } from '@/store/authStore';

interface StepsTileProps {
  style?: ViewStyle;
}

export function StepsTile({ style }: StepsTileProps) {
  const { steps, available } = useStepCount();
  const weightKg = useAuthStore((state) => state.profile?.weight_kg) ?? DEFAULT_WEIGHT_KG;

  // Honest about failure: hide rather than show a false zero when the pedometer is
  // unavailable or permission was denied (same spirit as WaterTile's `error` prop, minus
  // the extra chrome — there's nothing actionable for the user to do about it here).
  if (!available || steps === null) {
    return null;
  }

  const label = Platform.OS === 'ios' ? 'STEPS TODAY' : 'STEPS THIS SESSION';
  const calories = estimateCaloriesBurned(steps, weightKg);

  return (
    <Card style={[styles.card, style]}>
      <View style={styles.headRow}>
        <View style={styles.labelCol}>
          <Text style={Typography.monoLabel}>{label}</Text>
          <View style={styles.valueRow}>
            <Text style={Typography.displayM}>{steps.toLocaleString()}</Text>
            <Text style={[Typography.caption, { color: Colors.textMuted, marginLeft: 6 }]}>
              steps
            </Text>
          </View>
          <Text style={styles.subline}>
            ~{calories} kcal burned (estimated)
            {Platform.OS === 'android' ? ' · since you opened the app' : ''}
          </Text>
        </View>

        <View style={styles.iconWrap}>
          <Footprints size={20} color={Colors.scarlet} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  labelCol: {
    flex: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  subline: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceWarm,
  },
});
