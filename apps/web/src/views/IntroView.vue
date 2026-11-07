<script setup lang="ts">
import { ArrowDown, ArrowRight, ArrowUpRight, ChevronDown, Moon, Sun, LockKeyhole, Check } from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Logo from '@/components/Logo.vue';
import { useThemePreference } from '@/lib/useThemePreference';

const { currentTheme, toggleTheme } = useThemePreference();
const chapter = ref(0);
const reducedMotion = ref(false);
let wheelAccum = 0;
let lastWheelDirection = 0;
let lastNavigationAt = 0;
let touchStartY: number | null = null;

const stories = [
  { kicker: '01 / THE PROBLEM', title: 'A payment went through.\nTrust did not.', detail: 'The customer says it never arrived. The seller sees delivered. Both deserve to be heard.', label: 'THE DISPUTE' },
  { kicker: '02 / THE INTELLIGENCE', title: 'Two sides.\nOne conversation.', detail: 'Independent AI advocates assess evidence, exchange offers, and respect private limits.', label: 'THE NEGOTIATION' },
  { kicker: '03 / THE SAFEGUARDS', title: 'AI proposes.\nPeople decide.', detail: 'No agent can move money. Both people must approve the exact same terms.', label: 'THE APPROVAL' },
  { kicker: '04 / THE RESOLUTION', title: 'Resolved.\nWith proof.', detail: 'Approved refunds are executed using PayPal Sandbox and recorded with a verifiable receipt.', label: 'THE OUTCOME' },
] as const;
const activeIndex = computed(() => chapter.value);
const position = computed(() => chapter.value);
const progress = computed(() => chapter.value / (stories.length - 1));
const story = computed(() => stories[chapter.value]!);

const interpolate = (stops: number[], t: number) => {
  const i = Math.min(stops.length - 2, Math.max(0, Math.floor(t)));
  const local = Math.min(1, Math.max(0, t - i));
  const ease = local * local * (3 - 2 * local);
  return stops[i]! + (stops[i + 1]! - stops[i]!) * ease;
};
const sceneStyle = computed(() => {
  const t = position.value;
  return {
    '--device-scale': String(interpolate([.90,.96,1.0,.90],t)),
    '--device-rotation': interpolate([-9,5,-12,-9],t) + 'deg',
    '--device-x': interpolate([0,-2,3,0],t) + '%',
    '--device-y': interpolate([0,-2,2,0],t) + '%',
    '--desk-scale': String(interpolate([1,1.13,1.22,1.02],t)),
    '--camera-light': String(interpolate([.45,.8,1,.55],t)),
  } as Record<string,string>;
});
const opacityAt = (index: number) => index === chapter.value ? 1 : 0;

function jumpTo(index: number) {
  const next = Math.max(0, Math.min(stories.length - 1, index));
  if (next === chapter.value) return;
  const now = performance.now();
  // Allow the full visual morph and text handoff to finish before another step.
  if (!reducedMotion.value && now - lastNavigationAt < 1650) return;
  chapter.value = next;
  wheelAccum = 0;
  lastNavigationAt = now;
}

// A single scroll/swipe gesture moves to exactly one settled chapter.
// There is never an idle state between two sets of copy or illustrations.
function handleWheel(event: WheelEvent) {
  if (event.ctrlKey) return;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
  if (Math.abs(delta) < 1) return;
  const direction = Math.sign(delta);
  if (direction !== lastWheelDirection) wheelAccum = 0;
  lastWheelDirection = direction;
  const now = performance.now();
  if (now - lastNavigationAt < (reducedMotion.value ? 300 : 1650)) return;
  wheelAccum += delta;
  if (Math.abs(wheelAccum) >= 50) jumpTo(chapter.value + direction);
}

