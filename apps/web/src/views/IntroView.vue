<script setup lang="ts">
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Moon, Sun, ShieldCheck, Sparkles, LockKeyhole, Handshake } from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Logo from '@/components/Logo.vue';
import { useThemePreference } from '@/lib/useThemePreference';

const { currentTheme, toggleTheme } = useThemePreference();
const scrollArea = ref<HTMLElement | null>(null);
const progress = ref(0);
const reducedMotion = ref(false);
let frame = 0;
let resizeObserver: ResizeObserver | undefined;

const stories = [
  { kicker: '01 / THE PROBLEM', title: 'A payment went through.\nTrust did not.', detail: 'The customer says it never arrived. The seller sees delivered. Both deserve to be heard.', label: 'THE DISPUTE' },
  { kicker: '02 / THE INTELLIGENCE', title: 'Two sides.\nOne conversation.', detail: 'Independent AI advocates assess evidence, exchange offers, and respect private limits.', label: 'THE NEGOTIATION' },
  { kicker: '03 / THE SAFEGUARDS', title: 'AI proposes.\nPeople decide.', detail: 'No agent can move money. Both people must approve the exact same terms.', label: 'THE APPROVAL' },
  { kicker: '04 / THE RESOLUTION', title: 'Resolved.\nWith proof.', detail: 'Approved refunds are executed using PayPal Sandbox and recorded with a verifiable receipt.', label: 'THE OUTCOME' },
] as const;
const position = computed(() => Math.min(3, Math.max(0, progress.value * 3)));
const activeIndex = computed(() => Math.min(3, Math.floor(position.value + .5)));
const story = computed(() => stories[activeIndex.value]!);
const interpolate = (stops: number[], t: number) => {
  const i = Math.min(stops.length - 2, Math.max(0, Math.floor(t)));
  const local = Math.min(1, Math.max(0, t - i));
  const ease = local * local * (3 - 2 * local);
  return stops[i]! + (stops[i+1]! - stops[i]!) * ease;
};
const sceneStyle = computed(() => {
  const t = position.value;
  return {
    '--device-scale': String(interpolate([.74,.8,.76,.74],t)),
    '--device-rotation': interpolate([-9,5,-12,-9],t) + 'deg',
    '--device-x': interpolate([0,-2,3,0],t) + '%',
    '--device-y': interpolate([0,-2,2,0],t) + '%',
    '--desk-scale': String(interpolate([1,1.13,1.22,1.02],t)),
    '--camera-light': String(interpolate([.45,.8,1,.55],t)),
  } as Record<string,string>;
});
const opacityAt = (index: number) => {
  const distance = Math.abs(position.value - index);
  return Math.max(0, Math.min(1, (1 - distance) * 2.1));
};
const update = () => {
  frame = 0;
  if (!scrollArea.value || reducedMotion.value) return;
  const rect = scrollArea.value.getBoundingClientRect();
  const distance = Math.max(1, scrollArea.value.offsetHeight - window.innerHeight);
  progress.value = Math.min(1, Math.max(0, -rect.top / distance));
};
const requestUpdate = () => { if (!frame) frame = requestAnimationFrame(update); };
const jumpTo = (index: number) => {
  if (!scrollArea.value) return;
  const range = scrollArea.value.offsetHeight - window.innerHeight;
  window.scrollTo({ top: window.scrollY + scrollArea.value.getBoundingClientRect().top + range * index / 3, behavior: reducedMotion.value ? 'instant' : 'smooth' });
};
onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion.value) progress.value = 0;
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
  resizeObserver = new ResizeObserver(requestUpdate);
  if (scrollArea.value) resizeObserver.observe(scrollArea.value);
  requestUpdate();
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', requestUpdate);
  window.removeEventListener('resize', requestUpdate);
  resizeObserver?.disconnect();
  if (frame) cancelAnimationFrame(frame);
});
</script>

