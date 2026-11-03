<script lang="ts">
  import { i18n } from "#i18n";
  import { untrack } from "svelte";
  import { browser } from "wxt/browser";

  import Dots from "@/components/Dots.svelte";
  import Logo from "@/components/Logo.svelte";
  import Switch from "@/components/Switch.svelte";
  import { saveConfig, type SiteRule } from "@/lib/config";
  import { clockInfo, diagnose } from "@/lib/diagnostics";
  import { WEEKDAYS, formatClock, formatDuration, formatMinutes } from "@/lib/format";
  import { describeEntry, loadJournal, type Journal } from "@/lib/journal";
  import { inWindow, nextWindowStart, normalizeDomain } from "@/lib/rules";
  import { loadSnapshot, type Snapshot } from "@/lib/snapshot";
  import { SLOTS_PER_DAY, slotLabel, slotOf, weekday } from "@/lib/time";
  import { usedSeconds } from "@/lib/usage";

  let { initial, initialJournal }: { initial: Snapshot; initialJournal: Journal } = $props();

  const QUOTA_STEPS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, null] as const;
  const HOURS = ["00", "03", "06", "09", "12", "15", "18", "21"];

  let snapshot = $state(untrack(() => initial));
  let journal = $state(untrack(() => initialJournal));
  let copied = $state(false);
  let now = $state(new Date());
  let saveError = $state("");
  let painting: boolean | null = $state(null);
  let focused = $state({ day: 0, slot: 0 });
  let draft = $state("");
  let draftError = $state("");
  let confirming: string | null = $state(null);

  const config = $derived(snapshot.config);
  const today = $derived(weekday(now));
  const dayProgress = $derived((now.getHours() * 60 + now.getMinutes()) / (24 * 60));
  const nowSlot = $derived(slotOf(now));
  const nowLabel = $derived(formatClock(now.getTime(), now));
  const weekSlots = $derived(config.schedule.reduce((sum, day) => sum + countSlots(day), 0));
  const windowStart = $derived(nextWindowStart(config.schedule, now));
  const blockedNow = $derived(inWindow(config.schedule, now));
  const clock = $derived(clockInfo(now));
  const recent = $derived(journal.entries.slice(-12).reverse());

  $effect(() => {
    const timer = setInterval(() => {
      now = new Date();
    }, 15_000);

    return () => clearInterval(timer);
  });

  $effect(() => {
    const reload = async (changes: Record<string, unknown>) => {
      if ("journal" in changes) {
        journal = await loadJournal();
      }

      const fresh = await loadSnapshot(new Date());
      const external = "config" in changes && painting === null && JSON.stringify(fresh.config) !== JSON.stringify(snapshot.config);
      const nextConfig = external ? fresh.config : snapshot.config;

      snapshot = { ...fresh, config: nextConfig };
    };

    browser.storage.onChanged.addListener(reload);

    return () => browser.storage.onChanged.removeListener(reload);
  });

  function formatOffset(minutes: number) {
    const sign = minutes < 0 ? "−" : "+";
    const hours = String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0");
    const rest = String(Math.abs(minutes) % 60).padStart(2, "0");

    return `UTC${sign}${hours}:${rest}`;
  }

  async function copyReport() {
    const alarms = await browser.alarms.getAll();
    const report = diagnose({ snapshot, journal, alarms, version: browser.runtime.getManifest().version, now: new Date() });

    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  function countSlots(day: string) {
    return day.split("").filter((slot) => slot === "1").length;
  }

  function formatSlots(count: number) {
    return formatDuration(count * 30 * 60);
  }

  async function commit() {
    await saveConfig(snapshot.config).then(
      () => {
        saveError = "";
      },
      (error: unknown) => {
        console.error("lily:", error);
        saveError = i18n.t("saveError");
      },
    );
  }

  function isPainted(day: number, slot: number) {
    return config.schedule[day]?.[slot] === "1";
  }

  function paint(day: number, slot: number, value: boolean) {
    const row = config.schedule[day];

    if (row === undefined || isPainted(day, slot) === value) {
      return;
    }

    config.schedule[day] = `${row.slice(0, slot)}${value ? "1" : "0"}${row.slice(slot + 1)}`;
  }

  function cellAt(event: PointerEvent) {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cell = target instanceof HTMLElement ? target.closest<HTMLElement>("[data-slot]") : null;

    if (!cell) {
      return null;
    }

    return { day: Number(cell.dataset.day), slot: Number(cell.dataset.slot) };
  }

  function startPaint(event: PointerEvent, day: number, slot: number) {
    event.preventDefault();
    painting = !isPainted(day, slot);
    focused = { day, slot };
    paint(day, slot, painting);
  }

  function movePaint(event: PointerEvent) {
    if (painting === null) {
      return;
    }

    const cell = cellAt(event);

    if (!cell) {
      return;
    }

    paint(cell.day, cell.slot, painting);
  }

  function endPaint() {
    if (painting === null) {
      return;
    }

    painting = null;
    commit();
  }

  function onGridKey(event: KeyboardEvent) {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
    };
    const move = moves[event.key];

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      paint(focused.day, focused.slot, !isPainted(focused.day, focused.slot));
      commit();
      return;
    }

    if (!move) {
      return;
    }

    event.preventDefault();

    const origin = isPainted(focused.day, focused.slot);
    const day = Math.min(6, Math.max(0, focused.day + move[0]));
    const slot = Math.min(SLOTS_PER_DAY - 1, Math.max(0, focused.slot + move[1]));

    focused = { day, slot };

    if (event.shiftKey) {
      paint(day, slot, origin);
      commit();
    }

    document.querySelector<HTMLElement>(`[data-day="${day}"][data-slot="${slot}"]`)?.focus();
  }

  function stepQuota(site: SiteRule, direction: 1 | -1) {
    const index = QUOTA_STEPS.findIndex((step) => step === site.quotaMinutes);
    const fallback = QUOTA_STEPS.findIndex((step) => step !== null && step >= (site.quotaMinutes ?? 0));
    const from = index === -1 ? fallback : index;
    const next = QUOTA_STEPS[Math.min(QUOTA_STEPS.length - 1, Math.max(0, from + direction))];

    if (next === undefined) {
      return;
    }

    site.quotaMinutes = next;
    commit();
  }

  function addSite(event: SubmitEvent) {
    event.preventDefault();

    const domain = normalizeDomain(draft);

    if (!domain) {
      draftError = i18n.t("invalidDomain");
      return;
    }

    if (config.sites.some((site) => site.domain === domain)) {
      draftError = i18n.t("alreadyListed", [domain]);
      return;
    }

    config.sites.push({ domain, quotaMinutes: 30, followSchedule: true });
    draft = "";
    draftError = "";
    commit();
  }

  function removeSite(domain: string) {
    if (confirming !== domain) {
      confirming = domain;
      return;
    }

    snapshot.config.sites = config.sites.filter((site) => site.domain !== domain);
    confirming = null;
    commit();
  }

  function quotaHint(site: SiteRule) {
    if (site.quotaMinutes === 0) {
      return i18n.t("alwaysBlockedLower");
    }

    const used = usedSeconds({ usage: snapshot.usage, session: snapshot.session, domain: site.domain, now });

    if (site.quotaMinutes === null) {
      return i18n.t("usedUnlimited", [formatDuration(used)]);
    }

    if (used >= site.quotaMinutes * 60) {
      return i18n.t("exhaustedToday");
    }

    return i18n.t("usedOfToday", [formatDuration(used), formatMinutes(site.quotaMinutes)]);
  }

  function quotaRatio(site: SiteRule) {
    if (!site.quotaMinutes) {
      return site.quotaMinutes === 0 ? 1 : 0;
    }

    const used = usedSeconds({ usage: snapshot.usage, session: snapshot.session, domain: site.domain, now });

    return used / (site.quotaMinutes * 60);
  }
