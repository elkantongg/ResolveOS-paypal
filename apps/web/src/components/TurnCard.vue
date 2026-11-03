
<script setup lang="ts">
import { BadgeCheck, ChevronDown, CircleHelp, Cpu } from 'lucide-vue-next';
import { ref } from 'vue';

import type { Evidence, Turn } from '@/api/types';
import { ACTION_LABEL, clock, money } from '@/lib/format';

import AgentAvatar from './AgentAvatar.vue';

/** One agent turn: what it said, what it proposes, which evidence it relied on, and why. */
const props = defineProps<{ turn: Turn; evidence: Evidence[]; buyerName: string; merchantName: string }>();
const open = ref(false);
const isBuyer = props.turn.agent === 'BUYER';
const titleOf = (code: string) => props.evidence.find((e) => e.code === code);
</script>

<template>
  <article
    class="flex gap-3"
    :class="isBuyer ? 'flex-row' : 'flex-row-reverse'"
    :aria-label="`Turn ${turn.index}, ${isBuyer ? 'buyer' : 'merchant'} agent`"
  >
    <AgentAvatar :agent="turn.agent" size="sm" class="mt-1" />
    <div class="min-w-0 max-w-[92%] flex-1" :class="isBuyer ? '' : 'flex flex-col items-end'">
      <div class="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted" :class="isBuyer ? '' : 'justify-end'">
        <span class="font-semibold" :class="isBuyer ? 'text-buyer' : 'text-merchant'">
          {{ isBuyer ? 'Buyer agent' : 'Merchant agent' }}
        </span>
        <span>for {{ isBuyer ? buyerName : merchantName }}</span>
        <span aria-hidden="true">·</span>
        <span>Turn {{ turn.index }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ clock(turn.createdAt) }}</span>
        <span
          class="inline-flex items-center gap-1 rounded-md px-1.5 py-px font-medium ring-1 ring-inset"
          :class="turn.provider === 'live' ? 'bg-sunken text-ink-soft ring-line' : 'bg-warn-soft text-warn ring-warn-line'"
          :title="turn.provider === 'live' ? `Live model: ${turn.model}` : 'Deterministic demo negotiator (no AI call)'"
        >
          <Cpu class="size-3" /> {{ turn.provider === 'live' ? 'Live AI' : 'Demo engine' }}
        </span>
      </div>

      <div
        class="w-full rounded-2xl border px-4 py-3.5 shadow-[var(--shadow-card)]"
        :class="isBuyer ? 'rounded-tl-md border-primary-line bg-surface' : 'rounded-tr-md border-accent-line bg-surface'"
      >
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <span
            class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold"
            :class="
              turn.proposedAction === 'ESCALATE'
                ? 'bg-danger-soft text-danger'
                : turn.acceptsCounterpartOffer
                  ? 'bg-ok-soft text-ok'
                  : isBuyer
                    ? 'bg-buyer-soft text-buyer'
                    : 'bg-merchant-soft text-merchant'
            "
          >
            <BadgeCheck v-if="turn.acceptsCounterpartOffer" class="size-3.5" />
            {{ turn.acceptsCounterpartOffer ? 'Accepts' : turn.index <= 2 ? 'Proposes' : 'Counters' }} ·
            {{ ACTION_LABEL[turn.proposedAction] }}
            <span v-if="turn.proposedRefundMinorUnits !== null" class="tabular"> {{ money(turn.proposedRefundMinorUnits, turn.currency) }}</span>
          </span>
        </div>
        <p class="text-[15px] leading-relaxed text-ink text-pretty">{{ turn.publicMessage }}</p>

        <div v-if="turn.evidenceReferences.length" class="mt-3 flex flex-wrap gap-1.5">
          <span
            v-for="code in turn.evidenceReferences"
            :key="code"
            class="inline-flex items-center gap-1 rounded-md border border-line bg-sunken px-1.5 py-0.5 text-xs text-ink-soft"
            :title="titleOf(code) ? `${titleOf(code)!.title} — ${titleOf(code)!.verificationStatus.replace('_', ' ').toLowerCase()}` : code"
          >
            <span class="mono font-medium">{{ code }}</span>
            <span class="max-w-40 truncate">{{ titleOf(code)?.title }}</span>
          </span>
        </div>

        <button
          type="button"
          class="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
          :aria-expanded="open"
          @click="open = !open"
        >
          <ChevronDown class="size-3.5 transition-transform" :class="open ? 'rotate-180' : ''" />
          Reasoning{{ turn.uncertainties.length ? ` & ${turn.uncertainties.length} open question${turn.uncertainties.length > 1 ? 's' : ''}` : '' }}
        </button>
        <div v-if="open" class="mt-2 space-y-2 border-t border-line pt-2 text-sm text-ink-soft">
          <p class="text-pretty">{{ turn.reasoningSummary }}</p>
          <ul v-if="turn.uncertainties.length" class="space-y-1">
            <li v-for="item in turn.uncertainties" :key="item" class="flex gap-2 text-warn">
              <CircleHelp class="mt-0.5 size-3.5 shrink-0" /> <span>{{ item }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </article>
</template>
