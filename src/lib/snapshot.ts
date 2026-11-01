import { browser } from "wxt/browser";

import { parseConfig } from "@/lib/config";
import { parseSession, parseUsage } from "@/lib/usage";

export async function loadSnapshot(now: Date) {
  const [local, session] = await Promise.all([
    browser.storage.local.get(["config", "usage"]),
    browser.storage.session.get("session"),
  ]);

  return {
    config: parseConfig(local.config),
    usage: parseUsage(local.usage, now),
    session: parseSession(session.session),
  };
}

export type Snapshot = Awaited<ReturnType<typeof loadSnapshot>>;
