import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Button, Card, IconButton, Stepper, SegmentedControl } from '@/components/ui';
import { ArrowLeft, Trash2, Clock, Check } from 'lucide-react-native';
import { useLogStore } from '@/store/logStore';
import { fetchMealNutrients, type MealNutrientRow } from '@/lib/mealNutrients';
import { scoreMeal } from '@/lib/health';
import { HealthScoreCard } from '@/components/HealthScore';

export default function EditMealLogScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const logs = useLogStore((state) => state.logs);
  const updateMealLog = useLogStore((state) => state.updateMealLog);
  const deleteMealLog = useLogStore((state) => state.deleteMealLog);

  const meal = logs.find((l) => l.id === id);

  const [portionMultiplier, setPortionMultiplier] = useState(1);
  const [mealPeriod, setMealPeriod] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>(
    meal?.meal_period || 'lunch'
  );
  const [nutrients, setNutrients] = useState<MealNutrientRow | null>(null);

  useEffect(() => {
    if (!meal?.id) return;
    let cancelled = false;
    fetchMealNutrients([meal.id])
      .then((map) => {
        if (!cancelled) setNutrients(map.get(meal.id) ?? null);
      })
      .catch(() => {
        // No stored score is a quiet miss, not an error banner — the card
        // just falls back to a macro-only score below.
      });
    return () => {
      cancelled = true;
    };
  }, [meal?.id]);

  if (!meal) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.notFoundContainer}>
          <Text style={Typography.title}>Meal not found</Text>
          <Button
            label="Back to Today"
            variant="primary"
            onPress={() => router.replace('/(tabs)' as any)}
            style={{ marginTop: 16 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const baseCalories = meal.total_calories;
  const baseProtein = meal.total_protein_g;
  const baseCarbs = meal.total_carbs_g;
  const baseFat = meal.total_fat_g;

  const currentCalories = Math.round(baseCalories * portionMultiplier);
  const currentProtein = Math.round(baseProtein * portionMultiplier);
  const currentCarbs = Math.round(baseCarbs * portionMultiplier);
  const currentFat = Math.round(baseFat * portionMultiplier);

  // Recomputed live rather than read from the stored grade, so scaling the
  // portion with the stepper above updates the score too.
  const healthScore = useMemo(
    () =>
      scoreMeal({
        calories: currentCalories,
        protein_g: currentProtein,
        carbs_g: currentCarbs,
        fat_g: currentFat,
        fiber_g: nutrients?.fiber_g != null ? nutrients.fiber_g * portionMultiplier : null,
        sugar_g: nutrients?.sugar_g != null ? nutrients.sugar_g * portionMultiplier : null,
        sodium_mg: nutrients?.sodium_mg != null ? nutrients.sodium_mg * portionMultiplier : null,
        saturated_fat_g:
          nutrients?.saturated_fat_g != null ? nutrients.saturated_fat_g * portionMultiplier : null,
      }),
    [currentCalories, currentProtein, currentCarbs, currentFat, nutrients, portionMultiplier]
  );

  const handleSave = async () => {
    await updateMealLog(meal.id, {
      meal_period: mealPeriod,
      total_calories: currentCalories,
      total_protein_g: currentProtein,
      total_carbs_g: currentCarbs,
      total_fat_g: currentFat,
    });
    router.back();
  };

  const handleDelete = () => {
    Alert.alert('Delete Meal Log', `Are you sure you want to remove "${meal.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMealLog(meal.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={Typography.title}>Edit Logged Meal</Text>
        <IconButton
          icon={<Trash2 size={18} color={Colors.scarletBright} />}
          onPress={handleDelete}
          accessibilityLabel="Delete meal"
        />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Title and Time */}
        <View style={styles.header}>
          <Text style={Typography.displayL}>{meal.title}</Text>
          <View style={styles.timeRow}>
            <Clock size={14} color={Colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={Typography.monoUnit}>LOGGED AT {meal.logged_time.toUpperCase()}</Text>
          </View>
        </View>

        {/* Portion Stepper */}
        <Button label={meal.synced === false ? 'Sync this meal before rating' : 'Rate this meal'} disabled={meal.synced === false} variant="secondary" onPress={() => router.push({ pathname: '/rate', params: { meal: meal.id } } as never)} />
        {meal.nutrition_complete === false && <Text style={[Typography.bodyS, { color: Colors.amber, marginTop: 12 }]}>Nutrition is incomplete. Totals include only the information available.</Text>}
        <View style={styles.stepperContainer}>
          <Stepper
            value={portionMultiplier}
            onChange={setPortionMultiplier}
            step={0.25}
            unitLabel="portion scale"
          />
        </View>

        {/* Meal Period Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>MEAL PERIOD</Text>
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
        </View>

        {/* Nutrition Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>NUTRITION TOTALS</Text>
          <View style={styles.macroGrid}>
            <Card style={styles.macroTile}>
              <Text style={Typography.monoUnit}>CALORIES</Text>
              <Text style={Typography.displayM}>{currentCalories}</Text>
            </Card>
            <Card style={styles.macroTile}>
              <Text style={Typography.monoUnit}>PROTEIN</Text>
              <Text style={Typography.displayM}>{currentProtein}g</Text>
            </Card>
            <Card style={styles.macroTile}>
              <Text style={Typography.monoUnit}>CARBS</Text>
              <Text style={Typography.displayM}>{currentCarbs}g</Text>
            </Card>
            <Card style={styles.macroTile}>
              <Text style={Typography.monoUnit}>FAT</Text>
              <Text style={Typography.displayM}>{currentFat}g</Text>
            </Card>
          </View>
        </View>

        {healthScore ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>BALANCE SCORE</Text>
            <HealthScoreCard score={healthScore} />
          </View>
        ) : null}

        {/* Itemized Components */}
        {meal.items && meal.items.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>ITEMS IN THIS MEAL</Text>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {meal.items.map((item, index) => (
                <View key={item.id || index} style={styles.itemRow}>
                  <Text style={Typography.bodySSemiBold}>{item.name}</Text>
                  <Text style={Typography.monoUnit}>
                    {Math.round(item.calories * portionMultiplier)} KCAL
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky Save Button */}
      <View style={styles.bottomBar}>
        <Button
          label="Save changes"
          variant="primary"
          onPress={handleSave}
        />
      </View>
    </SafeAreaView>
  );
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
  notFoundContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 20,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  stepperContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionEyebrow: {
    ...Typography.monoLabel,
    marginBottom: 8,
  },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  macroTile: {
    width: '48%',
    padding: 16,
    alignItems: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.cream,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
});
