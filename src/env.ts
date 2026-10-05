/**
 * Env parsing — fails fast on invalid VITE_* values.
 *
 * Manual parse (no zod dependency): trims, validates https://, and throws at
 * import time so misconfiguration surfaces immediately instead of at first RPC call.
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

/** Optional override for the Arc Testnet RPC. Falls back to viem's chain default when unset. */
export const VITE_ARC_TESTNET_RPC: string | undefined = parseHttpsUrlOrUndefined(
  import.meta.env.VITE_ARC_TESTNET_RPC,
  'VITE_ARC_TESTNET_RPC',
);
