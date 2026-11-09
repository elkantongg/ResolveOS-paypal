import { X509Certificate, createVerify } from 'node:crypto';
import { crc32 } from 'node:zlib';

/**
 * PayPal webhook signature check ("self verification", per developer.paypal.com/api/rest/webhooks/rest):
 *
 *   signed message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc32(rawBody) as decimal}`
 *
 * verified with SHA256withRSA against the certificate at `paypal-cert-url`. The certificate URL
 * comes from the request, so it is only fetched from PayPal's own hosts over HTTPS; anything else
 * is rejected before any network call. The raw body must be the exact bytes PayPal sent.
 */

export type WebhookVerdict =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'missing_headers' | 'bad_cert_url' | 'cert_unavailable' | 'bad_signature' };

const ALLOWED_CERT_HOSTS = new Set(['api.paypal.com', 'api.sandbox.paypal.com', 'api-m.paypal.com', 'api-m.sandbox.paypal.com']);

export type CertFetcher = (url: string) => Promise<string>;

const certCache = new Map<string, string>();

/** Refuses a certificate outside its validity dates; throws if the text is not a certificate. */
export function assertCertCurrent(pem: string, now = Date.now()): string {
  const cert = new X509Certificate(pem);
  if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) throw new Error('certificate is not current');
  return pem;
}

export const fetchCert: CertFetcher = async (url) => {
  const cached = certCache.get(url);
  if (cached) return assertCertCurrent(cached);
  // No redirects: the allowlist below only vouches for the URL we were given.
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
  if (!response.ok) throw new Error(`certificate download failed: ${response.status}`);
  const pem = assertCertCurrent(await response.text());
  certCache.set(url, pem);
  return pem;
};

export function isAllowedCertUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_CERT_HOSTS.has(url.hostname) && url.pathname.startsWith('/v1/notifications/certs/');
  } catch {
    return false;
  }
}

export async function verifyWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  webhookId: string | undefined,
  getCert: CertFetcher = fetchCert,
): Promise<WebhookVerdict> {
  if (!webhookId) return { ok: false, reason: 'not_configured' };
  const header = (name: string) => {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const transmissionId = header('paypal-transmission-id');
  const transmissionTime = header('paypal-transmission-time');
  const signature = header('paypal-transmission-sig');
  const certUrl = header('paypal-cert-url');
  if (!transmissionId || !transmissionTime || !signature || !certUrl) {
    return { ok: false, reason: 'missing_headers' };
  }
  if (!isAllowedCertUrl(certUrl)) return { ok: false, reason: 'bad_cert_url' };
  let pem: string;
  try {
    pem = await getCert(certUrl);
  } catch {
    return { ok: false, reason: 'cert_unavailable' };
  }
  const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc32(rawBody)}`;
  try {
    const verifier = createVerify('SHA256');
    verifier.update(message);
    return verifier.verify(pem, Buffer.from(signature, 'base64'))
      ? { ok: true }
      : { ok: false, reason: 'bad_signature' };
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }
}
