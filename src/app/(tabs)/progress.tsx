import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
} from 'react-native';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Card, Chip } from '@/components/ui';
import { Sparkles, Flame, Scale, X, HeartHandshake, Target } from 'lucide-react-native';
import { useLogStore } from '@/store/logStore';
import { useAuthStore } from '@/store/authStore';
import { WeightModal } from '@/components/WeightModal';
import { BmiCard } from '@/components/BmiCard';
import { generateInsights } from '@/lib/insights';
import { dailyTotals, averageCalories, loggingStreak, macroSplit, type DayTotals } from '@/lib/stats';
import { fetchPreferences } from '@/lib/water';
import { formatWeight, kgToLb, useUnits } from '@/lib/units';

type RangeKey = '90' | '180' | '365' | 'all';

const MACRO_COLORS = {
  protein: Colors.scarlet,
  carbs: Colors.gold,
  fat: Colors.inkSoft,
} as const;

const MAX_BARS = 14;

interface ChartBar {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  logged: boolean;
}

/** Sums consecutive days into at most `maxBars` buckets so a 90/180/365-day
 * window still renders as a readable handful of bars, not hundreds of slivers. */
function bucketSeries(series: DayTotals[], maxBars: number): ChartBar[] {
  if (series.length <= maxBars) return series;
  const bucketSize = Math.ceil(series.length / maxBars);
  const buckets: ChartBar[] = [];
  for (let i = 0; i < series.length; i += bucketSize) {
    const chunk = series.slice(i, i + bucketSize);
    buckets.push({
      date: chunk[chunk.length - 1].date,
      calories: chunk.reduce((sum, d) => sum + d.calories, 0),
      protein_g: chunk.reduce((sum, d) => sum + d.protein_g, 0),
      carbs_g: chunk.reduce((sum, d) => sum + d.carbs_g, 0),
      fat_g: chunk.reduce((sum, d) => sum + d.fat_g, 0),
      logged: chunk.some((d) => d.logged),
    });
  }
  return buckets;
}

function formatShortDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ProgressScreen() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('90');
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [dismissedCheckinTime, setDismissedCheckinTime] = useState<number | undefined>();
  const [goalWeightKg, setGoalWeightKg] = useState<number | null>(null);

  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const logs = useLogStore((state) => state.logs);
  const weightEntries = useLogStore((state) => state.weightEntries);
  const goal = useAuthStore((state) => state.goal);
  const units = useUnits();

  useEffect(() => {
    if (!user?.id) return;
    fetchPreferences(user.id)
      .then((prefs) => setGoalWeightKg(prefs?.goal_weight_kg ?? null))
      .catch((e) => console.warn('Could not load goal weight:', e));
  }, [user?.id]);

  // Latest weight is the authoritative weight_entries series, never the
  // stale onboarding snapshot on profile.weight_kg (used only as a fallback
  // for a user who has never logged a weight entry).
  const latestEntry = weightEntries[weightEntries.length - 1];
  const firstEntry = weightEntries[0];
  const weightKg = latestEntry?.weight_kg ?? profile?.weight_kg ?? null;

  const deltaKg =
    latestEntry && firstEntry && latestEntry.id !== firstEntry.id
      ? latestEntry.weight_kg - firstEntry.weight_kg
      : null;
  const deltaText =
    deltaKg === null
      ? null
      : units === 'imperial'
        ? `${kgToLb(deltaKg) <= 0 ? '' : '+'}${kgToLb(deltaKg).toFixed(1)} lb recently`
        : `${deltaKg <= 0 ? '' : '+'}${deltaKg.toFixed(1)} kg recently`;

  // Read once per mount rather than inside the memo below — Date.now() is an
  // impure call and a screen-lifetime staleness of "today" is irrelevant to
  // an approximate day count.
  const [nowMs] = useState(() => Date.now());

  // All-time window sizes itself to the earliest logged day, so "All time"
  // doesn't render thousands of empty days for a brand-new account.
  const allTimeDays = useMemo(() => {
    if (!logs.length) return 90;
    const earliest = logs.reduce((min, l) => (l.logged_date < min ? l.logged_date : min), logs[0].logged_date);
    const diffMs = nowMs - new Date(`${earliest}T00:00:00`).getTime();
    return Math.max(Math.ceil(diffMs / 86_400_000) + 1, 1);
  }, [logs, nowMs]);

  const RANGE_OPTIONS: { key: RangeKey; label: string; days: number }[] = [
    { key: '90', label: '90 Days', days: 90 },
    { key: '180', label: '6 Months', days: 180 },
    { key: '365', label: '1 Year', days: 365 },
    { key: 'all', label: 'All time', days: allTimeDays },
  ];

  const windowDays = RANGE_OPTIONS.find((o) => o.key === rangeKey)?.days ?? 90;
  const series = dailyTotals(logs, windowDays);
  const bars = bucketSeries(series, MAX_BARS);

  const avgCalories = averageCalories(series);
  const streak = loggingStreak(logs);
  const split = macroSplit(series);

  const targetCalories = goal?.calorie_target ?? null;
  const avgDelta = targetCalories ? avgCalories - targetCalories : null;

  const barMaxKcal = Math.max(
    ...bars.map((d) => d.protein_g * 4 + d.carbs_g * 4 + d.fat_g * 9),
    1
  ) * 1.1;

  const dynamicInsights = generateInsights(logs, goal, dismissedCheckinTime);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={Typography.displayL}>Progress</Text>
        </View>

        {/* 2-Column Metrics Grid: Weight & Streak */}
        <View style={styles.gridRow}>
          <Card
            onPress={() => setWeightModalVisible(true)}
            accessibilityLabel="Record weight"
            style={[styles.gridCard, { marginRight: 8 }]}
          >
            <View style={styles.iconCircle}>
              <Scale size={18} color={Colors.ink} />
            </View>
            <Text style={[Typography.monoLabel, { marginTop: 8 }]}>WEIGHT</Text>
            {weightKg !== null ? (
              <>
                <Text style={Typography.displayM}>{formatWeight(weightKg, units)}</Text>
                <Text style={[Typography.caption, { color: Colors.textMuted, marginTop: 2 }]}>
                  {deltaText ?? 'Tap to log today'}
                </Text>
                {goalWeightKg !== null ? (
                  <View style={styles.goalRow}>
                    <Target size={11} color={Colors.textMuted} style={{ marginRight: 4 }} />
                    <Text style={styles.goalText}>Goal {formatWeight(goalWeightKg, units)}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={[Typography.title, { marginTop: 2 }]}>No entries yet</Text>
                <Text style={[Typography.caption, { color: Colors.textMuted, marginTop: 2 }]}>
                  Tap to log your weight
                </Text>
              </>
            )}
          </Card>

          <Card style={[styles.gridCard, { marginLeft: 8 }]}>
            <View style={[styles.iconCircle, { backgroundColor: '#FDF7E7' }]}>
              <Flame size={18} color={Colors.gold} />
            </View>
            <Text style={[Typography.monoLabel, { marginTop: 8 }]}>LOGGING STREAK</Text>
            <Text style={Typography.displayM}>
              {streak.current} day{streak.current === 1 ? '' : 's'}
            </Text>
            <Text style={[Typography.caption, { color: Colors.textMuted, marginTop: 2 }]}>
              Best: {streak.best} day{streak.best === 1 ? '' : 's'}
            </Text>
          </Card>
        </View>

        {/* Time-range selector */}
        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((opt) => (
            <Chip
              key={opt.key}
              label={opt.label}
              selected={rangeKey === opt.key}
              onPress={() => setRangeKey(opt.key)}
              style={{ marginRight: 8 }}
            />
          ))}
        </View>

        {/* Total Calories Card — stacked protein/carbs/fat bars */}
        <Card style={styles.card}>
          <Text style={Typography.monoLabel}>TOTAL CALORIES</Text>
          <View style={styles.metricRow}>
            <Text style={Typography.displayXL}>{avgCalories.toLocaleString()}</Text>
            <Text style={[Typography.title, { marginLeft: 6, color: Colors.textMuted }]}>kcal/day</Text>
          </View>
          <Text style={[Typography.bodyS, { color: Colors.textMuted, marginTop: 4 }]}>
            {avgCalories === 0
              ? 'Log a meal to see your average'
              : avgDelta === null
                ? `Across ${series.filter((d) => d.logged).length} logged days`
                : avgDelta <= 0
                  ? `${Math.abs(avgDelta).toLocaleString()} under your ${targetCalories!.toLocaleString()} target`
                  : `${avgDelta.toLocaleString()} over your ${targetCalories!.toLocaleString()} target`}
          </Text>

          {/* Stacked bar chart: protein/carbs/fat at 4/4/9 kcal per gram */}
          <View style={styles.chartContainer}>
            {bars.map((item, index) => {
              const totalKcal = item.protein_g * 4 + item.carbs_g * 4 + item.fat_g * 9;
              const barHeightPct = barMaxKcal > 0 ? Math.min(100, (totalKcal / barMaxKcal) * 100) : 0;
              return (
                <View key={`${item.date}-${index}`} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    {totalKcal > 0 ? (
                      <View style={[styles.barStack, { height: `${barHeightPct}%` }]}>
                        <View style={{ flex: item.protein_g * 4 || 0.0001, backgroundColor: MACRO_COLORS.protein }} />
                        <View style={{ flex: item.carbs_g * 4 || 0.0001, backgroundColor: MACRO_COLORS.carbs }} />
                        <View style={{ flex: item.fat_g * 9 || 0.0001, backgroundColor: MACRO_COLORS.fat }} />
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.chartAxisRow}>
            <Text style={Typography.monoUnit}>{formatShortDate(bars[0]?.date ?? series[0]?.date ?? '')}</Text>
            <Text style={Typography.monoUnit}>
              {formatShortDate(bars[bars.length - 1]?.date ?? series[series.length - 1]?.date ?? '')}
            </Text>
          </View>

          <View style={styles.macroLegendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: MACRO_COLORS.protein }]} />
              <Text style={styles.legendLabel}>Protein</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: MACRO_COLORS.carbs }]} />
              <Text style={styles.legendLabel}>Carbs</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: MACRO_COLORS.fat }]} />
              <Text style={styles.legendLabel}>Fat</Text>
            </View>
          </View>
        </Card>

        {/* Macro Split */}
        <Card style={styles.card}>
          <Text style={Typography.monoLabel}>MACRO SPLIT</Text>
          <View style={styles.macroSplitRow}>
            <View style={styles.splitItem}>
              <Text style={Typography.title}>{split.protein}%</Text>
              <Text style={Typography.caption}>Protein</Text>
            </View>
            <View style={styles.splitItem}>
              <Text style={Typography.title}>{split.carbs}%</Text>
              <Text style={Typography.caption}>Carbs</Text>
            </View>
            <View style={styles.splitItem}>
              <Text style={Typography.title}>{split.fat}%</Text>
              <Text style={Typography.caption}>Fat</Text>
            </View>
          </View>
        </Card>

        {/* BMI */}
        <BmiCard weightKg={weightKg} heightCm={profile?.height_cm ?? null} age={profile?.age} />

        {/* Dynamic Rules-Engine Insights (§4 Screen 11 & §11 Guardrail #8) */}
        {dynamicInsights.map((insight) => (
          <Card
            key={insight.id}
            style={[
              styles.insightCard,
              insight.type === 'wellbeing_checkin' ? styles.checkinCard : null,
            ]}
          >
            <View style={styles.insightHeader}>
              {insight.type === 'wellbeing_checkin' ? (
                <HeartHandshake size={18} color={Colors.scarlet} style={{ marginRight: 8 }} />
              ) : (
                <Sparkles size={16} color={Colors.gold} style={{ marginRight: 8 }} />
              )}
              <Text
                style={[
                  Typography.monoLabel,
                  { color: insight.type === 'wellbeing_checkin' ? Colors.scarlet : '#8A5D00', flex: 1 },
                ]}
              >
                {insight.title}
              </Text>
              {insight.isDismissable ? (
                <Pressable
                  onPress={() => setDismissedCheckinTime(Date.now())}
                  hitSlop={8}
                  accessibilityLabel="Dismiss check-in"
                >
                  <X size={16} color={Colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.insightBody}>{insight.body}</Text>
          </Card>
        ))}
      </ScrollView>

      {/* Weight Modal */}
      <WeightModal
        visible={weightModalVisible}
        onClose={() => setWeightModalVisible(false)}
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
  header: {
    marginBottom: 16,
  },
  card: {
    marginBottom: 16,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    marginTop: 24,
    paddingTop: 10,
  },
  chartAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  barTrack: {
    width: '100%',
    height: 90,
    backgroundColor: Colors.track,
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barStack: {
    width: '100%',
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  macroLegendRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendLabel: {
    ...Typography.micro,
    color: Colors.textMuted,
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  gridCard: {
    flex: 1,
    padding: 16,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  goalText: {
    ...Typography.micro,
    color: Colors.textMuted,
  },
  rangeRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  macroSplitRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 12,
  },
  splitItem: {
    alignItems: 'center',
  },
  insightCard: {
    backgroundColor: '#FFFDF9',
    borderColor: 'rgba(232, 184, 75, 0.3)',
    marginBottom: 16,
  },
  checkinCard: {
    backgroundColor: '#FFF7F7',
    borderColor: 'rgba(158, 27, 50, 0.25)',
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  insightBody: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.ink,
  },
});
