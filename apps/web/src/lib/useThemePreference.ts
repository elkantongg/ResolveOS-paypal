import { ref } from 'vue';

/**
 * ResolveOS is intentionally dark-only.
 * Keep the existing composable interface for any legacy callers, but never
 * enable light mode—even if a visitor previously saved it in localStorage.
 */
export type ThemeChoice = 'dark' | 'light';
const currentTheme = ref<ThemeChoice>('dark');
const isThemeChanging = ref(false);

function enforceDarkTheme() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.style.colorScheme = 'dark';
  document.documentElement.classList.remove('theme-wave-active');
  try { window.localStorage.setItem('resolveos-theme', 'dark'); } catch { /* optional storage */ }
}

enforceDarkTheme();

function setTheme(value: ThemeChoice) {
  void value;
  enforceDarkTheme();
}

function toggleTheme() {
  // Intentionally disabled: ResolveOS no longer offers a light theme.
  enforceDarkTheme();
}

export function useThemePreference() {
  return { currentTheme, isThemeChanging, setTheme, toggleTheme };
}