<template>
  <div class="cinematic-intro bg-canvas text-ink">
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
      <div ref="scrollArea" class="cinema-scroll" :class="{ 'cinema-reduced': reducedMotion }">
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
              <div class="core-face core-front"><span class="core-emblem">R</span></div>
              <div class="core-face core-back" />
              <div class="core-face core-left" />
              <div class="core-face core-right" />
              <div class="core-face core-top" />
              <div class="core-face core-bottom" />
            </div>
            <div class="luminous-beam beam-one" />
            <div class="luminous-beam beam-two" />
            <div class="luminous-particle particle-one" />
            <div class="luminous-particle particle-two" />
            <div class="luminous-particle particle-three" />
          </div>

          <div class="morph-scene negotiation-scene" :style="{ opacity: opacityAt(1) }" aria-hidden="true">
            <div class="negotiation-link"/><div class="negotiation-node buyer-node"><span>B</span></div><div class="negotiation-node merchant-node"><span>M</span></div>
            <div class="negotiation-signal"/>
          </div>
          <div class="morph-scene safeguard-scene" :style="{ opacity: opacityAt(2) }" aria-hidden="true">
            <div class="safeguard-ring safeguard-ring-one"/><div class="safeguard-ring safeguard-ring-two"/>
            <div class="safeguard-shield"><div class="safeguard-shield-inner"><LockKeyhole :size="66" :stroke-width="1.2"/></div></div>
            <div class="safeguard-dot dot-one"/><div class="safeguard-dot dot-two"/>
          </div>
          <div class="cinema-caption">
            <div v-for="(item,i) in stories" :key="i" class="cinema-caption-inner" :style="{ opacity: opacityAt(i), transform: 'translateY(' + ((i-position)*17) + 'px)' }" :aria-hidden="activeIndex !== i">
              <span class="cinema-eyebrow"><span class="cinema-dot" /> {{ item.kicker }}</span>
              <h1>{{ item.title }}</h1>
              <p>{{ item.detail }}</p>
            </div>
          </div>

          <RouterLink v-if="activeIndex === 3" to="/signin" class="final-proceed">Proceed to ResolveOS <ArrowRight :size="18" /></RouterLink>
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
.final-proceed{position:absolute;z-index:15;left:clamp(28px,6vw,105px);bottom:14%;display:inline-flex;align-items:center;gap:14px;border-radius:99px;padding:17px 26px;background:#e5f1ff;color:#07142c;font-weight:750;font-size:16px;text-decoration:none;box-shadow:0 0 32px #4e9cff55;transition:transform .25s,box-shadow .25s}
.final-proceed:hover{transform:translateY(-4px);box-shadow:0 0 50px #4e9cff99}
.morph-scene{position:absolute;aspect-ratio:1;filter:drop-shadow(0 0 32px #1778ff77)}
.negotiation-link{position:absolute;left:13%;right:13%;top:50%;height:3px;background:linear-gradient(90deg,#7fbfff,white,#7fbfff);box-shadow:0 0 25px #69b3ff;animation:signal-glow 8s ease-in-out infinite}
.negotiation-node{position:absolute;width:43%;aspect-ratio:1;top:28%;display:grid;place-items:center;border:3px solid #a5d9ff;border-radius:50%;box-shadow:inset 0 0 48px #277bf788,0 0 35px #5eaaffaa;background:radial-gradient(circle,#2a60b877,#050d27 72%);animation:node-hover 11s ease-in-out infinite}
.negotiation-node:before{content:'';position:absolute;inset:12%;border:2px dashed #b7e4ffbb;border-radius:50%;animation:halo-roll 28s linear infinite}
.negotiation-node span{font-size:clamp(34px,5vw,76px);font-weight:700;color:#d7eeff;text-shadow:0 0 24px #81c5ff}
.buyer-node{left:0}.merchant-node{right:0;animation-delay:-5s}
.negotiation-signal{position:absolute;width:12px;height:12px;top:49%;left:15%;border-radius:50%;background:white;box-shadow:0 0 25px 10px #4ba6ff;animation:travel-signal 7s ease-in-out infinite}
.safeguard-ring{position:absolute;inset:4%;border:2px solid #7ac0ff88;border-radius:35%;transform:rotate(45deg);box-shadow:inset 0 0 35px #2173e666,0 0 37px #2173e666;animation:safeguard-rotate 30s linear infinite}
.safeguard-ring-two{inset:14%;border-radius:50%;border-style:dotted;animation-direction:reverse;animation-duration:36s}
.safeguard-shield{position:absolute;inset:24%;display:grid;place-items:center;background:linear-gradient(145deg,#d8f1ff,#3c8cd4 31%,#07172d 78%,#8bc9ff);clip-path:polygon(50% 0%,93% 21%,87% 76%,50% 100%,13% 76%,7% 21%);animation:shield-float 10s ease-in-out infinite;filter:drop-shadow(0 0 25px #5aa7ff)}
.safeguard-shield-inner{width:95%;height:95%;display:grid;place-items:center;clip-path:inherit;background:radial-gradient(circle at 50% 30%,#2464b6,#050e29 78%);color:#d9f0ff}
.safeguard-dot{position:absolute;width:14%;aspect-ratio:1;border:2px solid #b9e3ff;border-radius:20%;background:#174a91;box-shadow:0 0 25px #58aaff}.dot-one{top:13%;left:10%;transform:rotate(-27deg)}.dot-two{bottom:12%;right:10%;transform:rotate(27deg)}
@keyframes node-hover{50%{transform:translateY(-14px)}}
@keyframes travel-signal{0%{left:20%;opacity:0}20%{opacity:1}80%{opacity:1}100%{left:78%;opacity:0}}
@keyframes signal-glow{50%{filter:brightness(1.9)}}
@keyframes safeguard-rotate{to{transform:rotate(405deg)}}
@keyframes shield-float{50%{transform:translateY(-12px) scale(.97)}}
@media(max-width:900px){.luminous-world,.morph-scene{left:60%;top:41%;width:75vw}.cinema-caption{top:auto;bottom:10%;left:26px;transform:none;width:80vw;height:220px}.cinema-caption h1{font-size:clamp(35px,5vw,59px)}.cinema-caption p{font-size:14px}.final-proceed{bottom:10%;left:26px}}
@media(max-width:600px){.cinema-scroll{height:470vh}.luminous-world,.morph-scene{left:50%;top:35%;width:100vw}.cinema-caption{left:22px;bottom:105px;width:calc(100% - 44px);height:185px}.cinema-caption h1{font-size:clamp(33px,9vw,49px);margin:9px 0}.cinema-caption p{font-size:12px;line-height:1.43}.cinema-eyebrow{font-size:10px}.final-proceed{left:22px;bottom:65px;font-size:13px;padding:13px 19px}}
@media(prefers-reduced-motion:reduce){.morph-scene *,.luminous-world *{animation:none!important}.cinema-caption-inner{transition:none}}
</style>
