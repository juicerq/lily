import * as v from "valibot";
import { browser } from "wxt/browser";

import { formatClock } from "@/lib/format";
import { statusOf, type SiteStatus } from "@/lib/rules";
import type { Snapshot } from "@/lib/snapshot";
import { dayKey } from "@/lib/time";

export const JOURNAL_LIMIT = 300;

const At = v.number();
const Domain = v.pipe(v.string(), v.minLength(1));

const Entry = v.variant("kind", [
  v.object({ kind: v.literal("day"), at: At, from: v.nullable(v.string()), to: v.string() }),
  v.object({
    kind: v.literal("blocked"),
    at: At,
    domain: Domain,
    reason: v.picklist(["always", "window", "quota"]),
    until: v.nullable(v.number()),
  }),
  v.object({ kind: v.literal("free"), at: At, domain: Domain }),
  v.object({ kind: v.literal("escape"), at: At, domain: Domain, until: v.number() }),
  v.object({ kind: v.literal("invalid"), at: At, key: v.picklist(["config", "usage", "session"]), summary: v.string() }),
]);

const Journal = v.object({
  day: v.nullable(v.string()),
  sites: v.record(v.string(), v.string()),
  stores: v.record(v.string(), v.string()),
  entries: v.array(Entry),
});

export type JournalEntry = v.InferOutput<typeof Entry>;
export type Journal = v.InferOutput<typeof Journal>;

const emptyJournal: Journal = { day: null, sites: {}, stores: {}, entries: [] };

export async function loadJournal() {
  const { journal } = await browser.storage.local.get("journal");

  if (journal === undefined) {
    return emptyJournal;
  }

  const parsed = v.safeParse(Journal, journal);

  if (!parsed.success) {
    console.error("lily: journal inválido", v.summarize(parsed.issues));
    return emptyJournal;
  }

  return parsed.output;
}

export async function saveJournal(journal: Journal) {
  await browser.storage.local.set({ journal });
}

export function append(journal: Journal, entries: JournalEntry[]): Journal {
  return { ...journal, entries: [...journal.entries, ...entries].slice(-JOURNAL_LIMIT) };
}

function signature(status: SiteStatus) {
  if (status.kind === "free") {
    return "free";
  }

  return `blocked:${status.reason}:${status.until ?? "never"}`;
}

function siteEntry(domain: string, status: SiteStatus, at: number): JournalEntry {
  if (status.kind === "free") {
    return { kind: "free", at, domain };
  }

  return { kind: "blocked", at, domain, reason: status.reason, until: status.until };
}

export function observe(journal: Journal, snapshot: Snapshot, now: Date) {
  const at = now.getTime();
  const day = dayKey(now);
  const entries: JournalEntry[] = [];

  if (journal.day !== day) {
    entries.push({ kind: "day", at, from: journal.day, to: day });
  }

  const sites = Object.fromEntries(
    snapshot.config.sites.map((site) => {
      const status = statusOf(snapshot, site, now);
      const current = signature(status);

      if (journal.sites[site.domain] !== current) {
        entries.push(siteEntry(site.domain, status, at));
      }

      return [site.domain, current];
    }),
  );

  const stores = Object.fromEntries(snapshot.issues.map((issue) => [issue.key, issue.summary]));

  for (const issue of snapshot.issues) {
    if (journal.stores[issue.key] !== issue.summary) {
      entries.push({ kind: "invalid", at, key: issue.key, summary: issue.summary });
    }
  }

  const state = { day, sites, stores };
  const changed = entries.length > 0 || JSON.stringify(state) !== JSON.stringify({ day: journal.day, sites: journal.sites, stores: journal.stores });

  if (!changed) {
    return null;
  }

  return append({ ...journal, ...state }, entries);
}

const reasonLabels = { always: "cota 0", window: "horário", quota: "cota esgotada" };

export function describeEntry(entry: JournalEntry, now: Date) {
  switch (entry.kind) {
    case "day":
      return entry.from === null ? `dia ${entry.to} · início do registro` : `virada ${entry.from} → ${entry.to} · cota e liberações zeradas`;
    case "blocked": {
      const until = entry.until === null ? "sem fim" : `até ${formatClock(entry.until, now)}`;
      return `${entry.domain} bloqueado · ${reasonLabels[entry.reason]} · ${until}`;
    }
    case "free":
      return `${entry.domain} liberado`;
    case "escape":
      return `${entry.domain} liberado 5 min · até ${formatClock(entry.until, now)}`;
    case "invalid":
      return `storage.${entry.key} inválido · valor padrão aplicado · ${entry.summary}`;
    default: {
      const exhaustive: never = entry;
      return exhaustive;
    }
  }
}
