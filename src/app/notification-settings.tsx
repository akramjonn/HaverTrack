import React, { useState } from "react";
import { View, Text, ScrollView, Switch } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { enableRatingNotifications } from "@/lib/notifications";
import { Button } from "@/components/ui";
import { Colors, Typography } from "@/constants/theme";
export default function NotificationSettings() {
  const userId = useAuthStore((s) => s.user?.id);
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["notification-preferences", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (!userId) return <Redirect href="/(auth)/sign-in" />;
  async function change(enabled: boolean) {
    setBusy(true);
    try {
      if (enabled) setMessage(await enableRatingNotifications());
      else {
        const { error } = await supabase
          .from("notification_preferences")
          .upsert({ user_id: userId, enabled: false });
        if (error) throw error;
        setMessage(
          "Push reminders are off. You can still rate meals from your history.",
        );
      }
      await client.invalidateQueries({
        queryKey: ["notification-preferences"],
      });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={{
        padding: 28,
        gap: 22,
        maxWidth: 620,
        width: "100%",
        alignSelf: "center",
      }}
    >
      <Text style={Typography.displayL}>A little check-in.</Text>
      <Text style={Typography.body}>
        Rate your meal when you’ve had time to enjoy it. Reminders arrive about
        an hour after you log a meal.
      </Text>
      <View
        style={{
          padding: 22,
          borderRadius: 20,
          backgroundColor: "white",
          gap: 18,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={Typography.title}>Meal rating reminders</Text>
          <Switch
            accessibilityLabel="Meal rating reminders"
            value={q.data?.enabled ?? false}
            disabled={busy || q.isLoading}
            onValueChange={(v) => void change(v)}
          />
        </View>
        <Text style={[Typography.bodyS, { color: Colors.textMuted }]}>
          Quiet hours: 10 PM–8 AM · {q.data?.timezone ?? "Your device timezone"}
          . Up to three reminders a day. One snooze per meal.
        </Text>
      </View>
      {q.isError && (
        <Text style={{ color: Colors.scarlet }}>
          Could not load preferences. Try again.
        </Text>
      )}
      <Button
        label="Enable on this device"
        loading={busy}
        onPress={() => void change(true)}
      />
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={Typography.body}>
          {message}
        </Text>
      )}
    </ScrollView>
  );
}
