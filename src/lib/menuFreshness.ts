const HAVERFORD_TIME_ZONE = "America/New_York";

/** Formats the most recent successful menu fetch in Haverford local time. */
export function formatMenuLastUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Menu update time unavailable";

  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: HAVERFORD_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);

  return `Menu last updated ${formatted}`;
}
