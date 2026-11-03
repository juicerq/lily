<script lang="ts">
  import { i18n } from "#i18n";
  import { untrack } from "svelte";
  import { browser } from "wxt/browser";

  import Logo from "@/components/Logo.svelte";
  import { saveConfig } from "@/lib/config";
  import { WEEKDAYS, formatDay, formatDuration, formatMinutes, formatWeek } from "@/lib/format";
  import { HISTORY_DAYS, loadDays, type DayRecord } from "@/lib/history";
  import { RECEIPT_SIZE, drawReceipt } from "@/lib/receipt";
  import { loadSnapshot, type Snapshot } from "@/lib/snapshot";
  import { SLOTS_PER_DAY, addDays, dayKey, mondayOf, slotLabel, weekday } from "@/lib/time";
  import { MAX_ESCAPES } from "@/lib/usage";
  import {
    outside,
    paintWorkdays,
    quotaPeak,
    slotSeconds,
    slotTries,
    summarize,
    triesPeak,
    unpaintedPeak,
    type SiteWeek,
  } from "@/lib/week";

  let { initial }: { initial: Snapshot } = $props();

  const HOURS = ["00", "03", "06", "09", "12", "15", "18", "21"];
  const OLDEST = -Math.floor(HISTORY_DAYS / 7) + 1;
  const reasons = { always: i18n.t("zeroQuota"), window: i18n.t("hoursReason"), quota: i18n.t("quotaReached") };

  let snapshot = $state(untrack(() => initial));
  let offset = $state(0);
  let days = $state<(DayRecord | null)[]>([]);
  let previousDays = $state<(DayRecord | null)[]>([]);
  let filter = $state<string | null>(null);
  let hovered = $state<{ day: number; slot: number } | null>(null);
  let preview = $state(false);
  let receipt = $state<{ url: string; blob: Blob; name: string } | null>(null);
  let copyState = $state(i18n.t("copyImage"));
  let loading = 0;
  let rendering = 0;

  const config = $derived(snapshot.config);
  const today = new Date();
  const monday = $derived(addDays(mondayOf(today), offset * 7));
  const current = $derived(offset === 0);
  const elapsed = $derived(current ? weekday(today) + 1 : 7);
  const label = $derived(formatWeek(monday));
  const week = $derived(summarize(days, config));
  const previous = $derived(summarize(previousDays.map((record, day) => (day < elapsed ? record : null)), config));
  const recorded = $derived(days.some((record) => record !== null));
  const previousRecorded = $derived(previousDays.some((record) => record !== null));
  const peak = $derived(unpaintedPeak(week, config.schedule));
  const tries = $derived(triesPeak(week));
  const quota = $derived(quotaPeak(week));
  const others = $derived(outside(days, config, 3));
  const hoverInfo = $derived(hovered ? describeSlot(hovered.day, hovered.slot) : null);

  $effect(() => {
    void load(monday);
  });

  $effect(() => {
    const reload = async (changes: Record<string, unknown>) => {
      if ("config" in changes) {
        snapshot = await loadSnapshot(new Date());
      }

      if (Object.keys(changes).some((key) => key.startsWith("day:"))) {
        await load(monday);
      }
    };

    browser.storage.onChanged.addListener(reload);

    return () => browser.storage.onChanged.removeListener(reload);
  });

  $effect(() => {
    if (!recorded) {
      receipt = null;
      return;
    }

    void render({ week, label: current ? i18n.t("partialWeek", [label]) : label, previousTotal: previousRecorded ? previous.total : null, name: `lily-${dayKey(monday)}.png` });
  });

  async function load(from: Date) {
    const ticket = ++loading;
    const keys = Array.from({ length: 14 }, (_, index) => dayKey(addDays(from, index - 7)));
    const records = await loadDays(keys);

    if (ticket !== loading) {
      return;
    }

    previousDays = records.slice(0, 7);
    days = records.slice(7);
  }

  async function render(input: { week: typeof week; label: string; previousTotal: number | null; name: string }) {
    const ticket = ++rendering;
    const canvas = document.createElement("canvas");

    await drawReceipt(canvas, {
      week: input.week,
      label: input.label,
      previousTotal: input.previousTotal,
      issued: formatDay(new Date()),
      escapeLimit: MAX_ESCAPES * 7,
    });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));

    if (!blob) {
      throw new Error("lily: canvas não gerou o png");
    }

    if (ticket !== rendering) {
      return;
    }

    if (receipt) {
      URL.revokeObjectURL(receipt.url);
    }

    receipt = { url: URL.createObjectURL(blob), blob, name: input.name };
  }

  async function copyReceipt() {
    if (!receipt) {
      return;
    }

    const result = await navigator.clipboard.write([new ClipboardItem({ "image/png": receipt.blob })]).then(
      () => i18n.t("imageCopied"),
      (error: unknown) => {
        console.error("lily:", error);
        return i18n.t("copyImageError");
      },
    );

    copyState = result;
    setTimeout(() => {
      copyState = i18n.t("copyImage");
    }, 2000);
  }

  function sum(values: number[]) {
    return values.reduce((total, value) => total + value, 0);
  }

  function describeSlot(day: number, slot: number) {
    const record = days[day] ?? null;
    const sites = week.sites
      .filter((site) => filter === null || site.domain === filter)
      .map((site) => ({ domain: site.domain, seconds: slotSeconds(record, slot, site.domain) }))
      .filter((site) => site.seconds >= 30);
    const blocked = slotTries(record, slot, filter);

    return { title: `${WEEKDAYS[day]} ${slotLabel(slot)}–${slotLabel(slot + 1)}`, sites, blocked };
  }

  function painted(day: number, slot: number) {
    const schedule = days[day]?.schedule ?? config.schedule[day];

    return schedule?.[slot] === "1";
  }

  function proposed(day: number, slot: number) {
    return preview && !!peak && day < 5 && slot >= peak.from && slot < peak.to;
  }

  function dotSize(day: number, slot: number) {
    const minutes = Math.min(30, slotSeconds(days[day] ?? null, slot, filter) / 60);

    return minutes >= 0.5 ? 3 + (minutes / 30) * 7 : 0;
  }

  function barScale(site: SiteWeek) {
    return Math.max((site.quota ?? 0) * 60 * 1.15, ...site.days, 1);
  }

  function quotaText(site: SiteWeek) {
    if (site.quota === 0) {
      return i18n.t("alwaysQuota");
    }

    const quotaLabel = site.quota === null ? i18n.t("unlimited") : i18n.t("quotaPerDay", [formatMinutes(site.quota)]);

    return site.followSchedule ? quotaLabel : i18n.t("noSchedule", [quotaLabel]);
  }

  function versus(site: SiteWeek) {
    if (!previousRecorded) {
      return null;
    }

    const before = previous.sites.find((entry) => entry.domain === site.domain)?.total ?? 0;
    const diff = site.total - before;

    if (Math.abs(diff) < 60) {
      return i18n.t("samePrevious");
    }

    return i18n.t("versus", [`${diff < 0 ? "−" : "+"}${formatDuration(Math.abs(diff))}`]);
  }

  function toggleFilter(domain: string) {
    filter = filter === domain ? null : domain;
  }

  async function paintPeak() {
    if (!peak) {
      return;
    }

    snapshot.config.schedule = paintWorkdays(config.schedule, peak.from, peak.to);
    preview = false;
    await saveConfig(snapshot.config);
  }

  async function addSite(domain: string) {
    snapshot.config.sites.push({ domain, quotaMinutes: 30, followSchedule: true });
    await saveConfig(snapshot.config);
  }
