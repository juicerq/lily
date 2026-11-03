import * as v from "valibot";
import { browser } from "wxt/browser";

import type { Config } from "@/lib/config";
import { SLOTS_PER_DAY, dayKey, slotOf, slotStart, weekday } from "@/lib/time";

export const HISTORY_DAYS = 84;

const PREFIX = "day:";

const Seconds = v.pipe(v.number(), v.minValue(0));
const Domain = v.pipe(v.string(), v.minLength(1));

export const BlockReason = v.picklist(["always", "window", "quota"]);

export const DayRecord = v.object({
  day: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  slots: v.record(v.string(), v.pipe(v.array(Seconds), v.length(SLOTS_PER_DAY))),
  other: v.record(v.string(), Seconds),
  tries: v.array(v.object({ domain: Domain, at: v.number(), reason: BlockReason })),
  escapes: v.array(v.object({ domain: Domain, at: v.number() })),
  quotas: v.record(v.string(), v.nullable(v.number())),
  schedule: v.pipe(v.string(), v.regex(/^[01]{48}$/)),
});

export type DayRecord = v.InferOutput<typeof DayRecord>;

function keyOf(day: string) {
  return `${PREFIX}${day}`;
}

function parseDay(raw: unknown, key: string) {
  if (raw === undefined) {
    return null;
  }

  const parsed = v.safeParse(DayRecord, raw);

  if (!parsed.success) {
    console.error(`lily: ${key} inválido`, v.summarize(parsed.issues));
    return null;
  }

  return parsed.output;
}

export async function loadDays(days: string[]) {
  const keys = days.map(keyOf);
  const stored = await browser.storage.local.get(keys);

  return keys.map((key) => parseDay(stored[key], key));
}

function withRules(record: DayRecord, config: Config, now: Date): DayRecord {
  const quotas = Object.fromEntries(config.sites.map((site) => [site.domain, site.quotaMinutes]));
  const schedule = config.schedule[weekday(now)];

  if (schedule === undefined) {
    throw new Error(`lily: horário ausente para o dia ${weekday(now)}`);
  }

  return { ...record, quotas: { ...record.quotas, ...quotas }, schedule };
}

function emptyDay(now: Date): DayRecord {
  return { day: dayKey(now), slots: {}, other: {}, tries: [], escapes: [], quotas: {}, schedule: "0".repeat(SLOTS_PER_DAY) };
}

async function prune(now: Date) {
  const cutoff = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - HISTORY_DAYS));
  const stored = await browser.storage.local.get(null);
  const stale = Object.keys(stored).filter((key) => key.startsWith(PREFIX) && key.slice(PREFIX.length) < cutoff);

  if (stale.length) {
    await browser.storage.local.remove(stale);
  }
}

export async function updateDay(input: { now: Date; config: Config; change: (record: DayRecord) => DayRecord }) {
  const key = keyOf(dayKey(input.now));
  const [current] = await loadDays([dayKey(input.now)]);
  const next = withRules(input.change(current ?? emptyDay(input.now)), input.config, input.now);

  if (current && JSON.stringify(current) === JSON.stringify(next)) {
    return;
  }

  await browser.storage.local.set({ [key]: next });

  if (!current) {
    await prune(input.now);
  }
}

export function addTime(record: DayRecord, input: { domain: string; listed: boolean; from: number; to: number }): DayRecord {
  if (input.to <= input.from) {
    return record;
  }

  if (!input.listed) {
    const seconds = (record.other[input.domain] ?? 0) + (input.to - input.from) / 1000;

    return { ...record, other: { ...record.other, [input.domain]: seconds } };
  }

  const slots = [...(record.slots[input.domain] ?? Array.from({ length: SLOTS_PER_DAY }, () => 0))];
  let at = input.from;

  while (at < input.to) {
    const date = new Date(at);
    const end = Math.min(input.to, slotStart(date, 1).getTime());
    const slot = slotOf(date);

    slots[slot] = (slots[slot] ?? 0) + (end - at) / 1000;
    at = end;
  }

  return { ...record, slots: { ...record.slots, [input.domain]: slots } };
}
