import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { csvCell } from "./mealFlow";

export interface FoodDish {
  location_id: string | null;
  nutrislice_id: number | null;
  name: string;
  selections: number;
  users: number;
  ratings: number;
  average: number | null;
  one: number;
  two: number;
  three: number;
  four: number;
  five: number;
}
export interface FoodReport {
  meals: number;
  ratings: number;
  average: number | null;
  eligible: number;
  guided: number;
  with_extras: number;
  distribution: { stars: number; count: number }[];
  dishes: FoodDish[];
  trend: {
    day: string;
    meals: number;
    ratings: number;
    average: number | null;
  }[];
  reminders: Record<string, number>;
  reminder_opens: number;
  tracking_since: string | null;
  journeys_started: number;
  journeys_completed: number;
}
export interface FeedbackRow {
  meal_log_id: string;
  stars: number;
  comment: string;
  tags: string[];
  created_at: string;
  reviewed_at: string | null;
  title: string;
  meal_period: string;
  logged_date: string;
  dishes: { name: string; stars: number }[] | null;
}
export async function foodRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export function useFoodReport(
  days: number,
  period: string | null = null,
  enabled = true,
) {
  return useQuery({
    enabled,
    queryKey: ["admin", "food", days, period],
    queryFn: () =>
      foodRpc<FoodReport>("admin_food_report", {
        p_days: days,
        p_period: period,
      }),
    staleTime: 60_000,
  });
}
export function useFeedback(
  days: number,
  stars: number | null,
  search: string,
  offset: number,
  reviewed: boolean | null,
) {
  return useQuery({
    queryKey: ["admin", "feedback", days, stars, search, offset, reviewed],
    queryFn: () =>
      foodRpc<{ rows: FeedbackRow[]; total: number }>("admin_feedback", {
        p_days: days,
        p_stars: stars,
        p_search: search || null,
        p_offset: offset,
        p_reviewed: reviewed,
      }),
    staleTime: 30_000,
  });
}
export const percent = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 100)}%` : "—";
export async function exportFoodCsv(
  filename: string,
  rows: Record<string, unknown>[],
) {
  if (typeof document === "undefined")
    throw new Error("Open the web dashboard to download CSV reports.");
  if (!rows.length) throw new Error("There are no rows to export.");
  await foodRpc("admin_food_update", { p_action: "export", p_id: filename });
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.map(csvCell).join(","),
    ...rows.map((row) => keys.map((k) => csvCell(row[k])).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
