import { nextTick, ref } from 'vue';

export type ThemeChoice = 'light' | 'dark';
const KEY = 'resolveos-theme';

function initialTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Private browsing may deny storage access. */ }
  // New visitors start with the cinematic dark theme. Explicit preferences persist.
  return 'dark';
}

const currentTheme = ref<ThemeChoice>(initialTheme());
const isThemeChanging = ref(false);

function apply(value: ThemeChoice) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
}

function commitTheme(value: ThemeChoice) {
  currentTheme.value = value;
  apply(value);
  try { window.localStorage.setItem(KEY, value); } catch { /* Keep the in-memory preference. */ }
}
apply(currentTheme.value);

function setTheme(value: ThemeChoice) {
  if (isThemeChanging.value || value === currentTheme.value) return;
  commitTheme(value);
}

/** A single continuous wave with a fixed vertex count for every frame.
 * Sampling intermediate frames avoids the abrupt polygon morph and zig-zag
 * flashes seen when the browser interpolates only the end shapes.
 */
function revealShape(progress: number, width: number, height: number, phase: number): string {
  const amplitude = Math.min(24, Math.max(9, width * 0.014));
  const front = -amplitude - 4 + progress * (width + 2 * amplitude + 8);
  const points: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const y = height * i / 24;
    const wave = Math.sin((y / Math.max(230, height * 0.55)) * Math.PI * 2 + phase + progress * Math.PI * 0.7);
    const edge = front + wave * amplitude;
    points.push(`${edge.toFixed(1)}px ${y.toFixed(1)}px`);
  }
  return `polygon(0px 0px, ${points.join(', ')}, 0px ${height}px)`;
}

async function toggleTheme(event?: MouseEvent) {
  if (isThemeChanging.value) return;
  const next: ThemeChoice = currentTheme.value === 'dark' ? 'light' : 'dark';
  if (typeof document === 'undefined') return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof document.startViewTransition !== 'function') {
    commitTheme(next);
    return;
  }

  isThemeChanging.value = true;
  document.documentElement.classList.add('theme-wave-active');
  let committed = false;
  let activeAnimation: Animation | null = null;
  let transition: ViewTransition | null = null;
  try {
    transition = document.startViewTransition(async () => {
      commitTheme(next);
      committed = true;
      await nextTick();
    });
    await transition.ready;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const target = event?.currentTarget;
    const bounds = target instanceof Element ? target.getBoundingClientRect() : null;
    const phase = bounds ? (bounds.top / Math.max(1, height)) * Math.PI : 0;

    // All keyframes share the same polygon structure and advance monotonically,
    // so the transition cannot freeze or jump backwards between frames.
    const steps = 32;
    const frames = Array.from({ length: steps + 1 }, (_, i) => ({
      clipPath: revealShape(i / steps, width, height, phase),
      offset: i / steps,
    }));
    activeAnimation = document.documentElement.animate(frames, {
      duration: 1120,
      easing: 'cubic-bezier(.42,0,.24,1)',
      fill: 'none',
      pseudoElement: '::view-transition-new(root)',
    });
    await activeAnimation.finished;
    // The animation has revealed the entire new theme. Dismiss both captured
    // page snapshots immediately so they cannot linger as a pale overlay.
    transition.skipTransition();
  } catch {
    // The browser may cancel a transition during navigation or tab switching.
    if (!committed) commitTheme(next);
  } finally {
    // Always tear down the captured layers, including interrupted transitions.
    transition?.skipTransition();
    activeAnimation?.cancel();
    document.documentElement.classList.remove('theme-wave-active');
    isThemeChanging.value = false;
  }
}

export function useThemePreference() {
  return { currentTheme, isThemeChanging, setTheme, toggleTheme };
}
