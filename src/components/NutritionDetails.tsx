import React from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { ShieldCheck, Clock3, ExternalLink, Leaf } from "lucide-react-native";
import { Colors, Typography } from "@/constants/theme";
import type { ParsedMenuItem } from "@/lib/nutrislice";
import {
  canonicalDietaryTag,
  macroKeys,
  scaleMacros,
} from "@/lib/nutritionReview";

export function NutritionDetails({
  item,
}: {
  item: Pick<
    ParsedMenuItem,
    | "calories"
    | "protein_g"
    | "carbs_g"
    | "fat_g"
    | "serving_size"
    | "dietary_tags"
    | "nutrition_review"
  >;
}) {
  const review = item.nutrition_review;
  const approved = review?.status === "approved";
  const reference =
    review?.selected_candidate && review.serving_grams
      ? scaleMacros(review.selected_candidate.macros, review.serving_grams)
      : null;
  return (
    <View style={s.card}>
      <View style={s.row}>
        {approved ? (
          <ShieldCheck size={23} color="#37745A" />
        ) : (
          <Clock3 size={23} color={Colors.amber} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={Typography.bodySSemiBold}>
            {approved
              ? review.basis === "usda"
                ? "Reviewed USDA estimate"
                : "Dining values reviewed"
              : "Dining-service values · Not yet reviewed"}
          </Text>
          <Text style={s.small}>
            Per {item.serving_size || "listed serving"}
            {review?.serving_grams ? ` · ${review.serving_grams} g` : ""}
          </Text>
        </View>
      </View>
      <View style={s.row}>
        {macroKeys.map((k, i) => (
          <View key={k} style={s.tile}>
            <Text style={s.small}>
              {["Calories", "Protein", "Carbs", "Fat"][i]}
            </Text>
            <Text style={s.value}>
              {item[k] == null ? "—" : Math.round(item[k]!)}
              <Text style={s.small}>{i ? " g" : " kcal"}</Text>
            </Text>
            <View
              style={[
                s.rule,
                {
                  backgroundColor: ["#C98055", "#648877", "#CFAD58", "#9C84AB"][
                    i
                  ],
                },
              ]}
            />
          </View>
        ))}
      </View>
      {!!item.dietary_tags.length && (
        <View style={[s.row, { flexWrap: "wrap" }]}>
          {[
            ...new Set(
              item.dietary_tags
                .filter((t) => t !== "Wheat-Free")
                .map(canonicalDietaryTag),
            ),
          ].map((t) => (
            <View key={t} style={s.badge}>
              <Leaf size={12} color="#37745A" />
              <Text style={s.small}>{t}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={s.small}>
        Dietary labels come from dining services or documented review. Missing
        labels do not establish suitability; ask staff about preparation and
        cross-contact.
      </Text>
      {approved && (
        <>
          <View style={s.comparison}>
            <Text style={Typography.bodySSemiBold}>
              How these values were reviewed
            </Text>
            <View style={s.row}>
              <Text style={s.column}>Per serving</Text>
              <Text style={s.column}>Dining</Text>
              <Text style={s.column}>USDA</Text>
            </View>
            {macroKeys.map((k, i) => (
              <View key={k} style={s.row}>
                <Text style={s.column}>
                  {["Calories", "Protein", "Carbs", "Fat"][i]}
                </Text>
                <Text style={s.column}>{review.source[k] ?? "—"}</Text>
                <Text style={s.column}>
                  {reference?.[k] == null ? "—" : Math.round(reference[k]!)}
                </Text>
              </View>
            ))}
          </View>
          <Text style={s.small}>{review.review_notes}</Text>
          {!!review.dietary_evidence && (
            <Text style={s.small}>
              Dietary evidence: {review.dietary_evidence}
            </Text>
          )}
          <Text style={s.small}>
            Reviewed {new Date(review.reviewed_at!).toLocaleDateString()} ·
            Recipe and serving differences may remain.
          </Text>
          {review.selected_candidate && (
            <Pressable
              accessibilityRole="link"
              style={s.row}
              onPress={() =>
                void Linking.openURL(
                  `https://fdc.nal.usda.gov/food-details/${review.selected_candidate!.fdcId}/nutrients`,
                )
              }
            >
              <ExternalLink size={16} color={Colors.scarlet} />
              <Text style={[s.small, { flex: 1, color: Colors.scarlet }]}>
                USDA FoodData Central · {review.selected_candidate.description}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    backgroundColor: "#FAF8F2",
    gap: 16,
    marginVertical: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  small: { ...Typography.caption, color: Colors.textMuted },
  tile: { flex: 1, minWidth: 0 },
  value: { ...Typography.title, fontSize: 21, marginTop: 6 },
  rule: { height: 4, borderRadius: 3, marginTop: 10 },
  badge: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    backgroundColor: "#E7EFE7",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  comparison: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
    paddingTop: 14,
  },
  column: { ...Typography.caption, flex: 1, color: Colors.ink },
});
