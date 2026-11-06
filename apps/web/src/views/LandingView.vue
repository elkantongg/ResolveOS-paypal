
<script setup lang="ts">
import { ArrowRight, BadgeCheck, FileSearch, Handshake, Lock, ScrollText, ShieldCheck, UserCheck } from 'lucide-vue-next';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import AgentAvatar from '@/components/AgentAvatar.vue';
import Logo from '@/components/Logo.vue';

/**
 * The public page. The preview is an illustration of the product's flow (clearly a preview);
 * the real negotiations run behind "Launch demo".
 */
const step = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
onMounted(() => {
  if (reduced) step.value = 4;
  else timer = setInterval(() => (step.value = (step.value + 1) % 6), 1700);
});
onBeforeUnmount(() => timer && clearInterval(timer));

const preview = [
  { agent: 'BUYER' as const, text: 'Tracking shows delivered, but there’s no signature or photo (EV-2). Alex checked with neighbours. We ask for a full refund.', amount: '$180.00' },
  { agent: 'MERCHANT' as const, text: 'Delivery is recorded but unproven either way. Our policy allows a partial refund (EV-4). We can offer $90.00.', amount: '$90.00' },
  { agent: 'BUYER' as const, text: 'That is within what Alex can accept. We accept $90.00.', amount: 'Accepts $90.00' },
];
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <header class="mx-auto flex h-18 max-w-6xl items-center justify-between px-6 py-5">
      <Logo />
      <nav class="flex items-center gap-2 text-sm" aria-label="Public">
        <a href="#how" class="btn btn-ghost btn-sm hidden sm:inline-flex">How it works</a>
        <a href="#trust" class="btn btn-ghost btn-sm hidden sm:inline-flex">Trust</a>
        <RouterLink to="/signin" class="btn btn-primary btn-sm">Launch demo</RouterLink>
      </nav>
    </header>

    <main id="main">
      <!-- Hero -->
      <section class="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div>
          <p class="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-soft">
            <span class="size-1.5 rounded-full bg-accent-bright" /> Two sides. One resolution.
          </p>
          <h1 class="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[56px]">
            When payments go wrong, resolution shouldn’t be another problem.
          </h1>
          <p class="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft text-pretty">
            ResolveOS brings buyers and merchants together through intelligent negotiation, transparent decisions, and PayPal-powered settlements.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <RouterLink to="/signin" class="btn btn-primary btn-lg">Launch demo <ArrowRight class="size-4" /></RouterLink>
            <a href="#how" class="btn btn-secondary btn-lg">See how it works</a>
          </div>
          <p class="mt-6 text-xs text-muted">Runs on the PayPal sandbox with test money. Independent project; not affiliated with or endorsed by PayPal.</p>
        </div>

        <!-- Preview -->
        <div class="card relative overflow-hidden p-5 shadow-[var(--shadow-lift)]" aria-label="Product preview (illustration)">
          <div class="mb-4 flex items-center justify-between">
            <p class="text-sm font-semibold">Negotiation room <span class="ml-1 text-xs font-normal text-muted">preview</span></p>
            <span class="mono text-xs text-muted">RA-1042 · $180.00</span>
          </div>
          <div class="space-y-3">
            <div
              v-for="(item, i) in preview"
              :key="i"
              class="flex gap-2.5 transition-all duration-500"
              :class="[item.agent === 'MERCHANT' ? 'flex-row-reverse' : '', step > i ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-2']"
            >
              <AgentAvatar :agent="item.agent" size="sm" />
              <div class="max-w-[85%] rounded-2xl border px-3.5 py-2.5 text-sm" :class="item.agent === 'BUYER' ? 'rounded-tl-md border-primary-line' : 'rounded-tr-md border-accent-line'">
                <p class="mb-1 text-xs font-semibold" :class="item.agent === 'BUYER' ? 'text-buyer' : 'text-merchant'">{{ item.agent === 'BUYER' ? 'Buyer agent' : 'Merchant agent' }} · {{ item.amount }}</p>
                <p class="text-ink-soft">{{ item.text }}</p>
              </div>
            </div>
          </div>
          <div class="mt-4 rounded-xl border px-4 py-3 text-sm transition-all duration-500" :class="step > 3 ? 'border-ok-line bg-ok-soft opacity-100' : 'border-line opacity-0'">
            <p class="flex items-center gap-2 font-semibold text-ok"><Handshake class="size-4" /> Both approved · PayPal refund completed</p>
            <p class="mono mt-1 text-xs text-muted">refund 3YY5…823A · $90.00 · COMPLETED</p>
          </div>
        </div>
      </section>

      <!-- Problem -->
      <section class="border-y border-line bg-surface">
        <div class="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[1fr_1.4fr]">
          <h2 class="text-3xl font-semibold tracking-tight text-balance">A payment is easy to make. Resolving a disagreement over it is much harder.</h2>
          <div class="space-y-4 text-ink-soft">
            <p class="text-pretty">A customer buys a $180 jacket. The carrier says it was delivered; the customer says it never arrived. Both are acting in good faith, the evidence is incomplete, and a formal dispute costs both of them time, fees and the relationship.</p>
            <p class="text-pretty">PayPal’s Resolution Center already lets buyer and seller message and make offers once a dispute is open. ResolveOS works one step earlier, before any dispute: it gives each side its own AI advocate with private limits, puts the labelled evidence on the table, and turns a compromise both people approve into a real PayPal refund.</p>
          </div>
        </div>
      </section>

      <!-- How -->
      <section id="how" class="mx-auto max-w-6xl px-6 py-20">
        <p class="eyebrow">How it works</p>
        <h2 class="mt-2 text-3xl font-semibold tracking-tight">From complaint to verified refund</h2>
        <ol class="mt-10 grid gap-4 md:grid-cols-5">
          <li
            v-for="(item, i) in [
              { icon: FileSearch, title: 'Report', text: 'The buyer opens a case on a real PayPal sandbox payment. Verified payment facts are read from PayPal.' },
              { icon: ScrollText, title: 'Evidence', text: 'Each side adds evidence. Every item is labelled: verified by PayPal, or a party’s claim.' },
              { icon: Handshake, title: 'Negotiate', text: 'A buyer agent and a merchant agent exchange cited, structured offers within each side’s private limits.' },
              { icon: UserCheck, title: 'Approve', text: 'The buyer and the merchant each approve the exact terms, or ask for a revision.' },
              { icon: BadgeCheck, title: 'Settle', text: 'PayPal processes the refund against the original capture. The receipt shows PayPal’s refund ID.' },
            ]" :key="item.title" class="card p-5"
          >
            <span class="mono text-xs text-muted">0{{ i + 1 }}</span>
            <component :is="item.icon" class="mt-3 size-6 text-primary" />
            <p class="mt-3 font-semibold">{{ item.title }}</p>
            <p class="mt-1 text-sm text-muted text-pretty">{{ item.text }}</p>
          </li>
        </ol>
      </section>

      <!-- Trust -->
      <section id="trust" class="border-t border-line bg-surface">
        <div class="mx-auto max-w-6xl px-6 py-20">
          <p class="eyebrow">Trust and approval principles</p>
          <h2 class="mt-2 text-3xl font-semibold tracking-tight text-balance">The AI negotiates. People decide. Code guards the money.</h2>
          <div class="mt-10 grid gap-4 md:grid-cols-3">
            <div class="rounded-2xl border border-line p-6"><Lock class="size-6 text-primary" /><p class="mt-4 font-semibold">Agents can’t touch money</p><p class="mt-1 text-sm text-muted">They return structured proposals only. A deterministic server checks every amount, currency and limit, and only a separate payment service can call PayPal.</p></div>
            <div class="rounded-2xl border border-line p-6"><UserCheck class="size-6 text-primary" /><p class="mt-4 font-semibold">Two explicit approvals</p><p class="mt-1 text-sm text-muted">Each party approves from their own signed-in session. Change one term and every earlier approval stops counting.</p></div>
            <div class="rounded-2xl border border-line p-6"><ShieldCheck class="size-6 text-primary" /><p class="mt-4 font-semibold">Nothing invented</p><p class="mt-1 text-sm text-muted">No fabricated evidence, no fake refunds. A refund is “successful” only when PayPal says so; duplicates are blocked with PayPal’s request IDs.</p></div>
          </div>
          <p class="mt-8 max-w-3xl text-sm text-muted text-pretty">ResolveOS is an independent pre-dispute tool. It does not replace PayPal’s Resolution Center or guarantee PayPal Buyer or Seller Protection outcomes, and either party can still use PayPal’s own dispute process within its time limits.</p>
        </div>
      </section>

      <!-- CTA -->
      <section class="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 class="text-3xl font-semibold tracking-tight">See two agents settle a real sandbox payment</h2>
        <p class="mx-auto mt-2 max-w-xl text-ink-soft">Sign in as the buyer or the merchant. Every step is real and recorded.</p>
        <RouterLink to="/signin" class="btn btn-primary btn-lg mt-8">Launch demo <ArrowRight class="size-4" /></RouterLink>
      </section>
    </main>

    <footer class="border-t border-line">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-muted">
        <Logo compact />
        <p>Built for the PayPal AI Hackathon 2026 · PayPal sandbox only · Not affiliated with PayPal</p>
      </div>
    </footer>
  </div>
</template>
