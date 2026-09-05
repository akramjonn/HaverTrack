import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { styles as s, ReportWindow } from "@/components/admin/FoodDashboard";
import { useFeedback, foodRpc, exportFoodCsv } from "@/lib/foodAdmin";
import { Colors, Typography } from "@/constants/theme";
import { Button } from "@/components/ui";
export default function Ratings() {
  const [days, setDays] = useState(30);
  const [stars, setStars] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [offset, setOffset] = useState(0);
  const [reviewed, setReviewed] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQueryText(search);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useFeedback(days, stars, queryText, offset, reviewed);
  const client = useQueryClient();
  async function review(id: string, value: boolean) {
    setBusy(id);
    try {
      await foodRpc("admin_food_update", {
        p_action: "review",
        p_id: id,
        p_value: value ? "reviewed" : "open",
      });
      await client.invalidateQueries({ queryKey: ["admin", "feedback"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function download() {
    try {
      await exportFoodCsv(
        "feedback-current-page.csv",
        (query.data?.rows ?? []).map((r) => ({
          meal: r.title,
          date: r.logged_date,
          stars: r.stars,
          comment: r.comment,
          tags: r.tags.join(", "),
          reviewed: !!r.reviewed_at,
        })),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.eyebrow}>LISTENING TO YOUR DINERS</Text>
      <Text style={s.title}>Every opinion matters.</Text>
      <Text style={s.subtitle}>
        Meal ratings and optional dish feedback. Student identities are not
        included in this feed.
      </Text>
      <View style={s.between}>
        <ReportWindow
          days={days}
          setDays={(d) => {
            setDays(d);
            setOffset(0);
          }}
        />
        <Button
          label="Export current page"
          variant="secondary"
          onPress={() => void download()}
        />
      </View>
      <TextInput
        accessibilityLabel="Search feedback"
        value={search}
        onChangeText={setSearch}
        placeholder="Search meal names or comments…"
        style={s.input}
      />
      <View style={s.inline}>
        {[null, 5, 4, 3, 2, 1].map((v) => (
          <Pressable
            key={String(v)}
            style={[s.chip, stars === v && s.chipActive]}
            onPress={() => {
              setStars(v);
              setOffset(0);
            }}
          >
            <Text style={[s.small, stars === v && { color: "white" }]}>
              {v ? `${v} stars` : "All ratings"}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={s.chip}
          onPress={() => {
            setReviewed(
              reviewed === null ? false : reviewed === false ? true : null,
            );
            setOffset(0);
          }}
        >
          <Text style={s.small}>
            {reviewed === null
              ? "All statuses"
              : reviewed
                ? "Reviewed"
                : "Needs review"}
          </Text>
        </Pressable>
      </View>
      {query.isLoading ? (
        <ActivityIndicator color={Colors.scarlet} />
      ) : query.isError ? (
        <Text style={s.error}>{query.error.message}</Text>
      ) : (
        <>
          <Text style={s.small}>
            {query.data?.total ?? 0} matching responses
          </Text>
          {query.data?.rows.map((r) => (
            <View key={r.meal_log_id} style={s.panel}>
              <View style={s.between}>
                <View>
                  <Text style={Typography.title}>{r.title}</Text>
                  <Text style={s.small}>
                    {r.logged_date} · {r.meal_period}
                  </Text>
                </View>
                <Text style={[Typography.title, { color: Colors.amber }]}>
                  {"★".repeat(r.stars)}
                  {"☆".repeat(5 - r.stars)} · {r.stars}/5
                </Text>
              </View>
              {!!r.comment && <Text style={Typography.body}>{r.comment}</Text>}
              <Text style={s.small}>
                {r.tags.join(" · ") || "No feedback tags"}
              </Text>
              {r.dishes?.map((d, i) => (
                <Text key={i} style={s.small}>
                  {d.name} · {d.stars}/5
                </Text>
              ))}
              <Button
                label={r.reviewed_at ? "Reviewed · Reopen" : "Mark reviewed"}
                variant="ghost"
                loading={busy === r.meal_log_id}
                onPress={() => void review(r.meal_log_id, !r.reviewed_at)}
              />
            </View>
          ))}
          {!query.data?.rows.length && (
            <View style={s.panel}>
              <Text style={Typography.title}>Nothing here yet.</Text>
              <Text style={s.small}>
                Feedback will appear after students rate their meals. Try
                widening the filters.
              </Text>
            </View>
          )}
          <View style={s.between}>
            <Button
              label="Previous"
              variant="secondary"
              disabled={offset === 0}
              onPress={() => setOffset(Math.max(0, offset - 25))}
            />
            <Text style={s.small}>Page {offset / 25 + 1}</Text>
            <Button
              label="Next"
              variant="secondary"
              disabled={offset + 25 >= (query.data?.total ?? 0)}
              onPress={() => setOffset(offset + 25)}
            />
          </View>
        </>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
    </ScrollView>
  );
}
