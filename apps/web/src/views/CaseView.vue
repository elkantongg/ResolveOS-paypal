
<script setup lang="ts">
import { ArrowLeft, ArrowRight, BadgeCheck, FileText, Plus, ReceiptText, Sparkles } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { api, errorMessage } from '@/api/client';
import type { CaseDetail } from '@/api/types';
import ErrorNotice from '@/components/ErrorNotice.vue';
import Skeleton from '@/components/Skeleton.vue';
import SourceBadge from '@/components/SourceBadge.vue';
import StageTracker from '@/components/StageTracker.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { CATEGORY_LABEL, dateTime, describeEvent, money, toMinor } from '@/lib/format';
import { useCaseEvents } from '@/lib/useCaseEvents';

const route = useRoute();
const caseId = route.params.id as string;
const detail = ref<CaseDetail | null>(null);
const error = ref<string | null>(null);

async function load() {
  try {
    detail.value = await api.get<CaseDetail>(`/cases/${caseId}`);
    if (detail.value.case.merchantMaxRefundMinor !== null) {
      limit.value = (detail.value.case.merchantMaxRefundMinor / 100).toFixed(2);
      preference.value = detail.value.case.merchantPreference ?? '';
    }
  } catch (e) {
    error.value = errorMessage(e);
  }
}
onMounted(load);
useCaseEvents(caseId, () => void load());

const kase = computed(() => detail.value?.case);
const txn = computed(() => detail.value?.transaction);
const role = computed(() => detail.value?.viewerRole);
const editable = computed(() => kase.value && ['OPEN', 'NO_AGREEMENT'].includes(kase.value.currentStatus));
const timeline = computed(() => (detail.value?.timeline ?? []).filter((e) => e.action !== 'agent.thinking').slice(-25).reverse());

// Add evidence
const adding = ref(false);
const form = ref({ evidenceType: 'TRACKING', title: '', content: '' });
const formError = ref<string | null>(null);
function demoTracking() {
  form.value = {
    evidenceType: 'TRACKING',
    title: 'Carrier tracking TRK-102',
    content: 'Carrier: Parcelline. Tracking TRK-102. Status: Delivered, 28 Oct, 14:12, "left at front door". No recipient signature was requested or captured. No delivery photo.',
  };
}
function demoPolicy() {
  form.value = {
    evidenceType: 'POLICY',
    title: 'Refund policy',
    content: 'For items marked delivered but reported missing, we offer a partial refund or a replacement after the buyer has checked with neighbours and building reception.',
  };
}
async function addEvidence() {
  formError.value = null;
  try {
    await api.post(`/cases/${caseId}/evidence`, form.value);
    adding.value = false;
    form.value = { evidenceType: 'TRACKING', title: '', content: '' };
    await load();
  } catch (e) {
    formError.value = errorMessage(e);
  }
}

// Merchant limits
const limit = ref('');
const preference = ref('');
const limitMessage = ref<string | null>(null);
async function saveLimits() {
  limitMessage.value = null;
  const minor = toMinor(limit.value);
  if (minor === null) {
    limitMessage.value = 'Enter an amount like 120.00';
    return;
  }
  try {
    await api.patch(`/cases/${caseId}/merchant-terms`, { maxRefundMinor: minor, preference: preference.value });
    limitMessage.value = 'Saved.';
    await load();
  } catch (e) {
    limitMessage.value = errorMessage(e);
  }
}
</script>

