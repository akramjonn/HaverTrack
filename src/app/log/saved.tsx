import React, { useEffect, useMemo, useState } from 'react';
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
import { Button, Card, IconButton, SegmentedControl, Icon, EmptyState } from '@/components/ui';
import { useMenuStore } from '@/store/menuStore';
import { useLogStore, getTodayString } from '@/store/logStore';
import { useAuthStore } from '@/store/authStore';
import { logMeal, periodForNow, type MealPeriod } from '@/lib/logging';
import type { SavedMeal } from '@/lib/favorites';
import type { MealLog } from '@/store/logStore';

/**
 * Saved meals and recent meals, both one tap from being logged again.
 * Favourites are read from public.user_favorites, so they survive a reload —
 * which the old in-memory toggle did not.
 */
export default function SavedMealsScreen() {
  const router = useRouter();
  const userId = useAuthStore((state) => state.user?.id ?? null);

  const favorites = useMenuStore((state) => state.favorites);
  const favoritesLoaded = useMenuStore((state) => state.favoritesLoaded);
  const favoritesError = useMenuStore((state) => state.favoritesError);
  const hydrateFavorites = useMenuStore((state) => state.hydrateFavorites);
  const removeFavorite = useMenuStore((state) => state.removeFavorite);
  const markFavoriteLogged = useMenuStore((state) => state.markFavoriteLogged);

  const logs = useLogStore((state) => state.logs);

  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(periodForNow());
  const [justLogged, setJustLogged] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!favoritesLoaded) hydrateFavorites(userId);
  }, [favoritesLoaded, userId, hydrateFavorites]);

  /** Most recent distinct meal per title, excluding anything logged today already. */
  const recents = useMemo(() => {
    const today = getTodayString();
    const seen = new Set<string>();
    const out: MealLog[] = [];
    for (const log of logs) {
      if (log.logged_date === today) continue;
      const key = log.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(log);
      if (out.length >= 12) break;
    }
    return out;
  }, [logs]);

  const confirm = (key: string) => {
    setJustLogged(key);
    setTimeout(() => setJustLogged((current) => (current === key ? null : current)), 1600);
  };

  const logSaved = async (meal: SavedMeal) => {
    if (busy) return;
    if (meal.calories === null) {
      setError(
        `"${meal.dish_name}" was saved without a calorie count, so there is nothing to log. Open it from the DC menu or quick add it with real numbers.`
      );
      return;
    }

    setBusy(meal.id);
    setError(null);

    const result = await logMeal({
      title: meal.dish_name,
      meal_period: mealPeriod,
      source: meal.source === 'menu' ? 'menu' : 'manual',
      items: [
        {
          name: meal.dish_name,
          portion: 1,
          portion_unit: meal.serving_size ?? 'serving',
          calories: meal.calories,
          protein_g: meal.protein_g ?? 0,
          carbs_g: meal.carbs_g ?? 0,
          fat_g: meal.fat_g ?? 0,
          is_estimate: meal.source !== 'menu',
        },
      ],
    });

    await markFavoriteLogged(meal.dish_name);
    setBusy(null);

    if (result.nutrientError) setError(result.nutrientError);
    confirm(meal.id);
  };

  const logAgain = async (meal: MealLog) => {
    if (busy) return;
    setBusy(meal.id);
    setError(null);

    const result = await logMeal({
      title: meal.title,
      meal_period: mealPeriod,
      source: meal.source,
      items: meal.items.length
        ? meal.items.map((item) => ({
            name: item.name,
            portion: item.portion,
            portion_unit: item.portion_unit,
            calories: item.calories,
            protein_g: item.protein_g,
            carbs_g: item.carbs_g,
            fat_g: item.fat_g,
            is_estimate: item.is_estimate,
          }))
        : [
            {
              name: meal.title,
              portion: 1,
              portion_unit: 'serving',
              calories: meal.total_calories,
              protein_g: meal.total_protein_g,
              carbs_g: meal.total_carbs_g,
              fat_g: meal.total_fat_g,
              is_estimate: true,
            },
          ],
    });

    setBusy(null);
    if (result.nutrientError) setError(result.nutrientError);
    confirm(meal.id);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<Icon name="back" size="md" color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={Typography.title}>Saved & recent</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.periodBlock}>
        <Text style={styles.eyebrow}>LOG TO</Text>
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

      <ScrollView contentContainerStyle={styles.container}>
        {error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}
        {favoritesError ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{favoritesError}</Text>
          </Card>
        ) : null}

        <Text style={styles.sectionTitle}>Saved meals</Text>
        {favorites.length === 0 ? (
          <EmptyState
            icon="savedMeals"
            title="Nothing saved yet"
            body="Tap the star on any DC dish or search result and it lands here for one-tap logging."
          >
            <Button
              label="Browse the DC menu"
              variant="secondary"
              onPress={() => router.push('/(tabs)/menu' as any)}
            />
          </EmptyState>
        ) : (
          favorites.map((meal) => (
            <View key={meal.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={Typography.bodySSemiBold} numberOfLines={2}>
                  {meal.dish_name}
                </Text>
                <Text style={styles.rowMeta}>
                  {meal.calories !== null ? `${meal.calories} KCAL` : 'KCAL UNKNOWN'}
                  {meal.serving_size ? ` · ${meal.serving_size.toUpperCase()}` : ''}
                  {meal.station_name ? ` · ${meal.station_name.toUpperCase()}` : ''}
                </Text>
              </View>

              <Pressable
                onPress={() => removeFavorite(meal.dish_name)}
                hitSlop={8}
                style={styles.iconSlot}
                accessibilityLabel={`Remove ${meal.dish_name} from saved meals`}
              >
                <Icon name="star" size="md" color={Colors.gold} filled label="Saved" />
              </Pressable>

              <Pressable
                onPress={() => logSaved(meal)}
                disabled={busy === meal.id}
                style={[styles.logBtn, justLogged === meal.id && styles.logBtnDone]}
                accessibilityLabel={`Log ${meal.dish_name} to ${mealPeriod}`}
              >
                {justLogged === meal.id ? (
                  <Icon name="check" size="md" color={Colors.cream} emphasis />
                ) : (
                  <Text style={styles.logBtnText}>Log</Text>
                )}
              </Pressable>
            </View>
          ))
        )}

        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Log again</Text>
        {recents.length === 0 ? (
          <EmptyState
            icon="undo"
            title="No earlier meals yet"
            body="Meals you logged on previous days show up here so you can repeat them in one tap."
          />
        ) : (
          recents.map((meal) => (
            <View key={meal.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={Typography.bodySSemiBold} numberOfLines={2}>
                  {meal.title}
                </Text>
                <Text style={styles.rowMeta}>
                  {meal.total_calories} KCAL · {meal.logged_date}
                </Text>
              </View>
              <Pressable
                onPress={() => logAgain(meal)}
                disabled={busy === meal.id}
                style={[styles.logBtn, justLogged === meal.id && styles.logBtnDone]}
                accessibilityLabel={`Log ${meal.title} again`}
              >
                {justLogged === meal.id ? (
                  <Icon name="check" size="md" color={Colors.cream} emphasis />
                ) : (
                  <Icon name="undo" size="sm" color={Colors.cream} emphasis />
                )}
              </Pressable>
            </View>
          ))
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
  periodBlock: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  eyebrow: {
    ...Typography.monoLabel,
    marginBottom: 8,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    ...Typography.title,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
  },
  rowText: {
    flex: 1,
    paddingRight: 10,
  },
  rowMeta: {
    ...Typography.monoUnit,
    marginTop: 4,
    color: Colors.textFaint,
  },
  iconSlot: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtn: {
    minWidth: 56,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: Radii.pill,
    backgroundColor: Colors.scarlet,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  logBtnDone: {
    backgroundColor: Colors.green,
  },
  logBtnText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 14,
    color: Colors.cream,
  },
  errorCard: {
    marginBottom: 14,
    backgroundColor: '#FFF7F7',
    borderColor: 'rgba(226, 58, 80, 0.35)',
  },
  errorText: {
    ...Typography.bodyS,
    color: Colors.scarlet,
  },
});
