import { nextTick, ref } from 'vue';

export type ThemeChoice = 'light' | 'dark';
const KEY = 'resolveos-theme';

function initialTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const currentTheme = ref<ThemeChoice>(initialTheme());
const isThemeChanging = ref(false);

function apply(value: ThemeChoice) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
}
apply(currentTheme.value);

function commitTheme(value: ThemeChoice) {
  currentTheme.value = value;
  apply(value);
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, value);
}

function setTheme(value: ThemeChoice) {
  if (isThemeChanging.value || value === currentTheme.value) return;
  commitTheme(value);
}

/**
 * Reveal the next theme as an expanding circular wave from the clicked control.
 * View Transitions snapshot the entire page, so the intro's custom palette and
 * the application's normal surfaces change together rather than abruptly.
 */
async function toggleTheme(event?: MouseEvent) {
  if (isThemeChanging.value) return;
  const next: ThemeChoice = currentTheme.value === 'dark' ? 'light' : 'dark';
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (
    typeof document === 'undefined' ||
    typeof document.startViewTransition !== 'function' ||
    prefersReducedMotion
  ) {
    commitTheme(next);
    return;
  }

  const target = event?.currentTarget;
  const bounds = target instanceof Element ? target.getBoundingClientRect() : null;
  const x = bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2;
  const y = bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  isThemeChanging.value = true;
  document.documentElement.classList.add('theme-wave-active');

  try {
    const transition = document.startViewTransition(async () => {
      commitTheme(next);
      // Vue updates the intro's theme-dark class asynchronously; wait until
      // both it and html[data-theme] describe the new snapshot.
      await nextTick();
    });

    await transition.ready;
    const animation = document.documentElement.animate(
      [
        { clipPath: `circle(0px at ${x}px ${y}px)` },
        { clipPath: `circle(${radius}px at ${x}px ${y}px)` },
      ],
      {
        duration: 1050,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both',
        pseudoElement: '::view-transition-new(root)',
      },
    );
    await animation.finished;
    await transition.finished;
  } catch {
    // A cancelled transition or unsupported pseudo-element animation must not
    // leave the toggle locked. Preserve the new theme either way.
    commitTheme(next);
  } finally {
    document.documentElement.classList.remove('theme-wave-active');
    isThemeChanging.value = false;
  }
}

export function useThemePreference() {
  return { currentTheme, isThemeChanging, setTheme, toggleTheme };
}
