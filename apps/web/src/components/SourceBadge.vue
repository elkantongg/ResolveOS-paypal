<script setup lang="ts">
import { BadgeCheck, FlaskConical } from 'lucide-vue-next';

/** Whether a payment is a verified PayPal sandbox capture or seeded demonstration data. */
defineProps<{ source: 'PAYPAL_SANDBOX' | 'DEMO_SEED'; captureId?: string | null }>();
</script>

<template>
  <span
    v-if="source === 'PAYPAL_SANDBOX' && captureId"
    class="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok ring-1 ring-inset ring-ok-line"
    :title="`PayPal sandbox capture ${captureId}`"
  >
    <BadgeCheck class="size-3.5" aria-hidden="true" /> PayPal sandbox · verified
  </span>
  <span
    v-else-if="source === 'PAYPAL_SANDBOX'"
    class="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn ring-1 ring-inset ring-warn-line"
  >
    PayPal sandbox · not captured
  </span>
  <span
    v-else
    class="inline-flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-inset ring-line"
    title="Seeded demonstration data. No real PayPal payment exists, so no refund can be processed."
  >
    <FlaskConical class="size-3.5" aria-hidden="true" /> Demo data
  </span>
</template>
