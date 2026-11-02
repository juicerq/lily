import * as v from "valibot";
import { browser, type Browser } from "wxt/browser";

import { formatDuration } from "@/lib/format";
import { append, loadJournal, observe, saveJournal } from "@/lib/journal";
import { EscapeRequest, type EscapeResult } from "@/lib/messages";
import { canEscape, hostOf, matchSite, nextChange, nextWindowStart, statusOf } from "@/lib/rules";
import { loadSnapshot, type Snapshot } from "@/lib/snapshot";
import { nextMidnight } from "@/lib/time";
import { ESCAPE_SECONDS, sessionSeconds, type Session, type Usage } from "@/lib/usage";

const IDLE_SECONDS = 60;
const WARN_MS = 60_000;

let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>) {
  const run = queue.then(task);

  queue = run.catch((error) => {
    console.error("lily:", error);
  });

  return run;
}

function blockedPage(url: string) {
  return `${browser.runtime.getURL("/blocked.html")}?u=${encodeURIComponent(url)}`;
}

function blockedTarget(snapshot: Snapshot, url: string, now: Date) {
  const host = hostOf(url);

  if (!host) {
    return null;
  }

  const site = matchSite(snapshot.config.sites, host);

  if (!site || statusOf(snapshot, site, now).kind !== "blocked") {
    return null;
  }

  return blockedPage(url);
}

function flush(usage: Usage, session: Session | null, now: Date): Usage {
  if (!session) {
    return usage;
  }

  const seconds = (usage.seconds[session.domain] ?? 0) + sessionSeconds(session, now);

  return { ...usage, seconds: { ...usage.seconds, [session.domain]: seconds } };
}

async function activeTab() {
  const window = await browser.windows.getLastFocused({ populate: true });

  if (!window.focused) {
    return null;
  }

  return window.tabs?.find((tab) => tab.active) ?? null;
}

async function trackedDomain(snapshot: Snapshot, now: Date) {
  const tab = await activeTab();
  const host = tab?.url ? hostOf(tab.url) : null;

  if (!tab || !host) {
    return null;
  }

  const site = matchSite(snapshot.config.sites, host);

  if (!site || statusOf(snapshot, site, now).kind === "blocked") {
    return null;
  }

  const idle = await browser.idle.queryState(IDLE_SECONDS);

  if (idle === "locked" || (idle === "idle" && !tab.audible)) {
    return null;
  }

  return site.domain;
}

async function redirectIfBlocked(snapshot: Snapshot, tab: Browser.tabs.Tab, now: Date) {
  if (tab.id === undefined || !tab.url || tab.discarded) {
    return;
  }

  const target = blockedTarget(snapshot, tab.url, now);

  if (!target) {
    return;
  }

  await browser.tabs.update(tab.id, { url: target });
}

async function sweep(snapshot: Snapshot, now: Date) {
  const tabs = await browser.tabs.query({ url: ["http://*/*", "https://*/*"] });

  await Promise.all(tabs.map((tab) => redirectIfBlocked(snapshot, tab, now)));
}

async function setAlarm(name: string, when: number | null, now: Date) {
  if (when === null || when <= now.getTime()) {
    await browser.alarms.clear(name);
    return;
  }

  await browser.alarms.create(name, { when });
}

function quotaEnd(snapshot: Snapshot, now: Date) {
  const domain = snapshot.session?.domain;
  const site = domain ? snapshot.config.sites.find((rule) => rule.domain === domain) : undefined;

  if (!site) {
    return null;
  }

  const status = statusOf(snapshot, site, now);

  if (status.kind !== "free" || status.remaining === null || status.allowedUntil !== null) {
    return null;
  }

  return now.getTime() + status.remaining * 1000;
}

function earliestAllowEnd(usage: Usage, now: Date) {
  const pending = Object.values(usage.allow).filter((until) => until > now.getTime());

  return pending.length ? Math.min(...pending) : null;
}

async function scheduleAlarms(snapshot: Snapshot, now: Date) {
  const { config } = snapshot;
  const scheduled = config.sites.some((site) => site.followSchedule);
  const change = scheduled ? nextChange(config.schedule, now) : null;
  const midnight = nextMidnight(now).getTime();
  const windowStart = scheduled ? nextWindowStart(config.schedule, now) : null;
  const quota = quotaEnd(snapshot, now);

  await Promise.all([
    setAlarm("edge", change === null ? midnight : Math.min(change, midnight), now),
    setAlarm("edge-warn", config.warn && windowStart !== null ? windowStart - WARN_MS : null, now),
    setAlarm("quota", quota, now),
    setAlarm("quota-warn", config.warn && quota !== null ? quota - WARN_MS : null, now),
    setAlarm("allow", earliestAllowEnd(snapshot.usage, now), now),
  ]);
}

