import { ref } from 'vue';

export type ThemeChoice = 'light' | 'dark';
const KEY = 'resolveos-theme';

function initialTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const currentTheme = ref<ThemeChoice>(initialTheme());

function apply(value: ThemeChoice) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
}
apply(currentTheme.value);

export function useThemePreference() {
  function setTheme(value: ThemeChoice) {
    currentTheme.value = value;
    apply(value);
    if (typeof window !== 'undefined') window.localStorage.setItem(KEY, value);
  }
  function toggleTheme() {
    setTheme(currentTheme.value === 'dark' ? 'light' : 'dark');
  }
  return { currentTheme, setTheme, toggleTheme };
}
