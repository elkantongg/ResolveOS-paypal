<script setup lang="ts">
import { ArrowRight, ArrowLeft, ArrowUpRight, Check, ChevronRight, Moon, Sun, ShieldCheck, Sparkles, PackageX, Handshake, LockKeyhole } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import Logo from '@/components/Logo.vue';
import { useThemePreference } from '@/lib/useThemePreference';

const router = useRouter();
const { currentTheme, toggleTheme } = useThemePreference();
const chapter = ref(0);
const chapters = [
  {
    eyebrow: '01 / THE PROBLEM',
    title: 'A payment went through.\nTrust did not.',
    description: 'A customer says the parcel never arrived. The seller sees “delivered.” Neither has the complete picture. A disagreement begins.',
    micro: 'One payment. Two perspectives.',
  },
  {
    eyebrow: '02 / THE INTELLIGENCE',
    title: 'Two perspectives.\nOne conversation.',
    description: 'A buyer agent and a merchant agent evaluate evidence, work within private limits, and exchange proposals. No agent can approve a deal or move money.',
    micro: 'Intelligence with boundaries.',
  },
  {
    eyebrow: '03 / THE RESOLUTION',
    title: 'Agreement is earned.\nNot assumed.',
    description: 'Both people review the same exact terms. Only after both approve can the protected payment service request a PayPal Sandbox refund.',
    micro: 'Two approvals. One verified outcome.',
  },
] as const;
const active = computed(() => chapters[chapter.value]!);
const next = () => {
  if (chapter.value < chapters.length - 1) chapter.value += 1;
  else void router.push('/signin');
};
const back = () => { if (chapter.value > 0) chapter.value -= 1; };
</script>

