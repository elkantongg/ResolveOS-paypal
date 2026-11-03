<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { api, errorMessage } from '@/api/client';
import type { Transaction } from '@/api/types';
import ErrorNotice from '@/components/ErrorNotice.vue';
import Skeleton from '@/components/Skeleton.vue';
import SourceBadge from '@/components/SourceBadge.vue';
import { CATEGORY_LABEL, money, toMinor } from '@/lib/format';

const route = useRoute();
const router = useRouter();
const transactions = ref<Transaction[] | null>(null);
const transactionId = ref(typeof route.query.transaction === 'string' ? route.query.transaction : '');
const category = ref('ITEM_NOT_RECEIVED');
const title = ref('');
const description = ref('');
const desiredOutcome = ref('');
const floor = ref('');
const fullOnly = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const all = (await api.get<{ transactions: Transaction[] }>('/transactions')).transactions;
    transactions.value = all.filter((t) => t.paymentStatus === 'CAPTURED' || t.paymentStatus === 'PARTIALLY_REFUNDED');
    if (!transactionId.value) transactionId.value = transactions.value[0]?.id ?? '';
  } catch (e) {
    error.value = errorMessage(e);
  }
});

const selected = computed(() => transactions.value?.find((t) => t.id === transactionId.value) ?? null);

function useScenario() {
  category.value = 'ITEM_NOT_RECEIVED';
  title.value = 'The missing jacket';
  description.value =
    'Tracking says the parcel was delivered on 28 Oct, but I never received it. I was home most of the day, and I checked with two neighbours and the building mailroom; nobody has it.';
  desiredOutcome.value = 'A full refund, or a fair partial refund since I like the shop';
  floor.value = selected.value ? (Math.round(selected.value.originalAmountMinor * 0.45) / 100).toFixed(2) : '80.00';
  fullOnly.value = false;
}

async function submit() {
  if (!selected.value) return;
  const floorMinor = fullOnly.value ? null : toMinor(floor.value || '0');
  if (!fullOnly.value && floorMinor === null) {
    error.value = 'Enter the least refund you would accept, like 80.00.';
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    const created = await api.post<{ case: { id: string } }>('/cases', {
      transactionId: selected.value.id,
      category: category.value,
      title: title.value,
      description: description.value,
      desiredOutcome: desiredOutcome.value,
      floorMinor,
    });
    await router.push(`/cases/${created.case.id}`);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <h1 class="text-2xl font-semibold tracking-tight">Report a problem</h1>
    <p class="mt-1 text-sm text-muted">Open a case on one of your completed PayPal sandbox payments. The merchant sees it straight away.</p>

    <div v-if="transactions === null" class="card mt-6 p-6"><Skeleton :lines="6" /></div>
    <div v-else-if="!transactions.length" class="card mt-6 p-8 text-center">
      <p class="font-semibold">No completed payments yet</p>
      <p class="mt-1 text-sm text-muted">Make a sandbox purchase first, then report a problem with it.</p>
      <RouterLink to="/purchase" class="btn btn-primary mt-5">Create a sandbox transaction</RouterLink>
    </div>
    <form v-else class="card mt-6 space-y-5 p-6" @submit.prevent="submit">
      <div>
        <label class="label" for="txn">Payment</label>
        <select id="txn" v-model="transactionId" class="input">
          <option v-for="t in transactions" :key="t.id" :value="t.id">{{ t.description }} · {{ money(t.originalAmountMinor, t.currency) }}</option>
        </select>
        <div v-if="selected" class="mt-2 flex items-center gap-2 text-xs text-muted">
          <SourceBadge :source="selected.sourceType" :capture-id="selected.paypalCaptureId" />
          <span v-if="selected.paypalCaptureId" class="mono">{{ selected.paypalCaptureId }}</span>
        </div>
      </div>
      <button type="button" class="btn btn-sm btn-secondary" @click="useScenario"><Sparkles class="size-3.5" /> Fill in the “missing jacket” scenario</button>
      <div class="grid gap-5 sm:grid-cols-2">
        <div>
          <label class="label" for="cat">What went wrong</label>
          <select id="cat" v-model="category" class="input">
            <option v-for="(label, key) in CATEGORY_LABEL" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
        <div>
          <label class="label" for="title">Short title</label>
          <input id="title" v-model="title" class="input" minlength="4" maxlength="80" required />
        </div>
      </div>
      <div>
        <label class="label" for="desc">Describe it</label>
        <textarea id="desc" v-model="description" class="input" rows="4" minlength="10" maxlength="1000" required />
      </div>
      <div>
        <label class="label" for="want">What would make it right?</label>
        <input id="want" v-model="desiredOutcome" class="input" maxlength="200" required />
      </div>
      <fieldset class="rounded-xl border border-line p-4">
        <legend class="px-1 text-sm font-semibold">Your private limit</legend>
        <p class="mb-3 text-xs text-muted">Only your agent sees this. The server will never let it accept less, and the merchant never sees it.</p>
        <label class="mb-3 flex items-center gap-2 text-sm"><input v-model="fullOnly" type="checkbox" class="size-4" /> I only accept a full refund</label>
        <div v-if="!fullOnly">
          <label class="label" for="floor">Least refund I’d accept (USD)</label>
          <input id="floor" v-model="floor" class="input tabular" inputmode="decimal" placeholder="80.00" />
        </div>
      </fieldset>
      <ErrorNotice v-if="error" :message="error" />
      <div class="flex gap-3 border-t border-line pt-5">
        <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Opening case…' : 'Open case' }}</button>
        <RouterLink to="/dashboard" class="btn btn-ghost">Cancel</RouterLink>
      </div>
    </form>
  </div>
</template>