function handleTouchStart(event: TouchEvent) {
  touchStartY = event.touches[0]?.clientY ?? null;
}
function handleTouchEnd(event: TouchEvent) {
  if (touchStartY === null) return;
  const distance = touchStartY - (event.changedTouches[0]?.clientY ?? touchStartY);
  touchStartY = null;
  if (Math.abs(distance) > 48 && performance.now() - lastNavigationAt >= (reducedMotion.value ? 300 : 1650)) {
    jumpTo(chapter.value + Math.sign(distance));
  }
}
function handleKeydown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const el = event.target;
  if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName))) return;
  if (['ArrowDown','PageDown'].includes(event.key) || (event.key === ' ' && !event.shiftKey)) {
    event.preventDefault(); jumpTo(chapter.value + 1);
  } else if (['ArrowUp','PageUp'].includes(event.key) || (event.key === ' ' && event.shiftKey)) {
    event.preventDefault(); jumpTo(chapter.value - 1);
  } else if (event.key === 'Home') {
    event.preventDefault(); jumpTo(0);
  } else if (event.key === 'End') {
    event.preventDefault(); jumpTo(stories.length - 1);
  }
}
onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.addEventListener('keydown', handleKeydown);
  window.scrollTo(0, 0);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="cinematic-intro bg-canvas text-ink" @wheel.prevent="handleWheel" @touchstart.passive="handleTouchStart" @touchend.passive="handleTouchEnd">
    <header class="cinema-header">
      <RouterLink to="/" aria-label="ResolveOS home"><Logo /></RouterLink>
      <div class="cinema-actions">
        <button type="button" class="cinema-icon" @click="toggleTheme" :aria-label="currentTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'">
          <Moon v-if="currentTheme === 'light'" :size="17" /><Sun v-else :size="17" />
        </button>
        <RouterLink to="/signin" class="cinema-enter">Enter ResolveOS <ArrowUpRight :size="15" /></RouterLink>
      </div>
    </header>

    <main id="main">
      <div class="cinema-scroll" :class="{ 'cinema-reduced': reducedMotion }">
        <section class="cinema-sticky" :style="sceneStyle" aria-label="ResolveOS product introduction">
          <!-- The reference's luminous, rotating motion is the hero; no device mockup or tabletop. -->
          <div class="luminous-world" :style="{ opacity: Math.max(opacityAt(0),opacityAt(3)) }" aria-hidden="true">
            <div class="luminous-halo halo-outer" />
            <div class="luminous-halo halo-middle" />
            <div class="luminous-halo halo-inner" />
            <div class="luminous-orbit orbit-alpha"><span /><span /><span /></div>
            <div class="luminous-orbit orbit-beta"><span /><span /></div>
            <div class="luminous-orbit orbit-gamma"><span /><span /></div>
            <div class="luminous-core">
              <div class="core-face core-front"><svg viewBox="0 0 32 32" class="core-emblem-logo" aria-hidden="true"><path d="M8.5 11.5h7.5a3.5 3.5 0 0 1 0 7H11" stroke="white" stroke-width="2.4" fill="none" stroke-linecap="round" /><path d="M23.5 20.5H16a3.5 3.5 0 0 1 0-7H21" stroke="var(--color-accent-bright)" stroke-width="2.4" fill="none" stroke-linecap="round" /></svg></div>
              <div class="core-face core-back" />
              <div class="core-face core-left" />
              <div class="core-face core-right" />
              <div class="core-face core-top" />
              <div class="core-face core-bottom" />
              <!-- Rounded beveled seams bridge adjacent faces, leaving no open corners. -->
              <span class="cube-bevel cube-bevel-x bevel-top bevel-front" />
              <span class="cube-bevel cube-bevel-x bevel-bottom bevel-front" />
              <span class="cube-bevel cube-bevel-x bevel-top bevel-back" />
              <span class="cube-bevel cube-bevel-x bevel-bottom bevel-back" />
              <span class="cube-bevel cube-bevel-y bevel-left bevel-front" />
              <span class="cube-bevel cube-bevel-y bevel-right bevel-front" />
              <span class="cube-bevel cube-bevel-y bevel-left bevel-back" />
              <span class="cube-bevel cube-bevel-y bevel-right bevel-back" />
              <span class="cube-bevel cube-bevel-z bevel-left bevel-top" />
              <span class="cube-bevel cube-bevel-z bevel-right bevel-top" />
              <span class="cube-bevel cube-bevel-z bevel-left bevel-bottom" />
              <span class="cube-bevel cube-bevel-z bevel-right bevel-bottom" />
              <span class="cube-corner corner-left corner-top corner-front" />
              <span class="cube-corner corner-left corner-top corner-back" />
              <span class="cube-corner corner-right corner-top corner-front" />
              <span class="cube-corner corner-right corner-top corner-back" />
              <span class="cube-corner corner-left corner-bottom corner-front" />
              <span class="cube-corner corner-left corner-bottom corner-back" />
              <span class="cube-corner corner-right corner-bottom corner-front" />
              <span class="cube-corner corner-right corner-bottom corner-back" />
            </div>
            <div class="luminous-beam beam-one" />
            <div class="luminous-beam beam-two" />
            <div class="luminous-particle particle-one" />
            <div class="luminous-particle particle-two" />
            <div class="luminous-particle particle-three" />
          </div>

          <!-- Page 02: three restrained glass orbs, rotating smoothly with no text. -->
          <div class="morph-scene negotiation-scene" :style="{ opacity: opacityAt(1) }" aria-hidden="true">
            <svg class="intelligence-art" viewBox="0 0 860 620" preserveAspectRatio="xMidYMid meet" focusable="false">
              <defs>
                <radialGradient id="intelligence-sphere-fill" cx="32%" cy="25%" r="82%">
                  <stop offset="0%" stop-color="#8bc9ff" stop-opacity=".28" />
                  <stop offset="34%" stop-color="#3676db" stop-opacity=".18" />
                  <stop offset="75%" stop-color="#0c2e75" stop-opacity=".12" />
                  <stop offset="100%" stop-color="#081638" stop-opacity=".32" />
                </radialGradient>
                <linearGradient id="intelligence-orbital-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#4481f5" stop-opacity=".18" />
                  <stop offset="35%" stop-color="#8dc8ff" stop-opacity=".77" />
                  <stop offset="60%" stop-color="#ecfaff" stop-opacity=".96" />
                  <stop offset="100%" stop-color="#407cff" stop-opacity=".27" />
                </linearGradient>
                <radialGradient id="intelligence-scene-glow">
                  <stop offset="0%" stop-color="#2869de" stop-opacity=".19" />
                  <stop offset="100%" stop-color="#2869de" stop-opacity="0" />
                </radialGradient>
              </defs>
              <ellipse cx="474" cy="313" rx="322" ry="270" fill="url(#intelligence-scene-glow)" />
              <circle cx="468" cy="304" r="251" class="intelligence-field" />
              <circle cx="468" cy="304" r="202" class="intelligence-field intelligence-field-alt" />

              <g class="intelligence-drift intelligence-drift-large">
                <g class="intelligence-sphere intelligence-sphere-large">
                  <circle r="118" class="intelligence-sphere-shell" />
                  <circle r="104" class="intelligence-sphere-inner" />
                  <g class="intelligence-sphere-axis intelligence-axis-a">
                    <ellipse rx="111" ry="44" class="intelligence-orbit-stroke" />
                  </g>
                  <g class="intelligence-sphere-axis intelligence-axis-b">
                    <ellipse rx="85" ry="112" class="intelligence-orbit-stroke intelligence-orbit-secondary" />
                  </g>
                  <path d="M-70 -79 C-32 -111 23 -112 74 -74" class="intelligence-sphere-sheen" />
                </g>
              </g>
              <g class="intelligence-drift intelligence-drift-medium">
                <g class="intelligence-sphere intelligence-sphere-medium">
                  <circle r="73" class="intelligence-sphere-shell" />
                  <circle r="63" class="intelligence-sphere-inner" />
                  <g class="intelligence-sphere-axis intelligence-axis-a">
                    <ellipse rx="67" ry="27" class="intelligence-orbit-stroke" />
                  </g>
                  <g class="intelligence-sphere-axis intelligence-axis-b">
                    <ellipse rx="50" ry="69" class="intelligence-orbit-stroke intelligence-orbit-secondary" />
                  </g>
                  <path d="M-43 -49 C-12 -68 17 -67 44 -43" class="intelligence-sphere-sheen" />
                </g>
              </g>
              <g class="intelligence-drift intelligence-drift-small">
                <g class="intelligence-sphere intelligence-sphere-small">
                  <circle r="56" class="intelligence-sphere-shell" />
                  <circle r="47" class="intelligence-sphere-inner" />
                  <g class="intelligence-sphere-axis intelligence-axis-a">
                    <ellipse rx="51" ry="21" class="intelligence-orbit-stroke" />
                  </g>
                  <g class="intelligence-sphere-axis intelligence-axis-b">
                    <ellipse rx="38" ry="52" class="intelligence-orbit-stroke intelligence-orbit-secondary" />
                  </g>
                  <path d="M-30 -36 C-9 -51 12 -51 31 -33" class="intelligence-sphere-sheen" />
                </g>
              </g>
              <circle cx="242" cy="191" r="2" class="intelligence-star" />
              <circle cx="710" cy="220" r="1.7" class="intelligence-star intelligence-star-second" />
            </svg>
          </div>
          <div class="morph-scene safeguard-scene" :style="{ opacity: opacityAt(2) }" aria-hidden="true">
            <div class="approval-ambient" />
            <div class="approval-orbit approval-orbit-outer" />
            <div class="approval-orbit approval-orbit-inner" />
            <div class="approval-path approval-path-left" />
            <div class="approval-path approval-path-right" />
            <div class="approval-signal approval-signal-left" />
            <div class="approval-signal approval-signal-right" />
            <div class="approval-burst approval-burst-one" />
            <div class="approval-burst approval-burst-two" />
            <div class="approval-seal">
              <div class="approval-seal-ring" />
              <div class="approval-seal-core"><LockKeyhole :size="60" :stroke-width="1.15" /></div>
              <div class="approval-seal-sheen" />
            </div>
            <div class="approval-party approval-buyer">
              <div class="approval-party-icon"><Check :size="27" :stroke-width="1.8" /></div>
              <span>BUYER</span>
              <small>APPROVED</small>
            </div>
            <div class="approval-party approval-merchant">
              <div class="approval-party-icon"><Check :size="27" :stroke-width="1.8" /></div>
              <span>MERCHANT</span>
              <small>APPROVED</small>
            </div>
            <div class="approval-particle approval-particle-one" />
            <div class="approval-particle approval-particle-two" />
          </div>
          <div class="cinema-caption" :class="{ 'cinema-caption--final': activeIndex === 3 }">
            <Transition name="cinema-copy" mode="out-in">
              <div :key="activeIndex" class="cinema-caption-inner">
                <span class="cinema-eyebrow"><span class="cinema-dot" /> {{ story.kicker }}</span>
                <h1>{{ story.title }}</h1>
                <p>{{ story.detail }}</p>
                <RouterLink v-if="activeIndex === 3" to="/signin" class="final-proceed">Proceed to ResolveOS <ArrowRight :size="18" /></RouterLink>
              </div>
            </Transition>
          </div>

          <div class="cinema-foot">
            <span class="cinema-scroll-label"><ArrowDown :size="14" /> {{ activeIndex === 3 ? 'END OF INTRODUCTION' : 'SCROLL TO EXPLORE' }}</span>
            <div class="cinema-progress" role="progressbar" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100" aria-label="Introduction progress">
              <div :style="{ width: (progress * 100) + '%' }" />
            </div>
            <button class="cinema-next" type="button" @click="jumpTo(activeIndex === 3 ? 0 : activeIndex + 1)" :aria-label="activeIndex === 3 ? 'Replay introduction' : 'Go to next section'"><ChevronDown :size="19" :class="{ 'rotate-180': activeIndex === 3 }" /></button>
          </div>
        </section>
      </div>


    </main>
  </div>
</template>

