import type { MealLog } from '@/store/logStore';

export interface DayTotals {
  date: string; // YYYY-MM-DD
  label: string; // single-letter weekday for the chart axis
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  logged: boolean;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/** Totals for each of the last `days` days, oldest first, including empty days. */
export function dailyTotals(logs: MealLog[], days: number, today = new Date()): DayTotals[] {
  const byDate = new Map<string, MealLog[]>();
  for (const log of logs) {
    const bucket = byDate.get(log.logged_date);
    if (bucket) bucket.push(log);
    else byDate.set(log.logged_date, [log]);
  }

  const series: DayTotals[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    const dateStr = toDateString(date);
    const dayLogs = byDate.get(dateStr) ?? [];

    series.push({
      date: dateStr,
      label: DAY_LETTERS[date.getDay()],
      calories: dayLogs.reduce((sum, l) => sum + l.total_calories, 0),
      protein_g: dayLogs.reduce((sum, l) => sum + l.total_protein_g, 0),
      carbs_g: dayLogs.reduce((sum, l) => sum + l.total_carbs_g, 0),
      fat_g: dayLogs.reduce((sum, l) => sum + l.total_fat_g, 0),
      logged: dayLogs.length > 0,
    });
  }

  return series;
}

/**
 * Average over days that were actually logged. Including untouched days would
 * report a deficit the student never ate.
 */
export function averageCalories(series: DayTotals[]) {
  const logged = series.filter((d) => d.logged);
  if (!logged.length) return 0;
  return Math.round(logged.reduce((sum, d) => sum + d.calories, 0) / logged.length);
}

/**
 * Consecutive logged days ending today or yesterday — today counts as unbroken
 * until the day is over.
 */
export function loggingStreak(logs: MealLog[], today = new Date()) {
  const loggedDates = new Set(logs.map((l) => l.logged_date));
  if (!loggedDates.size) return { current: 0, best: 0 };

  let current = 0;
  const cursor = new Date(today);
  if (!loggedDates.has(toDateString(cursor))) cursor.setDate(cursor.getDate() - 1);

  while (loggedDates.has(toDateString(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const sorted = [...loggedDates].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = new Date(`${sorted[i - 1]}T00:00:00`);
    previous.setDate(previous.getDate() + 1);
    run = toDateString(previous) === sorted[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }

  return { current, best: Math.max(best, current) };
}

/** Share of calories from each macro, using 4/4/9 kcal per gram. */
export function macroSplit(series: DayTotals[]) {
  const protein = series.reduce((sum, d) => sum + d.protein_g, 0) * 4;
  const carbs = series.reduce((sum, d) => sum + d.carbs_g, 0) * 4;
  const fat = series.reduce((sum, d) => sum + d.fat_g, 0) * 9;
  const total = protein + carbs + fat;

  if (!total) return { protein: 0, carbs: 0, fat: 0 };

  return {
    protein: Math.round((protein / total) * 100),
    carbs: Math.round((carbs / total) * 100),
    fat: Math.round((fat / total) * 100),
  };
}
