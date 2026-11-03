import type { Config } from "@/lib/config";
import type { DayRecord } from "@/lib/history";
import { matchSite } from "@/lib/rules";
import { SLOTS_PER_DAY, slotOf } from "@/lib/time";

export interface SiteWeek {
  domain: string;
  quota: number | null;
  followSchedule: boolean;
  days: number[];
  exhausted: boolean[];
  escaped: boolean[];
  tries: number[];
  outSlots: number[];
  total: number;
}

export interface WeekSummary {
  days: (DayRecord | null)[];
  sites: SiteWeek[];
  total: number;
  tries: number;
  escapes: number;
}

const PEAK_SLOTS = 4;
const WORKDAYS = [0, 1, 2, 3, 4];

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function domainsOf(days: (DayRecord | null)[], config: Config) {
  const recorded = days.flatMap((record) => {
    if (!record) {
      return [];
    }

    return [...Object.keys(record.slots), ...record.tries.map((entry) => entry.domain), ...record.escapes.map((entry) => entry.domain)];
  });

  return [...new Set([...config.sites.map((site) => site.domain), ...recorded])];
}

function knownQuota(days: (DayRecord | null)[], domain: string) {
  const quotas = days.flatMap((record) => (record && domain in record.quotas ? [record.quotas[domain] ?? null] : []));

  return quotas.at(-1) ?? null;
}

function outSlot(slots: number[], quota: number) {
  let used = 0;

  for (const [slot, seconds] of slots.entries()) {
    used += seconds;

    if (used >= quota * 60 - 1) {
      return slot;
    }
  }

  return null;
}

function siteWeek(days: (DayRecord | null)[], config: Config, domain: string): SiteWeek {
  const rule = config.sites.find((site) => site.domain === domain);
  const perDay = days.map((record) => {
    const slots = record?.slots[domain] ?? [];
    const quota = record?.quotas[domain] ?? null;
    const out = quota ? outSlot(slots, quota) : null;

    return {
      seconds: sum(slots),
      out,
      escaped: !!record?.escapes.some((entry) => entry.domain === domain),
      tries: record?.tries.filter((entry) => entry.domain === domain).length ?? 0,
    };
  });
  const seconds = perDay.map((day) => day.seconds);

  return {
    domain,
    quota: rule ? rule.quotaMinutes : knownQuota(days, domain),
    followSchedule: rule?.followSchedule ?? true,
    days: seconds,
    exhausted: perDay.map((day) => day.out !== null),
    escaped: perDay.map((day) => day.escaped),
    tries: perDay.map((day) => day.tries),
    outSlots: perDay.flatMap((day) => (day.out === null ? [] : [day.out])),
    total: sum(seconds),
  };
}

export function summarize(days: (DayRecord | null)[], config: Config): WeekSummary {
  const sites = domainsOf(days, config)
    .map((domain) => siteWeek(days, config, domain))
    .sort((a, b) => b.total - a.total || sum(b.tries) - sum(a.tries));

  return {
    days,
    sites,
    total: sum(sites.map((site) => site.total)),
    tries: sum(sites.map((site) => sum(site.tries))),
    escapes: sum(days.map((record) => record?.escapes.length ?? 0)),
  };
}

export function slotSeconds(record: DayRecord | null, slot: number, domain: string | null) {
  if (!record) {
    return 0;
  }

  if (domain !== null) {
    return record.slots[domain]?.[slot] ?? 0;
  }

  return sum(Object.values(record.slots).map((slots) => slots[slot] ?? 0));
}

export function slotTries(record: DayRecord | null, slot: number, domain: string | null) {
  return (record?.tries ?? []).filter((entry) => slotOf(new Date(entry.at)) === slot && (domain === null || entry.domain === domain));
}

export function unpaintedPeak(week: WeekSummary, schedule: Config["schedule"]) {
  const free = (slot: number) => WORKDAYS.every((day) => schedule[day]?.[slot] !== "1");
  const windows = Array.from({ length: SLOTS_PER_DAY - PEAK_SLOTS + 1 }, (_, from) => {
    const slots = Array.from({ length: PEAK_SLOTS }, (_, offset) => from + offset);

    if (!slots.every(free)) {
      return { from, seconds: 0 };
    }

    const seconds = sum(WORKDAYS.flatMap((day) => slots.map((slot) => slotSeconds(week.days[day] ?? null, slot, null))));

    return { from, seconds };
  });
  const best = windows.sort((a, b) => b.seconds - a.seconds).at(0);

  if (!best || best.seconds < 30 * 60) {
    return null;
  }

  return { from: best.from, to: best.from + PEAK_SLOTS, seconds: best.seconds };
}

export function paintWorkdays(schedule: Config["schedule"], from: number, to: number) {
  return schedule.map((row, day) => {
    if (!WORKDAYS.includes(day)) {
      return row;
    }

    return `${row.slice(0, from)}${"1".repeat(to - from)}${row.slice(to)}`;
  });
}

export function triesPeak(week: WeekSummary) {
  const site = week.sites.toSorted((a, b) => sum(b.tries) - sum(a.tries)).at(0);
  const count = site ? sum(site.tries) : 0;

  if (!site || count < 3) {
    return null;
  }

  const hours = Array.from({ length: 24 }, () => 0);

  for (const record of week.days) {
    for (const entry of record?.tries ?? []) {
      if (entry.domain === site.domain) {
        const hour = new Date(entry.at).getHours();

        hours[hour] = (hours[hour] ?? 0) + 1;
      }
    }
  }

  const peak = Math.max(...hours);

  return { domain: site.domain, count, hour: hours.indexOf(peak), atHour: peak };
}

export function quotaPeak(week: WeekSummary) {
  const site = week.sites.toSorted((a, b) => b.outSlots.length - a.outSlots.length).at(0);

  if (!site || site.outSlots.length < 3) {
    return null;
  }

  const slot = Math.round(sum(site.outSlots) / site.outSlots.length);

  return { domain: site.domain, quota: site.quota, days: site.outSlots.length, slot };
}

export function outside(days: (DayRecord | null)[], config: Config, limit: number) {
  const totals = new Map<string, number>();

  for (const record of days) {
    for (const [host, seconds] of Object.entries(record?.other ?? {})) {
      totals.set(host, (totals.get(host) ?? 0) + seconds);
    }
  }

  return [...totals]
    .filter(([host, seconds]) => seconds >= 60 && !matchSite(config.sites, host))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([domain, seconds]) => ({ domain, seconds }));
}
