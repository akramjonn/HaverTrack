import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import {
  ArrowUpRight,
  Download,
  RefreshCw,
  Star,
  UtensilsCrossed,
  MessageSquare,
  Users,
} from "lucide-react-native";
import { Colors, Fonts, Typography } from "@/constants/theme";
import {
  useFoodReport,
  percent,
  exportFoodCsv,
  type FoodReport,
} from "@/lib/foodAdmin";
import { useAdminOverview } from "@/lib/admin";
import { RowBarChart, ColumnChart } from "./Charts";
import { Enter } from "@/components/ui/Motion";

export function ReportWindow({
  days,
  setDays,
}: {
  days: number;
  setDays: (d: number) => void;
}) {
  return (
    <View style={styles.inline}>
      {[7, 30, 90].map((d) => (
        <Pressable
          key={d}
          accessibilityRole="tab"
          accessibilityState={{ selected: days === d }}
          onPress={() => setDays(d)}
          style={[styles.chip, days === d && styles.chipActive]}
        >
          <Text style={[styles.small, days === d && { color: Colors.cream }]}>
            {d} days
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Metric({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon?: React.ReactNode;
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.between}>
        <Text style={styles.small}>{label}</Text>
        {icon}
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.small}>{hint}</Text>
    </View>
  );
}
export default function FoodDashboard({
  mode = "overview",
  preview,
}: {
  mode?: "overview" | "dishes" | "notifications";
  preview?: FoodReport;
}) {
  const [days, setDays] = useState(30);
  const [period, setPeriod] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"selections" | "average">("selections");
  const [error, setError] = useState("");
  const report = useFoodReport(days, period, !preview);
  const overview = useAdminOverview(!preview);
  const data = preview ?? report.data;
  const router = useRouter();
  const dishes = (data?.dishes ?? [])
    .filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === "selections"
        ? b.selections - a.selections
        : (b.ratings >= 5 ? (b.average ?? -1) : -1) -
          (a.ratings >= 5 ? (a.average ?? -1) : -1),
    );
  async function download() {
    if (preview) {
      setError(
        "Preview data is illustrative. Open the admin dashboard to export real reports.",
      );
      return;
    }
    try {
      await exportFoodCsv(
        `food-report-${period ?? "all"}-${days}d.csv`,
        dishes.map((d) => ({ ...d })),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.between}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>HAVERFORD · DINING INSIGHTS</Text>
          <Text style={styles.title}>
            {mode === "dishes"
              ? "What’s on their plates."
              : mode === "notifications"
                ? "A thoughtful follow-up."
                : "Good food. Better insight."}
          </Text>
          <Text style={styles.subtitle}>
            {mode === "overview"
              ? "A closer look at your dining community."
              : mode === "dishes"
                ? "Selections and honest feedback, dish by dish."
                : "Track reminder delivery and the conversations it starts."}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh report"
          onPress={() => void report.refetch()}
          style={styles.chip}
        >
          <RefreshCw size={18} color={Colors.ink} />
        </Pressable>
      </View>
      <View style={styles.between}>
        <ReportWindow days={days} setDays={setDays} />
        <Pressable
          onPress={() => void download()}
          style={[styles.chip, styles.inline]}
        >
          <Download size={16} color={Colors.ink} />
          <Text style={styles.small}>Export dishes</Text>
        </Pressable>
      </View>
      <View style={styles.inline}>
        {[null, "breakfast", "lunch", "dinner"].map((p) => (
          <Pressable
            key={p ?? "all"}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === p }}
            onPress={() => setPeriod(p)}
            style={[styles.chip, period === p && styles.chipActive]}
          >
            <Text style={[styles.small, period === p && { color: "white" }]}>
              {p ? p[0].toUpperCase() + p.slice(1) : "All services"}
            </Text>
          </Pressable>
        ))}
      </View>
      {!preview && report.isLoading ? (
        <ActivityIndicator color={Colors.scarlet} />
      ) : !preview && report.isError ? (
        <View style={styles.panel}>
          <Text style={styles.error}>{report.error.message}</Text>
          <Text style={styles.small}>
            The food analytics migration must be installed on this backend.
          </Text>
        </View>
      ) : (
        data && (
          <Enter style={{ gap: 24 }}>
            {mode !== "notifications" ? (
              <View style={styles.grid}>
                <Metric
                  label="Meals logged"
                  value={data.meals.toLocaleString()}
                  hint={`${data.guided} guided plates`}
                  icon={<UtensilsCrossed size={20} color={Colors.scarlet} />}
                />
                <Metric
                  label="Meal satisfaction"
                  value={
                    data.average == null
                      ? "—"
                      : `${Number(data.average).toFixed(1)} / 5`
                  }
                  hint={`${data.ratings} overall meal ratings`}
                  icon={<Star size={20} color={Colors.amber} />}
                />
                <Metric
                  label="Rating response"
                  value={percent(data.ratings, data.eligible)}
                  hint={`${data.ratings} of ${data.eligible} eligible meals`}
                  icon={<MessageSquare size={20} color={Colors.scarlet} />}
                />
                <Metric
                  label="Active students"
                  value={overview.data?.active_30d ?? "—"}
                  hint="Students logging meals · last 30 days"
                  icon={<Users size={20} color={Colors.scarlet} />}
                />
              </View>
            ) : (
              <View style={styles.grid}>
                {[
                  "pending",
                  "accepted",
                  "delivered",
                  "failed",
                  "expired",
                  "unknown",
                ].map((status) => (
                  <Metric
                    key={status}
                    label={
                      status === "delivered" ? "Provider confirmed" : status
                    }
                    value={data.reminders[status] ?? 0}
                    hint={
                      status === "delivered"
                        ? "Not proof of device display"
                        : "Reminder jobs in this meal cohort"
                    }
                  />
                ))}
              </View>
            )}
            {mode === "notifications" ? (
              <View style={styles.panel}>
                <Text style={Typography.title}>From reminder to feedback</Text>
                <Text style={styles.value}>{data.reminder_opens}</Text>
                <Text style={styles.small}>
                  Tracked reminder opens. Delivery receipts confirm provider
                  handling; only a tracked tap counts as an open.
                </Text>
                <Text style={styles.small}>
                  One reminder per recent meal, with a single optional snooze.
                  Quiet hours: 10 PM–8 AM. Expired and ambiguous sends are not
                  blindly retried.
                </Text>
              </View>
            ) : (
              <>
                {mode === "overview" && (
                  <View style={styles.columns}>
                    <View style={[styles.panel, { flex: 1.4, minWidth: 280 }]}>
                      <Text style={Typography.title}>
                        The rhythm of the dining room
                      </Text>
                      <Text style={styles.small}>
                        Confirmed meals by campus date
                      </Text>
                      <ColumnChart
                        data={data.trend.map((t) => ({
                          label: t.day.slice(5),
                          value: t.meals,
                        }))}
                      />
                    </View>
                    <View style={[styles.panel, { flex: 1, minWidth: 260 }]}>
                      <Text style={Typography.title}>
                        Every star tells a story
                      </Text>
                      <Text style={styles.small}>
                        Overall meal ratings · {data.ratings} responses
                      </Text>
                      <RowBarChart
                        data={[...data.distribution].reverse().map((d) => ({
                          key: String(d.stars),
                          label: `${d.stars} stars`,
                          value: d.count,
                          meta: String(d.count),
                        }))}
                      />
                    </View>
                  </View>
                )}
                <View style={styles.panel}>
                  <View style={styles.between}>
                    <View>
                      <Text style={Typography.title}>On the table</Text>
                      <Text style={styles.small}>
                        Individual dish feedback · Averages are never inferred
                        from meal ratings.
                      </Text>
                    </View>
                    {mode === "overview" && (
                      <Pressable
                        accessibilityLabel="View all dishes"
                        onPress={() => router.push("/admin/dishes" as never)}
                        style={styles.chip}
                      >
                        <ArrowUpRight size={18} color={Colors.ink} />
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.inline}>
                    <TextInput
                      accessibilityLabel="Search report dishes"
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Search dishes…"
                      style={styles.input}
                    />
                    <Pressable
                      onPress={() =>
                        setSort(
                          sort === "selections" ? "average" : "selections",
                        )
                      }
                      style={styles.chip}
                    >
                      <Text style={styles.small}>
                        {sort === "selections"
                          ? "Most selected"
                          : "Highest rated (5+)"}
                      </Text>
                    </Pressable>
                  </View>
                  <ScrollView horizontal>
                    <View style={{ minWidth: 650, flex: 1 }}>
                      <View style={styles.tableRow}>
                        <Text style={[styles.tableHeading, { flex: 3 }]}>
                          DISH
                        </Text>
                        {["SELECTED", "STUDENTS", "RATING", "RESPONSES"].map(
                          (t) => (
                            <Text key={t} style={styles.tableHeading}>
                              {t}
                            </Text>
                          ),
                        )}
                      </View>
                      {dishes
                        .slice(0, mode === "overview" ? 8 : 100)
                        .map((d, i) => (
                          <View
                            key={`${d.location_id}-${d.nutrislice_id}-${i}`}
                            style={styles.tableRow}
                          >
                            <Text
                              style={[
                                styles.cell,
                                { flex: 3, fontFamily: Fonts.outfit.medium },
                              ]}
                            >
                              {d.name}
                            </Text>
                            <Text style={styles.cell}>{d.selections}</Text>
                            <Text style={styles.cell}>{d.users}</Text>
                            <Text style={styles.cell}>
                              {d.average == null
                                ? "Unrated"
                                : `${Number(d.average).toFixed(1)} ★`}
                            </Text>
                            <Text style={styles.cell}>
                              {d.ratings}
                              {d.ratings > 0 && d.ratings < 5
                                ? " · small sample"
                                : ""}
                            </Text>
                          </View>
                        ))}
                    </View>
                  </ScrollView>
                  {!dishes.length && (
                    <Text style={styles.subtitle}>
                      Your dining story starts with the first logged meal.
                    </Text>
                  )}
                </View>
                {mode === "overview" && (
                  <View style={styles.grid}>
                    <Metric
                      label="Extras on the plate"
                      value={percent(data.with_extras, data.guided)}
                      hint="Guided meals with a non-main extra"
                    />
                    <Metric
                      label="Guided journeys completed"
                      value={percent(
                        data.journeys_completed,
                        data.journeys_started,
                      )}
                      hint={`${data.journeys_completed} confirmations / ${data.journeys_started} starts`}
                    />
                  </View>
                )}
              </>
            )}
            <Text style={styles.small}>
              Campus timezone: America/New_York · Refreshed{" "}
              {report.dataUpdatedAt
                ? new Date(report.dataUpdatedAt).toLocaleTimeString()
                : "Not refreshed"}{" "}
              · Voluntary app feedback represents participating diners.
            </Text>
          </Enter>
        )
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}
export const styles = StyleSheet.create({
  page: {
    padding: 32,
    gap: 24,
    maxWidth: 1400,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 60,
  },
  eyebrow: {
    ...Typography.monoLabel,
    color: Colors.scarlet,
    fontSize: 10,
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  title: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -1.1,
    color: Colors.ink,
  },
  subtitle: { ...Typography.body, color: Colors.textMuted, marginTop: 8 },
  small: { ...Typography.caption, color: Colors.textMuted },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    borderRadius: 12,
    backgroundColor: "white",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  metric: {
    flex: 1,
    minWidth: 210,
    backgroundColor: "white",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 22,
    gap: 14,
  },
  value: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 38,
    letterSpacing: -1.2,
    color: Colors.ink,
  },
  panel: {
    backgroundColor: "white",
    padding: 24,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    gap: 18,
  },
  columns: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  input: {
    ...Typography.body,
    padding: 12,
    minHeight: 46,
    flex: 1,
    minWidth: 180,
    borderRadius: 12,
    backgroundColor: Colors.cream,
    color: Colors.ink,
  },
  tableRow: {
    flexDirection: "row",
    gap: 15,
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
    alignItems: "center",
  },
  tableHeading: {
    ...Typography.monoLabel,
    fontSize: 10,
    flex: 1,
    minWidth: 80,
  },
  cell: { ...Typography.bodyS, color: Colors.inkSoft, flex: 1, minWidth: 80 },
  error: { ...Typography.bodyS, color: Colors.scarlet },
});
