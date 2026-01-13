/**
 * Environment detection for runtime configuration.
 * Defaults to development-friendly behavior unless explicitly set to production.
 */

const ENV = (process.env.LIMINAL_ENV || process.env.NODE_ENV || '').toLowerCase();

export function isProd(): boolean {
  return ENV === 'production' || ENV === 'prod';
}

export function isDev(): boolean {
  return !isProd();
}
