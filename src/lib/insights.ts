import { MealLog } from '@/store/logStore';
import { DailyGoal } from '@/store/authStore';

export interface InsightResult {
  id: string;
  type: 'pattern' | 'encouragement' | 'wellbeing_checkin';
  title: string;
  body: string;
  isDismissable?: boolean;
}

/**
 * Deterministic Rules Engine for Nutritional Patterns & Wellbeing Check-ins.
 * Pure logic — no LLMs, zero hallucinations (§4 Screen 11 & §11).
 */
export function generateInsights(
  logs: MealLog[],
  goal: DailyGoal | null,
  dismissedCheckinTimestamp?: number
): InsightResult[] {
  const insights: InsightResult[] = [];

  if (logs.length === 0) {
    return [
      {
        id: 'empty-start',
        type: 'encouragement',
        title: 'WELCOME TO SQUIRRELTRACK',
        body: 'Log your meals at the Haverford DC to see weekly nutritional trends and patterns.',
      },
    ];
  }

  // 1. Group logs by date
  const dateMap: Record<string, { calories: number; protein: number; meals: number }> = {};
  for (const log of logs) {
    if (!dateMap[log.logged_date]) {
      dateMap[log.logged_date] = { calories: 0, protein: 0, meals: 0 };
    }
    dateMap[log.logged_date].calories += log.total_calories;
    dateMap[log.logged_date].protein += log.total_protein_g;
    dateMap[log.logged_date].meals += 1;
  }

  const dateEntries = Object.entries(dateMap);

  // 2. Wellbeing Guardrail #8: Low Intake Check-in (under 1000 kcal for 5 consecutive logged days)
  if (dateEntries.length >= 5) {
    const recent5 = dateEntries.slice(-5);
    const allUnder1000 = recent5.every(([_, stats]) => stats.calories > 0 && stats.calories < 1000);

    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const canShowCheckin = !dismissedCheckinTimestamp || now - dismissedCheckinTimestamp > thirtyDays;

    if (allUnder1000 && canShowCheckin) {
      insights.push({
        id: 'wellbeing-checkin',
        type: 'wellbeing_checkin',
        title: 'CAMPUS HEALTH CHECK-IN',
        body: 'Logging has been low for a few days. If you’d like to talk to someone, Haverford CAPS and campus dietitian resources are always available.',
        isDismissable: true,
      });
    }
  }

  // 3. Day of week patterns (e.g. Sunday lightest day)
  const dayTotals: Record<number, { count: number; totalCalories: number }> = {};
  for (const [dateStr, stats] of dateEntries) {
    const date = new Date(dateStr);
    const day = date.getDay(); // 0 = Sun, 1 = Mon, ...
    if (!dayTotals[day]) dayTotals[day] = { count: 0, totalCalories: 0 };
    dayTotals[day].count += 1;
    dayTotals[day].totalCalories += stats.calories;
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let lightestDay = -1;
  let minAvgCal = Infinity;

  for (let d = 0; d < 7; d++) {
    if (dayTotals[d] && dayTotals[d].count >= 1) {
      const avg = dayTotals[d].totalCalories / dayTotals[d].count;
      if (avg < minAvgCal) {
        minAvgCal = avg;
        lightestDay = d;
      }
    }
  }

  if (lightestDay !== -1) {
    const dayName = dayNames[lightestDay];
    insights.push({
      id: 'lightest-day',
      type: 'pattern',
      title: 'WEEKLY PATTERN',
      body: `${dayName} is typically your lightest day (avg ${Math.round(minAvgCal)} kcal). Worth keeping in mind for meal planning.`,
    });
  }

  // 4. Protein consistency pattern
  const targetProtein = goal?.protein_g ?? 140;
  if (targetProtein > 0 && dateEntries.length >= 3) {
    const avgProtein =
      dateEntries.reduce((acc, [_, s]) => acc + s.protein, 0) / dateEntries.length;

    if (avgProtein >= targetProtein * 0.9) {
      insights.push({
        id: 'protein-consistent',
        type: 'encouragement',
        title: 'PROTEIN INTAKE',
        body: `You're consistently hitting your protein target (averaging ${Math.round(avgProtein)}g/day). Great job fueling campus days.`,
      });
    }
  }

  return insights;
}
