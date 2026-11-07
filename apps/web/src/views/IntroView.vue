<script setup lang="ts">
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Moon, Sun, ShieldCheck, Sparkles, PackageX, Handshake, LockKeyhole } from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Logo from '@/components/Logo.vue';
import { useThemePreference } from '@/lib/useThemePreference';

const { currentTheme, toggleTheme } = useThemePreference();
const activeIndex = ref(0);
const progress = ref(0);
const reducedMotion = ref(false);
const storytelling = ref<HTMLElement | null>(null);
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

const scrollPercent = computed(() => Math.round(progress.value * 100));
let observer: IntersectionObserver | null = null;
let raf = 0;

function updateScroll() {
  if (!storytelling.value) return;
  const rect = storytelling.value.getBoundingClientRect();
  const available = Math.max(1, storytelling.value.offsetHeight - window.innerHeight);
  progress.value = Math.max(0, Math.min(1, -rect.top / available));
  if (!observer) activeIndex.value = Math.min(2, Math.floor(progress.value * 3));
}
function onScroll() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; updateScroll(); });
}
function goToChapter(index: number) {
  const element = document.getElementById(`intro-chapter-${index}`);
  element?.scrollIntoView({ behavior: reducedMotion.value ? 'instant' : 'smooth', block: 'center' });
}
onMounted(async () => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  await nextTick();
  const chaptersElements = document.querySelectorAll<HTMLElement>('[data-intro-chapter]');
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) activeIndex.value = Number((visible.target as HTMLElement).dataset.introChapter ?? 0);
    }, { rootMargin: '-22% 0px -22% 0px', threshold: [0, .2, .4, .6, .8, 1] });
    chaptersElements.forEach(element => observer?.observe(element));
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  updateScroll();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', onScroll);
  if (raf) cancelAnimationFrame(raf);
});
</script>