<style scoped>
.cinematic-intro { --cinema-blue:#64a4ff; --cinema-electric:#97c5ff; min-height:100vh; overflow:clip; }
.cinema-header { position:absolute;z-index:30;top:0;left:0;right:0;max-width:1500px;margin:auto;display:flex;align-items:center;justify-content:space-between;padding:22px clamp(20px,4vw,65px); }
.cinema-actions{display:flex;align-items:center;gap:12px}
.cinema-icon{display:grid;place-items:center;width:38px;height:38px;border:1px solid var(--color-line);border-radius:100%;background:var(--color-surface);cursor:pointer}
.cinema-enter,.cinema-cta{display:inline-flex;align-items:center;gap:12px;border-radius:99px;background:var(--color-ink);color:var(--color-canvas);padding:12px 19px;font-size:13px;font-weight:650;text-decoration:none}
.cinema-scroll{height:420vh;position:relative}
.cinema-sticky{position:sticky;top:0;height:100svh;min-height:600px;overflow:hidden;isolation:isolate;background:#070a12;color:#fff}
.cinema-set{position:absolute;inset:0;overflow:hidden;background:radial-gradient(ellipse at 54% 48%,#382b2b 0%,#19151b 42%,#090c14 85%)}
.cinema-table{position:absolute;inset:-20%;transform:rotate(-13deg) scale(var(--desk-scale));background:repeating-linear-gradient(89deg,transparent 0,rgba(255,202,141,.035) 2px,transparent 4px,transparent 80px),repeating-linear-gradient(3deg,#251714 0,#231614 6px,#1b1416 11px,#2c1a16 19px);opacity:.85;filter:contrast(1.1)}
.cinema-mat{position:absolute;width:72vw;height:135vh;left:18%;top:-13%;border-radius:5vw;transform:rotate(-17deg) scale(var(--desk-scale));background:linear-gradient(115deg,#45414a 0%,#161820 13%,#11131a 83%,#37333c 100%);box-shadow:0 25px 70px #000b,inset 0 0 0 3px #77727c22,inset 0 0 0 14px #111219;border:2px solid #5a515c66}
.cinema-mat:after{content:'';position:absolute;inset:23px;border:2px dashed #a99ca34a;border-radius:4vw}
.cinema-watch{position:absolute;width:min(21vw,300px);aspect-ratio:1;right:3%;top:34%;border:33px solid #0a0b10;border-radius:50%;background:repeating-conic-gradient(#14151b 0deg 11deg,#292630 13deg 17deg);box-shadow:0 20px 55px #000d,0 0 0 7px #323039}
.cinema-watch-face{position:absolute;inset:17%;border-radius:50%;background:radial-gradient(circle at 35% 20%,#37394b,#07080e 70%);box-shadow:inset 0 0 0 7px #55515d}
.watch-hand{position:absolute;top:21%;left:49%;height:38%;width:3px;transform:rotate(35deg);transform-origin:bottom;background:#c5c3cb}
.cinema-light{position:absolute;inset:0;background:radial-gradient(ellipse at 49% 40%,transparent 2%,#07081233 40%,#010207bd 100%),radial-gradient(ellipse at 60% 17%,#667cc833,transparent 60%);pointer-events:none;opacity:var(--camera-light)}
.cinema-camera{position:absolute;inset:0;display:grid;place-items:center;perspective:1100px;pointer-events:none}
.cinema-phone{position:relative;width:clamp(240px,23vw,360px);aspect-ratio:0.49;transform:translate(var(--device-x),var(--device-y)) rotate(var(--device-rotation)) scale(var(--device-scale)) rotateX(7deg) rotateY(-8deg);transition:transform .18s linear;filter:drop-shadow(32px 35px 34px #000e);will-change:transform}
.phone-rim{width:100%;height:100%;padding:9px;border:3px solid #777685;border-radius:clamp(32px,4vw,60px);background:linear-gradient(120deg,#c0bfc8,#24252e 13%,#090910 72%,#888998);box-shadow:inset 0 0 0 3px #0a0b11,0 0 8px #b9c4e455}
.phone-screen{position:relative;width:100%;height:100%;overflow:hidden;border:2px solid #020207;border-radius:clamp(25px,3.5vw,51px);background:radial-gradient(ellipse at 50% 34%,#0f1e3b 0%,#040711 54%,#020309 100%);color:white}
.phone-screen:after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,#fff1 0%,transparent 20%,transparent 73%,#fff1 100%)}
.phone-island{position:absolute;z-index:5;top:13px;left:50%;transform:translateX(-50%);width:33%;height:24px;background:#000;border-radius:99px}
.phone-topline{position:absolute;z-index:5;top:20px;left:8%;right:8%;display:flex;justify-content:space-between;font-size:11px;font-weight:700;letter-spacing:.025em}.signal{font-size:8px}
.phone-stage{position:absolute;inset:9% 7% 9%;display:flex;align-items:center;flex-direction:column}
.phone-graphic{position:relative;width:100%;height:48%;display:grid;place-items:center;transition:filter .5s ease;filter:drop-shadow(0 0 29px #3f82fe9c)}
.graphic-orbit{position:absolute;width:69%;aspect-ratio:1;border:2px solid #80b6ff77;border-radius:30%;box-shadow:inset 0 0 30px #1646e366,0 0 25px #2878ff55;transform:rotate(34deg);animation:orbit-spin 13s linear infinite}
.orbit-two{width:47%;border-color:#c3e4ffb3;transform:rotate(-22deg);animation-direction:reverse;animation-duration:9s}
.graphic-core{display:grid;place-items:center;width:38%;aspect-ratio:1;border:1px solid #c5dfff77;border-radius:32%;background:radial-gradient(circle at 30% 25%,#3177c8,#0b1935 70%);box-shadow:0 0 32px #478dffb0,inset 0 0 25px #62a7ff80;transform:rotate(-12deg);color:#e0f1ff}
.graphic-dispute{text-align:center;transform:rotate(12deg)}.graphic-dispute span{display:block;font-size:23px;font-weight:750}.graphic-dispute small{display:block;font-size:5px;letter-spacing:.14em}
.graphic-spark{position:absolute;width:6px;height:6px;border-radius:50%;background:#b9dfff;box-shadow:0 0 14px 5px #438aff;top:22%;left:19%}.spark-b{top:65%;left:83%;width:4px;height:4px}
.phone-stories{position:relative;width:100%;flex:1}
.phone-story{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:flex-start;transition:opacity .18s ease,transform .18s ease}
.phone-kicker{font-size:9px;letter-spacing:.23em;color:#89b7ff;font-weight:700;margin-bottom:12px}
.phone-story h2{white-space:pre-line;font-size:clamp(21px,2.1vw,31px);letter-spacing:-.055em;line-height:1.1;font-weight:750}
.phone-detail{font-size:clamp(10px,.9vw,12px);line-height:1.55;color:#b3bdd0;max-width:225px;margin-top:15px}
.phone-bottom{position:absolute;bottom:25px;left:10%;right:10%;display:flex;align-items:center;justify-content:space-between;font-size:9px;letter-spacing:.2em;font-weight:750;color:#a5bde2}.phone-os{color:#6dafff}.phone-bottom-line{width:28%;height:3px;border-radius:10px;background:#d7e8ff}
.cinema-caption{position:absolute;z-index:2;left:clamp(25px,5vw,90px);bottom:15%;max-width:350px;pointer-events:none;text-shadow:0 3px 22px #000}
.cinema-caption-inner{transition:opacity .35s ease}
.cinema-eyebrow{font-size:10px;letter-spacing:.21em;font-weight:750;color:#95bfff;display:flex;align-items:center;gap:10px}.cinema-dot{width:6px;height:6px;border-radius:50%;background:#74acff;box-shadow:0 0 12px #589dff}
.cinema-caption h1{white-space:pre-line;font-size:clamp(27px,3.2vw,49px);letter-spacing:-.063em;line-height:1.04;font-weight:720;margin:16px 0}
.cinema-caption p{font-size:13px;line-height:1.7;color:#c1cadb}
.cinema-foot{position:absolute;z-index:4;bottom:30px;left:clamp(25px,5vw,90px);right:clamp(25px,5vw,90px);display:flex;align-items:center;gap:25px}
.cinema-scroll-label{display:flex;align-items:center;gap:12px;white-space:nowrap;color:#b7bdcc;font-size:10px;letter-spacing:.18em}
.cinema-progress{height:2px;background:#ffffff42;flex:1;max-width:330px}.cinema-progress>div{height:100%;background:#a1c7ff;transition:width .12s linear}
.cinema-next{display:grid;place-items:center;width:36px;height:36px;border:1px solid #ffffff66;border-radius:50%;background:#10182777;color:white;cursor:pointer}
.cinema-finish{min-height:90svh;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:100px 24px;background:var(--color-canvas)}
.cinema-finish-glow{position:absolute;z-index:0;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 40%,color-mix(in srgb,var(--color-primary) 13%,transparent),transparent 55%)}
.cinema-finish>*:not(.cinema-finish-glow){position:relative;z-index:1}
.cinema-finish .cinema-eyebrow{color:var(--color-primary)}
.cinema-finish h2{font-size:clamp(46px,7vw,100px);line-height:1;letter-spacing:-.075em;font-weight:750;margin:25px 0}
.cinema-finish>p{max-width:500px;color:var(--color-muted);line-height:1.7}
.cinema-cta{margin-top:32px;background:var(--color-primary);color:white;padding:17px 27px;font-size:14px}
.cinema-finish .cinema-disclaimer{font-size:11px;margin-top:36px}
@keyframes orbit-spin{to{transform:rotate(394deg)}}
@media(max-width:900px){.cinema-caption{left:25px;bottom:13%;max-width:235px}.cinema-caption h1{font-size:28px}.cinema-caption p{font-size:11px}.cinema-phone{width:clamp(230px,36vw,320px)}.cinema-mat{width:110vw;left:0}.cinema-watch{right:-12%;width:28vw;border-width:20px}}
@media(max-width:600px){.cinema-header{padding:16px}.cinema-enter{padding:11px 13px;font-size:11px}.cinema-scroll{height:360vh}.cinema-sticky{min-height:520px}.cinema-phone{width:220px;transform:translate(var(--device-x),-8%) rotate(var(--device-rotation)) scale(calc(var(--device-scale) * .8)) rotateX(7deg)}.cinema-mat{width:170vw;left:-30%;top:-20%}.cinema-watch{width:37vw;right:-19%;top:29%}.cinema-caption{bottom:83px;left:22px;max-width:calc(100% - 44px)}.cinema-caption h1{font-size:25px;margin:8px 0}.cinema-caption p{font-size:11px;line-height:1.4;max-width:300px}.cinema-foot{bottom:19px;left:22px;right:22px;gap:12px}.cinema-scroll-label{font-size:8px}.cinema-progress{max-width:none}.phone-story h2{font-size:22px}.phone-detail{font-size:10px}.cinema-finish{min-height:75svh}}
@media(prefers-reduced-motion:reduce){.cinema-scroll{height:100svh}.cinema-phone,.phone-story,.cinema-progress>div{transition:none!important}.graphic-orbit{animation:none}.cinema-next,.cinema-scroll-label{display:none}}

/* Standalone cinematic object — the reference movement without phone hardware. */
.cinema-sticky { background:radial-gradient(ellipse at 53% 48%,#122044 0%,#080d1f 37%,#02040b 79%); }
.luminous-world {position:absolute;left:50%;top:47%;width:min(55vw,660px);aspect-ratio:1;transform:translate(-50%,-50%) translate(var(--device-x),var(--device-y)) scale(var(--device-scale)) rotate(var(--device-rotation));transform-style:preserve-3d;perspective:1000px;will-change:transform;filter:drop-shadow(0 0 38px #1361ff66);}
.luminous-world:before{content:'';position:absolute;inset:-25%;background:radial-gradient(circle,#176fff22 0%,#1244aa0a 42%,transparent 66%);animation:light-breathe 5s ease-in-out infinite}
.luminous-halo{position:absolute;border-radius:50%;border:1px solid #8bc9ff77;box-shadow:0 0 17px #4aa6ff66,inset 0 0 22px #266cff33;left:50%;top:50%;transform:translate(-50%,-50%) rotateX(65deg)}
.halo-outer{width:98%;height:98%;border-width:2px;animation:halo-roll 13s linear infinite}
.halo-middle{width:75%;height:75%;border-style:dashed;border-width:2px;animation:halo-roll-reverse 10s linear infinite}
.halo-inner{width:53%;height:53%;border-color:#e5f6ffbb;animation:halo-roll 7s linear infinite}
.luminous-orbit{position:absolute;inset:9%;border:4px solid transparent;border-top-color:#d4f1ff;border-right-color:#499eff;border-radius:38%;box-shadow:0 -3px 23px #a9dfffaa,inset 0 0 19px #347eff88;transform-style:preserve-3d;animation:orbit-hero 11s linear infinite}
.luminous-orbit span{position:absolute;display:block;top:-6px;left:40%;width:18%;height:7px;border-radius:8px;background:#e0f7ff;box-shadow:0 0 24px 7px #459bffb0}
.orbit-alpha{transform:rotate(25deg) rotateY(58deg)}
.orbit-beta{inset:23%;border-width:5px;border-color:transparent #74bfff #ffffff transparent;animation-direction:reverse;animation-duration:8s;filter:drop-shadow(0 0 16px #468fff)}
.orbit-gamma{inset:0%;border-width:2px;border-radius:50%;border-color:#357bdf66 transparent #8bcfff transparent;animation-duration:17s;transform:rotateX(56deg)}
.luminous-core{position:absolute;left:50%;top:50%;width:21%;height:21%;transform:translate(-50%,-50%) rotateX(-20deg) rotateY(35deg);transform-style:preserve-3d;animation:core-spin 12s ease-in-out infinite}
.core-face{position:absolute;inset:0;border:2px solid #bfe7ff;background:linear-gradient(140deg,#d6f4ffbb,#2782ed99 27%,#030d34f2 72%,#76bcff66);box-shadow:inset 0 0 27px #46a0ff,0 0 20px #78baff;border-radius:12%}
.core-front{transform:translateZ(65px);display:grid;place-items:center}
.core-back{transform:rotateY(180deg) translateZ(65px)}
.core-left{transform:rotateY(-90deg) translateZ(65px)}
.core-right{transform:rotateY(90deg) translateZ(65px)}
.core-top{transform:rotateX(90deg) translateZ(65px)}
.core-bottom{transform:rotateX(-90deg) translateZ(65px)}
.core-emblem{font-weight:800;font-size:clamp(30px,6vw,77px);color:white;text-shadow:0 0 17px #fff,0 0 35px #48a8ff}
.luminous-beam{position:absolute;top:50%;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,#59afff99,transparent);transform:rotate(-28deg);box-shadow:0 0 14px #4c95ff}.beam-two{transform:rotate(58deg);opacity:.6}
.luminous-particle{position:absolute;width:5px;height:5px;background:white;border-radius:50%;box-shadow:0 0 15px 4px #64b6ff;animation:light-breathe 3s ease-in-out infinite}.particle-one{top:8%;left:28%}.particle-two{top:72%;right:8%;animation-delay:1s}.particle-three{top:86%;left:25%;animation-delay:2s}
.cinema-caption{z-index:5;bottom:12%;max-width:400px}.cinema-caption h1{font-size:clamp(32px,3.7vw,54px)}.cinema-caption p{max-width:350px}
.cinema-sticky:after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,#02040bb8,transparent 37%,transparent 75%,#02040b33)}
.cinema-foot{z-index:6}
@keyframes orbit-hero{from{transform:rotate(25deg) rotateY(58deg) rotateZ(0deg)}to{transform:rotate(385deg) rotateY(418deg) rotateZ(360deg)}}
@keyframes core-spin{50%{transform:translate(-50%,-50%) rotateX(45deg) rotateY(210deg)}100%{transform:translate(-50%,-50%) rotateX(340deg) rotateY(395deg)}}
@keyframes halo-roll{to{transform:translate(-50%,-50%) rotateX(65deg) rotate(360deg)}}
@keyframes halo-roll-reverse{to{transform:translate(-50%,-50%) rotateX(65deg) rotate(-360deg)}}
@keyframes light-breathe{50%{opacity:.4;filter:brightness(1.6)}}
@media(max-width:700px){.luminous-world{width:90vw;top:37%;}.cinema-caption{bottom:90px;max-width:85vw}.cinema-sticky:after{background:linear-gradient(0deg,#02040bdc,transparent 45%)}.core-front{transform:translateZ(32px)}.core-back{transform:rotateY(180deg) translateZ(32px)}.core-left{transform:rotateY(-90deg) translateZ(32px)}.core-right{transform:rotateY(90deg) translateZ(32px)}.core-top{transform:rotateX(90deg) translateZ(32px)}.core-bottom{transform:rotateX(-90deg) translateZ(32px)}}
@media(prefers-reduced-motion:reduce){.luminous-world,.luminous-world *{animation:none!important}.luminous-world{transform:translate(-50%,-50%) scale(.85)}}

/* Cinematic refinements: room around the sculpture, readable copy and slower movement. */
.cinema-scroll{height:500vh}
.luminous-world,.morph-scene{left:65%;top:48%;width:min(53vw,660px);transform:translate(-50%,-50%) translate(var(--device-x),var(--device-y)) scale(var(--device-scale)) rotate(var(--device-rotation));will-change:transform,opacity;pointer-events:none}
.luminous-world:before{animation-duration:11s}
.halo-outer{animation-duration:27s}.halo-middle{animation-duration:23s}.halo-inner{animation-duration:19s}
.orbit-alpha{animation-duration:25s}.orbit-beta{animation-duration:20s}.orbit-gamma{animation-duration:35s}
.luminous-core{animation-duration:27s}
.luminous-particle{animation-duration:8s}
.cinema-caption{left:clamp(28px,6vw,105px);top:50%;bottom:auto;transform:translateY(-50%);width:min(41vw,570px);max-width:none;height:370px;z-index:7}
.cinema-caption-inner{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;transition:opacity .16s linear,transform .16s linear}
.cinema-caption h1{font-size:clamp(46px,5vw,80px);line-height:1.02;margin:18px 0 22px}
.cinema-caption p{font-size:clamp(16px,1.3vw,20px);line-height:1.55;max-width:470px}
.cinema-eyebrow{font-size:12px}
.cinema-foot{z-index:10}
.final-proceed{position:relative;align-self:flex-start;flex-shrink:0;z-index:15;margin-top:26px;display:inline-flex;align-items:center;gap:14px;border-radius:99px;padding:17px 26px;background:#e5f1ff;color:#07142c;font-weight:750;font-size:16px;text-decoration:none;box-shadow:0 0 32px #4e9cff55;transition:transform .25s,box-shadow .25s}
.final-proceed:hover{transform:translateY(-4px);box-shadow:0 0 50px #4e9cff99}
.morph-scene{position:absolute;aspect-ratio:1;filter:drop-shadow(0 0 32px #1778ff77)}
.negotiation-link{position:absolute;left:13%;right:13%;top:50%;height:3px;background:linear-gradient(90deg,#7fbfff,white,#7fbfff);box-shadow:0 0 25px #69b3ff;animation:signal-glow 8s ease-in-out infinite}
.negotiation-node{position:absolute;width:43%;aspect-ratio:1;top:28%;display:grid;place-items:center;border:3px solid #a5d9ff;border-radius:50%;box-shadow:inset 0 0 48px #277bf788,0 0 35px #5eaaffaa;background:radial-gradient(circle,#2a60b877,#050d27 72%);animation:node-hover 11s ease-in-out infinite}
.negotiation-node:before{content:'';position:absolute;inset:12%;border:2px dashed #b7e4ffbb;border-radius:50%;animation:halo-roll 28s linear infinite}
.negotiation-node span{font-size:clamp(34px,5vw,76px);font-weight:700;color:#d7eeff;text-shadow:0 0 24px #81c5ff}
.buyer-node{left:0}.merchant-node{right:0;animation-delay:-5s}
.negotiation-signal{position:absolute;width:12px;height:12px;top:49%;left:15%;border-radius:50%;background:white;box-shadow:0 0 25px 10px #4ba6ff;animation:travel-signal 7s ease-in-out infinite}
/* Chapter 03: dual human approvals lock a protected settlement.
   All animation stays inside this scene, independent from other chapters. */
.safeguard-scene{isolation:isolate;display:grid;place-items:center}
.approval-ambient{position:absolute;inset:6%;border-radius:50%;background:radial-gradient(circle,#1b60bf31 0%,#1c60b716 36%,transparent 70%);filter:blur(16px);animation:approval-breathe 8s ease-in-out infinite}
.approval-orbit{position:absolute;border-radius:50%;border:1.5px solid #75b9ff7a;box-shadow:0 0 20px #379dff43,inset 0 0 20px #2e84e925}
.approval-orbit-outer{inset:10%;transform:rotateX(68deg) rotate(-22deg);animation:approval-orbit-a 32s linear infinite}
.approval-orbit-inner{inset:20%;border:1px dashed #bddfff82;transform:rotateY(68deg) rotate(24deg);animation:approval-orbit-b 26s linear infinite}
.approval-path{position:absolute;top:49%;width:29%;height:2px;background:linear-gradient(90deg,transparent,#79caff,transparent);box-shadow:0 0 16px 2px #439cff8a;animation:approval-path-glow 6s ease-in-out infinite}
.approval-path-left{left:16%;transform:rotate(-12deg)}.approval-path-right{right:16%;transform:rotate(12deg);animation-delay:-3s}
.approval-seal{position:absolute;inset:30%;border-radius:50%;display:grid;place-items:center;transform-style:preserve-3d;animation:approval-seal-float 9s ease-in-out infinite;filter:drop-shadow(0 0 28px #4b9bff88)}
.approval-seal-ring{position:absolute;inset:0;border:2px solid #b1e4ff;border-radius:30%;transform:rotate(45deg);background:linear-gradient(135deg,#66b6ff53,#03163377 63%,#84cfff42);box-shadow:0 0 35px #5aaaff88,inset 0 0 38px #4898ff77}
.approval-seal-core{position:absolute;inset:11%;display:grid;place-items:center;border-radius:50%;border:1px solid #8ccaff9c;background:radial-gradient(circle at 40% 25%,#2866ac,#091735 70%);color:#e4f5ff;box-shadow:inset 0 0 30px #4b9fff77,0 0 25px #74bfff77}
.approval-seal-sheen{position:absolute;inset:8%;border-radius:50%;border-top:2px solid #f2fcffb8;transform:rotate(-23deg);filter:drop-shadow(0 0 11px #c7edff)}
.approval-party{position:absolute;z-index:2;top:38%;width:24%;aspect-ratio:1/1.08;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:5px;border:1.5px solid #90c9ffbb;border-radius:25%;background:radial-gradient(circle at 35% 18%,#2d79c6e8,#102c5dee 55%,#071329ed);box-shadow:0 0 30px #398cff66,inset 0 0 24px #338ce552;animation:approval-party-float 8s ease-in-out infinite}
.approval-buyer{left:8%}.approval-merchant{right:8%;animation-delay:-4s}
.approval-party-icon{display:grid;place-items:center;width:36%;aspect-ratio:1;border:1px solid #a4e3ff;border-radius:50%;background:#3b9ee477;box-shadow:0 0 16px #70cfff99;color:#effcff}
.approval-party span{font-size:clamp(9px,1.05vw,14px);font-weight:750;letter-spacing:.08em;color:#e6f6ff}
.approval-party small{font-size:clamp(6px,.7vw,9px);font-weight:600;letter-spacing:.17em;color:#9ecfff}
.approval-particle{position:absolute;width:6px;height:6px;border-radius:50%;background:#eefbff;box-shadow:0 0 18px 6px #5da9ff;animation:approval-particle-drift 9s ease-in-out infinite}
.approval-particle-one{left:25%;top:14%}.approval-particle-two{right:23%;bottom:15%;animation-delay:-4s}
@keyframes approval-breathe{50%{transform:scale(1.09);opacity:.55}}
@keyframes approval-orbit-a{to{transform:rotateX(68deg) rotate(338deg)}}
@keyframes approval-orbit-b{to{transform:rotateY(68deg) rotate(-336deg)}}
@keyframes approval-path-glow{50%{opacity:.4;filter:brightness(1.6)}}
@keyframes approval-seal-float{50%{transform:translateY(-9px) scale(1.035)}}
@keyframes approval-party-float{50%{transform:translateY(-11px)}}
@keyframes approval-particle-drift{50%{opacity:.38;transform:translateY(13px)}}
@media(max-width:600px){.approval-party{width:26%;top:39%}.approval-buyer{left:4%}.approval-merchant{right:4%}.approval-party span{font-size:9px}.approval-party small{font-size:6px}}
@media(prefers-reduced-motion:reduce){.safeguard-scene *{animation:none!important}}
@keyframes node-hover{50%{transform:translateY(-14px)}}
@keyframes travel-signal{0%{left:20%;opacity:0}20%{opacity:1}80%{opacity:1}100%{left:78%;opacity:0}}
@keyframes signal-glow{50%{filter:brightness(1.9)}}
@keyframes safeguard-rotate{to{transform:rotate(405deg)}}
@keyframes shield-float{50%{transform:translateY(-12px) scale(.97)}}
@media(max-width:900px){.luminous-world,.morph-scene{left:60%;top:41%;width:75vw}.cinema-caption{top:auto;bottom:10%;left:26px;transform:none;width:80vw;height:220px}.cinema-caption h1{font-size:clamp(35px,5vw,59px)}.cinema-caption p{font-size:14px}.cinema-caption--final{height:clamp(270px,42vh,355px)}}
@media(max-width:600px){.cinema-scroll{height:470vh}.luminous-world,.morph-scene{left:50%;top:35%;width:100vw}.cinema-caption{left:22px;bottom:105px;width:calc(100% - 44px);height:185px}.cinema-caption h1{font-size:clamp(33px,9vw,49px);margin:9px 0}.cinema-caption p{font-size:12px;line-height:1.43}.cinema-eyebrow{font-size:10px}.cinema-caption--final{height:clamp(285px,47svh,355px);bottom:74px}.final-proceed{font-size:13px;padding:13px 19px;margin-top:17px}}
@media(prefers-reduced-motion:reduce){.morph-scene *,.luminous-world *{animation:none!important}.cinema-caption-inner{transition:none}}

.core-emblem-logo{width:72%;height:72%;filter:drop-shadow(0 0 8px #ffffff88) drop-shadow(0 0 18px #58a8ff6b)}

/* Keep the last CTA in normal text flow at every viewport size: it can never
   cover the description because it follows the paragraph in the same column. */
.cinema-caption--final .cinema-caption-inner{justify-content:center}
/* The caption is intentionally non-interactive for other chapters, but the
   final CTA must be allowed to receive pointer input. */
.cinema-caption--final{pointer-events:auto}
.cinema-caption--final .final-proceed{pointer-events:auto;cursor:pointer}
@media (max-height:680px){
  .cinema-caption--final{height:clamp(230px,48svh,315px)}
  .cinema-caption--final h1{font-size:clamp(28px,4.3vw,54px);margin:9px 0 10px}
  .cinema-caption--final p{font-size:clamp(12px,1vw,16px);line-height:1.4}
  .cinema-caption--final .final-proceed{margin-top:14px;padding:12px 20px}
}

/* Full-screen chapter presentation: never stop between two chapters.
   Header stays pinned; typography is a single transitioning block. */
.cinematic-intro{height:100svh;min-height:0;overflow:hidden;overscroll-behavior:none}
.cinema-header{position:fixed;z-index:50;width:100%;max-width:none}
.cinema-scroll{height:100svh!important;overflow:hidden}
.cinema-sticky{position:relative;top:auto;height:100svh;min-height:0!important}
.luminous-world,.morph-scene{
  transition:opacity 1.45s cubic-bezier(.4,0,.2,1),
             transform 1.55s cubic-bezier(.22,1,.36,1);
}
.cinema-caption-inner{transition:none}
.cinema-copy-enter-active{transition:opacity .78s cubic-bezier(.22,1,.36,1),transform .9s cubic-bezier(.22,1,.36,1)}
.cinema-copy-leave-active{transition:opacity .45s cubic-bezier(.4,0,.2,1),transform .52s cubic-bezier(.4,0,.2,1)}
.cinema-copy-enter-from{opacity:0;transform:translateY(26px)}
.cinema-copy-leave-to{opacity:0;transform:translateY(-18px)}
@media(max-width:900px){.cinema-header{position:fixed;top:0;left:0;right:0}}
@media(prefers-reduced-motion:reduce){
  .luminous-world,.morph-scene,.cinema-copy-enter-active,.cinema-copy-leave-active{transition:none!important}
}

/* Ch.03: a deliberate seven-second approval cycle.
   The seals approach, transmit approval packets, and activate the central vault. */
.safeguard-scene{perspective:1100px}
.safeguard-scene .approval-ambient{animation:approval-breathe 6.8s ease-in-out infinite}
.safeguard-scene .approval-orbit-outer{
  animation:approval-orbit-a 15s linear infinite;
  border-top:2px solid #d0eeff;
  border-bottom:2px solid #68aeff;
}
.safeguard-scene .approval-orbit-inner{
  animation:approval-orbit-b 12s linear infinite;
  border-left:2px solid #bdeaff;
}
.safeguard-scene .approval-seal{
  animation:approval-vault-cycle 6.8s cubic-bezier(.45,0,.22,1) infinite;
}
.safeguard-scene .approval-seal-ring{
  animation:approval-ring-cycle 6.8s cubic-bezier(.3,0,.2,1) infinite;
}
.safeguard-scene .approval-seal-core{
  animation:approval-core-glow 6.8s ease-in-out infinite;
}
.safeguard-scene .approval-seal-core svg{
  animation:approval-lock-gesture 6.8s ease-in-out infinite;
  transform-origin:center;
}
.safeguard-scene .approval-buyer{
  animation:approval-buyer-cycle 6.8s cubic-bezier(.45,0,.2,1) infinite;
}
.safeguard-scene .approval-merchant{
  animation:approval-merchant-cycle 6.8s cubic-bezier(.45,0,.2,1) infinite;
}
.safeguard-scene .approval-party-icon{
  animation:approval-icon-pulse 6.8s ease-in-out infinite;
}
.safeguard-scene .approval-particle-one{
  animation:approval-spark-a 6.8s ease-in-out infinite;
}
.safeguard-scene .approval-particle-two{
  animation:approval-spark-b 6.8s ease-in-out infinite;
}
.approval-signal{position:absolute;z-index:3;top:50%;width:10px;height:10px;border-radius:50%;background:#f3fcff;box-shadow:0 0 12px 4px #7acaff,0 0 28px 12px #489dff77;opacity:0;pointer-events:none}
.approval-signal-left{left:24%;animation:approval-signal-left 6.8s ease-in-out infinite}
.approval-signal-right{right:24%;animation:approval-signal-right 6.8s ease-in-out infinite}
.approval-burst{position:absolute;z-index:1;inset:29%;border-radius:50%;border:2px solid #a9e3ff;box-shadow:0 0 17px #8dceff;opacity:0;pointer-events:none}
.approval-burst-one{animation:approval-shockwave 6.8s ease-out infinite}
.approval-burst-two{animation:approval-shockwave 6.8s ease-out -0.20s infinite}
@keyframes approval-buyer-cycle{
  0%,12%,100%{transform:translate(0,0) rotate(-8deg)}
  25%,38%{transform:translate(17%, -5%) rotate(3deg)}
  50%,63%{transform:translate(17%, -5%) rotate(3deg)}
  78%,92%{transform:translate(-4%, 3%) rotate(-8deg)}
}
@keyframes approval-merchant-cycle{
  0%,12%,100%{transform:translate(0,0) rotate(8deg)}
  25%,38%{transform:translate(-17%, 5%) rotate(-3deg)}
  50%,63%{transform:translate(-17%, 5%) rotate(-3deg)}
  78%,92%{transform:translate(4%, -3%) rotate(8deg)}
}
@keyframes approval-signal-left{
  0%,33%{left:25%;opacity:0;transform:scale(.5)}
  39%{opacity:1;transform:scale(1.25)}
  56%{left:47%;opacity:1;transform:scale(.85)}
  61%,100%{left:49%;opacity:0;transform:scale(.2)}
}
@keyframes approval-signal-right{
  0%,33%{right:25%;opacity:0;transform:scale(.5)}
  39%{opacity:1;transform:scale(1.25)}
  56%{right:47%;opacity:1;transform:scale(.85)}
  61%,100%{right:49%;opacity:0;transform:scale(.2)}
}
@keyframes approval-vault-cycle{
  0%,35%,100%{transform:translateY(0) scale(1);filter:drop-shadow(0 0 22px #448fff77)}
  55%{transform:translateY(-8px) scale(.94) rotateY(14deg)}
  66%{transform:translateY(-8px) scale(1.09) rotateY(0);filter:drop-shadow(0 0 44px #a4e7ff)}
  85%{transform:translateY(0) scale(1.02)}
}
@keyframes approval-ring-cycle{
  0%,35%,100%{transform:rotate(45deg)}
  55%{transform:rotate(110deg)}
  72%{transform:rotate(220deg);border-color:#f7fdff}
  92%{transform:rotate(405deg)}
}
@keyframes approval-core-glow{
  0%,45%,100%{box-shadow:inset 0 0 30px #4b9fff77,0 0 25px #74bfff77}
  60%,76%{box-shadow:inset 0 0 58px #bbf1ff,0 0 60px #b8edff,0 0 90px #64b6ff}
}
@keyframes approval-lock-gesture{
  0%,47%,100%{transform:scale(1)}
  60%{transform:scale(.8) rotate(-10deg)}
  69%{transform:scale(1.18) rotate(0)}
  80%{transform:scale(1)}
}
@keyframes approval-icon-pulse{
  0%,33%,100%{filter:brightness(1);transform:scale(1)}
  40%,58%{filter:brightness(1.9);transform:scale(1.18)}
  68%{transform:scale(1)}
}
@keyframes approval-shockwave{
  0%,59%{opacity:0;transform:scale(.6)}
  63%{opacity:.85}
  86%,100%{opacity:0;transform:scale(2.65)}
}
@keyframes approval-spark-a{
  0%,100%{transform:translate(0,0);opacity:.3}
  40%{transform:translate(55px,-26px);opacity:1}
  75%{transform:translate(92px,54px);opacity:.4}
}
@keyframes approval-spark-b{
  0%,100%{transform:translate(0,0);opacity:.3}
  40%{transform:translate(-55px,26px);opacity:1}
  75%{transform:translate(-92px,-54px);opacity:.4}
}
@media(prefers-reduced-motion:reduce){
  .safeguard-scene *{animation:none!important}
  .approval-signal,.approval-burst{display:none}
}
/* Balanced composition across the three unique cinematic scenes.
   Desktop: a distinct right-hand visual column; tablet/mobile: a wider,
   centered sculpture above the caption. No animation or copy changes. */
@media (min-width:901px){
  .luminous-world,.morph-scene{
    left:69%;
    top:48%;
    width:min(58vw,780px);
  }
}
@media (min-width:601px) and (max-width:900px){
  .luminous-world,.morph-scene{
    left:53%;
    top:38%;
    width:min(84vw,740px);
  }
}
@media (max-width:600px){
  .luminous-world,.morph-scene{
    left:50%;
    top:34%;
    width:110vw;
  }
}

/* Page 02: three glass orbs visibly drifting in a slow, continuous choreography.
   Separate SVG wrappers carry the positional motion while each sphere/orbit
   rotates independently. Keep Chapter 03 and all page transitions untouched. */
.negotiation-scene{aspect-ratio:860/620;isolation:isolate}
.intelligence-art{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 0 24px #295bfb30)}
.intelligence-field{fill:none;stroke:#376bdb22;stroke-width:1;stroke-dasharray:2 11;transform-box:view-box;transform-origin:468px 304px;animation:intelligence-field-spin 49s linear infinite}
.intelligence-field-alt{stroke:#5585e719;stroke-dasharray:none;animation-direction:reverse;animation-duration:43s}
/* Outer wrappers use absolute SVG translations in every keyframe; this avoids
   transform-origin inconsistencies and makes the travel visible on Chrome. */
.intelligence-drift{transform-origin:0 0;will-change:transform}
.intelligence-drift-large{animation:intelligence-large-travel 11.5s cubic-bezier(.45,0,.55,1) infinite}
.intelligence-drift-medium{animation:intelligence-medium-wander 17.3s ease-in-out infinite}
.intelligence-drift-small{animation:intelligence-small-wander 20.7s ease-in-out infinite}
.intelligence-sphere{transform-box:fill-box;transform-origin:center;will-change:transform}
.intelligence-sphere-shell{fill:url(#intelligence-sphere-fill);stroke:#7ab1ff70;stroke-width:1.4;filter:drop-shadow(0 0 17px #4d8fff64)}
.intelligence-sphere-inner{fill:none;stroke:#a0ceff24;stroke-width:1}
.intelligence-sphere-axis{transform-box:fill-box;transform-origin:center;will-change:transform}
.intelligence-axis-a{animation:intelligence-axis-a 9s linear infinite}
.intelligence-axis-b{animation:intelligence-axis-b 11s linear infinite reverse}
.intelligence-orbit-stroke{fill:none;stroke:url(#intelligence-orbital-stroke);stroke-width:2.4;stroke-linecap:round;filter:drop-shadow(0 0 5px #80b7ff80)}
.intelligence-orbit-secondary{stroke-width:1.7;opacity:.8}
.intelligence-sphere-sheen{fill:none;stroke:#d9efff9e;stroke-width:1.8;stroke-linecap:round;filter:drop-shadow(0 0 7px #c5e7ff88)}
.intelligence-sphere-large{animation:intelligence-large-tilt 15s ease-in-out infinite}
.intelligence-sphere-medium{animation:intelligence-medium-tilt 17s ease-in-out infinite}
.intelligence-sphere-small{animation:intelligence-small-tilt 14s ease-in-out infinite}
.intelligence-sphere-medium .intelligence-axis-a{animation-duration:15s;animation-direction:reverse}
.intelligence-sphere-small .intelligence-axis-b{animation-duration:13s}
.intelligence-star{fill:#d6efff;filter:drop-shadow(0 0 7px #7fbcff);animation:intelligence-star-glow 6s ease-in-out infinite}
.intelligence-star-second{animation-delay:-3s}
@keyframes intelligence-field-spin{to{transform:rotate(360deg)}}
@keyframes intelligence-axis-a{from{transform:rotate(-32deg) scaleY(.7)}to{transform:rotate(328deg) scaleY(.7)}}
@keyframes intelligence-axis-b{from{transform:rotate(38deg) scaleX(.81)}to{transform:rotate(398deg) scaleX(.81)}}
@keyframes intelligence-large-travel{
  0%,100%{transform:translate(390px,331px)}
  25%{transform:translate(332px,262px)}
  50%{transform:translate(435px,306px)}
  75%{transform:translate(362px,390px)}
}
/* Irregular, independently phased wandering paths, instead of precise orbital loops. */
@keyframes intelligence-medium-wander{
  0%,100%{transform:translate(594px,261px) scale(.90)}
  11%{transform:translate(650px,312px) scale(1.00)}
  23%{transform:translate(565px,381px) scale(1.10)}
  36%{transform:translate(452px,404px) scale(.98)}
  48%{transform:translate(306px,355px) scale(.82)}
  61%{transform:translate(269px,265px) scale(.70)}
  74%{transform:translate(390px,215px) scale(.74)}
  86%{transform:translate(526px,218px) scale(.81)}
}
@keyframes intelligence-small-wander{
  0%,100%{transform:translate(693px,424px) scale(.96)}
  9%{transform:translate(609px,458px) scale(1.04)}
  21%{transform:translate(471px,438px) scale(.98)}
  34%{transform:translate(295px,395px) scale(.84)}
  45%{transform:translate(211px,306px) scale(.69)}
  57%{transform:translate(296px,206px) scale(.66)}
  68%{transform:translate(452px,194px) scale(.72)}
  81%{transform:translate(643px,239px) scale(.83)}
  92%{transform:translate(738px,333px) scale(.94)}
}
@keyframes intelligence-large-tilt{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(24deg)}}
@keyframes intelligence-medium-tilt{0%,100%{transform:rotate(14deg)}50%{transform:rotate(-25deg)}}
@keyframes intelligence-small-tilt{0%,100%{transform:rotate(-20deg)}50%{transform:rotate(28deg)}}
@keyframes intelligence-star-glow{0%,100%{opacity:.25}50%{opacity:1}}
@media(max-width:600px){.negotiation-scene{width:112vw}}
@media(prefers-reduced-motion:reduce){
  .negotiation-scene *{animation:none!important}
  .intelligence-drift-large{transform:translate(390px,331px)}
  .intelligence-drift-medium{transform:translate(585px,271px)}
  .intelligence-drift-small{transform:translate(688px,431px)}
}

/* Pages 01 / 04 — sealed, rounded dice-like cube.  Face rounding
   alone leaves visible holes at perpendicular junctions, so opaque edge
   bevels and corners join all six faces into one continuous solid. */
.luminous-core{
  --cube-side:clamp(82px,9vw,132px);
  --cube-half:calc(var(--cube-side) / 2);
  --cube-bevel:calc(var(--cube-side) * .16);
  width:var(--cube-side);
  height:var(--cube-side);
}
.luminous-core .core-face{
  border:1px solid #87c9f7c7;
  border-radius:18%;
  background:linear-gradient(145deg,#3476b9 0%,#19497a 45%,#0c254b 100%);
  box-shadow:inset 0 0 17px #78beff40,0 0 12px #54a1f67a;
  backface-visibility:hidden;
}
.luminous-core .core-front{
  transform:translateZ(var(--cube-half));
  background:linear-gradient(145deg,#367fc5,#154476 62%,#0a2751);
  box-shadow:inset 0 0 20px #85d0ff48,0 0 17px #70b8ff8a;
}
.luminous-core .core-back{transform:rotateY(180deg) translateZ(var(--cube-half));}
.luminous-core .core-left{transform:rotateY(-90deg) translateZ(var(--cube-half));background:#174676}
.luminous-core .core-right{transform:rotateY(90deg) translateZ(var(--cube-half));background:#1c5387}
.luminous-core .core-top{transform:rotateX(90deg) translateZ(var(--cube-half));background:#377db3}
.luminous-core .core-bottom{transform:rotateX(-90deg) translateZ(var(--cube-half));background:#113660}
.luminous-core .core-emblem-logo{width:62%;height:62%;filter:drop-shadow(0 0 8px #b5efffac)}
/* 12 solid rounded edge bevels. They fill the cutaway face corners rather
   than letting the background show through as gaps during rotation. */
.cube-bevel,.cube-corner{position:absolute;left:50%;top:50%;display:block;pointer-events:none;background:#235787;box-shadow:inset 0 0 5px #91d0ff33,0 0 7px #6fb9fa50}
.cube-bevel{border-radius:999px}
.cube-bevel-x{width:var(--cube-side);height:var(--cube-bevel)}
.cube-bevel-y{width:var(--cube-bevel);height:var(--cube-side)}
.cube-bevel-z{width:var(--cube-bevel);height:var(--cube-side);transform-origin:center;transform-style:preserve-3d}
.cube-bevel-x.bevel-top.bevel-front{transform:translate(-50%,-50%) translate3d(0,calc(-1 * var(--cube-half)),var(--cube-half))}
.cube-bevel-x.bevel-bottom.bevel-front{transform:translate(-50%,-50%) translate3d(0,var(--cube-half),var(--cube-half))}
.cube-bevel-x.bevel-top.bevel-back{transform:translate(-50%,-50%) translate3d(0,calc(-1 * var(--cube-half)),calc(-1 * var(--cube-half)))}
.cube-bevel-x.bevel-bottom.bevel-back{transform:translate(-50%,-50%) translate3d(0,var(--cube-half),calc(-1 * var(--cube-half)))}
.cube-bevel-y.bevel-left.bevel-front{transform:translate(-50%,-50%) translate3d(calc(-1 * var(--cube-half)),0,var(--cube-half))}
.cube-bevel-y.bevel-right.bevel-front{transform:translate(-50%,-50%) translate3d(var(--cube-half),0,var(--cube-half))}
.cube-bevel-y.bevel-left.bevel-back{transform:translate(-50%,-50%) translate3d(calc(-1 * var(--cube-half)),0,calc(-1 * var(--cube-half)))}
.cube-bevel-y.bevel-right.bevel-back{transform:translate(-50%,-50%) translate3d(var(--cube-half),0,calc(-1 * var(--cube-half)))}
.cube-bevel-z.bevel-left.bevel-top{transform:translate(-50%,-50%) translate3d(calc(-1 * var(--cube-half)),calc(-1 * var(--cube-half)),0) rotateX(90deg)}
.cube-bevel-z.bevel-right.bevel-top{transform:translate(-50%,-50%) translate3d(var(--cube-half),calc(-1 * var(--cube-half)),0) rotateX(90deg)}
.cube-bevel-z.bevel-left.bevel-bottom{transform:translate(-50%,-50%) translate3d(calc(-1 * var(--cube-half)),var(--cube-half),0) rotateX(90deg)}
.cube-bevel-z.bevel-right.bevel-bottom{transform:translate(-50%,-50%) translate3d(var(--cube-half),var(--cube-half),0) rotateX(90deg)}
.cube-corner{width:var(--cube-bevel);height:var(--cube-bevel);border-radius:50%;background:radial-gradient(circle at 30% 25%,#4b91c2,#205381 72%,#17416b)}
.cube-corner.corner-left.corner-top.corner-front{transform:translate(-50%,-50%) translate3d(calc(-1 * var(--cube-half)),calc(-1 * var(--cube-half)),var(--cube-half))}
.cube-corner.corner-left.corner-top.corner-back{transform:translate(-50%,-50%) translate3d(calc(-1 * var(--cube-half)),calc(-1 * var(--cube-half)),calc(-1 * var(--cube-half)))}
.cube-corner.corner-right.corner-top.corner-front{transform:translate(-50%,-50%) translate3d(var(--cube-half),calc(-1 * var(--cube-half)),var(--cube-half))}
.cube-corner.corner-right.corner-top.corner-back{transform:translate(-50%,-50%) translate3d(var(--cube-half),calc(-1 * var(--cube-half)),calc(-1 * var(--cube-half)))}
.cube-corner.corner-left.corner-bottom.corner-front{transform:translate(-50%,-50%) translate3d(calc(-1 * var(--cube-half)),var(--cube-half),var(--cube-half))}
.cube-corner.corner-left.corner-bottom.corner-back{transform:translate(-50%,-50%) translate3d(calc(-1 * var(--cube-half)),var(--cube-half),calc(-1 * var(--cube-half)))}
.cube-corner.corner-right.corner-bottom.corner-front{transform:translate(-50%,-50%) translate3d(var(--cube-half),var(--cube-half),var(--cube-half))}
.cube-corner.corner-right.corner-bottom.corner-back{transform:translate(-50%,-50%) translate3d(var(--cube-half),var(--cube-half),calc(-1 * var(--cube-half)))}
</style>
