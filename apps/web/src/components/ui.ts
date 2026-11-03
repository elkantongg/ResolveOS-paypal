/** Tailwind class sets for badge tones, shared so every status reads the same everywhere. */
import type { Tone } from '@/lib/format';

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-soft ring-line',
  info: 'bg-primary-soft text-primary ring-primary-line',
  warn: 'bg-warn-soft text-warn ring-warn-line',
  ok: 'bg-ok-soft text-ok ring-ok-line',
  danger: 'bg-danger-soft text-danger ring-danger-line',
  accent: 'bg-accent-soft text-merchant ring-accent-line',
};
