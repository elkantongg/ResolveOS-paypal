
<script setup lang="ts">
import { ArrowLeft, ArrowRight, BadgeCheck, CircleDashed, CircleX, Clock, FlaskConical, Loader2, MessageSquareWarning, RefreshCw, ShieldCheck } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { api, errorMessage } from '@/api/client';
import type { CaseDetail, Role, SettlementView } from '@/api/types';
import ErrorNotice from '@/components/ErrorNotice.vue';
import Skeleton from '@/components/Skeleton.vue';
import SourceBadge from '@/components/SourceBadge.vue';
import StageTracker from '@/components/StageTracker.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { ACTION_LABEL, dateTime, money } from '@/lib/format';
import { useCaseEvents } from '@/lib/useCaseEvents';

/**
 * Settlement approval. Each person approves for themselves only (the server takes the role from
 * the session). The refund runs only after both approvals of this exact version, and its status
 * shown here is PayPal's, never assumed.
 */
const route = useRoute();
const caseId = route.params.id as string;
const view = ref<SettlementView | null>(null);
const detail = ref<CaseDetail | null>(null);
const error = ref<string | null>(null);
const busy = ref<string | null>(null);
const note = ref('');
const showNote = ref<'REJECT' | 'REQUEST_REVISION' | null>(null);

async function load() {
  try {
    [view.value, detail.value] = await Promise.all([
      api.get<SettlementView>(`/cases/${caseId}/settlement`),
      api.get<CaseDetail>(`/cases/${caseId}`),
    ]);
  } catch (e) {
    error.value = errorMessage(e);
  }
}
onMounted(load);
useCaseEvents(caseId, (event) => {
  if (event.action.startsWith('approval') || event.action.startsWith('refund') || event.action.startsWith('settlement') || event.action.startsWith('case.')) void load();
});

const viewer = computed<Role>(() => detail.value?.viewerRole ?? 'OPERATOR');
const proposal = computed(() => view.value?.proposal ?? null);
const decisionOf = (role: Role) => view.value?.approvals.find((a) => a.role === role && a.validForCurrentTerms) ?? null;
const myDecision = computed(() => decisionOf(viewer.value));
const canDecide = computed(
  () => (viewer.value === 'BUYER' || viewer.value === 'MERCHANT') && proposal.value?.currentStatus === 'PENDING_APPROVAL' && !myDecision.value,
);
const isReal = computed(() => view.value?.transaction?.sourceType === 'PAYPAL_SANDBOX' && Boolean(view.value.transaction.paypalCaptureId));
const refund = computed(() => view.value?.refund ?? null);
const movesMoney = computed(() => proposal.value?.settlementType === 'FULL_REFUND' || proposal.value?.settlementType === 'PARTIAL_REFUND');

async function decide(decision: 'APPROVE' | 'REJECT' | 'REQUEST_REVISION') {
  if (!proposal.value) return;
  if (decision !== 'APPROVE' && showNote.value !== decision) {
    showNote.value = decision;
    return;
  }
  busy.value = decision;
  error.value = null;
  try {
    view.value = await api.post<SettlementView>(
      `/cases/${caseId}/settlement/${decision === 'APPROVE' ? 'approve' : decision === 'REJECT' ? 'reject' : 'revise'}`,
      { proposalVersion: proposal.value.proposalVersion, note: note.value || undefined },
    );
    showNote.value = null;
    note.value = '';
    await load();
  } catch (e) {
    error.value = errorMessage(e);
    await load();
  } finally {
    busy.value = null;
  }
}

async function reconcile() {
  busy.value = 'reconcile';
  error.value = null;
  try {
    await api.post(`/paypal/refunds/reconcile`, { caseId });
    await load();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = null;
  }
}