<template>
  <div class="intro-shell relative min-h-screen bg-canvas text-ink" :style="{ '--story-progress': String(progress) }">
    <div class="intro-ambient fixed inset-0 pointer-events-none" aria-hidden="true">
      <div class="intro-orb intro-orb-one" />
      <div class="intro-orb intro-orb-two" />
      <div class="intro-grid absolute inset-0" />
    </div>

    <header class="intro-header relative z-30 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-9">
      <Logo />
      <div class="flex items-center gap-2">
        <button type="button" class="btn btn-secondary btn-sm" @click="toggleTheme" :aria-label="currentTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'">
          <Moon v-if="currentTheme === 'light'" class="size-4" /><Sun v-else class="size-4" />
          <span class="hidden sm:inline">{{ currentTheme === 'light' ? 'Dark' : 'Light' }} mode</span>
        </button>
        <RouterLink to="/signin" class="btn btn-ghost btn-sm">Skip intro <ArrowUpRight class="size-4" /></RouterLink>
      </div>
    </header>

    <main id="main" class="relative z-10">
      <div ref="storytelling" class="intro-story mx-auto max-w-7xl px-5 sm:px-9">
        <div class="intro-story-grid">
          <div class="intro-chapters">
            <section
              v-for="(chapter, index) in chapters"
              :id="`intro-chapter-${index}`"
              :key="chapter.eyebrow"
              :data-intro-chapter="index"
              class="intro-chapter flex flex-col justify-center"
              :class="{ 'intro-chapter-active': activeIndex === index }"
              :aria-label="chapter.eyebrow"
            >
              <div class="intro-chapter-content">
                <p class="eyebrow mb-6 flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-accent" /> {{ chapter.eyebrow }}</p>
                <h1 v-if="index === 0" class="intro-heading whitespace-pre-line text-balance text-[clamp(3rem,5.5vw,6.1rem)] font-semibold leading-[1.04] tracking-[-0.075em]">{{ chapter.title }}</h1>
                <h2 v-else class="intro-heading whitespace-pre-line text-balance text-[clamp(3rem,5.5vw,6.1rem)] font-semibold leading-[1.04] tracking-[-0.075em]">{{ chapter.title }}</h2>
                <p class="mt-7 max-w-lg text-[1.06rem] leading-[1.8] text-ink-soft">{{ chapter.description }}</p>
                <div class="mt-7 inline-flex items-center gap-2 rounded-full border border-line bg-surface/75 px-3.5 py-2 text-xs font-medium text-muted backdrop-blur">
                  <Sparkles class="size-3.5 text-accent" /> {{ chapter.micro }}
                </div>
                <div v-if="index === 0" class="mt-10 flex items-center gap-3 text-sm font-medium text-muted">
                  <span class="intro-scroll-icon grid size-9 place-items-center rounded-full border border-line"><ArrowDown class="size-4" /></span>
                  Scroll to explore
                </div>
                <div v-if="index === 2" class="mt-10 flex flex-wrap items-center gap-3">
                  <RouterLink to="/signin" class="btn btn-primary btn-lg">Enter ResolveOS <ArrowRight class="size-4" /></RouterLink>
                  <RouterLink to="/about" class="btn btn-secondary btn-lg">Explore the product</RouterLink>
                </div>
              </div>
            </section>
          </div>

          <div class="intro-visual-column">
            <div class="intro-visual-sticky flex items-center justify-center" aria-label="Animated illustration of the resolution journey">
              <div class="intro-ring intro-ring-one absolute rounded-full border border-primary-line/60" aria-hidden="true" />
              <div class="intro-ring intro-ring-two absolute rounded-full border border-line-strong/60" aria-hidden="true" />
              <div class="intro-parallax relative z-10 w-full max-w-[490px]">
                <Transition name="intro-scene" mode="out-in">
                  <div :key="activeIndex" class="intro-scene-card">
                    <template v-if="activeIndex === 0">
                      <div class="intro-glass mx-auto w-[92%] rounded-[28px] p-6 shadow-2xl sm:p-8">
                        <div class="flex items-center justify-between"><span class="rounded-full bg-warn-soft px-3 py-1 text-xs font-semibold text-warn">Delivery disputed</span><PackageX class="size-6 text-warn" /></div>
                        <p class="mt-7 text-xs font-medium uppercase tracking-[.18em] text-muted">Everyday jacket · Order #1042</p>
                        <p class="mt-2 text-4xl font-semibold tracking-tight">$180.00</p>
                        <div class="mt-7 grid gap-3 sm:grid-cols-2">
                          <div class="intro-stagger rounded-2xl border border-primary-line bg-primary-soft p-4"><p class="text-xs font-semibold text-buyer">BUYER</p><p class="mt-2 text-sm font-medium text-ink">“I never received it.”</p></div>
                          <div class="intro-stagger rounded-2xl border border-accent-line bg-accent-soft p-4"><p class="text-xs font-semibold text-merchant">MERCHANT</p><p class="mt-2 text-sm font-medium text-ink">“Tracking says delivered.”</p></div>
                        </div>
                        <div class="mt-5 flex items-center gap-2 border-t border-line pt-5 text-xs text-muted"><span class="h-2 w-2 animate-pulse rounded-full bg-warn" /> Conflicting information. Unresolved.</div>
                      </div>
                    </template>
                    <template v-else-if="activeIndex === 1">
                      <div class="intro-glass rounded-[28px] p-6 shadow-2xl sm:p-8">
                        <div class="flex items-center justify-between"><span class="text-xs font-semibold uppercase tracking-[.16em] text-muted">Negotiation room</span><span class="flex items-center gap-1.5 text-xs text-accent"><span class="h-2 w-2 animate-pulse rounded-full bg-accent" /> Illustrative</span></div>
                        <div class="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                          <div class="intro-stagger rounded-2xl border border-primary-line bg-primary-soft p-5 text-center"><div class="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary text-white"><Sparkles class="size-5" /></div><p class="text-sm font-semibold text-buyer">Buyer agent</p><p class="mt-1 text-xs text-muted">Evidence & needs</p></div>
                          <div class="intro-connection"><Handshake class="size-6 text-primary" /></div>
                          <div class="intro-stagger rounded-2xl border border-accent-line bg-accent-soft p-5 text-center"><div class="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-accent text-white"><Sparkles class="size-5" /></div><p class="text-sm font-semibold text-merchant">Merchant agent</p><p class="mt-1 text-xs text-muted">Policies & costs</p></div>
                        </div>
                        <div class="mt-6 flex items-center gap-2 rounded-xl border border-line bg-sunken p-4 text-sm text-ink-soft"><LockKeyhole class="size-5 shrink-0 text-primary" /> Each side's private limits stay private.</div>
                        <div class="mt-3 flex items-center justify-between text-xs text-muted"><span>Investigate → propose → evaluate</span><span>Server guarded</span></div>
                      </div>
                    </template>
                    <template v-else>
                      <div class="intro-glass mx-auto w-[92%] rounded-[28px] p-6 shadow-2xl sm:p-8">
                        <div class="mx-auto mb-5 grid size-16 place-items-center rounded-3xl bg-ok-soft text-ok"><ShieldCheck class="size-9" /></div>
                        <p class="text-center text-xs font-semibold uppercase tracking-[.15em] text-muted">Settlement protocol</p>
                        <p class="mt-2 text-center text-3xl font-semibold tracking-tight">Both sides decide.</p>
                        <div class="mt-7 space-y-3">
                          <div v-for="person in ['Buyer approval','Merchant approval']" :key="person" class="intro-stagger flex items-center justify-between rounded-xl border border-line bg-sunken p-4"><span class="text-sm font-medium">{{ person }}</span><span class="flex items-center gap-1.5 text-sm font-semibold text-ok"><Check class="size-4" /> Required</span></div>
                        </div>
                        <div class="mt-5 flex items-center justify-center gap-2 rounded-xl bg-ok-soft p-3 text-sm font-semibold text-ok"><ShieldCheck class="size-5" /> PayPal-confirmed settlement</div>
                        <p class="mt-3 text-center text-xs text-muted">Illustrative flow. Actual results appear in the app.</p>
                      </div>
                    </template>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav class="intro-progress-nav fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-surface/90 px-4 py-3 shadow-lg backdrop-blur-xl" aria-label="Story chapters">
        <button v-for="(chapter, index) in chapters" :key="chapter.eyebrow" type="button"
          class="intro-dot h-1.5 rounded-full transition-all duration-300"
          :class="activeIndex === index ? 'w-12 bg-primary' : 'w-6 bg-line-strong hover:bg-accent'"
          :aria-label="`Scroll to chapter ${index + 1}: ${chapter.eyebrow}`"
          :aria-current="activeIndex === index ? 'step' : undefined"
          @click="goToChapter(index)"
        />
        <span class="ml-2 font-mono text-xs text-muted">{{ String(activeIndex + 1).padStart(2, '0') }} / 03</span>
      </nav>

      <div class="intro-end relative z-10 mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 pb-28 pt-14 sm:px-9">
        <p class="text-xs text-muted">Independent hackathon prototype · PayPal Sandbox · Test money only</p>
        <span class="font-mono text-xs text-muted">STORY EXPLORED {{ scrollPercent }}%</span>
      </div>
    </main>
  </div>
