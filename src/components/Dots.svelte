<script lang="ts">
  let { ratio, muted = false }: { ratio: number; muted?: boolean } = $props();
</script>

<div class="dots" class:muted role="presentation">
  <b style:width="{Math.min(1, Math.max(0, ratio)) * 100}%"></b>
</div>

<style>
  .dots {
    height: 8px;
    overflow: hidden;
    background: radial-gradient(circle, var(--dim) 2px, transparent 2.5px) 0 0 / 8px 8px;
  }

  b {
    display: block;
    height: 100%;
    background: radial-gradient(circle, var(--fg) 2px, transparent 2.5px) 0 0 / 8px 8px;
    transition: width 0.2s var(--ease);
  }

  .muted b {
    background-image: radial-gradient(circle, var(--mute) 2px, transparent 2.5px);
  }
</style>
