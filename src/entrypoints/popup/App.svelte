<script lang="ts">
  import { untrack } from "svelte";
  import { browser } from "wxt/browser";

  import Dots from "@/components/Dots.svelte";
  import Logo from "@/components/Logo.svelte";
  import { saveConfig } from "@/lib/config";
  import { formatClock, formatDuration, formatMinutes } from "@/lib/format";
  import { siteRows, type SiteRow } from "@/lib/rows";
  import { hostOf, matchSite, nextWindowStart, normalizeDomain } from "@/lib/rules";
  import { loadSnapshot, type Snapshot } from "@/lib/snapshot";
  import { MAX_ESCAPES } from "@/lib/usage";

  let { initial, tabUrl }: { initial: Snapshot; tabUrl: string | null } = $props();

  let snapshot = $state(untrack(() => initial));
  let now = $state(new Date());

  const host = $derived(tabUrl ? hostOf(tabUrl) : null);
  const rows = $derived(siteRows(snapshot, now));
  const total = $derived(rows.reduce((sum, row) => sum + row.used, 0));
  const currentSite = $derived(host ? matchSite(snapshot.config.sites, host) : undefined);
  const current = $derived(rows.find((row) => row.site.domain === currentSite?.domain));
  const candidate = $derived(host ? normalizeDomain(host) : null);
  const escapesLeft = $derived(Math.max(0, MAX_ESCAPES - snapshot.usage.escapes));

  $effect(() => {
    const timer = setInterval(() => {
      now = new Date();
    }, 1000);

    return () => clearInterval(timer);
  });

  $effect(() => {
    const reload = async () => {
      snapshot = await loadSnapshot(new Date());
    };

    browser.storage.onChanged.addListener(reload);

    return () => browser.storage.onChanged.removeListener(reload);
  });

  function badge(row: SiteRow) {
    const { status } = row;

    if (status.kind === "blocked") {
      return status.until === null ? "sempre" : `até ${formatClock(status.until, now)}`;
    }

    if (status.remaining === null) {
      return "sem cota";
    }

    return `${formatDuration(status.remaining)} restantes`;
  }

  function detail(row: SiteRow) {
    const { status, site, used } = row;

    if (status.kind === "blocked") {
      const reasons = { always: "cota 0", window: "horário bloqueado", quota: "cota esgotada" };
      return reasons[status.reason];
    }

    if (status.allowedUntil !== null) {
      return `liberado até ${formatClock(status.allowedUntil, now)}`;
    }

    if (site.quotaMinutes === null) {
      return `${formatDuration(used)} hoje`;
    }

    return `${formatDuration(used)} de ${formatMinutes(site.quotaMinutes)}`;
  }

  function nextWindowNote(row: SiteRow) {
    if (!row.site.followSchedule) {
      return null;
    }

    const start = nextWindowStart(snapshot.config.schedule, now);

    return start === null ? null : `horário bloqueado às ${formatClock(start, now)}`;
  }

  async function addCurrent() {
    if (!candidate) {
      return;
    }

    snapshot.config.sites.push({ domain: candidate, quotaMinutes: 30, followSchedule: true });
    await saveConfig(snapshot.config);
  }

  async function openOptions() {
    await browser.runtime.openOptionsPage();
    window.close();
  }
</script>

<main>
  <header>
    <Logo />
    <span class="total">hoje <b>{formatDuration(total)}</b></span>
  </header>

  {#if current}
    {@const { site, status, used } = current}
    <section class="tab">
      <div class="row">
        <span class="domain">{site.domain}</span>
        <span class="label">{detail(current)}</span>
      </div>

      {#if status.kind === "blocked"}
        <div class="big">
          {#if status.until === null}
            <span class="num doto">sempre</span>
          {:else}
            <span class="num doto">{formatClock(status.until, now)}</span>
            <span class="label">bloqueado até</span>
          {/if}
        </div>
      {:else if status.remaining !== null && site.quotaMinutes !== null}
        <div class="big">
          <span class="num doto">{formatDuration(status.remaining)}</span>
          <span class="label">restantes hoje</span>
        </div>
        <Dots ratio={used / (site.quotaMinutes * 60)} />
      {:else}
        <div class="big">
          <span class="num doto">{formatDuration(used)}</span>
          <span class="label">hoje · sem cota</span>
        </div>
      {/if}

      {#if status.kind === "free" && nextWindowNote(current)}
        <p class="note">{nextWindowNote(current)}</p>
      {/if}
    </section>
  {:else if candidate}
    <section class="tab">
      <div class="row">
        <span class="domain">{candidate}</span>
        <span class="label">sem regra</span>
      </div>
      <p class="empty">Esta aba não conta tempo nem bloqueia.</p>
      <button class="add" onclick={addCurrent}><span>+ Adicionar com 30m por dia</span><span>→</span></button>
    </section>
  {/if}

  <div class="label list-label">Sites</div>

  {#if rows.length}
    <ul>
      {#each rows as row (row.site.domain)}
        <li class:blocked={row.status.kind === "blocked"}>
          <span class="name">{row.site.domain}</span>
          <span class="badge">{badge(row)}</span>
          <span class="sub">{detail(row)}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">Nenhum site ainda. Adicione pela aba atual ou nas configurações.</p>
  {/if}

  <footer>
    <button onclick={openOptions}>Configurações</button>
    <span>{escapesLeft === 1 ? "1 liberação restante" : `${escapesLeft} liberações restantes`}</span>
  </footer>
</main>

<style>
  :global(body) {
    width: 340px;
  }

  main {
    padding: 16px;
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 2px 14px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .total {
    color: var(--mute);
  }

  .total b {
    color: var(--fg);
    font-weight: 400;
  }

  .tab {
    background: var(--raised);
    border-radius: 16px;
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .domain {
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .big {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .num {
    font-size: 48px;
    line-height: 1;
    white-space: nowrap;
  }

  .note {
    margin: 0;
    font-size: 10px;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .empty {
    margin: 0;
    font-size: 12px;
    color: var(--soft);
    line-height: 1.5;
  }

  .add {
    width: 100%;
    padding: 12px 16px;
    border-radius: 99px;
    box-shadow: inset 0 0 0 1px #333;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    display: flex;
    justify-content: space-between;
    transition:
      background-color 0.16s,
      color 0.16s;
  }

  .add:hover {
    background: var(--fg);
    color: var(--bg);
  }

  .list-label {
    margin: 18px 2px 4px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: 4px 12px;
    padding: 10px 2px;
    border-top: 1px solid var(--line);
  }

  li:first-child {
    border-top: 0;
  }

  .name {
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .badge {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--soft);
    text-align: right;
    white-space: nowrap;
  }

  .blocked .name {
    color: var(--mute);
  }

  .blocked .badge {
    color: var(--bg);
    background: var(--fg);
    padding: 2px 8px;
    border-radius: 99px;
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.04em;
  }

  .sub {
    grid-column: 1 / -1;
    font-size: 10px;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 12px 2px 0;
    margin-top: 6px;
    border-top: 1px solid var(--line);
  }

  footer button {
    text-transform: inherit;
    letter-spacing: inherit;
    transition: color 0.16s;
  }

  footer button:hover {
    color: var(--fg);
  }
</style>
