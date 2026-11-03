
<script setup lang="ts">
import { ArrowLeft, ArrowRight, Cpu, FastForward, Handshake, Play, Scale, ShieldAlert, SkipForward } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { api, errorMessage } from '@/api/client';
import type { AuditEvent, CaseDetail, NegotiationState, Turn } from '@/api/types';
import AgentPanel from '@/components/AgentPanel.vue';
import AgentAvatar from '@/components/AgentAvatar.vue';
import ErrorNotice from '@/components/ErrorNotice.vue';
import GapMeter from '@/components/GapMeter.vue';
import Skeleton from '@/components/Skeleton.vue';
import SourceBadge from '@/components/SourceBadge.vue';
import StageTracker from '@/components/StageTracker.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import TurnCard from '@/components/TurnCard.vue';
import { clock, describeEvent, money } from '@/lib/format';
import { useCaseEvents } from '@/lib/useCaseEvents';
import { useSession } from '@/stores/session';

/**
 * The Negotiation Room. Everything on screen comes from the server: turns from
 * /negotiate/history, live moments from the case's event stream. Buttons only ask the server to
 * run the next step; the orchestrator decides what happens.
 */
const route = useRoute();
const router = useRouter();
const session = useSession();
const caseId = route.params.id as string;

const detail = ref<CaseDetail | null>(null);
const state = ref<NegotiationState | null>(null);
const live = ref<AuditEvent[]>([]);
const thinking = ref<'BUYER' | 'MERCHANT' | null>(null);
const busy = ref<'start' | 'advance' | 'run' | null>(null);
const error = ref<string | null>(null);
const mode = ref<'live' | 'demo'>(session.status?.aiConfigured ? 'live' : 'demo');
let modeChosen = false;
// The AI status may arrive after this page: default to live AI once we know it is configured.
watch(
  () => session.status?.aiConfigured,
  (ready) => {
    if (!modeChosen) mode.value = ready ? 'live' : 'demo';
  },
);
function chooseMode(value: 'live' | 'demo') {
  modeChosen = true;
  mode.value = value;
}

async function load() {
  try {
    const [d, s] = await Promise.all([
      api.get<CaseDetail>(`/cases/${caseId}`),
      api.get<NegotiationState>(`/cases/${caseId}/negotiate/history`),
    ]);
    detail.value = d;
    state.value = s;
  } catch (e) {
    error.value = errorMessage(e);
  }
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    state.value = await api.get<NegotiationState>(`/cases/${caseId}/negotiate/history`).catch(() => state.value);
  }, 150);
}

useCaseEvents(caseId, (event) => {
  if (event.action === 'agent.thinking') {
    thinking.value = (event.details.agent as 'BUYER' | 'MERCHANT') ?? null;
  } else if (event.action.startsWith('agent.') || event.action.startsWith('agreement') || event.action.startsWith('negotiation')) {
    if (event.action !== 'agent.output_rejected') thinking.value = null;
    live.value = [...live.value.slice(-30), event];
    scheduleRefresh();
  }
});

onMounted(() => {
  void load();
  if (!session.status) session.loadStatus().catch(() => undefined);
});

const turns = computed<Turn[]>(() => state.value?.turns ?? []);
const latestOf = (agent: 'BUYER' | 'MERCHANT') => [...turns.value].reverse().find((t) => t.agent === agent) ?? null;
const buyerTurn = computed(() => latestOf('BUYER'));
const merchantTurn = computed(() => latestOf('MERCHANT'));
const status = computed(() => state.value?.status ?? detail.value?.case.currentStatus ?? 'OPEN');
const txn = computed(() => detail.value?.transaction);
const refundable = computed(() => (txn.value ? txn.value.originalAmountMinor - txn.value.amountRefundedMinor : 0));
const agreed = computed(() =>
  state.value?.proposal && ['AWAITING_APPROVAL', 'PAYMENT_PROCESSING', 'RESOLVED'].includes(status.value)
    ? state.value.proposal.refundAmountMinor
    : null,
);
const viewer = computed(() => detail.value?.viewerRole ?? 'OPERATOR');
const canAct = computed(() => viewer.value === 'BUYER' || viewer.value === 'MERCHANT');
const notes = computed(() => live.value.filter((e) => e.action === 'agent.output_rejected' || e.action === 'agent.failed'));
const evidenceFor = (party: 'BUYER' | 'MERCHANT') => detail.value?.evidence.filter((e) => e.sourceParty === party || (party === 'BUYER' && e.sourceParty === 'PAYPAL')) ?? [];

async function act(kind: 'start' | 'advance' | 'run') {
  busy.value = kind;
  error.value = null;
  try {
    if (kind === 'start') {
      state.value = await api.post<NegotiationState>(`/cases/${caseId}/negotiate/start`, { mode: mode.value });
      busy.value = 'advance';
      state.value = await api.post<NegotiationState>(`/cases/${caseId}/negotiate/advance`);
    } else {
      state.value = await api.post<NegotiationState>(`/cases/${caseId}/negotiate/${kind}`);
    }
  } catch (e) {
    error.value = errorMessage(e);
    await load();
  } finally {
    busy.value = null;
    thinking.value = null;
  }
}
</script>

