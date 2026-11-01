<script lang="ts">
  let { checked, label, onchange }: { checked: boolean; label: string; onchange: (value: boolean) => void } = $props();
</script>

<button class="switch" role="switch" aria-checked={checked} aria-label={label} onclick={() => onchange(!checked)}></button>

<style>
  .switch {
    width: 36px;
    height: 20px;
    border-radius: 99px;
    background: var(--dim);
    position: relative;
    flex: none;
    transition: background-color 0.16s;
  }

  .switch::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--mute);
    transition:
      transform 0.16s var(--ease),
      background-color 0.16s;
  }

  .switch[aria-checked="true"] {
    background: var(--fg);
  }

  .switch[aria-checked="true"]::after {
    transform: translateX(16px);
    background: var(--bg);
  }
</style>
