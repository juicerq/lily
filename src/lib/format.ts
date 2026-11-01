import { WEEKDAYS, dayKey, nextMidnight, weekday } from "@/lib/time";

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatMinutes(minutes: number) {
  return formatDuration(minutes * 60);
}

export function formatClock(timestamp: number, now: Date) {
  const date = new Date(timestamp);
  const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  if (dayKey(date) === dayKey(now) || timestamp === nextMidnight(now).getTime()) {
    return clock;
  }

  return `${WEEKDAYS[weekday(date)]} ${clock}`;
}
