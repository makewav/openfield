/**
 * Environment access, in one place. Every function that reads configuration
 * reads it here, so a missing variable fails the same way everywhere and no
 * secret is ever echoed into a response or a log line.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new ConfigError(`${name} is not set`);
  return v;
}

/** The Kie API key. Server-side only; never send this to the browser. */
export const kieKey = (): string => required('KIE_API_KEY');

/** The Postgres connection string. */
export const databaseUrl = (): string => required('DATABASE_URL');

/** The Vercel Blob read/write token. */
export const blobToken = (): string => required('BLOB_READ_WRITE_TOKEN');

/**
 * The public origin of this deployment, used for the optional callback URL.
 * Falls back to the request's own origin when the variable is unset, which is
 * correct for previews.
 */
export function publicBaseUrl(fallback?: string): string {
  const v = process.env.PUBLIC_BASE_URL;
  if (v) return v.replace(/\/$/, '');
  return (fallback ?? '').replace(/\/$/, '');
}

/** Hard daily ceiling on generation jobs. Defaults to 20. */
export function dailyJobCap(): number {
  const n = Number(process.env.DAILY_JOB_CAP ?? 20);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

/**
 * The kill switch. Generation is refused unless this is exactly "true".
 * Everything else (reading history, watching a running job) keeps working.
 */
export const generationEnabled = (): boolean => process.env.GENERATION_ENABLED === 'true';

/** The message a refused generate call returns. */
export const KILL_SWITCH_MESSAGE =
  'Generation is turned off. Set GENERATION_ENABLED to "true" in the environment to allow new jobs.';
