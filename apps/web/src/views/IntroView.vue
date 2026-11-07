<script setup lang="ts">
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleCheck, CreditCard, FileSearch, Moon, Pause, Play, ShieldCheck, Sparkles, Sun } from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Logo from '@/components/Logo.vue';
import { useThemePreference } from '@/lib/useThemePreference';

const { currentTheme, toggleTheme } = useThemePreference();
const chapter = ref(0);
const progress = ref(0);
const reduceMotion = ref(false);
const cinematicPaused = ref(false);
const cinematicDuration = 14;
const cinematicElapsed = ref(0);
let cinematicStart = 0;
let cinematicRaf = 0;
let cinematicPrevious = 0;
function tickCinematic(time: number) {
  if (!cinematicPrevious) cinematicPrevious = time;
  if (!cinematicPaused.value && !reduceMotion.value) {
    cinematicElapsed.value = (cinematicElapsed.value + (time - cinematicPrevious) / 1000) % cinematicDuration;
  }
  cinematicPrevious = time;
  cinematicRaf = requestAnimationFrame(tickCinematic);
}
function toggleCinematic() {
  cinematicPaused.value = !cinematicPaused.value;
}
function seekCinematic(event: Event) {
  const input = event.target as HTMLInputElement;
  cinematicElapsed.value = (Number(input.value) / 100) * cinematicDuration;
}

const storyEl = ref<HTMLElement | null>(null);
let frame = 0;
let targetProgress = 0;
let lastFrame = 0;

const chapters = [
  {
    number: '01',
    label: 'THE PROBLEM',
    title: 'A payment went through.\nTrust did not.',
    description: 'A customer says the package never arrived. The merchant sees “delivered”. Two versions of the same transaction. Neither side has the complete picture.',
    caption: 'ONE PAYMENT / TWO PERSPECTIVES',
  },
  {
    number: '02',
    label: 'THE INTELLIGENCE',
    title: 'From conflicting stories\nto clearer decisions.',
    description: 'ResolveOS examines evidence, brings each perspective into focus, and helps the parties explore possible resolutions—without inventing facts or moving money.',
    caption: 'EVIDENCE FIRST / PEOPLE IN CONTROL',
  },
  {
    number: '03',
    label: 'THE RESOLUTION',
    title: 'A resolution you\ncan actually verify.',
    description: 'Both parties review the exact proposed settlement. Once they approve, the payment service can initiate a PayPal Sandbox refund and show its verified status.',
    caption: 'APPROVAL / EXECUTION / PROOF',
  },
] as const;

const progressLabel = computed(() => String(chapter.value + 1).padStart(2, '0'));
// Scroll remains native; only the decorative parallax follows with eased inertia.
function updateProgress() {
  if (!storyEl.value) return;
  const bounds = storyEl.value.getBoundingClientRect();
  const distance = Math.max(1, storyEl.value.offsetHeight - window.innerHeight);
  targetProgress = Math.max(0, Math.min(1, -bounds.top / distance));
  const positions = [...storyEl.value.querySelectorAll<HTMLElement>('[data-story-chapter]')];
  let best = 0;
  let shortest = Infinity;
  positions.forEach((el, index) => {
    const center = el.getBoundingClientRect().top + el.offsetHeight / 2;
    const gap = Math.abs(center - window.innerHeight / 2);
    if (gap < shortest) { shortest = gap; best = index; }
  });
  chapter.value = best;
  if (!frame) frame = requestAnimationFrame(animateProgress);
}
function animateProgress(now: number) {
  const dt = lastFrame ? Math.min(64, now - lastFrame) : 16;
  lastFrame = now;
  const easing = reduceMotion.value ? 1 : 1 - Math.exp(-dt / 240);
  const delta = targetProgress - progress.value;
  progress.value = Math.abs(delta) < .00015 ? targetProgress : progress.value + delta * easing;
  frame = progress.value === targetProgress ? 0 : requestAnimationFrame(animateProgress);
}
function onScroll() {
  updateProgress();
}
function jumpTo(index: number) {
  document.getElementById('story-' + index)?.scrollIntoView({ behavior: reduceMotion.value ? 'auto' : 'smooth', block: 'center' });
}
onMounted(() => {
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  updateProgress();
  cinematicPaused.value = reduceMotion.value;
  cinematicRaf = requestAnimationFrame(tickCinematic);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', onScroll);
  if (frame) cancelAnimationFrame(frame);
  lastFrame = 0;
  if (cinematicRaf) cancelAnimationFrame(cinematicRaf);
});
</script>

