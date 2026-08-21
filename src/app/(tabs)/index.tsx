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
  ProgressBar,
  StreakBadge,
  Button,
  Card,
  Chip,
} from '@/components/ui';
import { Camera, Plus, Layers, UtensilsCrossed, Zap, Search } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { useLogStore, getTodayString } from '@/store/logStore';
import { dailyTotals, loggingStreak } from '@/lib/stats';
import { WaterTile, BOTTLE_ML } from '@/components/WaterTile';
import { CelebrationModal } from '@/components/CelebrationModal';
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

  const streak = loggingStreak(allLogs);

  // Sun-Sat filled state for the current calendar week, from the distinct
  // logged_date set in allLogs — same day-of-week keying as loggingStreak's
  // own date handling in src/lib/stats.ts.
  const loggedDateSet = new Set(allLogs.map((l) => l.logged_date));
  const startOfWeek = new Date(today);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const weekDots = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(startOfWeek);
    day.setDate(day.getDate() + i);
    const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
      day.getDate()
    ).padStart(2, '0')}`;
    return loggedDateSet.has(dayStr);
  });

  // Dynamic Date string
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  // Water — its own small slice of state, since it is independent of the meal
  // totals above and the tile handles its own load/error display.
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([]);
  const [waterTarget, setWaterTarget] = useState(DEFAULT_WATER_TARGET_ML);
  const [waterError, setWaterError] = useState<string | null>(null);

  // Calorie-math preference — read from the same fetchPreferences call as
  // the water target above, not a second fetch.
  const [rolloverEnabled, setRolloverEnabled] = useState(false);

  // Celebrations — a full-screen takeover for a milestone the user opted
  // into (streak day, hydration goal), not a lighter inline flourish.
  const [showWaterCelebration, setShowWaterCelebration] = useState(false);
  // The streak celebration is driven straight off the store's transient flag
  // rather than mirrored into local state via an effect — `addMealLog` only
  // sets it true on an actual crossing, so it can't refire on the next meal
  // logged the same day, and dismissing the modal clears it so it can't
  // reopen on its own.
  const justCrossedStreak = useLogStore((s) => s.justCrossedStreak);
  const clearStreakFlag = useLogStore((s) => s.clearStreakFlag);
  // Tapping the streak badge opens the same flame popup on demand (matching
  // Cal AI's "tap the flame to see your streak" pattern) — shares the one
  // modal instance with the auto-fired crossing celebration below.
  const [showStreakDetail, setShowStreakDetail] = useState(false);

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
        if (prefs) {
          setWaterTarget(prefs.water_target_ml);
          setRolloverEnabled(prefs.rollover_calories);
        }
      })
      .catch((e: any) => {
        if (!cancelled) setWaterError(e?.message ?? 'Could not load water for today.');
      });

    return () => {
      cancelled = true;
    };
  }, [userId, todayStr]);

  const waterTotalMl = waterEntries.reduce((sum, e) => sum + e.ml, 0);

  // "Rollover calories" adjusts the effective target only — the macro rows
  // keep deriving from the raw targetProtein/targetCarbs/targetFat above,
  // untouched.
  // dailyTotals(logs, days, today) returns per-day totals oldest-first, so
  // for a 2-day window ending today, index 0 is yesterday and index 1 is
  // today (confirmed by reading src/lib/stats.ts's offset loop, which walks
  // offset = days - 1 down to 0).
  const yesterday = dailyTotals(allLogs, 2, today)[0];
  const rolloverAmount =
    !isJustTracking && rolloverEnabled
      ? Math.min(200, Math.max(0, (goal?.calorie_target ?? 0) - yesterday.calories))
      : 0;

  const totalAdjustment = isJustTracking ? 0 : rolloverAmount;
  const adjustedTargetCalories = targetCalories + totalAdjustment;
  const caloriesLeft = Math.max(0, adjustedTargetCalories - totalCalories);

  const addWater = async (ml: number) => {
    if (!userId) {
      setWaterError('Sign in to track water.');
      return;
    }
    setWaterError(null);
    const before = waterTotalMl;
    const after = before + ml;
    try {
      const saved = await pushWaterEntry(userId, todayStr, ml);
      setWaterEntries((prev) => [...prev, saved]);
      if (before < waterTarget && after >= waterTarget) {
        setShowWaterCelebration(true);
      }
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
          <StreakBadge days={streak.current} onPress={() => setShowStreakDetail(true)} />
        </View>

        {/* Gallery / Debug Link Pill */}
        <Pressable
          onPress={() => router.push('/gallery' as any)}
          style={styles.galleryBadge}
        >
          <Layers size={14} color={Colors.scarlet} />
          <Text style={styles.galleryBadgeText}>View Design System Gallery</Text>
        </Pressable>

        {/* Hero Card (§3.4, §4 Screen 06) */}
        <HeroCard style={styles.heroCard}>
          <View style={styles.heroRow}>
            <CalorieRing
              current={totalCalories}
              target={isJustTracking ? 0 : adjustedTargetCalories}
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
                  <View style={styles.caloriesLeftRow}>
                    <Text style={Typography.displayXL}>{caloriesLeft}</Text>
                    {totalAdjustment !== 0 ? (
                      <Chip
                        label={`+${totalAdjustment} today`}
                        variant="green"
                        style={styles.adjustmentChip}
                      />
                    ) : null}
                  </View>
                  <Text style={[Typography.body, { color: Colors.textMuted }]}>
                    calories left
                  </Text>
                  <Text style={[Typography.monoLabel, { marginTop: 4 }]}>
                    {totalCalories} / {adjustedTargetCalories} KCAL
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Macro Progress Columns */}
          <View style={styles.macroRow}>
            <View style={styles.macroCol}>
              <Text style={Typography.caption}>Protein</Text>
              <ProgressBar
                progress={targetProtein > 0 ? totalProtein / targetProtein : 0}
                style={{ marginVertical: 6 }}
              />
              <Text style={Typography.monoUnit}>
                {Math.round(totalProtein)} / {targetProtein}G
              </Text>
            </View>

            <View style={styles.macroCol}>
              <Text style={Typography.caption}>Carbs</Text>
              <ProgressBar
                progress={targetCarbs > 0 ? totalCarbs / targetCarbs : 0}
                style={{ marginVertical: 6 }}
              />
              <Text style={Typography.monoUnit}>
                {Math.round(totalCarbs)} / {targetCarbs}G
              </Text>
            </View>

            <View style={styles.macroCol}>
              <Text style={Typography.caption}>Fat</Text>
              <ProgressBar
                progress={targetFat > 0 ? totalFat / targetFat : 0}
                style={{ marginVertical: 6 }}
              />
              <Text style={Typography.monoUnit}>
                {Math.round(totalFat)} / {targetFat}G
              </Text>
            </View>
          </View>
        </HeroCard>

        {/* Action Button Row: Scan & Browse Menu */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => router.push('/scan' as any)}
            style={({ pressed }) => [
              styles.scanBtn,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Camera size={20} color={Colors.cream} />
            <Text style={styles.scanBtnText}>Scan a plate</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/menu' as any)}
            style={({ pressed }) => [
              styles.menuBtn,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Plus size={20} color={Colors.ink} />
            <Text style={styles.menuBtnText}>Browse DC menu</Text>
          </Pressable>
        </View>

        {/* Secondary logging paths: no photo, no menu browse */}
        <View style={styles.secondaryRow}>
          <Pressable
            onPress={() => router.push('/log/quick-add' as any)}
            style={({ pressed }) => [styles.secondaryLink, pressed && { opacity: 0.7 }]}
          >
            <Zap size={15} color={Colors.scarlet} />
            <Text style={styles.secondaryLinkText}>Quick add</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/log/search' as any)}
            style={({ pressed }) => [styles.secondaryLink, pressed && { opacity: 0.7 }]}
          >
            <Search size={15} color={Colors.scarlet} />
            <Text style={styles.secondaryLinkText}>Search foods</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/log/saved' as any)}
            style={({ pressed }) => [styles.secondaryLink, pressed && { opacity: 0.7 }]}
          >
            <UtensilsCrossed size={15} color={Colors.scarlet} />
            <Text style={styles.secondaryLinkText}>Saved meals</Text>
          </Pressable>
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
          <Card style={styles.emptyCard}>
            <UtensilsCrossed size={32} color={Colors.textGhost} style={{ marginBottom: 12 }} />
            <Text style={Typography.title}>Nothing logged yet today</Text>
            <Text style={[Typography.bodyS, { color: Colors.textMuted, textAlign: 'center', marginTop: 4, marginBottom: 16 }]}>
              Scan a plate at the DC or choose from today's menu to track calories and macros.
            </Text>
            <View style={{ width: '100%', gap: 8 }}>
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
            </View>
          </Card>
        )}

        <View style={styles.footer}>
          <Text style={styles.disclaimer}>
            HaverTrack · Haverford College Dining Center
          </Text>
        </View>
      </ScrollView>

      <CelebrationModal
        visible={showWaterCelebration}
        onDismiss={() => setShowWaterCelebration(false)}
        icon="droplet"
        title="Hydration goal hit"
        subtitle={`You crossed your ${(waterTarget / 1000).toFixed(1)}L target today.`}
      />
      <CelebrationModal
        visible={justCrossedStreak || showStreakDetail}
        onDismiss={() => {
          clearStreakFlag();
          setShowStreakDetail(false);
        }}
        icon="flame"
        title={`${streak.current} day streak`}
        subtitle="Keep it going tomorrow."
        weekDots={weekDots}
      />
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
  caloriesLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adjustmentChip: {
    marginBottom: 2,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
  macroCol: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 20,
  },
  secondaryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  secondaryLinkText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 13,
    color: Colors.scarlet,
  },
  waterTile: {
    marginBottom: 24,
  },
  scanBtn: {
    flex: 1,
    height: 52,
    backgroundColor: Colors.scarlet,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  scanBtnText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 15,
    color: Colors.cream,
  },
  menuBtn: {
    flex: 1,
    height: 52,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  menuBtnText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 15,
    color: Colors.ink,
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
    alignItems: 'center',
    padding: 24,
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
