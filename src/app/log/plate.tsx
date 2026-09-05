import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Button, Card, IconButton, SegmentedControl, Chip } from '@/components/ui';
import { ArrowLeft, Sparkles, Utensils } from 'lucide-react-native';
import { useMenuStore } from '@/store/menuStore';
import { useAuthStore } from '@/store/authStore';
import { useLogStore, getTodayString } from '@/store/logStore';
import { logMeal, periodForNow, type MealPeriod } from '@/lib/logging';
import { toCandidates, buildPlate, type PlateSuggestion } from '@/lib/plate';

const DIETARY_OPTIONS = ['Vegan', 'Vegetarian', 'Wheat-Free'] as const;
const ALLERGEN_OPTIONS = ['Egg', 'Dairy', 'Wheat', 'Soy', 'Tree Nut', 'Peanut', 'Shellfish'] as const;

/**
 * Build-a-plate: given tonight's DC line and what is left on today's target,
 * suggest the combination that closes the protein gap without blowing the
 * calorie budget. A photo app can only describe food that already exists —
 * this can only exist because the menu is structured data.
 */
export default function BuildPlateScreen() {
  const router = useRouter();
  const menuItems = useMenuStore((state) => state.items);
  const goal = useAuthStore((state) => state.goal);
  const logs = useLogStore((state) => state.logs);

  const [period, setPeriod] = useState<'breakfast' | 'lunch' | 'dinner'>(
    periodForNow() === 'snack' ? 'dinner' : (periodForNow() as any)
  );
  const [requiredTags, setRequiredTags] = useState<string[]>([]);
  const [excludedAllergens, setExcludedAllergens] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const todayStr = getTodayString();
  const todaysTotals = useMemo(() => {
    const todaysLogs = logs.filter((l) => l.logged_date === todayStr);
    return {
      calories: todaysLogs.reduce((s, l) => s + l.total_calories, 0),
      protein: todaysLogs.reduce((s, l) => s + l.total_protein_g, 0),
    };
  }, [logs, todayStr]);

  const calorieBudget = Math.max(
    0,
    (goal?.calorie_target ?? 2000) - todaysTotals.calories
  );
  const proteinTarget = goal?.protein_g ?? 140;
  const proteinGap = Math.max(0, proteinTarget - todaysTotals.protein);

  const candidates = useMemo(() => {
    const todaysMenu = menuItems.filter(
      (item) => item.meal_period === period && item.served_date === todayStr
    );
    return toCandidates(todaysMenu);
  }, [menuItems, period, todayStr]);

  const suggestion: PlateSuggestion | null = useMemo(() => {
    if (calorieBudget <= 0) return null;
    return buildPlate(candidates, {
      calorieBudget,
      proteinGap,
      maxItems: 3,
      requiredTags,
      excludedAllergens,
    });
  }, [candidates, calorieBudget, proteinGap, requiredTags, excludedAllergens]);

  const toggleTag = (tag: string) => {
    setRequiredTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
    setSaved(false);
  };

  const toggleAllergen = (allergen: string) => {
    setExcludedAllergens((prev) =>
      prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen]
    );
    setSaved(false);
  };

  const handleLog = async () => {
    if (!suggestion || saving) return;
    setSaving(true);
    setError(null);

    try {
      await logMeal({
        title: `Built plate: ${suggestion.items.map((i) => i.dish_name).join(', ')}`,
        meal_period: period as MealPeriod,
        source: 'menu',
        items: suggestion.items.map((item) => ({
          name: item.dish_name,
          portion: 1,
          portion_unit: item.serving_size || 'serving',
          calories: item.calories,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
        })),
      });
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? 'Could not log this plate.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={Typography.title}>Build my plate</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[Typography.bodyS, { color: Colors.textMuted, marginBottom: 16 }]}>
          Picks from tonight's DC line to close today's protein gap without going
          over your calories.
        </Text>

        <SegmentedControl
          options={[
            { value: 'breakfast', label: 'Breakfast' },
            { value: 'lunch', label: 'Lunch' },
            { value: 'dinner', label: 'Dinner' },
          ]}
          value={period}
          onChange={(v) => {
            setPeriod(v);
            setSaved(false);
          }}
          style={{ marginBottom: 16 }}
        />

        <View style={styles.budgetRow}>
          <Card style={styles.budgetTile}>
            <Text style={Typography.monoLabel}>CALORIES LEFT</Text>
            <Text style={Typography.displayM}>{Math.round(calorieBudget)}</Text>
          </Card>
          <Card style={styles.budgetTile}>
            <Text style={Typography.monoLabel}>PROTEIN OWED</Text>
            <Text style={Typography.displayM}>{Math.round(proteinGap)}g</Text>
          </Card>
        </View>

        <Text style={styles.sectionEyebrow}>DIETARY</Text>
        <View style={styles.chipRow}>
          {DIETARY_OPTIONS.map((tag) => (
            <Chip key={tag} label={tag} selected={requiredTags.includes(tag)} onPress={() => toggleTag(tag)} />
          ))}
        </View>

        <Text style={styles.sectionEyebrow}>AVOID ALLERGENS</Text>
        <View style={styles.chipRow}>
          {ALLERGEN_OPTIONS.map((allergen) => (
            <Chip
              key={allergen}
              label={allergen}
              selected={excludedAllergens.includes(allergen)}
              onPress={() => toggleAllergen(allergen)}
            />
          ))}
        </View>

        <Text style={styles.sectionEyebrow}>SUGGESTED PLATE</Text>

        {candidates.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Utensils size={28} color={Colors.textGhost} style={{ marginBottom: 10 }} />
            <Text style={[Typography.bodyS, { color: Colors.textMuted, textAlign: 'center' }]}>
              No {period} menu with calorie data for today yet.
            </Text>
          </Card>
        ) : calorieBudget <= 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={[Typography.bodyS, { color: Colors.textMuted, textAlign: 'center' }]}>
              You've already hit today's calorie target — nothing to suggest.
            </Text>
          </Card>
        ) : !suggestion ? (
          <Card style={styles.emptyCard}>
            <Text style={[Typography.bodyS, { color: Colors.textMuted, textAlign: 'center' }]}>
              Nothing on tonight's menu fits those filters and your remaining calories.
            </Text>
          </Card>
        ) : (
          <>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {suggestion.items.map((item) => (
                <View key={item.nutrislice_id} style={styles.itemRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={Typography.bodySSemiBold}>{item.dish_name}</Text>
                    <Text style={styles.itemMeta}>{item.station_name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={Typography.title}>{item.calories}</Text>
                    <Text style={Typography.monoUnit}>{Math.round(item.protein_g)}G PROTEIN</Text>
                  </View>
                </View>
              ))}
            </Card>

            <View style={styles.totalsRow}>
              <View style={styles.totalCol}>
                <Text style={Typography.caption}>Calories</Text>
                <Text style={Typography.title}>{suggestion.calories}</Text>
              </View>
              <View style={styles.totalCol}>
                <Text style={Typography.caption}>Protein</Text>
                <Text style={Typography.title}>{Math.round(suggestion.protein_g)}g</Text>
              </View>
              <View style={styles.totalCol}>
                <Text style={Typography.caption}>Carbs</Text>
                <Text style={Typography.title}>{Math.round(suggestion.carbs_g)}g</Text>
              </View>
              <View style={styles.totalCol}>
                <Text style={Typography.caption}>Fat</Text>
                <Text style={Typography.title}>{Math.round(suggestion.fat_g)}g</Text>
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {saved ? (
              <View style={styles.savedBanner}>
                <Sparkles size={16} color={Colors.green} />
                <Text style={styles.savedText}>Logged to today.</Text>
              </View>
            ) : (
              <Button
                label="Log this plate"
                variant="primary"
                onPress={handleLog}
                loading={saving}
                style={{ marginTop: 16 }}
              />
            )}
          </>
        )}
      </ScrollView>
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
  budgetRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  budgetTile: {
    flex: 1,
    padding: 16,
  },
  sectionEyebrow: {
    ...Typography.monoLabel,
    marginBottom: 8,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  itemMeta: {
    ...Typography.monoUnit,
    color: Colors.textMuted,
    marginTop: 2,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceWarm,
    borderRadius: Radii.card,
    padding: 16,
    marginTop: 12,
  },
  totalCol: {
    alignItems: 'center',
  },
  errorText: {
    ...Typography.bodyS,
    color: Colors.scarletBright,
    marginTop: 12,
  },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.greenBg,
    borderRadius: Radii.card,
    padding: 14,
    marginTop: 16,
  },
  savedText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 14,
    color: Colors.green,
  },
});
