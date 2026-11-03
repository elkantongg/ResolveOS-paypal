<script setup lang="ts">
import { Check, X } from 'lucide-vue-next';
import { computed } from 'vue';

import type { CaseStatus } from '@/api/types';
import { STAGES, stageIndex } from '@/lib/format';

/** The seven stages, driven only by the case's stored status. */
const props = defineProps<{ status: CaseStatus }>();
const current = computed(() => stageIndex(props.status));
const stopped = computed(() => props.status === 'NO_AGREEMENT' || props.status === 'ESCALATED');
</script>

<template>
  <ol class="flex w-full items-center gap-1 overflow-x-auto pb-1" aria-label="Resolution progress">
    <li v-for="(label, i) in STAGES" :key="label" class="flex min-w-0 flex-1 items-center gap-2" :aria-current="i === current ? 'step' : undefined">
      <span
        class="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ring-1 ring-inset transition-colors duration-500"
        :class="
          i < current
            ? 'bg-accent text-white ring-accent'
            : i === current && stopped
              ? 'bg-danger-soft text-danger ring-danger-line'
              : i === current
                ? 'bg-primary text-white ring-primary shadow-[var(--shadow-focus)]'
                : 'bg-surface text-faint ring-line'
        "
      >
        <Check v-if="i < current" class="size-3.5" stroke-width="3" />
        <X v-else-if="i === current && stopped" class="size-3.5" stroke-width="3" />
        <template v-else>{{ i + 1 }}</template>
      </span>
      <span class="truncate text-xs font-medium" :class="i <= current ? 'text-ink' : 'text-faint'">{{ label }}</span>
      <span v-if="i < STAGES.length - 1" class="h-px min-w-3 flex-1 transition-colors duration-500" :class="i < current ? 'bg-accent' : 'bg-line'" />
    </li>
  </ol>
</template>