<template>
  <div class="intro-shell relative min-h-screen overflow-hidden bg-canvas text-ink">
    <div class="intro-orb intro-orb-one" aria-hidden="true" />
    <div class="intro-orb intro-orb-two" aria-hidden="true" />
    <div class="intro-grid absolute inset-0 pointer-events-none" aria-hidden="true" />
    <header class="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-9">
      <Logo />
      <div class="flex items-center gap-2">
        <button type="button" class="btn btn-secondary btn-sm" @click="toggleTheme" :aria-label="currentTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'">
          <Moon v-if="currentTheme === 'light'" class="size-4" /><Sun v-else class="size-4" />
          <span class="hidden sm:inline">{{ currentTheme === 'light' ? 'Dark' : 'Light' }} mode</span>
        </button>
        <RouterLink to="/signin" class="btn btn-ghost btn-sm">Skip intro <ArrowUpRight class="size-4" /></RouterLink>
      </div>
    </header>
    <main id="main" class="relative z-10 mx-auto grid min-h-[calc(100vh-106px)] max-w-7xl items-center gap-10 px-5 pb-12 pt-8 sm:px-9 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
      <div class="max-w-[610px]">
        <div class="mb-10 flex items-center gap-2" aria-label="Introduction progress">
          <span v-for="(_,i) in chapters" :key="i" class="h-1 rounded-full transition-all duration-500" :class="i === chapter ? 'w-14 bg-primary' : i < chapter ? 'w-7 bg-accent' : 'w-7 bg-line-strong'" />
          <span class="ml-3 font-mono text-xs text-muted">{{ String(chapter + 1).padStart(2,'0') }} / 03</span>
        </div>
        <Transition mode="out-in" name="intro-copy">
          <div :key="chapter">
            <p class="eyebrow mb-5 flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-accent" /> {{ active.eyebrow }}</p>
            <h1 class="intro-heading whitespace-pre-line text-balance text-[clamp(3.25rem,5.7vw,6.4rem)] font-semibold leading-[1.035] tracking-[-0.075em]">{{ active.title }}</h1>
            <p class="mt-7 max-w-lg text-[1.07rem] leading-[1.8] text-ink-soft">{{ active.description }}</p>
            <div class="mt-7 inline-flex items-center gap-2 rounded-full border border-line bg-surface/75 px-3.5 py-2 text-xs font-medium text-muted backdrop-blur">
              <Sparkles class="size-3.5 text-accent" /> {{ active.micro }}
            </div>
          </div>
        </Transition>
        <div class="mt-12 flex flex-wrap items-center gap-3">
          <button type="button" class="btn btn-primary btn-lg min-w-40" @click="next">{{ chapter === 2 ? 'Enter ResolveOS' : 'Next' }} <ArrowRight class="size-4" /></button>
          <button v-if="chapter > 0" type="button" class="btn btn-secondary btn-lg" @click="back"><ArrowLeft class="size-4" /> Back</button>
          <RouterLink v-else to="/about" class="btn btn-ghost btn-lg">Explore the product <ChevronRight class="size-4" /></RouterLink>
        </div>
        <p class="mt-8 text-xs text-muted">Independent hackathon prototype · PayPal Sandbox · Test money only</p>
      </div>
      <div class="intro-visual relative flex min-h-[390px] items-center justify-center lg:min-h-[620px]" aria-label="Illustration of the resolution journey">
        <div class="intro-ring absolute h-[min(90vw,520px)] w-[min(90vw,520px)] rounded-full border border-primary-line/50" />
        <div class="intro-ring intro-ring-two absolute h-[min(70vw,385px)] w-[min(70vw,385px)] rounded-full border border-line-strong/60" />
        <Transition name="intro-scene" mode="out-in">
          <div :key="chapter" class="relative z-10 w-full max-w-[490px]">
            <template v-if="chapter === 0">
              <div class="intro-glass mx-auto w-[88%] rounded-[28px] p-6 shadow-2xl sm:p-8">
                <div class="flex items-center justify-between"><span class="rounded-full bg-warn-soft px-3 py-1 text-xs font-semibold text-warn">Delivery disputed</span><PackageX class="size-6 text-warn" /></div>
                <p class="mt-7 text-xs font-medium uppercase tracking-[.18em] text-muted">Everyday jacket · Order #1042</p>
                <p class="mt-2 text-4xl font-semibold tracking-tight">$180.00</p>
                <div class="mt-7 grid gap-3 sm:grid-cols-2">
                  <div class="rounded-2xl border border-primary-line bg-primary-soft p-4"><p class="text-xs font-semibold text-buyer">BUYER</p><p class="mt-2 text-sm font-medium text-ink">“I never received it.”</p></div>
                  <div class="rounded-2xl border border-accent-line bg-accent-soft p-4"><p class="text-xs font-semibold text-merchant">MERCHANT</p><p class="mt-2 text-sm font-medium text-ink">“Tracking says delivered.”</p></div>
                </div>
                <div class="mt-5 flex items-center gap-2 border-t border-line pt-5 text-xs text-muted"><span class="h-2 w-2 animate-pulse rounded-full bg-warn" /> Conflicting information. Unresolved.</div>
              </div>
            </template>
            <template v-else-if="chapter === 1">
              <div class="intro-glass rounded-[28px] p-6 shadow-2xl sm:p-8">
                <div class="flex items-center justify-between"><span class="text-xs font-semibold uppercase tracking-[.16em] text-muted">Negotiation room</span><span class="flex items-center gap-1.5 text-xs text-accent"><span class="h-2 w-2 animate-pulse rounded-full bg-accent" /> Illustrative</span></div>
                <div class="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div class="rounded-2xl border border-primary-line bg-primary-soft p-5 text-center"><div class="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary text-white"><Sparkles class="size-5" /></div><p class="text-sm font-semibold text-buyer">Buyer agent</p><p class="mt-1 text-xs text-muted">Evidence & needs</p></div>
                  <div class="intro-connection"><Handshake class="size-6 text-primary" /></div>
                  <div class="rounded-2xl border border-accent-line bg-accent-soft p-5 text-center"><div class="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-accent text-white"><Sparkles class="size-5" /></div><p class="text-sm font-semibold text-merchant">Merchant agent</p><p class="mt-1 text-xs text-muted">Policies & costs</p></div>
                </div>
                <div class="mt-6 flex items-center gap-2 rounded-xl border border-line bg-sunken p-4 text-sm text-ink-soft"><LockKeyhole class="size-5 shrink-0 text-primary" /> Each side's private limits stay private.</div>
                <div class="mt-3 flex items-center justify-between text-xs text-muted"><span>Investigate → propose → evaluate</span><span>Server guarded</span></div>
              </div>
            </template>
            <template v-else>
              <div class="intro-glass mx-auto w-[88%] rounded-[28px] p-6 shadow-2xl sm:p-8">
                <div class="mx-auto mb-5 grid size-16 place-items-center rounded-3xl bg-ok-soft text-ok"><ShieldCheck class="size-9" /></div>
                <p class="text-center text-xs font-semibold uppercase tracking-[.15em] text-muted">Settlement protocol</p>
                <p class="mt-2 text-center text-3xl font-semibold tracking-tight">Both sides decide.</p>
                <div class="mt-7 space-y-3">
                  <div v-for="person in ['Buyer approval','Merchant approval']" :key="person" class="flex items-center justify-between rounded-xl border border-line bg-sunken p-4"><span class="text-sm font-medium">{{ person }}</span><span class="flex items-center gap-1.5 text-sm font-semibold text-ok"><Check class="size-4" /> Required</span></div>
                </div>
                <div class="mt-5 flex items-center justify-center gap-2 rounded-xl bg-ok-soft p-3 text-sm font-semibold text-ok"><ShieldCheck class="size-5" /> PayPal-confirmed settlement</div>
                <p class="mt-3 text-center text-xs text-muted">Illustrative flow. Actual results appear in the app.</p>
              </div>
            </template>
          </div>
        </Transition>
      </div>
    </main>
  </div>