<template>
  <ErrorNotice v-if="error" :message="error" @retry="load" />
  <div v-else-if="!detail || !kase || !txn" class="card p-6"><Skeleton :lines="8" /></div>

  <div v-else class="space-y-5">
    <RouterLink to="/dashboard" class="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft class="size-4" /> Dashboard</RouterLink>
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="mono text-muted">{{ kase.reference }} · {{ CATEGORY_LABEL[kase.category] }}</p>
        <h1 class="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
          {{ kase.title }} <StatusBadge :status="kase.currentStatus" />
        </h1>
        <p class="mt-1 text-sm text-muted">{{ detail.buyer?.name }} ↔ {{ detail.merchant?.businessName }} · opened {{ dateTime(kase.createdAt) }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <RouterLink v-if="kase.currentStatus === 'RESOLVED'" :to="`/cases/${caseId}/receipt`" class="btn btn-secondary"><ReceiptText class="size-4" /> Receipt</RouterLink>
        <RouterLink v-if="['AWAITING_APPROVAL', 'PAYMENT_PROCESSING'].includes(kase.currentStatus)" :to="`/cases/${caseId}/settlement`" class="btn btn-secondary">Settlement</RouterLink>
        <RouterLink :to="`/cases/${caseId}/negotiate`" class="btn btn-primary btn-lg">Open Negotiation Room <ArrowRight class="size-4" /></RouterLink>
      </div>
    </div>

    <div class="card px-5 py-4"><StageTracker :status="kase.currentStatus" /></div>

    <div class="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div class="space-y-5">
        <section class="card p-6">
          <p class="eyebrow mb-2">Complaint</p>
          <p class="text-pretty text-ink">{{ kase.description }}</p>
          <p class="mt-3 text-sm"><span class="text-muted">Buyer wants:</span> {{ kase.buyerDesiredOutcome }}</p>
          <p v-if="kase.outcomeSummary" class="mt-4 rounded-xl bg-sunken px-4 py-3 text-sm text-ink-soft">{{ kase.outcomeSummary }}</p>
        </section>

        <section class="card">
          <div class="flex items-center justify-between border-b border-line px-6 py-4">
            <p class="font-semibold">Evidence <span class="ml-1 text-sm font-normal text-muted">{{ detail.evidence.length }}</span></p>
            <button v-if="editable && role !== 'OPERATOR'" type="button" class="btn btn-sm btn-secondary" @click="adding = !adding"><Plus class="size-3.5" /> Add evidence</button>
          </div>
          <form v-if="adding" class="space-y-3 border-b border-line bg-sunken/50 px-6 py-5" @submit.prevent="addEvidence">
            <div v-if="role === 'MERCHANT'" class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-sm btn-secondary" @click="demoTracking"><Sparkles class="size-3.5" /> Demo tracking record</button>
              <button type="button" class="btn btn-sm btn-secondary" @click="demoPolicy"><Sparkles class="size-3.5" /> Demo refund policy</button>
            </div>
            <div class="grid gap-3 sm:grid-cols-[180px_1fr]">
              <select v-model="form.evidenceType" class="input" aria-label="Evidence type">
                <option value="TRACKING">Tracking</option>
                <option value="ORDER_RECORD">Order record</option>
                <option value="PHOTO_DESCRIPTION">Photo description</option>
                <option value="MESSAGE">Message</option>
                <option value="POLICY">Policy</option>
                <option value="OTHER">Other</option>
              </select>
              <input v-model="form.title" class="input" placeholder="Title" aria-label="Title" required minlength="3" maxlength="80" />
            </div>
            <textarea v-model="form.content" class="input" rows="3" placeholder="What it shows" aria-label="Content" required minlength="5" maxlength="1500" />
            <p class="text-xs text-muted">Recorded as provided by the {{ role === 'MERCHANT' ? 'merchant' : 'buyer' }}, not independently verified. Agents treat it as a claim.</p>
            <ErrorNotice v-if="formError" :message="formError" />
            <button type="submit" class="btn btn-sm btn-primary">Add</button>
          </form>
          <ul class="divide-y divide-line">
            <li v-for="item in detail.evidence" :key="item.id" class="flex gap-4 px-6 py-4">
              <span class="mono mt-0.5 w-11 shrink-0 font-semibold text-muted">{{ item.code }}</span>
              <div class="min-w-0 flex-1">
                <p class="flex flex-wrap items-center gap-2 font-medium">
                  {{ item.title }}
                  <span v-if="item.verificationStatus === 'VERIFIED_PAYPAL'" class="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-px text-xs font-semibold text-ok"><BadgeCheck class="size-3" /> Verified from PayPal</span>
                  <span v-else class="rounded-full bg-sunken px-2 py-px text-xs font-medium text-muted">{{ item.sourceParty.toLowerCase() }}-provided</span>
                </p>
                <p class="mt-1 text-sm text-ink-soft text-pretty">{{ item.content }}</p>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <div class="space-y-5">
        <section class="card p-6">
          <div class="mb-4 flex items-center justify-between gap-2">
            <p class="font-semibold">Transaction</p>
            <SourceBadge :source="txn.sourceType" :capture-id="txn.paypalCaptureId" />
          </div>
          <p class="text-3xl font-semibold tracking-tight tabular">{{ money(txn.originalAmountMinor, txn.currency) }}</p>
          <p class="text-sm text-muted">{{ txn.description }}</p>
          <dl class="mt-4 space-y-2 text-sm">
            <div class="flex justify-between gap-4"><dt class="text-muted">Refunded so far</dt><dd class="tabular">{{ money(txn.amountRefundedMinor, txn.currency) }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-muted">Payment status</dt><dd>{{ txn.paymentStatus.replace('_', ' ').toLowerCase() }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-muted">PayPal order</dt><dd class="mono truncate">{{ txn.paypalOrderId ?? '—' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-muted">PayPal capture</dt><dd class="mono truncate">{{ txn.paypalCaptureId ?? '—' }}</dd></div>
          </dl>
          <p v-if="txn.sourceType === 'DEMO_SEED'" class="mt-4 rounded-lg bg-sunken px-3 py-2 text-xs text-muted">Seeded demo data: negotiation works, but no real refund can run on it.</p>
        </section>

        <section v-if="role === 'MERCHANT' || role === 'OPERATOR'" class="card p-6">
          <p class="font-semibold">Merchant limits for this case</p>
          <p class="mb-4 text-xs text-muted">Private to {{ detail.merchant?.businessName }}. The merchant agent may never offer more; the server enforces it.</p>
          <form class="space-y-3" @submit.prevent="saveLimits">
            <div>
              <label class="label" for="limit">Most we would refund (USD)</label>
              <input id="limit" v-model="limit" class="input tabular" :disabled="!editable || role !== 'MERCHANT'" inputmode="decimal" />
            </div>
            <div>
              <label class="label" for="pref">Preferred outcome</label>
              <input id="pref" v-model="preference" class="input" :disabled="!editable || role !== 'MERCHANT'" maxlength="200" />
            </div>
            <div v-if="editable && role === 'MERCHANT'" class="flex items-center gap-3">
              <button type="submit" class="btn btn-sm btn-primary">Save limits</button>
              <span v-if="limitMessage" class="text-xs text-muted">{{ limitMessage }}</span>
            </div>
            <p v-else class="text-xs text-muted">Locked while negotiating or after an agreement.</p>
          </form>
        </section>

        <section class="card p-6">
          <p class="mb-3 flex items-center gap-2 font-semibold"><FileText class="size-4" /> Timeline</p>
          <ol class="space-y-2.5">
            <li v-for="event in timeline" :key="event.id" class="text-sm">
              <p class="text-ink-soft">{{ describeEvent(event) }}</p>
              <p class="text-xs text-muted">{{ dateTime(event.createdAt) }}</p>
            </li>
          </ol>
        </section>
      </div>
    </div>
  </div>
</template>
