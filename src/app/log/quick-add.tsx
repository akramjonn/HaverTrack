import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Button, Card, IconButton, SegmentedControl } from '@/components/ui';
import { ArrowLeft, Star } from 'lucide-react-native';
import { HealthScoreCard } from '@/components/HealthScore';
import { scoreMeal } from '@/lib/health';
import { logMeal, periodForNow, type MealPeriod } from '@/lib/logging';
import { useMenuStore } from '@/store/menuStore';

/**
 * Quick add — calories now, details never. No photo, no search, no menu match:
 * the escape hatch for the sandwich you ate walking to class.
 */
export default function QuickAddScreen() {
  const router = useRouter();
  const saveFavorite = useMenuStore((state) => state.saveFavorite);

  const [title, setTitle] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(periodForNow());
  const [alsoSave, setAlsoSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = {
    calories: parseNumber(calories),
    protein: parseNumber(protein),
    carbs: parseNumber(carbs),
    fat: parseNumber(fat),
  };

  const caloriesValid = parsed.calories !== null && parsed.calories > 0 && parsed.calories <= 6000;

  // Macros are optional; a quick add with only calories still logs.
  const macroCalories =
    (parsed.protein ?? 0) * 4 + (parsed.carbs ?? 0) * 4 + (parsed.fat ?? 0) * 9;
  const hasAnyMacro = parsed.protein !== null || parsed.carbs !== null || parsed.fat !== null;
  const macroMismatch =
    caloriesValid && hasAnyMacro && Math.abs(macroCalories - parsed.calories!) > parsed.calories! * 0.25;

  const score = useMemo(() => {
    if (!caloriesValid || !hasAnyMacro) return null;
    return scoreMeal({
      calories: parsed.calories!,
      protein_g: parsed.protein ?? 0,
      carbs_g: parsed.carbs ?? 0,
      fat_g: parsed.fat ?? 0,
    });
  }, [caloriesValid, hasAnyMacro, parsed.calories, parsed.protein, parsed.carbs, parsed.fat]);

  const handleSave = async () => {
    if (saving) return;
    if (!caloriesValid) {
      setError('Enter the calories for this item (1–6000) before logging it.');
      return;
    }

    setSaving(true);
    setError(null);

    const name = title.trim() || 'Quick add';

    const result = await logMeal({
      title: name,
      meal_period: mealPeriod,
      source: 'manual',
      items: [
        {
          name,
          portion: 1,
          portion_unit: 'serving',
          calories: parsed.calories!,
          protein_g: parsed.protein ?? 0,
          carbs_g: parsed.carbs ?? 0,
          fat_g: parsed.fat ?? 0,
          is_estimate: true,
        },
      ],
    });

    if (alsoSave) {
      await saveFavorite({
        dish_name: name,
        nutrislice_id: null,
        calories: parsed.calories!,
        protein_g: parsed.protein,
        carbs_g: parsed.carbs,
        fat_g: parsed.fat,
        serving_size: null,
        station_name: null,
        source: 'manual',
      });
    }

    setSaving(false);

    if (result.nutrientError) {
      setError(result.nutrientError);
      return;
    }

    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={Typography.title}>Quick add</Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={[Typography.bodyS, { color: Colors.textMuted, marginBottom: 20 }]}>
            Calories only is fine. Add macros if you know them — they sharpen your daily totals and
            unlock the balance score.
          </Text>

          <Text style={styles.fieldLabel}>WHAT WAS IT?</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Optional — e.g. Coop bagel"
            placeholderTextColor={Colors.textGhost}
            style={styles.textField}
            returnKeyType="next"
            maxLength={80}
          />

          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>CALORIES</Text>
          <View style={styles.calorieField}>
            <TextInput
              value={calories}
              onChangeText={setCalories}
              placeholder="0"
              placeholderTextColor={Colors.textGhost}
              keyboardType="number-pad"
              style={styles.calorieInput}
              maxLength={4}
              accessibilityLabel="Calories"
            />
            <Text style={styles.calorieUnit}>KCAL</Text>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>MACROS (OPTIONAL)</Text>
          <View style={styles.macroRow}>
            <MacroField label="Protein" value={protein} onChange={setProtein} />
            <MacroField label="Carbs" value={carbs} onChange={setCarbs} />
            <MacroField label="Fat" value={fat} onChange={setFat} />
          </View>

          {macroMismatch ? (
            <Text style={styles.warning}>
              Those macros work out to about {Math.round(macroCalories)} kcal, not {parsed.calories}.
              Both get logged as entered — worth a second look.
            </Text>
          ) : null}

          <Text style={[styles.fieldLabel, { marginTop: 24 }]}>LOG TO</Text>
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

          <Pressable
            onPress={() => setAlsoSave(!alsoSave)}
            style={styles.saveToggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: alsoSave }}
          >
            <Star
              size={18}
              color={alsoSave ? Colors.gold : Colors.textFaint}
              fill={alsoSave ? Colors.gold : 'transparent'}
            />
            <Text style={styles.saveToggleText}>
              Also save to my meals for one-tap logging later
            </Text>
          </Pressable>

          {score ? (
            <View style={{ marginTop: 24 }}>
              <HealthScoreCard score={score} />
            </View>
          ) : null}

          {error ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          ) : null}
        </ScrollView>

        <View style={styles.bottomBar}>
          <Button
            label={caloriesValid ? `Log ${parsed.calories} kcal` : 'Log this'}
            variant="primary"
            loading={saving}
            disabled={!caloriesValid}
            onPress={handleSave}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MacroField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.macroField}>
      <Text style={styles.macroLabel}>{label}</Text>
      <View style={styles.macroInputWrap}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="—"
          placeholderTextColor={Colors.textGhost}
          keyboardType="decimal-pad"
          style={styles.macroInput}
          maxLength={5}
          accessibilityLabel={`${label} grams`}
        />
        <Text style={styles.macroUnit}>g</Text>
      </View>
    </View>
  );
}

/** Returns null for blank or unparseable input so "unknown" never becomes 0. */
function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 10) / 10;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  fieldLabel: {
    ...Typography.monoLabel,
    marginBottom: 8,
  },
  textField: {
    height: 54,
    borderRadius: Radii.input,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.ink,
  },
  calorieField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 18,
    height: 76,
  },
  calorieInput: {
    flex: 1,
    fontFamily: Fonts.outfit.bold,
    fontSize: 36,
    letterSpacing: -1,
    color: Colors.ink,
    padding: 0,
  },
  calorieUnit: {
    ...Typography.monoLabel,
    marginLeft: 8,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 10,
  },
  macroField: {
    flex: 1,
  },
  macroLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginBottom: 6,
  },
  macroInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 52,
    paddingHorizontal: 12,
  },
  macroInput: {
    flex: 1,
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 17,
    color: Colors.ink,
    padding: 0,
  },
  macroUnit: {
    ...Typography.monoUnit,
    marginLeft: 4,
  },
  warning: {
    ...Typography.caption,
    color: Colors.amber,
    marginTop: 10,
  },
  saveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    padding: 14,
    borderRadius: Radii.card,
    backgroundColor: Colors.surfaceWarm,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  saveToggleText: {
    ...Typography.bodyS,
    color: Colors.inkSoft,
    flex: 1,
  },
  errorCard: {
    marginTop: 20,
    backgroundColor: '#FFF7F7',
    borderColor: 'rgba(226, 58, 80, 0.35)',
  },
  errorText: {
    ...Typography.bodyS,
    color: Colors.scarlet,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.cream,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
});
