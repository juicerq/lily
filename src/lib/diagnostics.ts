import { WEEKDAYS } from "@/lib/format";
import type { Journal } from "@/lib/journal";
import { inWindow, nextChange, nextWindowStart, statusOf } from "@/lib/rules";
import type { Snapshot } from "@/lib/snapshot";
import { dayKey, localIso, slotOf, weekday } from "@/lib/time";
import { usedSeconds } from "@/lib/usage";

export interface AlarmInfo {
  name: string;
  scheduledTime: number;
  periodInMinutes?: number;
}

function stamp(timestamp: number | null) {
  return timestamp === null ? null : localIso(timestamp);
}

export function clockInfo(now: Date) {
  return {
    local: localIso(now.getTime()),
    utc: now.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offsetMinutes: -now.getTimezoneOffset(),
    day: dayKey(now),
    weekday: WEEKDAYS[weekday(now)],
    slot: slotOf(now),
  };
}

export function diagnose(input: { snapshot: Snapshot; journal: Journal; alarms: AlarmInfo[]; version: string; now: Date }) {
  const { snapshot, now } = input;
  const { schedule } = snapshot.config;

  return {
    version: input.version,
    clock: clockInfo(now),
    schedule: {
      inWindow: inWindow(schedule, now),
      nextChange: stamp(nextChange(schedule, now)),
      nextWindowStart: stamp(nextWindowStart(schedule, now)),
      days: schedule,
    },
    usage: {
      day: snapshot.usage.day,
      escapes: snapshot.usage.escapes,
      allow: Object.fromEntries(Object.entries(snapshot.usage.allow).map(([domain, until]) => [domain, localIso(until)])),
    },
    session: snapshot.session && { domain: snapshot.session.domain, start: localIso(snapshot.session.start) },
    sites: snapshot.config.sites.map((site) => {
      const status = statusOf(snapshot, site, now);

      return {
        ...site,
        usedSeconds: Math.round(usedSeconds({ usage: snapshot.usage, session: snapshot.session, domain: site.domain, now })),
        status:
          status.kind === "blocked"
            ? { kind: status.kind, reason: status.reason, until: stamp(status.until) }
            : { kind: status.kind, remaining: status.remaining, allowedUntil: stamp(status.allowedUntil) },
      };
    }),
    alarms: input.alarms.map((alarm) => ({ ...alarm, scheduledTime: localIso(alarm.scheduledTime) })),
    issues: snapshot.issues,
    journal: input.journal.entries.map((entry) => ({
      ...entry,
      at: localIso(entry.at),
      ...("until" in entry && { until: stamp(entry.until) }),
    })),
  };
}