async function reconcile() {
  const now = new Date();
  const snapshot = await loadSnapshot(now);
  const settled: Snapshot = { ...snapshot, usage: flush(snapshot.usage, snapshot.session, now), session: null };
  const domain = await trackedDomain(settled, now);
  const session = domain ? { domain, start: now.getTime() } : null;

  await Promise.all([
    browser.storage.local.set({ usage: settled.usage }),
    session ? browser.storage.session.set({ session }) : browser.storage.session.remove("session"),
  ]);

  const current: Snapshot = { ...settled, session };
  const journal = observe(await loadJournal(), current, now);

  if (journal) {
    await saveJournal(journal);
  }

  await sweep(current, now);
  await scheduleAlarms(current, now);
}

async function notifyBeforeBlock(alarm: string) {
  const now = new Date();
  const snapshot = await loadSnapshot(now);
  const domain = snapshot.session?.domain;
  const site = domain ? snapshot.config.sites.find((rule) => rule.domain === domain) : undefined;

  if (!site || !snapshot.config.warn) {
    return;
  }

  const status = statusOf(snapshot, site, now);

  if (status.kind !== "free") {
    return;
  }

  if (alarm === "edge-warn" && !site.followSchedule) {
    return;
  }

  const message =
    alarm === "edge-warn"
      ? "O horário bloqueado começa em 1 minuto."
      : `A cota de hoje acaba em ${formatDuration(status.remaining ?? 0)}.`;

  await browser.notifications.create("lily-warn", {
    type: "basic",
    iconUrl: browser.runtime.getURL("/icon-96.png"),
    title: `${site.domain} bloqueia em 1 min`,
    message,
  });
}

async function grantEscape(domain: string): Promise<EscapeResult> {
  const now = new Date();
  const snapshot = await loadSnapshot(now);
  const site = snapshot.config.sites.find((rule) => rule.domain === domain);

  if (!site || !canEscape(snapshot, statusOf(snapshot, site, now))) {
    return { ok: false };
  }

  const until = now.getTime() + ESCAPE_SECONDS * 1000;
  const usage: Usage = {
    ...snapshot.usage,
    escapes: snapshot.usage.escapes + 1,
    allow: { ...snapshot.usage.allow, [domain]: until },
  };
  const journal = append(await loadJournal(), [{ kind: "escape", at: now.getTime(), domain, until }]);

  await browser.storage.local.set({ usage, journal });
  await reconcile();

  return { ok: true };
}

async function ensureTick() {
  const existing = await browser.alarms.get("tick");

  if (existing) {
    return;
  }

  await browser.alarms.create("tick", { periodInMinutes: 1 });
}

function requestReconcile() {
  void serialized(reconcile);
}

export default defineBackground({
  type: "module",
  main() {
    browser.idle.setDetectionInterval(IDLE_SECONDS);
    void ensureTick();

    browser.runtime.onStartup.addListener(requestReconcile);
    browser.runtime.onInstalled.addListener(requestReconcile);
    browser.tabs.onActivated.addListener(requestReconcile);
    browser.windows.onFocusChanged.addListener(requestReconcile);
    browser.idle.onStateChanged.addListener(requestReconcile);

    browser.tabs.onUpdated.addListener((_tabId, change) => {
      if (change.url === undefined && change.audible === undefined) {
        return;
      }

      requestReconcile();
    });

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.config) {
        return;
      }

      requestReconcile();
    });

    browser.alarms.onAlarm.addListener((alarm) => {
      void serialized(async () => {
        if (alarm.name === "edge-warn" || alarm.name === "quota-warn") {
          await notifyBeforeBlock(alarm.name);
        }

        await reconcile();
      });
    });

    browser.webNavigation.onBeforeNavigate.addListener((details) => {
      if (details.frameId !== 0) {
        return;
      }

      void serialized(async () => {
        const now = new Date();
        const target = blockedTarget(await loadSnapshot(now), details.url, now);

        if (!target) {
          return;
        }

        await browser.tabs.update(details.tabId, { url: target });
      });
    });

    browser.runtime.onMessage.addListener((message: unknown) => {
      const request = v.safeParse(EscapeRequest, message);

      if (!request.success) {
        return;
      }

      return serialized(() => grantEscape(request.output.domain));
    });

    requestReconcile();
  },
});
