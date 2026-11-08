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

/**
 * Switch the semantic theme atomically. A full-document View Transition snapshots
 * the entire page, and its interim composite can wash out the light dashboard.
 * A direct switch preserves contrast and cannot strand an opaque snapshot overlay.
 */
function toggleTheme() {
  if (isThemeChanging.value) return;
  commitTheme(currentTheme.value === 'dark' ? 'light' : 'dark');
}

export function useThemePreference() {
  return { currentTheme, isThemeChanging, setTheme, toggleTheme };
}
