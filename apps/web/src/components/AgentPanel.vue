
<script setup lang="ts">
import { Lock, ShieldCheck } from 'lucide-vue-next';
import { computed } from 'vue';

import type { Evidence, Turn } from '@/api/types';
import { ACTION_LABEL, money } from '@/lib/format';

import AgentAvatar from './AgentAvatar.vue';

/**
 * One side of the negotiation room. Private limits are shown only to the side they belong to:
 * the API returns null for the other side's limit, and this says so instead of guessing.
 */
const props = defineProps<{
  agent: 'BUYER' | 'MERCHANT';
  party: string;
  subtitle: string;
  wants: string;
  limitLabel: string;
  limitMinor: number | null;
  limitIsMine: boolean;
  currency: string;
  evidence: Evidence[];
  latest: Turn | null;
  thinking: boolean;
}>();

const isBuyer = computed(() => props.agent === 'BUYER');
</script>

<template>
  <section
    class="card flex flex-col overflow-hidden"
    :class="thinking ? (isBuyer ? 'ring-2 ring-primary-line' : 'ring-2 ring-accent-line') : ''"
    :aria-label="isBuyer ? 'Buyer agent' : 'Merchant agent'"
  >
    <header class="flex items-center gap-3 border-b border-line px-5 py-4" :class="isBuyer ? 'bg-buyer-soft/60' : 'bg-merchant-soft/60'">
      <AgentAvatar :agent="agent" size="lg" :active="thinking" />
      <div class="min-w-0">
        <p class="eyebrow" :class="isBuyer ? '!text-buyer' : '!text-merchant'">{{ isBuyer ? 'Buyer agent' : 'Merchant agent' }}</p>
        <p class="truncate text-base font-semibold">{{ party }}</p>
        <p class="truncate text-xs text-muted">{{ subtitle }}</p>
      </div>
    </header>

    <div class="flex flex-1 flex-col gap-5 px-5 py-5 text-sm">
      <div>
        <p class="eyebrow mb-1.5">Current position</p>
        <div v-if="thinking" class="flex items-center gap-2 text-muted" aria-live="polite">
          <span class="flex gap-1">
            <span v-for="i in 3" :key="i" class="size-1.5 animate-bounce rounded-full" :class="isBuyer ? 'bg-buyer' : 'bg-merchant'" :style="{ animationDelay: `${i * 120}ms` }" />
          </span>
          Reviewing evidence…
        </div>
        <div v-else-if="latest">
          <p class="text-2xl font-semibold tracking-tight tabular" :class="isBuyer ? 'text-buyer' : 'text-merchant'">
            {{ latest.proposedRefundMinorUnits !== null ? money(latest.proposedRefundMinorUnits, currency) : ACTION_LABEL[latest.proposedAction] }}
          </p>
          <p class="text-xs text-muted">
            {{ latest.acceptsCounterpartOffer ? 'Accepted the other side’s offer' : ACTION_LABEL[latest.proposedAction] }} · turn {{ latest.index }}
          </p>
        </div>
        <p v-else class="text-muted">No position yet.</p>
      </div>

      <div>
        <p class="eyebrow mb-1.5">{{ isBuyer ? 'Desired outcome' : 'Preferred outcome' }}</p>
        <p class="text-ink-soft text-pretty">{{ wants }}</p>
      </div>

      <div class="rounded-xl border border-line bg-sunken/60 px-3.5 py-3">
        <p class="eyebrow mb-1 flex items-center gap-1.5">
          <ShieldCheck class="size-3.5" /> {{ limitLabel }}
        </p>
        <p v-if="limitIsMine" class="font-semibold tabular">{{ limitMinor === null ? 'Full remedy only' : money(limitMinor, currency) }}</p>
        <p v-else class="flex items-center gap-1.5 text-muted"><Lock class="size-3.5" /> Private to {{ party }}</p>
        <p class="mt-1 text-xs text-muted">
          {{ isBuyer ? 'The agent may never accept less.' : 'The agent may never offer more.' }} Enforced by the server, not the AI.
        </p>
      </div>

      <div>
        <p class="eyebrow mb-1.5">{{ isBuyer ? 'Buyer evidence' : 'Merchant evidence' }}</p>
        <ul v-if="evidence.length" class="space-y-2">
          <li v-for="item in evidence" :key="item.id" class="rounded-lg border border-line px-3 py-2">
            <p class="flex items-center gap-2 text-xs">
              <span class="mono font-semibold">{{ item.code }}</span>
              <span class="font-medium text-ink">{{ item.title }}</span>
            </p>
            <p class="mt-0.5 line-clamp-3 text-xs text-muted">{{ item.content }}</p>
          </li>
        </ul>
        <p v-else class="text-xs text-muted">None provided.</p>
      </div>
    </div>
  </section>
</template>
