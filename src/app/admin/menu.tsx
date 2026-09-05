import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { foodRpc } from "@/lib/foodAdmin";
import { COURSES, COURSE_LABELS, classifyDish } from "@/lib/mealFlow";
import type { ParsedMenuItem } from "@/lib/nutrislice";
import { getTodayString } from "@/store/logStore";
import { styles as s } from "@/components/admin/FoodDashboard";
import { FoodIcon } from "@/components/ui/FoodIcon";
import { Button } from "@/components/ui";
import { Colors, Typography } from "@/constants/theme";
export default function MenuManagement() {
  const [date, setDate] = useState(getTodayString());
  const [search, setSearch] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const client = useQueryClient();
  const router = useRouter();
  const q = useQuery({
    queryKey: ["admin", "menu", date],
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
    queryFn: async () => {
      const [menu, cats] = await Promise.all([
        supabase
          .from("menu_items")
          .select("*")
          .eq("served_date", date)
          .order("meal_period")
          .order("station_name"),
        supabase.from("dish_categories").select("*"),
      ]);
      if (menu.error) throw menu.error;
      if (cats.error) throw cats.error;
      return (menu.data as ParsedMenuItem[]).map((i) => ({
        ...i,
        course: cats.data?.find(
          (c) =>
            c.location_id === i.location_id &&
            c.nutrislice_id === i.nutrislice_id,
        )?.course,
      }));
    },
  });
  async function update(i: ParsedMenuItem, action: string, value: string) {
    setBusy(i.id!);
    try {
      await foodRpc("admin_food_update", {
        p_action: action,
        p_id: i.id,
        p_value: value,
        p_location: i.location_id,
        p_dish: i.nutrislice_id,
      });
      await client.invalidateQueries({ queryKey: ["admin", "menu"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const rows = (q.data ?? []).filter(
    (i) =>
      i.dish_name.toLowerCase().includes(search.toLowerCase()) &&
      (!reviewOnly || !i.course),
  );
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.eyebrow}>THOUGHTFULLY ORGANIZED</Text>
      <Text style={s.title}>A menu that makes sense.</Text>
      <Text style={s.subtitle}>
        Review suggested categories and manage published availability. Overrides
        survive the next source refresh.
      </Text>
      <View style={s.inline}>
        <TextInput
          accessibilityLabel="Service date YYYY-MM-DD"
          value={date}
          onChangeText={setDate}
          style={[s.input, { maxWidth: 190 }]}
        />
        <TextInput
          accessibilityLabel="Search menu management"
          placeholder="Search dishes…"
          value={search}
          onChangeText={setSearch}
          style={s.input}
        />
        <Button
          label={reviewOnly ? "Show all" : "Needs category review"}
          variant="secondary"
          onPress={() => setReviewOnly(!reviewOnly)}
        />
        <Button
          label="Source health"
          variant="ghost"
          onPress={() => router.push("/admin/content" as never)}
        />
      </View>
      {q.isLoading ? (
        <ActivityIndicator color={Colors.scarlet} />
      ) : q.isError ? (
        <Text style={s.error}>{q.error.message}</Text>
      ) : (
        <>
          <Text style={s.small}>
            {rows.length} servings · Suggestions need staff verification
          </Text>
          {rows.map((i) => (
            <View key={i.id} style={s.panel}>
              <View style={s.between}>
                <View style={s.inline}>
                  <FoodIcon course={classifyDish(i).course} tile />
                  <View>
                    <Text style={Typography.title}>{i.dish_name}</Text>
                    <Text style={s.small}>
                      {i.meal_period} · {i.station_name}
                    </Text>
                    <Text style={s.small}>
                      {i.course
                        ? "Staff reviewed"
                        : "Suggested category · needs review"}
                    </Text>
                  </View>
                </View>
                <Button
                  label={
                    i.availability === "unavailable"
                      ? "Mark published"
                      : "Mark unavailable"
                  }
                  variant="secondary"
                  loading={busy === i.id}
                  onPress={() =>
                    void update(
                      i,
                      "availability",
                      i.availability === "unavailable"
                        ? "published"
                        : "unavailable",
                    )
                  }
                />
              </View>
              <View style={s.inline}>
                {COURSES.map((c) => (
                  <Pressable
                    key={c}
                    disabled={busy === i.id}
                    accessibilityState={{
                      selected: classifyDish(i).course === c,
                    }}
                    onPress={() => void update(i, "category", c)}
                    style={[
                      s.chip,
                      classifyDish(i).course === c && s.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        s.small,
                        classifyDish(i).course === c && { color: "white" },
                      ]}
                    >
                      {COURSE_LABELS[c]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          {!rows.length && (
            <View style={s.panel}>
              <Text style={Typography.title}>No matching menu items.</Text>
              <Text style={s.small}>
                Choose a published service date or check the source health page.
              </Text>
            </View>
          )}
        </>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
    </ScrollView>
  );
}
