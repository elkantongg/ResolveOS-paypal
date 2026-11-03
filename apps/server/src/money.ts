/**
 * Money is integers of the currency's minor unit everywhere inside Resolve AI ($180.00 = 18000).
 * Only the PayPal boundary converts to and from PayPal's decimal strings, and it does so with
 * string arithmetic, never floating point.
 */

/** Currencies PayPal supports without decimals. Everything else here uses 2 decimals. */
const ZERO_DECIMAL = new Set(['HUF', 'JPY', 'TWD']);

export const SUPPORTED_CURRENCIES = ['USD', 'SGD', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function exponentOf(currency: string): 0 | 2 {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

/** 18000 + "USD" → "180.00"; 500 + "JPY" → "500". */
export function toPayPalValue(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new RangeError(`Amount must be a non-negative whole number of minor units, got ${minor}`);
  }
  const exponent = exponentOf(currency);
  if (exponent === 0) return String(minor);
  const digits = String(minor).padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** "180.00" + "USD" → 18000. Rejects anything that is not an exact decimal for the currency. */
export function fromPayPalValue(value: string, currency: string): number {
  const exponent = exponentOf(currency);
  const pattern = exponent === 0 ? /^\d+$/ : /^\d+(\.\d{1,2})?$/;
  if (!pattern.test(value)) throw new RangeError(`Not a valid ${currency} amount: ${value}`);
  const [whole = '0', fraction = ''] = value.split('.');
  const minor = Number(whole) * 10 ** exponent + Number(fraction.padEnd(exponent, '0') || '0');
  if (!Number.isSafeInteger(minor)) throw new RangeError(`Amount too large: ${value}`);
  return minor;
}

/** For people: 9000 + "USD" → "$90.00". */
export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    minor / 10 ** exponentOf(currency),
  );
}
