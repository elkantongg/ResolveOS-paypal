<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
</script>

<template>
  <span class="inline-flex items-center gap-2.5 font-semibold tracking-tight text-ink">
    <svg viewBox="0 0 32 32" class="size-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#142b52" />
      <path d="M8.5 11.5h7.5a3.5 3.5 0 0 1 0 7H11" stroke="white" stroke-width="2.4" fill="none" stroke-linecap="round" />
      <path d="M23.5 20.5H16a3.5 3.5 0 0 1 0-7H21" stroke="var(--color-accent-bright)" stroke-width="2.4" fill="none" stroke-linecap="round" />
    </svg>
    <span v-if="!compact" class="text-[17px]">Resolve<span class="text-primary">OS</span></span>
  </span>
</template>