<template>
  <div v-if="!detail || !state" class="space-y-6">
    <ErrorNotice v-if="error" :message="error" @retry="load" />
    <div v-else class="grid gap-6 lg:grid-cols-[300px_1fr_300px]">
      <div class="card p-5"><Skeleton :lines="6" /></div>
      <div class="card p-5"><Skeleton :lines="10" /></div>
      <div class="card p-5"><Skeleton :lines="6" /></div>
    </div>
  </div>

  <div v-else class="space-y-5">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <RouterLink :to="`/cases/${caseId}`" class="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft class="size-4" /> Case {{ detail.case.reference }}
        </RouterLink>
        <h1 class="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
          Negotiation room
          <StatusBadge :status="status" />
          <SourceBadge :source="txn!.sourceType" :capture-id="txn!.paypalCaptureId" />
        </h1>
        <p class="mt-1 text-sm text-muted">
          {{ detail.case.title }} · {{ txn!.description }} · {{ money(txn!.originalAmountMinor, txn!.currency) }}
        </p>
      </div>
      <div v-if="state.mode" class="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-muted">
        <Cpu class="size-3.5" />
        {{ state.mode === 'live' ? `Live AI · ${turns[0]?.model ?? session.status?.aiMode}` : 'Deterministic demo negotiator' }}
      </div>
    </div>

    <div class="card px-5 py-4"><StageTracker :status="status" /></div>

    <div class="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
      <AgentPanel
        agent="BUYER"
        :party="detail.buyer?.name ?? 'Buyer'"
        subtitle="Represents the buyer, within the buyer’s limits"
        :wants="detail.case.buyerDesiredOutcome"
        limit-label="Least the buyer accepts"
        :limit-minor="detail.case.buyerFloorMinor"
        :limit-is-mine="viewer !== 'MERCHANT'"
        :currency="txn!.currency"
        :evidence="evidenceFor('BUYER')"
        :latest="buyerTurn"
        :thinking="thinking === 'BUYER'"
        class="order-2 xl:order-1"
      />

      <!-- Timeline -->
      <section class="order-1 flex min-w-0 flex-col gap-4 xl:order-2" aria-label="Negotiation timeline">
        <GapMeter
          :total-minor="refundable"
          :currency="txn!.currency"
          :buyer-minor="buyerTurn?.proposedRefundMinorUnits ?? null"
          :merchant-minor="merchantTurn?.proposedRefundMinorUnits ?? null"
          :agreed-minor="agreed"
        />

        <div class="card flex min-h-[420px] flex-col">
          <div class="flex items-center gap-3 border-b border-line px-5 py-3.5">
            <AgentAvatar agent="REFEREE" size="sm" />
            <div class="text-sm">
              <p class="font-semibold">Neutral orchestrator</p>
              <p class="text-xs text-muted">Runs the turns, checks every answer, enforces both sides’ limits. Turn {{ turns.length }} of {{ state.maxTurns }}.</p>
            </div>
          </div>

          <div class="flex flex-1 flex-col gap-5 px-5 py-5" aria-live="polite">
            <div v-if="status === 'OPEN'" class="m-auto max-w-md py-10 text-center">
              <span class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary"><Scale class="size-7" /></span>
              <h2 class="text-lg font-semibold">Ready to negotiate</h2>
              <p class="mt-1 text-sm text-muted text-pretty">
                Each agent sees the shared evidence and only its own side’s limits. Nothing they agree is final: both of you approve before any money moves.
              </p>
            </div>

            <TransitionGroup name="turn" tag="div" class="flex flex-col gap-5">
              <TurnCard
                v-for="turn in turns"
                :key="turn.index"
                :turn="turn"
                :evidence="detail.evidence"
                :buyer-name="detail.buyer?.name ?? 'buyer'"
                :merchant-name="detail.merchant?.businessName ?? 'merchant'"
              />
            </TransitionGroup>

            <div v-if="thinking" class="flex items-center gap-3 text-sm text-muted" :class="thinking === 'MERCHANT' ? 'flex-row-reverse' : ''">
              <AgentAvatar :agent="thinking" size="sm" active />
              <span class="rounded-2xl border border-dashed border-line-strong px-4 py-2.5">
                {{ thinking === 'BUYER' ? 'Buyer' : 'Merchant' }} agent is weighing the evidence…
              </span>
            </div>

            <ul v-if="notes.length" class="space-y-1">
              <li v-for="note in notes" :key="note.id" class="flex items-start gap-2 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-soft">
                <ShieldAlert class="mt-px size-3.5 shrink-0 text-warn" /> <span>{{ clock(note.createdAt) }} · {{ describeEvent(note) }}</span>
              </li>
            </ul>

            <Transition name="turn">
              <div v-if="state.proposal && status === 'AWAITING_APPROVAL'" class="rounded-2xl border border-ok-line bg-ok-soft px-5 py-4">
                <p class="flex items-center gap-2 font-semibold text-ok"><Handshake class="size-5" /> Agreement proposed · version {{ state.proposal.proposalVersion }}</p>
                <p class="mt-1 text-sm text-ink-soft text-pretty">{{ state.proposal.summary }}</p>
                <p class="mt-1 text-xs text-muted">Not final. The buyer and the merchant must each approve these exact terms.</p>
              </div>
            </Transition>
            <div v-if="status === 'NO_AGREEMENT' || status === 'ESCALATED'" class="rounded-2xl border border-danger-line bg-danger-soft px-5 py-4">
              <p class="font-semibold text-danger">{{ status === 'ESCALATED' ? 'Escalated to a person' : 'No agreement reached' }}</p>
              <p class="mt-1 text-sm text-ink-soft text-pretty">{{ state.outcomeSummary }}</p>
              <p class="mt-2 text-xs text-muted">
                No money moved. Resolve AI is independent of PayPal and does not replace PayPal’s Resolution Center: either party can still open a dispute there within PayPal’s time limits.
              </p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex flex-wrap items-center gap-3 border-t border-line bg-sunken/50 px-5 py-4">
            <ErrorNotice v-if="error" :message="error" class="w-full" />
            <template v-if="!canAct">
              <p class="text-sm text-muted">The demo operator can watch but not act for either party.</p>
            </template>
            <template v-else-if="status === 'OPEN' || status === 'NO_AGREEMENT'">
              <div class="inline-flex rounded-lg border border-line-strong bg-surface p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Negotiator">
                <button
                  type="button"
                  role="radio"
                  :aria-checked="mode === 'live'"
                  :disabled="!session.status?.aiConfigured"
                  class="rounded-md px-3 py-1.5 disabled:opacity-40"
                  :class="mode === 'live' ? 'bg-primary text-white' : 'text-ink-soft'"
                  @click="chooseMode('live')"
                >
                  Live AI
                </button>
                <button type="button" role="radio" :aria-checked="mode === 'demo'" class="rounded-md px-3 py-1.5" :class="mode === 'demo' ? 'bg-ink text-white' : 'text-ink-soft'" @click="chooseMode('demo')">
                  Demo engine
                </button>
              </div>
              <button type="button" class="btn btn-primary" :disabled="busy !== null" @click="act('start')">
                <Play class="size-4" /> {{ busy ? 'Starting…' : status === 'NO_AGREEMENT' ? 'Negotiate again' : 'Start negotiation' }}
              </button>
            </template>
            <template v-else-if="status === 'IN_NEGOTIATION'">
              <button type="button" class="btn btn-secondary" :disabled="busy !== null" @click="act('advance')">
                <SkipForward class="size-4" /> {{ busy === 'advance' ? 'Running turn…' : 'Next turn' }}
              </button>
              <button type="button" class="btn btn-primary" :disabled="busy !== null" @click="act('run')">
                <FastForward class="size-4" /> {{ busy === 'run' ? 'Negotiating…' : 'Run to a result' }}
              </button>
              <span class="text-xs text-muted">At most {{ state.maxTurns }} turns; it stops on agreement or deadlock.</span>
            </template>
            <template v-else-if="status === 'AWAITING_APPROVAL' || status === 'PAYMENT_PROCESSING'">
              <button type="button" class="btn btn-primary btn-lg" @click="router.push(`/cases/${caseId}/settlement`)">
                Review &amp; approve <ArrowRight class="size-4" />
              </button>
            </template>
            <template v-else-if="status === 'RESOLVED'">
              <button type="button" class="btn btn-primary" @click="router.push(`/cases/${caseId}/receipt`)">View settlement receipt <ArrowRight class="size-4" /></button>
            </template>
          </div>
        </div>
      </section>

      <AgentPanel
        agent="MERCHANT"
        :party="detail.merchant?.businessName ?? 'Merchant'"
        subtitle="Represents the merchant, within authorised limits"
        :wants="detail.case.merchantPreference ?? 'Private to the merchant'"
        limit-label="Most the merchant allows"
        :limit-minor="detail.case.merchantMaxRefundMinor"
        :limit-is-mine="viewer !== 'BUYER'"
        :currency="txn!.currency"
        :evidence="evidenceFor('MERCHANT')"
        :latest="merchantTurn"
        :thinking="thinking === 'MERCHANT'"
        class="order-3"
      />
    </div>
  </div>
</template>

<style scoped>
.turn-enter-active {
  transition:
    opacity 0.45s ease,
    transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.turn-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}
</style>
