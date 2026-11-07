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

/** Build a low-complexity, fixed wavy edge. The compositor interpolates
 * between just two polygons instead of processing 1,665 animated vertices.
 * Keeping the same point count at each end avoids expensive shape rebuilding.
 */
function revealShape(front: number, width: number, height: number, phase: number) {
  const amplitude = Math.min(24, Math.max(10, width * .016));
  const period = Math.max(180, height * .48);
  const points: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const y = height * i / 10;
    const edge = front + Math.sin((y / period) * Math.PI * 2 + phase) * amplitude;
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
    const amplitude = Math.min(24, Math.max(10, width * .016));
    // Only two compositor-friendly keyframes. The ripple remains in the edge
    // silhouette as it travels; there is no repeated JS geometry per frame.
    const keyframes = [
      { clipPath: revealShape(-amplitude - 3, width, height, phase) },
      { clipPath: revealShape(width + amplitude + 3, width, height, phase) },
    ];
    const animation = document.documentElement.animate(keyframes, {
      duration: 920,
      easing: 'cubic-bezier(.42,0,.24,1)',
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
