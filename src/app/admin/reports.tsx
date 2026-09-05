import React, { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { styles as s, ReportWindow } from "@/components/admin/FoodDashboard";
import { useFoodReport, exportFoodCsv } from "@/lib/foodAdmin";
import { useAdminAudit } from "@/lib/admin";
import { Button } from "@/components/ui";
import { Typography } from "@/constants/theme";
export default function Reports() {
  const [days, setDays] = useState(30);
  const [error, setError] = useState("");
  const q = useFoodReport(days);
  const audit = useAdminAudit(50);
  async function download(kind: "dishes" | "trend") {
    try {
      const rows = kind === "dishes" ? q.data?.dishes : q.data?.trend;
      await exportFoodCsv(
        `${kind}-${days}d.csv`,
        (rows ?? []).map((r) => ({ ...r })),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.eyebrow}>CLEAR NUMBERS. ACCOUNTABLE ACCESS.</Text>
      <Text style={s.title}>Reports & audit.</Text>
      <ReportWindow days={days} setDays={setDays} />
      <View style={s.panel}>
        <Text style={Typography.title}>Take the insight with you.</Text>
        <Text style={s.small}>
          Exports contain the selected meal cohort. Dish reports include up to
          the 100 most selected dishes, with response counts. No student
          identities are exported.
        </Text>
        <View style={s.inline}>
          <Button
            label="Download dish report"
            disabled={!q.data}
            onPress={() => void download("dishes")}
          />
          <Button
            label="Download daily trends"
            variant="secondary"
            disabled={!q.data}
            onPress={() => void download("trend")}
          />
        </View>
      </View>
      <View style={s.panel}>
        <Text style={Typography.title}>What these numbers mean</Text>
        {[
          "One confirmed plate counts as one meal; each food is a dish selection.",
          "Meal satisfaction and explicit dish ratings are separate averages. Missing ratings are never zero stars.",
          "Rating response uses eligible meals in the selected campus-date cohort.",
          "Dish leaderboards require five ratings before ranking by satisfaction.",
          "Active students means users logging meals, not all app opens.",
          "Raw journey events are kept for 90 days. Meal and rating history follows account deletion.",
        ].map((t) => (
          <Text key={t} style={s.small}>
            {t}
          </Text>
        ))}
        <Text style={s.small}>
          Earliest retained journey event:{" "}
          {q.data?.tracking_since ?? "No events yet"}
        </Text>
      </View>
      <View style={s.panel}>
        <Text style={Typography.title}>Recent administrative activity</Text>
        {audit.isError ? (
          <Text style={s.error}>{audit.error.message}</Text>
        ) : (
          audit.data?.map((a) => (
            <View key={a.id} style={s.tableRow}>
              <Text style={[s.cell, { flex: 2 }]}>{a.action}</Text>
              <Text style={s.cell}>{a.admin_email ?? "Administrator"}</Text>
              <Text style={s.cell}>
                {new Date(a.created_at).toLocaleString()}
              </Text>
            </View>
          ))
        )}
        {!audit.data?.length && !audit.isLoading && (
          <Text style={s.small}>No recent audit events.</Text>
        )}
      </View>
      {!!error && <Text style={s.error}>{error}</Text>}
    </ScrollView>
  );
}
