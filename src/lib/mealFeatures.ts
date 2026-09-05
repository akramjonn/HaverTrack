// Build-time rollout switches. Disabling reminders on the server is immediate.
export const mealFeatures = {
  guided: process.env.EXPO_PUBLIC_GUIDED_MEALS !== "false",
  ratings: process.env.EXPO_PUBLIC_MEAL_RATINGS !== "false",
};
