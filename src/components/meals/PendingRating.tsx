import React from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Star, ArrowRight } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { MotionPressable } from "@/components/ui/Motion";
import { Colors, Typography } from "@/constants/theme";
import { mealFeatures } from "@/lib/mealFeatures";

export function PendingRating() {
  const userId = useAuthStore((s) => s.user?.id);
  const router = useRouter();
  const query = useQuery({
    queryKey: ["pending-ratings", userId],
    enabled: !!userId && mealFeatures.ratings,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pending_meal_rating");
      if (error) throw error;
      return data as { id: string; title: string } | null;
    },
  });
  if (!query.data || !mealFeatures.ratings) return null;
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={`Rate ${query.data.title}`}
      onPress={() =>
        router.push({
          pathname: "/rate",
          params: { meal: query.data!.id },
        } as never)
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 18,
        borderRadius: 20,
        backgroundColor: Colors.surfaceWarm,
        marginBottom: 20,
      }}
    >
      <Star size={24} color={Colors.scarlet} />
      <View style={{ flex: 1 }}>
        <Text style={Typography.title}>How was your meal?</Text>
        <Text style={[Typography.caption, { color: Colors.textMuted }]}>
          {query.data.title} · Leave a quick rating
        </Text>
      </View>
      <ArrowRight size={18} color={Colors.scarlet} />
    </MotionPressable>
  );
}
