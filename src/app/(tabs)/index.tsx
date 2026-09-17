import React, { useEffect, useState } from 'react';
import { FeaturedMeal } from '@/components/meals/FeaturedMeal';
import { PendingRating } from '@/components/meals/PendingRating';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography } from '@/constants/theme';
import {
  StreakBadge,
  Button,
  Card,
  Chip,
} from '@/components/ui';
import { Camera, Plus, UtensilsCrossed, Zap, Search, Apple, Wheat, Drumstick, Sprout } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { useLogStore, getTodayString } from '@/store/logStore';
import { dailyTotals, loggingStreak } from '@/lib/stats';
import { WaterTile, BOTTLE_ML } from '@/components/WaterTile';
import { CelebrationModal } from '@/components/CelebrationModal';
import {
  CUP_ML,
  DEFAULT_WATER_TARGET_ML,
  deleteWaterEntry,
  fetchWaterEntries,
  pushWaterEntry,
  type WaterEntry,
} from '@/lib/water';
import { usePreferences } from '@/lib/preferences';
import { formatClockTime, useClockFormat } from '@/lib/units';

export default function TodayScreen() {
  return <TodayContent />;
}

export function TodayContent({ previewItems }: { previewItems?: import('@/lib/nutrislice').ParsedMenuItem[] }) {
  const router = useRouter();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const profile = useAuthStore((state) => state.profile);
  const goal = useAuthStore((state) => state.goal);
  const clockFormat = useClockFormat();
  const allLogs = useLogStore((state) => state.logs);

  const targetCalories = goal?.calorie_target ?? 2340;
  const isJustTracking = goal?.goal_type === 'tracking' || !targetCalories;

  const todayStr = getTodayString();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const selectedDateObject = new Date(`${selectedDate}T12:00:00`);
  const isToday = selectedDate === todayStr;
  const logs = allLogs.filter((m) => m.logged_date === selectedDate);

  const totalCalories = logs.reduce((acc, m) => acc + m.total_calories, 0);
  const totalProtein = logs.reduce((acc, m) => acc + m.total_protein_g, 0);
  const totalCarbs = logs.reduce((acc, m) => acc + m.total_carbs_g, 0);
  const totalFat = logs.reduce((acc, m) => acc + m.total_fat_g, 0);

  const targetProtein = goal?.protein_g ?? 140;
  const targetCarbs = goal?.carbs_g ?? 265;
  const targetFat = goal?.fat_g ?? 72;

  const streak = loggingStreak(allLogs);

  const loggedDateSet = new Set(allLogs.map((l) => l.logged_date));
  const startOfWeek = new Date(selectedDateObject);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(startOfWeek);
    day.setDate(day.getDate() + i);
    const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
      day.getDate()
    ).padStart(2, '0')}`;
    return { date: day, dateString: dayStr, logged: loggedDateSet.has(dayStr) };
  });
  const weekDots = weekDays.map((day) => day.logged);

  // Dynamic Date string
  const dayName = selectedDateObject.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = selectedDateObject.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  // Water — its own small slice of state, since it is independent of the meal
  // totals above and the tile handles its own load/error display.
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([]);
  const [waterError, setWaterError] = useState<string | null>(null);
  const legacyUnits = profile?.units ?? 'imperial';
  const preferences = usePreferences(userId, legacyUnits);
  const waterTarget = preferences.data?.water_target_ml ?? DEFAULT_WATER_TARGET_ML;
  const rolloverEnabled = preferences.data?.rollover_calories ?? false;

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
  // The badge and milestone celebration share the same streak detail modal.
  const [showStreakDetail, setShowStreakDetail] = useState(false);

  useEffect(() => {
    if (!userId || previewItems) {
      return;
    }

    let cancelled = false;
    fetchWaterEntries(userId, selectedDate)
      .then((entries) => {
        if (cancelled) return;
        setWaterEntries(entries);
      })
      .catch((e: any) => {
        if (!cancelled) setWaterError(e?.message ?? 'Could not load water for today.');
      });

    return () => {
      cancelled = true;
    };
  }, [userId, selectedDate, previewItems]);

  const waterTotalMl = waterEntries.reduce((sum, e) => sum + e.ml, 0);

  // "Rollover calories" adjusts the effective target only — the macro rows
  // keep deriving from the raw targetProtein/targetCarbs/targetFat above,
  // untouched.
  // dailyTotals(logs, days, today) returns per-day totals oldest-first, so
  // for a 2-day window ending today, index 0 is yesterday and index 1 is
  // today (confirmed by reading src/lib/stats.ts's offset loop, which walks
  // offset = days - 1 down to 0).
  const yesterday = dailyTotals(allLogs, 2, selectedDateObject)[0];
  const rolloverAmount =
    isToday && !isJustTracking && rolloverEnabled
      ? Math.min(200, Math.max(0, (goal?.calorie_target ?? 0) - yesterday.calories))
      : 0;

  const totalAdjustment = isJustTracking ? 0 : rolloverAmount;
  const adjustedTargetCalories = targetCalories + totalAdjustment;
  const caloriesLeft = Math.max(0, adjustedTargetCalories - totalCalories);

  const addWater = async (ml: number) => {
    if (previewItems) { setWaterError('Water logging is disabled in this design preview.'); return; }
    if (!userId) {
      setWaterError('Sign in to track water.');
      return;
    }
    setWaterError(null);
    const before = waterTotalMl;
    const after = before + ml;
    try {
      const saved = await pushWaterEntry(userId, selectedDate, ml);
      setWaterEntries((prev) => [...prev, saved]);
      if (before < waterTarget && after >= waterTarget) {
        setShowWaterCelebration(true);
      }
    } catch (e: any) {
      setWaterError(e?.message ?? 'Could not save that.');
    }
  };

  const undoWater = async () => {
    if (previewItems) return;
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
        {!previewItems && <PendingRating />}
        {logs.some(log => log.nutrition_complete === false) && <Text style={[Typography.caption, { color: Colors.amber, marginBottom: 12 }]}>Today’s nutrition totals are partial: some logged foods have missing nutrition.</Text>}
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.brandLockup}><Sprout size={23} color={Colors.forest} /><Text style={styles.brand}>havertrack</Text></View>
          <StreakBadge days={streak.current} onPress={() => setShowStreakDetail(true)} />
        </View>

        <Text style={styles.dateCaption}>{dayName}, {monthDay}</Text>
        <Text style={styles.welcomeTitle}>A good day starts here.</Text>
        <FeaturedMeal previewItems={previewItems} />
        <View style={styles.sectionHeaderRow}><Text style={styles.sectionTitle}>Your daily rhythm</Text><Text style={Typography.micro}>{isToday ? 'Today' : monthDay}</Text></View>
        <WeekStrip days={weekDays} selectedDate={selectedDate} onSelect={setSelectedDate} />

        <Card style={styles.heroCard}>
          <View style={styles.heroRow}>
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
                    <Text style={styles.calorieValue}>{caloriesLeft}</Text>
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
            <View style={styles.energyMark}><Sprout size={32} color={Colors.forest} /><Text style={styles.energyLabel}>A little more
energy for life.</Text></View>
          </View>
        </Card>

        <View style={styles.macroCards}>
          <MacroCard tracking={isJustTracking} label="Protein" remaining={Math.max(0, targetProtein - totalProtein)} target={targetProtein} current={totalProtein} color={Colors.scarlet} icon={<Drumstick size={18} color={Colors.scarlet} />} />
          <MacroCard tracking={isJustTracking} label="Carbs" remaining={Math.max(0, targetCarbs - totalCarbs)} target={targetCarbs} current={totalCarbs} color={Colors.gold} icon={<Wheat size={18} color={Colors.gold} />} />
          <MacroCard tracking={isJustTracking} label="Fat" remaining={Math.max(0, targetFat - totalFat)} target={targetFat} current={totalFat} color={Colors.inkSoft} icon={<Apple size={17} color={Colors.inkSoft} />} />
        </View>

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
          <Text style={styles.sectionTitle}>{isToday ? 'At your table' : 'Logged meals'}</Text>
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
                  DC {meal.meal_period} · {formatClockTime(meal.eaten_at ?? meal.created_at, clockFormat, meal.logged_time)}
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
            <Text style={Typography.title}>Nothing logged yet</Text>
            <Text style={[Typography.bodyS, { color: Colors.textMuted, textAlign: 'center', marginTop: 4, marginBottom: 16 }]}>
              Scan a plate at the DC or choose from today&apos;s menu to track calories and macros.
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

function WeekStrip({
  days,
  selectedDate,
  onSelect,
}: {
  days: { date: Date; dateString: string; logged: boolean }[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  return (
    <View style={styles.weekStrip} accessibilityRole="radiogroup" accessibilityLabel="Week days">
      {days.map((day) => {
        const selected = day.dateString === selectedDate;
        const isToday = day.dateString === getTodayString();
        return (
          <Pressable
            key={day.dateString}
            onPress={() => onSelect(day.dateString)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            style={styles.dayChoice}
          >
            <View style={[styles.dayCircle, selected && styles.dayCircleSelected, !selected && isToday && styles.dayCircleToday]}>
              <Text style={[styles.dayInitial, selected && styles.dayInitialSelected]}>
                {day.date.toLocaleDateString('en-US', { weekday: 'narrow' })}
              </Text>
            </View>
            <Text style={[styles.dayNumber, selected && styles.dayNumberSelected]}>{day.date.getDate()}</Text>
            {day.logged ? <View style={[styles.logDot, selected && styles.logDotSelected]} /> : <View style={styles.logDotSpacer} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function MacroCard({
  label,
  tracking,
  remaining,
  target,
  current,
  color,
  icon,
}: {
  label: string;
  tracking: boolean;
  remaining: number;
  target: number;
  current: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <Card style={styles.macroCard}>
      <View style={styles.macroTop}>{icon}<Text style={styles.macroLabel}>{label}</Text></View>
      <Text style={styles.macroValue}>{Math.round(tracking ? current : remaining)}<Text style={styles.macroUnit}> g</Text></Text>
      <Text style={styles.macroLabel}>{tracking ? 'logged' : 'remaining'}</Text>
      {!tracking && <View style={styles.macroTrack}><View style={{ height: 4, borderRadius: 2, backgroundColor: color, width: `${Math.min(100, Math.max(0, target > 0 ? current / target * 100 : 0))}%` }} /></View>}
    </Card>
  );
}

const styles = StyleSheet.create({
  welcomeTitle: { ...Typography.editorial, fontSize: 29, color: Colors.ink, marginTop: 5, marginBottom: 10 },
  sectionTitle: { ...Typography.editorial, fontSize: 25, color: Colors.ink },
  energyMark: { alignItems: 'center', paddingLeft: 12, gap: 8 },
  energyLabel: { ...Typography.micro, color: Colors.forest, textAlign: 'center', maxWidth: 95 },
  macroTop: { flexDirection: 'row', gap: 5, alignItems: 'center', marginBottom: 8 },
  macroUnit: { ...Typography.bodyS, color: Colors.textMuted },
  macroTrack: { height: 4, backgroundColor: Colors.track, borderRadius: 2, marginTop: 12 },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brand: {
    fontFamily: Fonts.outfit.extraBold,
    fontSize: 25,
    color: Colors.ink,
    letterSpacing: -1,
  },
  dateCaption: {
    ...Typography.bodyS,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  dayMuted: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  dayChoice: { alignItems: 'center', flex: 1 },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: Colors.borderSoft,
  },
  dayCircleSelected: { borderStyle: 'solid', borderColor: Colors.forest, backgroundColor: Colors.forest },
  dayCircleToday: { borderStyle: 'solid', borderColor: Colors.ink },
  dayInitial: { ...Typography.caption, color: Colors.inkSoft },
  dayInitialSelected: { color: Colors.cream },
  dayNumber: { ...Typography.body, color: Colors.ink, marginTop: 5 },
  dayNumberSelected: { fontFamily: Fonts.outfit.bold, color: Colors.scarlet },
  logDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.ink, marginTop: 4 },
  logDotSelected: { backgroundColor: Colors.scarlet },
  logDotSpacer: { height: 8 },
  heroCard: {
    marginBottom: 16,
    padding: 24,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroTextCol: {
    flex: 1,
  },
  calorieValue: {
    fontFamily: Fonts.outfit.extraBold,
    fontSize: 38,
    lineHeight: 44,
    color: Colors.ink,
    letterSpacing: -2.4,
  },
  caloriesLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adjustmentChip: {
    marginBottom: 2,
  },
  macroCards: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  macroCard: {
    flex: 1,
    padding: 13,
    minHeight: 120,
    overflow: 'hidden',
  },
  macroValue: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 24,
    color: Colors.ink,
    letterSpacing: -0.8,
  },
  macroLabel: { ...Typography.micro, color: Colors.inkSoft, marginTop: 2 },
  macroRing: { alignSelf: 'center', marginTop: 12 },
  macroAccent: { width: 18, height: 3, borderRadius: 2, alignSelf: 'center', marginTop: 8 },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  secondaryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
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
    backgroundColor: Colors.forest,
    borderRadius: 18,
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