</template>

<style scoped>
.intro-shell { isolation: isolate; }
.intro-ambient { z-index: 0; overflow: hidden; }
.intro-grid { background-image: linear-gradient(var(--color-line) 1px,transparent 1px),linear-gradient(90deg,var(--color-line) 1px,transparent 1px); background-size: 72px 72px; opacity: .17; mask-image: radial-gradient(ellipse at 70% 40%,black,transparent 70%); }
.intro-orb { position:absolute; width:42vw; height:42vw; min-width:360px; min-height:360px; border-radius:50%; filter:blur(95px); opacity:.16; pointer-events:none; animation:orb-drift 13s ease-in-out infinite alternate; will-change:transform; }
.intro-orb-one { top:0; right:-10%; background:var(--color-primary); }
.intro-orb-two { bottom:-20%; left:30%; background:var(--color-accent); animation-delay:-5s; }
.intro-story-grid { display:grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr); gap:clamp(2rem,5vw,5rem); }
.intro-chapter { min-height:100svh; padding:6rem 0; scroll-margin-top:3rem; }
.intro-chapter-content { opacity:.28; transform:translateY(38px) scale(.97); filter:blur(3px); transition:opacity .65s ease,transform .8s cubic-bezier(.2,.8,.2,1),filter .65s ease; }
.intro-chapter-active .intro-chapter-content { opacity:1; transform:translateY(0) scale(1); filter:blur(0); }
.intro-visual-column { position:relative; }
.intro-visual-sticky { position:sticky; top:0; height:100svh; min-height:480px; overflow:hidden; }
.intro-ring { width:min(38vw,520px); height:min(38vw,520px); min-width:360px; min-height:360px; transform:translateY(calc(var(--story-progress) * -30px)) rotate(calc(var(--story-progress) * 25deg)); transition:border-color .5s ease; }
.intro-ring-two { width:min(30vw,385px); height:min(30vw,385px); min-width:260px; min-height:260px; transform:translateY(calc(var(--story-progress) * 40px)) rotate(calc(var(--story-progress) * -32deg)); }
.intro-parallax { transform:translateY(calc((.5 - var(--story-progress)) * 46px)); will-change:transform; }
.intro-glass { background:color-mix(in srgb,var(--color-surface) 91%,transparent); border:1px solid var(--color-line); backdrop-filter:blur(22px); }
.intro-scene-enter-active,.intro-scene-leave-active { transition:opacity .55s ease,transform .65s cubic-bezier(.2,.8,.2,1),filter .5s ease; }
.intro-scene-enter-from { opacity:0;transform:translateY(46px) scale(.94) rotate(1.5deg);filter:blur(10px); }
.intro-scene-leave-to { opacity:0;transform:translateY(-36px) scale(1.04) rotate(-1deg);filter:blur(8px); }
.intro-stagger { animation:card-appear .75s both; }
.intro-stagger:nth-child(2) { animation-delay:.13s; }
.intro-connection { animation:connection-pulse 2s ease-in-out infinite; }
.intro-scroll-icon { animation:scroll-nudge 1.8s ease-in-out infinite; }
@keyframes orb-drift { to { transform:translate(7%,-8%); } }
@keyframes connection-pulse { 50% { transform:scale(1.16);opacity:.55; } }
@keyframes scroll-nudge { 50% { transform:translateY(6px); } }
@keyframes card-appear { from { opacity:0;transform:translateY(18px); } to { opacity:1;transform:translateY(0); } }
@media(max-width:767px) {
  .intro-story-grid { display:flex; flex-direction:column-reverse; gap:0; }
  .intro-visual-column { position:sticky; top:0; z-index:12; height:42svh; margin:0 -1.25rem; pointer-events:none; }
  .intro-visual-sticky { height:42svh; min-height:0; padding:0 1.25rem; }
  .intro-parallax { max-width:370px; transform:scale(.76) translateY(calc((.5 - var(--story-progress)) * 16px)); }
  .intro-ring { width:340px; height:340px; min-width:0; min-height:0; }
  .intro-ring-two { width:260px;height:260px;min-width:0;min-height:0; }
  .intro-chapter { min-height:66svh; padding:2.5rem 0 5rem; }
  .intro-chapter-content { opacity:.48; filter:none; transform:translateY(18px); }
  .intro-header { position:relative; }
}
@media(prefers-reduced-motion:reduce) {
  .intro-orb,.intro-connection,.intro-scroll-icon,.intro-stagger { animation:none; }
  .intro-chapter-content { opacity:1; filter:none;transform:none; }
  .intro-parallax,.intro-ring,.intro-ring-two { transform:none; }
  .intro-scene-enter-active,.intro-scene-leave-active { transition:none; }
}
</style>
