import { i18n } from "#i18n";

import { addDays, dayKey, nextMidnight, weekday } from "@/lib/time";

const locale = i18n.t("locale");
const clockFormat = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short" });

export const WEEKDAYS = Array.from({ length: 7 }, (_, day) => weekdayFormat.format(new Date(2024, 0, 1 + day)).replace(/\.$/, ""));

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
  const clock = clockFormat.format(date);

  if (dayKey(date) === dayKey(now) || timestamp === nextMidnight(now).getTime()) {
    return clock;
  }

  return `${WEEKDAYS[weekday(date)]} ${clock}`;
}

export function formatDay(date: Date) {
  return dayFormat.format(date);
}

export function formatWeek(monday: Date) {
  return dayFormat.formatRange(monday, addDays(monday, 6));
}
