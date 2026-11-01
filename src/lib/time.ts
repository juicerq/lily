export const SLOTS_PER_DAY = 48;

export const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const;

export function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

export function weekday(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function slotOf(date: Date) {
  return date.getHours() * 2 + (date.getMinutes() >= 30 ? 1 : 0);
}

export function slotStart(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, (slotOf(date) + offset) * 30);
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function nextMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}
