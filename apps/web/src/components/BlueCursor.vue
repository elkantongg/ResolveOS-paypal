<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const dot = ref<HTMLElement | null>(null);
const halo = ref<HTMLElement | null>(null);
let frame = 0;
let x = -100;
let y = -100;
let haloX = -100;
let haloY = -100;
let enabled = false;
let visible = false;

const SELECTOR = 'a, button, [role="button"], [role="link"], select, summary, input[type="checkbox"], input[type="radio"]';
const TEXT_SELECTOR = 'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]';

function tick() {
  haloX += (x - haloX) * 0.18;
  haloY += (y - haloY) * 0.18;
  if (halo.value) halo.value.style.transform = `translate3d(${haloX}px,${haloY}px,0) translate(-50%,-50%)`;
  if (Math.abs(x - haloX) > 0.15 || Math.abs(y - haloY) > 0.15) {
    frame = requestAnimationFrame(tick);
  } else {
    frame = 0;
  }
}
function move(event: PointerEvent) {
  if (!enabled || event.pointerType !== 'mouse') return;
  x = event.clientX; y = event.clientY;
  if (dot.value) dot.value.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
  if (!visible) {
    visible = true;
    haloX = x; haloY = y;
    if (halo.value) halo.value.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
    document.documentElement.classList.add('blue-cursor-active');
  }
  const target = event.target instanceof Element ? event.target : null;
  const editing = Boolean(target?.closest(TEXT_SELECTOR));
  document.documentElement.classList.toggle('blue-cursor-text', editing);
  document.documentElement.classList.toggle('blue-cursor-hover', !editing && Boolean(target?.closest(SELECTOR)));
  if (!frame) frame = requestAnimationFrame(tick);
}
function hide() {
  visible = false;
  document.documentElement.classList.remove('blue-cursor-active', 'blue-cursor-hover', 'blue-cursor-text', 'blue-cursor-pressed');
}
function down(event: PointerEvent) {
  if (event.pointerType === 'mouse') document.documentElement.classList.add('blue-cursor-pressed');
}
function up() { document.documentElement.classList.remove('blue-cursor-pressed'); }
function leave(event: MouseEvent) { if (!event.relatedTarget) hide(); }

onMounted(() => {
  enabled = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches;
  if (!enabled) return;
  document.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerdown', down, { passive: true });
  document.addEventListener('pointerup', up, { passive: true });
  document.addEventListener('mouseout', leave, { passive: true });
  window.addEventListener('blur', hide);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointermove', move);
  document.removeEventListener('pointerdown', down);
  document.removeEventListener('pointerup', up);
  document.removeEventListener('mouseout', leave);
  window.removeEventListener('blur', hide);
  if (frame) cancelAnimationFrame(frame);
  hide();
});
</script>

<template>
  <div ref="halo" class="blue-cursor-halo" aria-hidden="true" />
  <div ref="dot" class="blue-cursor-dot" aria-hidden="true" />
</template>

<style>
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  html.blue-cursor-active,
  html.blue-cursor-active body,
  html.blue-cursor-active a,
  html.blue-cursor-active button,
  html.blue-cursor-active select,
  html.blue-cursor-active [role="button"],
  html.blue-cursor-active [role="link"] { cursor:none!important }
  html.blue-cursor-active input:not([type="button"]):not([type="submit"]),
  html.blue-cursor-active textarea,
  html.blue-cursor-active [contenteditable="true"] { cursor:text!important }
}
.blue-cursor-halo,.blue-cursor-dot{
  position:fixed;top:0;left:0;z-index:2147483000;
  pointer-events:none;opacity:0;border-radius:50%;
  will-change:transform;transition:opacity .15s ease, width .23s cubic-bezier(.2,.8,.2,1), height .23s cubic-bezier(.2,.8,.2,1),background-color .23s ease;
}
.blue-cursor-dot{
  width:7px;height:7px;background:#c2f2ff;
  box-shadow:0 0 0 2px #4a9cff82,0 0 12px 3px #369affd9,0 0 27px 6px #2078ff60;
}
.blue-cursor-halo{
  width:35px;height:35px;border:1px solid #72c6ff9c;
  background:radial-gradient(circle,#60baff12 0%,transparent 70%);
  box-shadow:0 0 15px #369bff3a,inset 0 0 13px #2e8dff26;
}
html.blue-cursor-active .blue-cursor-halo,html.blue-cursor-active .blue-cursor-dot{opacity:1}
html.blue-cursor-hover .blue-cursor-halo{
  width:55px;height:55px;border-color:#90e5ffcc;
  background:radial-gradient(circle,#52b7ff29,transparent 70%);
  box-shadow:0 0 26px #4eafff65,inset 0 0 19px #5faeff36;
}
html.blue-cursor-hover .blue-cursor-dot{background:#fff;box-shadow:0 0 12px #c9f5ff,0 0 26px #258bff}
html.blue-cursor-pressed .blue-cursor-halo{width:25px;height:25px}
html.blue-cursor-text .blue-cursor-halo,html.blue-cursor-text .blue-cursor-dot{opacity:0!important}
@media (hover:none),(pointer:coarse),(prefers-reduced-motion:reduce){
  .blue-cursor-halo,.blue-cursor-dot{display:none!important}
}
