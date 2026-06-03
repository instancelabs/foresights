/**
 * Build-time SSRF guard for the RSS fetcher.
 *
 * `wizard/fetch-feeds.ts:fetchFeed` runs in Node at build time and
 * fetches whatever URL appears in `WizardSource.url`. Closes finding M3
 * from the v0.9.2 security review: if a prompt-injected wizard agent (or
 * a careless user) drops `http://localhost:8080/admin` or
 * `http://169.254.169.254/latest/meta-data/` into a source URL, the build
 * pipeline issues that request from the user's machine — leaking the
 * existence of internal services and any data those endpoints return in
 * server logs.
 *
 * This module classifies a URL as safe / unsafe before the fetch happens.
 * `fetchFeed` short-circuits on an unsafe URL: it returns zero items and
 * the `hydrateRssSources` path surfaces the rejection as a structured
 * warning.
 *
 * Threat model. The user supplied the URL, so the *direct* threat is
 * self-harm. The realistic vector is the wizard agent emitting a private
 * URL during construction or an attacker controlling RSS metadata that
 * the agent picks up and copies into a source. The guard fires regardless
 * of provenance.
 *
 * What we reject:
 *
 *  - Non-http(s) schemes (`javascript:`, `data:`, `file:`, `ftp:`, etc.).
 *  - Loopback hosts (`localhost`, `127.0.0.0/8`, `::1`).
 *  - Link-local IPv4 (`169.254.0.0/16` — includes AWS / GCP metadata
 *    endpoints).
 *  - Link-local IPv6 (`fe80::/10`).
 *  - RFC1918 private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
 *  - IPv6 unique-local (`fc00::/7`).
 *  - URLs we can't parse at all.
 *
 * What we accept:
 *
 *  - Any public-IP / public-DNS host with `http(s)`.
 *
 * Limitations. The guard checks the URL host *before* DNS resolution. A
 * public hostname that resolves to a private IP at fetch time (DNS
 * rebinding) bypasses this check. A complete defence would require
 * resolving the host and re-checking, then pinning the resolved IP for
 * the fetch — too heavy for build-time. The current check covers the
 * realistic "agent emits localhost / 169.254.169.254 / 10.x.x.x"
 * scenarios.
 */

const RFC1918_10 = /^10\./;
const RFC1918_172 = /^172\.(1[6-9]|2[0-9]|3[01])\./;
const RFC1918_192 = /^192\.168\./;
const LOOPBACK_V4 = /^127\./;
const LINK_LOCAL_V4 = /^169\.254\./;

/**
 * Classify a hostname. The host comes from `URL.hostname`, which has
 * already lowercased it and stripped any port. Returns the reason string
 * if the host is private; null otherwise.
 *
 * IPv6 literals come back from `URL.hostname` wrapped in `[...]`;
 * we strip the brackets before matching.
 */
const classifyHost = (rawHost: string): string | null => {
  if (rawHost.length === 0) return 'empty host';
  const host =
    rawHost.startsWith('[') && rawHost.endsWith(']')
      ? rawHost.slice(1, -1).toLowerCase()
      : rawHost.toLowerCase();
  // Loopback labels.
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback (localhost)';
  if (host === '::1') return 'loopback (::1)';
  // IPv4 dotted-quad.
  if (LOOPBACK_V4.test(host)) return 'loopback (127.0.0.0/8)';
  if (LINK_LOCAL_V4.test(host)) return 'link-local (169.254.0.0/16 — cloud metadata)';
  if (RFC1918_10.test(host)) return 'private (10.0.0.0/8)';
  if (RFC1918_172.test(host)) return 'private (172.16.0.0/12)';
  if (RFC1918_192.test(host)) return 'private (192.168.0.0/16)';
  // IPv6 link-local — `fe80::*`.
  if (host.startsWith('fe80:') || host.startsWith('fe80::')) {
    return 'link-local (fe80::/10)';
  }
  // IPv6 unique-local — `fc00::/7` (any address starting with fc or fd).
  // Match the first hex group precisely so we don't catch
  // `fcabc.example.com` or similar DNS names that happen to start with 'fc'.
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return 'unique-local (fc00::/7)';
  // IPv6 unspecified.
  if (host === '::' || host === '0:0:0:0:0:0:0:0') return 'unspecified (::)';
  // IPv4 unspecified / "any".
  if (host === '0.0.0.0') return 'unspecified (0.0.0.0)';
  return null;
};

export interface UrlClassification {
  readonly safe: boolean;
  /** Non-null when `safe === false` — the rejection reason. */
  readonly reason: string | null;
}

/**
 * Classify a URL for build-time fetch safety. Returns `{safe: true}` for
 * public http(s) URLs, `{safe: false, reason}` otherwise.
 */
export const classifyFetchUrl = (url: string): UrlClassification => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: 'unparseable URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `non-http(s) scheme (${parsed.protocol})` };
  }
  const hostReason = classifyHost(parsed.hostname);
  if (hostReason) return { safe: false, reason: hostReason };
  return { safe: true, reason: null };
};
