import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import GuidedMenu from "@/components/meals/GuidedMenu";
import FoodDashboard from "@/components/admin/FoodDashboard";
import { StarRating } from "@/components/ui/StarRating";
import { FoodIcon } from "@/components/ui/FoodIcon";
import { COURSES, campusPeriod } from "@/lib/mealFlow";
import { getTodayString } from "@/store/logStore";
import type { ParsedMenuItem } from "@/lib/nutrislice";
import type { FoodReport } from "@/lib/foodAdmin";
import { Colors, Typography } from "@/constants/theme";

const sample: ParsedMenuItem[] = [
  ["Grilled lemon chicken", "main", 420],
  ["Roasted vegetable pasta", "main", 380],
  ["Crispy tofu bowl", "main", 360],
  ["Tomato soup", "appetizer", 120],
  ["Garden salad", "side", 90],
  ["Steamed rice", "side", 170],
  ["Chocolate brownie", "dessert", 230],
].map(([name, course, calories], i) => ({
  nutrislice_id: 9000 + i,
  location_id: "dining-location",
  served_date: getTodayString(),
  meal_period: campusPeriod(),
  station_id: i < 3 ? 1 : 2,
  station_name: i < 3 ? "The Main Line" : "Fresh & Seasonal",
  dish_name: String(name),
  course: course as ParsedMenuItem["course"],
  description: "Illustrative menu item for design review.",
  ingredients: null,
  serving_size: "1 serving",
  calories: Number(calories),
  protein_g: i < 3 ? 24 : 4,
  carbs_g: 30,
  fat_g: 12,
  dietary_tags: i === 2 || i === 4 ? ["Vegan"] : [],
  allergens: [],
  synced_at: new Date().toISOString(),
}));
const report: FoodReport = {
  meals: 428,
  ratings: 186,
  average: 4.2,
  eligible: 420,
  guided: 310,
  with_extras: 245,
  distribution: [
    { stars: 1, count: 4 },
    { stars: 2, count: 7 },
    { stars: 3, count: 18 },
    { stars: 4, count: 76 },
    { stars: 5, count: 81 },
  ],
  dishes: sample
    .slice(0, 3)
    .map((i, n) => ({
      location_id: i.location_id,
      nutrislice_id: i.nutrislice_id,
      name: i.dish_name,
      selections: 120 - n * 21,
      users: 60 - n * 8,
      ratings: 40 - n * 9,
      average: 4.6 - n * 0.2,
      one: 1,
      two: 2,
      three: 3,
      four: 10,
      five: 24,
    })),
  trend: [
    { day: "2026-09-01", meals: 84, ratings: 32, average: 4.1 },
    { day: "2026-09-02", meals: 101, ratings: 48, average: 4.3 },
    { day: "2026-09-03", meals: 115, ratings: 50, average: 4.2 },
    { day: "2026-09-04", meals: 128, ratings: 56, average: 4.2 },
  ],
  reminders: { delivered: 156, pending: 28 },
  reminder_opens: 92,
  tracking_since: "2026-09-01",
  journeys_started: 360,
  journeys_completed: 310,
};
export default function DesignPreview() {
  const [tab, setTab] = useState("Menu");
  const [stars, setStars] = useState(0);
  if (!__DEV__)
    return (
      <View style={{ padding: 30 }}>
        <Text style={Typography.body}>
          Design previews are available in development builds.
        </Text>
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: Colors.cream }}>
      <View
        style={{
          padding: 14,
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        }}
      >
        <Text style={Typography.caption}>
          DESIGN PREVIEW · Illustrative data · No meals or ratings are saved
        </Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {["Menu", "Dashboard", "Components"].map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={{
                padding: 12,
                borderRadius: 12,
                backgroundColor: tab === t ? Colors.canvas : "white",
              }}
            >
              <Text style={Typography.body}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {tab === "Menu" ? (
        <GuidedMenu previewItems={sample} />
      ) : tab === "Dashboard" ? (
        <FoodDashboard preview={report} />
      ) : (
        <View style={{ padding: 30, gap: 25 }}>
          <Text style={Typography.displayM}>Food & feedback</Text>
          <View style={{ flexDirection: "row", gap: 15, flexWrap: "wrap" }}>
            {COURSES.map((c) => (
              <View key={c} style={{ gap: 8, alignItems: "center" }}>
                <FoodIcon course={c} tile />
                <Text style={Typography.caption}>{c}</Text>
              </View>
            ))}
          </View>
          <StarRating value={stars} onChange={setStars} />
        </View>
      )}
    </View>
  );
}