<template>
  <div class="premium-intro min-h-screen" :class="{ 'theme-dark': currentTheme === 'dark', 'cinematic-paused': cinematicPaused || reduceMotion }" :style="{ '--scroll': progress }">
    <div class="studio-lines" aria-hidden="true" />
    <div class="studio-light studio-light-left" aria-hidden="true" />
    <div class="studio-light studio-light-right" aria-hidden="true" />

    <header class="premium-nav">
      <RouterLink to="/" aria-label="ResolveOS home" class="premium-brand"><Logo /></RouterLink>
      <div class="premium-nav-center"><span class="nav-dot" /> PAYMENTS, REIMAGINED</div>
      <div class="premium-nav-actions">
        <button type="button" class="premium-theme" @click="toggleTheme" :aria-label="currentTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'">
          <Moon v-if="currentTheme === 'light'" :size="17" /><Sun v-else :size="17" />
        </button>
        <RouterLink to="/signin" class="premium-nav-link">Launch app <ArrowUpRight :size="16" /></RouterLink>
      </div>
    </header>

    <main id="main">
      <div ref="storyEl" class="story-stage">
        <div class="story-progress" aria-label="Introduction chapters">
          <span class="progress-copy">{{ progressLabel }} <span>/ 03</span></span>
          <div class="progress-track"><div class="progress-fill" :style="{ transform: 'scaleY(' + Math.max(.02, progress) + ')' }" /></div>
          <button v-for="(item, index) in chapters" :key="item.number" type="button" class="progress-button" :class="{ selected: chapter === index }" :aria-label="'Go to '+item.label.toLowerCase()" @click="jumpTo(index)">{{ item.number }}</button>
        </div>

        <!-- The object stays in place while the story and its environment change around it. -->
        <div class="product-stage" aria-label="Animated ResolveOS payment resolution illustration">
          <div class="stage-ground" aria-hidden="true" />
          <div class="stage-disc" aria-hidden="true" />
          <!-- Autoplaying architectural motion system, inspired by the supplied reference.
               All objects are drawn with CSS and remain decorative, not mock transactions. -->
          <div class="cinematic-architecture" aria-hidden="true">
            <div class="cinematic-beam beam-a" />
            <div class="cinematic-beam beam-b" />
            <div class="cinematic-plinth plinth-a" />
            <div class="cinematic-plinth plinth-b" />
            <div class="cinematic-ring-assembly">
              <div class="cinematic-ring ring-a" />
              <div class="cinematic-ring ring-b" />
              <div class="cinematic-ring ring-c" />
            </div>
            <div class="cinematic-glow" />
          </div>
          <div class="core-system" :class="'core-chapter-' + chapter" aria-hidden="true">
            <div class="core-shadow" />
            <div class="core-halo core-halo-one" />
            <div class="core-halo core-halo-two" />
            <div class="core-orb">
              <div class="core-glow" />
              <div class="core-shine" />
              <div class="core-contour core-contour-one" />
              <div class="core-contour core-contour-two" />
            </div>
            <div class="core-orbit core-orbit-one" />
            <div class="core-orbit core-orbit-two" />
            <div class="core-orbit core-orbit-three" />
          </div>
          <div class="floating-annotation annotation-one" :class="{ visible: chapter === 0 }">
            <span class="annotation-indicator amber" />
            <span>PAYMENT FLAGGED</span>
            <strong>$180.00</strong>
          </div>
          <div class="floating-annotation annotation-two" :class="{ visible: chapter === 1 }">
            <span class="annotation-indicator blue" />
            <span>EVIDENCE REVIEW</span>
            <strong>3 sources</strong>
          </div>
          <div class="floating-annotation annotation-three" :class="{ visible: chapter === 2 }">
            <span class="annotation-indicator green" />
            <span>PAYPAL SANDBOX</span>
            <strong>Verified status</strong>
          </div>
          <div class="cinematic-playback" aria-label="Decorative animation controls">
            <button type="button" class="cinematic-toggle" :aria-label="cinematicPaused ? 'Play hero animation' : 'Pause hero animation'" @click="toggleCinematic">
              <Play v-if="cinematicPaused" :size="14" fill="currentColor" />
              <Pause v-else :size="14" fill="currentColor" />
            </button>
            <input class="cinematic-scrub" type="range" min="0" max="100" step="0.1"
              :value="(cinematicElapsed / cinematicDuration) * 100"
              :style="{ '--played': ((cinematicElapsed / cinematicDuration) * 100) + '%' }"
              aria-label="Animation progress" @input="seekCinematic" />
            <span class="cinematic-time">{{ String(Math.floor(cinematicElapsed)).padStart(2, '0') }} / {{ cinematicDuration }}s</span>
          </div>
          <div class="product-caption"><span class="caption-led" /> RESOLVE / INTELLIGENCE LAYER <span class="caption-number">00{{ chapter + 1 }}</span></div>
        </div>

        <div class="story-copy">
          <section v-for="(item, index) in chapters" :key="item.number" :id="'story-' + index" :data-story-chapter="index" class="story-chapter" :class="{ 'story-chapter-active': chapter === index }">
            <div class="chapter-inner">
              <p class="chapter-eyebrow"><span class="eyebrow-line" /> {{ item.number }} — {{ item.label }}</p>
              <h1 v-if="index === 0" class="chapter-title">{{ item.title }}</h1>
              <h2 v-else class="chapter-title">{{ item.title }}</h2>
              <p class="chapter-description">{{ item.description }}</p>
              <div class="chapter-tag"><Sparkles :size="14" /> {{ item.caption }}</div>

              <div v-if="index === 0" class="case-mini">
                <div class="case-mini-top"><span><span class="tiny-amber" /> DELIVERY DISPUTED</span><span>ORDER #1042</span></div>
                <div class="case-mini-row"><span>Buyer</span><strong>“It never arrived.”</strong></div>
                <div class="case-mini-row"><span>Merchant</span><strong>“Tracking says delivered.”</strong></div>
              </div>
              <div v-if="index === 1" class="case-mini">
                <div class="case-mini-top"><span><FileSearch :size="13" /> INVESTIGATION</span><span>ILLUSTRATIVE</span></div>
                <div class="case-mini-row"><span>PAYPAL</span><strong>Transaction verified</strong><CircleCheck :size="15" class="ok-color" /></div>
                <div class="case-mini-row"><span>MERCHANT</span><strong>Tracking record provided</strong></div>
                <div class="case-mini-row"><span>UNRESOLVED</span><strong>No recipient signature</strong></div>
              </div>
              <div v-if="index === 2" class="case-mini">
                <div class="case-mini-top"><span><ShieldCheck :size="13" /> CONTROLLED SETTLEMENT</span><span>SANDBOX</span></div>
                <div class="case-mini-row"><span>01</span><strong>Both parties approve</strong><Check :size="15" class="ok-color" /></div>
                <div class="case-mini-row"><span>02</span><strong>PayPal refund requested</strong><CreditCard :size="15" /></div>
                <div class="case-mini-row"><span>03</span><strong>Real transaction status tracked</strong><CircleCheck :size="15" class="ok-color" /></div>
              </div>
              <div v-if="index === 0" class="scroll-hint"><ArrowDown :size="17" /> SCROLL TO EXPLORE</div>
              <div v-if="index === 2" class="final-actions">
                <RouterLink to="/signin" class="action-primary">Enter ResolveOS <ArrowUpRight :size="19" /></RouterLink>
                <RouterLink to="/about" class="action-secondary">Explore the product <ArrowRight :size="17" /></RouterLink>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section class="studio-footer">
        <span>AN INDEPENDENT HACKATHON CONCEPT</span>
        <span>PAYPAL SANDBOX · TEST MONEY ONLY</span>
        <RouterLink to="/signin">ENTER APPLICATION <ArrowUpRight :size="15" /></RouterLink>
      </section>
    </main>
  </div>
