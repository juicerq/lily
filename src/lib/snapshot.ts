import { browser } from "wxt/browser";

import { parseConfig } from "@/lib/config";
import { parseSession, parseUsage } from "@/lib/usage";

export type StoreKey = "config" | "usage" | "session";

export interface StoreIssue {
  key: StoreKey;
  summary: string;
}

export async function loadSnapshot(now: Date) {
  const [local, stored] = await Promise.all([
    browser.storage.local.get(["config", "usage"]),
    browser.storage.session.get("session"),
  ]);

  const config = parseConfig(local.config);
  const usage = parseUsage(local.usage, now);
  const session = parseSession(stored.session);

  const issues = [
    { key: "config" as const, summary: config.issue },
    { key: "usage" as const, summary: usage.issue },
    { key: "session" as const, summary: session.issue },
  ].filter((issue): issue is StoreIssue => issue.summary !== null);

  for (const issue of issues) {
    console.error(`lily: ${issue.key} inválido`, issue.summary);
  }

  return { config: config.value, usage: usage.value, session: session.value, issues };
}

export type Snapshot = Awaited<ReturnType<typeof loadSnapshot>>;
