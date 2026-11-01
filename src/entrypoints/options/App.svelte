<script lang="ts">
  import { untrack } from "svelte";
  import { browser } from "wxt/browser";

  import Dots from "@/components/Dots.svelte";
  import Logo from "@/components/Logo.svelte";
  import Switch from "@/components/Switch.svelte";
  import { saveConfig, type SiteRule } from "@/lib/config";
  import { formatClock, formatDuration, formatMinutes } from "@/lib/format";
  import { inWindow, nextWindowStart, normalizeDomain } from "@/lib/rules";
  import { loadSnapshot, type Snapshot } from "@/lib/snapshot";
  import { SLOTS_PER_DAY, WEEKDAYS, slotOf, weekday } from "@/lib/time";
  import { usedSeconds } from "@/lib/usage";

  let { initial }: { initial: Snapshot } = $props();

  const QUOTA_STEPS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, null] as const;
  const HOURS = ["00", "03", "06", "09", "12", "15", "18", "21"];

  let snapshot = $state(untrack(() => initial));
  let now = $state(new Date());
  let saveError = $state("");
  let painting: boolean | null = $state(null);
  let focused = $state({ day: 0, slot: 0 });
  let draft = $state("");
  let draftError = $state("");
  let confirming: string | null = $state(null);

  const config = $derived(snapshot.config);
  const today = $derived(weekday(now));
  const nowSlot = $derived(slotOf(now));
  const weekSlots = $derived(config.schedule.reduce((sum, day) => sum + countSlots(day), 0));
  const windowStart = $derived(nextWindowStart(config.schedule, now));
  const blockedNow = $derived(inWindow(config.schedule, now));

  $effect(() => {
    const timer = setInterval(() => {
      now = new Date();
    }, 15_000);

    return () => clearInterval(timer);
  });

  $effect(() => {
    const reload = async (changes: Record<string, unknown>) => {
      const fresh = await loadSnapshot(new Date());
      const external = "config" in changes && painting === null && JSON.stringify(fresh.config) !== JSON.stringify(snapshot.config);
      const nextConfig = external ? fresh.config : snapshot.config;

      snapshot = { ...fresh, config: nextConfig };
    };

    browser.storage.onChanged.addListener(reload);

    return () => browser.storage.onChanged.removeListener(reload);
  });

  function countSlots(day: string) {
    return day.split("").filter((slot) => slot === "1").length;
  }

  function formatSlots(count: number) {
    return formatDuration(count * 30 * 60);
  }

  function slotLabel(slot: number) {
    return `${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`;
  }

  async function commit() {
    await saveConfig(snapshot.config).then(
      () => {
        saveError = "";
      },
      (error: unknown) => {
        console.error("lily:", error);
        saveError = "Não deu para salvar a última mudança. Tente de novo.";
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
      draftError = "Domínio inválido. Ex: tiktok.com";
      return;
    }

    if (config.sites.some((site) => site.domain === domain)) {
      draftError = `${domain} já está na lista.`;
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
      return "sempre bloqueado";
    }

    const used = usedSeconds({ usage: snapshot.usage, session: snapshot.session, domain: site.domain, now });

    if (site.quotaMinutes === null) {
      return `${formatDuration(used)} hoje · sem cota`;
    }

    if (used >= site.quotaMinutes * 60) {
      return "esgotado hoje";
    }

    return `${formatDuration(used)} de ${formatMinutes(site.quotaMinutes)} hoje`;
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
  </div>

  {#if saveError}<p class="save-error" role="alert">{saveError}</p>{/if}

  <div class="title">
    <h1 class="doto">Configurações</h1>
    <div class="state">
      <span>agora · {WEEKDAYS[today]} {formatClock(now.getTime(), now)}</span>
      {blockedNow ? "horário bloqueado" : "fora do horário"}
    </div>
  </div>

  <section class="card">
    <div class="label head"><span>Horários bloqueados</span><span>arraste para pintar</span></div>

    <div class="grid" role="grid" aria-label="Horários bloqueados por dia e meia hora" tabindex="-1" onkeydown={onGridKey}>
      {#each WEEKDAYS as name, day (name)}
        <div class="day" class:today={day === today}>{name}</div>
        <div class="slots" role="row">
          {#each { length: SLOTS_PER_DAY } as _, slot (slot)}
            <button
              class="cell"
              class:now={day === today && slot === nowSlot}
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
      <span>bloqueado <b>{formatSlots(weekSlots)}</b> por semana</span>
      <span>próximo <b>{windowStart === null ? "nenhum" : formatClock(windowStart, now)}</b></span>
    </div>
  </section>

  <section class="card">
    <div class="label head"><span>Sites</span><span>cota zera às 00:00</span></div>

    {#if config.sites.length}
      <ul class="sites">
        {#each config.sites as site (site.domain)}
          <li>
            <span class="domain">{site.domain}</span>
            <div class="use" class:out={quotaHint(site) === "esgotado hoje" || site.quotaMinutes === 0}>
              <span>{quotaHint(site)}</span>
              <Dots ratio={quotaRatio(site)} />
            </div>
            <div class="stepper">
              <button aria-label="Diminuir cota de {site.domain}" onclick={() => stepQuota(site, -1)}>−</button>
              <output class="doto">{site.quotaMinutes === null ? "∞" : formatMinutes(site.quotaMinutes)}</output>
              <button aria-label="Aumentar cota de {site.domain}" onclick={() => stepQuota(site, 1)}>+</button>
            </div>
            <label class="follow">
              <span>horários</span>
              <Switch
                checked={site.followSchedule}
                label="{site.domain} segue os horários"
                onchange={(value) => {
                  site.followSchedule = value;
                  commit();
                }}
              />
            </label>
            <button class="remove" class:confirm={confirming === site.domain} onblur={() => (confirming = null)} onclick={() => removeSite(site.domain)}>
              {confirming === site.domain ? "remover?" : "×"}
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">Nenhum site ainda. Adicione o primeiro abaixo.</p>
    {/if}

    <form class="add" onsubmit={addSite}>
      <span>+</span>
      <input bind:value={draft} placeholder="adicionar site, ex: tiktok.com" aria-label="Adicionar site" oninput={() => (draftError = "")} />
      <kbd>enter</kbd>
    </form>
    {#if draftError}<p class="error" role="alert">{draftError}</p>{/if}
  </section>

  <div class="pair">
    <section class="card option">
      <div>
        <div class="label">Liberar 5 min</div>
        <p>Espera de 30s com a página visível. Até 2× por dia. Nunca dentro do horário bloqueado.</p>
      </div>
      <Switch
        checked={config.escape}
        label="Liberar 5 min"
        onchange={(value) => {
          config.escape = value;
          commit();
        }}
      />
    </section>
    <section class="card option">
      <div>
        <div class="label">Aviso</div>
        <p>Notifica 1 min antes do horário começar ou da cota acabar.</p>
      </div>
      <Switch
        checked={config.warn}
        label="Aviso antes de bloquear"
        onchange={(value) => {
          config.warn = value;
          commit();
        }}
      />
    </section>
  </div>
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
    margin-top: 14px;
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

  .cell:focus-visible::after {
    content: "";
    position: absolute;
    inset: 0 1px;
    border-radius: 4px;
    box-shadow: 0 0 0 1px var(--fg);
  }

  .cell.now::after {
    content: "";
    position: absolute;
    inset: -2px 2px;
    border-radius: 99px;
    box-shadow: inset 0 0 0 1px var(--mute);
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

  @media (max-width: 640px) {
    .sites li {
      grid-template-columns: 1fr auto;
    }

    .pair {
      grid-template-columns: 1fr;
    }
  }
</style>
