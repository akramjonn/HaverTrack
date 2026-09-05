import { supabase } from "./supabase";
import { useAuthStore } from "@/store/authStore";
import { isRating, uuid } from "./mealFlow";

export async function trackMealEvent(
  event:
    | "menu_viewed"
    | "meal_flow_started"
    | "main_selected"
    | "extra_added"
    | "rating_prompt_opened",
  journey: string,
) {
  const user = useAuthStore.getState().user;
  if (!user) return;
  await supabase
    .from("meal_flow_events")
    .insert({ id: uuid(), user_id: user.id, journey_id: journey, event });
}
export interface RatingMeal {
  id: string;
  title: string;
  meal_period: string;
  logged_date: string;
  feedback_dismissed: boolean;
  meal_log_items: { id: string; name: string; course?: string }[];
  meal_ratings: { stars: number; comment: string; tags: string[] } | null;
  dish_ratings: { meal_log_item_id: string; stars: number }[];
}
export async function getMealForRating(id: string): Promise<RatingMeal> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select(
      "id,title,meal_period,logged_date,feedback_dismissed,meal_log_items(id,name,course),meal_ratings(stars,comment,tags)",
    )
    .eq("id", id)
    .single();
  if (error)
    throw new Error(
      "This meal could not be loaded. Sign in to the account that logged it and try again.",
    );
  const { data: dishes, error: dishError } = await supabase
    .from("dish_ratings")
    .select("meal_log_item_id,stars")
    .in(
      "meal_log_item_id",
      data.meal_log_items.map((i: { id: string }) => i.id),
    );
  if (dishError) throw new Error(dishError.message);
  return { ...data, dish_ratings: dishes ?? [] } as unknown as RatingMeal;
}
export async function saveRating(
  meal: string,
  stars: number,
  comment: string,
  tags: string[],
  dishes: Record<string, number>,
) {
  if (!isRating(stars) || Object.values(dishes).some((v) => !isRating(v)))
    throw new Error("Choose between 1 and 5 stars.");
  if (comment.length > 500)
    throw new Error("Keep your comment to 500 characters.");
  const { error } = await supabase.rpc("submit_meal_rating", {
    p_meal: meal,
    p_stars: stars,
    p_comment: comment.trim(),
    p_tags: tags,
    p_dishes: Object.entries(dishes).map(([id, value]) => ({
      id,
      stars: value,
    })),
  });
  if (error) throw new Error(error.message);
}
export async function reminderAction(
  meal: string,
  action: "dismiss" | "snooze" | "opened",
) {
  const { error } = await supabase.rpc("rating_reminder_action", {
    p_meal: meal,
    p_action: action,
  });
  if (error) throw new Error(error.message);
}
