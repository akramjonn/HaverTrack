import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Card } from '@/components/ui';
import { Plus, Undo2, GlassWater } from 'lucide-react-native';
import { CUP_ML } from '@/lib/water';

interface WaterTileProps {
  totalMl: number;
  targetMl: number;
  entryCount: number;
  error: string | null;
  onAddCup: () => void;
  onAddBottle: () => void;
  onUndo: () => void;
  style?: ViewStyle;
}

/** 500ml — a standard refill bottle at the DC fountains. */
export const BOTTLE_ML = 500;

function formatLitres(ml: number) {
  return `${(ml / 1000).toFixed(1)} L`;
}

export function WaterTile({
  totalMl,
  targetMl,
  entryCount,
  error,
  onAddCup,
  onAddBottle,
  onUndo,
  style,
}: WaterTileProps) {
  const cupsTarget = Math.max(1, Math.round(targetMl / CUP_ML));
  const cupsDone = totalMl / CUP_ML;
  // Cap the pip row so a very large target does not overflow the tile.
  const pipCount = Math.min(cupsTarget, 12);
  const pipsPerCup = cupsTarget / pipCount;

  return (
    <Card style={[styles.card, style] as any}>
      <View style={styles.headRow}>
        <View style={styles.labelCol}>
          <Text style={Typography.monoLabel}>WATER</Text>
          <View style={styles.valueRow}>
            <Text style={Typography.displayM}>{formatLitres(totalMl)}</Text>
            <Text style={[Typography.caption, { color: Colors.textMuted, marginLeft: 6 }]}>
              of {formatLitres(targetMl)}
            </Text>
          </View>
          <Text style={styles.subline}>
            {totalMl === 0
              ? 'No water logged yet today'
              : `${cupsDone.toFixed(1)} cup${cupsDone === 1 ? '' : 's'} · ${entryCount} entr${entryCount === 1 ? 'y' : 'ies'}`}
          </Text>
        </View>

        <View style={styles.actionCol}>
          <Pressable
            onPress={onAddCup}
            style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={`Add one cup, ${CUP_ML} millilitres`}
          >
            <Plus size={18} color={Colors.cream} />
            <Text style={styles.primaryActionText}>Cup</Text>
          </Pressable>

          <View style={styles.secondaryRow}>
            <Pressable
              onPress={onAddBottle}
              style={({ pressed }) => [styles.secondaryAction, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={`Add one bottle, ${BOTTLE_ML} millilitres`}
            >
              <GlassWater size={15} color={Colors.ink} />
              <Text style={styles.secondaryActionText}>500</Text>
            </Pressable>

            <Pressable
              onPress={onUndo}
              disabled={entryCount === 0}
              style={({ pressed }) => [
                styles.secondaryAction,
                entryCount === 0 && styles.disabledAction,
                pressed && entryCount > 0 && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Undo last water entry"
            >
              <Undo2 size={15} color={entryCount === 0 ? Colors.textGhost : Colors.ink} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.pipRow}>
        {Array.from({ length: pipCount }).map((_, index) => {
          const filled = cupsDone >= (index + 1) * pipsPerCup;
          const partial = !filled && cupsDone > index * pipsPerCup;
          return (
            <View
              key={index}
              style={[
                styles.pip,
                filled && styles.pipFilled,
                partial && styles.pipPartial,
              ]}
            />
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  actionCol: {
    alignItems: 'flex-end',
    gap: 8,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: Radii.pill,
    backgroundColor: Colors.scarlet,
  },
  primaryActionText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 14,
    color: Colors.cream,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: Radii.pill,
    backgroundColor: Colors.surfaceWarm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryActionText: {
    fontFamily: Fonts.mono.medium,
    fontSize: 12,
    color: Colors.ink,
  },
  disabledAction: {
    opacity: 0.45,
  },
  pipRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 16,
  },
  pip: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.track,
  },
  pipFilled: {
    backgroundColor: Colors.scarlet,
  },
  pipPartial: {
    backgroundColor: Colors.track3,
  },
  error: {
    ...Typography.caption,
    color: Colors.scarletBright,
    marginTop: 12,
  },
});
