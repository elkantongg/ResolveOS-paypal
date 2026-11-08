import { ref } from 'vue';

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

/** Build a smooth sinusoidal wave front; all frames share the same point count. */
function waveFront(progress: number, width: number, height: number): string {
  const amplitude = Math.min(28, Math.max(12, width * 0.017));
  const front = -100 + progress * (width + 200);
  const points: string[] = [];
  for (let i = 0; i <= 32; i++) {
    const y = height * i / 32;
    const curve = Math.sin(y / Math.max(190, height * .44) * Math.PI * 2 + progress * 1.8) * amplitude;
    points.push(`${(front + curve).toFixed(1)}px ${y.toFixed(1)}px`);
  }
  return `polygon(0 0, ${points.join(', ')}, 0 ${height}px)`;
}

/**
 * Safe wave decoration, independent of Chrome's document View Transition
 * snapshots. Updating the theme is atomic; the wave is purely visual.
 * The layer is always removed and cannot fade or wash out app content.
 */
async function toggleTheme() {
  if (isThemeChanging.value) return;
  const next: ThemeChoice = currentTheme.value === 'dark' ? 'light' : 'dark';
  if (typeof document === 'undefined') return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    commitTheme(next);
    return;
  }

  isThemeChanging.value = true;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147482000',
    'pointer-events:none', 'contain:strict',
    'background:linear-gradient(105deg, transparent 0%, rgba(76,148,247,.07) 63%, rgba(110,184,255,.18) 96%, rgba(182,226,255,.25) 100%)',
    'opacity:1',
  ].join(';');

  try {
    document.body.appendChild(layer);
    // Change semantic tokens first: regardless of animation status,
    // content always has the correct colors and remains interactive.
    commitTheme(next);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const frames = Array.from({ length: 33 }, (_, i) => ({
      clipPath: waveFront(i / 32, width, height),
      offset: i / 32,
    }));
    const animation = layer.animate(frames, {
      duration: 1120,
      easing: 'cubic-bezier(.42,0,.24,1)',
      fill: 'none',
    });
    await Promise.race([
      animation.finished.catch(() => undefined),
      new Promise<void>(resolve => window.setTimeout(resolve, 1250)),
    ]);
    animation.cancel();
  } catch {
    // The semantic theme is already committed even if the animation fails.
  } finally {
    layer.remove();
    isThemeChanging.value = false;
  }
}

export function useThemePreference() {
  return { currentTheme, isThemeChanging, setTheme, toggleTheme };
}
