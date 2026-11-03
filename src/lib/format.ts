import { i18n } from "#i18n";

import { addDays, dayKey, nextMidnight } from "@/lib/time";

const locale = i18n.t("locale");

export const WEEKDAYS = Array.from({ length: 7 }, (_, day) => formatWeekday(new Date(2024, 0, 1 + day)));

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
  if (minutes === 0) {
    return "0m";
  }

  return formatDuration(minutes * 60);
}

export function formatClock(timestamp: number, now: Date) {
  const date = new Date(timestamp);
  const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  if (dayKey(date) === dayKey(now) || timestamp === nextMidnight(now).getTime()) {
    return clock;
  }

  return `${formatWeekday(date)} ${clock}`;
}

export function formatDay(date: Date) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
}

export function formatWeek(monday: Date) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).formatRange(monday, addDays(monday, 6));
}

export function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date).replace(/\.$/, "");
}
