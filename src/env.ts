/**
 * Env parsing — fails fast on invalid values.
 *
 * Next.js App Router: uses NEXT_PUBLIC_* so values are available in the
 * browser. Trims, validates https://, and throws at import time so
 * misconfiguration surfaces immediately instead of at first RPC call.
 * Returns `undefined` when unset/empty so callers can fall back to chain defaults.
 */

function parseHttpsUrlOrUndefined(raw: unknown, name: string): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') {
    throw new Error(`[env] ${name} must be a string URL, got ${typeof raw}`);
  }
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`[env] ${name} must be a valid URL, got "${trimmed}"`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`[env] ${name} must use https://, got "${trimmed}"`);
  }
  return trimmed;
}

/** Optional override for the Arc Mainnet RPC. Falls back to chain default when unset. */
export const NEXT_PUBLIC_ARC_RPC: string | undefined = parseHttpsUrlOrUndefined(
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_ARC_RPC : undefined,
  'NEXT_PUBLIC_ARC_RPC',
);