</script>

<main>
  <div class="top">
    <Logo />
    <a class="link" href="/options.html">{i18n.t("settings")}</a>
  </div>

  <div class="title">
    <h1 class="doto">{i18n.t("week")}</h1>
    <div class="nav">
      <button aria-label={i18n.t("previousWeek")} disabled={offset <= OLDEST} onclick={() => (offset -= 1)}>‹</button>
      <span>{current ? i18n.t("partialWeek", [label]) : label}</span>
      <button aria-label={i18n.t("nextWeek")} disabled={current} onclick={() => (offset += 1)}>›</button>
    </div>
  </div>

  {#if !recorded}
    <section class="card">
      <p class="empty">{i18n.t("emptyWeek")}</p>
    </section>
  {:else}
    <div class="hero">
      <div><span class="num doto">{week.tries}</span><span class="label">{i18n.t("blockedAttempts")}</span></div>
      <div><span class="num doto">{week.escapes}/{MAX_ESCAPES * 7}</span><span class="label">{i18n.t("fiveMinuteUnlocks")}</span></div>
    </div>

    <section class="card">
      <div class="label head"><span>{i18n.t("usageBySite")}</span><span>{filter ? i18n.t("filteredMap", [filter]) : i18n.t("filterHint")}</span></div>
      <p class="note">{i18n.t("usageHelp")}</p>

      <ul class="sites">
        {#each week.sites as site (site.domain)}
          {@const scale = barScale(site)}
          <li>
            <button class="site" class:on={filter === site.domain} onclick={() => toggleFilter(site.domain)}>
              <span class="domain">{site.domain}<small>{quotaText(site)}</small></span>
              {#if site.quota === 0}
                <span class="total off">{i18n.t("blocked")}</span>
              {:else}
                <span class="total doto">{formatDuration(site.total)}</span>
              {/if}
              <span class="bars" aria-hidden="true">
                {#each site.days as seconds, day (day)}
                  {#if day >= elapsed}
                    <span></span>
                  {:else if site.quota === 0}
                    <span class="count" class:zero={!site.tries[day]}>{site.tries[day] || "·"}</span>
                  {:else}
                    <i
                      class:full={site.exhausted[day]}
                      class:zero={seconds === 0}
                      style:height="{Math.max(1, (seconds / scale) * 40)}px"
                      title="{WEEKDAYS[day]} · {formatDuration(seconds)}"
                    ></i>
                  {/if}
                {/each}
                {#if site.quota}
                  <span class="quota" style:bottom="{((site.quota * 60) / scale) * 40}px"></span>
                {/if}
              </span>
              <span class="meta">
                {#if site.quota === 0}
                  {i18n.t("attempts", sum(site.tries))}
                {:else}
                  {i18n.t("dailyAverage", [formatDuration(site.total / elapsed)])}
                  {#if versus(site)}<br />{versus(site)}{/if}
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>

      <div class="sum">
        <span class="label">{i18n.t("total")}</span>
        <span class="total doto">{formatDuration(week.total)}</span>
        <span class="letters" aria-hidden="true">{#each WEEKDAYS as name (name)}<span>{name.charAt(0)}</span>{/each}</span>
        <span class="meta">
          {i18n.t("dailyAverage", [formatDuration(week.total / elapsed)])}
          {#if previousRecorded}<br />{i18n.t("versus", [`${week.total < previous.total ? "−" : "+"}${formatDuration(Math.abs(week.total - previous.total))}`])}{/if}
        </span>
      </div>
    </section>

    <section class="card">
      <div class="label head"><span>{i18n.t("map")}</span><span>{filter ?? i18n.t("allSites")}</span></div>

      <div class="map" role="img" aria-label={i18n.t("mapAria")}>
        <span></span>
        <div class="hours">{#each HOURS as hour (hour)}<span>{hour}</span>{/each}</div>
        {#each WEEKDAYS as name, day (name)}
          <span class="day">{name}</span>
          <div class="slots">
            {#each { length: SLOTS_PER_DAY } as _, slot (slot)}
              {@const size = dotSize(day, slot)}
              <span
                class="cell"
                class:painted={painted(day, slot)}
                class:proposed={proposed(day, slot)}
                class:six={slot % 12 === 0}
                role="presentation"
                onpointerenter={() => (hovered = { day, slot })}
                onpointerleave={() => (hovered = null)}
              >
                {#if size}
                  <i class="dot" style:width="{size}px" style:height="{size}px" style:opacity={0.45 + (0.55 * size) / 10}></i>
                {:else if slotTries(days[day] ?? null, slot, filter).length}
                  <i class="try"></i>
                {/if}
              </span>
            {/each}
          </div>
        {/each}
      </div>

      <p class="hover">
        {#if hoverInfo}
          <b>{hoverInfo.title}</b>
          {#each hoverInfo.sites as site (site.domain)}<span>{site.domain} · {formatDuration(site.seconds)}</span>{/each}
          {#if hoverInfo.blocked.length}<span>{i18n.t("attempts", hoverInfo.blocked.length)} · {[...new Set(hoverInfo.blocked.map((entry) => `${entry.domain} ${reasons[entry.reason]}`))].join(", ")}</span>{/if}
          {#if !hoverInfo.sites.length && !hoverInfo.blocked.length}<span>{i18n.t("noUsage")}</span>{/if}
        {:else}
          <span><i class="dot legend"></i>{i18n.t("usageLegend")}</span>
          <span><i class="try legend"></i>{i18n.t("attemptLegend")}</span>
          <span><i class="paint legend"></i>{i18n.t("paintLegend")}</span>
        {/if}
      </p>
    </section>

    {#if peak || tries || quota}
      <section class="card">
        <div class="label head"><span>{i18n.t("insights")}</span></div>
        <ul class="insights">
          {#if peak}
            <li>
              <p>{i18n.t("peakInsight", [slotLabel(peak.from), slotLabel(peak.to), formatDuration(peak.seconds)])}</p>
              <button class="act" onpointerenter={() => (preview = true)} onpointerleave={() => (preview = false)} onclick={paintPeak}>
                {i18n.t("paintPeak", [slotLabel(peak.from), slotLabel(peak.to)])}
              </button>
            </li>
          {/if}
          {#if tries}
            <li>
              <p>{i18n.t("triesInsight", [tries.domain, tries.count, tries.atHour, slotLabel(tries.hour * 2), slotLabel((tries.hour + 1) * 2)])}</p>
              <button class="act" onclick={() => toggleFilter(tries.domain)}>{filter === tries.domain ? i18n.t("viewAll") : i18n.t("viewOnly", [tries.domain])}</button>
            </li>
          {/if}
          {#if quota}
            <li>
              <p>{i18n.t("quotaInsight", [quota.domain, quota.days, elapsed, slotLabel(quota.slot)])}</p>
              <button class="act" onclick={() => toggleFilter(quota.domain)}>{filter === quota.domain ? i18n.t("viewAll") : i18n.t("viewOnly", [quota.domain])}</button>
            </li>
          {/if}
        </ul>
      </section>
    {/if}

    {#if others.length}
      <section class="card">
        <div class="label head"><span>{i18n.t("outsideList")}</span><span>{i18n.t("mostTime")}</span></div>
        <ul class="others">
          {#each others as other (other.domain)}
            <li>
              <span>{other.domain}</span>
              <b>{formatDuration(other.seconds)}</b>
              <button class="add" onclick={() => addSite(other.domain)}>{i18n.t("addToList")}</button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="card">
      <div class="label head"><span>{i18n.t("receipt")}</span><span>{RECEIPT_SIZE.width} × {RECEIPT_SIZE.height}</span></div>
      <div class="receipt">
        {#if receipt}
          <img src={receipt.url} alt={i18n.t("receiptAlt", [label])} width="270" height="338" />
        {:else}
          <div class="placeholder"></div>
        {/if}
        <div>
          <p class="text">{i18n.t("receiptHelp")}</p>
          <div class="buttons">
            <a class="act" class:disabled={!receipt} href={receipt?.url} download={receipt?.name}>{i18n.t("downloadPng")}</a>
            <button class="act ghost" disabled={!receipt} onclick={copyReceipt}>{copyState}</button>
          </div>
          {#if receipt}<p class="file">{receipt.name} · {Math.round(receipt.blob.size / 1024)} KB</p>{/if}
        </div>
      </div>
    </section>
  {/if}
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

  .nav {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
  }

  .nav button {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: var(--soft);
    box-shadow: inset 0 0 0 1px var(--dim);
  }

  .nav button:hover:not(:disabled) {
    color: var(--fg);
  }

  .nav button:disabled {
    color: var(--dim);
    cursor: default;
  }

  .hero {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .hero div {
    background: var(--panel);
    border-radius: 16px;
    padding: 16px 18px;
    box-shadow: inset 0 0 0 1px var(--line);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .num {
    font-size: 36px;
    line-height: 1;
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
    gap: 12px;
  }

  .note,
  .empty {
    margin: 8px 0 4px;
    font-size: 11px;
    color: var(--mute);
    line-height: 1.5;
  }

  .empty {
    color: var(--soft);
    font-size: 12px;
  }

  .sites {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }

  .site,
  .sum {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 120px 188px 140px;
    align-items: center;
    gap: 16px;
    padding: 12px 8px;
    text-align: left;
  }

  .site {
    border-top: 1px solid var(--line);
    border-radius: 0;
    transition: background-color 0.12s;
  }

  .site:hover {
    background: var(--raised);
  }

  .site.on {
    background: var(--raised);
    box-shadow: inset 2px 0 0 var(--fg);
  }

  .sum {
    border-top: 1px solid var(--dim);
    padding-bottom: 0;
  }

  .domain {
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .domain small {
    display: block;
    margin-top: 3px;
    font-size: 10px;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .total {
    font-size: 24px;
    line-height: 1;
    white-space: nowrap;
  }

  .total.off {
    font-family: inherit;
    font-size: 12px;
    color: var(--soft);
  }

  .bars,
  .letters {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;
  }

  .bars {
    position: relative;
    height: 40px;
    align-items: end;
  }

  .bars i {
    display: block;
    background: var(--mute);
  }

  .bars i.full {
    background: var(--fg);
  }

  .bars i.zero {
    background: var(--dim);
  }

  .bars .quota {
    position: absolute;
    left: -3px;
    right: -3px;
    border-top: 1px dashed var(--mute);
  }

  .count {
    font-size: 11px;
    text-align: center;
  }

  .count.zero {
    color: var(--dim);
  }

  .letters {
    font-size: 9px;
    color: var(--mute);
    text-align: center;
    text-transform: uppercase;
  }

  .meta {
    font-size: 11px;
    color: var(--soft);
    line-height: 1.6;
    text-align: right;
  }


  .map {
    display: grid;
    grid-template-columns: 34px 1fr;
    row-gap: 4px;
    margin-top: 14px;
    align-items: center;
  }

  .hours {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    font-size: 10px;
    color: #4a4a4a;
  }

  .day {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--soft);
  }

  .slots {
    display: grid;
    grid-template-columns: repeat(48, 1fr);
  }

  .cell {
    height: 16px;
    display: grid;
    place-items: center;
  }

  .cell.six {
    box-shadow: inset 1px 0 #1c1c1c;
  }

  .cell.painted {
    background: #181818;
  }

  .cell.proposed {
    background: repeating-linear-gradient(135deg, #2a2a2a 0 2px, transparent 2px 5px);
  }

  .cell:hover {
    outline: 1px solid var(--mute);
  }

  .dot {
    display: block;
    border-radius: 50%;
    background: var(--fg);
  }

  .try {
    display: block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--soft);
  }

  .hover {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    min-height: 18px;
    margin: 12px 0 0 34px;
    font-size: 11px;
    color: var(--mute);
  }

  .hover b {
    color: var(--fg);
    font-weight: 400;
  }

  .legend {
    display: inline-block;
    vertical-align: middle;
    margin-right: 6px;
  }

  .dot.legend {
    width: 7px;
    height: 7px;
  }

  .paint.legend {
    width: 14px;
    height: 9px;
    background: #181818;
  }

  .insights,
  .others {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
  }

  .insights li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 20px;
    align-items: center;
    padding: 12px 0;
    border-top: 1px solid var(--line);
  }

  .insights li:first-child {
    border-top: 0;
  }

  .insights p,
  .text {
    margin: 0;
    font-size: 12px;
    color: var(--soft);
    line-height: 1.65;
  }


  .act {
    display: inline-block;
    padding: 8px 12px;
    border-radius: 99px;
    box-shadow: inset 0 0 0 1px var(--fg);
    font-size: 11px;
    white-space: nowrap;
    color: var(--fg);
    text-decoration: none;
    transition:
      background-color 0.12s,
      color 0.12s;
  }

  .act:hover {
    background: var(--fg);
    color: var(--bg);
  }

  .act.ghost {
    box-shadow: inset 0 0 0 1px var(--dim);
    color: var(--soft);
  }

  .act.ghost:hover:not(:disabled) {
    background: none;
    color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--fg);
  }

  .act.disabled,
  .act:disabled {
    pointer-events: none;
    opacity: 0.4;
  }

  .others li {
    display: grid;
    grid-template-columns: 1fr auto 80px;
    gap: 18px;
    align-items: center;
    padding: 8px 0;
    border-top: 1px solid var(--line);
    font-size: 12px;
  }

  .others li:first-child {
    border-top: 0;
  }

  .others span {
    color: var(--soft);
    overflow-wrap: anywhere;
  }

  .others b {
    font-weight: 400;
  }

  .add {
    height: 26px;
    border-radius: 99px;
    box-shadow: inset 0 0 0 1px var(--dim);
    font-size: 10px;
    text-transform: uppercase;
    color: var(--soft);
  }

  .add:hover {
    color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--fg);
  }

  .receipt {
    display: grid;
    grid-template-columns: 270px 1fr;
    gap: 24px;
    margin-top: 14px;
    align-items: start;
  }

  .receipt img,
  .placeholder {
    display: block;
    width: 270px;
    height: 338px;
    border-radius: 8px;
    box-shadow: 0 0 0 1px var(--dim);
  }

  .buttons {
    display: flex;
    gap: 8px;
    margin: 16px 0 12px;
  }

  .file {
    margin: 0;
    font-size: 10px;
    color: var(--mute);
  }

  @media (max-width: 640px) {
    .site,
    .sum {
      grid-template-columns: 1fr auto;
    }

    .bars,
    .letters {
      grid-column: 1 / -1;
    }

    .receipt {
      grid-template-columns: 1fr;
    }
  }
</style>