</script>

<svelte:window onpointermove={movePaint} onpointerup={endPaint} onpointercancel={endPaint} />

<main>
  <div class="top">
    <Logo />
    <a class="link" href="/week.html">{i18n.t("week")} →</a>
  </div>

  {#if saveError}<p class="save-error" role="alert">{saveError}</p>{/if}

  <div class="title">
    <h1 class="doto">{i18n.t("settings")}</h1>
    <div class="state">
      <span>{i18n.t("nowAt", [WEEKDAYS[today] ?? "", formatClock(now.getTime(), now)])}</span>
      {blockedNow ? i18n.t("blockedHours") : i18n.t("outsideHours")}
    </div>
  </div>

  <section class="card">
    <div class="label head"><span>{i18n.t("schedule")}</span><span>{i18n.t("dragPaint")}</span></div>

    <div class="grid" role="grid" aria-label={i18n.t("scheduleAria")} tabindex="-1" onkeydown={onGridKey}>
      <i class="now-band" aria-hidden="true" style:left="calc(34px + (100% - 86px) * {nowSlot / SLOTS_PER_DAY})"></i>
      <span class="now-tag doto" aria-hidden="true" style:left="calc(34px + (100% - 86px) * {dayProgress})">{nowLabel}</span>
      {#each WEEKDAYS as name, day (name)}
        <div class="day" class:today={day === today}>{name}</div>
        <div class="slots" role="row">
          {#each { length: SLOTS_PER_DAY } as _, slot (slot)}
            <button
              class="cell"
              class:now={slot === nowSlot}
              role="gridcell"
              aria-label="{name} {slotLabel(slot)}"
              aria-selected={isPainted(day, slot)}
              tabindex={focused.day === day && focused.slot === slot ? 0 : -1}
              data-day={day}
              data-slot={slot}
              onpointerdown={(event) => startPaint(event, day, slot)}
            ></button>
          {/each}
        </div>
        <div class="total">{countSlots(config.schedule[day] ?? "") ? formatSlots(countSlots(config.schedule[day] ?? "")) : "—"}</div>
      {/each}
      <div class="hours">
        {#each HOURS as hour (hour)}<span>{hour}</span>{/each}
      </div>
    </div>

    <div class="foot">
      <span>{i18n.t("blockedWeekly", [formatSlots(weekSlots)])}</span>
      <span>{i18n.t("next")} <b>{windowStart === null ? i18n.t("none") : formatClock(windowStart, now)}</b></span>
    </div>
  </section>

  <section class="card">
    <div class="label head"><span>{i18n.t("sites")}</span><span>{i18n.t("resetsMidnight")}</span></div>

    {#if config.sites.length}
      <ul class="sites">
        {#each config.sites as site (site.domain)}
          <li>
            <span class="domain">{site.domain}</span>
            <div class="use" class:out={quotaRatio(site) >= 1}>
              <span>{quotaHint(site)}</span>
              <Dots ratio={quotaRatio(site)} />
            </div>
            <div class="stepper">
              <button aria-label={i18n.t("decreaseQuota", [site.domain])} onclick={() => stepQuota(site, -1)}>−</button>
              <output class="doto">{site.quotaMinutes === null ? "∞" : formatMinutes(site.quotaMinutes)}</output>
              <button aria-label={i18n.t("increaseQuota", [site.domain])} onclick={() => stepQuota(site, 1)}>+</button>
            </div>
            <label class="follow">
              <span>{i18n.t("followHours")}</span>
              <Switch
                checked={site.followSchedule}
                label={i18n.t("followsSchedule", [site.domain])}
                onchange={(value) => {
                  site.followSchedule = value;
                  commit();
                }}
              />
            </label>
            <button class="remove" aria-label={i18n.t("removeSite", [site.domain])} class:confirm={confirming === site.domain} onblur={() => (confirming = null)} onclick={() => removeSite(site.domain)}>
              {confirming === site.domain ? i18n.t("removeConfirm") : "×"}
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">{i18n.t("emptyOptions")}</p>
    {/if}

    <form class="add" onsubmit={addSite}>
      <span>+</span>
      <input bind:value={draft} placeholder={i18n.t("addPlaceholder")} aria-label={i18n.t("addSite")} oninput={() => (draftError = "")} />
      <kbd>enter</kbd>
    </form>
    {#if draftError}<p class="error" role="alert">{draftError}</p>{/if}
  </section>

  <div class="pair">
    <section class="card option">
      <div>
        <div class="label">{i18n.t("unlock")}</div>
        <p>{i18n.t("unlockHelp")}</p>
      </div>
      <Switch
        checked={config.escape}
        label={i18n.t("unlock")}
        onchange={(value) => {
          config.escape = value;
          commit();
        }}
      />
    </section>
    <section class="card option">
      <div>
        <div class="label">{i18n.t("warning")}</div>
        <p>{i18n.t("warningHelp")}</p>
      </div>
      <Switch
        checked={config.warn}
        label={i18n.t("warningAria")}
        onchange={(value) => {
          config.warn = value;
          commit();
        }}
      />
    </section>
  </div>

  <section class="card">
    <div class="label head">
      <span>{i18n.t("diagnostics")}</span>
      <button class="copy" onclick={copyReport}>{copied ? i18n.t("copied") : i18n.t("copyReport")}</button>
    </div>
    <p class="clock">{clock.timeZone} · {formatOffset(clock.offsetMinutes)} · {i18n.t("diagnosticDay", [clock.day])}</p>
    {#if recent.length}
      <ol class="events">
        {#each recent as entry, index (`${entry.at}-${index}`)}
          <li>
            <time>{formatClock(entry.at, now)}</time>
            <span>{describeEntry(entry, now)}</span>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="empty">{i18n.t("emptyJournal")}</p>
    {/if}
  </section>
</main>

<style>
  main {
    max-width: 780px;
    margin: 0 auto;
    padding: 32px 20px 48px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }


  .link {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mute);
    text-decoration: none;
  }

  .link:hover {
    color: var(--fg);
  }

  .save-error {
    margin: 0;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--fg);
    color: var(--bg);
    font-size: 12px;
  }

  .title {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    padding: 10px 2px 4px;
  }

  h1 {
    margin: 0;
    font-size: 44px;
    line-height: 1;
  }

  .state {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-align: right;
    line-height: 1.6;
  }

  .state span {
    display: block;
    color: var(--mute);
  }

  .card {
    background: var(--panel);
    border-radius: 16px;
    padding: 16px 18px;
    box-shadow: inset 0 0 0 1px var(--line);
  }

  .head {
    display: flex;
    justify-content: space-between;
  }

  .grid {
    position: relative;
    margin-top: 10px;
    padding-top: 28px;
    display: grid;
    grid-template-columns: 34px 1fr 52px;
    row-gap: 6px;
    align-items: center;
    user-select: none;
    touch-action: none;
    outline: none;
  }

  .day {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--soft);
  }

  .day.today {
    color: var(--fg);
  }

  .slots {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(48, 1fr);
  }

  .cell {
    height: 16px;
    display: grid;
    place-items: center;
    position: relative;
    outline: none;
  }

  .cell::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--dim);
    transition:
      background-color 0.12s,
      transform 0.12s var(--ease);
  }

  .cell:nth-child(2n)::before {
    background: #1c1c1c;
  }

  .cell[aria-selected="true"]::before {
    background: var(--fg);
    transform: scale(1.15);
  }

  .cell:hover::before {
    background: var(--mute);
  }

  .cell[aria-selected="true"]:hover::before {
    background: #cfcfcf;
  }

  .cell:focus-visible::before {
    box-shadow:
      0 0 0 2px var(--panel),
      0 0 0 3px var(--fg);
  }

  .cell.now::before {
    background: #c4c4c4;
  }

  .cell.now[aria-selected="true"]::before {
    background: var(--bg);
  }

  .cell.now:hover::before {
    background: var(--soft);
  }

  .cell.now:focus-visible::before {
    box-shadow:
      0 0 0 2px var(--fg),
      0 0 0 3px var(--bg);
  }

  .now-band,
  .now-tag {
    position: absolute;
    pointer-events: none;
    transition: left 0.4s var(--ease);
  }

  .now-band {
    top: 22px;
    bottom: 14px;
    width: calc((100% - 86px) / 48);
    border-radius: 99px;
    background: var(--fg);
  }

  .now-tag {
    top: 0;
    transform: translateX(-50%);
    padding: 2px 7px;
    border-radius: 99px;
    background: var(--fg);
    color: var(--bg);
    font-size: 12px;
    line-height: 1.2;
  }

  .total {
    font-size: 11px;
    text-align: right;
    color: var(--mute);
    font-variant-numeric: tabular-nums;
  }

  .hours {
    grid-column: 2;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    height: 14px;
    font-size: 10px;
    color: #4a4a4a;
  }

  .foot {
    display: flex;
    justify-content: space-between;
    margin-top: 14px;
    font-size: 11px;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .foot b {
    color: var(--fg);
    font-weight: 400;
  }

  .sites {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
  }

  .sites li {
    display: grid;
    grid-template-columns: 1fr 170px 120px auto 28px;
    align-items: center;
    gap: 16px;
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }

  .sites li:first-child {
    border-top: 0;
  }

  .domain {
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .use {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 10px;
    text-transform: uppercase;
    color: var(--mute);
  }

  .use.out {
    color: var(--fg);
  }

  .stepper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-radius: 99px;
    box-shadow: inset 0 0 0 1px var(--dim);
    height: 32px;
    padding: 0 4px;
  }

  .stepper button {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    color: var(--soft);
    font-size: 14px;
    line-height: 1;
    transition:
      background-color 0.12s,
      color 0.12s;
  }

  .stepper button:hover {
    background: #1c1c1c;
    color: var(--fg);
  }

  .stepper output {
    font-size: 16px;
  }

  .follow {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mute);
  }

  .remove {
    height: 28px;
    border-radius: 99px;
    color: var(--mute);
    font-size: 14px;
    transition:
      color 0.12s,
      background-color 0.12s;
  }

  .remove:hover {
    color: var(--fg);
  }

  .remove.confirm {
    font-size: 10px;
    text-transform: uppercase;
    background: var(--fg);
    color: var(--bg);
    padding: 0 10px;
    white-space: nowrap;
  }

  .empty {
    margin: 12px 0 4px;
    font-size: 12px;
    color: var(--soft);
  }

  .add {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--mute);
  }

  .add input {
    flex: 1;
    background: none;
    border: 0;
    color: var(--fg);
    font: inherit;
    outline: none;
  }

  .add input::placeholder {
    color: #4a4a4a;
  }

  .add kbd {
    font: inherit;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px var(--dim);
  }

  .error {
    margin: 8px 0 0 22px;
    font-size: 11px;
    color: var(--fg);
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .option {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .option p {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--soft);
    line-height: 1.5;
  }

  .copy {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mute);
    transition: color 0.12s;
  }

  .copy:hover {
    color: var(--fg);
  }

  .clock {
    margin: 10px 0 0;
    font-size: 11px;
    color: var(--soft);
  }

  .events {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
  }

  .events li {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 12px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
    font-size: 11px;
    color: var(--soft);
  }

  .events time {
    color: var(--mute);
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 640px) {
    .sites li {
      grid-template-columns: 1fr auto;
    }

    .pair {
      grid-template-columns: 1fr;
    }
  }
</style>
