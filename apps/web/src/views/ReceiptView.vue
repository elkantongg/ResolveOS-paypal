
<script setup lang="ts">
import { ArrowLeft, BadgeCheck, CircleAlert, Printer, Timer } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { api, errorMessage } from '@/api/client';
import type { Receipt } from '@/api/types';
import ErrorNotice from '@/components/ErrorNotice.vue';
import Logo from '@/components/Logo.vue';
import Skeleton from '@/components/Skeleton.vue';
import { ACTION_LABEL, dateTime, describeEvent, duration, money } from '@/lib/format';

/** The settlement receipt. A refund is called successful only if PayPal confirmed it. */
const route = useRoute();
const caseId = route.params.id as string;
const receipt = ref<Receipt | null>(null);
const error = ref<string | null>(null);

async function load() {
  try {
    receipt.value = await api.get<Receipt>(`/cases/${caseId}/receipt`);
  } catch (e) {
    error.value = errorMessage(e);
  }
}
onMounted(load);

const verified = computed(() => receipt.value?.refund?.verifiedByPayPal === true);
const print = () => window.print();
const timeline = computed(() => receipt.value?.timeline.filter((e) => e.action !== 'agent.thinking') ?? []);
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-5">
    <div class="flex items-center justify-between print:hidden">
      <RouterLink :to="`/cases/${caseId}`" class="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft class="size-4" /> Case</RouterLink>
      <button type="button" class="btn btn-sm btn-secondary" @click="print"><Printer class="size-3.5" /> Print</button>
    </div>
    <ErrorNotice v-if="error" :message="error" @retry="load" />
    <div v-if="!receipt" class="card p-6"><Skeleton :lines="10" /></div>

    <article v-else class="card overflow-hidden">
      <header class="flex items-start justify-between gap-4 border-b border-line px-8 py-6">
        <div>
          <Logo />
          <p class="mt-4 eyebrow">Settlement receipt</p>
          <p class="text-lg font-semibold">Case {{ receipt.reference }}</p>
        </div>
        <div class="text-right">
          <span v-if="verified" class="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-sm font-semibold text-ok ring-1 ring-inset ring-ok-line">
            <BadgeCheck class="size-4" /> Refund verified by PayPal sandbox
          </span>
          <span v-else-if="receipt.refund" class="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-sm font-semibold text-warn ring-1 ring-inset ring-warn-line">
            <CircleAlert class="size-4" /> Refund {{ receipt.refund.status.toLowerCase().replaceAll('_', ' ') }}
          </span>
          <span v-else class="inline-flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1 text-sm font-semibold text-muted ring-1 ring-inset ring-line">No PayPal refund</span>
        </div>
      </header>

      <section class="px-8 py-6">
        <p class="text-pretty text-ink-soft">{{ receipt.outcomeSummary ?? receipt.proposal?.summary ?? 'No settlement.' }}</p>
        <div v-if="receipt.refund" class="mt-6 rounded-xl bg-sunken px-6 py-5">
          <p class="text-xs text-muted">Refunded to {{ receipt.parties.buyer }}</p>
          <p class="text-4xl font-semibold tracking-tight tabular">{{ money(receipt.refund.amountMinor, receipt.refund.currency) }}</p>
          <p class="text-sm text-muted">of {{ money(receipt.transaction?.amountMinor, receipt.refund.currency) }} · {{ receipt.refund.currency }}</p>
        </div>
      </section>

      <dl class="grid grid-cols-1 gap-px border-y border-line bg-line sm:grid-cols-2">
        <div class="bg-surface px-8 py-3"><dt class="text-xs text-muted">PayPal refund ID</dt><dd class="mono mt-0.5">{{ receipt.refund?.paypalRefundId ?? '—' }}</dd></div>
        <div class="bg-surface px-8 py-3"><dt class="text-xs text-muted">Original capture ID</dt><dd class="mono mt-0.5">{{ receipt.transaction?.paypalCaptureId ?? '— (demo data)' }}</dd></div>
        <div class="bg-surface px-8 py-3"><dt class="text-xs text-muted">PayPal status</dt><dd class="mt-0.5 font-medium">{{ receipt.refund?.paypalStatus ?? '—' }}</dd></div>
        <div class="bg-surface px-8 py-3"><dt class="text-xs text-muted">Date</dt><dd class="mt-0.5">{{ receipt.refund ? dateTime(receipt.refund.updatedAt) : '—' }}</dd></div>
        <div class="bg-surface px-8 py-3"><dt class="text-xs text-muted">Settlement</dt><dd class="mt-0.5">{{ receipt.proposal ? `${ACTION_LABEL[receipt.proposal.settlementType]} · version ${receipt.proposal.proposalVersion}` : '—' }}</dd></div>
        <div class="bg-surface px-8 py-3"><dt class="text-xs text-muted">Agreement reference</dt><dd class="mono mt-0.5 truncate" :title="receipt.proposal?.termsHash">{{ receipt.proposal?.termsHash.slice(0, 24) ?? '—' }}</dd></div>
        <div class="bg-surface px-8 py-3"><dt class="text-xs text-muted">Buyer</dt><dd class="mt-0.5">{{ receipt.parties.buyer }} · {{ receipt.approvals.find((a) => a.role === 'BUYER')?.decision === 'APPROVE' ? 'approved' : 'not approved' }}</dd></div>
        <div class="bg-surface px-8 py-3"><dt class="text-xs text-muted">Merchant</dt><dd class="mt-0.5">{{ receipt.parties.merchant }} · {{ receipt.approvals.find((a) => a.role === 'MERCHANT')?.decision === 'APPROVE' ? 'approved' : 'not approved' }}</dd></div>
      </dl>

      <section v-if="receipt.metrics.totalSeconds !== null" class="border-b border-line px-8 py-6">
        <p class="eyebrow mb-3 flex items-center gap-1.5"><Timer class="size-3.5" /> Measured from this case’s audit log</p>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-xl bg-ok-soft px-4 py-3">
            <p class="text-xs text-ok">Complaint to resolution</p>
            <p class="text-xl font-semibold tabular text-ok">{{ duration(receipt.metrics.totalSeconds) }}</p>
          </div>
          <div class="rounded-xl bg-sunken px-4 py-3">
            <p class="text-xs text-muted">Agents negotiated</p>
            <p class="text-xl font-semibold tabular">{{ duration(receipt.metrics.negotiationSeconds) }}</p>
            <p class="text-[11px] text-muted">{{ receipt.metrics.agentTurns }} turns</p>
          </div>
          <div class="rounded-xl bg-sunken px-4 py-3">
            <p class="text-xs text-muted">People approved</p>
            <p class="text-xl font-semibold tabular">{{ duration(receipt.metrics.approvalSeconds) }}</p>
          </div>
          <div class="rounded-xl bg-sunken px-4 py-3">
            <p class="text-xs text-muted">PayPal confirmed</p>
            <p class="text-xl font-semibold tabular">{{ duration(receipt.metrics.paymentSeconds) }}</p>
          </div>
        </div>
        <p class="mt-3 text-xs text-muted text-pretty">
          For comparison, PayPal’s dispute process gives buyer and merchant up to
          <a :href="receipt.comparison.source" target="_blank" rel="noopener" class="underline">{{ receipt.comparison.paypalInquiryWindowDays }} days</a>
          in the inquiry stage to resolve a dispute before it can be escalated.
          <template v-if="receipt.metrics.guardrailRejections">The server rejected {{ receipt.metrics.guardrailRejections }} invalid agent answer{{ receipt.metrics.guardrailRejections > 1 ? 's' : '' }} along the way.</template>
        </p>
      </section>

      <section class="px-8 py-6">
        <p class="eyebrow mb-3">Audit trail</p>
        <ol class="relative space-y-3 border-l border-line pl-5">
          <li v-for="event in timeline" :key="event.id" class="relative text-sm">
            <span class="absolute -left-[25px] top-1.5 size-2 rounded-full ring-4 ring-surface" :class="event.actorType === 'PAYPAL' ? 'bg-ok' : event.actorType === 'AGENT' ? 'bg-primary' : event.actorType === 'USER' ? 'bg-ink' : 'bg-faint'" />
            <p class="text-ink-soft">{{ describeEvent(event) }}</p>
            <p class="text-xs text-muted">{{ dateTime(event.createdAt) }} · {{ event.actorType.toLowerCase() }}</p>
          </li>
        </ol>
      </section>
      <footer class="border-t border-line bg-sunken px-8 py-4 text-xs text-muted">
        PayPal sandbox environment: test money only. ResolveOS is an independent pre-dispute tool, not affiliated with or endorsed by PayPal.
      </footer>
    </article>
  </div>
</template>
