import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
} from 'react-native';
import { Colors, Fonts, MacroColors, Typography, Radii } from '@/constants/theme';
import { Card, SegmentedControl, Icon } from '@/components/ui';
import { useLogStore } from '@/store/logStore';
import { useAuthStore } from '@/store/authStore';
import { WeightModal } from '@/components/WeightModal';
import { generateInsights } from '@/lib/insights';
import { dailyTotals, averageCalories, loggingStreak, macroSplit } from '@/lib/stats';

export default function ProgressScreen() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [dismissedCheckinTime, setDismissedCheckinTime] = useState<number | undefined>();

  const logs = useLogStore((state) => state.logs);
  const weightEntries = useLogStore((state) => state.weightEntries);
  const goal = useAuthStore((state) => state.goal);

  // Latest weight calculation
  const latestEntry = weightEntries[weightEntries.length - 1];
  const latestWeightLb = latestEntry
    ? (latestEntry.weight_kg * 2.20462).toFixed(1)
    : '165.4';

  const firstEntry = weightEntries[0];
  const deltaLb =
    latestEntry && firstEntry
      ? ((latestEntry.weight_kg - firstEntry.weight_kg) * 2.20462).toFixed(1)
      : '0.0';

  const deltaText = parseFloat(deltaLb) <= 0 ? `${deltaLb} lb` : `+${deltaLb} lb`;

  // Real series for the selected window
  const windowDays = period === 'week' ? 7 : 30;
  const series = dailyTotals(logs, windowDays);
  const weekDays = series.map((d) => ({ day: d.label, calories: d.calories, logged: d.logged }));

  const avgCalories = averageCalories(series);
  const streak = loggingStreak(logs);
  const split = macroSplit(series);

  const targetCalories = goal?.calorie_target ?? null;
  const avgDelta = targetCalories ? avgCalories - targetCalories : null;

  // Headroom above the tallest bar so a record day does not touch the ceiling.
  const maxCal = Math.max(
    targetCalories ?? 0,
    ...series.map((d) => d.calories),
    1
  ) * 1.1;

  // Rules Engine Dynamic Insights
  const dynamicInsights = generateInsights(logs, goal, dismissedCheckinTime);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={Typography.displayL}>Progress</Text>
          <SegmentedControl
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
            value={period}
            onChange={setPeriod}
            style={{ marginTop: 14 }}
          />
        </View>

        {/* Daily Average Card */}
        <Card style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Icon name="calories" size="xs" color={Colors.textMuted} />
            <Text style={Typography.monoLabel}>DAILY AVERAGE</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={Typography.displayXL}>{avgCalories.toLocaleString()}</Text>
            <Text style={[Typography.title, { marginLeft: 6, color: Colors.textMuted }]}>kcal</Text>
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

          {/* Hand-rolled Bar Chart */}
          <View style={styles.chartContainer}>
            {weekDays.map((item, index) => {
              const barHeight = Math.min(100, (item.calories / maxCal) * 100);
              return (
                <View key={index} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${barHeight}%`,
                          backgroundColor: item.logged ? Colors.scarlet : Colors.track3,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{item.day}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        {/* 2-Column Metrics Grid: Weight & Streak */}
        <View style={styles.gridRow}>
          <Card
            onPress={() => setWeightModalVisible(true)}
            accessibilityLabel="Record weight"
            style={[styles.gridCard, { marginRight: 8 }]}
          >
            <View style={styles.iconCircle}>
              <Icon name="weight" size="md" color={Colors.ink} />
            </View>
            <Text style={[Typography.monoLabel, { marginTop: 8 }]}>WEIGHT</Text>
            <Text style={Typography.displayM}>{latestWeightLb} lb</Text>
            {/*
              The trend arrow is the only part of this tile that is not already
              spelled out in words, so it earns a label for screen readers where
              the tile's own glyph does not.
            */}
            <View style={styles.deltaRow}>
              <Icon
                name={parseFloat(deltaLb) <= 0 ? 'trendDown' : 'trendUp'}
                size="xs"
                color={Colors.textMuted}
                label={parseFloat(deltaLb) <= 0 ? 'Trending down' : 'Trending up'}
              />
              <Text style={[Typography.caption, { color: Colors.textMuted }]}>
                {deltaText} recently
              </Text>
            </View>
          </Card>

          <Card style={[styles.gridCard, { marginLeft: 8 }]}>
            <View style={[styles.iconCircle, { backgroundColor: '#FDF7E7' }]}>
              <Icon name="streak" size="md" color={Colors.gold} filled />
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

        {/* Macro Split */}
        <Card style={styles.card}>
          <Text style={Typography.monoLabel}>
            {period === 'week' ? 'MACRO SPLIT THIS WEEK' : 'MACRO SPLIT THIS MONTH'}
          </Text>
          {/*
            The split bar is new alongside the glyphs: three percentages sitting
            in a row never showed their proportions, which is the whole point of
            a split. It shares the macro colours so the bar and the three
            captions below it read as one figure.
          */}
          <View style={styles.splitBar}>
            <View style={{ flex: Math.max(split.protein, 1), backgroundColor: MacroColors.protein }} />
            <View style={{ flex: Math.max(split.carbs, 1), backgroundColor: MacroColors.carbs }} />
            <View style={{ flex: Math.max(split.fat, 1), backgroundColor: MacroColors.fat }} />
          </View>
          <View style={styles.macroSplitRow}>
            <View style={styles.splitItem}>
              <Text style={Typography.title}>{split.protein}%</Text>
              <View style={styles.splitLabelRow}>
                <Icon name="protein" size="xs" color={MacroColors.protein} />
                <Text style={Typography.caption}>Protein</Text>
              </View>
            </View>
            <View style={styles.splitItem}>
              <Text style={Typography.title}>{split.carbs}%</Text>
              <View style={styles.splitLabelRow}>
                <Icon name="carbs" size="xs" color={MacroColors.carbs} />
                <Text style={Typography.caption}>Carbs</Text>
              </View>
            </View>
            <View style={styles.splitItem}>
              <Text style={Typography.title}>{split.fat}%</Text>
              <View style={styles.splitLabelRow}>
                <Icon name="fat" size="xs" color={MacroColors.fat} />
                <Text style={Typography.caption}>Fat</Text>
              </View>
            </View>
          </View>
        </Card>

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
                <Icon name="wellbeing" size="md" color={Colors.scarlet} style={{ marginRight: 8 }} />
              ) : (
                <Icon name="insight" size="sm" color={Colors.gold} style={{ marginRight: 8 }} />
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
                  <Icon name="close" size="sm" color={Colors.textMuted} />
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
    marginBottom: 20,
  },
  card: {
    marginBottom: 16,
  },
  cardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
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
  barCol: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: 24,
    height: 90,
    backgroundColor: Colors.track,
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
  },
  barLabel: {
    ...Typography.monoUnit,
    marginTop: 8,
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
  splitBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 16,
    backgroundColor: Colors.track,
  },
  macroSplitRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 14,
  },
  splitItem: {
    alignItems: 'center',
  },
  splitLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
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
