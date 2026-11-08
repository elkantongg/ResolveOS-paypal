
<script setup lang="ts">
import { ArrowLeft, ArrowRight, BadgeCheck, ChevronDown, FileText, Plus, ReceiptText, Sparkles, CheckCircle2, Clock3, AlertCircle, MessageSquareText } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { api, errorMessage } from '@/api/client';
import type { CaseDetail, SettlementView } from '@/api/types';
import ErrorNotice from '@/components/ErrorNotice.vue';
import Skeleton from '@/components/Skeleton.vue';
import SourceBadge from '@/components/SourceBadge.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { CATEGORY_LABEL, dateTime, describeEvent, money, toMinor } from '@/lib/format';
import { useCaseEvents } from '@/lib/useCaseEvents';

const route = useRoute();
const caseId = route.params.id as string;
const detail = ref<CaseDetail | null>(null);
const error = ref<string | null>(null);
const settlement = ref<SettlementView | null>(null);
const showAllActivity = ref(false);

async function load() {
  try {
    detail.value = await api.get<CaseDetail>(`/cases/${caseId}`);
    if (['AWAITING_APPROVAL', 'PAYMENT_PROCESSING', 'RESOLVED'].includes(detail.value.case.currentStatus)) {
      settlement.value = await api.get<SettlementView>(`/cases/${caseId}/settlement`).catch(() => null);
    } else {
      settlement.value = null;
    }
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


const proposal = computed(() => settlement.value?.proposal ?? null);
const approvalCount = computed(() => settlement.value?.approvals.filter(a => a.validForCurrentTerms && a.decision === 'APPROVE').length ?? 0);
const actionContent = computed(() => {
  switch (kase.value?.currentStatus) {
    case 'OPEN': return { title: 'Prepare this case', description: 'Review the complaint and evidence before starting a negotiation.', action: 'Go to negotiation', target: 'negotiate' };
    case 'IN_NEGOTIATION': return { title: 'Negotiation in progress', description: 'Review the agent discussion and proposed terms in the negotiation room.', action: 'View negotiation', target: 'negotiate' };
    case 'AWAITING_APPROVAL': return { title: approvalCount.value === 2 ? 'Both parties approved the terms' : 'Settlement awaits approval', description: approvalCount.value === 2 ? 'Both parties have agreed. Review the settlement to see what happens next.' : `${approvalCount.value} of 2 parties approved. Review the proposed terms and confirm whether your approval is still needed.`, action: 'Review settlement', target: 'settlement' };
    case 'PAYMENT_PROCESSING': return { title: 'Refund status needs confirmation', description: 'The settlement is in payment processing. Open settlement for the latest PayPal status; do not assume the refund completed.', action: 'Check payment status', target: 'settlement' };
    case 'RESOLVED': return { title: 'Case resolved', description: 'View the final outcome and any available PayPal receipt.', action: 'View receipt', target: 'receipt' };
    case 'NO_AGREEMENT': return { title: 'No agreement reached', description: 'Review the negotiation history and available next steps.', action: 'Review negotiation', target: 'negotiate' };
    default: return { title: 'Case escalated', description: 'This case needs additional review outside the automated negotiation.', action: 'Review case history', target: 'negotiate' };
  }
});
const visibleTimeline = computed(() => showAllActivity.value ? timeline.value : timeline.value.slice(0, 3));
const progressSteps = computed(() => {
  const status = kase.value?.currentStatus;
  const active = status === 'OPEN' ? 0 : status === 'IN_NEGOTIATION' ? 2 : status === 'AWAITING_APPROVAL' ? 3 : status === 'PAYMENT_PROCESSING' ? 3 : 4;
  return [
    { label: 'Opened', state: 'done' },
    { label: 'Evidence', state: active > 1 ? 'done' : active === 1 ? 'current' : 'upcoming' },
    { label: 'Negotiation', state: active > 2 ? 'done' : active === 2 ? 'current' : 'upcoming' },
    { label: 'Approval', state: active > 3 ? 'done' : active === 3 ? 'current' : 'upcoming' },
    { label: status === 'PAYMENT_PROCESSING' ? 'Processing' : status === 'NO_AGREEMENT' ? 'No agreement' : status === 'ESCALATED' ? 'Escalated' : 'Resolved', state: active === 4 ? 'current' : 'upcoming' },
  ];
});

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
  <main v-else class="case-workspace mx-auto max-w-6xl space-y-6 pb-10">
    <RouterLink to="/dashboard" class="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"><ArrowLeft class="size-4" /> All cases</RouterLink>

    <header class="flex flex-wrap items-start justify-between gap-5">
      <div class="min-w-0 space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="mono text-xs text-muted">{{ kase.reference }}</span>
          <span class="text-faint">·</span>
          <span class="text-sm text-muted">{{ CATEGORY_LABEL[kase.category] }}</span>
          <StatusBadge :status="kase.currentStatus" />
        </div>
        <h1 class="text-3xl font-semibold tracking-tight text-ink">{{ kase.title }}</h1>
        <p class="text-sm text-ink-soft">{{ detail.buyer?.name }} <span class="text-muted">↔</span> {{ detail.merchant?.businessName }}</p>
        <p class="text-xs text-muted">Opened {{ dateTime(kase.createdAt) }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <RouterLink v-if="kase.currentStatus === 'RESOLVED'" :to="`/cases/${caseId}/receipt`" class="btn btn-secondary"><ReceiptText class="size-4" /> View receipt</RouterLink>
        <RouterLink :to="`/cases/${caseId}/negotiate`" class="btn btn-secondary"><MessageSquareText class="size-4" /> Negotiation room</RouterLink>
      </div>
    </header>

    <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Case financial overview">
      <div class="card p-5">
        <p class="eyebrow">Original payment</p>
        <p class="mt-2 text-2xl font-semibold tabular text-ink">{{ money(txn.originalAmountMinor, txn.currency) }}</p>
        <p class="mt-1 text-sm text-muted">{{ txn.description }}</p>
      </div>
      <div class="card p-5">
        <p class="eyebrow">{{ proposal ? 'Proposed settlement' : 'Refunded so far' }}</p>
        <p class="mt-2 text-2xl font-semibold tabular" :class="proposal ? 'text-accent' : 'text-ink'">{{ money(proposal ? proposal.refundAmountMinor : txn.amountRefundedMinor, txn.currency) }}</p>
        <p class="mt-1 text-sm text-muted">{{ proposal ? (proposal.settlementType.replace('_', ' ').toLowerCase() + ' · not necessarily paid') : 'Confirmed transaction record' }}</p>
      </div>
      <div class="card p-5 sm:col-span-2 lg:col-span-1">
        <p class="eyebrow">Current status</p>
        <div class="mt-3"><StatusBadge :status="kase.currentStatus" /></div>
        <p class="mt-2 text-sm text-muted">{{ approvalCount }} of 2 settlement approvals recorded</p>
        <p v-if="txn.sourceType === 'DEMO_SEED'" class="mt-2 inline-flex items-center gap-1.5 text-xs text-warn"><AlertCircle class="size-3.5" /> Demo case · no PayPal refund can run</p>
      </div>
    </section>

    <section class="rounded-2xl border border-primary-line bg-primary-soft/50 p-5 sm:p-6" aria-labelledby="case-next-action">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="max-w-2xl">
          <p class="eyebrow mb-2 text-primary">Next step</p>
          <h2 id="case-next-action" class="text-lg font-semibold text-ink">{{ actionContent.title }}</h2>
          <p class="mt-2 text-sm leading-6 text-ink-soft">{{ actionContent.description }}</p>
        </div>
        <RouterLink :to="`/cases/${caseId}/${actionContent.target}`" class="btn btn-primary shrink-0 self-start">{{ actionContent.action }} <ArrowRight class="size-4" /></RouterLink>
      </div>
    </section>

    <section class="card px-5 py-5" aria-label="Case progress">
      <h2 class="mb-4 text-sm font-semibold text-ink">Case progress</h2>
      <ol class="grid grid-cols-5 gap-2">
        <li v-for="(step, index) in progressSteps" :key="index" class="min-w-0" :aria-current="step.state === 'current' ? 'step' : undefined">
          <div class="mb-2 h-1.5 rounded-full" :class="step.state === 'done' ? 'bg-accent' : step.state === 'current' ? 'bg-primary' : 'bg-sunken'"></div>
          <div class="flex items-center gap-1 text-xs sm:text-sm" :class="step.state === 'upcoming' ? 'text-muted' : 'font-medium text-ink'">
            <CheckCircle2 v-if="step.state === 'done'" class="hidden size-3.5 shrink-0 text-accent sm:block" />
            <Clock3 v-else-if="step.state === 'current'" class="hidden size-3.5 shrink-0 text-primary sm:block" />
            <span>{{ step.label }}</span>
          </div>
        </li>
      </ol>
      <p v-if="kase.currentStatus === 'PAYMENT_PROCESSING'" class="mt-3 text-xs text-muted">Payment processing is not the same as a confirmed PayPal refund.</p>
    </section>

    <div class="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
      <div class="space-y-5">
        <section class="card p-5 sm:p-6">
          <div class="mb-4 flex items-center justify-between"><h2 class="text-base font-semibold">Case overview</h2><span class="text-xs text-muted">Complaint</span></div>
          <p class="text-base leading-7 text-ink-soft">{{ kase.description }}</p>
          <p class="mt-4 text-sm"><span class="font-medium text-ink">Buyer requested:</span> <span class="text-ink-soft">{{ kase.buyerDesiredOutcome }}</span></p>
          <div v-if="kase.outcomeSummary" class="mt-5 rounded-xl border border-line bg-sunken px-4 py-4">
            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Recorded outcome</p>
            <p class="text-sm leading-6 text-ink-soft">{{ kase.outcomeSummary }}</p>
          </div>
        </section>

        <section class="card overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5 sm:px-6">
            <div><h2 class="text-base font-semibold">Evidence <span class="ml-1 text-sm font-normal text-muted">({{ detail.evidence.length }})</span></h2><p class="mt-1 text-xs text-muted">Expand an item to read the full record</p></div>
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
            <li v-for="item in detail.evidence" :key="item.id">
              <details class="group px-5 py-4 sm:px-6">
                <summary class="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                  <span class="mono w-12 shrink-0 text-xs font-semibold text-muted">{{ item.code }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block font-medium text-ink">{{ item.title }}</span>
                    <span class="mt-1 block text-xs text-muted">{{ item.verificationStatus === 'VERIFIED_PAYPAL' ? 'Verified from PayPal' : item.sourceParty.toLowerCase() + '-provided · not independently verified' }}</span>
                  </span>
                  <ChevronDown class="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div class="mt-4 border-t border-line pt-4 pl-0 sm:pl-15">
                  <p class="text-sm leading-6 text-ink-soft">{{ item.content }}</p>
                  <span v-if="item.verificationStatus === 'VERIFIED_PAYPAL'" class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ok"><BadgeCheck class="size-3.5" /> PayPal verified</span>
                </div>
              </details>
            </li>
            <li v-if="!detail.evidence.length" class="p-5 text-sm text-muted">No evidence submitted yet.</li>
          </ul>
        </section>
      </div>

      <aside class="space-y-5">
        <section class="card p-5 sm:p-6">
          <div class="mb-4 flex items-center justify-between gap-2">
            <h2 class="font-semibold">Payment details</h2>
            <SourceBadge :source="txn.sourceType" :capture-id="txn.paypalCaptureId" />
          </div>
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-muted">Payment status</dt><dd class="capitalize text-right">{{ txn.paymentStatus.replace('_', ' ').toLowerCase() }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-muted">Refunded so far</dt><dd class="tabular text-right">{{ money(txn.amountRefundedMinor, txn.currency) }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-muted">PayPal order</dt><dd class="mono max-w-[58%] truncate text-right" :title="txn.paypalOrderId ?? ''">{{ txn.paypalOrderId ?? '—' }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-muted">PayPal capture</dt><dd class="mono max-w-[58%] truncate text-right" :title="txn.paypalCaptureId ?? ''">{{ txn.paypalCaptureId ?? '—' }}</dd></div>
          </dl>
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


        <section class="card p-5 sm:p-6">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="flex items-center gap-2 font-semibold"><FileText class="size-4" /> Recent activity</h2>
            <span class="text-xs text-muted">{{ timeline.length }} events</span>
          </div>
          <ol v-if="timeline.length" class="space-y-4 border-l border-line pl-4">
            <li v-for="event in visibleTimeline" :key="event.id" class="relative">
              <span class="absolute -left-[21px] top-1 size-2 rounded-full bg-primary"></span>
              <p class="text-sm leading-6 text-ink-soft">{{ describeEvent(event) }}</p>
              <p class="mt-1 text-xs text-muted">{{ dateTime(event.createdAt) }}</p>
            </li>
          </ol>
          <p v-else class="text-sm text-muted">No activity recorded yet.</p>
          <button v-if="timeline.length > 3" type="button" class="mt-5 flex items-center gap-2 text-sm font-medium text-primary hover:underline" :aria-expanded="showAllActivity" @click="showAllActivity = !showAllActivity">
            {{ showAllActivity ? 'Show recent activity' : 'View all activity (' + timeline.length + ')' }}
            <ChevronDown class="size-4 transition-transform" :class="showAllActivity ? 'rotate-180' : ''" />
          </button>
        </section>
      </aside>
    </div>
  </main>
</template>
