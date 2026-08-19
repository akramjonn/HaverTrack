import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Card, SegmentedControl } from '@/components/ui';
import {
  TREND_WINDOWS,
  TrendWindow,
  useAdminContentSummary,
  useAdminEngagement,
  compactNumber,
  fullDate,
  relativeTime,
  syncSeverity,
  nullCaloriesSeverity,
  hourLabel,
  adminKeys,
} from '@/lib/admin';
import { StatTile, RowBarChart, ColumnChart, ChartEmpty, SeverityChip } from './_charts';

export default function AdminContentScreen() {
  const queryClient = useQueryClient();
  const [window, setWindow] = useState<`${TrendWindow}`>('30');
  const [refreshing, setRefreshing] = useState(false);

  const summary = useAdminContentSummary();
  const engagement = useAdminEngagement(Number(window) as TrendWindow);

  const s = summary.data;
  const syncSev = syncSeverity(s?.hours_since_sync);
  const calorieSev = nullCaloriesSeverity(s?.null_calorie_pct);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys.contentSummary() }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'engagement'] }),
    ]);
    setRefreshing(false);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.scarlet} />}
    >
      {summary.isLoading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={Colors.scarlet} />
        </View>
      ) : summary.isError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{summary.error?.message || 'Could not load menu health.'}</Text>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>NUTRISLICE SYNC</Text>
            <Card style={styles.card}>
              <View style={styles.syncRow}>
                <View style={{ flex: 1 }}>
                  <Text style={Typography.title}>
                    {s?.last_sync ? relativeTime(s.last_sync) : 'Never synced'}
                  </Text>
                  <Text style={[Typography.caption, { color: Colors.textMuted, marginTop: 2 }]}>
                    {s?.last_sync ? fullDate(s.last_sync) : 'The scan pipeline has no menu to match against.'}
                  </Text>
                </View>
                <SeverityChip
                  severity={syncSev}
                  label={syncSev === 'good' ? 'Fresh' : syncSev === 'warning' ? 'Aging' : 'Stale'}
                />
              </View>
            </Card>
          </View>

          <View style={styles.tileGrid}>
            <StatTile label="Items today" value={s?.items_today ?? 0} style={styles.tile} />
            <StatTile label="Total items" value={s?.total_items ?? 0} style={styles.tile} />
            <StatTile
              label="Days covered"
              value={s?.days_covered ?? 0}
              hint={s?.earliest_date ? `since ${fullDate(s.earliest_date)}` : undefined}
              style={styles.tile}
            />
            <StatTile
              label="Missing calories"
              value={`${s?.null_calorie_pct ?? 0}%`}
              hint={`${compactNumber(s?.null_calorie_items ?? 0)} dishes`}
              severity={calorieSev}
              severityLabel={
                calorieSev === 'good' ? 'Healthy' : calorieSev === 'warning' ? 'Watch' : 'Fix needed'
              }
              style={styles.tile}
            />
          </View>

          {calorieSev !== 'good' ? (
            <Text style={styles.warningNote}>
              A dish with no calorie figure can be picked on the menu screen but the scan matcher
              cannot price it — every point here is a plate a student logs as a low-confidence guess.
            </Text>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>ENGAGEMENT</Text>
            <SegmentedControl
              options={TREND_WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
              value={window}
              onChange={setWindow}
              style={{ marginBottom: 12 }}
            />

            {engagement.isLoading ? (
              <View style={styles.loadingBlockSmall}>
                <ActivityIndicator color={Colors.scarlet} />
              </View>
            ) : engagement.isError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>
                  {engagement.error?.message || 'Could not load engagement data.'}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.subEyebrow}>TOP DISHES</Text>
                <Card style={styles.card}>
                  {(engagement.data?.dishes.length ?? 0) > 0 ? (
                    <RowBarChart
                      showRank
                      data={(engagement.data?.dishes ?? []).map((d) => ({
                        key: d.dish_name,
                        label: d.dish_name,
                        value: d.log_count,
                        meta: `${d.user_count} student${d.user_count === 1 ? '' : 's'}`,
                      }))}
                    />
                  ) : (
                    <ChartEmpty message="No dishes logged in this window." />
                  )}
                </Card>

                <Text style={[styles.subEyebrow, { marginTop: 20 }]}>TOP STATIONS</Text>
                <Card style={styles.card}>
                  {(engagement.data?.stations.length ?? 0) > 0 ? (
                    <RowBarChart
                      showRank
                      data={(engagement.data?.stations ?? []).map((s) => ({
                        key: s.station_name,
                        label: s.station_name,
                        value: s.log_count,
                        meta: `${s.user_count} student${s.user_count === 1 ? '' : 's'}`,
                      }))}
                    />
                  ) : (
                    <ChartEmpty message="No station data in this window." />
                  )}
                </Card>

                <Text style={[styles.subEyebrow, { marginTop: 20 }]}>PEAK LOGGING HOURS</Text>
                <Card style={styles.card}>
                  {(engagement.data?.hours.length ?? 0) > 0 ? (
                    <ColumnChart
                      data={buildHourColumns(engagement.data?.hours ?? [])}
                      emphasisOnly
                      maxLabels={8}
                    />
                  ) : (
                    <ChartEmpty message="No logging activity in this window." />
                  )}
                </Card>
              </>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function buildHourColumns(hours: { hour_of_day: number; log_count: number }[]) {
  const byHour = new Map(hours.map((h) => [h.hour_of_day, h.log_count]));
  const max = Math.max(...hours.map((h) => h.log_count), 0);
  return Array.from({ length: 24 }, (_, hour) => {
    const value = byHour.get(hour) ?? 0;
    return { label: hourLabel(hour), value, emphasis: value === max && max > 0 };
  });
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, backgroundColor: Colors.cream },
  loadingBlock: { paddingVertical: 60, alignItems: 'center' },
  loadingBlockSmall: { paddingVertical: 30, alignItems: 'center' },
  section: { marginTop: 4 },
  sectionEyebrow: { ...Typography.monoLabel, marginBottom: 10, color: Colors.textMuted },
  subEyebrow: { ...Typography.monoLabel, marginBottom: 10, color: Colors.textFaint, fontSize: 10.5 },
  card: { padding: 16 },
  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  tile: { width: '48%', minHeight: 92 },
  warningNote: { ...Typography.caption, color: Colors.textMuted, marginTop: 12 },
  errorBox: {
    backgroundColor: '#FBEAED',
    borderWidth: 1,
    borderColor: 'rgba(158,27,50,0.28)',
    borderRadius: Radii.card,
    padding: 14,
  },
  errorText: { ...Typography.bodyS, color: Colors.scarlet },
});
