import React from "react";
import { View } from "react-native";
import {
  UtensilsCrossed,
  Soup,
  Salad,
  CupSoda,
  CakeSlice,
  CookingPot,
  Wheat,
} from "lucide-react-native";
import type { Course } from "@/lib/mealFlow";
import { Colors } from "@/constants/theme";

const icons = {
  main: UtensilsCrossed,
  appetizer: Soup,
  side: Salad,
  drink: CupSoda,
  dessert: CakeSlice,
  condiment: CookingPot,
  other: Wheat,
};
const backgrounds = {
  main: "#F6E4E5",
  appetizer: "#FBEED4",
  side: "#E6EFDF",
  drink: "#E2EDF1",
  dessert: "#F1E6EF",
  condiment: "#EEE8DE",
  other: "#EDE8E0",
};
export function FoodIcon({
  course,
  size = 24,
  tile = false,
}: {
  course: Course;
  size?: number;
  tile?: boolean;
}) {
  const Icon = icons[course];
  const icon = <Icon size={size} strokeWidth={1.7} color={Colors.inkSoft} />;
  return tile ? (
    <View
      style={{
        width: size * 2.4,
        height: size * 2.4,
        borderRadius: 20,
        backgroundColor: backgrounds[course],
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon}
    </View>
  ) : (
    icon
  );
}
