<script setup lang="ts">
import { BadgeCheck, CircleX, Loader2 } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { api, errorMessage } from '@/api/client';
import type { Transaction } from '@/api/types';
import ErrorNotice from '@/components/ErrorNotice.vue';
import { dateTime, money } from '@/lib/format';

/** PayPal sends the buyer back here; the server captures the order and reports PayPal's answer. */
const route = useRoute();
const cancelled = Boolean(route.meta.cancelled);
const orderId = typeof route.query.token === 'string' ? route.query.token : null;
const txn = ref<Transaction | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  if (cancelled || !orderId) return;
  try {
    txn.value = (await api.post<{ transaction: Transaction }>(`/paypal/orders/${encodeURIComponent(orderId)}/capture`)).transaction;
  } catch (e) {
    error.value = errorMessage(e);
  }
});
</script>

<template>
  <div class="mx-auto max-w-xl py-6">
    <div v-if="cancelled" class="card p-8 text-center">
      <CircleX class="mx-auto mb-3 size-10 text-muted" />
      <h1 class="text-xl font-semibold">Payment cancelled</h1>
      <p class="mt-1 text-sm text-muted">Nothing was charged. You can start again any time.</p>
      <RouterLink to="/purchase" class="btn btn-secondary mt-6">Back to purchase</RouterLink>
    </div>
    <div v-else-if="error" class="space-y-4">
      <ErrorNotice title="PayPal did not capture this payment" :message="error" />
      <RouterLink to="/purchase" class="btn btn-secondary">Back to purchase</RouterLink>
    </div>
    <div v-else-if="!txn" class="card p-10 text-center" aria-live="polite">
      <Loader2 class="mx-auto mb-3 size-8 animate-spin text-primary" />
      <p class="font-semibold">Capturing your payment with PayPal…</p>
      <p class="mt-1 text-sm text-muted">Order {{ orderId }}</p>
    </div>
    <div v-else class="card overflow-hidden">
      <div class="bg-ok-soft px-8 py-7 text-center">
        <BadgeCheck class="mx-auto mb-3 size-11 text-ok" />
        <h1 class="text-xl font-semibold">{{ txn.paymentStatus === 'CAPTURED' ? 'Payment captured by PayPal sandbox' : 'PayPal is still processing this payment' }}</h1>
        <p class="mt-1 text-3xl font-semibold tabular">{{ money(txn.originalAmountMinor, txn.currency) }}</p>
      </div>
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 px-8 py-6 text-sm">
        <dt class="text-muted">Item</dt><dd>{{ txn.description }}</dd>
        <dt class="text-muted">PayPal order</dt><dd class="mono">{{ txn.paypalOrderId }}</dd>
        <dt class="text-muted">PayPal capture</dt><dd class="mono">{{ txn.paypalCaptureId }}</dd>
        <dt class="text-muted">Paid by</dt><dd>{{ txn.payerEmail ?? '—' }}</dd>
        <dt class="text-muted">Captured</dt><dd>{{ txn.capturedAt ? dateTime(txn.capturedAt) : '—' }}</dd>
      </dl>
      <div class="flex flex-wrap gap-3 border-t border-line px-8 py-5">
        <RouterLink :to="{ path: '/cases/new', query: { transaction: txn.id } }" class="btn btn-primary">Report a problem with this order</RouterLink>
        <RouterLink to="/dashboard" class="btn btn-secondary">Go to dashboard</RouterLink>
      </div>
    </div>
  </div>
</template>