</template>

<style scoped>
.intro-shell { isolation: isolate; }
.intro-grid { background-image: linear-gradient(var(--color-line) 1px,transparent 1px),linear-gradient(90deg,var(--color-line) 1px,transparent 1px); background-size: 72px 72px; opacity: .17; mask-image: radial-gradient(ellipse at 70% 40%,black,transparent 70%); }
.intro-orb { position:absolute; width:42vw; height:42vw; min-width:360px; min-height:360px; border-radius:50%; filter:blur(100px); opacity:.16; pointer-events:none; animation:orb-drift 13s ease-in-out infinite alternate; }
.intro-orb-one { top:0; right:-10%; background:var(--color-primary); }
.intro-orb-two { bottom:-20%; left:30%; background:var(--color-accent); animation-delay:-5s; }
.intro-glass { background:color-mix(in srgb,var(--color-surface) 91%,transparent); border:1px solid var(--color-line); backdrop-filter:blur(22px); }
.intro-ring { animation:ring-breathe 9s ease-in-out infinite; }
.intro-ring-two { animation-delay:-4s; }
.intro-connection { animation:connection-pulse 2s ease-in-out infinite; }
.intro-copy-enter-active,.intro-copy-leave-active,.intro-scene-enter-active,.intro-scene-leave-active { transition:opacity .4s ease,transform .4s ease; }
.intro-copy-enter-from { opacity:0;transform:translateY(18px); }
.intro-copy-leave-to { opacity:0;transform:translateY(-14px); }
.intro-scene-enter-from { opacity:0;transform:translateX(20px) scale(.97); }
.intro-scene-leave-to { opacity:0;transform:translateX(-20px) scale(.97); }
@keyframes orb-drift { to { transform:translate(7%,-8%); } }
@keyframes ring-breathe { 50% { transform:scale(1.035);opacity:.5; } }
@keyframes connection-pulse { 50% { transform:scale(1.16);opacity:.55; } }
@media(prefers-reduced-motion:reduce) {.intro-orb,.intro-ring,.intro-connection { animation:none; }}
</style>
