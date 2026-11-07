<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  mode: 'welcome' | 'launch';
  name?: string;
  leaving?: boolean;
}>();

const title = computed(() => props.mode === 'welcome' ? 'Welcome to ResolveOS.' : 'Your workspace awaits.');
const subtitle = computed(() => props.mode === 'welcome' ? 'A better way to find common ground.' : `Signing in${props.name ? ` as ${props.name}` : ''}`);
</script>

<template>
  <div class="welcome-cinematic" :class="{ 'welcome-cinematic--leaving': leaving }" role="status" aria-live="polite" :aria-label="title">
    <div class="welcome-cinematic__halo welcome-cinematic__halo--outer" />
    <div class="welcome-cinematic__halo welcome-cinematic__halo--inner" />
    <div class="welcome-cinematic__noise" />
    <div class="welcome-cinematic__content">
      <div class="welcome-cinematic__mark-wrap">
        <span class="welcome-cinematic__orbit welcome-cinematic__orbit--one" />
        <span class="welcome-cinematic__orbit welcome-cinematic__orbit--two" />
        <svg viewBox="0 0 88 88" class="welcome-cinematic__mark" aria-hidden="true">
          <rect x="5" y="5" width="78" height="78" rx="23" fill="#142b52" />
          <rect x="6" y="6" width="76" height="76" rx="22" fill="none" stroke="#85b4ff" stroke-opacity=".65" stroke-width="1.2" />
          <path d="M22.9 31.6h20.6a9.6 9.6 0 0 1 0 19.2H29.8" stroke="white" stroke-width="5.8" fill="none" stroke-linecap="round" />
          <path d="M65.1 56.4H44.5a9.6 9.6 0 0 1 0-19.2h13.7" stroke="#48d8b0" stroke-width="5.8" fill="none" stroke-linecap="round" />
        </svg>
        <span class="welcome-cinematic__pulse" />
      </div>
      <p class="welcome-cinematic__eyebrow">{{ mode === 'welcome' ? 'WELCOME / 01' : 'WORKSPACE / READY' }}</p>
      <h1 class="welcome-cinematic__title">{{ title }}</h1>
      <p class="welcome-cinematic__subtitle">{{ subtitle }}</p>
      <div class="welcome-cinematic__progress"><span /></div>
    </div>
    <p class="welcome-cinematic__foot">RESOLVE <span>OS</span> &nbsp;·&nbsp; HUMAN FIRST, AI ASSISTED</p>
  </div>
</template>

<style scoped>
.welcome-cinematic{
  position:fixed;inset:0;z-index:1000;display:grid;place-items:center;
  overflow:hidden;background:radial-gradient(ellipse at 50% 44%,#102b5b 0%,#07152f 39%,#020713 78%);
  color:#f5f9ff;isolation:isolate;
}
.welcome-cinematic__halo{position:absolute;left:50%;top:46%;width:min(86vmin,760px);aspect-ratio:1;border:1px solid #5d97fa24;border-radius:50%;transform:translate(-50%,-50%);animation:welcome-breathe 3s ease-in-out infinite}
.welcome-cinematic__halo--outer{box-shadow:0 0 70px #2678ff25,inset 0 0 90px #2275ff0a}
.welcome-cinematic__halo--inner{width:min(58vmin,510px);border-color:#85c6ff13;animation-delay:-1.4s}
.welcome-cinematic__noise{position:absolute;inset:0;pointer-events:none;background:linear-gradient(145deg,transparent 27%,#164fa414 48%,transparent 68%);animation:welcome-shift 1.7s ease-out both}
.welcome-cinematic__content{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding:24px;animation:welcome-arrive .95s cubic-bezier(.16,1,.3,1) both}
.welcome-cinematic__mark-wrap{position:relative;display:grid;place-items:center;width:154px;height:154px;margin-bottom:21px}
.welcome-cinematic__mark{width:88px;height:88px;z-index:2;filter:drop-shadow(0 10px 35px #1c78ff63);animation:welcome-mark .98s cubic-bezier(.2,1,.28,1) both}
.welcome-cinematic__orbit{position:absolute;inset:12px;border:1px solid #95cdffb0;border-radius:50%;transform:rotate(-27deg) scaleY(.38);box-shadow:0 0 19px #4d9aff80;animation:welcome-orbit 8s linear infinite}
.welcome-cinematic__orbit--two{inset:0;border-color:#3983ef80;transform:rotate(62deg) scaleY(.54);animation-duration:11s;animation-direction:reverse}
.welcome-cinematic__pulse{position:absolute;inset:33px;border-radius:28px;box-shadow:0 0 90px 32px #378cfb30;animation:welcome-breathe 2s ease-in-out infinite}
.welcome-cinematic__eyebrow{font-family:'Geist',sans-serif;letter-spacing:.3em;font-size:10px;font-weight:700;color:#8cc4ff;margin:0 0 13px}
.welcome-cinematic__title{font-family:'Manrope','Geist',sans-serif;font-size:clamp(28px,4.4vw,55px);line-height:1.15;font-weight:800;letter-spacing:-.065em;margin:0}
.welcome-cinematic__subtitle{font-family:'Instrument Serif',Georgia,serif;font-size:clamp(20px,2.5vw,31px);font-style:italic;color:#b9cce9;margin:9px 0 0}
.welcome-cinematic__progress{width:156px;height:2px;border-radius:10px;background:#85b5f32a;margin-top:31px;overflow:hidden}
.welcome-cinematic__progress span{display:block;height:100%;width:100%;background:linear-gradient(90deg,#4a8aff,#b8ddff,#48d8b0);transform-origin:left;animation:welcome-progress 1.65s cubic-bezier(.17,.73,.2,1) both}
.welcome-cinematic__foot{position:absolute;bottom:max(29px,5vh);font-family:'Geist',sans-serif;font-size:9px;letter-spacing:.22em;color:#7591ba;text-align:center;padding:0 18px}
.welcome-cinematic__foot span{color:#87baff}
.welcome-cinematic--leaving{animation:welcome-depart .43s cubic-bezier(.4,0,1,1) both;pointer-events:none}
.welcome-cinematic--leaving .welcome-cinematic__content{animation:welcome-content-depart .43s cubic-bezier(.4,0,1,1) both}
@keyframes welcome-depart{from{opacity:1}to{opacity:0}}
@keyframes welcome-content-depart{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-17px) scale(1.025)}}
@keyframes welcome-arrive{from{opacity:0;transform:translateY(29px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes welcome-mark{from{opacity:0;transform:scale(.67) rotate(-17deg)}to{opacity:1;transform:scale(1) rotate(0)}}
@keyframes welcome-breathe{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes welcome-orbit{from{rotate:0deg}to{rotate:360deg}}
@keyframes welcome-shift{from{transform:translateY(70px);opacity:0}to{transform:translateY(-60px);opacity:1}}
@keyframes welcome-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media(prefers-reduced-motion:reduce){.welcome-cinematic *{animation:none!important}.welcome-cinematic__progress span{transform:none}.welcome-cinematic--leaving{animation:none;opacity:0}}
</style>
