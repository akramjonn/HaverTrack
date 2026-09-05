import React from "react";
import { View, Text } from "react-native";
import { Star } from "lucide-react-native";
import { MotionPressable } from "./Motion";
import { Colors, Typography } from "@/constants/theme";

export function StarRating({
  value,
  onChange,
  label = "Rating",
}: {
  value: number;
  onChange?: (value: number) => void;
  label?: string;
}) {
  return (
    <View accessibilityLabel={label} style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <MotionPressable
            key={star}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${star} out of 5 stars`}
            accessibilityState={{
              selected: value === star,
              disabled: !onChange,
            }}
            disabled={!onChange}
            onPress={() => onChange?.(star)}
            style={{
              minWidth: 44,
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Star
              size={32}
              strokeWidth={1.5}
              color={star <= value ? "#976512" : Colors.borderStrong}
              fill={star <= value ? Colors.gold : "transparent"}
            />
          </MotionPressable>
        ))}
      </View>
      <Text style={[Typography.caption, { color: Colors.textMuted }]}>
        {value
          ? `${value} out of 5 · ${["", "Poor", "Fair", "Good", "Very good", "Loved it"][value]}`
          : "Tap a star to rate"}
      </Text>
    </View>
  );
}
