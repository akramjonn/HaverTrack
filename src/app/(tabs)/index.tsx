import React, { useEffect, useState } from 'react';
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
  HeroCard,
  CalorieRing,
  StreakBadge,
  Button,
  Icon,
  MacroStat,
  LogSourceTile,
  EmptyState,
  mealPeriodIcon,
} from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useLogStore, getTodayString } from '@/store/logStore';
import { loggingStreak } from '@/lib/stats';
import { WaterTile, BOTTLE_ML } from '@/components/WaterTile';
import {
  CUP_ML,
  DEFAULT_WATER_TARGET_ML,
  deleteWaterEntry,
  fetchPreferences,
  fetchWaterEntries,
  pushWaterEntry,
  type WaterEntry,
} from '@/lib/water';

export default function TodayScreen() {
  const router = useRouter();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const goal = useAuthStore((state) => state.goal);
  const allLogs = useLogStore((state) => state.logs);

  const targetCalories = goal?.calorie_target ?? 2340;
  const isJustTracking = goal?.goal_type === 'tracking' || !targetCalories;

  // The rings and the list are about today, not the whole history.
  const today = new Date();
  const todayStr = getTodayString();
  const logs = allLogs.filter((m) => m.logged_date === todayStr);

  const totalCalories = logs.reduce((acc, m) => acc + m.total_calories, 0);
  const totalProtein = logs.reduce((acc, m) => acc + m.total_protein_g, 0);
  const totalCarbs = logs.reduce((acc, m) => acc + m.total_carbs_g, 0);
  const totalFat = logs.reduce((acc, m) => acc + m.total_fat_g, 0);

  const targetProtein = goal?.protein_g ?? 140;
  const targetCarbs = goal?.carbs_g ?? 265;
  const targetFat = goal?.fat_g ?? 72;

  const caloriesLeft = Math.max(0, targetCalories - totalCalories);
  const streak = loggingStreak(allLogs);

  // Dynamic Date string
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  // Water — its own small slice of state, since it is independent of the meal
  // totals above and the tile handles its own load/error display.
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([]);
  const [waterTarget, setWaterTarget] = useState(DEFAULT_WATER_TARGET_ML);
  const [waterError, setWaterError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setWaterEntries([]);
      return;
    }

    let cancelled = false;
    Promise.all([fetchWaterEntries(userId, todayStr), fetchPreferences(userId)])
      .then(([entries, prefs]) => {
        if (cancelled) return;
        setWaterEntries(entries);
        if (prefs) setWaterTarget(prefs.water_target_ml);
      })
      .catch((e: any) => {
        if (!cancelled) setWaterError(e?.message ?? 'Could not load water for today.');
      });

    return () => {
      cancelled = true;
    };
  }, [userId, todayStr]);

  const waterTotalMl = waterEntries.reduce((sum, e) => sum + e.ml, 0);

  const addWater = async (ml: number) => {
    if (!userId) {
      setWaterError('Sign in to track water.');
      return;
    }
    setWaterError(null);
    try {
      const saved = await pushWaterEntry(userId, todayStr, ml);
      setWaterEntries((prev) => [...prev, saved]);
    } catch (e: any) {
      setWaterError(e?.message ?? 'Could not save that.');
    }
  };

  const undoWater = async () => {
    if (!userId || !waterEntries.length) return;
    const last = waterEntries[waterEntries.length - 1];
    setWaterError(null);
    const previous = waterEntries;
    setWaterEntries(waterEntries.slice(0, -1));
    try {
      await deleteWaterEntry(userId, last.id);
    } catch (e: any) {
      setWaterEntries(previous);
      setWaterError(e?.message ?? 'Could not undo that.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.dayMuted}>{dayName}</Text>
            <Text style={Typography.displayM}>{monthDay}</Text>
          </View>
          {/*
            Hidden at zero rather than rendered as "0 day streak", which reads
            as a reprimand on the one screen a student opens before they have
            logged anything.
          */}
          {streak.current > 0 && <StreakBadge days={streak.current} />}
        </View>

        {/* Gallery / Debug Link Pill */}
        <Pressable
          onPress={() => router.push('/gallery' as any)}
          style={styles.galleryBadge}
        >
          <Icon name="layers" size="xs" color={Colors.scarlet} />
          <Text style={styles.galleryBadgeText}>View Design System Gallery</Text>
        </Pressable>

        {/* Hero Card (§3.4, §4 Screen 06) */}
        <HeroCard style={styles.heroCard}>
          <View style={styles.heroRow}>
            <CalorieRing
              current={totalCalories}
              target={isJustTracking ? 0 : targetCalories}
              size={128}
              strokeWidth={20}
            />

            <View style={styles.heroTextCol}>
              {isJustTracking ? (
                <>
                  <Text style={Typography.displayXL}>{totalCalories}</Text>
                  <Text style={[Typography.body, { color: Colors.textMuted }]}>
                    calories logged
                  </Text>
                  <Text style={[Typography.monoLabel, { marginTop: 4 }]}>
                    TRACKING MODE
                  </Text>
                </>
              ) : (
                <>
                  <Text style={Typography.displayXL}>{caloriesLeft}</Text>
                  <View style={styles.calorieCaptionRow}>
                    <Icon name="calories" size="xs" color={Colors.scarlet} />
                    <Text style={[Typography.body, { color: Colors.textMuted }]}>
                      calories left
                    </Text>
                  </View>
                  <Text style={[Typography.monoLabel, { marginTop: 4 }]}>
                    {totalCalories} / {targetCalories} KCAL
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Macro Progress Columns */}
          <View style={styles.macroRow}>
            <MacroStat macro="protein" current={totalProtein} target={targetProtein} />
            <MacroStat macro="carbs" current={totalCarbs} target={targetCarbs} />
            <MacroStat macro="fat" current={totalFat} target={targetFat} />
          </View>
        </HeroCard>

        {/*
          One strip for every way into the log, replacing the two-button row
          plus three-text-link row that used to stack here. The five paths are
          parallel choices, so ranking two of them as buttons and three as
          footnotes was arbitrary — the tile strip gives each an equal target
          and lets the scarlet fill do the "start here" work on its own.
        */}
        <View style={styles.logSourceRow}>
          <LogSourceTile
            icon="scan"
            label="Scan"
            primary
            onPress={() => router.push('/scan' as any)}
          />
          <LogSourceTile
            icon="menu"
            label="DC menu"
            onPress={() => router.push('/(tabs)/menu' as any)}
          />
          <LogSourceTile
            icon="search"
            label="Search"
            onPress={() => router.push('/log/search' as any)}
          />
          <LogSourceTile
            icon="quickAdd"
            label="Quick add"
            onPress={() => router.push('/log/quick-add' as any)}
          />
          <LogSourceTile
            icon="savedMeals"
            label="Saved"
            onPress={() => router.push('/log/saved' as any)}
          />
        </View>

        <WaterTile
          totalMl={waterTotalMl}
          targetMl={waterTarget}
          entryCount={waterEntries.length}
          error={waterError}
          onAddCup={() => addWater(CUP_ML)}
          onAddBottle={() => addWater(BOTTLE_ML)}
          onUndo={undoWater}
          style={styles.waterTile}
        />

        {/* Logged Today Section Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={Typography.title}>Logged today</Text>
          {logs.length > 0 ? (
            <Text style={[Typography.caption, { color: Colors.textMuted }]}>
              {logs.length} meal{logs.length !== 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>

        {/* Logged Meals List or Empty State */}
        {logs.length > 0 ? (
          logs.map((meal) => (
            <Pressable
              key={meal.id}
              onPress={() => router.push(`/log/${meal.id}` as any)}
              style={styles.mealRow}
            >
              {/*
                The period disc turns the day's log into something you can read
                by shape — sunrise, sun, moon down the left edge — instead of
                parsing "DC breakfast" out of the metadata line on every row.
              */}
              <View style={styles.mealPeriodDisc}>
                <Icon
                  name={mealPeriodIcon(meal.meal_period)}
                  size="md"
                  color={Colors.scarlet}
                />
              </View>
              <View style={styles.mealLeft}>
                <Text style={Typography.bodySSemiBold}>{meal.title}</Text>
                <Text style={styles.mealMeta}>
                  DC {meal.meal_period} · {meal.logged_time}
                </Text>
              </View>
              <View style={styles.mealRight}>
                <Text style={Typography.title}>{meal.total_calories}</Text>
                <Text style={Typography.monoUnit}>KCAL</Text>
              </View>
            </Pressable>
          ))
        ) : (
          <EmptyState
            icon="plate"
            title="Nothing logged yet today"
            body="Scan a plate at the DC or choose from today's menu to track calories and macros."
            style={styles.emptyCard}
          >
            <Button
              label="Scan a plate"
              variant="primary"
              onPress={() => router.push('/scan' as any)}
            />
            <Button
              label="Browse DC menu"
              variant="secondary"
              onPress={() => router.push('/(tabs)/menu' as any)}
            />
          </EmptyState>
        )}

        <View style={styles.footer}>
          <Text style={styles.disclaimer}>
            SquirrelTrack · Haverford College Dining Center
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dayMuted: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  galleryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceWarm,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    gap: 6,
  },
  galleryBadgeText: {
    ...Typography.monoUnit,
    color: Colors.scarlet,
    fontFamily: Fonts.outfit.semiBold,
  },
  heroCard: {
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroTextCol: {
    marginLeft: 20,
    flex: 1,
  },
  calorieCaptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
  logSourceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  waterTile: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 10,
  },
  mealPeriodDisc: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  mealLeft: {
    flex: 1,
    paddingRight: 12,
  },
  mealMeta: {
    ...Typography.monoUnit,
    marginTop: 3,
    color: Colors.textMuted,
  },
  mealRight: {
    alignItems: 'flex-end',
  },
  emptyCard: {
    marginBottom: 16,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  disclaimer: {
    ...Typography.micro,
    color: Colors.textFaint,
    textAlign: 'center',
  },
});
