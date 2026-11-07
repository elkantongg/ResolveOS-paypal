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
    '--device-scale': String(interpolate([1,1.65,1.92,1.12],t)),
    '--device-rotation': interpolate([-14,15,-24,-7],t) + 'deg',
    '--device-x': interpolate([0,-9,12,0],t) + '%',
    '--device-y': interpolate([1,5,-4,0],t) + '%',
    '--desk-scale': String(interpolate([1,1.13,1.22,1.02],t)),
    '--camera-light': String(interpolate([.45,.8,1,.55],t)),
  } as Record<string,string>;
});
const opacityAt = (index: number) => {
  const distance = Math.abs(position.value - index);
  return Math.max(0, Math.min(1, (1 - distance) * 2.6));
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
          <div class="cinema-set" aria-hidden="true">
            <div class="cinema-table" />
            <div class="cinema-mat" />
            <div class="cinema-watch"><div class="cinema-watch-face"><div class="watch-hand" /></div></div>
            <div class="cinema-light" />
          </div>

          <div class="cinema-camera">
            <div class="cinema-phone">
              <div class="phone-rim">
                <div class="phone-screen">
                  <div class="phone-island" />
                  <div class="phone-topline"><span>9:41</span><span class="signal">● ▰ ▰</span></div>
                  <div class="phone-stage">
                    <div class="phone-graphic" :class="'graphic-' + activeIndex">
                      <div class="graphic-orbit orbit-one" />
                      <div class="graphic-orbit orbit-two" />
                      <div class="graphic-core">
                        <div v-if="activeIndex === 0" class="graphic-dispute"><span>$180</span><small>PAYMENT IN QUESTION</small></div>
                        <Handshake v-else-if="activeIndex === 1" :size="69" :stroke-width="1.1" />
                        <LockKeyhole v-else-if="activeIndex === 2" :size="65" :stroke-width="1.1" />
                        <Check v-else :size="72" :stroke-width="1.2" />
                      </div>
                      <div class="graphic-spark spark-a" /><div class="graphic-spark spark-b" />
                    </div>
                    <div class="phone-stories">
                      <div v-for="(item, i) in stories" :key="i" class="phone-story" :style="{ opacity: opacityAt(i), transform: 'translateY(' + ((i-position)*22) + 'px)', pointerEvents: i === activeIndex ? 'auto' : 'none' }">
                        <p class="phone-kicker">{{ item.label }}</p>
                        <h2>{{ item.title }}</h2>
                        <p class="phone-detail">{{ item.detail }}</p>
                      </div>
                    </div>
                  </div>
                  <div class="phone-bottom"><span>RESOLVE<span class="phone-os">OS</span></span><span class="phone-bottom-line" /></div>
                </div>
              </div>
            </div>
          </div>

          <div class="cinema-caption">
            <div class="cinema-caption-inner">
              <span class="cinema-eyebrow"><span class="cinema-dot" /> {{ story.kicker }}</span>
              <h1>{{ story.title }}</h1>
              <p>{{ story.detail }}</p>
            </div>
          </div>

          <div class="cinema-foot">
            <span class="cinema-scroll-label"><ArrowDown :size="14" /> SCROLL TO EXPLORE</span>
            <div class="cinema-progress" role="progressbar" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100" aria-label="Introduction progress">
              <div :style="{ width: (progress * 100) + '%' }" />
            </div>
            <button class="cinema-next" type="button" @click="jumpTo(activeIndex === 3 ? 0 : activeIndex + 1)" :aria-label="activeIndex === 3 ? 'Replay introduction' : 'Go to next section'"><ChevronDown :size="19" :class="{ 'rotate-180': activeIndex === 3 }" /></button>
          </div>
        </section>
      </div>

      <section class="cinema-finish">
        <div class="cinema-finish-glow" aria-hidden="true" />
        <span class="cinema-eyebrow"><Sparkles :size="13" /> TWO SIDES. ONE RESOLUTION.</span>
        <h2>Turn disagreement<br />into resolution.</h2>
        <p>Experience evidence-led AI negotiation with human approval and PayPal Sandbox settlement.</p>
        <RouterLink to="/signin" class="cinema-cta">Enter ResolveOS <ArrowRight :size="18" /></RouterLink>
        <p class="cinema-disclaimer">Independent hackathon prototype · PayPal Sandbox · Test money only</p>
      </section>
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
</style>
