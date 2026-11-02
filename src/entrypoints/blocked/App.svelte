<script lang="ts">
  import * as v from "valibot";
  import { untrack } from "svelte";
  import { browser } from "wxt/browser";

  import Logo from "@/components/Logo.svelte";
  import { formatClock, formatDuration, formatMinutes } from "@/lib/format";
  import { EscapeResult, type EscapeRequest } from "@/lib/messages";
  import { canEscape, hostOf, matchSite, statusOf } from "@/lib/rules";
  import { loadSnapshot, type Snapshot } from "@/lib/snapshot";
  import { MAX_ESCAPES, usedSeconds } from "@/lib/usage";

  let { initial, url }: { initial: Snapshot; url: string | null } = $props();

  const WAIT_SECONDS = 30;

  let snapshot = $state(untrack(() => initial));
  let now = $state(new Date());
  let waiting: number | null = $state(null);
  let denied = $state(false);

  const host = $derived(url ? hostOf(url) : null);
  const site = $derived(host ? matchSite(snapshot.config.sites, host) : undefined);
  const status = $derived(site ? statusOf(snapshot, site, now) : null);
  const used = $derived(site ? usedSeconds({ usage: snapshot.usage, session: snapshot.session, domain: site.domain, now }) : 0);
  const escapable = $derived(status ? canEscape(snapshot, status) : false);
  const escapesLeft = $derived(MAX_ESCAPES - snapshot.usage.escapes);

  $effect(() => {
    const timer = setInterval(() => {
      now = new Date();

      if (waiting !== null && document.visibilityState === "visible") {
        waiting -= 1;
      }
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

  $effect(() => {
    if (url && status?.kind !== "blocked") {
      location.replace(url);
    }
  });

  $effect(() => {
    if (waiting === 0) {
      void requestEscape();
    }
  });

  async function requestEscape() {
    if (!site || !url) {
      return;
    }

    waiting = null;

    const request: EscapeRequest = { type: "escape", domain: site.domain };
    const result = v.safeParse(EscapeResult, await browser.runtime.sendMessage(request));

    if (!result.success || !result.output.ok) {
      denied = true;
      return;
    }

    location.replace(url);
  }

  async function closeTab() {
    const tab = await browser.tabs.getCurrent();

    if (tab?.id !== undefined) {
      await browser.tabs.remove(tab.id);
    }
  }

  function heading() {
    if (status?.kind !== "blocked") {
      return "";
    }

    const headings = { always: "Sempre bloqueado", window: "Horário bloqueado até", quota: "Cota esgotada · libera às" };

    return headings[status.reason];
  }

  function reasonText() {
    if (status?.kind !== "blocked" || !site) {
      return "";
    }

    if (status.reason === "window") {
      return "Este site segue os horários bloqueados.";
    }

    if (status.reason === "always") {
      return "A cota deste site é 0.";
    }

    return `Você usou ${formatDuration(used)} de ${formatMinutes(site.quotaMinutes ?? 0)} hoje.`;
  }

  function escapeNote() {
    if (!snapshot.config.escape || status?.kind !== "blocked") {
      return null;
    }

    if (denied) {
      return "A liberação não foi aceita.";
    }

    if (status.reason === "window") {
      return "Não dá para liberar dentro do horário bloqueado.";
    }

    if (snapshot.usage.escapes >= MAX_ESCAPES) {
      return `Voce usou desbloqueio ${MAX_ESCAPES}x hoje`;
    }

    return null;
  }
</script>

<main>
  <div class="top">
    <Logo />
    <span class="domain">{site?.domain ?? host ?? ""}</span>
  </div>

  {#if status?.kind === "blocked"}
    <div class="center">
      <div class="label">{heading()}</div>
      <div class="clock doto">{status.until === null ? "sempre" : formatClock(status.until, now)}</div>
      {#if status.until !== null}
        <div class="remain">libera em {formatDuration((status.until - now.getTime()) / 1000)}</div>
      {/if}
    </div>

    <div class="bottom">
      <p class="why">{reasonText()}</p>

      <div class="actions">
        <button class="primary" onclick={closeTab}>Fechar aba</button>

        {#if waiting !== null}
          <button class="secondary waiting" onclick={() => (waiting = null)}>
            Aguarde {waiting}s · cancelar
          </button>
        {:else if escapable}
          <button class="secondary" onclick={() => (waiting = WAIT_SECONDS)}>
            Liberar 5 min
            <small>{escapesLeft} {escapesLeft === 1 ? "restante" : "restantes"} hoje</small>
          </button>
        {/if}
      </div>

      {#if waiting === null && escapeNote()}
        <p class="note">{escapeNote()}</p>
      {/if}
    </div>
  {:else}
    <div class="center"><div class="label">Abrindo…</div></div>
  {/if}
</main>

<style>
  :global(body) {
    min-height: 100vh;
    background: radial-gradient(circle, #141414 1px, transparent 1.5px) 0 0 / 12px 12px, var(--bg);
  }

  main {
    min-height: 100vh;
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 24px;
    display: flex;
    flex-direction: column;
  }

  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .domain {
    color: var(--mute);
  }

  .center {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 14px;
    padding: 48px 0;
  }

  .clock {
    font-size: clamp(88px, 18vw, 168px);
    line-height: 0.9;
  }

  .remain {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums;
  }

  .why {
    margin: 0 0 16px;
    font-size: 12px;
    color: var(--soft);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .actions button {
    padding: 14px 22px;
    border-radius: 99px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    display: flex;
    align-items: baseline;
    gap: 10px;
    transition:
      transform 0.16s var(--ease),
      background-color 0.16s,
      color 0.16s;
  }

  .actions button:active {
    transform: scale(0.97);
  }

  .primary {
    background: var(--fg);
    color: var(--bg);
  }

  .secondary {
    box-shadow: inset 0 0 0 1px #333;
  }

  .secondary:hover {
    box-shadow: inset 0 0 0 1px var(--soft);
  }

  .secondary small {
    font-size: 10px;
    font-weight: 400;
    color: var(--mute);
  }

  .waiting {
    font-variant-numeric: tabular-nums;
  }

  .note {
    margin: 14px 0 0;
    font-size: 11px;
    color: var(--mute);
  }
</style>
