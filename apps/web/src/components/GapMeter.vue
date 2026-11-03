
<script setup lang="ts">
import { computed } from 'vue';

import { money } from '@/lib/format';

/**
 * The two positions on one line from $0 to the refundable amount: the buyer agent's ask and the
 * merchant agent's offer. As the agents negotiate, the markers move toward each other; when they
 * meet, the gap closes. Built only from recorded turns.
 */
const props = defineProps<{
  totalMinor: number;
  currency: string;
  buyerMinor: number | null;
  merchantMinor: number | null;
  agreedMinor: number | null;
}>();

const pct = (minor: number | null) => (minor === null ? null : Math.max(0, Math.min(100, (minor / props.totalMinor) * 100)));
const buyer = computed(() => pct(props.agreedMinor ?? props.buyerMinor));
const merchant = computed(() => pct(props.agreedMinor ?? props.merchantMinor));
const gap = computed(() =>
  props.buyerMinor !== null && props.merchantMinor !== null ? Math.max(0, props.buyerMinor - props.merchantMinor) : null,
);
</script>

<template>
  <div class="rounded-xl border border-line bg-surface px-5 pb-4 pt-3.5">
    <div class="mb-3 flex items-baseline justify-between gap-4">
      <p class="eyebrow">Positions</p>
      <p class="text-sm tabular" aria-live="polite">
        <template v-if="agreedMinor !== null">
          <span class="font-semibold text-ok">Agreed at {{ money(agreedMinor, currency) }}</span>
        </template>
        <template v-else-if="gap !== null">
          Gap <span class="font-semibold">{{ money(gap, currency) }}</span>
        </template>
        <template v-else><span class="text-muted">Waiting for both opening positions</span></template>
      </p>
    </div>
    <div class="relative h-9">
      <div class="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sunken" />
      <div
        v-if="buyer !== null && merchant !== null"
        class="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-all duration-700 ease-out"
        :class="agreedMinor !== null ? 'bg-ok' : 'bg-gradient-to-r from-merchant/50 to-buyer/50'"
        :style="{ left: `${Math.min(buyer, merchant)}%`, width: `${Math.max(1.2, Math.abs(buyer - merchant))}%` }"
      />
      <div
        v-if="merchant !== null"
        class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out"
        :style="{ left: `${merchant}%` }"
      >
        <span class="block size-4 rounded-full bg-merchant ring-4 ring-merchant-soft" />
      </div>
      <div
        v-if="buyer !== null"
        class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out"
        :style="{ left: `${buyer}%` }"
      >
        <span class="block size-4 rounded-full bg-buyer ring-4 ring-buyer-soft" />
      </div>
    </div>
    <div class="mt-1 flex justify-between text-xs text-muted tabular">
      <span>{{ money(0, currency) }}</span>
      <span class="flex gap-4">
        <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-merchant" /> Merchant offer {{ money(merchantMinor, currency) }}</span>
        <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-buyer" /> Buyer ask {{ money(buyerMinor, currency) }}</span>
      </span>
      <span>{{ money(totalMinor, currency) }}</span>
    </div>
  </div>
</template>
