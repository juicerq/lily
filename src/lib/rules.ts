import type { Config, SiteRule } from "@/lib/config";
import type { Snapshot } from "@/lib/snapshot";
import { SLOTS_PER_DAY, nextMidnight, slotOf, slotStart, weekday } from "@/lib/time";
import { MAX_ESCAPES, usedSeconds } from "@/lib/usage";

export type BlockReason = "always" | "window" | "quota";

export type SiteStatus =
  | { kind: "free"; remaining: number | null; allowedUntil: number | null }
  | { kind: "blocked"; reason: BlockReason; until: number | null };

type Schedule = Config["schedule"];

const WEEK_SLOTS = 7 * SLOTS_PER_DAY;

function painted(schedule: Schedule, now: Date, offset: number) {
  const start = slotStart(now, offset);

  return schedule[weekday(start)]?.[slotOf(start)] === "1";
}

export function inWindow(schedule: Schedule, now: Date) {
  return painted(schedule, now, 0);
}

export function nextChange(schedule: Schedule, now: Date) {
  const current = painted(schedule, now, 0);

  for (let offset = 1; offset <= WEEK_SLOTS; offset++) {
    if (painted(schedule, now, offset) !== current) {
      return slotStart(now, offset).getTime();
    }
  }

  return null;
}

export function nextWindowStart(schedule: Schedule, now: Date) {
  for (let offset = 1; offset <= WEEK_SLOTS; offset++) {
    if (painted(schedule, now, offset) && !painted(schedule, now, offset - 1)) {
      return slotStart(now, offset).getTime();
    }
  }

  return null;
}

export function siteStatus(input: {
  site: SiteRule;
  schedule: Schedule;
  used: number;
  allowUntil: number | undefined;
  now: Date;
}): SiteStatus {
  const { site, now } = input;
  const quota = site.quotaMinutes === null ? null : site.quotaMinutes * 60;
  const remaining = quota === null ? null : Math.max(0, quota - input.used);

  if (site.followSchedule && inWindow(input.schedule, now)) {
    const windowEnd = nextChange(input.schedule, now);

    if (quota === 0 || windowEnd === null) {
      return { kind: "blocked", reason: "window", until: null };
    }

    const until = remaining === 0 ? Math.max(windowEnd, nextMidnight(now).getTime()) : windowEnd;

    return { kind: "blocked", reason: "window", until };
  }

  const allowedUntil = input.allowUntil !== undefined && input.allowUntil > now.getTime() ? input.allowUntil : null;

  if (allowedUntil !== null) {
    return { kind: "free", remaining, allowedUntil };
  }

  if (quota === 0) {
    return { kind: "blocked", reason: "always", until: null };
  }

  if (remaining === 0) {
    return { kind: "blocked", reason: "quota", until: nextMidnight(now).getTime() };
  }

  return { kind: "free", remaining, allowedUntil: null };
}

export function statusOf(snapshot: Snapshot, site: SiteRule, now: Date) {
  return siteStatus({
    site,
    schedule: snapshot.config.schedule,
    used: usedSeconds({ usage: snapshot.usage, session: snapshot.session, domain: site.domain, now }),
    allowUntil: snapshot.usage.allow[site.domain],
    now,
  });
}

export function canEscape(snapshot: Snapshot, status: SiteStatus) {
  if (!snapshot.config.escape || status.kind !== "blocked" || status.reason === "window") {
    return false;
  }

  return snapshot.usage.escapes < MAX_ESCAPES;
}

export function hostOf(url: string) {
  if (!URL.canParse(url)) {
    return null;
  }

  const parsed = new URL(url);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed.hostname.toLowerCase();
}

export function matchSite(sites: SiteRule[], host: string) {
  const matches = sites.filter((site) => host === site.domain || host.endsWith(`.${site.domain}`));

  return matches.sort((a, b) => b.domain.length - a.domain.length).at(0);
}

export function normalizeDomain(input: string) {
  const trimmed = input.trim().toLowerCase();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  const host = hostOf(withScheme)?.replace(/^www\./, "");

  if (!host?.includes(".")) {
    return null;
  }

  return host;
}
