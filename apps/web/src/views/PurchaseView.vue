<script setup lang="ts">
import { BadgeCheck, ExternalLink, ShieldCheck } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';

import { api, errorMessage } from '@/api/client';
import ErrorNotice from '@/components/ErrorNotice.vue';
import { money, toMinor } from '@/lib/format';
import { useSession } from '@/stores/session';

/**
 * A real PayPal sandbox purchase: the server creates the order, PayPal's own page takes the
 * (sandbox) buyer's approval, and the server captures it on return. No card details ever pass
 * through ResolveOS.
 */
const session = useSession();
const merchants = ref<{ id: string; businessName: string; currency: string }[]>([]);
const merchantId = ref('');
const description = ref('Everyday Jacket (M, charcoal)');
const amount = ref('180.00');
const busy = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    merchants.value = (await api.get<{ merchants: typeof merchants.value }>('/merchants')).merchants;
    merchantId.value = merchants.value[0]?.id ?? '';
    await session.loadStatus();
  } catch (e) {
    error.value = errorMessage(e);
  }
});

async function pay() {
  const amountMinor = toMinor(amount.value);
  if (amountMinor === null || amountMinor < 100) {
    error.value = 'Enter an amount of at least $1.00.';
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    const order = await api.post<{ orderId: string; approveUrl: string | null }>('/paypal/orders', {
      merchantId: merchantId.value,
      amountMinor,
      currency: 'USD',
      description: description.value,
    });
    if (!order.approveUrl) throw new Error('PayPal did not return an approval link.');
    window.location.assign(order.approveUrl);
  } catch (e) {
    error.value = errorMessage(e);
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <p class="eyebrow">Real PayPal sandbox</p>
    <h1 class="mt-1 text-2xl font-semibold tracking-tight">Create a sandbox transaction</h1>
    <p class="mt-1 text-sm text-muted text-pretty">
      This makes a genuine PayPal sandbox payment you can later dispute and settle. It uses PayPal’s test money only: sign in on PayPal with your <strong>sandbox personal</strong> account, never your real PayPal login.
    </p>

    <div v-if="session.status && !session.status.connected" class="mt-5">
      <ErrorNotice title="PayPal sandbox is not connected" :message="session.status.problem ?? 'Add sandbox credentials to .env and restart the server.'" />
    </div>

    <form class="card mt-6 space-y-5 p-6" @submit.prevent="pay">
      <div>
        <label class="label" for="merchant">Merchant</label>
        <select id="merchant" v-model="merchantId" class="input">
          <option v-for="m in merchants" :key="m.id" :value="m.id">{{ m.businessName }} ({{ m.currency }})</option>
        </select>
      </div>
      <div>
        <label class="label" for="item">Item</label>
        <input id="item" v-model="description" class="input" maxlength="120" required />
      </div>
      <div>
        <label class="label" for="amount">Amount (USD)</label>
        <input id="amount" v-model="amount" class="input tabular" inputmode="decimal" required />
        <p class="mt-1 text-xs text-muted">{{ toMinor(amount) !== null ? money(toMinor(amount), 'USD') : 'Enter an amount like 180.00' }}</p>
      </div>
      <ErrorNotice v-if="error" :message="error" />
      <div class="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button type="submit" class="btn btn-primary btn-lg" :disabled="busy || !session.status?.connected || !merchantId">
          <ExternalLink class="size-4" /> {{ busy ? 'Opening PayPal…' : 'Pay with PayPal sandbox' }}
        </button>
        <span class="inline-flex items-center gap-1.5 text-xs text-muted"><ShieldCheck class="size-4 text-ok" /> You approve on sandbox.paypal.com</span>
      </div>
    </form>

    <ol class="mt-6 grid gap-3 text-sm sm:grid-cols-3">
      <li class="card p-4"><BadgeCheck class="mb-2 size-5 text-primary" /><p class="font-semibold">1. Order created</p><p class="text-muted">by the server, via PayPal’s Orders API</p></li>
      <li class="card p-4"><BadgeCheck class="mb-2 size-5 text-primary" /><p class="font-semibold">2. You approve</p><p class="text-muted">on PayPal’s sandbox page</p></li>
      <li class="card p-4"><BadgeCheck class="mb-2 size-5 text-primary" /><p class="font-semibold">3. Captured</p><p class="text-muted">the capture ID comes from PayPal’s response</p></li>
    </ol>
  </div>
</template>
