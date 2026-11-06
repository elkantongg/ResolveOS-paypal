<script setup lang="ts">
import { Check, X } from 'lucide-vue-next';
import { computed } from 'vue';

import type { CaseStatus } from '@/api/types';
import { STAGES, stageIndex } from '@/lib/format';

/** The seven stages, driven only by the case's stored status. */
const props = defineProps<{ status: CaseStatus }>();
const current = computed(() => stageIndex(props.status));
const stopped = computed(() => props.status === 'NO_AGREEMENT' || props.status === 'ESCALATED');
const currentLabel = computed(() =>
  current.value >= STAGES.length ? 'Resolved' : `${stopped.value ? 'Stopped at: ' : ''}${STAGES[current.value]}`,
);
</script>

<template>
  <div>
    <p class="mb-2 text-xs font-medium text-muted md:hidden" aria-hidden="true">
      Stage {{ Math.min(current + 1, STAGES.length) }} of {{ STAGES.length }} · <span class="text-ink">{{ currentLabel }}</span>
    </p>
    <ol class="flex w-full items-center gap-1" aria-label="Resolution progress">
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
        <span class="sr-only md:not-sr-only md:truncate md:text-xs md:font-medium" :class="i <= current ? 'md:text-ink' : 'md:text-faint'">{{ label }}</span>
        <span v-if="i < STAGES.length - 1" class="h-px min-w-2 flex-1 transition-colors duration-500" :class="i < current ? 'bg-accent' : 'bg-line'" />
      </li>
    </ol>
  </div>
</template>
