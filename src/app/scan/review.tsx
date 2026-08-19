import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import {
  Button,
  Card,
  IconButton,
  Stepper,
  Chip,
} from '@/components/ui';
import { ArrowLeft, RotateCw, Trash2, Plus, Info } from 'lucide-react-native';
import { scoreMeal, type MealNutrition } from '@/lib/health';
import { HealthScoreCard } from '@/components/HealthScore';
import { useScanStore } from '@/store/scanStore';
import { useLogStore, getTodayString } from '@/store/logStore';
import { saveMealNutrients } from '@/lib/mealNutrients';
import { useAuthStore } from '@/store/authStore';
import { uploadMealPhoto } from '@/lib/mealLogs';
import { ScannedPlateItem } from '@/lib/llm/types';

export default function ScanReviewScreen() {
  const router = useRouter();
  const scanResult = useScanStore((state) => state.currentResult);
  const currentPhoto = useScanStore((state) => state.currentPhoto);
  const mealPeriod = useScanStore((state) => state.currentMealPeriod);
  const clearScan = useScanStore((state) => state.clear);
  const addMealLog = useLogStore((state) => state.addMealLog);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [saving, setSaving] = useState(false);

  // Fallback demo data if opened directly
  const initialItems: ScannedPlateItem[] = scanResult?.items || [
    {
      id: '1',
      name: 'Breaded chicken cutlet',
      portion: 1.0,
      portion_unit: 'piece',
      calories: 330,
      protein_g: 25,
      carbs_g: 10,
      fat_g: 20,
      confidence_score: 0.92,
      is_menu_match: true,
    },
    {
      id: '2',
      name: 'Penne with marinara',
      portion: 1.0,
      portion_unit: '4 oz',
      calories: 210,
      protein_g: 7,
      carbs_g: 44,
      fat_g: 1,
      confidence_score: 0.92,
      is_menu_match: true,
    },
    {
      id: '3',
      name: 'Melted mozzarella',
      portion: 1.0,
      portion_unit: 'slice',
      calories: 70,
      protein_g: 5,
      carbs_g: 1,
      fat_g: 5,
      confidence_score: 0.88,
      is_menu_match: true,
    },
  ];

  const dishTitle = scanResult?.dish_title || 'Chicken parm with penne';
  const matchSubtitle = scanResult?.dish_subtitle || 'Matched to DC Main Line · today';
  const matchConfidence = scanResult?.match_confidence ?? 0.92;
  const isFallback = scanResult?.is_fallback_estimate ?? false;
  const quotaRemaining = scanResult?.quota_remaining;
  const showQuotaWarning = typeof quotaRemaining === 'number' && quotaRemaining < 5;

  const [portion, setPortion] = useState(1);
  const [items, setItems] = useState<ScannedPlateItem[]>(initialItems);

  const baseTotalCals = items.reduce((acc, item) => acc + item.calories, 0);
  const baseProtein = items.reduce((acc, item) => acc + item.protein_g, 0);
  const baseCarbs = items.reduce((acc, item) => acc + item.carbs_g, 0);
  const baseFat = items.reduce((acc, item) => acc + item.fat_g, 0);

  const scaledCalories = Math.round(baseTotalCals * portion);
  const scaledProtein = Math.round(baseProtein * portion);
  const scaledCarbs = Math.round(baseCarbs * portion);
  const scaledFat = Math.round(baseFat * portion);

  // The scan pipeline never returns fiber/sugar/sodium, so this is always a
  // macro-only score — HealthScoreCard already says so via its coverage footnote.
  const nutrition: MealNutrition = {
    calories: scaledCalories,
    protein_g: scaledProtein,
    carbs_g: scaledCarbs,
    fat_g: scaledFat,
  };
  const healthScore = scoreMeal(nutrition);

  const handleRemoveItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const handleLogMeal = async () => {
    // Explicit tap required per §4 Screen 08!
    if (saving) return;
    setSaving(true);

    const now = new Date();
    const timeStr = now
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      .toLowerCase();

    let photoPath: string | null = null;
    if (currentPhoto && userId) {
      try {
        photoPath = await uploadMealPhoto(userId, currentPhoto.base64);
      } catch (err) {
        // A failed upload must not cost the user their meal log.
        console.warn('Meal photo upload failed:', err);
      }
    }

    // addMealLog reconciles the optimistic row with the server row rather than
    // returning an id, so the created log is whichever client_uuid was not
    // present before the call — the same trick src/lib/logging.ts uses.
    const seenBeforeSave = new Set(useLogStore.getState().logs.map((l) => l.client_uuid));

    await addMealLog({
      title: dishTitle,
      meal_period: mealPeriod,
      logged_date: getTodayString(),
      logged_time: timeStr,
      total_calories: scaledCalories,
      total_protein_g: scaledProtein,
      total_carbs_g: scaledCarbs,
      total_fat_g: scaledFat,
      source: 'scan',
      photo_path: photoPath,
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        portion: i.portion * portion,
        portion_unit: i.portion_unit,
        calories: Math.round(i.calories * portion),
        protein_g: Math.round(i.protein_g * portion),
        carbs_g: Math.round(i.carbs_g * portion),
        fat_g: Math.round(i.fat_g * portion),
        is_estimate: !i.is_menu_match,
        confidence_score: i.confidence_score,
      })),
    });

    if (healthScore) {
      const created = useLogStore
        .getState()
        .logs.find((l) => !seenBeforeSave.has(l.client_uuid));

      // A local id means the meal has not reached the server yet (offline) —
      // there is no row to attach a score to, and it is not worth blocking the
      // save on it.
      if (created?.id && !created.id.startsWith('local-')) {
        try {
          await saveMealNutrients({
            meal_log_id: created.id,
            fiber_g: null,
            sugar_g: null,
            sodium_mg: null,
            saturated_fat_g: null,
            health_score: healthScore.score,
            health_grade: healthScore.grade,
          });
        } catch (e) {
          // The meal itself is already saved; a missing score is not worth
          // interrupting the flow for.
          console.warn('Could not save balance score:', e);
        }
      }
    }

    clearScan();
    setSaving(false);
    router.replace('/(tabs)' as any);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Back to camera"
        />
        <Text style={Typography.title}>Scan review</Text>
        <IconButton
          icon={<RotateCw size={18} color={Colors.inkSoft} />}
          onPress={() => router.replace('/scan' as any)}
          accessibilityLabel="Re-analyze photo"
        />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Match Header */}
        <View style={styles.dishHeader}>
          <Text style={Typography.displayL}>{dishTitle}</Text>

          <View style={styles.matchMetaRow}>
            <Text style={Typography.monoLabel}>{matchSubtitle.toUpperCase()}</Text>
            <Chip
              label={`${Math.round(matchConfidence * 100)}% match`}
              variant={matchConfidence >= 0.85 ? 'scarlet' : 'amber'}
              style={{ marginLeft: 8 }}
            />
          </View>

          {showQuotaWarning ? (
            <Text style={styles.quotaWarning}>
              {quotaRemaining === 0
                ? "That's your last photo scan for today — manual menu logging still works."
                : `${quotaRemaining} photo scan${quotaRemaining === 1 ? '' : 's'} left today`}
            </Text>
          ) : null}
        </View>

        {/* Portion Control Hero Card */}
        <Card style={styles.heroCard}>
          <View style={styles.calorieRow}>
            <View>
              <Text style={Typography.displayXL}>
                {isFallback ? `~${scaledCalories}` : scaledCalories}
              </Text>
              <Text style={[Typography.bodyS, { color: Colors.textMuted }]}>
                calories, {portion} plate{portion !== 1 ? 's' : ''}
              </Text>
            </View>
            <Stepper
              value={portion}
              onChange={setPortion}
              step={0.25}
              unitLabel="portion"
            />
          </View>

          {/* Macro Row */}
          <View style={styles.macroRow}>
            <View style={styles.macroCol}>
              <Text style={Typography.caption}>Protein</Text>
              <Text style={Typography.title}>{scaledProtein}g</Text>
            </View>
            <View style={styles.macroCol}>
              <Text style={Typography.caption}>Carbs</Text>
              <Text style={Typography.title}>{scaledCarbs}g</Text>
            </View>
            <View style={styles.macroCol}>
              <Text style={Typography.caption}>Fat</Text>
              <Text style={Typography.title}>{scaledFat}g</Text>
            </View>
          </View>
        </Card>

        {healthScore ? (
          <HealthScoreCard score={healthScore} style={styles.healthCard} />
        ) : null}

        {/* Itemized Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>WHAT WE FOUND ON THE PLATE</Text>
          <Card style={styles.itemsCard}>
            {items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={Typography.bodySSemiBold}>{item.name}</Text>
                  <Text style={Typography.monoUnit}>
                    {item.is_menu_match ? '' : '~'}
                    {Math.round(item.calories * portion)} KCAL
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleRemoveItem(item.id)}
                  hitSlop={8}
                  style={styles.deleteBtn}
                  accessibilityLabel={`Remove ${item.name}`}
                >
                  <Trash2 size={16} color={Colors.textGhost} />
                </Pressable>
              </View>
            ))}
          </Card>
        </View>

        {/* Approximate disclaimer (§11 wellbeing requirement) */}
        <View style={styles.disclaimerBox}>
          <Info size={16} color={Colors.textMuted} style={{ marginRight: 6 }} />
          <Text style={styles.disclaimerText}>
            Estimated from a photo. Numbers are approximate.
          </Text>
        </View>
      </ScrollView>

      {/* Sticky Bottom Log Button — Explicit Tap Requirement */}
      <View style={styles.bottomBar}>
        <Button
          label="Log this meal"
          loading={saving}
          variant="primary"
          onPress={handleLogMeal}
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
  dishHeader: {
    marginBottom: 20,
  },
  matchMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  quotaWarning: {
    ...Typography.caption,
    color: Colors.amber,
    marginTop: 8,
  },
  heroCard: {
    marginBottom: 24,
  },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  macroRow: {
    flexDirection: 'row',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
  macroCol: {
    flex: 1,
  },
  healthCard: {
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionEyebrow: {
    ...Typography.monoLabel,
    marginBottom: 8,
  },
  itemsCard: {
    padding: 0,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  deleteBtn: {
    padding: 6,
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceWarm,
    padding: 12,
    borderRadius: 12,
  },
  disclaimerText: {
    ...Typography.micro,
    color: Colors.textMuted,
    flex: 1,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.cream,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
});