const refundCopy = computed(() => {
  const r = refund.value;
  if (!r) return null;
  switch (r.status) {
    case 'COMPLETED':
      return { tone: 'ok', title: 'Refund completed by PayPal', text: `PayPal confirmed refund ${r.paypalRefundId}.` };
    case 'PENDING':
      return { tone: 'warn', title: 'PayPal reports the refund as pending', text: 'It is not final yet. PayPal will confirm it; you can also check now.' };
    case 'PROCESSING':
    case 'AUTHORIZED':
      return { tone: 'info', title: 'Sending the refund to PayPal…', text: 'Waiting for PayPal’s answer.' };
    case 'FAILED':
      return { tone: 'danger', title: 'PayPal did not process the refund', text: r.errorMessage ?? 'The refund failed. No money moved.' };
    case 'UNKNOWN_REQUIRES_RECONCILIATION':
      return { tone: 'warn', title: 'Outcome unknown: needs checking with PayPal', text: 'PayPal did not answer in time. The money may or may not have moved. Checking re-sends the same request id, so PayPal reports the original result instead of refunding twice.' };
    default:
      return { tone: 'info', title: r.status, text: '' };
  }
});
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-5">
    <RouterLink :to="`/cases/${caseId}/negotiate`" class="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft class="size-4" /> Negotiation room</RouterLink>
    <ErrorNotice v-if="error && !view" :message="error" @retry="load" />
    <div v-if="!view || !detail" class="card p-6"><Skeleton :lines="8" /></div>

    <template v-else>
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-2xl font-semibold tracking-tight">Settlement approval</h1>
        <StatusBadge :status="view.caseStatus" />
        <SourceBadge v-if="view.transaction" :source="view.transaction.sourceType" :capture-id="view.transaction.paypalCaptureId" />
      </div>
      <div class="card px-5 py-4"><StageTracker :status="view.caseStatus" /></div>

      <div v-if="!proposal" class="card p-8 text-center text-muted">No settlement has been proposed yet. Agents propose one in the negotiation room.</div>

      <div v-else class="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <!-- Terms -->
        <section class="card overflow-hidden">
          <div class="border-b border-line px-6 py-4">
            <p class="eyebrow">Proposed terms · version {{ proposal.proposalVersion }}</p>
            <p class="mt-1 text-pretty text-ink-soft">{{ proposal.summary }}</p>
          </div>
          <dl class="grid grid-cols-2 gap-px bg-line">
            <div class="bg-surface px-6 py-4">
              <dt class="text-xs text-muted">Original payment</dt>
              <dd class="mt-1 text-xl font-semibold tabular">{{ money(view.transaction?.amountMinor, proposal.currency) }}</dd>
            </div>
            <div class="bg-surface px-6 py-4">
              <dt class="text-xs text-muted">{{ movesMoney ? 'Refund to buyer' : 'Settlement' }}</dt>
              <dd class="mt-1 text-xl font-semibold text-ok tabular">{{ movesMoney ? money(proposal.refundAmountMinor, proposal.currency) : ACTION_LABEL[proposal.settlementType] }}</dd>
            </div>
            <div class="bg-surface px-6 py-4">
              <dt class="text-xs text-muted">Type</dt>
              <dd class="mt-1 font-medium">{{ ACTION_LABEL[proposal.settlementType] }}</dd>
            </div>
            <div class="bg-surface px-6 py-4">
              <dt class="text-xs text-muted">Terms fingerprint</dt>
              <dd class="mono mt-1 truncate text-muted" :title="proposal.termsHash">{{ proposal.termsHash.slice(0, 16) }}…</dd>
            </div>
          </dl>
          <div v-if="proposal.requiresManualAction" class="border-t border-line bg-warn-soft px-6 py-3 text-sm text-warn">
            A replacement must be shipped by the merchant manually. Resolve AI does not ship anything.
          </div>
          <div v-if="movesMoney && !isReal" class="flex gap-3 border-t border-line bg-sunken px-6 py-3 text-sm text-ink-soft">
            <FlaskConical class="mt-0.5 size-4 shrink-0 text-muted" />
            This case is seeded demo data with no real PayPal payment, so no refund will be processed even after both approvals. Use a sandbox purchase for a real refund.
          </div>
        </section>

        <!-- Approvals -->
        <section class="card p-6">
          <p class="eyebrow mb-3">Approvals</p>
          <ul class="space-y-3">
            <li v-for="role in ['BUYER', 'MERCHANT'] as const" :key="role" class="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
              <span class="grid size-9 place-items-center rounded-lg" :class="role === 'BUYER' ? 'bg-buyer-soft text-buyer' : 'bg-merchant-soft text-merchant'">
                <BadgeCheck v-if="decisionOf(role)?.decision === 'APPROVE'" class="size-5" />
                <CircleX v-else-if="decisionOf(role)?.decision === 'REJECT'" class="size-5 text-danger" />
                <MessageSquareWarning v-else-if="decisionOf(role)?.decision === 'REQUEST_REVISION'" class="size-5 text-warn" />
                <CircleDashed v-else class="size-5" />
              </span>
              <span class="flex-1 text-sm">
                <span class="block font-semibold">{{ role === 'BUYER' ? detail.buyer?.name : detail.merchant?.businessName }}<span v-if="viewer === role" class="ml-1.5 text-xs font-medium text-primary">You</span></span>
                <span class="block text-xs text-muted">
                  <template v-if="decisionOf(role)">{{ decisionOf(role)!.decision === 'APPROVE' ? 'Approved' : decisionOf(role)!.decision === 'REJECT' ? 'Rejected' : 'Asked for a revision' }} · {{ dateTime(decisionOf(role)!.createdAt) }}</template>
                  <template v-else>Waiting for {{ role === 'BUYER' ? 'the buyer' : 'the merchant' }}</template>
                </span>
              </span>
            </li>
          </ul>

          <div v-if="canDecide" class="mt-5 space-y-3 border-t border-line pt-5">
            <p class="text-sm text-ink-soft">You are approving <strong>version {{ proposal.proposalVersion }}</strong> exactly as shown. If the terms change, your approval no longer counts.</p>
            <div v-if="showNote" class="space-y-2">
              <label class="label" for="note">{{ showNote === 'REJECT' ? 'Why are you rejecting? (optional)' : 'What should change?' }}</label>
              <textarea id="note" v-model="note" class="input" rows="2" maxlength="300" />
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-primary" :disabled="busy !== null" @click="decide('APPROVE')">
                <Loader2 v-if="busy === 'APPROVE'" class="size-4 animate-spin" /><ShieldCheck v-else class="size-4" /> Approve
              </button>
              <button type="button" class="btn btn-secondary" :disabled="busy !== null" @click="decide('REQUEST_REVISION')">
                {{ showNote === 'REQUEST_REVISION' ? 'Send revision request' : 'Request revision' }}
              </button>
              <button type="button" class="btn btn-danger" :disabled="busy !== null" @click="decide('REJECT')">
                {{ showNote === 'REJECT' ? 'Confirm reject' : 'Reject' }}
              </button>
            </div>
          </div>
          <p v-else-if="viewer === 'OPERATOR'" class="mt-4 text-xs text-muted">The demo operator cannot approve for anyone.</p>
          <p v-else-if="myDecision && proposal.currentStatus === 'PENDING_APPROVAL'" class="mt-4 flex items-center gap-2 text-sm text-muted">
            <Clock class="size-4" /> Your decision is recorded. Waiting for the other party. Switch person (top right) to approve as them.
          </p>
          <ErrorNotice v-if="error" :message="error" class="mt-4" />
        </section>
      </div>

      <!-- Payment execution -->
      <section v-if="proposal && movesMoney && isReal" class="card p-6">
        <p class="eyebrow mb-3">PayPal refund</p>
        <div v-if="!refund" class="flex items-center gap-3 text-sm text-muted">
          <CircleDashed class="size-5" /> Runs automatically once both parties have approved version {{ proposal.proposalVersion }}.
        </div>
        <div
          v-else-if="refundCopy"
          class="rounded-xl border px-5 py-4"
          :class="{
            'border-ok-line bg-ok-soft': refundCopy.tone === 'ok',
            'border-warn-line bg-warn-soft': refundCopy.tone === 'warn',
            'border-danger-line bg-danger-soft': refundCopy.tone === 'danger',
            'border-primary-line bg-primary-soft': refundCopy.tone === 'info',
          }"
        >
          <p class="font-semibold">{{ refundCopy.title }}</p>
          <p class="mt-1 text-sm text-ink-soft text-pretty">{{ refundCopy.text }}</p>
          <dl class="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div><dt class="inline text-muted">Amount </dt><dd class="inline font-semibold tabular">{{ money(refund.amountMinor, refund.currency) }}</dd></div>
            <div><dt class="inline text-muted">PayPal refund ID </dt><dd class="mono inline">{{ refund.paypalRefundId ?? 'not issued' }}</dd></div>
            <div><dt class="inline text-muted">Capture </dt><dd class="mono inline">{{ view.transaction?.paypalCaptureId }}</dd></div>
            <div><dt class="inline text-muted">Request id </dt><dd class="mono inline">{{ refund.requestId }}</dd></div>
          </dl>
          <div class="mt-4 flex flex-wrap gap-2">
            <button v-if="refund.status === 'UNKNOWN_REQUIRES_RECONCILIATION' || refund.status === 'PENDING'" type="button" class="btn btn-secondary btn-sm" :disabled="busy !== null" @click="reconcile">
              <RefreshCw class="size-3.5" :class="busy === 'reconcile' ? 'animate-spin' : ''" /> Check with PayPal
            </button>
            <RouterLink v-if="refund.status === 'COMPLETED'" :to="`/cases/${caseId}/receipt`" class="btn btn-primary btn-sm">View receipt <ArrowRight class="size-3.5" /></RouterLink>
          </div>
        </div>
      </section>

      <RouterLink v-if="view.caseStatus === 'RESOLVED' && (!movesMoney || !isReal)" :to="`/cases/${caseId}/receipt`" class="btn btn-primary">View receipt <ArrowRight class="size-4" /></RouterLink>
      <p class="text-xs text-muted">Resolve AI is an independent pre-dispute tool. It does not guarantee PayPal Buyer or Seller Protection outcomes and does not replace PayPal’s Resolution Center.</p>
    </template>
  </div>
</template>
