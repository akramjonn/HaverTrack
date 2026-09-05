import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Colors, Typography, Radii } from "@/constants/theme";
import { Card, SegmentedControl } from "@/components/ui";
import { Users, ChevronRight, RefreshCw } from "lucide-react-native";
import {
  TREND_WINDOWS,
  TrendWindow,
  useAdminOverview,
  useAdminFunnel,
  useAdminTrend,
  compactNumber,
  relativeTime,
  syncSeverity,
  nullCaloriesSeverity,
  adminKeys,
} from "@/lib/admin";
import {
  StatTile,
  RowBarChart,
  StackedColumnChart,
  ChartEmpty,
  SeverityChip,
} from "@/components/admin/Charts";

export default function AdminOverviewScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [window, setWindow] = useState<`${TrendWindow}`>("30");
  const [refreshing, setRefreshing] = useState(false);

  const overview = useAdminOverview();
  const funnel = useAdminFunnel();
  const trend = useAdminTrend(Number(window) as TrendWindow);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys.overview() }),
      queryClient.invalidateQueries({ queryKey: adminKeys.funnel() }),
      queryClient.invalidateQueries({ queryKey: ["admin", "trend"] }),
    ]);
    setRefreshing(false);
  };

  const funnelRows = useMemo(() => {
    const rows = funnel.data ?? [];
    return rows.map((step) => ({
      key: step.step_key,
      label: step.step_label,
      value: step.user_count,
      meta: `${step.pct_of_signups}% of signups`,
    }));
  }, [funnel.data]);

  const trendLabels = (trend.data ?? []).map((d) =>
    new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
  );

  const o = overview.data;
  const isLoading = overview.isLoading || funnel.isLoading;
  const menuSyncSeverity = syncSeverity(
    o?.menu_last_sync
      ? (overview.dataUpdatedAt - new Date(o.menu_last_sync).getTime()) /
          3_600_000
      : null,
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.scarlet}
        />
      }
    >
      <View style={styles.headerRow}>
        <Text style={Typography.displayL}>Overview</Text>
        <Text
          style={[Typography.bodyS, { color: Colors.textMuted, marginTop: 4 }]}
        >
          {o
            ? `${compactNumber(o.total_users)} students on HaverTrack`
            : "Loading…"}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={Colors.scarlet} />
        </View>
      ) : overview.isError ? (
        <ErrorBanner message={overview.error?.message} />
      ) : (
        <>
          {/* KPI grid */}
          <View style={styles.tileGrid}>
            <StatTile
              label="Total students"
              value={o?.total_users ?? 0}
              hint={`${o?.college_verified_users ?? 0} verified · ${o?.onboarded_users ?? 0} onboarded`}
              style={styles.tile}
            />
            <StatTile
              label="New this week"
              value={o?.new_users_7d ?? 0}
              hint={`${o?.new_users_30d ?? 0} in 30 days`}
              style={styles.tile}
            />
            <StatTile
              label="Active today"
              value={o?.active_today ?? 0}
              hint={`${o?.active_7d ?? 0} this week · ${o?.active_30d ?? 0} this month`}
              style={styles.tile}
            />
            <StatTile
              label="Meals today"
              value={o?.meals_today ?? 0}
              hint={`${compactNumber(o?.total_meals ?? 0)} logged all time`}
              style={styles.tile}
            />
            <StatTile
              label="Meals / active user"
              value={o ? o.meals_per_active_user_7d.toFixed(1) : "—"}
              hint="per week, last 7 days"
              style={styles.tile}
            />
            <StatTile
              label="Avg calories"
              value={o?.avg_calories_7d ?? 0}
              hint="logged per day, last 7d"
              style={styles.tile}
            />
            <StatTile
              label="Scan share"
              value={o ? `${o.scan_share_30d}%` : "—"}
              hint="of meals logged via camera scan, 30d"
              style={styles.tile}
            />
            <StatTile
              label="Menu freshness"
              value={
                o?.menu_last_sync ? relativeTime(o.menu_last_sync) : "never"
              }
              severity={menuSyncSeverity}
              severityLabel={
                menuSyncSeverity === "good"
                  ? "Fresh"
                  : menuSyncSeverity === "warning"
                    ? "Aging"
                    : "Stale"
              }
              style={styles.tile}
            />
          </View>

          {(o?.menu_null_calorie_pct ?? 0) >= 15 ? (
            <Pressable
              onPress={() => router.push("/admin/content" as never)}
              style={styles.warningCallout}
            >
              <SeverityChip
                severity={nullCaloriesSeverity(o?.menu_null_calorie_pct)}
                label={`${o?.menu_null_calorie_pct}% of menu items missing calories`}
              />
              <ChevronRight size={16} color={Colors.textMuted} />
            </Pressable>
          ) : null}

          {/* Activation funnel — the centerpiece */}
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>ACTIVATION FUNNEL</Text>
            <Card style={styles.card}>
              {funnelRows.length > 0 ? (
                <RowBarChart
                  data={funnelRows}
                  scaleMax={funnelRows[0]?.value}
                />
              ) : (
                <ChartEmpty message="No signups yet." />
              )}
            </Card>
          </View>

          {/* Trend */}
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>SIGNUPS &amp; LOGGING MIX</Text>
            <SegmentedControl
              options={TREND_WINDOWS.map((w) => ({
                value: w.value,
                label: w.label,
              }))}
              value={window}
              onChange={setWindow}
              style={{ marginBottom: 12 }}
            />
            <Card style={styles.card}>
              {trend.isLoading ? (
                <View style={styles.loadingBlockSmall}>
                  <ActivityIndicator color={Colors.scarlet} />
                </View>
              ) : trend.isError ? (
                <ErrorBanner message={trend.error?.message} />
              ) : (trend.data ?? []).length > 0 ? (
                <StackedColumnChart
                  labels={trendLabels}
                  series={[
                    {
                      key: "scan",
                      label: "Scan",
                      color: "#9E1B32",
                      values: (trend.data ?? []).map((d) => d.scan_meals),
                    },
                    {
                      key: "menu",
                      label: "Menu",
                      color: "#B8801A",
                      values: (trend.data ?? []).map((d) => d.menu_meals),
                    },
                    {
                      key: "manual",
                      label: "Manual",
                      color: "#15803D",
                      values: (trend.data ?? []).map((d) => d.manual_meals),
                    },
                  ]}
                  maxLabels={Number(window) === 90 ? 6 : 7}
                />
              ) : (
                <ChartEmpty message="No meals logged in this window yet." />
              )}
            </Card>
          </View>

          <Pressable
            onPress={() => router.push("/admin/users" as never)}
            style={styles.navRow}
          >
            <Users
              size={18}
              color={Colors.scarlet}
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={Typography.bodySSemiBold}>Students</Text>
              <Text style={Typography.caption}>
                Roster, search, and individual detail
              </Text>
            </View>
            <ChevronRight size={16} color={Colors.textMuted} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/admin/content" as never)}
            style={[styles.navRow, { marginTop: 10 }]}
          >
            <RefreshCw
              size={18}
              color={Colors.scarlet}
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={Typography.bodySSemiBold}>Menu health</Text>
              <Text style={Typography.caption}>
                Sync status and nutrition coverage
              </Text>
            </View>
            <ChevronRight size={16} color={Colors.textMuted} />
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function ErrorBanner({ message }: { message?: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>
        {message || "Could not load this data."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, backgroundColor: Colors.cream },
  headerRow: { marginBottom: 18 },
  loadingBlock: { paddingVertical: 60, alignItems: "center" },
  loadingBlockSmall: { paddingVertical: 30, alignItems: "center" },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%", minHeight: 96 },
  warningCallout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  section: { marginTop: 26 },
  sectionEyebrow: {
    ...Typography.monoLabel,
    marginBottom: 10,
    color: Colors.textMuted,
  },
  card: { padding: 16 },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginTop: 26,
  },
  errorBox: {
    backgroundColor: "#FBEAED",
    borderWidth: 1,
    borderColor: "rgba(158,27,50,0.28)",
    borderRadius: Radii.card,
    padding: 14,
  },
  errorText: { ...Typography.bodyS, color: Colors.scarlet },
});
