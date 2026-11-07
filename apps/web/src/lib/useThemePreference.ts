import { nextTick, ref } from 'vue';

export type ThemeChoice = 'light' | 'dark';
const KEY = 'resolveos-theme';

function initialTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Private browsing may deny storage access. */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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

/** A continuous advancing boundary, with its leading edge displaced in a sine wave.
 * The wave expands from the clicked control, revealing the *full new-page snapshot*
 * rather than fading individual elements at different times.
 */
function revealShape(front: number, width: number, height: number, phase: number) {
  const amplitude = Math.min(43, Math.max(14, width * .028));
  const period = Math.max(150, height * .36);
  const points: string[] = [];
  for (let i = 0; i <= 44; i++) {
    const y = height * i / 44;
    const wave = Math.sin(y / period * 2 * Math.PI + phase) * amplitude;
    points.push(`${(front + wave).toFixed(1)}px ${y.toFixed(1)}px`);
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
  let changed = false;

  try {
    const transition = document.startViewTransition(async () => {
      commitTheme(next);
      changed = true;
      await nextTick();
    });
    await transition.ready;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const target = event?.currentTarget;
    const bounds = target instanceof Element ? target.getBoundingClientRect() : null;
    // The reveal always travels left-to-right, with a phase aligned to the toggle.
    const phase = bounds ? bounds.top / Math.max(1, height) * Math.PI * 2 : 0;
    const amplitude = Math.min(43, Math.max(14, width * .028));
    const from = -amplitude - 4;
    const to = width + amplitude + 4;
    const keyframes = Array.from({ length: 37 }, (_, i) => {
      const t = i / 36;
      const eased = t * t * (3 - 2 * t);
      return {
        clipPath: revealShape(from + (to - from) * eased, width, height, phase + t * Math.PI * 1.4),
        offset: t,
      };
    });
    const animation = document.documentElement.animate(keyframes, {
      duration: 1450,
      easing: 'linear',
      fill: 'both',
      pseudoElement: '::view-transition-new(root)',
    });
    await animation.finished;
    await transition.finished;
  } catch {
    // Failed snapshot/animation must never leave the toggle locked.
    if (!changed) commitTheme(next);
  } finally {
    document.documentElement.classList.remove('theme-wave-active');
    isThemeChanging.value = false;
  }
}

export function useThemePreference() {
  return { currentTheme, isThemeChanging, setTheme, toggleTheme };
}
