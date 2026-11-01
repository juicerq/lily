import type { SiteRule } from "@/lib/config";
import { statusOf, type SiteStatus } from "@/lib/rules";
import type { Snapshot } from "@/lib/snapshot";
import { usedSeconds } from "@/lib/usage";

export interface SiteRow {
  site: SiteRule;
  used: number;
  status: SiteStatus;
}

function urgency(row: SiteRow) {
  if (row.status.kind === "blocked") {
    return -1;
  }

  return row.status.remaining ?? Number.POSITIVE_INFINITY;
}

export function siteRows(snapshot: Snapshot, now: Date): SiteRow[] {
  const rows = snapshot.config.sites.map((site) => ({
    site,
    used: usedSeconds({ usage: snapshot.usage, session: snapshot.session, domain: site.domain, now }),
    status: statusOf(snapshot, site, now),
  }));

  return rows.sort((a, b) => urgency(a) - urgency(b));
}
