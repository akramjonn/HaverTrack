import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Button, Chip, SegmentedControl, Stepper } from '@/components/ui';
import { HealthScoreBadge } from '@/components/HealthScore';
import { scoreMeal } from '@/lib/health';
import { logMeal, periodForNow, scaleSearchResult, type MealPeriod } from '@/lib/logging';
import type { FoodSearchResult } from '@/lib/foodSearch';

const GRAM_PRESETS = [30, 50, 100, 200];

/**
 * Quantity → meal-period → log composer for any `FoodSearchResult`-shaped hit
 * — DC menu search, OpenFoodFacts search, and barcode lookups all resolve to
 * this same shape, so they all get the same sheet instead of three separate
 * write paths that could drift apart. Lifted out of the food-search screen so
 * `scan.tsx`'s barcode flow (and anything else) can present it directly.
 */
export function FoodComposeSheet({
  result,
  onClose,
  onLogged,
}: {
  result: FoodSearchResult | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [servings, setServings] = useState(1);
  const [grams, setGrams] = useState('100');
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(periodForNow());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (result) {
      setServings(1);
      setGrams('100');
      setMealPeriod(periodForNow());
      setError(null);
    }
  }, [result?.key]);

  const perGram = result?.basis === 'per_100g';
  const gramValue = Number(grams);
  const quantity = perGram ? gramValue : servings;
  const quantityValid = Number.isFinite(quantity) && quantity > 0 && (!perGram || quantity <= 2000);

  const item = result && quantityValid ? scaleSearchResult(result, quantity) : null;
  const score = item ? scoreMeal(item) : null;

  const handleLog = async () => {
    if (!result || !item || saving) return;
    setSaving(true);
    setError(null);

    const outcome = await logMeal({
      title: result.name,
      meal_period: mealPeriod,
      source: result.source === 'menu' ? 'menu' : 'manual',
      items: [item],
    });

    setSaving(false);

    if (outcome.nutrientError) {
      setError(outcome.nutrientError);
      return;
    }
    onLogged();
  };

  return (
    <Modal
      visible={!!result}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          {result ? (
            <>
              <View style={styles.sheetHandle} />
              <Text style={Typography.title} numberOfLines={2}>
                {result.name}
              </Text>
              <Text style={styles.rowMeta}>
                {result.source === 'menu' ? 'DC MENU' : 'PACKAGED'} · {result.subtitle}
              </Text>

              <View style={styles.sheetTotals}>
                <View>
                  <Text style={Typography.displayL}>{item ? item.calories : '—'}</Text>
                  <Text style={Typography.monoUnit}>KCAL</Text>
                </View>
                {score ? <HealthScoreBadge score={score} /> : null}
              </View>

              <View style={styles.sheetMacros}>
                <SheetMacro label="Protein" value={item?.protein_g} />
                <SheetMacro label="Carbs" value={item?.carbs_g} />
                <SheetMacro label="Fat" value={item?.fat_g} />
                {item?.fiber_g !== null && item?.fiber_g !== undefined ? (
                  <SheetMacro label="Fiber" value={item.fiber_g} />
                ) : null}
              </View>

              <Text style={[styles.sheetLabel, { marginTop: 18 }]}>
                {perGram ? 'HOW MANY GRAMS?' : 'HOW MANY SERVINGS?'}
              </Text>

              {perGram ? (
                <View>
                  <View style={styles.gramRow}>
                    <TextInput
                      value={grams}
                      onChangeText={setGrams}
                      keyboardType="number-pad"
                      style={styles.gramInput}
                      maxLength={4}
                      accessibilityLabel="Grams"
                    />
                    <Text style={styles.gramUnit}>g</Text>
                  </View>
                  <View style={styles.presetRow}>
                    {GRAM_PRESETS.map((preset) => (
                      <Chip
                        key={preset}
                        label={`${preset} g`}
                        variant="muted"
                        selected={gramValue === preset}
                        onPress={() => setGrams(String(preset))}
                      />
                    ))}
                  </View>
                </View>
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Stepper
                    value={servings}
                    onChange={setServings}
                    step={0.25}
                    unitLabel={result.serving_label}
                  />
                </View>
              )}

              <Text style={[styles.sheetLabel, { marginTop: 18 }]}>LOG TO</Text>
              <SegmentedControl
                options={[
                  { value: 'breakfast', label: 'Breakfast' },
                  { value: 'lunch', label: 'Lunch' },
                  { value: 'dinner', label: 'Dinner' },
                  { value: 'snack', label: 'Snack' },
                ]}
                value={mealPeriod}
                onChange={setMealPeriod}
              />

              {error ? <Text style={styles.sheetError}>{error}</Text> : null}
              {!quantityValid ? (
                <Text style={styles.sheetError}>
                  Enter an amount between 1 and 2000 g to log this.
                </Text>
              ) : null}

              <Button
                label="Log it"
                variant="primary"
                loading={saving}
                disabled={!item}
                onPress={handleLog}
                style={{ marginTop: 18 }}
              />
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SheetMacro({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <View style={styles.sheetMacroCol}>
      <Text style={Typography.caption}>{label}</Text>
      <Text style={Typography.title}>
        {value === null || value === undefined ? '—' : `${Math.round(value)}g`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20, 20, 20, 0.35)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.cream,
    borderTopLeftRadius: Radii.cardLg,
    borderTopRightRadius: Radii.cardLg,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.track3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  rowMeta: {
    ...Typography.monoUnit,
    marginTop: 4,
    color: Colors.textFaint,
  },
  sheetTotals: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  sheetMacros: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
  sheetMacroCol: {
    flex: 1,
  },
  sheetLabel: {
    ...Typography.monoLabel,
    marginBottom: 10,
  },
  gramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 54,
    paddingHorizontal: 16,
  },
  gramInput: {
    flex: 1,
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 20,
    color: Colors.ink,
    padding: 0,
  },
  gramUnit: {
    ...Typography.monoLabel,
    marginLeft: 6,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  sheetError: {
    ...Typography.caption,
    color: Colors.scarlet,
    marginTop: 12,
  },
});