</template>

<style scoped>
.premium-intro {
  --premium-text:#14223b; --premium-muted:#62718a; --premium-line:rgba(79,111,159,.15);
  --premium-glass:rgba(255,255,255,.62);
  position:relative; isolation:isolate; overflow:clip; color:var(--premium-text);
  background:linear-gradient(119deg,#f7faff 0%,#eff5ff 37%,#e2eeff 65%,#f6faff 100%);
}
.studio-lines {position:absolute;inset:0;z-index:-1;pointer-events:none;background:repeating-linear-gradient(90deg,transparent 0 115px,rgba(70,110,170,.055) 116px,transparent 117px);mask-image:linear-gradient(90deg,transparent,#000 35%,#000 85%,transparent)}
.studio-light {position:absolute;border-radius:50%;pointer-events:none;filter:blur(85px);opacity:.68;z-index:-1}
.studio-light-left {width:65vw;height:65vw;left:-40vw;top:25vh;background:#fff}
.studio-light-right {width:55vw;height:55vw;right:-30vw;top:65vh;background:#9bc4ff}
.premium-nav {position:absolute;z-index:30;top:0;left:0;width:100%;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:27px clamp(24px,5vw,78px)}
.premium-brand {display:flex;align-items:center}
.premium-nav-center {font-family:var(--font-mono,monospace);font-size:10px;letter-spacing:.22em;color:#657690;display:flex;gap:11px;align-items:center}
.nav-dot {width:7px;height:7px;border-radius:100%;background:#43c6bb;box-shadow:0 0 0 4px #43c6bb24}
.premium-nav-actions {display:flex;align-items:center;gap:14px}
.premium-theme {border:1px solid #c7d8ed;border-radius:50%;background:#ffffffad;width:39px;height:39px;display:grid;place-items:center;cursor:pointer;color:#263e65}
.premium-nav-link {padding:12px 20px;background:#172a47;color:#fff;border-radius:100px;font-size:12px;font-weight:650;display:flex;gap:12px;align-items:center;transition:transform .2s,background .2s}
.premium-nav-link:hover,.action-primary:hover {transform:translateY(-2px);background:#264e91}
.story-stage {position:relative;max-width:1600px;margin:auto;min-height:435svh}
.story-copy {position:relative;z-index:12;width:49%;padding-left:clamp(24px,9vw,145px)}
.story-chapter {min-height:145svh;display:flex;align-items:center;padding:150px 0 130px;scroll-margin-top:0}
.chapter-inner {max-width:580px;opacity:.22;transform:translateY(24px);filter:blur(2px);transition:opacity 1.1s cubic-bezier(.22,1,.36,1),transform 1.25s cubic-bezier(.22,1,.36,1),filter 1.1s ease}
.story-chapter-active .chapter-inner {opacity:1;transform:none;filter:none}
.chapter-eyebrow {font-family:var(--font-mono,monospace);display:flex;align-items:center;gap:12px;color:#5277b5;font-size:11px;letter-spacing:.2em;font-weight:650}
.eyebrow-line {width:30px;height:1px;background:#699ade}
.chapter-title {white-space:pre-line;font-size:clamp(44px,5.2vw,90px);line-height:1.055;letter-spacing:-.068em;font-weight:680;margin:24px 0}
.chapter-description {font-size:clamp(15px,1.3vw,18px);line-height:1.75;color:var(--premium-muted);max-width:510px}
.chapter-tag {display:inline-flex;align-items:center;gap:9px;margin-top:26px;padding:9px 12px;border:1px solid #c8d9ee;border-radius:40px;color:#5876a0;background:#ffffff75;font:600 10px var(--font-mono,monospace);letter-spacing:.07em}
.case-mini {margin-top:36px;padding:21px 24px;width:min(100%,455px);background:var(--premium-glass);border:1px solid rgba(255,255,255,.95);box-shadow:0 24px 65px #456ba51a,0 1px 0 #ffffffa8 inset;border-radius:20px;backdrop-filter:blur(18px)}
.case-mini-top {display:flex;justify-content:space-between;gap:10px;margin-bottom:16px;font:650 10px var(--font-mono,monospace);letter-spacing:.09em;color:#587294}
.case-mini-top span:first-child {display:inline-flex;align-items:center;gap:7px}
.tiny-amber {height:7px;width:7px;background:#ffac53;border-radius:100%}
.case-mini-row {display:flex;align-items:center;gap:10px;padding:11px 0;border-top:1px solid #cad9ec89;font-size:13px}
.case-mini-row span {min-width:85px;color:#7890ad;font:600 10px var(--font-mono,monospace);text-transform:uppercase}
.case-mini-row strong {font-weight:600;flex:1}
.ok-color {color:#169782}
.scroll-hint {margin-top:40px;display:flex;align-items:center;gap:14px;color:#55759e;font:650 10px var(--font-mono,monospace);letter-spacing:.15em}
.scroll-hint svg {animation:scroll-indicate 1.8s ease-in-out infinite}
.final-actions {display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:36px}
.action-primary,.action-secondary {display:inline-flex;align-items:center;gap:15px;padding:17px 24px;border-radius:100px;font-size:14px;font-weight:650;transition:transform .25s,background .25s}
.action-primary {color:#fff;background:#172a47;box-shadow:0 10px 30px #172a472a}
.action-secondary {color:#284b7d;background:#ffffffaa;border:1px solid #cbdcf0}
.action-secondary:hover {transform:translateY(-2px);background:#fff}
.product-stage {position:sticky;z-index:5;top:0;height:100svh;float:right;width:51%;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:visible}
.stage-ground {position:absolute;width:min(64vw,830px);height:clamp(180px,19vw,265px);bottom:7%;left:50%;transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse,#8db9ed42,transparent 65%);filter:blur(18px)}
.stage-disc {position:absolute;width:min(39vw,560px);height:min(39vw,560px);border:1px solid #d9e7faba;border-radius:50%;transform:rotateX(68deg) translateY(28%);box-shadow:0 0 0 28px #e6effb45,0 0 0 100px #d7e5f51b}
.core-system {width:min(34vw,490px);aspect-ratio:1;position:relative;transform-style:preserve-3d;transform:translateY(calc(24px - var(--scroll)*55px)) rotate(calc(var(--scroll)*35deg));transition:filter .8s ease}
.core-orb {position:absolute;inset:12%;z-index:3;border-radius:48% 52% 53% 47% / 50% 48% 52% 50%;background:
 radial-gradient(ellipse at 27% 20%,#ffffffed 0%,#d2f4ffca 8%,transparent 32%),
 radial-gradient(ellipse at 68% 78%,#4424d5 0%,#6c45f7 21%,transparent 58%),
 radial-gradient(ellipse at 35% 44%,#57caff 0%,#0076f3 42%,#1847c7 74%,#161979 100%);
box-shadow:inset 18px 25px 40px #ffffff80,inset -18px -30px 42px #161675bb,0 30px 70px #135cd14d,0 0 100px #4e93fc30;
filter:saturate(1.12);animation:orb-breathe 7s ease-in-out infinite}
.core-glow {position:absolute;inset:8%;border-radius:50%;background:radial-gradient(ellipse at 30% 25%,#d4fbff7f,transparent 38%)}
.core-shine {position:absolute;inset:6% 11% auto 12%;height:43%;border-top:3px solid #ffffffab;border-radius:100%;transform:rotate(-20deg);filter:blur(2px)}
.core-contour {position:absolute;inset:20% -6%;border:2px solid #d4faff9c;border-radius:50%;transform:rotate(-36deg);box-shadow:0 0 17px #60dfff88}
.core-contour-two {inset:7% 35%;transform:rotate(30deg);border-color:#ffffff8c}
.core-orbit {position:absolute;z-index:6;left:0;top:21%;width:100%;height:58%;border:clamp(6px,1vw,14px) solid transparent;border-top-color:#b8eaffd9;border-bottom-color:#2367d8cc;border-radius:50%;transform:rotate(-37deg);box-shadow:0 -4px 12px #d9faff66;animation:orbit-turn 16s linear infinite}
.core-orbit-two {z-index:4;top:8%;left:19%;width:62%;height:87%;border-width:clamp(5px,.8vw,11px);border-top-color:#d6e7ffb5;border-bottom-color:#2b71c7a6;transform:rotate(38deg);animation:orbit-turn-reverse 20s linear infinite}
.core-orbit-three {z-index:7;top:39%;left:-7%;width:114%;height:23%;border-width:clamp(3px,.65vw,8px);border-top-color:#c8f6ffb9;border-bottom-color:#426af5b7;transform:rotate(18deg);animation:orbit-turn 22s linear infinite}
.core-shadow {position:absolute;bottom:0;left:20%;width:60%;height:15%;background:#2752aa58;filter:blur(35px);border-radius:50%}
.core-halo {position:absolute;inset:-12%;border-radius:50%;border:1px solid #80afe847}
.core-halo-two {inset:-28%;border-color:#a7c8f33b}
.core-chapter-1 .core-orb {filter:hue-rotate(17deg) saturate(1.2)}
.core-chapter-2 .core-orb {filter:hue-rotate(-18deg) saturate(.9)}
.floating-annotation {position:absolute;z-index:9;display:flex;align-items:center;gap:9px;background:#ffffffd9;border:1px solid white;border-radius:13px;padding:13px 16px;box-shadow:0 18px 35px #4b6d9d30;font:650 10px var(--font-mono,monospace);letter-spacing:.08em;color:#607796;opacity:0;transform:translateY(23px) scale(.93);transition:opacity .6s,transform .6s;backdrop-filter:blur(20px);white-space:nowrap}
.floating-annotation strong {color:#203a65;font:700 13px var(--font-sans,sans-serif);letter-spacing:0}
.floating-annotation.visible {opacity:1;transform:translateY(0) scale(1);animation:annotation-float 5s ease-in-out infinite}
.annotation-one {top:25%;left:0}.annotation-two {top:24%;right:-1%}.annotation-three {bottom:23%;left:4%}
.annotation-indicator {width:7px;height:7px;border-radius:50%}.annotation-indicator.amber {background:#ffaf54}.annotation-indicator.blue {background:#3978ed}.annotation-indicator.green {background:#30b99c}
.product-caption {position:absolute;bottom:13%;left:15%;right:15%;display:flex;align-items:center;gap:9px;color:#738ab1;font:600 9px var(--font-mono,monospace);letter-spacing:.13em}
.caption-led {height:5px;width:5px;border-radius:50%;background:#44c6b4}.caption-number {margin-left:auto}
.story-progress {position:fixed;z-index:28;top:43%;left:clamp(10px,3vw,43px);display:flex;flex-direction:column;align-items:center;gap:16px}
.progress-copy {font:700 11px var(--font-mono,monospace);color:#44658f}.progress-copy span {opacity:.45}
.progress-track {height:115px;width:1px;background:#bad0ec;position:relative;overflow:hidden}
.progress-fill {position:absolute;inset:0;background:#3877e5;transform-origin:top;transition:transform .1s linear}
.progress-button {font:650 11px var(--font-mono,monospace);color:#a4b7cd;cursor:pointer;transition:color .2s,transform .2s}
.progress-button.selected {color:#265eb7;transform:scale(1.15)}
.studio-footer {position:relative;z-index:15;max-width:1600px;margin:auto;padding:50px clamp(24px,9vw,145px) 60px;border-top:1px solid #cbdcf080;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;font:650 10px var(--font-mono,monospace);letter-spacing:.12em;color:#8194ac}
.studio-footer a {color:#315d9a;display:flex;align-items:center;gap:8px}
@keyframes orb-breathe {50% {transform:scale(1.035) rotate(-5deg);border-radius:53% 47% 48% 52% / 49% 53% 47% 51%}}
@keyframes orbit-turn {50% {transform:rotate(-17deg) scale(1.035)}}
@keyframes orbit-turn-reverse {50% {transform:rotate(65deg) scale(.96)}}
@keyframes annotation-float {50% {translate:0 -9px}}
@keyframes scroll-indicate {50% {transform:translateY(7px)}}

/* Premium architectural hero: kinetic surfaces move continuously independently of scroll. */
.cinematic-architecture {position:absolute;inset:4% -9%;perspective:950px;transform-style:preserve-3d;pointer-events:none;z-index:1;opacity:.88;filter:drop-shadow(0 26px 30px rgba(70,92,170,.14))}
.cinematic-beam {position:absolute;width:74%;height:19%;left:15%;top:37%;border-radius:24px;background:linear-gradient(135deg,#fbfdff 7%,#c7d8fc 34%,#9179ff 53%,#4f32df 59%,#d6dfff 82%,#f7fbff 100%);box-shadow:inset 3px 3px 9px #fff,0 20px 45px #7162d64f;transform:rotate(-31deg) skewX(-17deg);animation:kinetic-beam 14s cubic-bezier(.45,0,.55,1) infinite alternate;transform-origin:center}
.beam-b {width:48%;height:14%;top:60%;left:30%;background:linear-gradient(145deg,#f7fbff,#d3dffc 35%,#9db5ff 50%,#7455ed 70%,#f9faff);animation-delay:-7s;animation-direction:alternate-reverse}
.cinematic-plinth {position:absolute;width:33%;height:26%;left:53%;top:17%;border-radius:25px;background:linear-gradient(135deg,#fff,#e7eafd 38%,#d5d0f6 57%,#fff);box-shadow:inset 3px 5px 15px #fff,14px 27px 33px #8977bf30;transform:rotate(-24deg) skew(-12deg);animation:kinetic-plinth 14s ease-in-out infinite alternate}
.plinth-b {top:61%;left:9%;width:29%;height:20%;animation-delay:-7s;animation-direction:alternate-reverse}
.cinematic-ring-assembly {position:absolute;inset:17% 18%;transform-style:preserve-3d;transform:rotate(-23deg);animation:kinetic-assembly 14s ease-in-out infinite alternate}
.cinematic-ring {position:absolute;inset:7%;border-radius:50%;border:clamp(18px,3.5vw,44px) solid transparent;border-top-color:#fcfdff;border-right-color:#e3e5ff;border-bottom-color:#bbc1fa;border-left-color:#fff;box-shadow:inset 0 8px 23px #6d6fd256,10px 22px 34px #6069ad33,0 0 19px #fff;transform:rotateY(57deg) rotateZ(22deg)}
.ring-b {inset:16%;border-width:clamp(11px,2vw,28px);border-left-color:#afaaf9;transform:rotateY(-46deg) rotateZ(36deg);animation:kinetic-ring 14s ease-in-out infinite alternate-reverse}
.ring-c {inset:32%;border-width:clamp(6px,1.2vw,15px);border-right-color:#7e66e8;transform:rotateX(70deg) rotateZ(18deg)}
.cinematic-glow {position:absolute;inset:21%;background:radial-gradient(ellipse,#a35bff77,transparent 63%);filter:blur(31px);mix-blend-mode:screen;animation:kinetic-glow 7s ease-in-out infinite alternate}
.cinematic-architecture + .core-system {opacity:.38;transform:translateY(calc(24px - var(--scroll)*55px)) scale(.63) rotate(calc(var(--scroll)*35deg));mix-blend-mode:multiply}
.cinematic-playback {position:absolute;bottom:7%;left:18%;right:18%;z-index:15;display:flex;align-items:center;gap:13px;padding:9px 13px;border-radius:999px;border:1px solid #ffffffb8;background:#ffffffa6;box-shadow:0 12px 40px #536ea028;backdrop-filter:blur(18px);pointer-events:auto}
.cinematic-toggle {width:27px;height:27px;flex-shrink:0;border-radius:50%;display:grid;place-items:center;background:#244776;color:#fff;cursor:pointer}
.cinematic-scrub {flex:1;min-width:40px;appearance:none;height:4px;border-radius:999px;background:linear-gradient(to right,#8f58f5 var(--played),#bac9e0 var(--played));cursor:pointer}
.cinematic-scrub::-webkit-slider-thumb {appearance:none;width:10px;height:10px;background:#7b50ed;border-radius:50%;box-shadow:0 0 0 4px #926bff30}
.cinematic-scrub::-moz-range-thumb {width:10px;height:10px;background:#7b50ed;border:0;border-radius:50%}
.cinematic-time {font:650 10px var(--font-mono,monospace);white-space:nowrap;color:#5b6b87}
.cinematic-paused .cinematic-architecture * {animation-play-state:paused!important}
.theme-dark .cinematic-architecture {opacity:.6;filter:drop-shadow(0 20px 35px rgba(49,60,135,.28))}
.theme-dark .cinematic-architecture + .core-system {mix-blend-mode:screen;opacity:.58}
.theme-dark .cinematic-playback {background:#1b2d4dcc;border-color:#587097}
.theme-dark .cinematic-time {color:#d4e3fd}
.theme-dark .cinematic-toggle {background:#bbd6ff;color:#162a50}
@keyframes kinetic-beam {0%{transform:translate3d(-10%,10%,0) rotate(-31deg) skewX(-17deg) scale(.82)}50%{transform:translate3d(15%,-18%,0) rotate(22deg) skewX(-17deg) scale(1.1)}100%{transform:translate3d(-2%,12%,0) rotate(-15deg) skewX(-10deg) scale(.94)}}
@keyframes kinetic-plinth {0%{transform:translate3d(14%,30%,0) rotate(-24deg) skew(-12deg)}50%{transform:translate3d(-12%,-24%,0) rotate(18deg) skew(-12deg)}100%{transform:translate3d(18%,2%,0) rotate(-13deg) skew(-3deg)}}
@keyframes kinetic-assembly {0%{transform:rotate(-23deg) rotateY(-18deg) scale(.9)}50%{transform:rotate(19deg) rotateY(22deg) scale(1.05)}100%{transform:rotate(-12deg) rotateY(-10deg) scale(.94)}}
@keyframes kinetic-ring {to{transform:rotateY(35deg) rotateZ(-45deg)}}
@keyframes kinetic-glow {to{opacity:.5;transform:scale(1.4)}}

@media (max-width:1100px) {
 .story-copy {width:53%;padding-left:clamp(32px,7vw,90px)} .product-stage {width:47%}
 .chapter-title {font-size:clamp(42px,5vw,70px)}
 .floating-annotation {font-size:8px;padding:10px}.floating-annotation strong {font-size:11px}
 .core-system {width:40vw}
}
@media(max-width:760px) {
 .premium-nav {padding:18px 20px}.premium-nav-center {display:none}.premium-nav-link {padding:11px 14px}
 .story-stage {display:flex;flex-direction:column;min-height:0}
 .product-stage {position:sticky;top:75px;order:0;float:none;width:100%;height:43svh;min-height:285px;overflow:hidden;z-index:16}
 .story-copy {order:1;width:100%;padding:0 23px}
 .story-chapter {min-height:105svh;padding:65px 0 130px;align-items:flex-start;scroll-margin-top:36vh}
 .chapter-inner {filter:none;opacity:.5;transform:translateY(15px)}
 .chapter-title {font-size:clamp(43px,10vw,68px);max-width:580px}
 .chapter-description {font-size:15px}
 .core-system {width:260px;transform:translateY(calc(18px - var(--scroll)*28px)) rotate(calc(var(--scroll)*35deg))}
 .stage-disc {width:340px;height:340px}
 .stage-ground {bottom:-20%}.product-caption {bottom:4%;left:20%;right:20%;font-size:7px}
 .floating-annotation {font-size:7px;padding:9px;gap:5px}.floating-annotation strong {font-size:10px}
 .annotation-one {top:10%;left:4%}.annotation-two {top:12%;right:2%}.annotation-three {bottom:13%;left:3%}
 .story-progress {display:none}
 .cinematic-architecture {inset:0 -5%}
 .cinematic-playback {bottom:1%;left:14%;right:14%;padding:6px 9px}
 .cinematic-time {font-size:8px}
 .case-mini {margin-top:26px}
 .studio-footer {padding:36px 24px 44px}
}
@media(max-width:390px) {
 .chapter-title {font-size:41px}.product-stage {height:38svh}.story-chapter {min-height:110svh}
}
@media (prefers-reduced-motion:reduce) {
 .chapter-inner {opacity:1;transform:none;filter:none}
 .core-system {transform:none}
 .core-orb,.core-orbit,.scroll-hint svg,.floating-annotation,.cinematic-architecture * {animation:none!important}
 .floating-annotation.visible {transform:none}
}
/* Component-local theme states prevent the intro's hard-coded light palette from
   overriding the app-wide theme. All decorative elements share the same toggle. */
.premium-intro {
  transition:background .55s ease,color .4s ease;
}
.premium-intro.theme-dark {
  --premium-text:#eef5ff;
  --premium-muted:#b5c5de;
  --premium-line:rgba(149,178,222,.24);
  --premium-glass:rgba(23,38,65,.76);
  color:var(--premium-text);
  background:linear-gradient(118deg,#090f1c 0%,#12203a 40%,#182e50 68%,#0a1426 100%);
}
.theme-dark .studio-lines {
  background:repeating-linear-gradient(90deg,transparent 0 115px,rgba(157,189,235,.075) 116px,transparent 117px);
}
.theme-dark .studio-light-left {background:#3864b7;opacity:.26}
.theme-dark .studio-light-right {background:#427ddb;opacity:.33}
.theme-dark .premium-nav-center,.theme-dark .progress-copy,
.theme-dark .product-caption {color:#b4c9e5}
.theme-dark .premium-theme {background:#213452;border-color:#557096;color:#eaf3ff}
.theme-dark .premium-theme:hover {background:#31496e}
.theme-dark .premium-nav-link,.theme-dark .action-primary {
  background:#dceaff;color:#14294c;
}
.theme-dark .premium-nav-link:hover,.theme-dark .action-primary:hover {
  background:#ffffff;color:#0d2244;
}
.theme-dark .chapter-eyebrow,.theme-dark .scroll-hint,
.theme-dark .chapter-tag {color:#a6c5f8}
.theme-dark .chapter-description {color:var(--premium-muted)}
.theme-dark .eyebrow-line {background:#8fb8f3}
.theme-dark .chapter-tag {background:rgba(31,53,86,.72);border-color:#4b6c9d}
.theme-dark .case-mini {background:var(--premium-glass);border-color:#4b6489;box-shadow:0 24px 60px #02091566}
.theme-dark .case-mini-top,.theme-dark .case-mini-row span {color:#b0c2dc}
.theme-dark .case-mini-row {border-color:rgba(153,179,221,.22)}
.theme-dark .case-mini-row strong {color:#f3f7ff}
.theme-dark .ok-color {color:#69dfbc}
.theme-dark .action-secondary {background:#20385c;color:#d7e8ff;border-color:#57749b}
.theme-dark .action-secondary:hover {background:#2d4b74}
.theme-dark .stage-ground {background:radial-gradient(ellipse,#4074cb4d,transparent 65%)}
.theme-dark .stage-disc {border-color:#5278ac80;box-shadow:0 0 0 28px #456eac18,0 0 0 100px #5780c30b}
.theme-dark .core-halo {border-color:#75b8ff5b}
.theme-dark .core-halo-two {border-color:#7ca8ea32}
.theme-dark .floating-annotation {background:#1d3254ec;border-color:#5877a5;box-shadow:0 18px 42px #02071373;color:#c0d5f3}
.theme-dark .floating-annotation strong {color:#f4f8ff}
.theme-dark .progress-track {background:#53739d}
.theme-dark .progress-fill {background:#94c2ff}
.theme-dark .progress-button {color:#809cc5}
.theme-dark .progress-button.selected {color:#c7e2ff}
.theme-dark .studio-footer {border-color:#47628a88;color:#b2c5dd}
.theme-dark .studio-footer a {color:#bbd5ff}
@media(prefers-reduced-motion:reduce) {
  .premium-intro {transition:none}
}
</style>
