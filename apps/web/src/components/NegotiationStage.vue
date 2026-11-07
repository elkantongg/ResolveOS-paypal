<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeftRight, Check, CirclePause, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-vue-next';

const props = defineProps<{
  status: string;
  activeAgent: 'BUYER' | 'MERCHANT' | null;
  buyerTurnCount: number;
  merchantTurnCount: number;
  totalTurns: number;
  maxTurns: number;
  isLive: boolean;
}>();

const inProgress = computed(() => props.status === 'IN_NEGOTIATION');
const isAgreed = computed(() => ['AWAITING_APPROVAL', 'PAYMENT_PROCESSING', 'RESOLVED'].includes(props.status));
const isFinished = computed(() => ['NO_AGREEMENT', 'ESCALATED'].includes(props.status));
const heading = computed(() => {
  if (isAgreed.value) return 'Agreement proposed';
  if (isFinished.value) return 'Negotiation ended';
  if (props.activeAgent) return props.activeAgent === 'BUYER' ? 'Buyer agent is working' : 'Merchant agent is working';
  if (inProgress.value) return 'Ready for the next turn';
  return 'Two agents. One goal.';
});
const subheading = computed(() => {
  if (isAgreed.value) return 'Both people must approve before a refund can run.';
  if (isFinished.value) return 'No refund was triggered by this negotiation.';
  if (props.activeAgent) return 'Processing the current turn. This is a live status, not a simulation.';
  return 'Review the evidence, explore a remedy, and protect each side’s limits.';
});
</script>

<template>
  <section class="neg-stage relative isolate overflow-hidden rounded-[22px] border border-line bg-surface px-5 pb-5 pt-6 sm:px-8 sm:pb-7 sm:pt-8" aria-label="Agent activity">
    <div class="neg-stage-grid pointer-events-none absolute inset-0" aria-hidden="true" />
    <div class="relative z-10 flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Live negotiation map</span>
      <span class="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
        <span class="h-1.5 w-1.5 rounded-full" :class="activeAgent ? 'bg-accent animate-pulse' : isAgreed ? 'bg-ok' : 'bg-faint'" />
        {{ isLive ? 'AI engine' : 'Demo engine' }} · {{ totalTurns }}/{{ maxTurns }} turns
      </span>
    </div>
    <div class="relative z-10 mt-7 grid grid-cols-[minmax(0,1fr)_65px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[1fr_120px_1fr] sm:gap-5">
      <div class="neg-agent" :class="{ 'neg-agent-active neg-agent-buyer': activeAgent === 'BUYER' }">
        <div class="neg-agent-icon bg-buyer-soft text-buyer"><Sparkles class="size-6" /></div>
        <p class="mt-3 text-sm font-semibold text-ink">Buyer AI</p>
        <p class="mt-1 text-xs text-muted">{{ activeAgent === 'BUYER' ? 'Evaluating…' : buyerTurnCount ? buyerTurnCount + ' turns recorded' : 'Standing by' }}</p>
      </div>
      <div class="relative flex h-24 items-center justify-center">
        <div class="neg-flow-line absolute inset-x-0 top-1/2" :class="{ 'neg-flow-active': inProgress && activeAgent, 'neg-flow-success': isAgreed }" />
        <div class="neg-core relative z-10 grid size-12 place-items-center rounded-2xl border border-line bg-surface text-primary shadow-sm sm:size-14">
          <Check v-if="isAgreed" class="size-6 text-ok" />
          <CirclePause v-else-if="isFinished" class="size-6 text-warn" />
          <ArrowLeftRight v-else class="size-6" :class="{ 'neg-core-thinking': Boolean(activeAgent) }" />
        </div>
      </div>
      <div class="neg-agent" :class="{ 'neg-agent-active neg-agent-merchant': activeAgent === 'MERCHANT' }">
        <div class="neg-agent-icon bg-merchant-soft text-merchant"><Sparkles class="size-6" /></div>
        <p class="mt-3 text-sm font-semibold text-ink">Merchant AI</p>
        <p class="mt-1 text-xs text-muted">{{ activeAgent === 'MERCHANT' ? 'Evaluating…' : merchantTurnCount ? merchantTurnCount + ' turns recorded' : 'Standing by' }}</p>
      </div>
    </div>
    <div class="relative z-10 mx-auto mt-5 max-w-md text-center" aria-live="polite" aria-atomic="true">
      <h2 class="text-lg font-semibold tracking-tight">{{ heading }}</h2>
      <p class="mt-1.5 text-sm leading-relaxed text-muted">{{ subheading }}</p>
    </div>
    <div class="relative z-10 mt-6 flex items-center justify-center gap-2 border-t border-line pt-4 text-xs text-muted">
      <ShieldCheck class="size-4 text-ok" />
      <span>Offers are checked by the server</span>
      <span aria-hidden="true">·</span>
      <LockKeyhole class="size-3.5" />
      <span>Private limits stay private</span>
    </div>
  </section>
</template>

<style scoped>
.neg-stage { background-image: radial-gradient(circle at 50% 18%, color-mix(in srgb,var(--color-primary) 10%,transparent),transparent 65%); }
.neg-stage-grid { background-image: linear-gradient(var(--color-line) 1px,transparent 1px),linear-gradient(90deg,var(--color-line) 1px,transparent 1px); background-size:40px 40px; opacity:.25; mask-image:radial-gradient(ellipse at 50% 40%,black,transparent 70%); }
.neg-agent { border:1px solid var(--color-line); background:color-mix(in srgb,var(--color-surface) 92%,transparent); border-radius:20px; min-width:0; padding:18px 8px; text-align:center; transition:box-shadow .3s ease,border-color .3s ease,transform .3s ease; }
.neg-agent-icon { display:grid; place-items:center; width:52px; height:52px; margin:auto; border-radius:17px; }
.neg-agent-active { transform:translateY(-4px); box-shadow:0 10px 35px color-mix(in srgb,var(--color-primary) 12%,transparent); }
.neg-agent-buyer { border-color:var(--color-buyer); }
.neg-agent-merchant { border-color:var(--color-merchant); }
.neg-flow-line { height:2px; background:var(--color-line-strong); }
.neg-flow-active { background:linear-gradient(90deg,var(--color-buyer),var(--color-merchant)); background-size:200% 100%; animation:neg-activity 1.4s linear infinite; }
.neg-flow-success { background:var(--color-ok); }
.neg-core-thinking { animation:neg-beat 1.5s ease-in-out infinite; }
@keyframes neg-activity { to { background-position:200% 0; } }
@keyframes neg-beat { 50% { transform:scale(1.16); } }
@media (prefers-reduced-motion:reduce) { .neg-flow-active,.neg-core-thinking { animation:none; } .neg-agent { transition:none; } }
@media (max-width:480px) { .neg-agent { padding:14px 4px; }.neg-agent-icon { width:44px; height:44px; } }
</style>
