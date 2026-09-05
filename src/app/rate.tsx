import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCheck, Star } from "lucide-react-native";
import { useAuthStore } from "@/store/authStore";
import { getMealForRating, reminderAction, saveRating } from "@/lib/ratings";
import { Colors, Fonts, Typography } from "@/constants/theme";
import { Button } from "@/components/ui";
import { StarRating } from "@/components/ui/StarRating";
import { Enter } from "@/components/ui/Motion";
import { mealFeatures } from "@/lib/mealFeatures";

export default function RateMeal() {
  const { meal } = useLocalSearchParams<{ meal: string }>();
  const userId = useAuthStore((s) => s.user?.id);
  const router = useRouter();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["rating-meal", userId, meal],
    queryFn: () => getMealForRating(meal),
    enabled: !!userId && !!meal && mealFeatures.ratings,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [dishes, setDishes] = useState<Record<string, number>>({});
  const [showDishes, setShowDishes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  // Populate editable feedback once the asynchronous server snapshot arrives.
  useEffect(() => {
    if (query.data) {
      const r = query.data.meal_ratings;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate the editable form from its server snapshot.
      setStars(r?.stars ?? 0);
      setComment(r?.comment ?? "");
      setTags(r?.tags ?? []);
      setDishes(
        Object.fromEntries(
          query.data.dish_ratings.map((d) => [d.meal_log_item_id, d.stars]),
        ),
      );
    }
  }, [query.data]);
  if (!userId) return <Redirect href="/(auth)/sign-in" />;
  if (!mealFeatures.ratings) return <Redirect href="/(tabs)" />;
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await saveRating(meal, stars, comment, tags, dishes);
      await client.invalidateQueries({ queryKey: ["rating-meal"] });
      await client.invalidateQueries({ queryKey: ["pending-ratings"] });
      await client.invalidateQueries({ queryKey: ["admin"] });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function dismiss(action: "dismiss" | "snooze") {
    setBusy(true);
    try {
      await reminderAction(meal, action);
      await client.invalidateQueries({ queryKey: ["pending-ratings"] });
      router.replace("/(tabs)" as never);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityLabel="Back to meals"
          onPress={() => router.replace("/(tabs)" as never)}
          style={s.row}
        >
          <ArrowLeft size={20} color={Colors.ink} />
          <Text style={s.muted}>Your meals</Text>
        </Pressable>
        {done ? (
          <Enter style={s.card}>
            <CheckCheck size={42} color={Colors.scarlet} />
            <Text style={s.title}>A little feedback. A better next meal.</Text>
            <Text style={s.muted}>
              Thanks for sharing your experience with the dining team.
            </Text>
            <Button
              label="Back to my day"
              onPress={() => router.replace("/(tabs)" as never)}
            />
          </Enter>
        ) : (
          <>
            <View style={s.row}>
              <Star size={20} color={Colors.scarlet} />
              <Text style={s.eyebrow}>YOUR VOICE AT THE TABLE</Text>
            </View>
            <Text style={s.title}>How was your meal?</Text>
            <Text style={s.muted}>
              Honest feedback helps make the next one better.
            </Text>
            {query.isLoading ? (
              <ActivityIndicator color={Colors.scarlet} />
            ) : query.isError ? (
              <View style={s.card}>
                <Text style={s.error}>{query.error.message}</Text>
                <Button
                  label="Try again"
                  onPress={() => void query.refetch()}
                />
              </View>
            ) : (
              query.data && (
                <>
                  <View style={s.card}>
                    <Text style={s.eyebrow}>
                      {query.data.meal_period} · {query.data.logged_date}
                    </Text>
                    <Text style={Typography.displayM}>{query.data.title}</Text>
                    <Text style={s.muted}>
                      {query.data.meal_log_items.map((i) => i.name).join(" · ")}
                    </Text>
                    <StarRating
                      value={stars}
                      onChange={setStars}
                      label="Overall meal rating"
                    />
                  </View>
                  <View style={s.card}>
                    <Text style={Typography.title}>Anything to share?</Text>
                    <Text style={s.muted}>
                      Optional · Visible to the authorized dining team.
                    </Text>
                    <TextInput
                      accessibilityLabel="Meal feedback"
                      placeholder="What stood out? What could be better?"
                      placeholderTextColor={Colors.textFaint}
                      multiline
                      maxLength={500}
                      value={comment}
                      onChangeText={setComment}
                      style={s.input}
                    />
                    <Text style={s.muted}>{comment.length}/500</Text>
                    <View style={s.tags}>
                      {[
                        "Taste",
                        "Freshness",
                        "Temperature",
                        "Portion size",
                      ].map((t) => (
                        <Pressable
                          key={t}
                          accessibilityState={{ selected: tags.includes(t) }}
                          onPress={() =>
                            setTags(
                              tags.includes(t)
                                ? tags.filter((x) => x !== t)
                                : [...tags, t],
                            )
                          }
                          style={[
                            s.tag,
                            tags.includes(t) && {
                              borderColor: Colors.scarlet,
                              backgroundColor: "#FCF3F1",
                            },
                          ]}
                        >
                          <Text style={s.muted}>{t}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <Button
                    label={
                      showDishes
                        ? "Hide individual dish ratings"
                        : "Rate individual dishes (optional)"
                    }
                    variant="ghost"
                    onPress={() => setShowDishes(!showDishes)}
                  />
                  {showDishes &&
                    query.data.meal_log_items.map((i) => (
                      <View key={i.id} style={s.card}>
                        <Text style={Typography.title}>{i.name}</Text>
                        <StarRating
                          label={i.name}
                          value={dishes[i.id] ?? 0}
                          onChange={(v) => setDishes({ ...dishes, [i.id]: v })}
                        />
                      </View>
                    ))}
                  {!!error && (
                    <Text accessibilityRole="alert" style={s.error}>
                      {error}
                    </Text>
                  )}
                  <Button
                    label={
                      query.data.meal_ratings
                        ? "Update my rating"
                        : "Share my rating"
                    }
                    loading={busy}
                    disabled={!stars}
                    onPress={() => void submit()}
                  />
                  {!query.data.meal_ratings && (
                    <>
                      <Button
                        label="Remind me later"
                        variant="secondary"
                        disabled={busy}
                        onPress={() => void dismiss("snooze")}
                      />
                      <Button
                        label="I didn’t eat this meal"
                        variant="ghost"
                        disabled={busy}
                        onPress={() => void dismiss("dismiss")}
                      />
                    </>
                  )}
                </>
              )
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.cream },
  page: {
    padding: 24,
    gap: 20,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    paddingBottom: 50,
  },
  row: { flexDirection: "row", gap: 10, alignItems: "center", minHeight: 44 },
  title: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 36,
    lineHeight: 42,
    color: Colors.ink,
    letterSpacing: -1,
  },
  muted: { ...Typography.bodyS, color: Colors.textMuted },
  card: {
    padding: 24,
    gap: 16,
    borderRadius: 24,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  eyebrow: { ...Typography.monoLabel, color: Colors.scarlet },
  input: {
    minHeight: 110,
    textAlignVertical: "top",
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.cream,
    ...Typography.body,
    color: Colors.ink,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    borderRadius: 14,
  },
  error: { ...Typography.bodyS, color: Colors.scarlet },
});
