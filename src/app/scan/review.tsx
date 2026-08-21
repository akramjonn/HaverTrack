import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, TextInputProps } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Button, Card, IconButton, Stepper, Chip } from '@/components/ui';
import { PhotoDetailSheet, usePhotoDetailSheetControls } from '@/components/PhotoDetailSheet';
import { RotateCw, Trash2, Info, ThumbsUp, ThumbsDown } from 'lucide-react-native';
import { scoreMeal, type MealNutrition } from '@/lib/health';
import { HealthScoreCard } from '@/components/HealthScore';
import { useScanStore } from '@/store/scanStore';
import { useLogStore, getTodayString } from '@/store/logStore';
import { saveMealNutrients } from '@/lib/mealNutrients';
import { useAuthStore } from '@/store/authStore';
import { uploadMealPhoto } from '@/lib/mealLogs';
import { ScannedPlateItem } from '@/lib/llm/types';

/**
 * The editable dish title lives as its own component (rather than inline in
 * the screen body) purely so it can call `usePhotoDetailSheetControls()` —
 * that hook only resolves once it's actually rendered under
 * `PhotoDetailSheet`'s internal context provider, i.e. as part of the
 * `children` it's passed, not from the screen's own top-level body.
 */
function EditableTitle({ value, onChangeText, ...rest }: TextInputProps & { value: string; onChangeText: (t: string) => void }) {
  const controls = usePhotoDetailSheetControls();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onFocus={() => controls?.expand()}
      style={styles.titleInput}
      placeholder="Name this meal"
      placeholderTextColor={Colors.textFaint}
      accessibilityLabel="Meal title"
      returnKeyType="done"
      {...rest}
    />
  );
}

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

  // The one behavioral change vs. the previous version of this screen: the
  // dish title is now editable state (fed by a TextInput) instead of a
  // derived constant, so it flows into `addMealLog` below.
  const [dishTitle, setDishTitle] = useState(scanResult?.dish_title || 'Chicken parm with penne');
  const matchSubtitle = scanResult?.dish_subtitle || 'Matched to DC Main Line · today';
  const matchConfidence = scanResult?.match_confidence ?? 0.92;
  const isFallback = scanResult?.is_fallback_estimate ?? false;
  const quotaRemaining = scanResult?.quota_remaining;
  const showQuotaWarning = typeof quotaRemaining === 'number' && quotaRemaining < 5;

  const [portion, setPortion] = useState(1);
  const [items, setItems] = useState<ScannedPlateItem[]>(initialItems);
  // Local-only "was this scan accurate?" toggle — there's no feedback
  // endpoint in this codebase to send it to, so this is decoration for now,
  // not telemetry.
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const [capturedAt] = useState(() => new Date());
  const timestampLabel = `Today · ${capturedAt
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

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

  // There's no dedicated "fix issue" flow anywhere in this codebase yet — the
  // closest existing, real behavior is what the old header's re-analyze
  // button did: bounce back to the camera to retake the shot.
  const handleFixIssue = () => {
    router.replace('/scan' as any);
  };

  return (
    <PhotoDetailSheet
      photoUri={currentPhoto?.uri ?? null}
      onBack={() => router.back()}
      headerActions={
        <IconButton
          icon={<RotateCw size={18} color={Colors.cream} />}
          onPress={handleFixIssue}
          variant="dark"
          shape="circle"
          accessibilityLabel="Re-analyze photo"
        />
      }
      footer={
        <View style={styles.footerRow}>
          <Button
            label="Fix Issue"
            variant="secondary"
            onPress={handleFixIssue}
            style={styles.footerBtnSecondary}
          />
          <Button
            label="Done"
            variant="primary"
            loading={saving}
            onPress={handleLogMeal}
            style={styles.footerBtnPrimary}
          />
        </View>
      }
    >
      <View style={styles.timestampRow}>
        <Chip label={timestampLabel} variant="muted" />
      </View>

      <EditableTitle value={dishTitle} onChangeText={setDishTitle} />

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

      <View style={styles.stepperSection}>
        <Text style={styles.sectionEyebrow}>NUMBER OF SERVINGS</Text>
        <Stepper value={portion} onChange={setPortion} step={0.25} unitLabel="plate" />
      </View>

      <Card style={styles.caloriesCard}>
        <Text style={styles.sectionEyebrow}>CALORIES</Text>
        <Text style={Typography.displayXL}>
          {isFallback ? `~${scaledCalories}` : scaledCalories}
        </Text>
      </Card>

      <View style={styles.macroRow}>
        <Card style={styles.macroCard}>
          <Text style={Typography.caption}>Protein</Text>
          <Text style={Typography.title}>{scaledProtein}g</Text>
        </Card>
        <Card style={styles.macroCard}>
          <Text style={Typography.caption}>Carbs</Text>
          <Text style={Typography.title}>{scaledCarbs}g</Text>
        </Card>
        <Card style={styles.macroCard}>
          <Text style={Typography.caption}>Fat</Text>
          <Text style={Typography.title}>{scaledFat}g</Text>
        </Card>
      </View>

      {healthScore ? <HealthScoreCard score={healthScore} style={styles.healthCard} /> : null}

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

      <View style={styles.feedbackRow}>
        <Text style={Typography.bodySSemiBold}>Was this scan accurate?</Text>
        <View style={styles.feedbackBtns}>
          <Pressable
            onPress={() => setFeedback((f) => (f === 'up' ? null : 'up'))}
            accessibilityRole="button"
            accessibilityState={{ selected: feedback === 'up' }}
            accessibilityLabel="Scan was accurate"
            style={[styles.feedbackBtn, feedback === 'up' && styles.feedbackBtnActiveUp]}
          >
            <ThumbsUp size={18} color={feedback === 'up' ? Colors.cream : Colors.inkSoft} />
          </Pressable>
          <Pressable
            onPress={() => setFeedback((f) => (f === 'down' ? null : 'down'))}
            accessibilityRole="button"
            accessibilityState={{ selected: feedback === 'down' }}
            accessibilityLabel="Scan was inaccurate"
            style={[styles.feedbackBtn, feedback === 'down' && styles.feedbackBtnActiveDown]}
          >
            <ThumbsDown size={18} color={feedback === 'down' ? Colors.cream : Colors.inkSoft} />
          </Pressable>
        </View>
      </View>

      {/* Approximate disclaimer (§11 wellbeing requirement) */}
      <View style={styles.disclaimerBox}>
        <Info size={16} color={Colors.textMuted} style={{ marginRight: 6 }} />
        <Text style={styles.disclaimerText}>
          Estimated from a photo. Numbers are approximate.
        </Text>
      </View>
    </PhotoDetailSheet>
  );
}

const styles = StyleSheet.create({
  timestampRow: {
    marginTop: 4,
    marginBottom: 12,
    flexDirection: 'row',
  },
  titleInput: {
    ...Typography.displayL,
    color: Colors.ink,
    padding: 0,
    marginBottom: 10,
  },
  matchMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 8,
  },
  quotaWarning: {
    ...Typography.caption,
    color: Colors.amber,
    marginTop: 8,
  },
  stepperSection: {
    marginTop: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  sectionEyebrow: {
    ...Typography.monoLabel,
    marginBottom: 8,
  },
  caloriesCard: {
    marginBottom: 12,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  macroCard: {
    flex: 1,
    padding: 14,
  },
  healthCard: {
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
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
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  feedbackBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  feedbackBtn: {
    width: 38,
    height: 38,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackBtnActiveUp: {
    backgroundColor: Colors.green,
    borderColor: Colors.green,
  },
  feedbackBtnActiveDown: {
    backgroundColor: Colors.scarlet,
    borderColor: Colors.scarlet,
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
  footerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  footerBtnSecondary: {
    flex: 1,
  },
  footerBtnPrimary: {
    flex: 1.4,
  },
});
